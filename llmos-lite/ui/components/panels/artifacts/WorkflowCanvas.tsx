'use client';

import { useCallback, useState } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution';

interface WorkflowCanvasProps {
  onNodeSelect: (nodeId: string | null) => void;
  selectedNode: string | null;
}

/**
 * WorkflowCanvas - Interactive workflow editor using React Flow
 *
 * Features:
 * - Drag-drop skills from library to create nodes
 * - Connect nodes to build workflows
 * - Execute workflows via API integration
 * - Real-time status updates during execution
 * - Visual feedback for node states (pending, running, completed, error)
 *
 * Usage:
 * ```tsx
 * const [selectedNode, setSelectedNode] = useState<string | null>(null);
 *
 * <WorkflowCanvas
 *   onNodeSelect={setSelectedNode}
 *   selectedNode={selectedNode}
 * />
 * ```
 *
 * Integration with NodeLibraryPanel:
 * - NodeLibraryPanel sets up drag data via onDragStart
 * - WorkflowCanvas receives drop events via onDrop
 * - New nodes are created at drop position
 * - Nodes can be connected by dragging between handles
 *
 * Workflow Execution:
 * - Click "Run Workflow" to execute via /api/workflows/execute
 * - Nodes show animated borders during execution
 * - Edges animate to show data flow
 * - Status updates in real-time
 */

// Custom node component with status-based styling
function SkillNode({ data, selected }: any) {
  // Determine border color based on status
  const getBorderColor = () => {
    if (selected) return 'border-terminal-accent-green shadow-glow-green';
    if (data.status === 'completed') return 'border-terminal-accent-green';
    if (data.status === 'running') return 'border-terminal-accent-orange';
    if (data.status === 'error') return 'border-terminal-accent-pink';
    return 'border-terminal-border hover:border-terminal-fg-tertiary';
  };

  return (
    <div
      className={`
        px-4 py-3 rounded border-2 transition-all min-w-[180px]
        bg-terminal-bg-secondary
        ${getBorderColor()}
      `}
    >
      <div className="text-sm font-medium text-terminal-fg-primary mb-1">
        {data.label}
      </div>
      <div className="text-xs text-terminal-fg-secondary mb-1">
        {data.type}
      </div>
      {data.status && (
        <div className="text-xs mt-1 flex items-center gap-1">
          {data.status === 'completed' && (
            <span className="text-terminal-accent-green">✓ Completed</span>
          )}
          {data.status === 'running' && (
            <span className="text-terminal-accent-orange animate-pulse">⏵ Running...</span>
          )}
          {data.status === 'pending' && (
            <span className="text-terminal-fg-tertiary">○ Pending</span>
          )}
          {data.status === 'error' && (
            <span className="text-terminal-accent-pink">✗ Error</span>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = {
  skillNode: SkillNode,
};

// Initial workflow nodes (example VQE workflow)
const initialNodes: Node[] = [
  {
    id: 'hamiltonian',
    type: 'skillNode',
    position: { x: 250, y: 50 },
    data: {
      label: 'Hamiltonian Node',
      type: 'python-wasm',
      status: 'completed',
    },
  },
  {
    id: 'vqe-node',
    type: 'skillNode',
    position: { x: 250, y: 180 },
    data: {
      label: 'VQE Node',
      type: 'qiskit',
      status: 'running',
    },
  },
  {
    id: 'plot-node',
    type: 'skillNode',
    position: { x: 250, y: 310 },
    data: {
      label: 'Plot Node',
      type: 'javascript',
      status: 'pending',
    },
  },
  {
    id: 'export-node',
    type: 'skillNode',
    position: { x: 250, y: 440 },
    data: {
      label: 'Export Node',
      type: 'javascript',
      status: 'pending',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: 'hamiltonian',
    target: 'vqe-node',
    animated: true,
    style: { stroke: '#00ff88' },
  },
  {
    id: 'e2-3',
    source: 'vqe-node',
    target: 'plot-node',
    animated: false,
    style: { stroke: '#666' },
  },
  {
    id: 'e3-4',
    source: 'plot-node',
    target: 'export-node',
    animated: false,
    style: { stroke: '#666' },
  },
];

export default function WorkflowCanvas({
  onNodeSelect,
  selectedNode,
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Use workflow execution hook
  const { executeWorkflow, isExecuting } = useWorkflowExecution({
    onSuccess: (result) => {
      console.log('[WorkflowCanvas] Execution completed:', result);

      // Mark all nodes as completed
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, status: 'completed' },
        }))
      );

      // Update edges to show completion
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          animated: false,
          style: { stroke: '#00ff88' },
        }))
      );
    },
    onError: (error) => {
      console.error('[WorkflowCanvas] Execution failed:', error);
      alert(`Execution failed: ${error.message}`);

      // Mark nodes as failed
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, status: 'error' },
        }))
      );
    },
  });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Handle drag-drop from library
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const skillData = event.dataTransfer.getData('application/reactflow');
      if (!skillData) return;

      try {
        const skill = JSON.parse(skillData);

        // Get the position where the skill was dropped
        const position = reactFlowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Create a new node
        const newNode: Node = {
          id: `${skill.id}-${Date.now()}`,
          type: 'skillNode',
          position,
          data: {
            label: skill.name,
            type: skill.type,
            skillId: skill.id,
            status: 'pending',
            description: skill.description,
          },
        };

        setNodes((nds) => nds.concat(newNode));
      } catch (error) {
        console.error('Error dropping skill:', error);
      }
    },
    [reactFlowInstance, setNodes]
  );

  const handleRun = async () => {
    // Mark nodes as running
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, status: 'running' },
      }))
    );

    // Animate edges during execution
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        animated: true,
        style: { stroke: '#ffaa00' },
      }))
    );

    // Execute workflow using the hook
    await executeWorkflow(nodes, edges);
  };

  const handleFit = () => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
    }
  };

  return (
    <div className="h-full bg-terminal-bg-primary border border-terminal-border rounded relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        fitView
        className="bg-terminal-bg-primary"
      >
        <Controls className="bg-terminal-bg-secondary border border-terminal-border" />
        <MiniMap
          className="bg-terminal-bg-secondary border border-terminal-border"
          nodeColor={(node) => {
            if (node.id === selectedNode) return '#00ff88';
            if (node.data?.status === 'completed') return '#00ff88';
            if (node.data?.status === 'running') return '#ffaa00';
            return '#666';
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#333" />
      </ReactFlow>

      {/* Execution Controls */}
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        <button
          onClick={handleFit}
          className="btn-terminal-secondary text-xs py-1 px-2"
        >
          Fit View
        </button>
        <button
          onClick={handleRun}
          disabled={isExecuting}
          className="btn-terminal text-xs py-1 px-2"
        >
          {isExecuting ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {/* Status Display */}
      <div className="absolute bottom-2 left-2 text-xs text-terminal-fg-secondary space-y-0.5 bg-terminal-bg-secondary p-2 rounded border border-terminal-border">
        <div>Nodes: {nodes.length} total</div>
        <div>Edges: {edges.length} connections</div>
        <div>Status: {isExecuting ? 'Running...' : 'Ready'}</div>
      </div>
    </div>
  );
}
