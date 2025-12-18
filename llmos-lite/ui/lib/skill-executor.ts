/**
 * Skill Executor - Execute skills that orchestrate tools and agents
 *
 * Skills are high-level workflows that combine tools and agents
 */

import { Skill } from './volume-loader';
import { Tool, ToolContext, executeTool } from './tool-executor';
import { Agent, AgentExecutor } from './agent-executor';
import { MultiAgentSystem, getAgentHub } from './agent-communication';
import { LLMClient } from './llm-client';

export interface SkillStep {
  type: 'tool' | 'agent' | 'llm' | 'conditional' | 'loop';
  action: string;
  inputs?: Record<string, any>;
  output?: string; // Variable name to store output
  condition?: string; // For conditional steps
}

export interface SkillExecutionResult {
  skillId: string;
  skillName: string;
  success: boolean;
  output?: any;
  steps: Array<{
    step: SkillStep;
    success: boolean;
    output?: any;
    error?: string;
    executionTime: number;
  }>;
  totalExecutionTime: number;
  error?: string;
}

/**
 * Parse skill workflow from markdown
 */
export function parseSkillWorkflow(skill: Skill): SkillStep[] {
  const steps: SkillStep[] = [];

  try {
    // Look for workflow section in markdown
    const workflowMatch = skill.content.match(/##\s*Workflow\s*\n\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!workflowMatch) {
      // Try alternative format
      const stepsMatch = skill.content.match(/##\s*Steps\s*\n\n([\s\S]*?)(?=\n##|\n---|$)/);
      if (stepsMatch) {
        return parseStepsFromMarkdown(stepsMatch[1]);
      }
      return [];
    }

    return parseStepsFromMarkdown(workflowMatch[1]);
  } catch (error) {
    console.error('Failed to parse skill workflow:', error);
    return [];
  }
}

function parseStepsFromMarkdown(content: string): SkillStep[] {
  const steps: SkillStep[] = [];

  // Parse numbered list
  const stepRegex = /^\d+\.\s+(.+)$/gm;
  let match;

  while ((match = stepRegex.exec(content)) !== null) {
    const stepText = match[1].trim();
    const step = parseStepFromText(stepText);
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

function parseStepFromText(text: string): SkillStep | null {
  // Parse different step formats:
  // "Use tool: calculator with { expression: '2+2' }"
  // "Call agent: researcher with 'Search for quantum computing'"
  // "Ask LLM: What is quantum computing?"
  // "If [condition], then [action]"
  // "For each [item] in [list], do [action]"

  if (text.match(/use tool:?/i)) {
    const toolMatch = text.match(/use tool:?\s*(\S+)\s*(?:with\s+(.+))?/i);
    if (toolMatch) {
      return {
        type: 'tool',
        action: toolMatch[1],
        inputs: toolMatch[2] ? parseInputs(toolMatch[2]) : {},
      };
    }
  }

  if (text.match(/call agent:?/i)) {
    const agentMatch = text.match(/call agent:?\s*(\S+)\s*(?:with\s+(.+))?/i);
    if (agentMatch) {
      return {
        type: 'agent',
        action: agentMatch[1],
        inputs: { query: agentMatch[2] || '' },
      };
    }
  }

  if (text.match(/ask llm:?/i)) {
    const llmMatch = text.match(/ask llm:?\s*(.+)/i);
    if (llmMatch) {
      return {
        type: 'llm',
        action: 'query',
        inputs: { prompt: llmMatch[1] },
      };
    }
  }

  if (text.match(/^if\s+/i)) {
    const condMatch = text.match(/^if\s+(.+?),?\s+then\s+(.+)/i);
    if (condMatch) {
      return {
        type: 'conditional',
        condition: condMatch[1],
        action: condMatch[2],
      };
    }
  }

  if (text.match(/^for each/i)) {
    const loopMatch = text.match(/^for each\s+(.+?)\s+in\s+(.+?),\s+do\s+(.+)/i);
    if (loopMatch) {
      return {
        type: 'loop',
        action: loopMatch[3],
        inputs: {
          item: loopMatch[1],
          collection: loopMatch[2],
        },
      };
    }
  }

  return null;
}

function parseInputs(inputText: string): Record<string, any> {
  try {
    // Try to parse as JSON
    if (inputText.trim().startsWith('{')) {
      return JSON.parse(inputText);
    }

    // Try to parse as key-value pairs
    const inputs: Record<string, any> = {};
    const pairs = inputText.split(',').map(p => p.trim());

    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim().replace(/^['"]|['"]$/g, '');
        inputs[key.trim()] = value;
      }
    }

    return inputs;
  } catch (error) {
    console.warn('Failed to parse inputs:', inputText, error);
    return {};
  }
}

/**
 * Skill Executor with tool and agent orchestration
 */
export class SkillExecutor {
  private skill: Skill;
  private toolContext: ToolContext;
  private llmClient: LLMClient;
  private agentSystem: MultiAgentSystem;
  private variables: Map<string, any> = new Map();

  constructor(
    skill: Skill,
    toolContext: ToolContext,
    llmClient: LLMClient,
    agents: Map<string, AgentExecutor>
  ) {
    this.skill = skill;
    this.toolContext = toolContext;
    this.llmClient = llmClient;

    // Create agent system
    this.agentSystem = new MultiAgentSystem(getAgentHub());
    agents.forEach((executor, id) => {
      this.agentSystem.addAgent(id, executor);
    });
  }

  /**
   * Execute the skill workflow
   */
  async execute(inputs?: Record<string, any>): Promise<SkillExecutionResult> {
    const startTime = performance.now();
    const stepResults: SkillExecutionResult['steps'] = [];

    // Initialize variables with inputs
    if (inputs) {
      Object.entries(inputs).forEach(([key, value]) => {
        this.variables.set(key, value);
      });
    }

    try {
      const steps = parseSkillWorkflow(this.skill);

      for (const step of steps) {
        const stepStartTime = performance.now();

        try {
          let output: any;

          switch (step.type) {
            case 'tool':
              output = await this.executeTool(step);
              break;
            case 'agent':
              output = await this.executeAgent(step);
              break;
            case 'llm':
              output = await this.executeLLM(step);
              break;
            case 'conditional':
              output = await this.executeConditional(step);
              break;
            case 'loop':
              output = await this.executeLoop(step);
              break;
          }

          // Store output in variable if specified
          if (step.output) {
            this.variables.set(step.output, output);
          }

          stepResults.push({
            step,
            success: true,
            output,
            executionTime: performance.now() - stepStartTime,
          });
        } catch (error: any) {
          stepResults.push({
            step,
            success: false,
            error: error.message || String(error),
            executionTime: performance.now() - stepStartTime,
          });

          // Stop on error (could make this configurable)
          throw error;
        }
      }

      const totalExecutionTime = performance.now() - startTime;

      return {
        skillId: this.skill.id,
        skillName: this.skill.name,
        success: true,
        output: this.variables.get('result') || this.variables.get('output'),
        steps: stepResults,
        totalExecutionTime,
      };
    } catch (error: any) {
      return {
        skillId: this.skill.id,
        skillName: this.skill.name,
        success: false,
        error: error.message || String(error),
        steps: stepResults,
        totalExecutionTime: performance.now() - startTime,
      };
    }
  }

  private async executeTool(step: SkillStep): Promise<any> {
    const tool = this.toolContext.getTool(step.action);
    if (!tool) {
      throw new Error(`Tool not found: ${step.action}`);
    }

    // Resolve variables in inputs
    const inputs = this.resolveVariables(step.inputs || {});

    const result = await executeTool(tool, inputs);

    if (!result.success) {
      throw new Error(result.error || 'Tool execution failed');
    }

    return result.output;
  }

  private async executeAgent(step: SkillStep): Promise<any> {
    const inputs = this.resolveVariables(step.inputs || {});
    const query = inputs.query || inputs.task || '';

    const result = await this.agentSystem.executeCollaborative(step.action, query);

    if (!result.result.success) {
      throw new Error(result.result.error || 'Agent execution failed');
    }

    return result.result.output;
  }

  private async executeLLM(step: SkillStep): Promise<any> {
    const inputs = this.resolveVariables(step.inputs || {});
    const prompt = inputs.prompt || '';

    const response = await this.llmClient.chatDirect([
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  private async executeConditional(step: SkillStep): Promise<any> {
    if (!step.condition) {
      throw new Error('Conditional step missing condition');
    }

    // Evaluate condition (simple string match for now)
    const condition = this.resolveVariables({ cond: step.condition }).cond;
    const isTrue = this.evaluateCondition(condition);

    if (isTrue) {
      // Execute action (parse as new step)
      const actionStep = parseStepFromText(step.action);
      if (actionStep) {
        return this.executeStep(actionStep);
      }
    }

    return null;
  }

  private async executeLoop(step: SkillStep): Promise<any[]> {
    const inputs = this.resolveVariables(step.inputs || {});
    const collection = inputs.collection || [];
    const itemName = inputs.item || 'item';
    const results = [];

    for (const item of collection) {
      // Set loop variable
      this.variables.set(itemName, item);

      // Execute action
      const actionStep = parseStepFromText(step.action);
      if (actionStep) {
        const result = await this.executeStep(actionStep);
        results.push(result);
      }
    }

    return results;
  }

  private async executeStep(step: SkillStep): Promise<any> {
    switch (step.type) {
      case 'tool':
        return this.executeTool(step);
      case 'agent':
        return this.executeAgent(step);
      case 'llm':
        return this.executeLLM(step);
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  private resolveVariables(inputs: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Variable reference
        const varName = value.slice(1);
        resolved[key] = this.variables.get(varName);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private evaluateCondition(condition: string): boolean {
    // Simple condition evaluation
    // Could be enhanced with proper expression parser
    const trimmed = condition.trim();

    // Check for variable existence
    if (trimmed.startsWith('$')) {
      const varName = trimmed.slice(1);
      return this.variables.has(varName) && !!this.variables.get(varName);
    }

    // Default to true
    return true;
  }
}
