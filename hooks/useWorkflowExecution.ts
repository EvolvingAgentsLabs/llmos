import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface WorkflowExecutionResult {
  status: string;
  payload?: any;
  execution_mode?: string;
}

interface UseWorkflowExecutionOptions {
  userId?: string;
  teamId?: string;
  onSuccess?: (result: WorkflowExecutionResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for executing workflows via the API
 *
 * Features:
 * - Prepares workflow data from React Flow state
 * - Calls /api/workflows/execute endpoint
 * - Handles loading states and errors
 * - Returns execution results
 *
 * Usage:
 * ```tsx
 * const { executeWorkflow, isExecuting } = useWorkflowExecution({
 *   userId: 'user-123',
 *   onSuccess: (result) => console.log('Done!', result)
 * });
 *
 * await executeWorkflow(nodes, edges);
 * ```
 */
export function useWorkflowExecution({
  userId = 'demo-user',
  teamId = 'demo-team',
  onSuccess,
  onError,
}: UseWorkflowExecutionOptions = {}) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<WorkflowExecutionResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const executeWorkflow = useCallback(
    async (nodes: Node[], edges: Edge[]) => {
      setIsExecuting(true);
      setError(null);
      setResult(null);

      try {
        // Prepare workflow data
        const workflowData = {
          user_id: userId,
          team_id: teamId,
          workflow_id: `workflow-${Date.now()}`,
          nodes: nodes.map((node) => ({
            nodeId: node.id,
            skillId: node.data.skillId || node.id,
            position: node.position,
            inputValues: node.data.inputValues || {},
          })),
          edges: edges.map((edge) => ({
            edgeId: edge.id,
            source: edge.source,
            sourceOutput: edge.sourceHandle || 'output',
            target: edge.target,
            targetInput: edge.targetHandle || 'input',
          })),
        };

        console.log('[Workflow] Executing:', workflowData);

        // Call execution API
        const response = await fetch('/api/workflows/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(workflowData),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Workflow execution failed: ${response.statusText} - ${errorText}`);
        }

        const executionResult = await response.json();
        console.log('[Workflow] Execution result:', executionResult);

        setResult(executionResult);
        onSuccess?.(executionResult);

        return executionResult;
      } catch (err) {
        const execError = err instanceof Error ? err : new Error('Unknown execution error');
        console.error('[Workflow] Execution error:', execError);
        setError(execError);
        onError?.(execError);
        throw execError;
      } finally {
        setIsExecuting(false);
      }
    },
    [userId, teamId, onSuccess, onError]
  );

  return {
    executeWorkflow,
    isExecuting,
    result,
    error,
  };
}
