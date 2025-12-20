'use client';

import { useState } from 'react';
import { useArtifactStore } from '@/lib/artifacts/store';

interface CanvasViewProps {
  volume: 'system' | 'team' | 'user';
  selectedArtifact: string | null;
  selectedNode?: {
    id: string;
    name: string;
    type: 'volume' | 'folder' | 'file';
    path: string;
    metadata?: {
      fileType?: string;
      readonly?: boolean;
    };
  } | null;
}

type ViewMode = 'code' | 'design';

export default function CanvasView({ volume, selectedArtifact, selectedNode }: CanvasViewProps) {
  const { artifacts } = useArtifactStore();
  const [viewMode, setViewMode] = useState<ViewMode>('code');

  const artifact = selectedArtifact
    ? artifacts.find((a) => a.id === selectedArtifact)
    : null;

  // If no artifact or node selected, show empty state
  if (!artifact && !selectedNode) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-center max-w-md px-8">
          <svg className="w-16 h-16 mx-auto mb-4 text-fg-tertiary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-fg-primary mb-2">No File Selected</h3>
          <p className="text-sm text-fg-secondary">
            Select a file from the explorer to view and edit it here
          </p>
        </div>
      </div>
    );
  }

  // If only node selected (from tree), show it
  if (selectedNode && selectedNode.type === 'file') {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        {/* File header with tabs */}
        <div className="border-b border-border-primary/50 bg-bg-secondary/30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileIcon fileType={selectedNode.metadata?.fileType} fileName={selectedNode.name} />
              <div>
                <h2 className="text-sm font-semibold text-fg-primary">{selectedNode.name}</h2>
                <p className="text-xs text-fg-tertiary">{selectedNode.path}</p>
              </div>
            </div>
            {selectedNode.metadata?.readonly && (
              <span className="text-xs px-2 py-1 rounded bg-bg-elevated text-fg-tertiary">
                Read-only
              </span>
            )}
          </div>

          {/* View mode tabs */}
          <div className="px-4 flex gap-1">
            <button
              onClick={() => setViewMode('code')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                viewMode === 'code'
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-fg-secondary hover:text-fg-primary hover:border-border-primary'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setViewMode('design')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                viewMode === 'design'
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-fg-secondary hover:text-fg-primary hover:border-border-primary'
              }`}
            >
              Design
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'code' ? (
            <CodeView node={selectedNode} />
          ) : (
            <DesignView node={selectedNode} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Artifact header */}
      <div className="px-6 py-4 border-b border-border-primary/50 bg-bg-secondary/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {artifact.type === 'agent' && '🤖'}
            {artifact.type === 'tool' && '🔧'}
            {artifact.type === 'skill' && '⚡'}
            {artifact.type === 'code' && '📄'}
            {artifact.type === 'workflow' && '🔄'}
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-fg-primary">{artifact.name}</h2>
            <p className="text-sm text-fg-secondary">
              {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} • {artifact.volume} volume
            </p>
          </div>
          <span className={`
            px-3 py-1 rounded-full text-xs font-medium
            ${artifact.status === 'committed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
          `}>
            {artifact.status}
          </span>
        </div>
      </div>

      {/* Artifact content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Metadata section */}
          <div className="mb-6 p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <h3 className="text-sm font-semibold text-fg-primary mb-3">Metadata</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-fg-tertiary">ID</dt>
                <dd className="text-fg-secondary font-mono text-xs">{artifact.id}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Type</dt>
                <dd className="text-fg-secondary">{artifact.type}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Volume</dt>
                <dd className="text-fg-secondary">{artifact.volume}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Status</dt>
                <dd className="text-fg-secondary">{artifact.status}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Created</dt>
                <dd className="text-fg-secondary">{new Date(artifact.createdAt).toLocaleString()}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Updated</dt>
                <dd className="text-fg-secondary">{new Date(artifact.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {/* Code View section */}
          {artifact.codeView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Code</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {artifact.codeView}
                </pre>
              </div>
            </div>
          )}

          {/* Render View section */}
          {artifact.renderView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Render Data</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {JSON.stringify(artifact.renderView, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {artifact.dependencies && artifact.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Dependencies</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <ul className="space-y-2">
                  {artifact.dependencies.map((dep, idx) => (
                    <li key={idx} className="text-sm text-fg-secondary flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                      {dep}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tags */}
          {artifact.tags && artifact.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {artifact.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-accent-primary/20 text-accent-primary rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component for file icons
function FileIcon({ fileType, fileName }: { fileType?: string; fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase();

  const getColor = () => {
    if (fileType === 'agent') return '#f97316';
    if (fileType === 'tool') return '#8b5cf6';
    if (fileType === 'skill') return '#eab308';
    if (fileType === 'runtime') return '#10b981';
    if (ext === 'ts') return '#3178c6';
    if (ext === 'js') return '#f1e05a';
    if (ext === 'py') return '#3572A5';
    if (ext === 'md') return '#083fa1';
    return '#858585';
  };

  return (
    <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" style={{ color: getColor() }}>
      <path d="M13.5 2h-11L2 2.5v11l.5.5h11l.5-.5v-11L13.5 2zM13 13H3V3h10v10z" opacity="0.7"/>
      <text x="8" y="11" fontSize="6" textAnchor="middle" fill="currentColor" fontWeight="bold">
        {(ext || 'file').substring(0, 2).toUpperCase()}
      </text>
    </svg>
  );
}

// Code view component
function CodeView({ node }: { node: { id: string; name: string; path: string; metadata?: { fileType?: string } } }) {
  // Mock file content based on file type
  const getFileContent = () => {
    const fileType = node.metadata?.fileType;

    if (fileType === 'agent') {
      return `# ${node.name.replace('.md', '')}

## Description
An AI agent for automated research and information gathering.

## Capabilities
- Web search and content extraction
- Document analysis and summarization
- Multi-source information synthesis
- Citation and reference management

## Usage
\`\`\`python
from agents import ResearchAgent

agent = ResearchAgent()
result = agent.research("quantum computing applications")
print(result.summary)
\`\`\`

## Configuration
- **Model**: Claude 3.5 Sonnet
- **Temperature**: 0.7
- **Max Tokens**: 4096

## Dependencies
- anthropic
- requests
- beautifulsoup4
`;
    }

    if (fileType === 'tool') {
      return `# ${node.name.replace('.md', '')}

## Description
A utility tool for performing calculations and data processing.

## Functions

### calculate(expression: str) -> float
Evaluates mathematical expressions safely.

\`\`\`python
result = calculator.calculate("(2 + 3) * 4")
# Returns: 20.0
\`\`\`

### convert_units(value: float, from_unit: str, to_unit: str) -> float
Converts between different units of measurement.

\`\`\`python
meters = calculator.convert_units(100, "cm", "m")
# Returns: 1.0
\`\`\`

## API
- Endpoint: \`/api/tools/calculator\`
- Method: POST
- Auth: Required
`;
    }

    if (fileType === 'skill') {
      return `# ${node.name.replace('.md', '')}

## Overview
A computational skill for quantum circuit simulation and analysis.

## Parameters
\`\`\`yaml
name: quantum-vqe-node
type: skill
runtime: python
version: 1.0.0
\`\`\`

## Implementation
\`\`\`python
import numpy as np
from qiskit import QuantumCircuit, execute

def quantum_vqe(hamiltonian, ansatz, optimizer):
    """
    Variational Quantum Eigensolver implementation
    """
    def cost_function(params):
        qc = ansatz.bind_parameters(params)
        result = execute(qc, backend).result()
        return calculate_expectation(result, hamiltonian)

    optimal_params = optimizer.minimize(cost_function)
    return optimal_params
\`\`\`

## Inputs
- \`hamiltonian\`: Quantum hamiltonian operator
- \`ansatz\`: Parameterized quantum circuit
- \`optimizer\`: Classical optimization algorithm

## Outputs
- \`energy\`: Ground state energy estimation
- \`state\`: Optimal quantum state
`;
    }

    if (fileType === 'runtime') {
      return `// ${node.name}

import { PyodideInterface } from 'pyodide';

export class PyodideRuntime {
  private pyodide: PyodideInterface | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load Pyodide
    const { loadPyodide } = await import('pyodide');
    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
    });

    // Install base packages
    await this.pyodide.loadPackage(['numpy', 'matplotlib']);

    this.initialized = true;
  }

  async execute(code: string): Promise<{
    output: string;
    error?: string;
    images?: string[];
  }> {
    if (!this.pyodide) throw new Error('Runtime not initialized');

    try {
      const result = await this.pyodide.runPythonAsync(code);
      return { output: String(result) };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
`;
    }

    // Default content
    return `# ${node.name}

This is a placeholder file in the ${node.path} path.

Select a file from the explorer to view its contents here.

## Features
- Syntax highlighting
- Code editing
- File management
- Version control integration

## Status
${node.metadata?.readonly ? '🔒 Read-only' : '✏️ Editable'}
`;
  };

  return (
    <div className="h-full bg-bg-primary">
      <pre className="p-6 text-sm font-mono text-fg-secondary leading-relaxed whitespace-pre-wrap">
        {getFileContent()}
      </pre>
    </div>
  );
}

