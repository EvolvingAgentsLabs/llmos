/**
 * Parallel Tool Executor
 *
 * Executes independent tool calls concurrently to improve performance.
 * Analyzes tool call dependencies and batches independent operations.
 *
 * Key features:
 * - Dependency analysis between tool calls
 * - Concurrent execution of independent tools
 * - Progress tracking and cancellation
 * - Error isolation (one failure doesn't stop others)
 */

import { executeSystemTool } from '../system-tools';

// =============================================================================
// Types
// =============================================================================

export interface ToolCall {
  id: string;
  toolId: string;
  toolName: string;
  inputs: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  toolId: string;
  toolName: string;
  inputs: Record<string, unknown>;
  output?: unknown;
  success: boolean;
  error?: string;
  duration: number;
}

export interface ExecutionBatch {
  tools: ToolCall[];
  dependencies: string[]; // IDs of previous batches this depends on
}

export interface ParallelExecutionResult {
  results: ToolResult[];
  totalDuration: number;
  parallelSpeedup: number; // Ratio of sequential vs parallel time
  batchCount: number;
  errors: string[];
}

export interface ExecutionProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  activeTool?: string;
}

export type ProgressCallback = (progress: ExecutionProgress) => void;
export type ToolResultCallback = (result: ToolResult) => void;

// =============================================================================
// Dependency Analysis
// =============================================================================

/**
 * Analyze dependencies between tool calls
 * Returns groups of tools that can be executed in parallel
 */
