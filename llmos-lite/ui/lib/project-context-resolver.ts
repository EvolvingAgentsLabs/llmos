/**
 * Workspace Context Resolver
 *
 * Resolves workspace context from volumes for the SystemAgent.
 * The workspace IS the volume - the AI decides what context is relevant.
 *
 * Previously this was "project-context-resolver" but we've simplified
 * to remove the concept of projects. Now everything works with volumes directly.
 */

import { getVFS } from './virtual-fs';
import type { WorkspaceContext } from './system-agent-orchestrator';

export type VolumeType = 'user' | 'team' | 'system';

/**
 * List all files in a directory recursively (for workspace context)
 */
function listWorkspaceFiles(basePath: string, maxDepth: number = 5, maxFiles: number = 100): string[] {
  const vfs = getVFS();
  const files: string[] = [];

  function traverse(path: string, depth: number) {
    if (depth > maxDepth || files.length >= maxFiles) return;

    try {
      const listing = vfs.listDirectory(path);

      if (listing?.files) {
        for (const file of listing.files) {
          if (files.length >= maxFiles) break;
          files.push(`${path}/${file}`);
        }
      }

      if (listing?.directories) {
        for (const dir of listing.directories) {
          if (files.length >= maxFiles) break;
          // Skip hidden directories and common non-essential ones
          if (dir.startsWith('.') || dir === 'node_modules' || dir === '__pycache__') {
            continue;
          }
          traverse(`${path}/${dir}`, depth + 1);
        }
      }
    } catch (e) {
      // Directory may not exist or be readable
    }
  }

  traverse(basePath, 0);
  return files;
}

/**
 * Get top-level directories in a volume (these are the "work areas")
 */
function getVolumeSections(volumeRoot: string): string[] {
  const vfs = getVFS();
  const sections: string[] = [];

  try {
    const listing = vfs.listDirectory(volumeRoot);
    if (listing?.directories) {
      sections.push(...listing.directories.filter(d => !d.startsWith('.')));
    }
  } catch (e) {
    console.log('[WorkspaceContextResolver] Could not list volume:', e);
  }

  return sections;
}

/**
 * Resolve workspace context for the SystemAgent
 * The entire volume is the workspace - AI decides what's relevant
 */
export async function resolveWorkspaceContext(
  volume: VolumeType
): Promise<WorkspaceContext | null> {
  const vfs = getVFS();

  // The volume root is the workspace
  // User volume is the default, team volume for team work
  const volumeRoot = volume === 'system' ? 'system' : '';

  console.log('[WorkspaceContextResolver] Resolving workspace for volume:', volume);

  // Get sections in the workspace
  const sections = getVolumeSections(volumeRoot || '.');

  // List important files in the workspace (limit to prevent context overflow)
  const workspaceFiles = listWorkspaceFiles(volumeRoot || '.', 4, 50);

  // Read workspace memory if it exists
  let memoryFile: string | undefined;
  const memoryPath = `${volumeRoot ? volumeRoot + '/' : ''}memory/workspace_memory.md`;
  try {
    if (vfs.exists(memoryPath)) {
      const content = vfs.readFileContent(memoryPath);
      if (content) memoryFile = content;
    }
  } catch (e) {
    console.log('[WorkspaceContextResolver] Could not read workspace memory:', e);
  }

  // Read system memory log
  let systemMemory: string | undefined;
  const systemMemoryPath = 'system/memory_log.md';
  try {
    if (vfs.exists(systemMemoryPath)) {
      const content = vfs.readFileContent(systemMemoryPath);
      if (content) {
        // Only take last 2000 chars to prevent context overflow
        systemMemory = content.length > 2000
          ? '...\n' + content.substring(content.length - 2000)
          : content;
      }
    }
  } catch (e) {
    console.log('[WorkspaceContextResolver] Could not read system memory:', e);
  }

  console.log('[WorkspaceContextResolver] Resolved context:', {
    volume,
    sections: sections.length,
    fileCount: workspaceFiles.length,
    hasMemory: !!memoryFile,
    hasSystemMemory: !!systemMemory,
  });

  return {
    volume,
    workspacePath: volumeRoot || '.',
    sections,
    existingFiles: workspaceFiles,
    memoryFile,
    systemMemory,
  };
}

