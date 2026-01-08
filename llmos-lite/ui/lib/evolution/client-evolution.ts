/**
 * Client-Side Evolution Engine
 *
 * Replaces core/evolution.py - runs entirely in the browser.
 * Detects patterns in execution traces and generates skills automatically.
 */

import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { ClientSkillsManager, getSkillsManager, Skill } from '../skills/client-skills-manager';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionTrace {
  traceId: string;
  timestamp: string;
  project: string;
  goal: string;
  agentName: string;
  agentPath?: string;
  status: 'success' | 'failure' | 'partial';
  successRating: number;
  toolsUsed: string[];
  duration: number;
  parentTraceId?: string;
  linkType?: 'sequential' | 'hierarchical' | 'dependency' | 'parallel';
  lifecycleState: 'active' | 'consolidated' | 'archived';
}

export interface Pattern {
  signature: string;
  description: string;
  traceIds: string[];
  count: number;
  successRate: number;
  exampleContent: string;
  category?: Skill['category'];
}

export interface SkillDraft {
  name: string;
  category: Skill['category'];
  description: string;
  content: string;
  keywords: string[];
  sourceTraces: string[];
  confidence: number;
}

export interface EvolutionResult {
  tracesAnalyzed: number;
  patternsDetected: number;
  viablePatterns: number;
  skillsCreated: number;
  skills: Skill[];
}

export interface EvolutionConfig {
  minPatternCount: number;
  minSuccessRate: number;
  minConfidence: number;
}

// ============================================================================
// PATTERN DETECTOR
// ============================================================================

export class PatternDetector {
  /**
   * Analyze traces and detect patterns
   */
  detectPatterns(traces: ExecutionTrace[]): Pattern[] {
    // Group traces by goal signature
    const goalGroups = new Map<string, ExecutionTrace[]>();

    for (const trace of traces) {
      if (!trace.goal) continue;
      const signature = this.computeSignature(trace.goal);

      if (!goalGroups.has(signature)) {
        goalGroups.set(signature, []);
      }
      goalGroups.get(signature)!.push(trace);
    }

    // Convert groups to patterns
    const patterns: Pattern[] = [];

    for (const [signature, groupTraces] of goalGroups) {
      if (groupTraces.length >= 2) {
        const successRate = this.calculateSuccessRate(groupTraces);
        const category = this.inferCategory(groupTraces[0].goal);

        patterns.push({
          signature,
          description: groupTraces[0].goal,
          traceIds: groupTraces.map(t => t.traceId),
          count: groupTraces.length,
          successRate,
          exampleContent: this.extractExampleContent(groupTraces[0]),
          category,
        });
      }
    }

    // Sort by count (most frequent first)
    patterns.sort((a, b) => b.count - a.count);

    return patterns;
  }

  private computeSignature(text: string): string {
    // Normalize: lowercase, remove punctuation, collapse whitespace
    const normalized = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private calculateSuccessRate(traces: ExecutionTrace[]): number {
    if (traces.length === 0) return 0;

    const successes = traces.filter(t =>
      t.status === 'success' || t.successRating >= 0.7
    ).length;

    return successes / traces.length;
  }

  private inferCategory(goal: string): Skill['category'] {
    const lower = goal.toLowerCase();

    if (/code|script|program|python|javascript|typescript|function/.test(lower)) {
      return 'coding';
    }
    if (/analy|data|statistic|chart|plot|visuali/.test(lower)) {
      return 'analysis';
    }
    if (/write|document|report|summarize|explain/.test(lower)) {
      return 'writing';
    }
    if (/data|csv|json|database|query/.test(lower)) {
      return 'data';
    }
    return 'general';
  }

  private extractExampleContent(trace: ExecutionTrace): string {
    return `Goal: ${trace.goal}\nAgent: ${trace.agentName}\nTools: ${trace.toolsUsed.join(', ')}`;
  }
}

// ============================================================================
// SKILL GENERATOR
// ============================================================================

export class SkillGenerator {
  private llmCallback?: (prompt: string) => Promise<string>;

  constructor(llmCallback?: (prompt: string) => Promise<string>) {
    this.llmCallback = llmCallback;
  }

  /**
   * Generate a skill from a pattern
   */
  async generateSkillFromPattern(pattern: Pattern): Promise<SkillDraft> {
    if (this.llmCallback) {
      return this.llmGenerate(pattern);
    }
    return this.heuristicGenerate(pattern);
  }

