/**
 * Volume Loader - Auto-load tools, agents, and skills from GitHub volumes
 *
 * Integrates with GitService to fetch markdown files from repositories
 */

import { Tool, parseToolFromMarkdown } from './tool-executor';
import { Agent, parseAgentFromMarkdown } from './agent-executor';

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string; // Full markdown content
  usesTools?: string[];
  usesAgents?: string[];
  metadata?: Record<string, any>;
}

export type VolumeType = 'system' | 'team' | 'user';

export interface VolumeContent {
  tools: Tool[];
  agents: Agent[];
  skills: Skill[];
  loadedAt: Date;
  volume: VolumeType;
}

/**
 * Parse skill from markdown content
 */
export function parseSkillFromMarkdown(markdown: string): Skill | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn('No frontmatter found in skill markdown');
      return null;
    }

    const frontmatter = frontmatterMatch[1];
    const content = markdown;

    // Parse frontmatter
    const metadata: any = {};
    const lines = frontmatter.split('\n');
    let currentKey = '';
    let currentArray: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('-')) {
        currentArray.push(line.trim().slice(1).trim());
      } else if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        currentKey = key.trim();

        if (value) {
          metadata[currentKey] = value;
        } else {
          currentArray = [];
          metadata[currentKey] = currentArray;
        }
      }
    }

    return {
      id: metadata.id || metadata.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
      name: metadata.name || 'Unknown Skill',
      description: metadata.description || '',
      content,
      usesTools: metadata.tools || metadata.usesTools || [],
      usesAgents: metadata.agents || metadata.usesAgents || [],
      metadata,
    };
  } catch (error) {
    console.error('Failed to parse skill markdown:', error);
    return null;
  }
}

/**
 * Load tools, agents, and skills from a GitHub volume
 */
export class VolumeLoader {
  private cache: Map<string, VolumeContent> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes

  /**
   * Load all artifacts from a volume
   */
  async loadVolume(
    volume: VolumeType,
    options: {
      forceRefresh?: boolean;
      username?: string;
      teamId?: string;
    } = {}
  ): Promise<VolumeContent> {
    const cacheKey = `${volume}-${options.username || 'default'}-${options.teamId || 'default'}`;

    // Check cache
    if (!options.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.loadedAt.getTime() < this.cacheExpiry) {
        return cached;
      }
    }

    // Load from GitHub
    const content: VolumeContent = {
      tools: [],
      agents: [],
      skills: [],
      loadedAt: new Date(),
      volume,
    };

