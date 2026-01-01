/**
 * Multi-Agent Project Validator
 *
 * Ensures that every project has at least 3 markdown subagents for proper
 * complexity and completeness. Agents can be:
 * - Copied: Reused from system agents or other projects
 * - Evolved: Modified from existing agents for specific needs
 * - Created: Built from scratch for unique requirements
 */

import { getVFS } from '../virtual-fs';

// Minimum number of agents required per project
export const MIN_AGENTS_REQUIRED = 3;

export type AgentOrigin = 'copied' | 'evolved' | 'created';

export interface ProjectAgent {
  name: string;
  path: string;
  type: string;
  origin: AgentOrigin;
  evolvedFrom?: string;
  capabilities: string[];
  description?: string;
}

export interface AgentRequirement {
  role: string;
  description: string;
  suggestedType: 'orchestrator' | 'specialist' | 'analyst' | 'generator';
  requiredCapabilities: string[];
  candidateAgents?: string[];
}

export interface MultiAgentValidation {
  isValid: boolean;
  projectPath: string;
  agentCount: number;
  minimumRequired: number;
  agents: ProjectAgent[];
  agentsByOrigin: {
    copied: ProjectAgent[];
    evolved: ProjectAgent[];
    created: ProjectAgent[];
  };
  missingCount: number;
  recommendations?: AgentRequirement[];
  message: string;
}

/**
 * Parse agent markdown to extract metadata
 */
