/**
 * Client-Side Skills Manager
 *
 * Replaces core/skills.py - runs entirely in the browser.
 * Loads, filters, and manages markdown-based skills from browser storage.
 */

import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// TYPES
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  category: 'coding' | 'analysis' | 'writing' | 'data' | 'general';
  description: string;
  keywords: string[];
  content: string;
  path: string;
  sourceTraces?: string[];
  confidence?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillFrontmatter {
  name?: string;
  skill_id?: string;
  category?: string;
  description?: string;
  keywords?: string[];
  source_traces?: number;
  confidence?: number;
  created_at?: string;
}

export interface SkillQuery {
  query?: string;
  category?: Skill['category'];
  keywords?: string[];
  limit?: number;
  scope?: 'system' | 'user' | 'project' | 'all';
  projectPath?: string;
}

// ============================================================================
// SKILLS MANAGER
// ============================================================================

export class ClientSkillsManager {
  private fs: FileSystemStorage;
  private cache: Map<string, Skill> = new Map();
  private cacheValid = false;

  constructor(fs?: FileSystemStorage) {
    this.fs = fs || getFileSystem();
  }

  /**
   * Load all skills from a scope
   */
  async loadSkills(scope: 'system' | 'user' | 'project' | 'all' = 'all', projectPath?: string): Promise<Result<Skill[], AppError>> {
    const skills: Skill[] = [];

    try {
      const patterns: string[] = [];

      if (scope === 'system' || scope === 'all') {
        patterns.push('system/skills/**/*.md');
        patterns.push('volumes/system/skills/**/*.md');
      }

      if (scope === 'user' || scope === 'all') {
        patterns.push('user/skills/**/*.md');
        patterns.push('volumes/user/skills/**/*.md');
      }

      if ((scope === 'project' || scope === 'all') && projectPath) {
        patterns.push(`${projectPath}/skills/**/*.md`);
      }

      if (scope === 'all') {
        patterns.push('projects/*/skills/**/*.md');
      }

      for (const pattern of patterns) {
        const filesResult = await this.fs.glob(pattern);
        if (!filesResult.ok) continue;

        for (const path of filesResult.value) {
          // Skip .gitkeep files
          if (path.endsWith('.gitkeep')) continue;

          const skillResult = await this.loadSkillFromPath(path);
          if (skillResult.ok && skillResult.value) {
            skills.push(skillResult.value);
            this.cache.set(path, skillResult.value);
          }
        }
      }

      this.cacheValid = true;
      return ok(skills);
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to load skills', error));
    }
  }

  /**
   * Load a single skill from a path
   */
  async loadSkillFromPath(path: string): Promise<Result<Skill | null, AppError>> {
    // Check cache first
    if (this.cache.has(path)) {
      return ok(this.cache.get(path)!);
    }

    const contentResult = await this.fs.read(path);
    if (!contentResult.ok) return contentResult as Result<Skill | null, AppError>;
    if (!contentResult.value) return ok(null);

    const skill = this.parseSkill(path, contentResult.value);
    if (skill) {
      this.cache.set(path, skill);
    }
    return ok(skill);
  }

  /**
   * Filter skills by query
   */
  async filterSkills(query: SkillQuery): Promise<Result<Skill[], AppError>> {
    // Load skills if cache is invalid
    if (!this.cacheValid) {
      await this.loadSkills(query.scope || 'all', query.projectPath);
    }

    let skills = Array.from(this.cache.values());

    // Filter by category
    if (query.category) {
      skills = skills.filter(s => s.category === query.category);
    }

    // Filter by keywords
    if (query.keywords && query.keywords.length > 0) {
      const queryKeywords = query.keywords.map(k => k.toLowerCase());
      skills = skills.filter(s =>
        s.keywords.some(k => queryKeywords.includes(k.toLowerCase()))
      );
    }

    // Filter by text query (search name, description, content)
    if (query.query) {
      const searchTerms = query.query.toLowerCase().split(/\s+/);
      skills = skills.filter(skill => {
        const searchText = `${skill.name} ${skill.description} ${skill.content}`.toLowerCase();
        return searchTerms.every(term => searchText.includes(term));
      });
    }

    // Sort by relevance (keyword match count)
    if (query.query) {
      const searchTerms = query.query.toLowerCase().split(/\s+/);
      skills.sort((a, b) => {
        const scoreA = this.calculateRelevance(a, searchTerms);
        const scoreB = this.calculateRelevance(b, searchTerms);
        return scoreB - scoreA;
      });
    }

    // Apply limit
    if (query.limit) {
      skills = skills.slice(0, query.limit);
    }

    return ok(skills);
  }

