/**
 * Client-Side Kernel
 *
 * The unified kernel that orchestrates all client-side components.
 * This replaces the Python backend entirely - everything runs in the browser.
 */

import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { ClientSkillsManager, getSkillsManager, Skill } from '../skills/client-skills-manager';
import { ClientEvolutionEngine, getEvolutionEngine, EvolutionResult } from '../evolution/client-evolution';
import { ClientAgentManager, getAgentManager, Agent, AgentValidationResult } from '../agents/client-agent-manager';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// TYPES
// ============================================================================

export interface KernelConfig {
  minAgentsPerProject: number;
  evolutionEnabled: boolean;
  memoryConsolidationEnabled: boolean;
  selfModifyingEnabled: boolean;
  defaultModel: string;
}

export interface ProjectContext {
  name: string;
  path: string;
  goal: string;
  agents: Agent[];
  skills: Skill[];
}

export interface ExecutionPlan {
  phases: ExecutionPhase[];
  estimatedDuration: number;
  requiredAgents: string[];
}

export interface ExecutionPhase {
  name: string;
  description: string;
  agentName: string;
  dependencies: string[];
  tools: string[];
}

export interface ExecutionResult {
  success: boolean;
  outputs: Record<string, unknown>;
  traces: string[];
  errors: string[];
  duration: number;
}

export interface MemoryQuery {
  query: string;
  memoryType?: 'agent_templates' | 'workflow_patterns' | 'domain_knowledge' | 'skills' | 'traces' | 'all';
  scope?: 'project' | 'global';
  projectPath?: string;
  limit?: number;
}

export interface MemoryMatch {
  path: string;
  relevance: number;
  type: string;
  excerpt: string;
}

// ============================================================================
// CLIENT KERNEL
// ============================================================================

export class ClientKernel {
  private fs: FileSystemStorage;
  private skillsManager: ClientSkillsManager;
  private evolutionEngine: ClientEvolutionEngine;
  private agentManager: ClientAgentManager;
  private config: KernelConfig;
  private llmCallback?: (messages: Array<{ role: string; content: string }>) => Promise<string>;

  constructor(
    llmCallback?: (messages: Array<{ role: string; content: string }>) => Promise<string>,
    config?: Partial<KernelConfig>
  ) {
    this.fs = getFileSystem();
    this.skillsManager = getSkillsManager();
    this.agentManager = getAgentManager();
    this.llmCallback = llmCallback;

    // Create evolution engine with LLM callback
    const evolutionLlmCallback = llmCallback
      ? async (prompt: string) => llmCallback([{ role: 'user', content: prompt }])
      : undefined;
    this.evolutionEngine = getEvolutionEngine(evolutionLlmCallback);

    this.config = {
      minAgentsPerProject: config?.minAgentsPerProject ?? 3,
      evolutionEnabled: config?.evolutionEnabled ?? true,
      memoryConsolidationEnabled: config?.memoryConsolidationEnabled ?? true,
      selfModifyingEnabled: config?.selfModifyingEnabled ?? true,
      defaultModel: config?.defaultModel ?? 'anthropic/claude-sonnet-4-20250514',
    };
  }

  // ============================================================================
  // PROJECT MANAGEMENT
  // ============================================================================

  /**
   * Create a new project with required structure
   */
  async createProject(name: string, goal: string): Promise<Result<ProjectContext, AppError>> {
    const projectPath = `projects/${this.slugify(name)}`;

    try {
      // Create directory structure
      const directories = [
        'agents',
        'components/agents',
        'output/code',
        'output/visualizations',
        'memory/short_term',
        'memory/long_term',
        'skills',
        'tools',
        'applets',
      ];

      for (const dir of directories) {
        await this.fs.mkdir(`${projectPath}/${dir}`);
      }

      // Create context.md
      await this.fs.write(`${projectPath}/context.md`, `---
name: ${name}
goal: ${goal}
created_at: ${new Date().toISOString()}
status: active
---

# ${name}

## Goal
${goal}

## Progress
- Project initialized

## Notes
`);

      // Create README
      await this.fs.write(`${projectPath}/README.md`, `# ${name}

## Overview
${goal}

## Project Structure
- \`agents/\` - Specialized sub-agents
- \`output/code/\` - Generated code
- \`output/visualizations/\` - Plots and images
- \`memory/\` - Execution traces and learnings
- \`skills/\` - Reusable patterns
`);

      return ok({
        name,
        path: projectPath,
        goal,
        agents: [],
        skills: [],
      });
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to create project', error));
    }
  }