function parseAgentMarkdown(content: string, filePath: string): Partial<ProjectAgent> {
  const result: Partial<ProjectAgent> = {
    path: filePath,
    name: filePath.split('/').pop()?.replace('.md', '') || 'Unknown',
    capabilities: [],
    origin: 'created',
  };

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return result;

  const frontmatter = frontmatterMatch[1];

  // Extract name
  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  if (nameMatch) result.name = nameMatch[1].trim();

  // Extract type
  const typeMatch = frontmatter.match(/type:\s*(.+)/);
  if (typeMatch) result.type = typeMatch[1].trim();

  // Extract description
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  if (descMatch) result.description = descMatch[1].trim();

  // Extract evolves_from (indicates evolved agent)
  const evolvesMatch = frontmatter.match(/evolves_from:\s*(.+)/);
  if (evolvesMatch && evolvesMatch[1].trim() !== 'null') {
    result.evolvedFrom = evolvesMatch[1].trim();
    result.origin = 'evolved';
  }

  // Extract derived_from (alternative marker for evolved)
  const derivedMatch = frontmatter.match(/derived_from:\s*(.+)/);
  if (derivedMatch && derivedMatch[1].trim() !== 'none' && derivedMatch[1].trim() !== 'null') {
    result.evolvedFrom = derivedMatch[1].trim();
    result.origin = 'evolved';
  }

  // Extract copied_from (indicates copied agent)
  const copiedMatch = frontmatter.match(/copied_from:\s*(.+)/);
  if (copiedMatch && copiedMatch[1].trim() !== 'null') {
    result.evolvedFrom = copiedMatch[1].trim();
    result.origin = 'copied';
  }

  // Extract capabilities
  const capMatch = frontmatter.match(/capabilities:\n((?:\s+-\s+.+\n?)+)/);
  if (capMatch) {
    result.capabilities = capMatch[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }

  return result;
}

/**
 * Validate that a project has at least MIN_AGENTS_REQUIRED agents
 */
export function validateProjectAgents(projectPath: string): MultiAgentValidation {
  const vfs = getVFS();
  const agentsDir = `${projectPath}/components/agents`;

  const agents: ProjectAgent[] = [];
  const agentsByOrigin: MultiAgentValidation['agentsByOrigin'] = {
    copied: [],
    evolved: [],
    created: [],
  };

  try {
    const { files } = vfs.listDirectory(agentsDir);

    for (const file of files) {
      if (!file.path.endsWith('.md')) continue;

      const content = vfs.readFileContent(file.path);
      if (!content) continue;

      const parsed = parseAgentMarkdown(content, file.path);
      const agent: ProjectAgent = {
        name: parsed.name || 'Unknown',
        path: file.path,
        type: parsed.type || 'specialist',
        origin: parsed.origin || 'created',
        evolvedFrom: parsed.evolvedFrom,
        capabilities: parsed.capabilities || [],
        description: parsed.description,
      };

      agents.push(agent);
      agentsByOrigin[agent.origin].push(agent);
    }
  } catch (e) {
    // Agents directory doesn't exist yet
  }

  const isValid = agents.length >= MIN_AGENTS_REQUIRED;
  const missingCount = Math.max(0, MIN_AGENTS_REQUIRED - agents.length);

  let message: string;
  if (isValid) {
    message = `Project has ${agents.length} agents (minimum ${MIN_AGENTS_REQUIRED} required). ` +
      `Breakdown: ${agentsByOrigin.copied.length} copied, ` +
      `${agentsByOrigin.evolved.length} evolved, ` +
      `${agentsByOrigin.created.length} created.`;
  } else {
    message = `Project needs ${missingCount} more agent(s). Current: ${agents.length}/${MIN_AGENTS_REQUIRED}. ` +
      `Consider copying system agents, evolving existing ones, or creating specialized agents.`;
  }

  const result: MultiAgentValidation = {
    isValid,
    projectPath,
    agentCount: agents.length,
    minimumRequired: MIN_AGENTS_REQUIRED,
    agents,
    agentsByOrigin,
    missingCount,
    message,
  };

  // Add recommendations if not valid
  if (!isValid) {
    result.recommendations = generateAgentRecommendations(projectPath, agents, missingCount);
  }

  return result;
}

/**
 * Generate recommendations for missing agents
 */
function generateAgentRecommendations(
  projectPath: string,
  existingAgents: ProjectAgent[],
  missingCount: number
): AgentRequirement[] {
  const existingTypes = new Set(existingAgents.map(a => a.type));
  const recommendations: AgentRequirement[] = [];

  // Common agent patterns to recommend
  const agentPatterns: AgentRequirement[] = [
    {
      role: 'Data Processing Agent',
      description: 'Handles data generation, transformation, and preprocessing',
      suggestedType: 'specialist',
      requiredCapabilities: ['data generation', 'data processing', 'numpy operations'],
      candidateAgents: ['/system/agents/researcher.md'],
    },
    {
      role: 'Analysis Agent',
      description: 'Performs core analysis, computations, and algorithm execution',
      suggestedType: 'analyst',
      requiredCapabilities: ['analysis', 'computation', 'algorithm implementation'],
      candidateAgents: ['/system/agents/MemoryAnalysisAgent.md'],
    },
    {
      role: 'Visualization Agent',
      description: 'Creates charts, plots, and visual representations',
      suggestedType: 'generator',
      requiredCapabilities: ['matplotlib', 'visualization', 'plotting'],
      candidateAgents: ['/system/agents/UXDesigner.md'],
    },
    {
      role: 'Orchestration Agent',
      description: 'Coordinates workflow, manages dependencies between phases',
      suggestedType: 'orchestrator',
      requiredCapabilities: ['workflow coordination', 'task delegation', 'phase management'],
      candidateAgents: ['/system/agents/PlanningAgent.md'],
    },
    {
      role: 'Documentation Agent',
      description: 'Creates comprehensive documentation and reports',
      suggestedType: 'generator',
      requiredCapabilities: ['documentation', 'report generation', 'markdown'],
      candidateAgents: [],
    },
    {
      role: 'Quality Assurance Agent',
      description: 'Validates results, checks for errors, ensures quality',
      suggestedType: 'analyst',
      requiredCapabilities: ['validation', 'error checking', 'quality assurance'],
      candidateAgents: ['/system/agents/code-debugger.md'],
    },
  ];

  // Add recommendations based on what's missing
  for (const pattern of agentPatterns) {
    if (recommendations.length >= missingCount) break;

    // Check if this type of agent already exists
    const hasType = existingAgents.some(a =>
      a.type === pattern.suggestedType ||
      a.capabilities.some(c => pattern.requiredCapabilities.some(rc => c.toLowerCase().includes(rc.toLowerCase())))
    );

    if (!hasType) {
      recommendations.push(pattern);
    }
  }

  // If we still need more, add generic recommendations
  while (recommendations.length < missingCount) {
    recommendations.push({
      role: `Specialist Agent ${recommendations.length + 1}`,
      description: 'Domain-specific agent for project requirements',
      suggestedType: 'specialist',
      requiredCapabilities: ['domain expertise', 'task execution'],
      candidateAgents: [],
    });
  }

  return recommendations;
}

/**
 * Get status message for multi-agent requirement
 */
export function getMultiAgentStatus(projectPath: string): string {
  const validation = validateProjectAgents(projectPath);

  if (validation.isValid) {
    return `✅ Multi-agent requirement met: ${validation.agentCount}/${MIN_AGENTS_REQUIRED} agents ` +
      `(${validation.agentsByOrigin.copied.length} copied, ` +
      `${validation.agentsByOrigin.evolved.length} evolved, ` +
      `${validation.agentsByOrigin.created.length} created)`;
  } else {
    return `⚠️ Multi-agent requirement NOT met: ${validation.agentCount}/${MIN_AGENTS_REQUIRED} agents. ` +
      `Need ${validation.missingCount} more agent(s).`;
  }
}

/**
 * Check if project meets multi-agent requirement
 */
export function meetsMultiAgentRequirement(projectPath: string): boolean {
  const validation = validateProjectAgents(projectPath);
  return validation.isValid;
}

/**
 * Get agent creation suggestions for a project based on user goal
 */
export async function suggestAgentsForProject(
  projectPath: string,
  userGoal: string
): Promise<AgentRequirement[]> {
  const validation = validateProjectAgents(projectPath);

  // If already valid, return empty
  if (validation.isValid) {
    return [];
  }

  // Return recommendations with context from user goal
  const recommendations = validation.recommendations || [];

  // Enhance recommendations based on keywords in user goal
  const goalLower = userGoal.toLowerCase();

  const keywordEnhancements: Record<string, Partial<AgentRequirement>> = {
    'signal': { requiredCapabilities: ['signal processing', 'FFT', 'scipy'] },
    'fft': { requiredCapabilities: ['FFT', 'frequency analysis', 'spectral analysis'] },
    'machine learning': { requiredCapabilities: ['scikit-learn', 'model training', 'prediction'] },
    'ml': { requiredCapabilities: ['scikit-learn', 'model training', 'prediction'] },
    'visualization': { requiredCapabilities: ['matplotlib', 'plotting', 'charts'] },
    'plot': { requiredCapabilities: ['matplotlib', 'visualization'] },
    'data': { requiredCapabilities: ['pandas', 'data processing', 'numpy'] },
    'analysis': { requiredCapabilities: ['statistical analysis', 'data analysis'] },
    'dashboard': { requiredCapabilities: ['React', 'applet generation', 'UI design'] },
    'interactive': { requiredCapabilities: ['React', 'user interaction', 'state management'] },
  };

  for (const [keyword, enhancement] of Object.entries(keywordEnhancements)) {
    if (goalLower.includes(keyword)) {
      for (const rec of recommendations) {
        rec.requiredCapabilities = [
          ...rec.requiredCapabilities,
          ...(enhancement.requiredCapabilities || []),
        ];
      }
      break;
    }
  }

  return recommendations;
}

/**
 * Format validation result for LLM consumption
 */
export function formatValidationForLLM(validation: MultiAgentValidation): string {
  let output = `## Multi-Agent Project Validation\n\n`;
  output += `**Project:** ${validation.projectPath}\n`;
  output += `**Status:** ${validation.isValid ? '✅ VALID' : '❌ INVALID'}\n`;
  output += `**Agent Count:** ${validation.agentCount}/${validation.minimumRequired}\n\n`;

  if (validation.agents.length > 0) {
    output += `### Current Agents\n\n`;
    for (const agent of validation.agents) {
      output += `- **${agent.name}** (${agent.type}, ${agent.origin})`;
      if (agent.evolvedFrom) {
        output += ` - evolved from: ${agent.evolvedFrom}`;
      }
      output += `\n`;
      if (agent.capabilities.length > 0) {
        output += `  Capabilities: ${agent.capabilities.slice(0, 3).join(', ')}\n`;
      }
    }
    output += '\n';
  }

  if (!validation.isValid && validation.recommendations) {
    output += `### Required: ${validation.missingCount} More Agent(s)\n\n`;
    output += `You MUST create/copy/evolve ${validation.missingCount} more agent(s) to meet the minimum requirement.\n\n`;

    output += `### Recommendations\n\n`;
    for (const rec of validation.recommendations) {
      output += `#### ${rec.role}\n`;
      output += `- **Type:** ${rec.suggestedType}\n`;
      output += `- **Description:** ${rec.description}\n`;
      output += `- **Required Capabilities:** ${rec.requiredCapabilities.join(', ')}\n`;
      if (rec.candidateAgents && rec.candidateAgents.length > 0) {
        output += `- **Candidate System Agents:** ${rec.candidateAgents.join(', ')}\n`;
      }
      output += '\n';
    }

    output += `### Actions to Take\n\n`;
    output += `1. **Copy** an existing system agent if it matches 80%+ of requirements\n`;
    output += `2. **Evolve** a copied agent by customizing capabilities for this project\n`;
    output += `3. **Create** a new agent from scratch if no suitable agent exists\n\n`;
    output += `Each project agent should be saved to: \`${validation.projectPath}/components/agents/[AgentName].md\`\n`;
  }

  return output;
}
