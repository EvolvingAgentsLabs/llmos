/**
 * Artifact Manager
 *
 * Centralized management of all artifacts (agents, tools, skills, code, workflows)
 */

import {
  Artifact,
  CreateArtifactParams,
  UpdateArtifactParams,
  ArtifactFilterOptions,
  ArtifactSortOptions,
  ArtifactType,
  ArtifactVolume,
  ArtifactStatus,
} from './types';

export class ArtifactManager {
  private artifacts: Map<string, Artifact> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the artifact manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load artifacts from localStorage
    this.loadFromStorage();

    // Load system agents from public folder
    await this.loadSystemAgents();

    this.initialized = true;
  }

  /**
   * Load system agents from /public/system/agents/
   */
  private async loadSystemAgents(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Known system agents
    const systemAgents = [
      'RobotAIAgent.md',
      'SystemAgent.md',
      'PlanningAgent.md',
      'PatternMatcherAgent.md',
      'UXDesigner.md',
      'ProjectAgentPlanner.md',
      'HardwareControlAgent.md',
      'MutationAgent.md',
      'LensSelectorAgent.md',
      'MemoryAnalysisAgent.md',
      'MemoryConsolidationAgent.md',
      'AppletDebuggerAgent.md',
      'ExecutionStrategyAgent.md',
    ];

    for (const fileName of systemAgents) {
      try {
        // Check if this agent is already loaded
        const existingAgent = this.getAll().find(
          (a) => a.volume === 'system' && a.type === 'agent' && a.filePath === `/system/agents/${fileName}`
        );
        if (existingAgent) continue;

        // Fetch from public folder
        const response = await fetch(`/system/agents/${fileName}`);
        if (!response.ok) continue;

        const content = await response.text();

        // Parse frontmatter to get agent metadata
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let name = fileName.replace('.md', '');
        let description = '';
        let id = name.toLowerCase().replace(/\s+/g, '-');

        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
          const idMatch = frontmatter.match(/^id:\s*(.+)$/m);

          if (nameMatch) name = nameMatch[1].trim();
          if (descMatch) description = descMatch[1].trim();
          if (idMatch) id = idMatch[1].trim();
        }

        // Create artifact for the system agent
        const now = new Date().toISOString();
        const artifact: Artifact = {
          id: `system-agent-${id}`,
          name,
          type: 'agent',
          volume: 'system',
          status: 'committed',
          createdAt: now,
          updatedAt: now,
          createdBy: 'system',
          description,
          codeView: content,
          filePath: `/system/agents/${fileName}`,
          tags: ['robot', 'hardware', 'ai-agent'].filter((tag) =>
            fileName.toLowerCase().includes('robot') || fileName.toLowerCase().includes('hardware')
              ? true
              : tag !== 'robot' && tag !== 'hardware'
          ),
        };

        this.artifacts.set(artifact.id, artifact);
      } catch (error) {
        console.warn(`Failed to load system agent ${fileName}:`, error);
      }
    }

    // Save loaded agents
    this.saveToStorage();
  }

  /**
   * Create a new artifact
   */
  create(params: CreateArtifactParams): Artifact {
    const now = new Date().toISOString();
    const artifact: Artifact = {
      ...params,
      id: `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: params.status || 'temporal',
      createdAt: now,
      updatedAt: now,
    };

    this.artifacts.set(artifact.id, artifact);
    this.saveToStorage();

    return artifact;
  }

  /**
   * Get artifact by ID
   */
  get(id: string): Artifact | undefined {
    return this.artifacts.get(id);
  }

  /**
   * Get all artifacts
   */
  getAll(): Artifact[] {
    return Array.from(this.artifacts.values());
  }

  /**
   * Update an artifact
   */
  update(id: string, params: UpdateArtifactParams): Artifact | undefined {
    const artifact = this.artifacts.get(id);
    if (!artifact) return undefined;

    const updated: Artifact = {
      ...artifact,
      ...params,
      updatedAt: new Date().toISOString(),
    };

    this.artifacts.set(id, updated);
    this.saveToStorage();

    return updated;
  }

  /**
   * Delete an artifact
   */
  delete(id: string): boolean {
    const deleted = this.artifacts.delete(id);
    if (deleted) {
      this.saveToStorage();
    }
    return deleted;
  }

  /**
   * Filter artifacts
   */
  filter(options: ArtifactFilterOptions): Artifact[] {
    let filtered = this.getAll();

    // Filter by type
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      filtered = filtered.filter((a) => types.includes(a.type));
    }

    // Filter by volume
    if (options.volume) {
      const volumes = Array.isArray(options.volume) ? options.volume : [options.volume];
      filtered = filtered.filter((a) => volumes.includes(a.volume));
    }

    // Filter by status
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      filtered = filtered.filter((a) => statuses.includes(a.status));
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter((a) =>
        options.tags!.some((tag) => a.tags?.includes(tag))
      );
    }

    // Filter by search
    if (options.search) {
      const search = options.search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(search) ||
          a.description?.toLowerCase().includes(search)
      );
    }

    // Filter by creator
    if (options.createdBy) {
      filtered = filtered.filter((a) => a.createdBy === options.createdBy);
    }

    return filtered;
  }

  /**
   * Sort artifacts
   */
  sort(artifacts: Artifact[], options: ArtifactSortOptions): Artifact[] {
    const sorted = [...artifacts];
    const { by, order } = options;

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (by) {
        case 'createdAt':
        case 'updatedAt':
          comparison = new Date(a[by]).getTime() - new Date(b[by]).getTime();
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Find artifacts by reference name (for @ autocomplete)
   */
  findByReference(prefix: string): Artifact[] {
    const search = prefix.toLowerCase().replace('@', '');
    return this.getAll()
      .filter((a) => a.name.toLowerCase().includes(search))
      .slice(0, 10); // Limit to 10 results for autocomplete
  }

  /**
   * Get artifacts by session
   */
  getBySession(sessionId: string): Artifact[] {
    return this.filter({ createdBy: sessionId });
  }

  /**
   * Get artifacts by volume
   */
  getByVolume(volume: ArtifactVolume): Artifact[] {
    return this.filter({ volume });
  }

  /**
   * Get temporal artifacts (unsaved)
   */
  getTemporal(): Artifact[] {
    return this.filter({ status: 'temporal' });
  }

  /**
   * Get committed artifacts (saved)
   */
  getCommitted(): Artifact[] {
    return this.filter({ status: 'committed' });
  }

  /**
   * Mark artifact as committed (after GitHub save)
   */
  commit(id: string, commitHash: string, filePath: string): Artifact | undefined {
    return this.update(id, {
      status: 'committed',
      commitHash,
      filePath,
    });
  }

  /**
   * Fork an artifact (create a copy in user volume)
   */
  fork(id: string, targetVolume: ArtifactVolume = 'user'): Artifact | undefined {
    const original = this.get(id);
    if (!original) return undefined;

    // Omit fields that are excluded from CreateArtifactParams
    const { id: _id, createdAt, updatedAt, status: _status, commitHash: _commitHash, ...baseParams } = original;

    const forked = this.create({
      ...baseParams,
      name: `${original.name} (fork)`,
      volume: targetVolume,
      parentId: original.id,
    });

    return forked;
  }

  /**
   * Get artifact dependencies (recursive)
   */
  getDependencies(id: string): Artifact[] {
    const artifact = this.get(id);
    if (!artifact || !artifact.dependencies) return [];

    const deps: Artifact[] = [];
    const visited = new Set<string>();

    const collect = (depId: string) => {
      if (visited.has(depId)) return;
      visited.add(depId);

      const dep = this.get(depId);
      if (dep) {
        deps.push(dep);
        dep.dependencies?.forEach(collect);
      }
    };

    artifact.dependencies.forEach(collect);
    return deps;
  }

  /**
   * Check if artifact has unsaved changes
   */
  hasUnsavedChanges(id: string): boolean {
    const artifact = this.get(id);
    return artifact?.status === 'temporal';
  }

  /**
   * Get artifact statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      byType: {
        agent: all.filter((a) => a.type === 'agent').length,
        tool: all.filter((a) => a.type === 'tool').length,
        skill: all.filter((a) => a.type === 'skill').length,
        workflow: all.filter((a) => a.type === 'workflow').length,
        code: all.filter((a) => a.type === 'code').length,
      },
      byVolume: {
        system: all.filter((a) => a.volume === 'system').length,
        team: all.filter((a) => a.volume === 'team').length,
        user: all.filter((a) => a.volume === 'user').length,
      },
      byStatus: {
        temporal: all.filter((a) => a.status === 'temporal').length,
        committed: all.filter((a) => a.status === 'committed').length,
      },
    };
  }

  /**
   * Clear all artifacts (mainly for testing)
   */
  clear(): void {
    this.artifacts.clear();
    this.saveToStorage();
  }

  /**
   * Load artifacts from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('llmos_artifacts');
      if (stored) {
        const artifacts: Artifact[] = JSON.parse(stored);
        this.artifacts = new Map(artifacts.map((a) => [a.id, a]));
      }
    } catch (error) {
      console.error('Failed to load artifacts from storage:', error);
    }
  }

  /**
   * Save artifacts to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const artifacts = this.getAll();
      localStorage.setItem('llmos_artifacts', JSON.stringify(artifacts));
    } catch (error) {
      console.error('Failed to save artifacts to storage:', error);
    }
  }
}

// Singleton instance
export const artifactManager = new ArtifactManager();