  private async llmGenerate(pattern: Pattern): Promise<SkillDraft> {
    const prompt = `You are creating a reusable "Skill" (best practice guide) from a repeated pattern.

Pattern detected:
- Goal: ${pattern.description}
- Seen ${pattern.count} times
- Success rate: ${(pattern.successRate * 100).toFixed(0)}%

Example:
${pattern.exampleContent}

Create a Skill. Return ONLY the skill content in this exact format:

**Skill Name**: [Short, descriptive name]
**Category**: [coding|analysis|writing|data|general]
**Description**: [One-line description of when to use this skill]
**Keywords**: [comma-separated keywords]

## When to Use
[Describe when this skill applies]

## Approach
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Example
[Code or example if applicable]

## Tips
- [Tip 1]
- [Tip 2]`;

    try {
      const response = await this.llmCallback!(prompt);
      return this.parseSkillFromResponse(response, pattern);
    } catch (error) {
      console.warn('LLM generation failed, falling back to heuristic:', error);
      return this.heuristicGenerate(pattern);
    }
  }

  private parseSkillFromResponse(response: string, pattern: Pattern): SkillDraft {
    const name = this.extractField(response, 'Skill Name') || pattern.description.slice(0, 50);
    const category = this.parseCategory(this.extractField(response, 'Category'));
    const description = this.extractField(response, 'Description') || pattern.description;
    const keywordsStr = this.extractField(response, 'Keywords') || '';
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);

    // Remove the metadata lines from content
    let content = response;
    const lines = response.split('\n');
    const contentStart = lines.findIndex(l => l.startsWith('## '));
    if (contentStart > 0) {
      content = lines.slice(contentStart).join('\n');
    }

    return {
      name,
      category,
      description,
      content,
      keywords: keywords.length > 0 ? keywords : this.extractKeywords(pattern.description),
      sourceTraces: pattern.traceIds,
      confidence: pattern.successRate,
    };
  }

  private heuristicGenerate(pattern: Pattern): SkillDraft {
    const keywords = this.extractKeywords(pattern.description);

    const content = `# ${pattern.description}

## When to Use

Use this skill when you need to: ${pattern.description.toLowerCase()}

## Approach

This pattern was successful ${pattern.count} times with ${(pattern.successRate * 100).toFixed(0)}% success rate.

Based on the execution traces, follow these steps:
1. Understand the specific requirements
2. Apply the learned approach from previous successful executions
3. Verify the outcome matches expectations

## Details

${pattern.exampleContent}

## Notes

This skill was auto-generated from ${pattern.count} similar traces.
Review and refine as needed.`;

    return {
      name: pattern.description.slice(0, 50),
      category: pattern.category || 'general',
      description: `Handle tasks like: ${pattern.description}`,
      content,
      keywords,
      sourceTraces: pattern.traceIds,
      confidence: pattern.successRate,
    };
  }

