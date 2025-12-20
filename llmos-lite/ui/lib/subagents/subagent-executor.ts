/**
 * Sub-Agent Executor
 *
 * Executes Python-based sub-agents from volume files
 * Like Claude Code's custom agents
 */

import { getVolumeFileSystem, VolumeType } from '../volumes/file-operations';
import { getLivePreview } from '../runtime/live-preview';

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
  private runtime = getLivePreview();
  private loadedAgents = new Map<string, SubAgentDefinition>();

  /**
   * Discover agents in a volume
   */
  async discoverAgents(volume: VolumeType): Promise<SubAgentDefinition[]> {
    const agents: SubAgentDefinition[] = [];

    try {
      const files = await this.fs.listFiles(volume, 'agents');

      for (const file of files) {
        if (file.path.endsWith('.py')) {
          const agentDef = await this.parseAgentFile(volume, file.path);
          if (agentDef) {
            agents.push(agentDef);
            this.loadedAgents.set(`${volume}:${file.path}`, agentDef);
          }
        }
      }
    } catch (error) {
      console.warn(`No agents found in ${volume} volume`);
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

    try {
      // Load agent code
      const agentCode = await this.fs.readFile(volume, agentPath);

      // Create execution environment
      const executionCode = this.buildExecutionCode(agentCode, task, context);

      // Execute in Pyodide
      const result = await this.runtime.executeFile(
        `${volume}:${agentPath}`,
        executionCode,
        { capturePlots: true }
      );

      return {
        success: result.success,
        output: result.stdout || result.stderr || '',
        error: result.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
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
