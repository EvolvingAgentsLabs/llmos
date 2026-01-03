'use client';

import { useState, useCallback, useEffect } from 'react';
import ArtifactGallery from './ArtifactGallery';
import { ArtifactData } from './ArtifactViewer';
import { ThreeScene } from './ThreeRenderer';
import { PlotData } from './PlotRenderer';
import { useArtifactStore } from '@/lib/artifacts/store';
import { Artifact } from '@/lib/artifacts/types';
import { PanelErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Maximize2, Minimize2 } from 'lucide-react';

interface ArtifactPanelProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

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
  const [isMaximized, setIsMaximized] = useState(false);
  const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);

  // Use artifact store
  const {
    artifacts: storeArtifacts,
    initialized,
    initialize,
    deleteArtifact,
    updateArtifact,
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
      id: 'sample-plot',
      name: 'Sample Chart',
      type: 'plot',
      data: {
        type: 'line',
        title: 'Sample Data',
        data: [
          { x: 0, y: 10 },
          { x: 10, y: 25 },
          { x: 20, y: 40 },
          { x: 30, y: 35 },
          { x: 40, y: 55 },
          { x: 50, y: 70 },
        ],
        xKey: 'x',
        yKey: 'y',
        color: '#00ff88',
      } as PlotData,
    },
    {
      id: 'sample-3d',
      name: 'Sample 3D Scene',
      type: '3d-scene',
      data: {
        type: '3d-scene',
        title: '3D Visualization',
        objects: [
          {
            type: 'sphere',
            position: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#00ff88',
          },
          {
            type: 'cube',
            position: [2, 0, 0],
            scale: [0.5, 0.5, 0.5],
            color: '#ff6600',
            wireframe: true,
          },
        ],
        camera: {
          position: [5, 3, 5],
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
  }, []);

  return (
    <PanelErrorBoundary panelName="Artifact Panel">
      <div className={`h-full flex flex-col ${isMaximized ? 'fixed inset-0 z-50 bg-bg-primary' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-bg-secondary">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg-primary">Artifacts</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-bg-elevated text-fg-secondary">
              {allArtifacts.length}
            </span>
          </div>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
            title={isMaximized ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Gallery Content */}
        <div className="flex-1 overflow-hidden">
          <PanelErrorBoundary panelName="Artifact Gallery">
            <ArtifactGallery
              artifacts={allArtifacts}
              defaultView="preview"
              onDeleteArtifact={storeArtifacts.length > 0 ? handleDeleteArtifact : undefined}
              onEditArtifact={storeArtifacts.length > 0 ? handleEditArtifact : undefined}
            />
          </PanelErrorBoundary>
        </div>
      </div>
    </PanelErrorBoundary>
  );
}
