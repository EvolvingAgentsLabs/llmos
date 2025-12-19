'use client';

import QuantumCircuitDesigner from '@/components/panel3-artifacts/QuantumCircuitDesigner';

/**
 * Quantum Circuit Designer Page
 *
 * Full-page example of the quantum circuit visual programming environment
 */
export default function QuantumDesignerPage() {
  return (
    <div className="h-screen flex flex-col bg-terminal-bg-primary p-4">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-terminal-accent-green mb-2">
          Quantum Circuit Designer
        </h1>
        <p className="text-sm text-terminal-fg-secondary">
          Visual programming environment for quantum circuits. Enter a natural language
          description to generate a circuit graph, then edit and execute each node.
        </p>
      </div>

      {/* Designer */}
      <div className="flex-1 min-h-0">
        <QuantumCircuitDesigner />
      </div>

      {/* Footer */}
      <div className="mt-4 text-xs text-terminal-fg-tertiary text-center">
        <p>
          Try: "create a quantum circuit to process a cardiac pressure signal and detect
          echoes using two quantum fourier transforms"
        </p>
      </div>
    </div>
  );
}
