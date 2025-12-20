'use client';

import { useState, useEffect } from 'react';
import { useArtifactStore } from '@/lib/artifacts/store';

interface VolumeFileTreeProps {
  volume: 'system' | 'team' | 'user';
  selectedArtifact: string | null;
  onSelectArtifact: (artifactId: string | null) => void;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'artifact';
  children?: TreeNode[];
  artifactType?: 'agent' | 'tool' | 'skill' | 'code' | 'workflow';
}

export default function VolumeFileTree({
  volume,
  selectedArtifact,
  onSelectArtifact,
}: VolumeFileTreeProps) {
  const { artifacts } = useArtifactStore();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['skills', 'code', 'workflows', 'agents', 'tools']));

  // Filter artifacts by volume
  const volumeArtifacts = artifacts.filter((a) => a.volume === volume);

  // Group artifacts by type
  const artifactsByType = {
    agents: volumeArtifacts.filter((a) => a.type === 'agent'),
    tools: volumeArtifacts.filter((a) => a.type === 'tool'),
    skills: volumeArtifacts.filter((a) => a.type === 'skill'),
    code: volumeArtifacts.filter((a) => a.type === 'code'),
    workflows: volumeArtifacts.filter((a) => a.type === 'workflow'),
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getFolderIcon = (type: string, isExpanded: boolean) => {
    if (isExpanded) {
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    );
  };

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'agent':
        return '🤖';
      case 'tool':
        return '🔧';
      case 'skill':
        return '⚡';
      case 'code':
        return '📄';
      case 'workflow':
        return '🔄';
      default:
        return '📄';
    }
  };

  return (
    <div className="p-3">
      {/* Volume header */}
      <div className="mb-4 px-2">
        <h2 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
          {volume} Volume
        </h2>
        <p className="text-xs text-fg-tertiary mt-1">
          {volumeArtifacts.length} artifact{volumeArtifacts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* File tree */}
      <div className="space-y-1">
        {/* Agents folder */}
        {(artifactsByType.agents.length > 0 || volume === 'system') && (
          <div>
            <button
              onClick={() => toggleFolder('agents')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-fg-secondary hover:text-fg-primary group"
            >
              {getFolderIcon('agents', expandedFolders.has('agents'))}
              <span className="text-sm font-medium">🤖 Agents</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                {artifactsByType.agents.length}
              </span>
            </button>
            {expandedFolders.has('agents') && (
              <div className="ml-6 mt-1 space-y-0.5">
                {artifactsByType.agents.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-fg-tertiary italic">
                    No agents yet
                  </div>
                ) : (
                  artifactsByType.agents.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => onSelectArtifact(artifact.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 text-left ${
                        selectedArtifact === artifact.id
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'hover:bg-bg-tertiary/50 text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <span className="text-sm">{getArtifactIcon('agent')}</span>
                      <span className="text-sm truncate flex-1">{artifact.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Tools folder */}
        {(artifactsByType.tools.length > 0 || volume === 'system') && (
          <div>
            <button
              onClick={() => toggleFolder('tools')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-fg-secondary hover:text-fg-primary group"
            >
              {getFolderIcon('tools', expandedFolders.has('tools'))}
              <span className="text-sm font-medium">🔧 Tools</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                {artifactsByType.tools.length}
              </span>
            </button>
            {expandedFolders.has('tools') && (
              <div className="ml-6 mt-1 space-y-0.5">
                {artifactsByType.tools.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-fg-tertiary italic">
                    No tools yet
                  </div>
                ) : (
                  artifactsByType.tools.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => onSelectArtifact(artifact.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 text-left ${
                        selectedArtifact === artifact.id
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'hover:bg-bg-tertiary/50 text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <span className="text-sm">{getArtifactIcon('tool')}</span>
                      <span className="text-sm truncate flex-1">{artifact.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Skills folder */}
        {(artifactsByType.skills.length > 0 || volume === 'system') && (
          <div>
            <button
              onClick={() => toggleFolder('skills')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-fg-secondary hover:text-fg-primary group"
            >
              {getFolderIcon('skills', expandedFolders.has('skills'))}
              <span className="text-sm font-medium">⚡ Skills</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                {artifactsByType.skills.length}
              </span>
            </button>
            {expandedFolders.has('skills') && (
              <div className="ml-6 mt-1 space-y-0.5">
                {artifactsByType.skills.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-fg-tertiary italic">
                    No skills yet
                  </div>
                ) : (
                  artifactsByType.skills.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => onSelectArtifact(artifact.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 text-left ${
                        selectedArtifact === artifact.id
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'hover:bg-bg-tertiary/50 text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <span className="text-sm">{getArtifactIcon('skill')}</span>
                      <span className="text-sm truncate flex-1">{artifact.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Code folder */}
        {(artifactsByType.code.length > 0 || volume === 'system') && (
          <div>
            <button
              onClick={() => toggleFolder('code')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-fg-secondary hover:text-fg-primary group"
            >
              {getFolderIcon('code', expandedFolders.has('code'))}
              <span className="text-sm font-medium">📄 Code</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                {artifactsByType.code.length}
              </span>
            </button>
            {expandedFolders.has('code') && (
              <div className="ml-6 mt-1 space-y-0.5">
                {artifactsByType.code.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-fg-tertiary italic">
                    No code files yet
                  </div>
                ) : (
                  artifactsByType.code.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => onSelectArtifact(artifact.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 text-left ${
                        selectedArtifact === artifact.id
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'hover:bg-bg-tertiary/50 text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <span className="text-sm">{getArtifactIcon('code')}</span>
                      <span className="text-sm truncate flex-1">{artifact.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Workflows folder */}
        {(artifactsByType.workflows.length > 0 || volume === 'system') && (
          <div>
            <button
              onClick={() => toggleFolder('workflows')}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-fg-secondary hover:text-fg-primary group"
            >
              {getFolderIcon('workflows', expandedFolders.has('workflows'))}
              <span className="text-sm font-medium">🔄 Workflows</span>
              <span className="ml-auto text-xs text-fg-tertiary">
                {artifactsByType.workflows.length}
              </span>
            </button>
            {expandedFolders.has('workflows') && (
              <div className="ml-6 mt-1 space-y-0.5">
                {artifactsByType.workflows.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-fg-tertiary italic">
                    No workflows yet
                  </div>
                ) : (
                  artifactsByType.workflows.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => onSelectArtifact(artifact.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 text-left ${
                        selectedArtifact === artifact.id
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'hover:bg-bg-tertiary/50 text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <span className="text-sm">{getArtifactIcon('workflow')}</span>
                      <span className="text-sm truncate flex-1">{artifact.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {volumeArtifacts.length === 0 && (
          <div className="px-2 py-8 text-center">
            <div className="text-4xl mb-2">📁</div>
            <p className="text-sm text-fg-tertiary">
              No artifacts in {volume} volume yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