    try {
      // Get repo name based on volume type
      const repoName = this.getRepoName(volume, options);

      // Fetch markdown files from GitHub
      const toolFiles = await this.fetchMarkdownFiles(repoName, 'tools');
      const agentFiles = await this.fetchMarkdownFiles(repoName, 'agents');
      const skillFiles = await this.fetchMarkdownFiles(repoName, 'skills');

      // Parse tools
      for (const file of toolFiles) {
        const tool = parseToolFromMarkdown(file.content);
        if (tool) {
          content.tools.push(tool);
        }
      }

      // Parse agents
      for (const file of agentFiles) {
        const agent = parseAgentFromMarkdown(file.content);
        if (agent) {
          content.agents.push(agent);
        }
      }

      // Parse skills
      for (const file of skillFiles) {
        const skill = parseSkillFromMarkdown(file.content);
        if (skill) {
          content.skills.push(skill);
        }
      }

      // Cache result
      this.cache.set(cacheKey, content);

      console.log(`✓ Loaded ${volume} volume: ${content.tools.length} tools, ${content.agents.length} agents, ${content.skills.length} skills`);

      return content;
    } catch (error) {
      console.error(`Failed to load ${volume} volume:`, error);
      return content;
    }
  }

  /**
   * Load specific tool by ID from a volume
   */
  async loadTool(volume: VolumeType, toolId: string, options?: { username?: string; teamId?: string }): Promise<Tool | null> {
    const content = await this.loadVolume(volume, options);
    return content.tools.find(t => t.id === toolId) || null;
  }

  /**
   * Load specific agent by ID from a volume
   */
  async loadAgent(volume: VolumeType, agentId: string, options?: { username?: string; teamId?: string }): Promise<Agent | null> {
    const content = await this.loadVolume(volume, options);
    return content.agents.find(a => a.id === agentId) || null;
  }

  /**
   * Load specific skill by ID from a volume
   */
  async loadSkill(volume: VolumeType, skillId: string, options?: { username?: string; teamId?: string }): Promise<Skill | null> {
    const content = await this.loadVolume(volume, options);
    return content.skills.find(s => s.id === skillId) || null;
  }

  /**
   * Load tools/agents/skills from all accessible volumes (system → team → user)
   */
  async loadAllVolumes(options: { username?: string; teamId?: string } = {}): Promise<{
    system: VolumeContent;
    team: VolumeContent;
    user: VolumeContent;
  }> {
    const [system, team, user] = await Promise.all([
      this.loadVolume('system', options),
      this.loadVolume('team', options),
      this.loadVolume('user', options),
    ]);

    return { system, team, user };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get repository name for a volume type
   */
  private getRepoName(volume: VolumeType, options: { username?: string; teamId?: string }): string {
    switch (volume) {
      case 'system':
        return 'llmunix/system-volumes';
      case 'team':
        return `llmunix-team-${options.teamId || 'default'}`;
      case 'user':
        return `llmunix-user-${options.username || 'default'}`;
    }
  }

  /**
   * Fetch markdown files from GitHub repository folder
   */
  private async fetchMarkdownFiles(
    repoName: string,
    folder: 'tools' | 'agents' | 'skills'
  ): Promise<Array<{ path: string; content: string }>> {
    try {
      // Get GitHub user from localStorage
      const githubUser = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('llmos_github_user') || '{}')
        : {};

      if (!githubUser.access_token) {
        console.warn('No GitHub access token found');
        return [];
      }

      // Fetch directory contents
      const [owner, repo] = repoName.split('/');
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${githubUser.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        // Repo might not exist or folder might be empty
        if (response.status === 404) {
          console.log(`${folder} folder not found in ${repoName}`);
          return [];
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const files = await response.json();

      // Filter markdown files and fetch their contents
      const markdownFiles = files.filter((file: any) =>
        file.type === 'file' && file.name.endsWith('.md')
      );

      const contents = await Promise.all(
        markdownFiles.map(async (file: any) => {
          const contentResponse = await fetch(file.download_url);
          const content = await contentResponse.text();
          return {
            path: file.path,
            content,
          };
        })
      );

      return contents;
    } catch (error) {
      console.error(`Failed to fetch ${folder} from ${repoName}:`, error);
      return [];
    }
  }
}

/**
 * Global volume loader instance
 */
let volumeLoaderInstance: VolumeLoader | null = null;

export function getVolumeLoader(): VolumeLoader {
  if (!volumeLoaderInstance) {
    volumeLoaderInstance = new VolumeLoader();
  }
  return volumeLoaderInstance;
}

/**
 * Helper to load and merge tools/agents from all volumes
 */
export async function loadAllArtifacts(options?: { username?: string; teamId?: string }): Promise<{
  tools: Map<string, Tool>;
  agents: Map<string, Agent>;
  skills: Map<string, Skill>;
}> {
  const loader = getVolumeLoader();
  const volumes = await loader.loadAllVolumes(options);

  const tools = new Map<string, Tool>();
  const agents = new Map<string, Agent>();
  const skills = new Map<string, Skill>();

  // System volume (lowest priority)
  volumes.system.tools.forEach(t => tools.set(t.id, t));
  volumes.system.agents.forEach(a => agents.set(a.id, a));
  volumes.system.skills.forEach(s => skills.set(s.id, s));

  // Team volume (medium priority, overrides system)
  volumes.team.tools.forEach(t => tools.set(t.id, t));
  volumes.team.agents.forEach(a => agents.set(a.id, a));
  volumes.team.skills.forEach(s => skills.set(s.id, s));

  // User volume (highest priority, overrides all)
  volumes.user.tools.forEach(t => tools.set(t.id, t));
  volumes.user.agents.forEach(a => agents.set(a.id, a));
  volumes.user.skills.forEach(s => skills.set(s.id, s));

  return { tools, agents, skills };
}
