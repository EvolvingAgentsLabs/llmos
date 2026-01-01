/**
 * Agent Loader
 *
 * Thin runtime executor that loads and executes markdown-defined agents.
 * Following the LLMos philosophy: agents are evolutionary markdown files,
 * and the TypeScript is just a minimal runtime to execute them.
 *
 * Key principles:
 * - Agents are defined in .md files with YAML frontmatter
 * - Agent logic is the markdown content (prompts for LLM)
 * - This loader reads the markdown and invokes the LLM
 * - Agents can be created, modified, and evolved as files
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';

// =============================================================================
// Types (matching markdown frontmatter structure)
// =============================================================================

export interface AgentFrontmatter {
  name: string;
  type: 'orchestrator' | 'specialist' | 'analyst' | 'generator';
  id: string;
  description: string;
  model?: string;
  maxIterations?: number;
  tools?: string[];
  capabilities?: string[];
  evolves_from?: string | null;
  version?: string;
  created_at?: string;
}

export interface LoadedAgent {
  frontmatter: AgentFrontmatter;
  systemPrompt: string;
  filePath: string;
}

export interface AgentInvocation {
  agent: LoadedAgent;
  input: string;
  context?: Record<string, any>;
}

export interface AgentResponse {
  success: boolean;
  output: string;
  raw: string;
  parsed?: Record<string, any>;
  error?: string;
}

// =============================================================================
// Agent Loader
// =============================================================================

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = match[1];
  const body = match[2].trim();

  // Simple YAML parser for our frontmatter format
  const frontmatter: Record<string, any> = {};
  const lines = yamlContent.split('\n');

  let currentKey = '';
  let inArray = false;
  let arrayValues: string[] = [];

  for (const line of lines) {
    // Handle array items
    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      arrayValues.push(value);
      continue;
    }

    // Save previous array if we were collecting one
    if (inArray && currentKey) {
      frontmatter[currentKey] = arrayValues;
      arrayValues = [];
      inArray = false;
    }

    // Handle key: value pairs
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '') {
        // This is the start of an array
        currentKey = key;
        inArray = true;
        arrayValues = [];
      } else if (value === 'null') {
        frontmatter[key] = null;
      } else if (value === 'true') {
        frontmatter[key] = true;
      } else if (value === 'false') {
        frontmatter[key] = false;
      } else if (!isNaN(Number(value))) {
        frontmatter[key] = Number(value);
      } else {
        frontmatter[key] = value;
      }
    }
  }

  // Handle trailing array
  if (inArray && currentKey) {
    frontmatter[currentKey] = arrayValues;
  }

  return { frontmatter, body };
}

/**
 * Load an agent from a markdown file
 */
export async function loadAgent(path: string): Promise<LoadedAgent | null> {
  try {
    // Determine if it's a system path or VFS path
    let content: string;

    if (path.startsWith('/system/') || path.startsWith('system/')) {
      // Fetch from public directory
      const fetchPath = path.startsWith('/') ? path : `/${path}`;
      const response = await fetch(fetchPath);
      if (!response.ok) {
        console.error(`[AgentLoader] Failed to fetch agent: ${path}`);
        return null;
      }
      content = await response.text();
    } else {
      // Try to read from VFS (would need VFS integration)
      // For now, try fetching as a public file
      const response = await fetch(`/${path}`);
      if (!response.ok) {
        console.error(`[AgentLoader] Agent not found: ${path}`);
        return null;
      }
      content = await response.text();
    }

    const { frontmatter, body } = parseFrontmatter(content);

    return {
      frontmatter: frontmatter as AgentFrontmatter,
      systemPrompt: body,
      filePath: path
    };
  } catch (error) {
    console.error(`[AgentLoader] Error loading agent ${path}:`, error);
    return null;
  }
}

/**
 * Invoke an agent with input
 *
 * This is the core execution function that:
 * 1. Uses the agent's markdown content as the system prompt
 * 2. Sends the input to the LLM
 * 3. Returns the response
 */
