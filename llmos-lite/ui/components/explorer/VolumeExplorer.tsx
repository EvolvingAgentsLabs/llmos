/**
 * Volume Explorer - Git-Backed File Tree
 *
 * VSCode-style file explorer showing volumes as Git repositories
 */

'use client';

import { useState, useEffect } from 'react';
import { getVolumeFileSystem, VolumeType, VolumeFile } from '@/lib/volumes/file-operations';
import GitStatusWidget from '../git/GitStatusWidget';

interface VolumeExplorerProps {
  onFileSelect?: (file: { volume: VolumeType; path: string; type: string }) => void;
  selectedFile?: string | null;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  gitStatus?: 'modified' | 'new' | 'deleted';
}

export default function VolumeExplorer({ onFileSelect, selectedFile }: VolumeExplorerProps) {
  const [activeVolume, setActiveVolume] = useState<VolumeType>('user');
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));

  const fs = getVolumeFileSystem();

  useEffect(() => {
    loadVolumeFiles();
  }, [activeVolume]);

  const loadVolumeFiles = async () => {
    try {
      const files = await fs.listFiles(activeVolume);
      const tree = buildFileTree(files);
      setFileTree(tree);
    } catch (error) {
      console.error('Failed to load volume files:', error);
      // Show mock structure for demo
      setFileTree(getMockFileTree(activeVolume));
    }
  };

  const buildFileTree = (files: VolumeFile[]): FileNode[] => {
    const tree: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();

    // Add root folders first
    const folders = new Set<string>();
    files.forEach(file => {
      const parts = file.path.split('/');
      if (parts.length > 1) {
        folders.add(parts[0]);
      }
    });

    folders.forEach(folder => {
      const node: FileNode = {
        name: folder,
        path: folder,
        type: 'folder',
        children: []
      };
      folderMap.set(folder, node);
      tree.push(node);
    });

    // Add files
    files.forEach(file => {
      const parts = file.path.split('/');
      if (parts.length === 1) {
        // Root file
        tree.push({
          name: file.path,
          path: file.path,
          type: 'file',
          gitStatus: file.gitStatus !== 'unmodified' ? file.gitStatus : undefined
        });
      } else {
        // File in folder
        const folder = folderMap.get(parts[0]);
        if (folder && folder.children) {
          folder.children.push({
            name: parts.slice(1).join('/'),
            path: file.path,
            type: 'file',
            gitStatus: file.gitStatus !== 'unmodified' ? file.gitStatus : undefined
          });
        }
      }
    });

    return tree;
  };

  const getMockFileTree = (volume: VolumeType): FileNode[] => {
    const trees: Record<VolumeType, FileNode[]> = {
      system: [
        {
          name: 'agents',
          path: 'agents',
          type: 'folder',
          children: [
            { name: 'quantum-researcher.py', path: 'agents/quantum-researcher.py', type: 'file' },
            { name: 'circuit-optimizer.py', path: 'agents/circuit-optimizer.py', type: 'file' }
          ]
        },
        {
          name: 'tools',
          path: 'tools',
          type: 'folder',
          children: [
            { name: 'hamiltonian-solver.py', path: 'tools/hamiltonian-solver.py', type: 'file' },
            { name: 'plot-bloch.py', path: 'tools/plot-bloch.py', type: 'file' }
          ]
        },
        {
          name: 'skills',
          path: 'skills',
          type: 'folder',
          children: [
            { name: 'vqe-pattern.md', path: 'skills/vqe-pattern.md', type: 'file' }
          ]
        }
      ],
      team: [
        {
          name: 'experiments',
          path: 'experiments',
          type: 'folder',
          children: [
            { name: 'shared-vqe.py', path: 'experiments/shared-vqe.py', type: 'file' }
          ]
        }
      ],
      user: [
        {
          name: 'circuits',
          path: 'circuits',
          type: 'folder',
          children: [
            { name: 'bell_state.py', path: 'circuits/bell_state.py', type: 'file', gitStatus: 'modified' },
            { name: 'h2_vqe.py', path: 'circuits/h2_vqe.py', type: 'file', gitStatus: 'new' }
          ]
        },
        {
          name: 'experiments',
          path: 'experiments',
          type: 'folder',
          children: [
            { name: 'vqe_run_1.ipynb', path: 'experiments/vqe_run_1.ipynb', type: 'file' }
          ]
        }
      ]
    };

    return trees[volume] || [];
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-bg-tertiary transition-colors ${
            isSelected ? 'bg-accent-primary/20' : ''
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.path);
            } else {
              onFileSelect?.({ volume: activeVolume, path: node.path, type: 'file' });
            }
          }}
        >
          {/* Icon */}
          {node.type === 'folder' ? (
            <svg
              className={`w-3 h-3 text-fg-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/>
            </svg>
          ) : (
            <svg className="w-3 h-3 text-fg-tertiary" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V2a2 2 0 00-2-2H4zm0 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"/>
            </svg>
          )}

          {/* Name */}
          <span className="flex-1 text-xs text-fg-secondary truncate">{node.name}</span>

          {/* Git Status */}
          {node.gitStatus && (
            <span
              className={`text-[9px] px-1 rounded ${
                node.gitStatus === 'modified'
                  ? 'bg-accent-warning/20 text-accent-warning'
                  : node.gitStatus === 'new'
                  ? 'bg-accent-success/20 text-accent-success'
                  : 'bg-accent-error/20 text-accent-error'
              }`}
            >
              {node.gitStatus === 'modified' ? 'M' : node.gitStatus === 'new' ? 'A' : 'D'}
            </span>
          )}
        </div>

        {/* Children */}
        {node.type === 'folder' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary/50 border-r border-border-primary/50">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-primary/30 bg-bg-secondary/30">
        <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide mb-2">
          Explorer
        </div>

        {/* Volume Selector */}
        <div className="flex gap-1">
          {(['system', 'team', 'user'] as VolumeType[]).map((vol) => (
            <button
              key={vol}
              onClick={() => setActiveVolume(vol)}
              className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
                activeVolume === vol
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
              }`}
            >
              {vol === 'system' && '🔒'}
              {vol === 'team' && '👥'}
              {vol === 'user' && '👤'} {vol}
            </button>
          ))}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="py-1">
          {fileTree.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-fg-tertiary">
              No files in {activeVolume} volume
            </div>
          ) : (
            fileTree.map(node => renderNode(node))
          )}
        </div>
      </div>

      {/* Git Status */}
      <GitStatusWidget volume={activeVolume} onCommit={() => loadVolumeFiles()} />
    </div>
  );
}
