'use client';

interface NodeEditorProps {
  selectedNode: string | null;
}

interface NodeData {
  id: string;
  name: string;
  type: string;
  skill?: string;
  status: string;
  inputs: Array<{ name: string; type: string; value: string }>;
  outputs: Array<{ name: string; type: string; value: string }>;
  code: string;
  logs: string[];
}

export default function NodeEditor({ selectedNode }: NodeEditorProps) {
  const nodeData: Record<string, NodeData> = {
    'vqe-node': {
      id: 'vqe-node-1',
      name: 'VQE Node',
      type: 'python-wasm',
      skill: 'quantum-vqe-node.md',
      status: 'running',
      inputs: [
        { name: 'iterations', type: 'number', value: '100' },
        { name: 'ansatz_type', type: 'string', value: 'UCCSD' },
        { name: 'hamiltonian', type: 'object', value: '[from input]' },
      ],
      outputs: [
        { name: 'eigenvalue', type: 'number', value: '-1.137' },
        { name: 'convergence', type: 'array', value: '[View Array]' },
      ],
      code: `def execute(inputs):
    # VQE optimization
    hamiltonian = inputs['hamiltonian']
    iterations = inputs['iterations']

    # Run VQE
    result = vqe_optimize(...)

    return {
        "eigenvalue": result.eigenvalue,
        "convergence": result.convergence
    }`,
      logs: [
        '[14:05:23] Starting VQE...',
        '[14:05:25] Iteration 50/100...',
        '[14:05:27] Converged!',
        '[14:05:27] Eigenvalue: -1.137',
      ],
    },
    'hamiltonian': {
      id: 'hamiltonian-1',
      name: 'Hamiltonian Node',
      type: 'python-wasm',
      status: 'completed',
      inputs: [
        { name: 'molecule', type: 'string', value: 'H2' },
      ],
      outputs: [
        { name: 'hamiltonian', type: 'object', value: '<Hamiltonian>' },
      ],
      code: `def execute(inputs):
    molecule = inputs['molecule']
    return {"hamiltonian": create_hamiltonian(molecule)}`,
      logs: ['[14:05:20] Created Hamiltonian for H2'],
    },
  };

  const node = selectedNode ? nodeData[selectedNode as keyof typeof nodeData] : null;

  if (!node) {
    return (
      <div className="text-terminal-fg-tertiary text-sm">
        Select a node to view details
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-terminal-accent-green mb-1">
          {node.name}
        </h3>
        <div className="text-xs text-terminal-fg-secondary space-y-0.5">
          <div>Node ID: {node.id}</div>
          <div>Type: {node.type}</div>
          {node.skill && <div>Skill: {node.skill}</div>}
        </div>
      </div>

      {/* Inputs */}
      <div>
        <h4 className="terminal-heading text-xs mb-2">INPUTS</h4>
        <div className="space-y-2">
          {node.inputs.map((input, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-xs text-terminal-fg-secondary w-24">
                {input.name}:
              </span>
              <input
                type="text"
                value={input.value}
                className="terminal-input text-xs flex-1 py-1 px-2"
                readOnly
              />
              <span className="text-xs text-terminal-fg-tertiary">
                {input.type}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Outputs */}
      {node.outputs && (
        <div>
          <h4 className="terminal-heading text-xs mb-2">OUTPUTS</h4>
          <div className="space-y-2">
            {node.outputs.map((output, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-terminal-fg-secondary w-24">
                  {output.name}:
                </span>
                <div className="terminal-input text-xs flex-1 py-1 px-2 bg-terminal-bg-primary">
                  {output.value}
                </div>
                <span className="text-xs text-terminal-fg-tertiary">
                  {output.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview */}
      <div>
        <h4 className="terminal-heading text-xs mb-2">CODE PREVIEW</h4>
        <pre className="code-block text-xs overflow-x-auto">
          <code className="text-terminal-accent-blue">{node.code}</code>
        </pre>
        <div className="flex gap-2 mt-2">
          <button className="btn-terminal text-xs py-1 px-2">
            Edit Code
          </button>
          <button className="btn-terminal-secondary text-xs py-1 px-2">
            Test Run
          </button>
        </div>
      </div>

      {/* Execution Status */}
      {node.status && (
        <div>
          <h4 className="terminal-heading text-xs mb-2">EXECUTION STATUS</h4>
          <div className="space-y-2">
            <div className="text-xs flex items-center gap-2">
              <span className="text-terminal-fg-secondary">Status:</span>
              {node.status === 'completed' && (
                <span className="status-success">✓ Completed</span>
              )}
              {node.status === 'running' && (
                <span className="status-active">⏸ Running</span>
              )}
            </div>
            {node.logs && (
              <div className="code-block text-xs space-y-0.5">
                {node.logs.map((log, index) => (
                  <div key={index} className="text-terminal-fg-secondary">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
