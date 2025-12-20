'use client';

import { useState, useCallback } from 'react';

// VS Code-style icon components
const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 4l4 4-4 4V4z"/>
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 6l4 4 4-4H4z"/>
  </svg>
);

const FolderIcon = ({ open }: { open?: boolean }) => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    {open ? (
      <path d="M7.5 2L6.79 3H2v9h12V2H7.5zm6.31 1L14 11H2V4h4.5l.71-1h6.6z" fill="#dcb67a"/>
    ) : (
      <path d="M14.5 3H7.71l-.85-1h-5v11h13V3h-.36zm-.51 1l.01 7.5h-11L3 4h7.29l.86 1h2.84z" fill="#c09553"/>
    )}
  </svg>
);

const FileIcon = ({ ext }: { ext: string }) => {
  const colors: Record<string, string> = {
    ts: '#3178c6',
    js: '#f1e05a',
    tsx: '#61dafb',
    jsx: '#61dafb',
    py: '#3572A5',
    md: '#083fa1',
    json: '#cbcb41',
    yaml: '#cb171e',
    yml: '#cb171e',
  };

  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.5 2h-11L2 2.5v11l.5.5h11l.5-.5v-11L13.5 2zM13 13H3V3h10v10z" fill={colors[ext] || '#858585'}/>
      <text x="8" y="11" fontSize="6" textAnchor="middle" fill={colors[ext] || '#858585'} fontWeight="bold">
        {ext.substring(0, 2).toUpperCase()}
      </text>
    </svg>
  );
};

const DriveIcon = ({ type }: { type: 'system' | 'team' | 'user' }) => {
  const icons = {
    system: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1a6 6 0 100 12A6 6 0 008 2z" fill="#6e7681"/>
        <path d="M8 4a1 1 0 011 1v3h3a1 1 0 110 2H9v3a1 1 0 11-2 0v-3H4a1 1 0 110-2h3V5a1 1 0 011-1z" fill="#6e7681"/>
      </svg>
    ),
    team: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 3.5A2.5 2.5 0 018 1a2.5 2.5 0 012.5 2.5A2.5 2.5 0 018 6a2.5 2.5 0 01-2.5-2.5zM2 13c0-2.5 2-4 6-4s6 1.5 6 4v1H2v-1z" fill="#58a6ff"/>
      </svg>
    ),
    user: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="5" r="3" fill="#8b949e"/>
        <path d="M12 14s1-2 1-3.5C13 8.5 11 7 8 7s-5 1.5-5 3.5S4 14 4 14h8z" fill="#8b949e"/>
      </svg>
    ),
  };

  return icons[type];
};

const SpecialIcon = ({ type }: { type: string }) => {
  const icons: Record<string, JSX.Element> = {
    agent: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2a1 1 0 011 1v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V6H6a1 1 0 110-2h1V3a1 1 0 011-1z" fill="#f97316"/>
        <rect x="3" y="8" width="10" height="5" rx="1" fill="#f97316" opacity="0.7"/>
      </svg>
    ),
    tool: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.5 2a2.5 2.5 0 00-2.45 3.01L4.5 9.56a2.5 2.5 0 102.95 2.95l4.55-4.55A2.5 2.5 0 1011.5 2z" fill="#8b5cf6"/>
      </svg>
    ),
    skill: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z" fill="#eab308"/>
      </svg>
    ),
    runtime: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3z" fill="#10b981"/>
        <circle cx="8" cy="8" r="2" fill="#10b981"/>
      </svg>
    ),
  };

  return icons[type] || <FileIcon ext={type} />;
};

interface TreeNode {
  id: string;
  name: string;
  type: 'volume' | 'folder' | 'file';
  path: string;
  children?: TreeNode[];
  metadata?: {
    readonly?: boolean;
    volume?: 'system' | 'team' | 'user';
    fileType?: string;
    size?: string;
    modified?: string;
  };
}

interface VSCodeFileTreeProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  onFileSelect?: (node: TreeNode) => void;
  selectedFile?: string | null;
}

