/**
 * Sub-Agent Executor
 *
 * Executes Python-based sub-agents from volume files
 * Like Claude Code's custom agents
 *
 * Includes usage tracking for system evolution analysis
 */

import { getVolumeFileSystem, VolumeType } from '../volumes/file-operations';
// live-preview removed during cleanup
import { recordSubAgentExecution } from './usage-tracker';
import { getLLMPatternMatcher, ExecutionTrace, SubAgentTrace } from '../agents/llm-pattern-matcher';
import { getVFS } from '../virtual-fs';
import { logger } from '../debug/logger';
import { planLogger } from '../debug/plan-log-store';

export interface SubAgentDefinition {
  name: string;
  path: string;
  volume: VolumeType;
  description?: string;
  capabilities?: string[];
}

export interface AgentExecutionResult {
  success: boolean;
  output: string;
  filesCreated?: string[];
  filesModified?: string[];
  error?: string;
  executionTime: number;
}

/**
 * SubAgentExecutor
 *
 * Loads and executes Python agents from volumes
 */
export class SubAgentExecutor {
  private fs = getVolumeFileSystem();
  private runtime: any = null; // live-preview removed during cleanup
  private loadedAgents = new Map<string, SubAgentDefinition>();

  /**
   * Discover agents in a volume
   */
  async discoverAgents(volume: VolumeType): Promise<SubAgentDefinition[]> {
    const agents: SubAgentDefinition[] = [];

    logger.debug('agent', `Discovering agents in ${volume} volume`);

    try {
      const files = await this.fs.listFiles(volume, 'agents');
      logger.debug('agent', `Found ${files.length} files in ${volume}/agents`);

      for (const file of files) {
        if (file.path.endsWith('.py')) {
          const agentDef = await this.parseAgentFile(volume, file.path);
          if (agentDef) {
            agents.push(agentDef);
            this.loadedAgents.set(`${volume}:${file.path}`, agentDef);
            logger.info('agent', `Discovered agent: ${agentDef.name}`, {
              path: file.path,
              volume,
              capabilities: agentDef.capabilities,
            });
          }
        }
      }

      if (agents.length > 0) {
        logger.success('agent', `Discovered ${agents.length} agents in ${volume} volume`);
      }
    } catch (error) {
      logger.debug('agent', `No agents found in ${volume} volume`);
    }

    return agents;
  }

