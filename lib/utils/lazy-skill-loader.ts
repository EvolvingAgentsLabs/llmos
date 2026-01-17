/**
 * Lazy Skill Loader
 *
 * Implements on-demand skill loading to reduce initial context size.
 * Skills are only loaded when they're likely to be relevant to the task.
 *
 * Key features:
 * - Task-based relevance detection
 * - Caching of loaded skills
 * - Incremental skill loading during execution
 * - Memory-efficient skill management
 */

// =============================================================================
// Types
// =============================================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  keywords: string[];
  category: string;
  volume: 'user' | 'team' | 'system';
  lastUsed?: number;
  usageCount: number;
}

export interface SkillMatch {
  skill: Skill;
  relevanceScore: number;
  matchedKeywords: string[];
  reason: string;
}

export interface LazyLoaderConfig {
  /** Maximum number of skills to load initially (default: 3) */
  maxInitialSkills: number;
  /** Minimum relevance score to include a skill (default: 0.3) */
  minRelevanceScore: number;
  /** Maximum skills to keep in memory (default: 10) */
  maxCachedSkills: number;
  /** Keywords that always trigger skill loading (default: []) */
  alwaysLoadKeywords: string[];
  /** Enable skill usage tracking (default: true) */
  trackUsage: boolean;
}

export const DEFAULT_LOADER_CONFIG: LazyLoaderConfig = {
  maxInitialSkills: 3,
  minRelevanceScore: 0.3,
  maxCachedSkills: 10,
  alwaysLoadKeywords: [],
  trackUsage: true,
};

// =============================================================================
// Skill Index
// =============================================================================

/**
 * In-memory skill index for fast lookups
 */
class SkillIndex {
  private skills: Map<string, Skill> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private categoryIndex: Map<string, Set<string>> = new Map();

  /**
   * Add a skill to the index
   */
  addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);

    // Index by keywords
    for (const keyword of skill.keywords) {
      const lower = keyword.toLowerCase();
      if (!this.keywordIndex.has(lower)) {
        this.keywordIndex.set(lower, new Set());
      }
      this.keywordIndex.get(lower)!.add(skill.id);
    }

    // Index by category
    const cat = skill.category.toLowerCase();
    if (!this.categoryIndex.has(cat)) {
      this.categoryIndex.set(cat, new Set());
    }
    this.categoryIndex.get(cat)!.add(skill.id);
  }

  /**
   * Remove a skill from the index
   */
  removeSkill(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    // Remove from keyword index
    for (const keyword of skill.keywords) {
      const lower = keyword.toLowerCase();
      this.keywordIndex.get(lower)?.delete(skillId);
    }

    // Remove from category index
    this.categoryIndex.get(skill.category.toLowerCase())?.delete(skillId);

    this.skills.delete(skillId);
  }

  /**
   * Find skills matching keywords
   */
  findByKeywords(keywords: string[]): Set<string> {
    const matches = new Set<string>();

    for (const keyword of keywords) {
      const lower = keyword.toLowerCase();
      const skillIds = this.keywordIndex.get(lower);
      if (skillIds) {
        skillIds.forEach(id => matches.add(id));
      }
    }

    return matches;
  }

  /**
   * Find skills by category
   */
  findByCategory(category: string): Set<string> {
    return this.categoryIndex.get(category.toLowerCase()) || new Set();
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.skills.clear();
    this.keywordIndex.clear();
    this.categoryIndex.clear();
  }
}

// =============================================================================
// Relevance Scoring
// =============================================================================

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'and', 'but', 'or', 'if', 'this', 'that',
    'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
    'what', 'which', 'who', 'whom', 'please', 'help', 'want', 'need',
    'create', 'make', 'build', 'write', 'code', 'file', 'project',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Also extract camelCase and snake_case components
  const expanded: string[] = [];
  for (const word of words) {
    expanded.push(word);

    // Split camelCase
    const camelParts = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    if (camelParts.length > 1) {
      expanded.push(...camelParts.map(p => p.toLowerCase()));
    }

    // Split snake_case
    const snakeParts = word.split('_');
    if (snakeParts.length > 1) {
      expanded.push(...snakeParts.filter(p => p.length > 2));
    }
  }

  // Deduplicate
  return [...new Set(expanded)];
}

/**
 * Calculate relevance score between task and skill
 */
