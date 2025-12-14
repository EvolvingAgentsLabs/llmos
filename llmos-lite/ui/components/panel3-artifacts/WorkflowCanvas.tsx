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

interface WorkflowCanvasProps {
  onNodeSelect: (nodeId: string | null) => void;
  selectedNode: string | null;
}

// Custom node component
function SkillNode({ data, selected }: any) {
  return (
    <div
      className={`
        px-4 py-3 rounded border-2 transition-all min-w-[180px]
        ${
          selected
            ? 'border-terminal-accent-green bg-terminal-bg-tertiary shadow-glow-green'
            : 'border-terminal-border bg-terminal-bg-secondary hover:border-terminal-fg-tertiary'
        }
      `}
    >
      <div className="text-sm font-medium text-terminal-fg-primary mb-1">
        {data.label}
      </div>
      <div className="text-xs text-terminal-fg-secondary">
        {data.type}
      </div>
      {data.status && (
        <div className="text-xs mt-1">
          {data.status === 'completed' && (
            <span className="status-success">✓ Done</span>
          )}
          {data.status === 'running' && (
            <span className="status-active">⏸ Running</span>
          )}
          {data.status === 'pending' && (
            <span className="status-pending">⏸ Pending</span>
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
  const [isRunning, setIsRunning] = useState(false);

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

  const handleRun = () => {
    setIsRunning(true);
    // TODO: Integrate with workflow executor
    console.log('Running workflow...');

    // Simulate execution
    setTimeout(() => {
      setIsRunning(false);
      console.log('Workflow complete!');
    }, 3000);
  };

  const handleFit = () => {
    // TODO: Use React Flow's fitView
    console.log('Fitting view...');
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
          disabled={isRunning}
          className="btn-terminal text-xs py-1 px-2"
        >
          {isRunning ? 'Running...' : 'Run Workflow'}
        </button>
      </div>

      {/* Status Display */}
      <div className="absolute bottom-2 left-2 text-xs text-terminal-fg-secondary space-y-0.5 bg-terminal-bg-secondary p-2 rounded border border-terminal-border">
        <div>Nodes: {nodes.length} total</div>
        <div>Edges: {edges.length} connections</div>
        <div>Status: {isRunning ? 'Running...' : 'Ready'}</div>
      </div>
    </div>
  );
}