  /**
   * Parse agent Python file to extract metadata
   */
  private async parseAgentFile(
    volume: VolumeType,
    path: string
  ): Promise<SubAgentDefinition | null> {
    try {
      const content = await this.fs.readFile(volume, path);

      // Extract agent metadata from docstring
      const docstringMatch = content.match(/"""([\s\S]*?)"""/);
      const description = docstringMatch ? docstringMatch[1].trim() : '';

      // Extract class name
      const classMatch = content.match(/class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : path.split('/').pop()?.replace('.py', '');

      return {
        name: className || 'UnknownAgent',
        path,
        volume,
        description,
        capabilities: this.extractCapabilities(content)
      };
    } catch (error) {
      console.error(`Failed to parse agent ${path}:`, error);
      return null;
    }
  }

  /**
   * Extract capabilities from agent docstring
   */
  private extractCapabilities(content: string): string[] {
    const capabilities: string[] = [];

    // Look for "## Capabilities" section in docstring
    const capMatch = content.match(/##\s*Capabilities\s*\n([\s\S]*?)(?=\n\n|$)/);
    if (capMatch) {
      const lines = capMatch[1].split('\n');
      for (const line of lines) {
        const cleaned = line.trim().replace(/^[-*]\s*/, '');
        if (cleaned) {
          capabilities.push(cleaned);
        }
      }
    }

    return capabilities;
  }

  /**
   * Execute a sub-agent with a task
   */
  async executeAgent(
    volume: VolumeType,
    agentPath: string,
    task: string,
    context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Get agent definition for tracking
    const agentDef = this.loadedAgents.get(`${volume}:${agentPath}`);
    const agentName = agentDef?.name || agentPath.split('/').pop()?.replace('.py', '') || 'unknown';

    logger.info('agent', `Executing sub-agent: ${agentName}`, {
      volume,
      path: agentPath,
      task: task.substring(0, 100),
    });
    planLogger.agentStart(agentName, task);

    try {
      // Load agent code
      logger.debug('agent', `Loading agent code from ${volume}:${agentPath}`);
      const agentCode = await this.fs.readFile(volume, agentPath);
      logger.debug('agent', `Agent code loaded: ${agentCode.length} bytes`);

      // Create execution environment
      const executionCode = this.buildExecutionCode(agentCode, task, context);

      // Execute in Pyodide
      logger.time(`agent-${agentName}`, 'agent', `Executing ${agentName}`);
      const result = await this.runtime.executeFile(
        `${volume}:${agentPath}`,
        executionCode,
        { capturePlots: true }
      );
      logger.timeEnd(`agent-${agentName}`, result.success);

      const executionTime = Date.now() - startTime;

      // Track usage for system evolution analysis
      recordSubAgentExecution(
        agentPath,
        agentName,
        volume,
        task,
        result.success,
        executionTime
      );

      // Generate execution trace for this sub-agent task
      this.generateSubAgentTrace(
        agentName,
        agentPath,
        volume,
        task,
        result.success,
        executionTime,
        timestamp,
        result.stdout || result.stderr || '',
        context?.projectPath
      );

      if (result.success) {
        logger.success('agent', `Sub-agent ${agentName} completed successfully`, {
          executionTime: `${executionTime}ms`,
          outputLength: (result.stdout || '').length,
        });
      } else {
        logger.warn('agent', `Sub-agent ${agentName} completed with errors`, {
          executionTime: `${executionTime}ms`,
          error: result.error,
        });
      }
      planLogger.agentComplete(agentName, result.success, executionTime);

      return {
        success: result.success,
        output: result.stdout || result.stderr || '',
        error: result.error,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('agent', `Sub-agent ${agentName} execution failed`, {
        executionTime: `${executionTime}ms`,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      planLogger.agentComplete(agentName, false, executionTime);

      // Track failed execution
      recordSubAgentExecution(
        agentPath,
        agentName,
        volume,
        task,
        false,
        executionTime
      );

      // Generate trace for failed execution
      this.generateSubAgentTrace(
        agentName,
        agentPath,
        volume,
        task,
        false,
        executionTime,
        timestamp,
        '',
        context?.projectPath,
        errorMessage
      );

      return {
        success: false,
        output: '',
        error: errorMessage,
        executionTime
      };
    }
  }

  /**
   * Generate an execution trace for a sub-agent task
   * This enables tracking of sub-agent collaboration and evolution analysis
   */
  private generateSubAgentTrace(
    agentName: string,
    agentPath: string,
    volume: VolumeType,
    task: string,
    success: boolean,
    executionTime: number,
    timestamp: string,
    output: string,
    projectPath?: string,
    error?: string
  ): void {
    try {
      const patternMatcher = getLLMPatternMatcher();

      // Create execution trace for this sub-agent
      const trace: ExecutionTrace = {
        id: `trace-subagent-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        goal: `[Sub-Agent: ${agentName}] ${task}`,
        success,
        toolsUsed: ['python-execution', agentName],
        filesCreated: [],
        duration: executionTime,
        timestamp,
        output: output.substring(0, 500), // Limit output size
        error,
        traceType: 'sub-agent',
        projectPath,
      };

      // Add to pattern matcher for evolution analysis
      patternMatcher.addTrace(trace);
      logger.debug('agent', `Execution trace generated for ${agentName}`, { traceId: trace.id });

      // Also write to short-term memory if project context exists
      if (projectPath) {
        this.writeToShortTermMemory(projectPath, trace, agentName);
        logger.debug('memory', `Trace written to short-term memory for project: ${projectPath}`);
      }
    } catch (err) {
      logger.error('agent', `Failed to generate trace for ${agentName}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Write sub-agent trace to project's short-term memory
   */
  private writeToShortTermMemory(
    projectPath: string,
    trace: ExecutionTrace,
    agentName: string
  ): void {
    try {
      const vfs = getVFS();
      const shortTermPath = `${projectPath}/memory/short_term/execution_log.md`;

      let existing = '';
      try {
        existing = vfs.readFileContent(shortTermPath) || '';
      } catch {
        // File may not exist yet
      }

      const entry = `
### [${trace.timestamp}] Sub-Agent: ${agentName}

**Task:** ${trace.goal.replace(`[Sub-Agent: ${agentName}] `, '')}

**Status:** ${trace.success ? '✓ Success' : '✗ Failed'}

**Duration:** ${(trace.duration / 1000).toFixed(2)}s

${trace.error ? `**Error:** ${trace.error}\n` : ''}
---
`;

      vfs.writeFile(shortTermPath, existing + entry);
    } catch (err) {
      console.error('[SubAgentExecutor] Failed to write to short-term memory:', err);
    }
  }

  /**
   * Build Python code to execute the agent
   */
  private buildExecutionCode(
    agentCode: string,
    task: string,
    context?: Record<string, any>
  ): string {
    // Escape quotes in task
    const escapedTask = task.replace(/"/g, '\\"');

    return `
${agentCode}

# Execute agent with task
import json

# Extract class name
import re
class_match = re.search(r'class\\s+(\\w+)', """${agentCode.replace(/"/g, '\\"')}""")
agent_class_name = class_match.group(1) if class_match else None

if agent_class_name:
    # Get the class from globals
    AgentClass = globals()[agent_class_name]

    # Create instance
    agent = AgentClass()

    # Execute task
    if hasattr(agent, 'execute'):
        result = agent.execute("${escapedTask}")
        print(json.dumps(result, indent=2))
    else:
        print(f"Agent {agent_class_name} does not have an 'execute' method")
else:
    print("Could not find agent class definition")
`;
  }

  /**
   * Get all loaded agents
   */
  getLoadedAgents(): SubAgentDefinition[] {
    return Array.from(this.loadedAgents.values());
  }

  /**
   * Get agent by reference (e.g., "@quantum-researcher")
   */
  async getAgentByReference(reference: string): Promise<SubAgentDefinition | null> {
    // Remove @ prefix
    const name = reference.replace(/^@/, '');

    // Search in all volumes
    for (const volume of ['system', 'team', 'user'] as VolumeType[]) {
      const agents = await this.discoverAgents(volume);
      const agent = agents.find(a =>
        a.name.toLowerCase().includes(name.toLowerCase()) ||
        a.path.toLowerCase().includes(name.toLowerCase())
      );

      if (agent) {
        return agent;
      }
    }

    return null;
  }
}

// Singleton instance
let subAgentExecutor: SubAgentExecutor | null = null;

export function getSubAgentExecutor(): SubAgentExecutor {
  if (!subAgentExecutor) {
    subAgentExecutor = new SubAgentExecutor();
  }
  return subAgentExecutor;
}