/**
 * Get a summary of the workspace for display
 */
export function getWorkspaceSummary(volume: VolumeType): {
  hasAgents: boolean;
  hasApplets: boolean;
  hasCode: boolean;
  hasProjects: boolean;
  agentCount: number;
  appletCount: number;
  projectCount: number;
} {
  const vfs = getVFS();
  const volumeRoot = volume === 'system' ? 'system' : '';

  let hasAgents = false;
  let hasApplets = false;
  let hasCode = false;
  let hasProjects = false;
  let agentCount = 0;
  let appletCount = 0;
  let projectCount = 0;

  try {
    // Check for agents in components/agents
    const agentsPath = `${volumeRoot ? volumeRoot + '/' : ''}components/agents`;
    if (vfs.exists(agentsPath)) {
      const agents = vfs.listDirectory(agentsPath);
      agentCount = agents?.files?.filter(f => f.path.endsWith('.md')).length || 0;
      hasAgents = agentCount > 0;
    }

    // Check for applets
    const appletsPath = `${volumeRoot ? volumeRoot + '/' : ''}applets`;
    if (vfs.exists(appletsPath)) {
      const applets = vfs.listDirectory(appletsPath);
      appletCount = applets?.files?.filter(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx')).length || 0;
      hasApplets = appletCount > 0;
    }

    // Check for projects folder (legacy structure)
    const projectsPath = `${volumeRoot ? volumeRoot + '/' : ''}projects`;
    if (vfs.exists(projectsPath)) {
      const projects = vfs.listDirectory(projectsPath);
      projectCount = projects?.directories?.length || 0;
      hasProjects = projectCount > 0;
    }

    // Check for code files in output
    const outputPath = `${volumeRoot ? volumeRoot + '/' : ''}output`;
    if (vfs.exists(outputPath)) {
      const codeFiles = listWorkspaceFiles(outputPath, 3, 20);
      hasCode = codeFiles.some(f =>
        f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.ts')
      );
    }
  } catch (e) {
    console.log('[WorkspaceContextResolver] Error getting workspace summary:', e);
  }

  return {
    hasAgents,
    hasApplets,
    hasCode,
    hasProjects,
    agentCount,
    appletCount,
    projectCount,
  };
}

// ============================================
// BACKWARD COMPATIBILITY - Deprecated functions
// ============================================

/**
 * @deprecated Use resolveWorkspaceContext instead
 */
export function projectNameToPath(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * @deprecated Projects no longer exist - use volumes directly
 */
export function findProjectPath(projectName: string, volume: 'user' | 'team' | 'system'): string | null {
  const vfs = getVFS();
  const basePath = 'projects';

  const exactPath = `${basePath}/${projectName}`;
  if (vfs.exists(exactPath)) {
    return exactPath;
  }

  const normalizedPath = `${basePath}/${projectNameToPath(projectName)}`;
  if (vfs.exists(normalizedPath)) {
    return normalizedPath;
  }

  return null;
}

/**
 * @deprecated Use resolveWorkspaceContext instead
 */
export async function resolveProjectContext(
  project: any,
  volume: 'user' | 'team' | 'system'
): Promise<any | null> {
  // Just return workspace context for the volume
  return resolveWorkspaceContext(volume);
}

/**
 * @deprecated Projects no longer exist
 */
export function hasExistingProjectFiles(projectName: string, volume: 'user' | 'team' | 'system'): boolean {
  return findProjectPath(projectName, volume) !== null;
}

/**
 * @deprecated Use getWorkspaceSummary instead
 */
export function getProjectSummary(projectPath: string): {
  hasAgents: boolean;
  hasApplets: boolean;
  hasCode: boolean;
  agentCount: number;
  appletCount: number;
  codeFileCount: number;
} {
  return {
    ...getWorkspaceSummary('user'),
    codeFileCount: 0,
  };
}