// Design view component
function DesignView({ node }: { node: { name: string; metadata?: { fileType?: string } } }) {
  const fileType = node.metadata?.fileType;

  return (
    <div className="h-full p-6 bg-bg-primary">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-fg-primary mb-2">Visual Preview</h3>
          <p className="text-sm text-fg-secondary">
            Design view for {node.name}
          </p>
        </div>

        {/* Visual representation based on file type */}
        {fileType === 'agent' && (
          <div className="space-y-4">
            <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 2a1 1 0 011 1v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V6H6a1 1 0 110-2h1V3a1 1 0 011-1z"/>
                    <rect x="3" y="8" width="10" height="5" rx="1" opacity="0.7"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-fg-primary">Agent Node</h4>
                  <p className="text-xs text-fg-tertiary">Autonomous AI Agent</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-fg-tertiary">Input Channels</span>
                  <div className="mt-1 flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>
                <div>
                  <span className="text-fg-tertiary">Output Channels</span>
                  <div className="mt-1 flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {fileType === 'tool' && (
          <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-500" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M11.5 2a2.5 2.5 0 00-2.45 3.01L4.5 9.56a2.5 2.5 0 102.95 2.95l4.55-4.55A2.5 2.5 0 1011.5 2z"/>
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-fg-primary">Tool Function</h4>
                <p className="text-xs text-fg-tertiary">Utility Tool</p>
              </div>
            </div>
            <div className="text-sm text-fg-secondary">
              <p className="mb-2">Available Functions:</p>
              <ul className="space-y-1 ml-4">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                  calculate(expression)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                  convert_units(value, from, to)
                </li>
              </ul>
            </div>
          </div>
        )}

        {fileType === 'skill' && (
          <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-fg-primary">Computational Skill</h4>
                <p className="text-xs text-fg-tertiary">Executable Node</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Runtime</div>
                <div className="text-fg-primary font-medium">Python</div>
              </div>
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Type</div>
                <div className="text-fg-primary font-medium">Quantum</div>
              </div>
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Version</div>
                <div className="text-fg-primary font-medium">1.0.0</div>
              </div>
            </div>
          </div>
        )}

        {!fileType && (
          <div className="p-12 text-center bg-bg-secondary/30 rounded-lg border border-dashed border-border-primary/50">
            <svg className="w-16 h-16 mx-auto mb-4 text-fg-tertiary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-fg-secondary">
              No design preview available for this file type
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