// Mock data structure - Single tree with volumes as root drives
const ROOT_TREE: TreeNode[] = [
  {
    id: 'system',
    name: 'System',
    type: 'volume',
    path: '/volumes/system',
    metadata: { volume: 'system', readonly: true },
    children: [
      {
        id: 'system-agents',
        name: 'agents',
        type: 'folder',
        path: '/volumes/system/agents',
        metadata: { readonly: true },
        children: [
          { id: 'researcher', name: 'researcher.md', type: 'file', path: '/volumes/system/agents/researcher.md', metadata: { fileType: 'agent', readonly: true } },
          { id: 'refiner', name: 'artifact-refiner.md', type: 'file', path: '/volumes/system/agents/artifact-refiner.md', metadata: { fileType: 'agent', readonly: true } },
          { id: 'debugger', name: 'code-debugger.md', type: 'file', path: '/volumes/system/agents/code-debugger.md', metadata: { fileType: 'agent', readonly: true } },
        ],
      },
      {
        id: 'system-tools',
        name: 'tools',
        type: 'folder',
        path: '/volumes/system/tools',
        metadata: { readonly: true },
        children: [
          { id: 'calc', name: 'calculator.md', type: 'file', path: '/volumes/system/tools/calculator.md', metadata: { fileType: 'tool', readonly: true } },
          { id: 'search', name: 'web-search.md', type: 'file', path: '/volumes/system/tools/web-search.md', metadata: { fileType: 'tool', readonly: true } },
        ],
      },
      {
        id: 'system-skills',
        name: 'skills',
        type: 'folder',
        path: '/volumes/system/skills',
        metadata: { readonly: true },
        children: [
          { id: 'qvqe', name: 'quantum-vqe-node.md', type: 'file', path: '/volumes/system/skills/quantum-vqe-node.md', metadata: { fileType: 'skill', readonly: true } },
          { id: 'circuit', name: 'circuit-rc-node.md', type: 'file', path: '/volumes/system/skills/circuit-rc-node.md', metadata: { fileType: 'skill', readonly: true } },
          { id: 'threejs', name: 'threejs-cube-node.md', type: 'file', path: '/volumes/system/skills/threejs-cube-node.md', metadata: { fileType: 'skill', readonly: true } },
          { id: 'data', name: 'data-analysis.md', type: 'file', path: '/volumes/system/skills/data-analysis.md', metadata: { fileType: 'skill', readonly: true } },
          { id: 'db', name: 'database-query-node.md', type: 'file', path: '/volumes/system/skills/database-query-node.md', metadata: { fileType: 'skill', readonly: true } },
        ],
      },
      {
        id: 'system-code',
        name: 'code',
        type: 'folder',
        path: '/volumes/system/code',
        metadata: { readonly: true },
        children: [],
      },
      {
        id: 'system-workflows',
        name: 'workflows',
        type: 'folder',
        path: '/volumes/system/workflows',
        metadata: { readonly: true },
        children: [],
      },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    type: 'volume',
    path: '/volumes/team',
    metadata: { volume: 'team' },
    children: [
      {
        id: 'team-agents',
        name: 'agents',
        type: 'folder',
        path: '/volumes/team/agents',
        children: [],
      },
      {
        id: 'team-tools',
        name: 'tools',
        type: 'folder',
        path: '/volumes/team/tools',
        children: [],
      },
      {
        id: 'team-skills',
        name: 'skills',
        type: 'folder',
        path: '/volumes/team/skills',
        children: [],
      },
      {
        id: 'team-code',
        name: 'code',
        type: 'folder',
        path: '/volumes/team/code',
        children: [],
      },
      {
        id: 'team-workflows',
        name: 'workflows',
        type: 'folder',
        path: '/volumes/team/workflows',
        children: [],
      },
    ],
  },
  {
    id: 'user',
    name: 'User',
    type: 'volume',
    path: '/volumes/user',
    metadata: { volume: 'user' },
    children: [
      {
        id: 'user-agents',
        name: 'agents',
        type: 'folder',
        path: '/volumes/user/agents',
        children: [],
      },
      {
        id: 'user-tools',
        name: 'tools',
        type: 'folder',
        path: '/volumes/user/tools',
        children: [],
      },
      {
        id: 'user-skills',
        name: 'skills',
        type: 'folder',
        path: '/volumes/user/skills',
        children: [],
      },
      {
        id: 'user-code',
        name: 'code',
        type: 'folder',
        path: '/volumes/user/code',
        children: [],
      },
      {
        id: 'user-workflows',
        name: 'workflows',
        type: 'folder',
        path: '/volumes/user/workflows',
        children: [],
      },
    ],
  },
];

export default function VSCodeFileTree({
  activeVolume,
  onVolumeChange,
  onFileSelect,
  selectedFile,
}: VSCodeFileTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['system', 'system-agents', 'system-tools', 'system-skills'])
  );

  const toggleNode = useCallback((nodeId: string, volumeType?: 'system' | 'team' | 'user') => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });

    // If clicking a volume node, notify parent
    if (volumeType) {
      onVolumeChange(volumeType);
    }
  }, [onVolumeChange]);

  const getNodeIcon = (node: TreeNode, isExpanded: boolean): JSX.Element => {
    // Volume/Drive icon
    if (node.type === 'volume' && node.metadata?.volume) {
      return <DriveIcon type={node.metadata.volume as 'system' | 'team' | 'user'} />;
    }

    // Folder icon
    if (node.type === 'folder') {
      return <FolderIcon open={isExpanded} />;
    }

    // File icons
    if (node.type === 'file') {
      // Special file types
      if (node.metadata?.fileType) {
        return <SpecialIcon type={node.metadata.fileType} />;
      }

      // Regular file by extension
      const ext = node.name.split('.').pop()?.toLowerCase() || 'file';
      return <FileIcon ext={ext} />;
    }

    return <FileIcon ext="file" />;
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedFile === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isReadOnly = node.metadata?.readonly;
    const isVolume = node.type === 'volume';

    return (
      <div key={node.id}>
        {/* Node row */}
        <div
          className={`
            group flex items-center gap-1 py-0.5 px-1 cursor-pointer
            transition-colors duration-100
            ${isSelected ? 'bg-accent-primary/20' : 'hover:bg-bg-tertiary'}
            ${isVolume ? 'font-semibold' : ''}
          `}
          style={{ paddingLeft: `${depth * 8 + 4}px` }}
          onClick={() => {
            if (node.type === 'folder' || node.type === 'volume') {
              toggleNode(node.id, node.metadata?.volume as 'system' | 'team' | 'user' | undefined);
            } else if (onFileSelect) {
              onFileSelect(node);
            }
          }}
        >
          {/* Chevron (only for nodes with children) */}
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {hasChildren && (
              isExpanded ? (
                <ChevronDownIcon className="w-3 h-3 text-fg-secondary" />
              ) : (
                <ChevronRightIcon className="w-3 h-3 text-fg-secondary" />
              )
            )}
          </div>

          {/* Icon */}
          <div className="flex-shrink-0">
            {getNodeIcon(node, isExpanded)}
          </div>

          {/* Name */}
          <span className={`
            text-xs truncate flex-1
            ${isSelected ? 'text-fg-primary font-medium' : 'text-fg-secondary'}
            ${isVolume ? 'font-semibold' : ''}
          `}>
            {node.name}
          </span>

          {/* Read-only badge */}
          {isReadOnly && node.type === 'volume' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-fg-tertiary font-normal">
              RO
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Count total items in active volume
  const countItems = (nodes: TreeNode[]): number => {
    return nodes.reduce((count, node) => {
      let total = node.type === 'file' ? 1 : 0;
      if (node.children) {
        total += countItems(node.children);
      }
      return count + total;
    }, 0);
  };

  const activeVolumeNode = ROOT_TREE.find(v => v.id === activeVolume);
  const activeVolumeItemCount = activeVolumeNode ? countItems(activeVolumeNode.children || []) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tree header */}
      <div className="px-3 py-2 border-b border-border-primary/50 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">
          Explorer
        </span>
        <button
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-tertiary transition-colors"
          onClick={() => setExpandedNodes(new Set())}
          title="Collapse All"
        >
          <svg className="w-3 h-3 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* File tree - Single unified tree with volumes as drives */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 py-2 scrollbar-thin">
        {ROOT_TREE.map((volumeNode) => renderTreeNode(volumeNode, 0))}
      </div>

      {/* Tree footer (stats) */}
      <div className="px-3 py-1.5 border-t border-border-primary/50 bg-bg-secondary/30">
        <div className="text-[10px] text-fg-tertiary flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-accent-success"></span>
            {activeVolumeItemCount} items
          </span>
          <span>•</span>
          <span>{activeVolume}</span>
        </div>
      </div>
    </div>
  );
}
