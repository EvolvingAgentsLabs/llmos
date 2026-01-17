/**
 * Client-Side Agent Manager
 *
 * Manages markdown-based agents entirely in the browser.
 * Replaces the need for Python backend agent orchestration.
 */

import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// TYPES
// ============================================================================

export interface Agent {
  name: string;
  type: 'specialist' | 'analyst' | 'generator' | 'orchestrator';
  path: string;
  capabilities: string[];
  tools: string[];
  systemPrompt: string;
  origin?: 'copied' | 'evolved' | 'created';
  copiedFrom?: string;
  evolvedFrom?: string;
  project?: string;
  model?: string;
  maxIterations?: number;
}

export interface AgentFrontmatter {
  name?: string;
  type?: string;
  capabilities?: string[];
  tools?: string[];
  origin?: string;
  copied_from?: string;
  evolved_from?: string;
  project?: string;
  model?: string;
  maxIterations?: number;
}

export interface AgentValidationResult {
  isValid: boolean;
  agentCount: number;
  agents: Array<{
    name: string;
    path: string;
    origin: 'copied' | 'evolved' | 'created';
    type: string;
  }>;
  breakdown: {
    copied: number;
    evolved: number;
    created: number;
  };
  recommendations: string[];
}

// ============================================================================
// AGENT MANAGER
// ============================================================================

export class ClientAgentManager {
  private fs: FileSystemStorage;
  private cache: Map<string, Agent> = new Map();

  constructor(fs?: FileSystemStorage) {
    this.fs = fs || getFileSystem();
  }

  /**
   * Discover all available agents
   */
  async discoverAgents(scope?: 'system' | 'project' | 'all', projectPath?: string): Promise<Result<Agent[], AppError>> {
    const agents: Agent[] = [];
    const patterns: string[] = [];

    if (scope === 'system' || scope === 'all' || !scope) {
      patterns.push('system/agents/**/*.md');
      patterns.push('volumes/system/agents/**/*.md');
    }

    if ((scope === 'project' || scope === 'all') && projectPath) {
      patterns.push(`${projectPath}/agents/**/*.md`);
      patterns.push(`${projectPath}/components/agents/**/*.md`);
    }

    if (scope === 'all' || !scope) {
      patterns.push('projects/*/agents/**/*.md');
      patterns.push('projects/*/components/agents/**/*.md');
    }

    for (const pattern of patterns) {
      const filesResult = await this.fs.glob(pattern);
      if (!filesResult.ok) continue;

      for (const path of filesResult.value) {
        if (path.endsWith('.gitkeep')) continue;

        const agentResult = await this.loadAgent(path);
        if (agentResult.ok && agentResult.value) {
          agents.push(agentResult.value);
        }
      }
    }

    return ok(agents);
  }

  /**
   * Load an agent from a path
   */
  async loadAgent(path: string): Promise<Result<Agent | null, AppError>> {
    if (this.cache.has(path)) {
      return ok(this.cache.get(path)!);
    }

    const contentResult = await this.fs.read(path);
    if (!contentResult.ok) return contentResult as Result<Agent | null, AppError>;
    if (!contentResult.value) return ok(null);

    const agent = this.parseAgent(path, contentResult.value);
    if (agent) {
      this.cache.set(path, agent);
    }
    return ok(agent);
  }

  /**
   * Create a new agent
   */
  async createAgent(
    agent: Omit<Agent, 'path'>,
    projectPath: string
  ): Promise<Result<Agent, AppError>> {
    const filename = this.slugify(agent.name) + '.md';
    const path = `${projectPath}/agents/${filename}`;

    const markdown = this.formatAgentAsMarkdown(agent);
    const writeResult = await this.fs.write(path, markdown);

    if (!writeResult.ok) return writeResult as Result<Agent, AppError>;

    const fullAgent: Agent = { ...agent, path, origin: agent.origin || 'created' };
    this.cache.set(path, fullAgent);
    return ok(fullAgent);
  }

