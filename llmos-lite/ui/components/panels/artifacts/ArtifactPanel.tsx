'use client';

import { useState, useCallback, useEffect } from 'react';
import WorkflowCanvas from './WorkflowCanvas';
import NodeLibraryPanel from './NodeLibraryPanel';
import NodeEditor from './NodeEditor';
import ArtifactGallery from './ArtifactGallery';
import { ArtifactData } from './ArtifactViewer';
import { QuantumCircuit } from './CircuitRenderer';
import { ThreeScene } from './ThreeRenderer';
import { PlotData } from './PlotRenderer';
import QuantumCircuitDesigner from './QuantumCircuitDesigner';
import { useArtifactStore } from '@/lib/artifacts/store';
import { Artifact } from '@/lib/artifacts/types';
import { PanelErrorBoundary } from '@/components/shared/ErrorBoundary';

interface ArtifactPanelProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

type ViewTab = 'workflow' | 'artifacts' | 'library' | 'quantum-designer';

// Convert Artifact from store to ArtifactData for gallery
function convertToArtifactData(artifact: Artifact): ArtifactData & { id: string; name?: string } {
  // Map artifact types to gallery-compatible types
  if (artifact.renderView) {
    return {
      id: artifact.id,
      name: artifact.name,
      type: artifact.renderView.type as ArtifactData['type'],
      data: artifact.renderView.data,
    };
  }

  // For code artifacts without render view
  if (artifact.type === 'code' && artifact.codeView) {
    return {
      id: artifact.id,
      name: artifact.name,
      type: 'code',
      data: {
        language: 'python',
        code: artifact.codeView,
        title: artifact.name,
        executable: true,
      },
    };
  }

  // Default fallback
  return {
    id: artifact.id,
    name: artifact.name,
    type: 'code',
    data: {
      language: 'plaintext',
      code: artifact.codeView || '// No content',
      title: artifact.name,
    },
  };
}

