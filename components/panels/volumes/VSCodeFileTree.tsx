'use client';

import { useState, useCallback, useEffect } from 'react';
import { getVFS } from '@/lib/virtual-fs';
import { initializeSystemVolume } from '@/lib/volumes/system-volume-loader';
import ContextMenu, { ContextMenuItem } from '@/components/common/ContextMenu';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// Import icons from extracted module
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FileIcon,
  DriveIcon,
  SpecialIcon,
  TrashIcon,
  EditIcon,
  FolderPlusIcon,
  FilePlusIcon,
} from './icons';

interface TreeNode {
  id: string;
  name: string;
  type: 'volume' | 'folder' | 'file' | 'special';
  path: string;
  children?: TreeNode[];
  metadata?: {
    readonly?: boolean;
    volume?: 'system' | 'team' | 'user';
    fileType?: string;
    size?: string | number;
    modified?: string;
    action?: 'desktop' | 'applet' | 'code' | 'file';
  };
}

interface VSCodeFileTreeProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  onFileSelect?: (node: TreeNode) => void;
  onCodeFileSelect?: (path: string) => void;
  selectedFile?: string | null;
}

// Initial empty tree structure - will be populated from API
const INITIAL_TREE: TreeNode[] = [
  {
    id: 'system',
    name: 'System',
    type: 'volume',
    path: '/volumes/system',
    metadata: { volume: 'system', readonly: true },
    children: [],
  },
  {
    id: 'team',
    name: 'Team',
    type: 'volume',
    path: '/volumes/team',
    metadata: { volume: 'team' },
    children: [],
  },
  {
    id: 'user',
    name: 'User',
    type: 'volume',
    path: '/volumes/user',
    metadata: { volume: 'user' },
    children: [],
  },
];

