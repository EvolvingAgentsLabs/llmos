'use client';

import { useState, useCallback, useEffect } from 'react';
import { getVFS } from '@/lib/virtual-fs';
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
  DesktopIcon,
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
    size?: string;
    modified?: string;
    action?: 'desktop' | 'applet' | 'code' | 'file';
  };
}

interface VSCodeFileTreeProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  onFileSelect?: (node: TreeNode) => void;
  onDesktopSelect?: () => void;
  onCodeFileSelect?: (path: string) => void;
  selectedFile?: string | null;
}

// Mock data structure - Single tree with volumes as root drives
const ROOT_TREE: TreeNode[] = [
  // Desktop - Special item at the top
  {
    id: 'desktop',
    name: 'Desktop',
    type: 'special',
    path: '/desktop',
    metadata: { action: 'desktop' },
  },
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
          { id: 'system-agent', name: 'SystemAgent.md', type: 'file', path: '/volumes/system/agents/SystemAgent.md', metadata: { fileType: 'agent', readonly: true } },
          { id: 'memory-analysis', name: 'MemoryAnalysisAgent.md', type: 'file', path: '/volumes/system/agents/MemoryAnalysisAgent.md', metadata: { fileType: 'agent', readonly: true } },
          { id: 'memory-consolidation', name: 'MemoryConsolidationAgent.md', type: 'file', path: '/volumes/system/agents/MemoryConsolidationAgent.md', metadata: { fileType: 'agent', readonly: true } },
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
      {
        id: 'system-memory-log',
        name: 'memory_log.md',
        type: 'file',
        path: '/volumes/system/memory_log.md',
        metadata: { readonly: true },
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
        id: 'user-projects',
        name: 'projects',
        type: 'folder',
        path: '/volumes/user/projects',
        children: [], // Will be populated dynamically from VFS
      },
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
  onDesktopSelect,
  onCodeFileSelect,
  selectedFile,
}: VSCodeFileTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['system', 'system-agents', 'system-tools', 'system-skills'])
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Check if a file is a code file based on extension
  const isCodeFile = (filename: string): boolean => {
    const codeExtensions = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'css', 'html', 'md'];
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return codeExtensions.includes(ext);
  };
  const [treeData, setTreeData] = useState<TreeNode[]>(ROOT_TREE);

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

  // Load VFS projects on mount and when activeVolume changes
  useEffect(() => {
    const loadVFSProjects = () => {
      try {
        const vfs = getVFS();
        const { files, directories } = vfs.listDirectory('projects');

        // Build tree from VFS
        const vfsProjects = buildVFSTree(files, directories);

        // Update tree data
        setTreeData(prev => {
          const newTree = JSON.parse(JSON.stringify(prev)) as TreeNode[];
          const userVolume = newTree.find(v => v.id === 'user');
          if (userVolume && userVolume.children) {
            const projectsFolder = userVolume.children.find(f => f.id === 'user-projects');
            if (projectsFolder) {
              projectsFolder.children = vfsProjects;
            }
          }
          return newTree;
        });
      } catch (error) {
        console.error('Failed to load VFS projects:', error);
      }
    };

    loadVFSProjects();

    // Refresh every 2 seconds to pick up new files
    const interval = setInterval(loadVFSProjects, 2000);
    return () => clearInterval(interval);
  }, [activeVolume]);

  // Helper to build tree from VFS files
  const buildVFSTree = (files: any[], directories: string[]): TreeNode[] => {
    // Get all VFS files (not just direct children)
    const vfs = getVFS();
    const allFiles = vfs.getAllFiles();

    // Filter for files in projects/ directory
    const projectFiles = allFiles.filter(f => f.path.startsWith('projects/'));

    // Build a map of all nodes (directories and files)
    const nodeMap = new Map<string, TreeNode>();

    // Helper to ensure a directory node exists
    const ensureDirectory = (path: string): TreeNode => {
      if (nodeMap.has(path)) {
        return nodeMap.get(path)!;
      }

      const parts = path.split('/');
      const name = parts[parts.length - 1];

      const node: TreeNode = {
        id: `vfs-dir-${path}`,
        name,
        type: 'folder',
        path,
        children: [],
      };

      nodeMap.set(path, node);

      // Ensure parent directory exists and add this as a child
      if (parts.length > 2) { // More than just 'projects/projectname'
        const parentPath = parts.slice(0, -1).join('/');
        const parentNode = ensureDirectory(parentPath);
        if (parentNode.children && !parentNode.children.find(c => c.id === node.id)) {
          parentNode.children.push(node);
        }
      }

      return node;
    };

    // Process all files
    projectFiles.forEach(file => {
      const parts = file.path.split('/');

      // Ensure all parent directories exist
      if (parts.length > 2) {
        const dirPath = parts.slice(0, -1).join('/');
        ensureDirectory(dirPath);
      }

      // Create file node
      const fileName = parts[parts.length - 1];
      const fileNode: TreeNode = {
        id: `vfs-file-${file.path}`,
        name: fileName,
        type: 'file',
        path: file.path,
        metadata: {
          size: `${(file.size / 1024).toFixed(1)} KB`,
          modified: new Date(file.modified).toLocaleString(),
        },
      };

      // Add file to its parent directory
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = nodeMap.get(parentPath);
      if (parentNode && parentNode.children) {
        parentNode.children.push(fileNode);
      }
    });

    // Return only top-level project directories (children of 'projects/')
    const topLevelProjects: TreeNode[] = [];
    nodeMap.forEach((node, path) => {
      const parts = path.split('/');
      if (parts.length === 2 && parts[0] === 'projects') {
        // Sort children (directories first, then files, both alphabetically)
        if (node.children) {
          node.children.sort((a, b) => {
            if (a.type === b.type) {
              return a.name.localeCompare(b.name);
            }
            return a.type === 'folder' ? -1 : 1;
          });

          // Recursively sort all descendants
          const sortChildren = (n: TreeNode) => {
            if (n.children) {
              n.children.sort((a, b) => {
                if (a.type === b.type) {
                  return a.name.localeCompare(b.name);
                }
                return a.type === 'folder' ? -1 : 1;
              });
              n.children.forEach(sortChildren);
            }
          };
          sortChildren(node);
        }

        topLevelProjects.push(node);
      }
    });

    // Sort top-level projects
    topLevelProjects.sort((a, b) => a.name.localeCompare(b.name));

    return topLevelProjects;
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

    // If clicking a volume node, notify parent
    if (volumeType) {
      onVolumeChange(volumeType);
    }
  }, [onVolumeChange]);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't show context menu for system volume items (read-only)
    if (node.metadata?.readonly) {
      return;
    }

    // Only show context menu for VFS files/folders (user projects)
    if (!node.id.startsWith('vfs-')) {
      return;
    }

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      node,
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, node: null });
  }, []);

  // Handle delete confirmation
  const handleDeleteClick = useCallback((node: TreeNode) => {
    setDeleteConfirm({ isOpen: true, node });
    closeContextMenu();
  }, [closeContextMenu]);

  // Perform delete
  const handleDelete = useCallback(() => {
    const node = deleteConfirm.node;
    if (!node) return;

    try {
      const vfs = getVFS();

      // Extract the actual VFS path from the node
      // VFS paths are stored as 'projects/...' but node.path might be the full path
      let vfsPath = node.path;

      // If it's a vfs node, extract path from id
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

      // Close dialog
      setDeleteConfirm({ isOpen: false, node: null });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }, [deleteConfirm.node]);

  // Handle rename
  const handleRename = useCallback((node: TreeNode) => {
    setRenameNode({ id: node.id, name: node.name });
    closeContextMenu();
  }, [closeContextMenu]);

  // Perform rename
  const performRename = useCallback((newName: string) => {
    if (!renameNode || !newName.trim()) {
      setRenameNode(null);
      return;
    }

    try {
      const vfs = getVFS();

      // Extract path from node id
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

  // Get context menu items for a node
  const getContextMenuItems = useCallback((node: TreeNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (node.type === 'folder') {
      items.push({
        id: 'new-file',
        label: 'New File',
        icon: <FilePlusIcon />,
        action: () => {
          // TODO: Implement new file creation
          closeContextMenu();
        },
        disabled: true, // For now
      });
      items.push({
        id: 'new-folder',
        label: 'New Folder',
        icon: <FolderPlusIcon />,
        action: () => {
          // TODO: Implement new folder creation
          closeContextMenu();
        },
        disabled: true, // For now
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
    // Special items (Desktop, etc.)
    if (node.type === 'special') {
      if (node.metadata?.action === 'desktop') {
        return <DesktopIcon />;
      }
    }

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
    const isSelected = selectedFile === node.id || selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isReadOnly = node.metadata?.readonly;
    const isVolume = node.type === 'volume';
    const isSpecial = node.type === 'special';
    const isRenaming = renameNode?.id === node.id;
    const isVFSNode = node.id.startsWith('vfs-');

    // Handle node click
    const handleNodeClick = () => {
      setSelectedNodeId(node.id);

      // Handle special nodes (Desktop, etc.)
      if (isSpecial) {
        if (node.metadata?.action === 'desktop' && onDesktopSelect) {
          onDesktopSelect();
        }
        return;
      }

      // Handle folders and volumes - toggle expand
      if (node.type === 'folder' || node.type === 'volume') {
        toggleNode(node.id, node.metadata?.volume as 'system' | 'team' | 'user' | undefined);
        return;
      }

      // Handle files
      if (node.type === 'file') {
        // Check if it's a code file
        if (isCodeFile(node.name) && onCodeFileSelect) {
          onCodeFileSelect(node.path);
        } else if (onFileSelect) {
          onFileSelect(node);
        }
      }
    };

    return (
      <div key={node.id}>
        {/* Node row */}
        <div
          className={`
            group flex items-center gap-1 py-0.5 px-1 cursor-pointer
            transition-colors duration-100
            ${isSelected ? 'bg-accent-primary/20' : 'hover:bg-bg-tertiary'}
            ${isVolume || isSpecial ? 'font-semibold' : ''}
          `}
          style={{ paddingLeft: `${depth * 8 + 4}px` }}
          onClick={handleNodeClick}
          onContextMenu={(e) => handleContextMenu(e, node)}
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

          {/* Name or Rename Input */}
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

          {/* Read-only badge */}
          {isReadOnly && node.type === 'volume' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-bg-elevated text-fg-tertiary font-normal">
              RO
            </span>
          )}

          {/* Delete button on hover (for VFS nodes only) */}
          {isVFSNode && !isReadOnly && !isRenaming && (
            <button
              className="opacity-30 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-fg-tertiary hover:text-red-400 transition-all ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(node);
              }}
              title="Delete (or right-click for more options)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
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

  const activeVolumeNode = treeData.find(v => v.id === activeVolume);
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 py-2 scrollbar-thin">
        {treeData.map((volumeNode) => renderTreeNode(volumeNode, 0))}
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

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.node ? getContextMenuItems(contextMenu.node) : []}
        onClose={closeContextMenu}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.node?.type === 'folder' ? 'Delete Folder' : 'Delete File'}
        message={`Are you sure you want to delete "${deleteConfirm.node?.name}"?${deleteConfirm.node?.type === 'folder' ? ' This will delete all contents inside.' : ''} This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, node: null })}
        danger
      />
    </div>
  );
}
