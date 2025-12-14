/**
 * Workflow Executor for LLMos-Lite
 *
 * Executes workflow DAGs in the browser using WebAssembly runtimes.
 * Supports:
 * - Python (via Pyodide)
 * - JavaScript (native)
 * - SPICE (future: via Ngspice.js)
 * - Three.js (for 3D rendering)
 */

import { executePythonSkill } from './pyodide-runner';
import { ExecutionPolicy, ExecutionPolicyEnforcer, DEFAULT_POLICIES } from './execution-policy';
import { mcpClient } from './mcp-client';
import { MCPServerRegistry } from './mcp-config';

export type NodeType = 'python-wasm' | 'javascript' | 'spice' | 'threejs' | 'qiskit';

export interface NodeInput {
  name: string;
  type: string;
  description: string;
  default: any;
  required: boolean;
}

export interface NodeOutput {
  name: string;
  type: string;
  description: string;
}

export interface ExecutableSkill {
  skillId: string;
  name: string;
  type: NodeType;
  executionMode: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  code: string;
  metadata: {
    category: string;
    tags: string[];
    estimatedTimeMs: number;
    memoryMb: number;
  };
  // MCP configuration
  mcpServers?: string[];
  // Execution policy
  executionPolicy?: ExecutionPolicy | 'strict' | 'standard' | 'relaxed';
}

export interface WorkflowNode {
  nodeId: string;
  skillId: string;
  position: { x: number; y: number };
  inputValues: Record<string, any>;
}

export interface WorkflowEdge {
  edgeId: string;
  source: string;
  sourceOutput: string;
  target: string;
  targetInput: string;
}