  /**
   * Copy an agent to a new location
   */
  async copyAgent(sourcePath: string, destinationProject: string): Promise<Result<Agent, AppError>> {
    const sourceResult = await this.loadAgent(sourcePath);
    if (!sourceResult.ok) return sourceResult as Result<Agent, AppError>;
    if (!sourceResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Agent not found: ${sourcePath}`));
    }

    const source = sourceResult.value;
    const newAgent: Omit<Agent, 'path'> = {
      ...source,
      origin: 'copied',
      copiedFrom: sourcePath,
      project: destinationProject,
    };

    return this.createAgent(newAgent, destinationProject);
  }

  /**
   * Evolve an agent (copy + modify)
   */
  async evolveAgent(
    sourcePath: string,
    modifications: Partial<Agent>,
    destinationProject: string
  ): Promise<Result<Agent, AppError>> {
    const sourceResult = await this.loadAgent(sourcePath);
    if (!sourceResult.ok) return sourceResult as Result<Agent, AppError>;
    if (!sourceResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Agent not found: ${sourcePath}`));
    }

    const source = sourceResult.value;
    const evolvedAgent: Omit<Agent, 'path'> = {
      ...source,
      ...modifications,
      name: modifications.name || `${source.name}Evolved`,
      capabilities: [...(source.capabilities || []), ...(modifications.capabilities || [])],
      origin: 'evolved',
      evolvedFrom: sourcePath,
      project: destinationProject,
    };

    return this.createAgent(evolvedAgent, destinationProject);
  }

  /**
   * Update an existing agent
   */
  async updateAgent(path: string, updates: Partial<Agent>): Promise<Result<Agent, AppError>> {
    const existingResult = await this.loadAgent(path);
    if (!existingResult.ok) return existingResult as Result<Agent, AppError>;
    if (!existingResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Agent not found: ${path}`));
    }

    const updatedAgent: Agent = {
      ...existingResult.value,
      ...updates,
      path,
    };

    const markdown = this.formatAgentAsMarkdown(updatedAgent);
    const writeResult = await this.fs.write(path, markdown);

    if (!writeResult.ok) return writeResult as Result<Agent, AppError>;

    this.cache.set(path, updatedAgent);
    return ok(updatedAgent);
  }

  /**
   * Delete an agent
   */
  async deleteAgent(path: string): Promise<Result<void, AppError>> {
    const deleteResult = await this.fs.delete(path);
    if (deleteResult.ok) {
      this.cache.delete(path);
    }
    return deleteResult;
  }

  /**
   * Find agents by capability
   */
  async findByCapability(capability: string, scope?: 'system' | 'project' | 'all', projectPath?: string): Promise<Result<Agent[], AppError>> {
    const agentsResult = await this.discoverAgents(scope, projectPath);
    if (!agentsResult.ok) return agentsResult;

    const matches = agentsResult.value.filter(agent =>
      agent.capabilities.some(cap =>
        cap.toLowerCase().includes(capability.toLowerCase())
      )
    );

    return ok(matches);
  }

  /**
   * Validate project has minimum 3 agents
   */
  async validateProjectAgents(projectPath: string, userGoal?: string): Promise<Result<AgentValidationResult, AppError>> {
    const agentsResult = await this.discoverAgents('project', projectPath);
    if (!agentsResult.ok) return agentsResult as Result<AgentValidationResult, AppError>;

    const agents = agentsResult.value;
    const breakdown = {
      copied: agents.filter(a => a.origin === 'copied').length,
      evolved: agents.filter(a => a.origin === 'evolved').length,
      created: agents.filter(a => a.origin === 'created' || !a.origin).length,
    };

    const recommendations: string[] = [];
    if (agents.length < 3) {
      const needed = 3 - agents.length;
      recommendations.push(`Create ${needed} more agent(s) to meet the minimum requirement`);

      // Suggest agent types based on goal
      if (userGoal) {
        const suggestions = this.suggestAgentsForGoal(userGoal, agents);
        recommendations.push(...suggestions);
      } else {
        recommendations.push('Consider adding: AnalyzerAgent, ProcessorAgent, or VisualizerAgent');
      }
    }

    return ok({
      isValid: agents.length >= 3,
      agentCount: agents.length,
      agents: agents.map(a => ({
        name: a.name,
        path: a.path,
        origin: a.origin || 'created',
        type: a.type,
      })),
      breakdown,
      recommendations,
    });
  }

  /**
   * Generate an agent template for a given purpose
   */
  generateAgentTemplate(purpose: string, type: Agent['type'] = 'specialist'): string {
    const name = this.extractAgentName(purpose);
    const capabilities = this.inferCapabilities(purpose);

    return `---
name: ${name}
type: ${type}
capabilities:
${capabilities.map(c => `  - ${c}`).join('\n')}
tools:
  - execute-python
  - write-file
  - read-file
origin: created
---

# ${name}

You are a specialized agent for: ${purpose}

## Your Task

${this.generateTaskDescription(purpose)}

## Input Requirements

- [Describe expected inputs]

## Output Requirements

1. [First output requirement]
2. [Second output requirement]
3. [Third output requirement]

## Constraints

- Use only available tools
- Follow best practices for ${purpose.toLowerCase()}
- Validate outputs before returning

## Example Workflow

1. Analyze the input
2. Process according to requirements
3. Generate outputs
4. Validate and return results
`;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private parseAgent(path: string, content: string): Agent | null {
    try {
      const { frontmatter, body } = this.parseFrontmatter(content);

      return {
        name: frontmatter.name || this.extractNameFromPath(path),
        type: this.parseType(frontmatter.type),
        path,
        capabilities: frontmatter.capabilities || [],
        tools: frontmatter.tools || [],
        systemPrompt: body,
        origin: this.parseOrigin(frontmatter),
        copiedFrom: frontmatter.copied_from,
        evolvedFrom: frontmatter.evolved_from,
        project: frontmatter.project,
        model: frontmatter.model,
        maxIterations: frontmatter.maxIterations,
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatter: AgentFrontmatter = {};
    const lines = match[1].split('\n');
    let currentKey = '';
    let collectingArray = false;
    let arrayItems: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (collectingArray) {
        if (trimmed.startsWith('- ')) {
          arrayItems.push(trimmed.slice(2).trim());
          continue;
        } else {
          (frontmatter as Record<string, unknown>)[currentKey] = arrayItems;
          collectingArray = false;
          arrayItems = [];
        }
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (value === '' || value === '|') {
        currentKey = key;
        collectingArray = true;
        arrayItems = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        (frontmatter as Record<string, unknown>)[key] = value.slice(1, -1).split(',').map(s => s.trim());
      } else if (!isNaN(Number(value))) {
        (frontmatter as Record<string, unknown>)[key] = Number(value);
      } else {
        (frontmatter as Record<string, unknown>)[key] = value;
      }
    }

    if (collectingArray && arrayItems.length > 0) {
      (frontmatter as Record<string, unknown>)[currentKey] = arrayItems;
    }

    return { frontmatter, body: match[2] };
  }

  private parseType(type?: string): Agent['type'] {
    const valid = ['specialist', 'analyst', 'generator', 'orchestrator'];
    if (type && valid.includes(type)) {
      return type as Agent['type'];
    }
    return 'specialist';
  }

  private parseOrigin(frontmatter: AgentFrontmatter): Agent['origin'] {
    if (frontmatter.origin === 'copied' || frontmatter.copied_from) return 'copied';
    if (frontmatter.origin === 'evolved' || frontmatter.evolved_from) return 'evolved';
    return 'created';
  }

  private extractNameFromPath(path: string): string {
    const filename = path.split('/').pop() || '';
    return filename.replace(/\.md$/, '');
  }

  private slugify(name: string): string {
    return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private formatAgentAsMarkdown(agent: Omit<Agent, 'path'> & { path?: string }): string {
    const lines = [
      '---',
      `name: ${agent.name}`,
      `type: ${agent.type}`,
    ];

    if (agent.capabilities && agent.capabilities.length > 0) {
      lines.push('capabilities:');
      agent.capabilities.forEach(c => lines.push(`  - ${c}`));
    }

    if (agent.tools && agent.tools.length > 0) {
      lines.push('tools:');
      agent.tools.forEach(t => lines.push(`  - ${t}`));
    }

    if (agent.origin) {
      lines.push(`origin: ${agent.origin}`);
    }
    if (agent.copiedFrom) {
      lines.push(`copied_from: ${agent.copiedFrom}`);
    }
    if (agent.evolvedFrom) {
      lines.push(`evolved_from: ${agent.evolvedFrom}`);
    }
    if (agent.project) {
      lines.push(`project: ${agent.project}`);
    }
    if (agent.model) {
      lines.push(`model: ${agent.model}`);
    }

    lines.push('---', '', agent.systemPrompt);

    return lines.join('\n');
  }

  private suggestAgentsForGoal(goal: string, existingAgents: Agent[]): string[] {
    const suggestions: string[] = [];
    const lower = goal.toLowerCase();
    const existingTypes = new Set(existingAgents.map(a => a.type));

    if (/data|csv|json|analy/.test(lower) && !existingTypes.has('analyst')) {
      suggestions.push('Suggested: DataAnalyzerAgent (analyst type)');
    }
    if (/process|transform|compute/.test(lower) && !existingTypes.has('specialist')) {
      suggestions.push('Suggested: ProcessorAgent (specialist type)');
    }
    if (/visual|plot|chart|graph/.test(lower) && !existingTypes.has('generator')) {
      suggestions.push('Suggested: VisualizerAgent (generator type)');
    }
    if (/coordinate|orchestr|manage/.test(lower) && !existingTypes.has('orchestrator')) {
      suggestions.push('Suggested: CoordinatorAgent (orchestrator type)');
    }

    return suggestions;
  }

  private extractAgentName(purpose: string): string {
    // Extract key words and create agent name
    const words = purpose.split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    return words.join('') + 'Agent';
  }

  private inferCapabilities(purpose: string): string[] {
    const capabilities: string[] = [];
    const lower = purpose.toLowerCase();

    if (/data|csv|json/.test(lower)) capabilities.push('data_processing');
    if (/analy/.test(lower)) capabilities.push('statistical_analysis');
    if (/visual|plot|chart/.test(lower)) capabilities.push('visualization');
    if (/code|script|program/.test(lower)) capabilities.push('code_generation');
    if (/transform|convert/.test(lower)) capabilities.push('data_transformation');

    if (capabilities.length === 0) {
      capabilities.push('general_processing');
    }

    return capabilities;
  }

  private generateTaskDescription(purpose: string): string {
    return `When given a task related to ${purpose.toLowerCase()}, you should:

1. Understand the specific requirements
2. Plan your approach based on best practices
3. Execute the necessary operations
4. Validate the results
5. Return a comprehensive output`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let agentManagerInstance: ClientAgentManager | null = null;

export function getAgentManager(): ClientAgentManager {
  if (!agentManagerInstance) {
    agentManagerInstance = new ClientAgentManager();
  }
  return agentManagerInstance;
}