function calculateRelevance(
  taskKeywords: string[],
  skill: Skill
): { score: number; matchedKeywords: string[] } {
  const skillKeywords = new Set(skill.keywords.map(k => k.toLowerCase()));
  const matchedKeywords: string[] = [];

  let matchCount = 0;
  let totalWeight = 0;

  for (const taskKeyword of taskKeywords) {
    totalWeight += 1;

    // Direct keyword match
    if (skillKeywords.has(taskKeyword)) {
      matchCount += 1;
      matchedKeywords.push(taskKeyword);
      continue;
    }

    // Partial match (substring)
    for (const skillKeyword of skillKeywords) {
      if (skillKeyword.includes(taskKeyword) || taskKeyword.includes(skillKeyword)) {
        matchCount += 0.5;
        matchedKeywords.push(`${taskKeyword}~${skillKeyword}`);
        break;
      }
    }
  }

  // Check skill name and description
  const nameLower = skill.name.toLowerCase();
  const descLower = skill.description.toLowerCase();

  for (const keyword of taskKeywords) {
    if (nameLower.includes(keyword)) {
      matchCount += 0.3;
    }
    if (descLower.includes(keyword)) {
      matchCount += 0.2;
    }
  }

  const score = totalWeight > 0 ? Math.min(1, matchCount / totalWeight) : 0;

  return { score, matchedKeywords };
}

// =============================================================================
// Lazy Skill Loader
// =============================================================================

export class LazySkillLoader {
  private config: LazyLoaderConfig;
  private index: SkillIndex;
  private loadedSkills: Map<string, Skill> = new Map();
  private skillUsage: Map<string, number> = new Map();
  private skillFetcher: (volume: 'user' | 'team' | 'system') => Promise<Skill[]>;

  constructor(
    skillFetcher: (volume: 'user' | 'team' | 'system') => Promise<Skill[]>,
    config: Partial<LazyLoaderConfig> = {}
  ) {
    this.config = { ...DEFAULT_LOADER_CONFIG, ...config };
    this.index = new SkillIndex();
    this.skillFetcher = skillFetcher;
  }

  /**
   * Initialize the skill index (load metadata only, not content)
   */
  async initialize(volumes: Array<'user' | 'team' | 'system'> = ['user', 'team', 'system']): Promise<void> {
    for (const volume of volumes) {
      try {
        const skills = await this.skillFetcher(volume);
        for (const skill of skills) {
          this.index.addSkill(skill);
        }
      } catch (error) {
        console.warn(`[LazySkillLoader] Failed to load skills from ${volume}:`, error);
      }
    }
  }

  /**
   * Find relevant skills for a task (without loading full content)
   */
  findRelevantSkills(taskDescription: string): SkillMatch[] {
    const taskKeywords = extractKeywords(taskDescription);
    const allSkills = this.index.getAllSkills();
    const matches: SkillMatch[] = [];

    for (const skill of allSkills) {
      const { score, matchedKeywords } = calculateRelevance(taskKeywords, skill);

      if (score >= this.config.minRelevanceScore) {
        matches.push({
          skill,
          relevanceScore: score,
          matchedKeywords,
          reason: `Matched keywords: ${matchedKeywords.join(', ')}`,
        });
      }
    }

    // Sort by relevance and usage
    matches.sort((a, b) => {
      const usageA = this.skillUsage.get(a.skill.id) || 0;
      const usageB = this.skillUsage.get(b.skill.id) || 0;

      // Combine relevance score with usage (weighted)
      const scoreA = a.relevanceScore * 0.8 + Math.min(usageA / 10, 0.2);
      const scoreB = b.relevanceScore * 0.8 + Math.min(usageB / 10, 0.2);

      return scoreB - scoreA;
    });

    return matches;
  }

  /**
   * Load skills for a task (lazy loading)
   */
  async loadSkillsForTask(
    taskDescription: string,
    maxSkills?: number
  ): Promise<Skill[]> {
    const limit = maxSkills ?? this.config.maxInitialSkills;
    const matches = this.findRelevantSkills(taskDescription);
    const skillsToLoad = matches.slice(0, limit);

    const loadedSkills: Skill[] = [];

    for (const match of skillsToLoad) {
      const skill = await this.loadSkill(match.skill.id);
      if (skill) {
        loadedSkills.push(skill);
      }
    }

    return loadedSkills;
  }

