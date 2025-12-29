'use client';

interface WorkflowGraphPlaceholderProps {
  onNodeSelect: (nodeId: string) => void;
  selectedNode: string | null;
}

export default function WorkflowGraphPlaceholder({
  onNodeSelect,
  selectedNode,
}: WorkflowGraphPlaceholderProps) {
  const nodes = [
    { id: 'hamiltonian', label: 'Hamiltonian Node', status: 'completed', y: 20 },
    { id: 'vqe-node', label: 'VQE Node', status: 'running', y: 120 },
    { id: 'plot-node', label: 'Plot Node', status: 'pending', y: 220 },
    { id: 'export-node', label: 'Export Node', status: 'pending', y: 320 },
  ];

  return (
    <div className="h-full bg-terminal-bg-primary border border-terminal-border rounded p-4 relative">
      <div className="flex flex-col items-center justify-start h-full">
        {nodes.map((node, index) => (
          <div key={node.id} className="flex flex-col items-center">
            {/* Node */}
            <div
              onClick={() => onNodeSelect(node.id)}
              className={`
                w-40 p-3 rounded border cursor-pointer transition-all
                ${selectedNode === node.id
                  ? 'border-terminal-accent-green bg-terminal-bg-tertiary shadow-glow-green'
                  : 'border-terminal-border bg-terminal-bg-secondary hover:border-terminal-fg-tertiary'
                }
              `}
            >
              <div className="text-sm font-medium text-terminal-fg-primary mb-1">
                {node.label}
              </div>
              <div className="text-xs flex items-center gap-1">
                {node.status === 'completed' && (
                  <span className="status-success">✓ Completed</span>
                )}
                {node.status === 'running' && (
                  <span className="status-active">⏸ Running</span>
                )}
                {node.status === 'pending' && (
                  <span className="status-pending">⏸ Pending</span>
                )}
              </div>
            </div>

            {/* Arrow */}
            {index < nodes.length - 1 && (
              <div className="h-8 flex items-center">
                <div className="w-0.5 h-full bg-terminal-accent-green" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute top-2 right-2 flex gap-2">
        <button className="btn-terminal-secondary text-xs py-1 px-2">
          Fit
        </button>
        <button className="btn-terminal text-xs py-1 px-2">
          Run
        </button>
      </div>

      {/* Status */}
      <div className="absolute bottom-2 left-2 text-xs text-terminal-fg-secondary space-y-0.5">
        <div>Nodes: 4 total, 1 done, 1 running</div>
        <div>Execution: 45% complete</div>
        <div>Runtime: 2.3s</div>
      </div>
    </div>
  );
}
