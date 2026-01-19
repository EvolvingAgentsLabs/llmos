import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface FileNode {
  id: string;
  name: string;
  type: 'volume' | 'folder' | 'file';
  path: string;
  children?: FileNode[];
  metadata?: {
    readonly?: boolean;
    volume?: 'system' | 'team' | 'user';
    fileType?: string;
    size?: number;
    modified?: string;
  };
}

/**
 * Recursively build file tree from filesystem
 */
function buildFileTree(
  dirPath: string,
  volumeName: string,
  basePath: string,
  readonly: boolean = false
): FileNode[] {
  const nodes: FileNode[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const relativePath = path.join(basePath, entry.name);
      const volumePath = `/volumes/${volumeName}/${relativePath}`;

      if (entry.isDirectory()) {
        // Recursively get children
        const children = buildFileTree(entryPath, volumeName, relativePath, readonly);

        nodes.push({
          id: `${volumeName}-${relativePath.replace(/\//g, '-')}`,
          name: entry.name,
          type: 'folder',
          path: volumePath,
          children,
          metadata: {
            readonly,
            volume: volumeName as 'system' | 'team' | 'user',
          },
        });
      } else if (entry.isFile()) {
        // Get file stats
        const stats = fs.statSync(entryPath);

        // Determine file type from extension or directory
        let fileType: string | undefined;
        const ext = path.extname(entry.name).toLowerCase();
        const parentDir = path.basename(path.dirname(entryPath));

        if (parentDir === 'agents' && ext === '.md') {
          fileType = 'agent';
        } else if (parentDir === 'tools' && ext === '.md') {
          fileType = 'tool';
        } else if (parentDir === 'skills' && ext === '.md') {
          fileType = 'skill';
        }

        nodes.push({
          id: `${volumeName}-${relativePath.replace(/[\/.]/g, '-')}`,
          name: entry.name,
          type: 'file',
          path: volumePath,
          metadata: {
            readonly,
            volume: volumeName as 'system' | 'team' | 'user',
            fileType,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          },
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  // Sort: folders first, then alphabetically
  nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * GET /api/volumes - List all volume files
 */
export async function GET() {
  try {
    const volumesDir = path.join(process.cwd(), 'volumes');

    const volumes: FileNode[] = [];

    // System volume (read-only)
    const systemDir = path.join(volumesDir, 'system');
    if (fs.existsSync(systemDir)) {
      const systemChildren = buildFileTree(systemDir, 'system', '', true);
      volumes.push({
        id: 'system',
        name: 'System',
        type: 'volume',
        path: '/volumes/system',
        children: systemChildren,
        metadata: {
          volume: 'system',
          readonly: true,
        },
      });
    }

    // Team volume
    const teamDir = path.join(volumesDir, 'team');
    if (fs.existsSync(teamDir)) {
      const teamChildren = buildFileTree(teamDir, 'team', '', false);
      volumes.push({
        id: 'team',
        name: 'Team',
        type: 'volume',
        path: '/volumes/team',
        children: teamChildren,
        metadata: {
          volume: 'team',
          readonly: false,
        },
      });
    } else {
      // Add empty team volume
      volumes.push({
        id: 'team',
        name: 'Team',
        type: 'volume',
        path: '/volumes/team',
        children: [],
        metadata: {
          volume: 'team',
          readonly: false,
        },
      });
    }

    // User volume (VFS-based, handled client-side)
    volumes.push({
      id: 'user',
      name: 'User',
      type: 'volume',
      path: '/volumes/user',
      children: [], // Populated from VFS on client
      metadata: {
        volume: 'user',
        readonly: false,
      },
    });

    return NextResponse.json({
      success: true,
      volumes,
    });
  } catch (error) {
    console.error('Error listing volumes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list volumes' },
      { status: 500 }
    );
  }
}