  /**
   * Load a specific skill by ID
   */
  async loadSkill(skillId: string): Promise<Skill | null> {
    // Check cache first
    if (this.loadedSkills.has(skillId)) {
      this.recordUsage(skillId);
      return this.loadedSkills.get(skillId)!;
    }

    // Get from index
    const skill = this.index.getSkill(skillId);
    if (!skill) return null;

    // Add to loaded cache
    this.loadedSkills.set(skillId, skill);
    this.recordUsage(skillId);

    // Evict if over limit
    this.evictIfNeeded();

    return skill;
  }

  /**
   * Load skills incrementally based on context
   */
  async loadAdditionalSkills(
    context: string,
    alreadyLoaded: string[]
  ): Promise<Skill[]> {
    const keywords = extractKeywords(context);
    const matchedIds = this.index.findByKeywords(keywords);

    const newSkills: Skill[] = [];
    const alreadyLoadedSet = new Set(alreadyLoaded);

    for (const skillId of matchedIds) {
      if (alreadyLoadedSet.has(skillId)) continue;

      const skill = await this.loadSkill(skillId);
      if (skill) {
        newSkills.push(skill);
      }

      // Limit additional skills
      if (newSkills.length >= 2) break;
    }

    return newSkills;
  }

  /**
   * Get currently loaded skills
   */
  getLoadedSkills(): Skill[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * Format loaded skills for LLM context
   */
  formatSkillsForContext(skills: Skill[]): string {
    if (skills.length === 0) return '';

    return `# Available Skills

You have access to the following skills learned from previous sessions:

${skills.map((skill, idx) => `## ${idx + 1}. ${skill.name}

${skill.content}

---`).join('\n\n')}

Use these skills to provide better, context-aware responses.`;
  }

  /**
   * Record skill usage
   */
  private recordUsage(skillId: string): void {
    if (!this.config.trackUsage) return;

    const current = this.skillUsage.get(skillId) || 0;
    this.skillUsage.set(skillId, current + 1);

    // Update skill in index
    const skill = this.index.getSkill(skillId);
    if (skill) {
      skill.usageCount = current + 1;
      skill.lastUsed = Date.now();
    }
  }

  /**
   * Evict least used skills if over limit
   */
  private evictIfNeeded(): void {
    if (this.loadedSkills.size <= this.config.maxCachedSkills) return;

    // Sort by usage (ascending) and evict least used
    const sortedByUsage = Array.from(this.loadedSkills.entries())
      .sort((a, b) => {
        const usageA = this.skillUsage.get(a[0]) || 0;
        const usageB = this.skillUsage.get(b[0]) || 0;
        return usageA - usageB;
      });

    const toEvict = sortedByUsage.slice(0, this.loadedSkills.size - this.config.maxCachedSkills);
    for (const [skillId] of toEvict) {
      this.loadedSkills.delete(skillId);
    }
  }

  /**
   * Clear all loaded skills
   */
  clearLoaded(): void {
    this.loadedSkills.clear();
  }

  /**
   * Clear everything
   */
  reset(): void {
    this.index.clear();
    this.loadedSkills.clear();
    this.skillUsage.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a lazy skill loader with GitHub integration
 */
export function createLazySkillLoader(
  config: Partial<LazyLoaderConfig> = {}
): LazySkillLoader {
  // Default fetcher that integrates with GitService
  const fetcher = async (volume: 'user' | 'team' | 'system'): Promise<Skill[]> => {
    try {
      const { GitService } = await import('../git-service');
      const rawSkills = await GitService.fetchSkills(volume);

      return rawSkills.map((raw, idx) => ({
        id: `${volume}-skill-${idx}`,
        name: raw.name,
        description: raw.name, // Use name as description if not provided
        content: raw.content,
        keywords: extractKeywords(raw.name + ' ' + raw.content.slice(0, 500)),
        category: 'general',
        volume,
        usageCount: 0,
      }));
    } catch (error) {
      console.warn(`[LazySkillLoader] Failed to fetch skills from ${volume}:`, error);
      return [];
    }
  };

  return new LazySkillLoader(fetcher, config);
}

// =============================================================================
// Export
// =============================================================================

export const lazySkillLoader = {
  create: createLazySkillLoader,
  LazySkillLoader,
  extractKeywords,
  DEFAULT_CONFIG: DEFAULT_LOADER_CONFIG,
};