export default function VSCodeFileTree({
  activeVolume,
  onVolumeChange,
  onFileSelect,
  onCodeFileSelect,
  selectedFile,
}: VSCodeFileTreeProps) {
  // Start with system, user and team expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['system', 'team', 'user'])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeNode[]>(INITIAL_TREE);
  const [isLoading, setIsLoading] = useState(true);

  // Check if a file is a code file based on extension
  const isCodeFile = (filename: string): boolean => {
    const codeExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html', 'md'];
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return codeExtensions.includes(ext);
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    node: TreeNode | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    node: null,
  });

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    node: TreeNode | null;
  }>({
    isOpen: false,
    node: null,
  });

  // Rename state
  const [renameNode, setRenameNode] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Load all volumes from VFS (client-side only)
  useEffect(() => {
    const loadAllVolumesFromVFS = async () => {
      setIsLoading(true);
      try {
        // First, ensure system volume is loaded into VFS
        await initializeSystemVolume();

        // Now load all volumes from VFS
        const vfs = getVFS();
        const allFiles = vfs.getAllFiles();

        // Build trees for each volume
        const systemFiles = allFiles.filter(f => f.path.startsWith('system/'));
        const teamFiles = allFiles.filter(f => f.path.startsWith('team/'));
        const userFiles = allFiles.filter(f => f.path.startsWith('user/'));

        const systemTree = buildVFSTree(systemFiles, 'system');
        const teamTree = buildVFSTree(teamFiles, 'team');
        const userTree = buildVFSTree(userFiles, 'user');

        setTreeData([
          {
            id: 'system',
            name: 'System',
            type: 'volume',
            path: '/volumes/system',
            metadata: { volume: 'system', readonly: true },
            children: systemTree,
          },
          {
            id: 'team',
            name: 'Team',
            type: 'volume',
            path: '/volumes/team',
            metadata: { volume: 'team' },
            children: teamTree,
          },
          {
            id: 'user',
            name: 'User',
            type: 'volume',
            path: '/volumes/user',
            metadata: { volume: 'user' },
            children: userTree,
          },
        ]);
      } catch (error) {
        console.error('Failed to load volumes from VFS:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllVolumesFromVFS();

    // Refresh VFS every 2 seconds to pick up changes
    const interval = setInterval(() => {
      const vfs = getVFS();
      const allFiles = vfs.getAllFiles();

      const systemFiles = allFiles.filter(f => f.path.startsWith('system/'));
      const teamFiles = allFiles.filter(f => f.path.startsWith('team/'));
      const userFiles = allFiles.filter(f => f.path.startsWith('user/'));

      const systemTree = buildVFSTree(systemFiles, 'system');
      const teamTree = buildVFSTree(teamFiles, 'team');
      const userTree = buildVFSTree(userFiles, 'user');

      setTreeData([
        {
          id: 'system',
          name: 'System',
          type: 'volume',
          path: '/volumes/system',
          metadata: { volume: 'system', readonly: true },
          children: systemTree,
        },
        {
          id: 'team',
          name: 'Team',
          type: 'volume',
          path: '/volumes/team',
          metadata: { volume: 'team' },
          children: teamTree,
        },
        {
          id: 'user',
          name: 'User',
          type: 'volume',
          path: '/volumes/user',
          metadata: { volume: 'user' },
          children: userTree,
        },
      ]);
    }, 2000);

    return () => clearInterval(interval);
  }, [activeVolume]);

  // Build tree from VFS files for a specific volume
  const buildVFSTree = (files: any[], volumeName?: string): TreeNode[] => {
    const nodeMap = new Map<string, TreeNode>();
    const volumePrefix = volumeName ? `${volumeName}/` : '';

    // Helper to ensure a directory exists
    const ensureDirectory = (path: string): TreeNode => {
      if (nodeMap.has(path)) {
        return nodeMap.get(path)!;
      }

      const parts = path.split('/');
      const name = parts[parts.length - 1];

      // Determine if this is a readonly system folder
      const isSystem = volumeName === 'system';
      const parentDir = parts.length > 1 ? parts[parts.length - 2] : '';

      const node: TreeNode = {
        id: `vfs-dir-${volumeName}-${path}`,
        name,
        type: 'folder',
        path: `/volumes/${volumeName}/${path}`,
        children: [],
        metadata: {
          volume: volumeName as 'system' | 'team' | 'user',
          readonly: isSystem,
        },
      };

      nodeMap.set(path, node);

      // Ensure parent exists
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parentNode = ensureDirectory(parentPath);
        if (parentNode.children && !parentNode.children.find(c => c.id === node.id)) {
          parentNode.children.push(node);
        }
      }

      return node;
    };

    // Process all files
    files.forEach(file => {
      // Strip volume prefix from path (e.g., "system/agents/foo.md" -> "agents/foo.md")
      const relativePath = volumeName && file.path.startsWith(volumePrefix)
        ? file.path.slice(volumePrefix.length)
        : file.path;

      const parts = relativePath.split('/');

      // Ensure parent directories exist
      if (parts.length > 1) {
        const dirPath = parts.slice(0, -1).join('/');
        ensureDirectory(dirPath);
      }

      // Determine file type based on parent directory
      const parentDir = parts.length > 1 ? parts[parts.length - 2] : '';
      let fileType: string | undefined;
      if (parentDir === 'agents') fileType = 'agent';
      else if (parentDir === 'tools') fileType = 'tool';
      else if (parentDir === 'skills') fileType = 'skill';

      // Create file node
      const fileName = parts[parts.length - 1];
      const fileNode: TreeNode = {
        id: `vfs-file-${volumeName}-${relativePath}`,
        name: fileName,
        type: 'file',
        path: `/volumes/${volumeName}/${relativePath}`,
        metadata: {
          volume: volumeName as 'system' | 'team' | 'user',
          readonly: volumeName === 'system',
          fileType,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          modified: new Date(file.modified).toLocaleString(),
        },
      };

      // Add to parent
      if (parts.length > 1) {
        const parentPath = parts.slice(0, -1).join('/');
        const parentNode = nodeMap.get(parentPath);
        if (parentNode && parentNode.children) {
          parentNode.children.push(fileNode);
        }
      } else {
        // Root level file
        nodeMap.set(relativePath, fileNode as any);
      }
    });

    // Return top-level nodes
    const topLevel: TreeNode[] = [];
    nodeMap.forEach((node, path) => {
      if (!path.includes('/')) {
        // Sort children
        const sortChildren = (n: TreeNode) => {
          if (n.children) {
            n.children.sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            });
            n.children.forEach(sortChildren);
          }
        };
        sortChildren(node);
        topLevel.push(node);
      }
    });

    // Also include root-level files
    files.filter(f => !f.path.includes('/')).forEach(file => {
      const fileNode: TreeNode = {
        id: `vfs-file-${file.path}`,
        name: file.path,
        type: 'file',
        path: file.path,
        metadata: {
          size: `${(file.size / 1024).toFixed(1)} KB`,
        },
      };
      if (!topLevel.find(n => n.id === fileNode.id)) {
        topLevel.push(fileNode);
      }
    });

    topLevel.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

    return topLevel;
  };

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

    if (volumeType) {
      onVolumeChange(volumeType);
    }
  }, [onVolumeChange]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.metadata?.readonly) return;
    if (!node.id.startsWith('vfs-')) return;

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      node,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, node: null });
  }, []);

  const handleDeleteClick = useCallback((node: TreeNode) => {
    setDeleteConfirm({ isOpen: true, node });
    closeContextMenu();
  }, [closeContextMenu]);

  const handleDelete = useCallback(() => {
    const node = deleteConfirm.node;
    if (!node) return;

    try {
      const vfs = getVFS();
      let vfsPath = node.path;

      if (node.id.startsWith('vfs-file-')) {
        vfsPath = node.id.replace('vfs-file-', '');
      } else if (node.id.startsWith('vfs-dir-')) {
        vfsPath = node.id.replace('vfs-dir-', '');
      }

      if (node.type === 'folder') {
        vfs.deleteDirectory(vfsPath);
      } else {
        vfs.deleteFile(vfsPath);
      }

      setDeleteConfirm({ isOpen: false, node: null });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }, [deleteConfirm.node]);

  const handleRename = useCallback((node: TreeNode) => {
    setRenameNode({ id: node.id, name: node.name });
    closeContextMenu();
  }, [closeContextMenu]);

  const performRename = useCallback((newName: string) => {
    if (!renameNode || !newName.trim()) {
      setRenameNode(null);
      return;
    }

    try {
      const vfs = getVFS();
      let oldPath = '';
      if (renameNode.id.startsWith('vfs-file-')) {
        oldPath = renameNode.id.replace('vfs-file-', '');
      } else if (renameNode.id.startsWith('vfs-dir-')) {
        oldPath = renameNode.id.replace('vfs-dir-', '');
      }

      if (oldPath) {
        const pathParts = oldPath.split('/');
        pathParts[pathParts.length - 1] = newName.trim();
        const newPath = pathParts.join('/');
        vfs.rename(oldPath, newPath);
      }

      setRenameNode(null);
    } catch (error) {
      console.error('Failed to rename:', error);
      setRenameNode(null);
    }
  }, [renameNode]);

  const getContextMenuItems = useCallback((node: TreeNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (node.type === 'folder') {
      items.push({
        id: 'new-file',
        label: 'New File',
        icon: <FilePlusIcon />,
        action: () => closeContextMenu(),
        disabled: true,
      });
      items.push({
        id: 'new-folder',
        label: 'New Folder',
        icon: <FolderPlusIcon />,
        action: () => closeContextMenu(),
        disabled: true,
      });
      items.push({ id: 'divider1', label: '', action: () => {}, divider: true });
    }

    items.push({
      id: 'rename',
      label: 'Rename',
      icon: <EditIcon />,
      action: () => handleRename(node),
    });

    items.push({ id: 'divider2', label: '', action: () => {}, divider: true });

    items.push({
      id: 'delete',
      label: node.type === 'folder' ? 'Delete Folder' : 'Delete File',
      icon: <TrashIcon />,
      action: () => handleDeleteClick(node),
      danger: true,
    });

    return items;
  }, [closeContextMenu, handleDeleteClick, handleRename]);

  const getNodeIcon = (node: TreeNode, isExpanded: boolean): JSX.Element => {
    if (node.type === 'volume' && node.metadata?.volume) {
      return <DriveIcon type={node.metadata.volume as 'system' | 'team' | 'user'} />;
    }

    if (node.type === 'folder') {
      return <FolderIcon open={isExpanded} />;
    }

    if (node.type === 'file') {
      if (node.metadata?.fileType) {
        return <SpecialIcon type={node.metadata.fileType} />;
      }
      const ext = node.name.split('.').pop()?.toLowerCase() || 'file';
      return <FileIcon ext={ext} />;
    }

    return <FileIcon ext="file" />;
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedFile === node.id || selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isReadOnly = node.metadata?.readonly;
    const isVolume = node.type === 'volume';
    const isRenaming = renameNode?.id === node.id;
    const isVFSNode = node.id.startsWith('vfs-');

    const handleNodeClick = () => {
      setSelectedNodeId(node.id);

      if (node.type === 'folder' || node.type === 'volume') {
        toggleNode(node.id, node.metadata?.volume as 'system' | 'team' | 'user' | undefined);
        return;
      }

      if (node.type === 'file') {
        if (isCodeFile(node.name) && onCodeFileSelect) {
          onCodeFileSelect(node.path);
        } else if (onFileSelect) {
          onFileSelect(node);
        }
      }
    };

    return (
      <div key={node.id}>
        <div
          className={`
            group flex items-center gap-1 py-0.5 px-1 cursor-pointer
            transition-colors duration-100
            ${isSelected ? 'bg-accent-primary/20' : 'hover:bg-bg-tertiary'}
            ${isVolume ? 'font-semibold' : ''}
          `}
          style={{ paddingLeft: `${depth * 8 + 4}px` }}
          onClick={handleNodeClick}
          onContextMenu={(e) => handleContextMenu(e, node)}
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {hasChildren && (
              isExpanded ? (
                <ChevronDownIcon className="w-3 h-3 text-fg-secondary" />
              ) : (
                <ChevronRightIcon className="w-3 h-3 text-fg-secondary" />
              )
            )}
          </div>

          <div className="flex-shrink-0">
            {getNodeIcon(node, isExpanded)}
          </div>

          {isRenaming ? (
            <input
              type="text"
              defaultValue={renameNode.name}
              autoFocus
              className="flex-1 text-xs bg-bg-tertiary border border-accent-primary rounded px-1 py-0.5 text-fg-primary outline-none"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => performRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  performRename((e.target as HTMLInputElement).value);
                } else if (e.key === 'Escape') {
                  setRenameNode(null);
                }
              }}
            />
          ) : (
            <span className={`
              text-xs truncate flex-1
              ${isSelected ? 'text-fg-primary font-medium' : 'text-fg-secondary'}
              ${isVolume ? 'font-semibold' : ''}
            `}>
              {node.name}
            </span>
          )}

          {isReadOnly && node.type === 'volume' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-fg-tertiary font-normal">
              RO
            </span>
          )}

          {isVFSNode && !isReadOnly && !isRenaming && (
            <button
              className="opacity-30 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-fg-tertiary hover:text-red-400 transition-all ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(node);
              }}
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const countItems = (nodes: TreeNode[]): number => {
    return nodes.reduce((count, node) => {
      let total = node.type === 'file' ? 1 : 0;
      if (node.children) {
        total += countItems(node.children);
      }
      return count + total;
    }, 0);
  };

  const activeVolumeNode = treeData.find(v => v.id === activeVolume);
  const activeVolumeItemCount = activeVolumeNode ? countItems(activeVolumeNode.children || []) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-primary/50 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">
          Explorer
        </span>
        <div className="flex items-center gap-1">
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
      </div>

      {/* File tree */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 py-2 scrollbar-thin">
        {treeData.map((volumeNode) => renderTreeNode(volumeNode, 0))}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border-primary/50 bg-bg-secondary/30">
        <div className="text-[10px] text-fg-tertiary flex items-center gap-3">
          {isLoading ? (
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse"></span>
              Loading...
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-accent-success"></span>
                {activeVolumeItemCount} items
              </span>
              <span>•</span>
              <span>{activeVolume}</span>
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.node ? getContextMenuItems(contextMenu.node) : []}
        onClose={closeContextMenu}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.node?.type === 'folder' ? 'Delete Folder' : 'Delete File'}
        message={`Are you sure you want to delete "${deleteConfirm.node?.name}"?${deleteConfirm.node?.type === 'folder' ? ' This will delete all contents.' : ''}`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, node: null })}
        danger
      />
    </div>
  );
}