export function analyzeToolDependencies(tools: ToolCall[]): ExecutionBatch[] {
  const batches: ExecutionBatch[] = [];

  // Track which paths have been written to
  const writtenPaths = new Set<string>();

  // Track file system state dependencies
  const fileSystemTools = new Set(['write-file', 'read-file', 'delete-file', 'create-directory']);

  // First pass: identify file operations and their dependencies
  const toolDeps = new Map<string, Set<string>>();

  for (const tool of tools) {
    const deps = new Set<string>();

    // Check if this tool depends on previous writes
    if (tool.toolId === 'read-file' && tool.inputs.path) {
      const path = tool.inputs.path as string;
      // Depends on any previous write to this path
      for (const [otherId, otherTool] of tools.entries()) {
        const t = tools[otherId];
        if (t.id !== tool.id &&
            t.toolId === 'write-file' &&
            t.inputs.path === path) {
          deps.add(t.id);
        }
      }
    }

    // Write operations depend on previous writes to same path
    if (tool.toolId === 'write-file' && tool.inputs.path) {
      const path = tool.inputs.path as string;
      for (const [otherId, otherTool] of tools.entries()) {
        const t = tools[otherId];
        if (t.id !== tool.id &&
            t.toolId === 'write-file' &&
            t.inputs.path === path &&
            tools.indexOf(t) < tools.indexOf(tool)) {
          deps.add(t.id);
        }
      }
    }

    // Python execution might depend on files being written first
    if (tool.toolId === 'execute-python') {
      const code = tool.inputs.code as string || '';
      // Check if code references any files that are being written
      for (const t of tools) {
        if (t.toolId === 'write-file' && t.inputs.path) {
          const path = t.inputs.path as string;
          if (code.includes(path) || code.includes(path.replace(/^\//, ''))) {
            deps.add(t.id);
          }
        }
      }
    }

    toolDeps.set(tool.id, deps);
  }

  // Group tools into batches based on dependencies
  const assigned = new Set<string>();
  let remainingTools = [...tools];

  while (remainingTools.length > 0) {
    const batch: ToolCall[] = [];
    const batchDeps: string[] = [];

    for (const tool of remainingTools) {
      const deps = toolDeps.get(tool.id) || new Set();

      // Check if all dependencies are in previous batches
      const unmetDeps = [...deps].filter(d => !assigned.has(d));

      if (unmetDeps.length === 0) {
        batch.push(tool);
        batchDeps.push(...deps);
      }
    }

    if (batch.length === 0) {
      // Circular dependency or unresolvable - just add remaining tools
      batch.push(...remainingTools);
      remainingTools = [];
    } else {
      // Remove batched tools from remaining
      const batchIds = new Set(batch.map(t => t.id));
      remainingTools = remainingTools.filter(t => !batchIds.has(t.id));
    }

    // Mark tools as assigned
    batch.forEach(t => assigned.add(t.id));

    batches.push({
      tools: batch,
      dependencies: [...new Set(batchDeps)],
    });
  }

  return batches;
}

// =============================================================================
// Parallel Execution
// =============================================================================

/**
 * Execute tools in parallel where possible
 */
export async function executeToolsParallel(
  tools: ToolCall[],
  options: {
    maxConcurrency?: number;
    onProgress?: ProgressCallback;
    onResult?: ToolResultCallback;
    abortSignal?: AbortSignal;
  } = {}
): Promise<ParallelExecutionResult> {
  const {
    maxConcurrency = 5,
    onProgress,
    onResult,
    abortSignal,
  } = options;

  const startTime = performance.now();
  const results: ToolResult[] = [];
  const errors: string[] = [];

  // Analyze dependencies and create batches
  const batches = analyzeToolDependencies(tools);

  let completed = 0;
  let sequentialTime = 0;

  // Execute batches sequentially, tools within batch in parallel
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (abortSignal?.aborted) {
      errors.push('Execution aborted');
      break;
    }

    const batch = batches[batchIndex];

    // Report progress
    onProgress?.({
      completed,
      total: tools.length,
      currentBatch: batchIndex + 1,
      totalBatches: batches.length,
    });

    // Execute tools in this batch concurrently (with concurrency limit)
    const batchResults = await executeToolBatch(
      batch.tools,
      maxConcurrency,
      (result) => {
        completed++;
        results.push(result);
        sequentialTime += result.duration;

        if (!result.success && result.error) {
          errors.push(`${result.toolName}: ${result.error}`);
        }

        onResult?.(result);

        onProgress?.({
          completed,
          total: tools.length,
          currentBatch: batchIndex + 1,
          totalBatches: batches.length,
          activeTool: result.toolName,
        });
      },
      abortSignal
    );
  }

  const totalDuration = performance.now() - startTime;
  const parallelSpeedup = sequentialTime > 0 ? sequentialTime / totalDuration : 1;

  return {
    results,
    totalDuration,
    parallelSpeedup,
    batchCount: batches.length,
    errors,
  };
}

/**
 * Execute a batch of tools with concurrency limit
 */
async function executeToolBatch(
  tools: ToolCall[],
  maxConcurrency: number,
  onResult: (result: ToolResult) => void,
  abortSignal?: AbortSignal
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  // Process tools in chunks based on concurrency limit
  for (let i = 0; i < tools.length; i += maxConcurrency) {
    if (abortSignal?.aborted) break;

    const chunk = tools.slice(i, i + maxConcurrency);

    const chunkResults = await Promise.all(
      chunk.map(tool => executeSingleTool(tool, abortSignal))
    );

    for (const result of chunkResults) {
      results.push(result);
      onResult(result);
    }
  }

  return results;
}

/**
 * Execute a single tool call with timing
 */
async function executeSingleTool(
  tool: ToolCall,
  abortSignal?: AbortSignal
): Promise<ToolResult> {
  const startTime = performance.now();

  try {
    if (abortSignal?.aborted) {
      throw new Error('Execution aborted');
    }

    const output = await executeSystemTool(tool.toolId, tool.inputs);
    const duration = performance.now() - startTime;

    return {
      id: tool.id,
      toolId: tool.toolId,
      toolName: tool.toolName,
      inputs: tool.inputs,
      output,
      success: true,
      duration,
    };
  } catch (error) {
    const duration = performance.now() - startTime;

    return {
      id: tool.id,
      toolId: tool.toolId,
      toolName: tool.toolName,
      inputs: tool.inputs,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if tools can be executed in parallel
 */
export function canExecuteInParallel(tools: ToolCall[]): boolean {
  const batches = analyzeToolDependencies(tools);
  return batches.length < tools.length;
}

/**
 * Estimate parallel execution time vs sequential
 */
export function estimateParallelSpeedup(tools: ToolCall[]): {
  estimatedSpeedup: number;
  batchCount: number;
  parallelizableRatio: number;
} {
  const batches = analyzeToolDependencies(tools);

  // Assuming equal tool execution time, speedup is tools/batches
  const estimatedSpeedup = tools.length / batches.length;
  const parallelizableRatio = 1 - (batches.length / tools.length);

  return {
    estimatedSpeedup,
    batchCount: batches.length,
    parallelizableRatio,
  };
}

// =============================================================================
// Export
// =============================================================================

export const parallelToolExecutor = {
  execute: executeToolsParallel,
  analyzeDependencies: analyzeToolDependencies,
  canParallelize: canExecuteInParallel,
  estimateSpeedup: estimateParallelSpeedup,
};
