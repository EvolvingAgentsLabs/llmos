/**
 * Project Context Resolver
 *
 * Resolves UI project context to VFS project context for the SystemAgent.
 * Enables continuation of work on existing projects.
 */

import { getVFS } from './virtual-fs';
import type { ProjectContext } from './system-agent-orchestrator';
import type { Project } from '@/contexts/ProjectContext';

/**
 * Convert a project name to a valid VFS directory name
 */
export function projectNameToPath(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // Remove special chars except spaces, underscores, hyphens
    .replace(/\s+/g, '_')          // Replace spaces with underscores
    .replace(/_+/g, '_')           // Collapse multiple underscores
    .replace(/^_|_$/g, '');        // Trim leading/trailing underscores
}

/**
 * Find the VFS project path for a given project name
 * Searches in both user and team volumes
 */
export function findProjectPath(projectName: string, volume: 'user' | 'team' | 'system'): string | null {
  const vfs = getVFS();
  const basePath = 'projects';

  // Try exact match first
  const exactPath = `${basePath}/${projectName}`;
  if (vfs.exists(exactPath)) {
    return exactPath;
  }

  // Try normalized path
  const normalizedPath = `${basePath}/${projectNameToPath(projectName)}`;
  if (vfs.exists(normalizedPath)) {
    return normalizedPath;
  }

  // Search for similar names in the projects directory
  try {
    const projectDirs = vfs.listDirectory(basePath);
    if (projectDirs?.directories) {
      const normalizedName = projectNameToPath(projectName);

      // Find closest match
      for (const dir of projectDirs.directories) {
        const dirNormalized = projectNameToPath(dir);
        if (dirNormalized === normalizedName || dir.toLowerCase() === projectName.toLowerCase()) {
          return `${basePath}/${dir}`;
        }
      }
    }
  } catch (e) {
    console.log('[ProjectContextResolver] Could not list projects directory:', e);
  }

  return null;
}

/**
 * List all files in a project directory recursively
 */
function listProjectFiles(projectPath: string, maxDepth: number = 5): string[] {
  const vfs = getVFS();
  const files: string[] = [];

  function traverse(path: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const listing = vfs.listDirectory(path);

      if (listing?.files) {
        for (const file of listing.files) {
          files.push(`${path}/${file}`);
        }
      }

      if (listing?.directories) {
        for (const dir of listing.directories) {
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

  traverse(projectPath, 0);
  return files;
}

/**
 * Resolve project context for the SystemAgent
 * Returns full context including existing files and memory
 */
export async function resolveProjectContext(
  project: Project | null,
  volume: 'user' | 'team' | 'system'
): Promise<ProjectContext | null> {
  if (!project) {
    return null;
  }

  const vfs = getVFS();

  // Find the VFS path for this project
  const projectPath = findProjectPath(project.name, volume);

  if (!projectPath) {
    // No existing VFS project found
    console.log('[ProjectContextResolver] No VFS project found for:', project.name);
    return null;
  }

  // Read context.md if it exists
  let contextFile: string | undefined;
  const contextPath = `${projectPath}/context.md`;
  try {
    if (vfs.exists(contextPath)) {
      const content = vfs.readFileContent(contextPath);
      if (content) contextFile = content;
    }
  } catch (e) {
    console.log('[ProjectContextResolver] Could not read context.md:', e);
  }

  // Read memory.md if it exists
  let memoryFile: string | undefined;
  const memoryPath = `${projectPath}/memory.md`;
  try {
    if (vfs.exists(memoryPath)) {
      const content = vfs.readFileContent(memoryPath);
      if (content) memoryFile = content;
    }
  } catch (e) {
    console.log('[ProjectContextResolver] Could not read memory.md:', e);
  }

  // List existing files
  const existingFiles = listProjectFiles(projectPath);

  console.log('[ProjectContextResolver] Resolved context:', {
    projectPath,
    projectName: project.name,
    hasContext: !!contextFile,
    hasMemory: !!memoryFile,
    fileCount: existingFiles.length,
  });

  return {
    projectPath,
    projectName: project.name,
    contextFile,
    memoryFile,
    existingFiles,
    isExistingProject: true,
  };
}

/**
 * Quick check if a project has an existing VFS directory
 */
export function hasExistingProjectFiles(projectName: string, volume: 'user' | 'team' | 'system'): boolean {
  return findProjectPath(projectName, volume) !== null;
}

/**
 * Get a summary of an existing project for display
 */
export function getProjectSummary(projectPath: string): {
  hasAgents: boolean;
  hasApplets: boolean;
  hasCode: boolean;
  agentCount: number;
  appletCount: number;
  codeFileCount: number;
} {
  const vfs = getVFS();

  let hasAgents = false;
  let hasApplets = false;
  let hasCode = false;
  let agentCount = 0;
  let appletCount = 0;
  let codeFileCount = 0;

  try {
    // Check for agents
    const agentsPath = `${projectPath}/components/agents`;
    if (vfs.exists(agentsPath)) {
      const agents = vfs.listDirectory(agentsPath);
      agentCount = agents?.files?.filter(f => f.path.endsWith('.md')).length || 0;
      hasAgents = agentCount > 0;
    }

    // Check for applets
    const appletsPath = `${projectPath}/applets`;
    if (vfs.exists(appletsPath)) {
      const applets = vfs.listDirectory(appletsPath);
      appletCount = applets?.files?.filter(f => f.path.endsWith('.tsx') || f.path.endsWith('.jsx')).length || 0;
      hasApplets = appletCount > 0;
    }

    // Check for code files
    const codePath = `${projectPath}/output/code`;
    if (vfs.exists(codePath)) {
      const codeFiles = vfs.listDirectory(codePath);
      codeFileCount = codeFiles?.files?.filter(f =>
        f.path.endsWith('.py') || f.path.endsWith('.js') || f.path.endsWith('.ts')
      ).length || 0;
      hasCode = codeFileCount > 0;
    }
  } catch (e) {
    console.log('[ProjectContextResolver] Error getting project summary:', e);
  }

  return {
    hasAgents,
    hasApplets,
    hasCode,
    agentCount,
    appletCount,
    codeFileCount,
  };
}