  /**
   * Load an existing project
   */
  async loadProject(projectPath: string): Promise<Result<ProjectContext, AppError>> {
    try {
      // Load context
      const contextResult = await this.fs.read(`${projectPath}/context.md`);
      if (!contextResult.ok || !contextResult.value) {
        return err(appError(ErrorCodes.NOT_FOUND, `Project not found: ${projectPath}`));
      }

      const { frontmatter } = this.parseFrontmatter(contextResult.value);

      // Load agents
      const agentsResult = await this.agentManager.discoverAgents('project', projectPath);
      const agents = agentsResult.ok ? agentsResult.value : [];

      // Load skills
      const skillsResult = await this.skillsManager.loadSkills('project', projectPath);
      const skills = skillsResult.ok ? skillsResult.value : [];

      return ok({
        name: frontmatter.name || projectPath.split('/').pop() || '',
        path: projectPath,
        goal: frontmatter.goal || '',
        agents,
        skills,
      });
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to load project', error));
    }
  }

  // ============================================================================
  // MEMORY OPERATIONS
  // ============================================================================

  /**
   * Query memory for relevant information
   */
  async queryMemory(query: MemoryQuery): Promise<Result<MemoryMatch[], AppError>> {
    const matches: MemoryMatch[] = [];

    try {
      let searchPaths: string[] = [];

      // Determine search paths based on type and scope
      if (query.scope === 'project' && query.projectPath) {
        searchPaths = [`${query.projectPath}/memory`];
      } else {
        searchPaths = ['projects/*/memory', 'system'];
      }

      // Search for matches
      for (const basePath of searchPaths) {
        const grepResult = await this.fs.grep(query.query, basePath, { limit: query.limit || 10 });
        if (!grepResult.ok) continue;

        for (const match of grepResult.value) {
          const type = this.inferMemoryType(match.path);
          if (query.memoryType && query.memoryType !== 'all' && type !== query.memoryType) {
            continue;
          }

          matches.push({
            path: match.path,
            relevance: this.calculateRelevance(match.matches, query.query),
            type,
            excerpt: match.matches.join(' ').slice(0, 200),
          });
        }
      }

      // Sort by relevance
      matches.sort((a, b) => b.relevance - a.relevance);

      return ok(matches.slice(0, query.limit || 10));
    } catch (error) {
      return err(appError(ErrorCodes.PROCESSING_ERROR, 'Memory query failed', error));
    }
  }

  /**
   * Log an execution trace
   */
  async logTrace(
    projectPath: string,
    trace: {
      goal: string;
      agentName: string;
      agentPath?: string;
      status: 'success' | 'failure' | 'partial';
      successRating: number;
      toolsUsed: string[];
      outputs: string[];
      parentTraceId?: string;
      linkType?: 'sequential' | 'hierarchical' | 'dependency' | 'parallel';
    }
  ): Promise<Result<string, AppError>> {
    const timestamp = new Date().toISOString();
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filename = `${timestamp.replace(/[:.]/g, '-')}_${trace.agentName}.md`;
    const path = `${projectPath}/memory/short_term/${filename}`;

    const content = `---
trace_id: ${traceId}
timestamp: ${timestamp}
project: ${projectPath.split('/').pop()}
agent_name: ${trace.agentName}
agent_path: ${trace.agentPath || ''}
status: ${trace.status}
success_rating: ${trace.successRating}
tools_used: [${trace.toolsUsed.join(', ')}]
parent_trace_id: ${trace.parentTraceId || ''}
link_type: ${trace.linkType || 'sequential'}
lifecycle_state: active
---

# Execution Trace: ${trace.goal}

## Goal
${trace.goal}

## Agent
- Name: ${trace.agentName}
- Path: ${trace.agentPath || 'N/A'}

## Status
- Result: ${trace.status}
- Success Rating: ${(trace.successRating * 100).toFixed(0)}%

## Tools Used
${trace.toolsUsed.map(t => `- ${t}`).join('\n')}

## Outputs
${trace.outputs.map(o => `- ${o}`).join('\n')}

## Timestamp
${timestamp}
`;

    const writeResult = await this.fs.write(path, content);
    if (!writeResult.ok) return writeResult as Result<string, AppError>;

    return ok(traceId);
  }