export interface Workflow {
  workflowId: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ExecutionContext {
  workflow: Workflow;
  skills: Record<string, ExecutableSkill>;
  // MCP client is initialized from MCPServerRegistry
  initializeMCP?: boolean;
}

export interface NodeExecutionResult {
  nodeId: string;
  outputs: Record<string, any>;
  success: boolean;
  error?: string;
  executionTimeMs: number;
}

/**
 * Execute a single node with execution policy enforcement
 */
async function executeNode(
  node: WorkflowNode,
  skill: ExecutableSkill,
  inputs: Record<string, any>
): Promise<NodeExecutionResult> {
  const startTime = performance.now();

  try {
    // Determine execution policy
    let policy: ExecutionPolicy;
    if (!skill.executionPolicy) {
      // Default to standard policy
      policy = DEFAULT_POLICIES.standard;
    } else if (typeof skill.executionPolicy === 'string') {
      // Use named policy
      policy = DEFAULT_POLICIES[skill.executionPolicy] || DEFAULT_POLICIES.standard;
    } else {
      // Use custom policy
      policy = skill.executionPolicy;
    }

    // Create policy enforcer
    const enforcer = new ExecutionPolicyEnforcer(policy);
    enforcer.start();

    // Check MCP access if skill declares MCP servers
    if (skill.mcpServers && skill.mcpServers.length > 0) {
      for (const serverName of skill.mcpServers) {
        const violation = enforcer.checkMCPAccess(serverName);
        if (violation) {
          enforcer.recordViolation(violation);
          throw new Error(violation.message);
        }
      }
    }

    // Create execution context with MCP client and enforcer
    const executionContext = {
      inputs,
      mcp: mcpClient,
      enforcer,
    };

    let result: any;

    switch (skill.type) {
      case 'python-wasm':
      case 'qiskit':
        // Execute via Pyodide with execution context
        result = await executePythonSkill(skill.code, executionContext);
        break;

      case 'javascript':
      case 'threejs':
        // Execute native JavaScript with execution context
        const executeFunc = new Function(
          'context',
          skill.code + '\nreturn execute(context);'
        );
        result = executeFunc(executionContext);
        break;

      case 'spice':
        // TODO: Implement Ngspice.js integration
        throw new Error('SPICE execution not yet implemented');

      default:
        throw new Error(`Unsupported node type: ${skill.type}`);
    }

    // Check time limit after execution
    const timeViolation = enforcer.checkTimeLimit();
    if (timeViolation) {
      enforcer.recordViolation(timeViolation);
      throw new Error(timeViolation.message);
    }

    const executionTimeMs = performance.now() - startTime;

    return {
      nodeId: node.nodeId,
      outputs: result,
      success: true,
      executionTimeMs,
    };
  } catch (error: any) {
    const executionTimeMs = performance.now() - startTime;

    return {
      nodeId: node.nodeId,
      outputs: {},
      success: false,
      error: error.message,
      executionTimeMs,
    };
  }
}

/**
 * Build execution graph (topological sort)
 */
function buildExecutionOrder(context: ExecutionContext): string[][] {
  const { workflow } = context;
  const { nodes, edges } = workflow;

  // Build dependency graph
  const dependents = new Map<string, Set<string>>();
  const dependencies = new Map<string, Set<string>>();

  // Initialize
  nodes.forEach(node => {
    dependencies.set(node.nodeId, new Set());
    dependents.set(node.nodeId, new Set());
  });

  // Build edges
  edges.forEach(edge => {
    dependencies.get(edge.target)?.add(edge.source);
    dependents.get(edge.source)?.add(edge.target);
  });

  // Topological sort (Kahn's algorithm)
  const executionLevels: string[][] = [];
  const processed = new Set<string>();

  while (processed.size < nodes.length) {
    // Find nodes with no unprocessed dependencies
    const level: string[] = [];

    nodes.forEach(node => {
      if (processed.has(node.nodeId)) return;

      const deps = dependencies.get(node.nodeId);
      if (deps && [...deps].every(dep => processed.has(dep))) {
        level.push(node.nodeId);
      }
    });

    if (level.length === 0) {
      throw new Error('Circular dependency detected in workflow');
    }

    executionLevels.push(level);
    level.forEach(nodeId => processed.add(nodeId));
  }

  return executionLevels;
}

/**
 * Execute workflow in the browser
 */
export async function executeWorkflow(
  context: ExecutionContext,
  onNodeStart?: (nodeId: string) => void,
  onNodeComplete?: (result: NodeExecutionResult) => void
): Promise<Record<string, NodeExecutionResult>> {
  console.log('[Workflow] Starting execution...');

  const { workflow, skills, initializeMCP = true } = context;

  // Initialize MCP client with configured servers
  if (initializeMCP) {
    console.log('[Workflow] Initializing MCP servers...');
    const mcpServers = MCPServerRegistry.listServers();
    mcpServers.forEach((config) => {
      mcpClient.registerServer(config);
      console.log(`[Workflow] Registered MCP server: ${config.name}`);
    });
  }

  const executionLevels = buildExecutionOrder(context);

  console.log('[Workflow] Execution order:', executionLevels);

  // Store results by node ID
  const results: Record<string, NodeExecutionResult> = {};

  // Execute level by level
  for (const level of executionLevels) {
    console.log(`[Workflow] Executing level: ${level.join(', ')}`);

    // Execute nodes in this level in parallel
    const levelPromises = level.map(async nodeId => {
      const node = workflow.nodes.find(n => n.nodeId === nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);

      const skill = skills[node.skillId];
      if (!skill) throw new Error(`Skill not found: ${node.skillId}`);

      // Notify start
      if (onNodeStart) onNodeStart(nodeId);

      // Gather inputs
      const inputs: Record<string, any> = { ...node.inputValues };

      // Add inputs from connected edges
      workflow.edges
        .filter(edge => edge.target === nodeId)
        .forEach(edge => {
          const sourceResult = results[edge.source];
          if (sourceResult && sourceResult.outputs[edge.sourceOutput] !== undefined) {
            inputs[edge.targetInput] = sourceResult.outputs[edge.sourceOutput];
          }
        });

      // Execute node
      const result = await executeNode(node, skill, inputs);

      // Notify complete
      if (onNodeComplete) onNodeComplete(result);

      return result;
    });

    const levelResults = await Promise.all(levelPromises);
    levelResults.forEach(result => {
      results[result.nodeId] = result;
    });
  }

  console.log('[Workflow] Execution complete!');
  return results;
}

/**
 * Validate workflow before execution
 */
export function validateWorkflow(context: ExecutionContext): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const { workflow, skills } = context;

  // Check all nodes have valid skills
  workflow.nodes.forEach(node => {
    if (!skills[node.skillId]) {
      errors.push(`Node ${node.nodeId}: Skill ${node.skillId} not found`);
    }
  });

  // Check all edges reference valid nodes
  workflow.edges.forEach(edge => {
    const sourceNode = workflow.nodes.find(n => n.nodeId === edge.source);
    const targetNode = workflow.nodes.find(n => n.nodeId === edge.target);

    if (!sourceNode) {
      errors.push(`Edge ${edge.edgeId}: Source node ${edge.source} not found`);
    }
    if (!targetNode) {
      errors.push(`Edge ${edge.edgeId}: Target node ${edge.target} not found`);
    }
  });

  // Check for circular dependencies (will be caught during execution, but good to check early)
  try {
    buildExecutionOrder(context);
  } catch (error: any) {
    errors.push(error.message);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