export async function invokeAgent(
  invocation: AgentInvocation
): Promise<AgentResponse> {
  const { agent, input, context } = invocation;

  const llmClient = createLLMClient();
  if (!llmClient) {
    return {
      success: false,
      output: '',
      raw: '',
      error: 'LLM client not configured'
    };
  }

  try {
    // Build the user message with context if provided
    let userMessage = input;
    if (context && Object.keys(context).length > 0) {
      userMessage = `## Context\n\`\`\`yaml\n${formatContext(context)}\n\`\`\`\n\n## Task\n${input}`;
    }

    const messages: Message[] = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: userMessage }
    ];

    const response = await llmClient.chatDirect(messages);

    // Try to parse JSON from response if agent is expected to return JSON
    let parsed: Record<string, any> | undefined;
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Response is not valid JSON
      }
    }

    return {
      success: true,
      output: parsed ? JSON.stringify(parsed, null, 2) : response,
      raw: response,
      parsed
    };
  } catch (error: any) {
    return {
      success: false,
      output: '',
      raw: '',
      error: error.message || String(error)
    };
  }
}

/**
 * Format context object as YAML-like string
 */
function formatContext(context: Record<string, any>, indent: number = 0): string {
  const spaces = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(context)) {
    if (Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          lines.push(`${spaces}  -`);
          lines.push(formatContext(item, indent + 2));
        } else {
          lines.push(`${spaces}  - ${item}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${spaces}${key}:`);
      lines.push(formatContext(value, indent + 1));
    } else {
      lines.push(`${spaces}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Load and invoke an agent in one call
 */
export async function loadAndInvokeAgent(
  agentPath: string,
  input: string,
  context?: Record<string, any>
): Promise<AgentResponse> {
  const agent = await loadAgent(agentPath);
  if (!agent) {
    return {
      success: false,
      output: '',
      raw: '',
      error: `Agent not found: ${agentPath}`
    };
  }

  return invokeAgent({ agent, input, context });
}

/**
 * Invoke the PatternMatcherAgent
 */
export async function invokePatternMatcher(
  newTask: string,
  traces: Array<{
    id: string;
    goal: string;
    success: boolean;
    tools_used: string[];
    files_created?: string[];
    duration_ms?: number;
    timestamp?: string;
  }>
): Promise<AgentResponse> {
  return loadAndInvokeAgent(
    'system/agents/PatternMatcherAgent.md',
    newTask,
    { new_task: newTask, traces }
  );
}

/**
 * Invoke the PlanningAgent
 */
export async function invokePlanningAgent(
  task: string,
  context: {
    available_tools: Array<{ id: string; description: string }>;
    available_agents?: Array<{ name: string; capabilities: string[] }>;
    memory_insights?: {
      similar_tasks?: Array<{ goal: string; approach: string; success: boolean }>;
      patterns?: Array<{ name: string; description: string }>;
    };
    constraints?: { max_iterations?: number; timeout_ms?: number };
  }
): Promise<AgentResponse> {
  return loadAndInvokeAgent(
    'system/agents/PlanningAgent.md',
    task,
    context
  );
}

// =============================================================================
// Agent Discovery
// =============================================================================

/**
 * Discover available agents in a directory
 */
export async function discoverAgents(basePath: string = 'system/agents'): Promise<string[]> {
  // Known system agents (since we can't list directory via fetch)
  const knownAgents = [
    'SystemAgent.md',
    'PatternMatcherAgent.md',
    'PlanningAgent.md',
    'MutationAgent.md',
    'MemoryAnalysisAgent.md',
    'MemoryConsolidationAgent.md',
    'LensSelectorAgent.md',
    'UXDesigner.md',
    'AppletDebuggerAgent.md',
    'ProjectAgentPlanner.md',
  ];

  const discoveredAgents: string[] = [];

  for (const agentFile of knownAgents) {
    try {
      const response = await fetch(`/${basePath}/${agentFile}`);
      if (response.ok) {
        discoveredAgents.push(`${basePath}/${agentFile}`);
      }
    } catch {
      // Agent doesn't exist
    }
  }

  return discoveredAgents;
}

/**
 * Load metadata for all discovered agents
 */
export async function loadAgentRegistry(basePath: string = 'system/agents'): Promise<LoadedAgent[]> {
  const agentPaths = await discoverAgents(basePath);
  const agents: LoadedAgent[] = [];

  for (const path of agentPaths) {
    const agent = await loadAgent(path);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}
