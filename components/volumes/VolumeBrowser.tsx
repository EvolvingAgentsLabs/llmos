'use client';

import { useState, useEffect } from 'react';
import { artifactManager, Artifact, ArtifactType, ArtifactVolume } from '@/lib/artifacts';

interface VolumeBrowserProps {
  activeVolume?: ArtifactVolume;
  onVolumeChange?: (volume: ArtifactVolume) => void;
  onArtifactSelect?: (artifact: Artifact) => void;
  showSearch?: boolean;
}

export default function VolumeBrowser({
  activeVolume = 'user',
  onVolumeChange,
  onArtifactSelect,
  showSearch = true,
}: VolumeBrowserProps) {
  const [selectedVolume, setSelectedVolume] = useState<ArtifactVolume>(activeVolume);
  const [selectedType, setSelectedType] = useState<ArtifactType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['all']));

  const artifacts = artifactManager.filter({
    volume: selectedVolume,
    ...(selectedType !== 'all' && { type: selectedType }),
    ...(searchQuery && { search: searchQuery }),
  });

  // Group artifacts by type
  const groupedArtifacts = artifacts.reduce((acc, artifact) => {
    if (!acc[artifact.type]) {
      acc[artifact.type] = [];
    }
    acc[artifact.type].push(artifact);
    return acc;
  }, {} as Record<string, Artifact[]>);

  const handleVolumeChange = (volume: ArtifactVolume) => {
    setSelectedVolume(volume);
    onVolumeChange?.(volume);
  };

  const toggleFolder = (type: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedFolders(newExpanded);
  };

  const getTypeIcon = (type: ArtifactType) => {
    switch (type) {
      case 'agent': return '🤖';
      case 'tool': return '🔧';
      case 'skill': return '📘';
      case 'workflow': return '🔗';
      case 'code': return '⚛️';
    }
  };

  const getVolumeIcon = (volume: ArtifactVolume) => {
    switch (volume) {
      case 'system': return '🔒';
      case 'team': return '👥';
      case 'user': return '👤';
    }
  };

  const stats = artifactManager.getStats();

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-primary bg-bg-primary">
        <h3 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3">
          Volume Browser
        </h3>

        {/* Volume Selector */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={() => handleVolumeChange('user')}
            className={`px-3 py-2 rounded-lg text-sm transition-all ${
              selectedVolume === 'user'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span>👤</span>
              <span className="font-medium">User</span>
            </div>
            <div className="text-xs opacity-75 mt-0.5">
              {stats.byVolume.user}
            </div>
          </button>

          <button
            onClick={() => handleVolumeChange('team')}
            className={`px-3 py-2 rounded-lg text-sm transition-all ${
              selectedVolume === 'team'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span>👥</span>
              <span className="font-medium">Team</span>
            </div>
            <div className="text-xs opacity-75 mt-0.5">
              {stats.byVolume.team}
            </div>
          </button>

          <button
            onClick={() => handleVolumeChange('system')}
            className={`px-3 py-2 rounded-lg text-sm transition-all ${
              selectedVolume === 'system'
                ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <span>🔒</span>
              <span className="font-medium">System</span>
            </div>
            <div className="text-xs opacity-75 mt-0.5">
              {stats.byVolume.system}
            </div>
          </button>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artifacts..."
              className="input-primary w-full pl-8 text-sm"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Artifact Tree */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(groupedArtifacts).length === 0 ? (
          <div className="p-8 text-center text-fg-tertiary">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-sm">
              {searchQuery
                ? 'No artifacts match your search'
                : `No artifacts in ${selectedVolume} volume`}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {Object.entries(groupedArtifacts).map(([type, typeArtifacts]) => (
              <div key={type}>
                {/* Folder Header */}
                <button
                  onClick={() => toggleFolder(type)}
                  className="w-full px-4 py-2 flex items-center gap-2 hover:bg-bg-tertiary transition-colors text-left"
                >
                  <span className="text-fg-tertiary text-xs">
                    {expandedFolders.has(type) ? '▼' : '▶'}
                  </span>
                  <span className="text-lg">{getTypeIcon(type as ArtifactType)}</span>
                  <span className="text-sm font-medium text-fg-primary">{type}s/</span>
                  <span className="text-xs text-fg-tertiary">
                    ({typeArtifacts.length})
                  </span>
                </button>

                {/* Artifacts in Folder */}
                {expandedFolders.has(type) && (
                  <div className="ml-8">
                    {typeArtifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        onClick={() => onArtifactSelect?.(artifact)}
                        className="w-full px-4 py-2 flex items-start gap-2 hover:bg-bg-tertiary transition-colors text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm text-fg-primary truncate group-hover:text-accent-primary">
                              {artifact.name}
                            </span>
                            {artifact.status === 'temporal' && (
                              <span className="text-xs text-yellow-400 flex-shrink-0">⚠️</span>
                            )}
                          </div>
                          {artifact.description && (
                            <p className="text-xs text-fg-tertiary truncate">
                              {artifact.description}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-3 border-t border-border-primary bg-bg-primary">
        <div className="text-xs text-fg-tertiary">
          {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} in {selectedVolume}/
        </div>
      </div>
    </div>
  );
}