  private extractField(text: string, fieldName: string): string | null {
    const pattern = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+?)(?:\\n|$)`, 'i');
    const match = text.match(pattern);
    return match ? match[1].trim() : null;
  }

  private parseCategory(category?: string | null): Skill['category'] {
    const valid = ['coding', 'analysis', 'writing', 'data', 'general'];
    if (category && valid.includes(category.toLowerCase())) {
      return category.toLowerCase() as Skill['category'];
    }
    return 'general';
  }

  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5);
  }
}

// ============================================================================
// EVOLUTION ENGINE
// ============================================================================

export class ClientEvolutionEngine {
  private fs: FileSystemStorage;
  private skillsManager: ClientSkillsManager;
  private patternDetector: PatternDetector;
  private skillGenerator: SkillGenerator;
  private config: EvolutionConfig;

  constructor(
    llmCallback?: (prompt: string) => Promise<string>,
    config?: Partial<EvolutionConfig>
  ) {
    this.fs = getFileSystem();
    this.skillsManager = getSkillsManager();
    this.patternDetector = new PatternDetector();
    this.skillGenerator = new SkillGenerator(llmCallback);
    this.config = {
      minPatternCount: config?.minPatternCount ?? 3,
      minSuccessRate: config?.minSuccessRate ?? 0.7,
      minConfidence: config?.minConfidence ?? 0.5,
    };
  }

  /**
   * Run evolution on traces from a scope
   */
  async runEvolution(scope: 'user' | 'project' = 'user', projectPath?: string): Promise<Result<EvolutionResult, AppError>> {
    try {
      // 1. Load traces
      const traces = await this.loadTraces(scope, projectPath);

      if (traces.length === 0) {
        return ok({
          tracesAnalyzed: 0,
          patternsDetected: 0,
          viablePatterns: 0,
          skillsCreated: 0,
          skills: [],
        });
      }

      // 2. Detect patterns
      const patterns = this.patternDetector.detectPatterns(traces);

      // 3. Filter viable patterns
      const viablePatterns = patterns.filter(p =>
        p.count >= this.config.minPatternCount &&
        p.successRate >= this.config.minSuccessRate
      );

      // 4. Generate skills
      const createdSkills: Skill[] = [];

      for (const pattern of viablePatterns) {
        const draft = await this.skillGenerator.generateSkillFromPattern(pattern);

        if (draft.confidence >= this.config.minConfidence) {
          const skillResult = await this.skillsManager.createSkill(
            {
              name: draft.name,
              category: draft.category,
              description: draft.description,
              keywords: draft.keywords,
              content: draft.content,
              sourceTraces: draft.sourceTraces,
              confidence: draft.confidence,
            },
            scope === 'project' ? 'project' : 'user',
            projectPath
          );

          if (skillResult.ok) {
            createdSkills.push(skillResult.value);
          }
        }
      }

      return ok({
        tracesAnalyzed: traces.length,
        patternsDetected: patterns.length,
        viablePatterns: viablePatterns.length,
        skillsCreated: createdSkills.length,
        skills: createdSkills,
      });
    } catch (error) {
      return err(appError(ErrorCodes.PROCESSING_ERROR, 'Evolution failed', error));
    }
  }

  /**
   * Load traces from storage
   */
  private async loadTraces(scope: 'user' | 'project', projectPath?: string): Promise<ExecutionTrace[]> {
    const traces: ExecutionTrace[] = [];

    let pattern: string;
    if (scope === 'project' && projectPath) {
      pattern = `${projectPath}/memory/short_term/**/*.md`;
    } else {
      pattern = 'projects/*/memory/short_term/**/*.md';
    }

    const filesResult = await this.fs.glob(pattern);
    if (!filesResult.ok) return traces;

    for (const path of filesResult.value) {
      if (path.endsWith('.gitkeep')) continue;

      const contentResult = await this.fs.read(path);
      if (!contentResult.ok || !contentResult.value) continue;

      const trace = this.parseTrace(path, contentResult.value);
      if (trace) {
        traces.push(trace);
      }
    }

    return traces;
  }

  /**
   * Parse a trace from markdown content
   */
  private parseTrace(path: string, content: string): ExecutionTrace | null {
    try {
      const { frontmatter, body } = this.parseFrontmatter(content);

      // Extract goal from body or frontmatter
      let goal = frontmatter.goal || frontmatter.task || '';
      if (!goal) {
        const goalMatch = body.match(/## (?:User )?Goal\s*\n+([^\n#]+)/i);
        goal = goalMatch ? goalMatch[1].trim() : '';
      }

      if (!goal) return null;

      return {
        traceId: frontmatter.trace_id || path,
        timestamp: frontmatter.timestamp || new Date().toISOString(),
        project: frontmatter.project || this.extractProjectFromPath(path),
        goal,
        agentName: frontmatter.agent_name || 'unknown',
        agentPath: frontmatter.agent_path,
        status: this.parseStatus(frontmatter.status),
        successRating: this.parseSuccessRating(frontmatter, body),
        toolsUsed: frontmatter.tools_used || [],
        duration: frontmatter.duration_ms || 0,
        parentTraceId: frontmatter.parent_trace_id,
        linkType: frontmatter.link_type,
        lifecycleState: frontmatter.lifecycle_state || 'active',
      };
    } catch {
      return null;
    }
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatter: Record<string, unknown> = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = value.slice(1, -1).split(',').map(s => s.trim());
      } else if (!isNaN(Number(value))) {
        frontmatter[key] = Number(value);
      } else {
        frontmatter[key] = value;
      }
    }

    return { frontmatter, body: match[2] };
  }

  private parseStatus(status?: string): ExecutionTrace['status'] {
    if (status === 'success' || status === 'completed') return 'success';
    if (status === 'failure' || status === 'failed') return 'failure';
    return 'partial';
  }

  private parseSuccessRating(frontmatter: Record<string, unknown>, body: string): number {
    if (typeof frontmatter.success_rating === 'number') {
      return frontmatter.success_rating;
    }

    // Try to extract from body
    const ratingMatch = body.match(/success[_ ]?rating[:\s]*(\d+(?:\.\d+)?)/i);
    if (ratingMatch) {
      return parseFloat(ratingMatch[1]);
    }

    // Infer from status
    if (frontmatter.status === 'success') return 1.0;
    if (frontmatter.status === 'failure') return 0.0;
    return 0.5;
  }

  private extractProjectFromPath(path: string): string {
    const match = path.match(/projects\/([^/]+)/);
    return match ? match[1] : 'unknown';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let evolutionInstance: ClientEvolutionEngine | null = null;

export function getEvolutionEngine(llmCallback?: (prompt: string) => Promise<string>): ClientEvolutionEngine {
  if (!evolutionInstance) {
    evolutionInstance = new ClientEvolutionEngine(llmCallback);
  }
  return evolutionInstance;
}