  /**
   * Consolidate short-term traces into long-term learnings
   */
  async consolidateMemory(projectPath: string): Promise<Result<number, AppError>> {
    if (!this.config.memoryConsolidationEnabled) {
      return ok(0);
    }

    try {
      // Load short-term traces
      const tracesPattern = `${projectPath}/memory/short_term/**/*.md`;
      const filesResult = await this.fs.glob(tracesPattern);
      if (!filesResult.ok) return filesResult as Result<number, AppError>;

      const traces: Array<{ path: string; content: string }> = [];
      for (const path of filesResult.value) {
        if (path.endsWith('.gitkeep')) continue;
        const contentResult = await this.fs.read(path);
        if (contentResult.ok && contentResult.value) {
          traces.push({ path, content: contentResult.value });
        }
      }

      if (traces.length < 3) {
        return ok(0); // Not enough traces to consolidate
      }

      // Generate summary using LLM if available
      let summary: string;
      if (this.llmCallback) {
        const traceContents = traces.slice(0, 10).map(t => t.content).join('\n---\n');
        const response = await this.llmCallback([
          {
            role: 'user',
            content: `Analyze these execution traces and extract key learnings:

${traceContents}

Summarize:
1. What patterns were successful?
2. What approaches worked best?
3. What should be avoided?
4. What reusable insights can be extracted?

Format as a structured learning document.`
          }
        ]);
        summary = response;
      } else {
        summary = this.generateHeuristicSummary(traces);
      }

      // Write learning
      const learningPath = `${projectPath}/memory/long_term/consolidated_${Date.now()}.md`;
      await this.fs.write(learningPath, `---
consolidated_at: ${new Date().toISOString()}
source_traces: ${traces.length}
---

# Consolidated Learnings

${summary}
`);

      return ok(1);
    } catch (error) {
      return err(appError(ErrorCodes.PROCESSING_ERROR, 'Memory consolidation failed', error));
    }
  }

  // ============================================================================
  // AGENT OPERATIONS
  // ============================================================================

  /**
   * Get or create agents for a project goal
   */
  async ensureProjectAgents(projectPath: string, goal: string): Promise<Result<Agent[], AppError>> {
    const validationResult = await this.agentManager.validateProjectAgents(projectPath, goal);
    if (!validationResult.ok) return validationResult as Result<Agent[], AppError>;

    const validation = validationResult.value;

    if (validation.isValid) {
      const agentsResult = await this.agentManager.discoverAgents('project', projectPath);
      return agentsResult;
    }

    // Need to create more agents
    const agentsNeeded = this.config.minAgentsPerProject - validation.agentCount;
    const createdAgents: Agent[] = [];

    // Try to find and copy system agents first
    const systemAgentsResult = await this.agentManager.discoverAgents('system');
    if (systemAgentsResult.ok) {
      for (const sysAgent of systemAgentsResult.value) {
        if (createdAgents.length >= agentsNeeded) break;

        // Check if agent is relevant to goal
        if (this.isAgentRelevant(sysAgent, goal)) {
          const copyResult = await this.agentManager.copyAgent(sysAgent.path, projectPath);
          if (copyResult.ok) {
            createdAgents.push(copyResult.value);
          }
        }
      }
    }

    // Create new agents if still needed
    while (createdAgents.length < agentsNeeded) {
      const agentType = this.suggestAgentType(goal, createdAgents);
      const template = this.agentManager.generateAgentTemplate(
        `${agentType} for ${goal}`,
        'specialist'
      );

      const createResult = await this.agentManager.createAgent(
        {
          name: `${agentType}Agent`,
          type: 'specialist',
          capabilities: [agentType.toLowerCase()],
          tools: ['execute-python', 'write-file', 'read-file'],
          systemPrompt: template.split('---').pop() || '',
          origin: 'created',
        },
        projectPath
      );

      if (createResult.ok) {
        createdAgents.push(createResult.value);
      }
    }

    // Return all agents
    return this.agentManager.discoverAgents('project', projectPath);
  }