  /**
   * Create a new skill
   */
  async createSkill(skill: Omit<Skill, 'path' | 'id'>, scope: 'user' | 'project' = 'user', projectPath?: string): Promise<Result<Skill, AppError>> {
    const id = `skill_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    let path: string;
    if (scope === 'project' && projectPath) {
      path = `${projectPath}/skills/${this.slugify(skill.name)}.md`;
    } else {
      path = `user/skills/${this.slugify(skill.name)}.md`;
    }

    const fullSkill: Skill = {
      ...skill,
      id,
      path,
      createdAt: now,
      updatedAt: now,
    };

    const markdown = this.formatSkillAsMarkdown(fullSkill);
    const writeResult = await this.fs.write(path, markdown);

    if (!writeResult.ok) return writeResult as Result<Skill, AppError>;

    this.cache.set(path, fullSkill);
    return ok(fullSkill);
  }

  /**
   * Update an existing skill
   */
  async updateSkill(path: string, updates: Partial<Skill>): Promise<Result<Skill, AppError>> {
    const existingResult = await this.loadSkillFromPath(path);
    if (!existingResult.ok) return existingResult as Result<Skill, AppError>;
    if (!existingResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Skill not found: ${path}`));
    }

    const updatedSkill: Skill = {
      ...existingResult.value,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const markdown = this.formatSkillAsMarkdown(updatedSkill);
    const writeResult = await this.fs.write(path, markdown);

    if (!writeResult.ok) return writeResult as Result<Skill, AppError>;

    this.cache.set(path, updatedSkill);
    return ok(updatedSkill);
  }

  /**
   * Delete a skill
   */
  async deleteSkill(path: string): Promise<Result<void, AppError>> {
    const deleteResult = await this.fs.delete(path);
    if (deleteResult.ok) {
      this.cache.delete(path);
    }
    return deleteResult;
  }

  /**
   * Build context for LLM from relevant skills
   */
  async buildContextForQuery(query: string, limit = 5): Promise<Result<string, AppError>> {
    const skillsResult = await this.filterSkills({ query, limit });
    if (!skillsResult.ok) return skillsResult as Result<string, AppError>;

    if (skillsResult.value.length === 0) {
      return ok('');
    }

    const context = skillsResult.value.map((skill, idx) => `
## Skill ${idx + 1}: ${skill.name}

**Category**: ${skill.category}
**Description**: ${skill.description}

${skill.content}
`).join('\n---\n');

    return ok(`# Relevant Skills

The following skills may be helpful for this task:

${context}`);
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cache.clear();
    this.cacheValid = false;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private parseSkill(path: string, content: string): Skill | null {
    try {
      const { frontmatter, body } = this.parseFrontmatter(content);

      return {
        id: frontmatter.skill_id || path,
        name: frontmatter.name || this.extractNameFromPath(path),
        category: this.parseCategory(frontmatter.category),
        description: frontmatter.description || '',
        keywords: this.parseKeywords(frontmatter.keywords),
        content: body,
        path,
        sourceTraces: undefined,
        confidence: frontmatter.confidence,
        createdAt: frontmatter.created_at,
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterStr = match[1];
    const body = match[2];

    // Simple YAML parsing (handles common cases)
    const frontmatter: SkillFrontmatter = {};
    const lines = frontmatterStr.split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();

      // Handle arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        (frontmatter as Record<string, unknown>)[key] = arrayContent.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else if (value.startsWith('"') || value.startsWith("'")) {
        (frontmatter as Record<string, unknown>)[key] = value.slice(1, -1);
      } else if (!isNaN(Number(value))) {
        (frontmatter as Record<string, unknown>)[key] = Number(value);
      } else {
        (frontmatter as Record<string, unknown>)[key] = value;
      }
    }

    return { frontmatter, body };
  }

  private parseCategory(category?: string): Skill['category'] {
    const valid = ['coding', 'analysis', 'writing', 'data', 'general'];
    if (category && valid.includes(category)) {
      return category as Skill['category'];
    }
    return 'general';
  }

  private parseKeywords(keywords?: string[] | string): string[] {
    if (Array.isArray(keywords)) return keywords;
    if (typeof keywords === 'string') {
      return keywords.split(',').map(k => k.trim());
    }
    return [];
  }

  private extractNameFromPath(path: string): string {
    const filename = path.split('/').pop() || '';
    return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private calculateRelevance(skill: Skill, searchTerms: string[]): number {
    let score = 0;
    const searchText = `${skill.name} ${skill.description} ${skill.keywords.join(' ')}`.toLowerCase();

    for (const term of searchTerms) {
      // Name match (highest weight)
      if (skill.name.toLowerCase().includes(term)) score += 10;
      // Keyword match (high weight)
      if (skill.keywords.some(k => k.toLowerCase().includes(term))) score += 5;
      // Description match
      if (skill.description.toLowerCase().includes(term)) score += 3;
      // Content match
      if (skill.content.toLowerCase().includes(term)) score += 1;
    }

    // Boost by confidence
    if (skill.confidence) {
      score *= skill.confidence;
    }

    return score;
  }

  private formatSkillAsMarkdown(skill: Skill): string {
    return `---
skill_id: ${skill.id}
name: ${skill.name}
category: ${skill.category}
description: ${skill.description}
keywords: [${skill.keywords.join(', ')}]
confidence: ${skill.confidence ?? 1.0}
created_at: ${skill.createdAt || new Date().toISOString()}
---

${skill.content}
`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let skillsManagerInstance: ClientSkillsManager | null = null;

export function getSkillsManager(): ClientSkillsManager {
  if (!skillsManagerInstance) {
    skillsManagerInstance = new ClientSkillsManager();
  }
  return skillsManagerInstance;
}
