'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play, Code, Bug, AlertCircle } from 'lucide-react';

/**
 * Quantum Circuit Node Component
 *
 * Visual node with:
 * - Code preview
 * - Execution status
 * - Input/output handles
 * - Action buttons
 */

export interface QuantumNodeData {
  label: string;
  type: string;
  code: string;
  description: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: any;
  error?: string;
  executionTime?: number;
}

function QuantumNode({ data, selected }: NodeProps<QuantumNodeData>) {
  // Status-based styling
  const getStatusColor = () => {
    switch (data.status) {
      case 'completed':
        return 'border-terminal-accent-green bg-terminal-bg-secondary';
      case 'running':
        return 'border-terminal-accent-orange bg-terminal-bg-secondary animate-pulse';
      case 'error':
        return 'border-terminal-accent-pink bg-terminal-bg-secondary';
      default:
        return 'border-terminal-border bg-terminal-bg-secondary hover:border-terminal-fg-tertiary';
    }
  };

  const getStatusIcon = () => {
    switch (data.status) {
      case 'completed':
        return <span className="text-terminal-accent-green">✓</span>;
      case 'running':
        return <span className="text-terminal-accent-orange">⏵</span>;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-terminal-accent-pink" />;
      default:
        return <span className="text-terminal-fg-tertiary">○</span>;
    }
  };

  return (
    <div
      className={`
        rounded border-2 transition-all min-w-[280px] max-w-[400px]
        ${getStatusColor()}
        ${selected ? 'shadow-glow-green ring-2 ring-terminal-accent-green' : ''}
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-terminal-accent-blue !border-2 !border-terminal-bg-primary"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-terminal-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <h3 className="text-sm font-medium text-terminal-fg-primary">
              {data.label}
            </h3>
          </div>
          <span className="text-xs text-terminal-fg-tertiary bg-terminal-bg-primary px-2 py-0.5 rounded">
            {data.type}
          </span>
        </div>
        <p className="text-xs text-terminal-fg-secondary mt-1">
          {data.description}
        </p>
      </div>

      {/* Inputs Section */}
      {data.inputs && data.inputs.length > 0 && (
        <div className="px-4 py-2 border-b border-terminal-border bg-terminal-bg-primary/30">
          <div className="text-xs font-medium text-terminal-accent-blue mb-1">
            INPUTS
          </div>
          <div className="space-y-1">
            {data.inputs.map((input, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-terminal-fg-secondary">{input.name}</span>
                <span className="text-terminal-fg-tertiary font-mono">{input.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview */}
      <div className="px-4 py-2 border-b border-terminal-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-terminal-accent-green">CODE</span>
          <Code className="w-3 h-3 text-terminal-fg-tertiary" />
        </div>
        <pre className="text-xs font-mono text-terminal-fg-secondary bg-terminal-bg-primary rounded p-2 overflow-hidden">
          <code className="line-clamp-3">{data.code}</code>
        </pre>
      </div>

      {/* Outputs Section */}
      {data.outputs && data.outputs.length > 0 && (
        <div className="px-4 py-2 border-b border-terminal-border bg-terminal-bg-primary/30">
          <div className="text-xs font-medium text-terminal-accent-yellow mb-1">
            OUTPUTS
          </div>
          <div className="space-y-1">
            {data.outputs.map((output, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-terminal-fg-secondary">{output.name}</span>
                <span className="text-terminal-fg-tertiary font-mono">{output.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Info */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          {data.status === 'completed' && data.executionTime && (
            <span className="text-terminal-accent-green">
              ✓ {data.executionTime.toFixed(0)}ms
            </span>
          )}
          {data.status === 'running' && (
            <span className="text-terminal-accent-orange animate-pulse">
              ⏵ Executing...
            </span>
          )}
          {data.status === 'error' && data.error && (
            <span className="text-terminal-accent-pink">
              ✗ {data.error.slice(0, 40)}...
            </span>
          )}
          {data.status === 'pending' && (
            <span className="text-terminal-fg-tertiary">
              ○ Ready
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-2 border-t border-terminal-border flex gap-2">
        <button
          className="flex-1 btn-terminal-secondary text-xs py-1 flex items-center justify-center gap-1"
          title="Run this node"
        >
          <Play className="w-3 h-3" />
          Run
        </button>
        <button
          className="flex-1 btn-terminal-secondary text-xs py-1 flex items-center justify-center gap-1"
          title="Debug this node"
        >
          <Bug className="w-3 h-3" />
          Debug
        </button>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-terminal-accent-yellow !border-2 !border-terminal-bg-primary"
      />
    </div>
  );
}

export default memo(QuantumNode);