export default function ArtifactPanel({ activeSession, activeVolume }: ArtifactPanelProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('workflow');
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);

  // Use artifact store
  const {
    artifacts: storeArtifacts,
    initialized,
    initialize,
    deleteArtifact,
    updateArtifact,
    getByVolume,
  } = useArtifactStore();

  // Initialize store on mount
  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  // Sample artifacts for demonstration (fallback when store is empty)
  const [sampleArtifacts] = useState<Array<ArtifactData & { id: string; name?: string }>>([
    {
      id: 'bell-circuit',
      name: 'Bell State Preparation',
      type: 'quantum-circuit',
      data: {
        type: 'quantum-circuit',
        title: 'Bell State Preparation',
        numQubits: 2,
        gates: [
          { type: 'H', target: 0, time: 0 },
          { type: 'CNOT', target: 1, control: 0, time: 1 },
        ],
        measurements: [0, 1],
      } as QuantumCircuit,
    },
    {
      id: 'vqe-convergence',
      name: 'VQE Convergence',
      type: 'plot',
      data: {
        type: 'line',
        title: 'VQE Convergence',
        data: [
          { iteration: 0, energy: -0.5 },
          { iteration: 10, energy: -0.8 },
          { iteration: 20, energy: -0.95 },
          { iteration: 30, energy: -1.05 },
          { iteration: 40, energy: -1.12 },
          { iteration: 50, energy: -1.137 },
        ],
        xKey: 'iteration',
        yKey: 'energy',
        color: '#00ff88',
      } as PlotData,
    },
    {
      id: 'molecule-viz',
      name: 'H2 Molecule Visualization',
      type: '3d-scene',
      data: {
        type: '3d-scene',
        title: 'H2 Molecule Visualization',
        objects: [
          {
            type: 'sphere',
            position: [-0.7, 0, 0],
            scale: [0.5, 0.5, 0.5],
            color: '#ffffff',
          },
          {
            type: 'sphere',
            position: [0.7, 0, 0],
            scale: [0.5, 0.5, 0.5],
            color: '#ffffff',
          },
          {
            type: 'cube',
            position: [0, 0, 0],
            scale: [1.4, 0.1, 0.1],
            color: '#00ff88',
            wireframe: true,
          },
        ],
        camera: {
          position: [3, 2, 3],
          lookAt: [0, 0, 0],
        },
      } as ThreeScene,
    },
  ]);

  // Combine store artifacts with samples (store takes precedence)
  const allArtifacts = storeArtifacts.length > 0
    ? storeArtifacts.map(convertToArtifactData)
    : sampleArtifacts;

  // Handle delete artifact
  const handleDeleteArtifact = useCallback((id: string) => {
    // Check if it's a sample artifact
    const isSample = sampleArtifacts.some(a => a.id === id);
    if (isSample) {
      // For sample artifacts, we can't delete them from the store
      console.log('Sample artifact cannot be deleted');
      return;
    }

    // Delete from store
    const deleted = deleteArtifact(id);
    if (deleted) {
      console.log('Artifact deleted:', id);
      if (editingArtifactId === id) {
        setEditingArtifactId(null);
      }
    }
  }, [deleteArtifact, sampleArtifacts, editingArtifactId]);

  // Handle edit artifact
  const handleEditArtifact = useCallback((id: string) => {
    setEditingArtifactId(id);
    // Switch to artifacts tab to show the editor
    setActiveTab('artifacts');
  }, []);

  // Handle save artifact
  const handleSaveArtifact = useCallback((id: string, newCode: string) => {
    const updated = updateArtifact(id, { codeView: newCode });
    if (updated) {
      console.log('Artifact saved:', id);
    }
  }, [updateArtifact]);

  return (
    <PanelErrorBoundary panelName="Artifact Panel">
      <div className={`h-full flex ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
        {/* Left: Node Library (collapsible) */}
        {!isFullscreen && (
          <div className="hidden lg:block w-64 border-r border-terminal-border bg-terminal-bg-secondary">
            <PanelErrorBoundary panelName="Node Library">
              <NodeLibraryPanel />
            </PanelErrorBoundary>
          </div>
        )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-terminal-bg-secondary">
        {/* Tab Navigation */}
        <div className="border-b border-terminal-border bg-terminal-bg-primary">
          <div className="flex items-center justify-between p-3">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('workflow')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeTab === 'workflow'
                    ? 'bg-terminal-accent-green text-terminal-bg-primary'
                    : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
                }`}
              >
                🔗 Workflow
              </button>
              <button
                onClick={() => setActiveTab('artifacts')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeTab === 'artifacts'
                    ? 'bg-terminal-accent-green text-terminal-bg-primary'
                    : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
                }`}
              >
                📦 Artifacts ({allArtifacts.length})
              </button>
              <button
                onClick={() => setActiveTab('library')}
                className={`px-3 py-1 text-xs rounded transition-colors lg:hidden ${
                  activeTab === 'library'
                    ? 'bg-terminal-accent-green text-terminal-bg-primary'
                    : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
                }`}
              >
                📚 Library
              </button>
              <button
                onClick={() => setActiveTab('quantum-designer')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  activeTab === 'quantum-designer'
                    ? 'bg-terminal-accent-green text-terminal-bg-primary'
                    : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
                }`}
              >
                ⚛️ Quantum Designer
              </button>
            </div>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="btn-touch-icon md:text-xs md:px-2 md:py-1 md:min-w-0 md:min-h-0"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'workflow' && (
            <div className={`h-full flex flex-col`}>
              {/* Workflow Canvas */}
              <div className={`${isFullscreen ? 'h-full' : 'h-2/3'} border-b border-terminal-border`}>
                <div className="h-full">
                  <PanelErrorBoundary panelName="Workflow Canvas">
                    <WorkflowCanvas
                      onNodeSelect={setSelectedNode}
                      selectedNode={selectedNode}
                    />
                  </PanelErrorBoundary>
                </div>
              </div>

              {/* Node Detail - Hidden in fullscreen */}
              {!isFullscreen && (
                <div className="h-1/3 overflow-auto">
                  <div className="p-3 border-b border-terminal-border bg-terminal-bg-primary">
                    <h2 className="terminal-heading text-xs">NODE DETAIL</h2>
                  </div>
                  <div className="p-4">
                    <PanelErrorBoundary panelName="Node Editor">
                      <NodeEditor selectedNode={selectedNode} />
                    </PanelErrorBoundary>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="h-full">
              <PanelErrorBoundary panelName="Artifact Gallery">
                <ArtifactGallery
                  artifacts={allArtifacts}
                  defaultView="split"
                  onDeleteArtifact={storeArtifacts.length > 0 ? handleDeleteArtifact : undefined}
                  onEditArtifact={storeArtifacts.length > 0 ? handleEditArtifact : undefined}
                />
              </PanelErrorBoundary>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="h-full lg:hidden">
              <PanelErrorBoundary panelName="Node Library Mobile">
                <NodeLibraryPanel />
              </PanelErrorBoundary>
            </div>
          )}

          {activeTab === 'quantum-designer' && (
            <div className="h-full p-4">
              <PanelErrorBoundary panelName="Quantum Designer">
                <QuantumCircuitDesigner />
              </PanelErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </div>
    </PanelErrorBoundary>
  );
}
