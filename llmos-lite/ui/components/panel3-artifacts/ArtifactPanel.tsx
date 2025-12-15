'use client';

import { useState } from 'react';
import WorkflowGraphPlaceholder from './WorkflowGraphPlaceholder';
import NodeEditor from './NodeEditor';

interface ArtifactPanelProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

export default function ArtifactPanel({ activeSession, activeVolume }: ArtifactPanelProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>('vqe-node');
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className={`h-full flex flex-col bg-terminal-bg-secondary ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Workflow Graph */}
      <div className={`${isFullscreen ? 'h-full' : 'h-1/2'} border-b border-terminal-border`}>
        <div className="p-4 border-b border-terminal-border flex items-center justify-between">
          <h2 className="terminal-heading text-xs">WORKFLOW GRAPH</h2>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn-touch-icon md:text-xs md:px-2 md:py-1 md:min-w-0 md:min-h-0"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>
        </div>
        <div className="h-[calc(100%-3rem)] p-4">
          <WorkflowGraphPlaceholder onNodeSelect={setSelectedNode} selectedNode={selectedNode} />
        </div>
      </div>

      {/* Node Detail - Hidden in fullscreen */}
      {!isFullscreen && (
        <div className="h-1/2 overflow-auto">
          <div className="p-4 border-b border-terminal-border">
            <h2 className="terminal-heading text-xs">NODE DETAIL</h2>
          </div>
          <div className="p-4">
            <NodeEditor selectedNode={selectedNode} />
          </div>
        </div>
      )}
    </div>
  );
}