  /**
   * Invoke an agent to perform a task
   */
  async invokeAgent(
    agentPath: string,
    task: string,
    projectPath: string
  ): Promise<Result<string, AppError>> {
    if (!this.llmCallback) {
      return err(appError(ErrorCodes.CONFIGURATION_ERROR, 'LLM callback not configured'));
    }

    // Load the agent
    const agentResult = await this.agentManager.loadAgent(agentPath);
    if (!agentResult.ok) return agentResult as Result<string, AppError>;
    if (!agentResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Agent not found: ${agentPath}`));
    }

    const agent = agentResult.value;

    // Load relevant skills
    const skillsResult = await this.skillsManager.buildContextForQuery(task, 3);
    const skillContext = skillsResult.ok ? skillsResult.value : '';

    // Construct the full prompt
    const systemPrompt = `${agent.systemPrompt}

${skillContext}

## Available Tools
${agent.tools.map(t => `- ${t}`).join('\n')}

## Project Context
Project: ${projectPath}
`;

    try {
      const response = await this.llmCallback([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ]);

      // Log the trace
      await this.logTrace(projectPath, {
        goal: task,
        agentName: agent.name,
        agentPath,
        status: 'success',
        successRating: 1.0,
        toolsUsed: agent.tools,
        outputs: [response.slice(0, 100)],
      });

      return ok(response);
    } catch (error) {
      // Log failure
      await this.logTrace(projectPath, {
        goal: task,
        agentName: agent.name,
        agentPath,
        status: 'failure',
        successRating: 0,
        toolsUsed: [],
        outputs: [],
      });

      return err(appError(ErrorCodes.PROCESSING_ERROR, 'Agent invocation failed', error));
    }
  }

  // ============================================================================
  // EVOLUTION
  // ============================================================================

  /**
   * Run evolution to generate skills from patterns
   */
  async runEvolution(projectPath?: string): Promise<Result<EvolutionResult, AppError>> {
    if (!this.config.evolutionEnabled) {
      return ok({
        tracesAnalyzed: 0,
        patternsDetected: 0,
        viablePatterns: 0,
        skillsCreated: 0,
        skills: [],
      });
    }

    return this.evolutionEngine.runEvolution(
      projectPath ? 'project' : 'user',
      projectPath
    );
  }

  // ============================================================================
  // SKILLS
  // ============================================================================

  /**
   * Get relevant skills for a query
   */
  async getRelevantSkills(query: string, limit = 5): Promise<Result<Skill[], AppError>> {
    return this.skillsManager.filterSkills({ query, limit });
  }

  /**
   * Create a new skill
   */
  async createSkill(
    skill: Omit<Skill, 'path' | 'id'>,
    projectPath?: string
  ): Promise<Result<Skill, AppError>> {
    return this.skillsManager.createSkill(
      skill,
      projectPath ? 'project' : 'user',
      projectPath
    );
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatter: Record<string, string> = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      frontmatter[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }

    return { frontmatter, body: match[2] };
  }

  private inferMemoryType(path: string): string {
    if (path.includes('agent')) return 'agent_templates';
    if (path.includes('workflow')) return 'workflow_patterns';
    if (path.includes('domain')) return 'domain_knowledge';
    if (path.includes('skill')) return 'skills';
    if (path.includes('trace') || path.includes('short_term')) return 'traces';
    return 'all';
  }

  private calculateRelevance(matches: string[], query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    let score = 0;

    for (const match of matches) {
      const lower = match.toLowerCase();
      for (const term of queryTerms) {
        if (lower.includes(term)) score += 1;
      }
    }

    return Math.min(score / (queryTerms.length * matches.length), 1);
  }

  private generateHeuristicSummary(traces: Array<{ path: string; content: string }>): string {
    const successCount = traces.filter(t => t.content.includes('status: success')).length;
    const failureCount = traces.filter(t => t.content.includes('status: failure')).length;

    return `## Summary

- Total traces analyzed: ${traces.length}
- Successful: ${successCount}
- Failed: ${failureCount}
- Success rate: ${((successCount / traces.length) * 100).toFixed(0)}%

## Observations

This is an automated summary. Review individual traces for detailed insights.`;
  }

  private isAgentRelevant(agent: Agent, goal: string): boolean {
    const goalLower = goal.toLowerCase();
    const agentText = `${agent.name} ${agent.capabilities.join(' ')}`.toLowerCase();

    const keywords = goalLower.split(/\s+/).filter(w => w.length > 3);
    return keywords.some(kw => agentText.includes(kw));
  }

  private suggestAgentType(goal: string, existingAgents: Agent[]): string {
    const types = ['Analyzer', 'Processor', 'Visualizer', 'Generator', 'Coordinator'];
    const existingNames = existingAgents.map(a => a.name.toLowerCase());

    for (const type of types) {
      if (!existingNames.some(n => n.includes(type.toLowerCase()))) {
        return type;
      }
    }

    return 'Specialist';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let kernelInstance: ClientKernel | null = null;

export function getKernel(
  llmCallback?: (messages: Array<{ role: string; content: string }>) => Promise<string>,
  config?: Partial<KernelConfig>
): ClientKernel {
  if (!kernelInstance) {
    kernelInstance = new ClientKernel(llmCallback, config);
  }
  return kernelInstance;
}

export function resetKernel(): void {
  kernelInstance = null;
}
