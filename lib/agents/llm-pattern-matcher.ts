/**
 * LLM-Based Pattern Matcher
 *
 * Uses LLM for semantic pattern matching instead of hash-based signatures.
 * This enables true understanding of task similarity and skill relevance.
 *
 * Key capabilities:
 * - Semantic similarity between tasks
 * - Pattern extraction from execution traces
 * - Skill recommendation based on context
 * - Learning consolidation from experiences
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';

// =============================================================================
// Types
// =============================================================================

export interface ExecutionTrace {
  id: string;
  goal: string;
  success: boolean;
  toolsUsed: string[];
  filesCreated: string[];
  duration: number;
  timestamp: string;
  output?: string;
  error?: string;
  // Sub-agent tracking for collaboration verification
  subAgentsUsed?: SubAgentTrace[];
  // Project context
  projectId?: string;
  projectPath?: string;
  // Trace type for filtering
  traceType?: 'main' | 'sub-agent' | 'tool';

  // =========================================================================
  // Trace Linking (from llmunix gap analysis)
  // =========================================================================

  // Parent trace for hierarchical linking
  parentTraceId?: string;

  // Type of link to parent
  linkType?: 'sequential' | 'hierarchical' | 'dependency' | 'parallel';

  // Depth in the trace hierarchy (0 = root)
  depth?: number;

  // Dependencies on other traces (for data flow tracking)
  dependsOn?: TraceDependency[];

  // Sibling traces (for parallel execution)
  siblingTraceIds?: string[];

  // =========================================================================
  // Trace Lifecycle (from llmunix gap analysis)
  // =========================================================================

  // Current lifecycle state
  lifecycleState?: 'active' | 'consolidated' | 'archived';

  // When the trace was consolidated into learnings
  consolidatedAt?: string;

  // When the trace was archived
  archivedAt?: string;

  // =========================================================================
  // Agent Metadata (enhanced from llmunix)
  // =========================================================================

  // Agent that created this trace
  agentName?: string;
  agentType?: 'core' | 'dynamic' | 'system';
  agentPath?: string;

  // Task category for pattern grouping
  taskCategory?: string;
}

/**
 * Dependency on another trace's output
 */
export interface TraceDependency {
  traceId: string;
  outputFile: string;
  dependencyType: 'data' | 'config' | 'model' | 'artifact';
}

export interface SubAgentTrace {
  agentName: string;
  agentPath: string;
  volume: string;
  task: string;
  success: boolean;
  executionTime: number;
  timestamp: string;
}

export interface PatternMatch {
  traceId: string;
  goal: string;
  similarity: number; // 0-1 score
  relevantAspects: string[];
  suggestedApproach?: string;
}

export interface SkillRecommendation {
  skillId: string;
  skillName: string;
  relevance: number; // 0-1 score
  reason: string;
  applicableSteps: string[];
}

export interface ConsolidatedPattern {
  id: string;
  name: string;
  description: string;
  triggers: string[]; // When to apply this pattern
  approach: string[];
  toolSequence: string[];
  successRate: number;
  exampleCount: number;
}

export interface LLMPatternAnalysis {
  patterns: ConsolidatedPattern[];
  suggestedSkills: SkillRecommendation[];
  insights: string[];
}

// =============================================================================
// Trace Graph Types (from llmunix gap analysis)
// =============================================================================

export interface TraceGraph {
  nodes: Map<string, ExecutionTrace>;
  edges: TraceEdge[];
  rootTraceId?: string;
}

export interface TraceEdge {
  from: string;
  to: string;
  type: 'sequential' | 'hierarchical' | 'dependency' | 'parallel';
  artifact?: string; // For dependency edges
}

// =============================================================================
// Query Memory Types (formalized from llmunix)
// =============================================================================

export interface QueryMemoryOptions {
  memoryType?: 'agent_templates' | 'workflow_patterns' | 'domain_knowledge' | 'skills' | 'traces' | 'all';
  scope?: 'project' | 'global' | 'similar';
  projectContext?: string;
  timeRange?: {
    from?: string;
    to?: string;
  };
  limit?: number;
  minRelevance?: number;
}

export interface QueryMemoryResult {
  matches: MemoryMatch[];
  querySummary: string;
  totalSearched: number;
  searchTimeMs: number;
}

export interface MemoryMatch {
  path: string;
  relevance: number;
  type: string;
  excerpt: string;
  metadata: Record<string, any>;
}

// =============================================================================
// LLM Pattern Matcher
// =============================================================================

export class LLMPatternMatcher {
  private traces: ExecutionTrace[] = [];
  private cachedPatterns: ConsolidatedPattern[] = [];
  private lastAnalysisTime: number = 0;
  private analysisInterval: number = 5 * 60 * 1000; // 5 minutes

  /**
   * Add an execution trace to the pattern matcher
   */
  addTrace(trace: ExecutionTrace): void {
    this.traces.push(trace);

    // Keep last 100 traces
    if (this.traces.length > 100) {
      this.traces = this.traces.slice(-100);
    }
  }

  /**
   * Find similar past executions for a new task
   * Uses LLM for semantic matching
   */
  async findSimilarTasks(
    newTask: string,
    options: { limit?: number; minSimilarity?: number } = {}
  ): Promise<PatternMatch[]> {
    const { limit = 5, minSimilarity = 0.5 } = options;

    if (this.traces.length === 0) {
      return [];
    }

    const llmClient = createLLMClient();
    if (!llmClient) {
      console.warn('[PatternMatcher] LLM client not available, using fallback');
      return this.fallbackSimilaritySearch(newTask, limit);
    }

    const prompt = this.buildSimilarityPrompt(newTask, this.traces.slice(-20));

    try {
      const response = await llmClient.chatDirect([
        { role: 'system', content: PATTERN_MATCHER_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);

      const matches = this.parseSimilarityResponse(response);
      return matches
        .filter(m => m.similarity >= minSimilarity)
        .slice(0, limit);
    } catch (error) {
      console.error('[PatternMatcher] LLM similarity search failed:', error);
      return this.fallbackSimilaritySearch(newTask, limit);
    }
  }

  /**
   * Extract patterns from recent traces using LLM analysis
   */
  async extractPatterns(forceRefresh: boolean = false): Promise<ConsolidatedPattern[]> {
    const now = Date.now();

    // Use cache if available and recent
    if (!forceRefresh &&
        this.cachedPatterns.length > 0 &&
        now - this.lastAnalysisTime < this.analysisInterval) {
      return this.cachedPatterns;
    }

    if (this.traces.length < 3) {
      return [];
    }

    const llmClient = createLLMClient();
    if (!llmClient) {
      console.warn('[PatternMatcher] LLM client not available for pattern extraction');
      return this.cachedPatterns;
    }

    const prompt = this.buildPatternExtractionPrompt(this.traces.slice(-30));

    try {
      const response = await llmClient.chatDirect([
        { role: 'system', content: PATTERN_EXTRACTOR_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);

      this.cachedPatterns = this.parsePatternResponse(response);
      this.lastAnalysisTime = now;

      return this.cachedPatterns;
    } catch (error) {
      console.error('[PatternMatcher] Pattern extraction failed:', error);
      return this.cachedPatterns;
    }
  }

  /**
   * Get skill recommendations for a task based on patterns
   */
  async recommendSkills(
    task: string,
    availableSkills: Array<{ id: string; name: string; description: string }>
  ): Promise<SkillRecommendation[]> {
    if (availableSkills.length === 0) {
      return [];
    }

    const llmClient = createLLMClient();
    if (!llmClient) {
      return [];
    }

    // Get recent similar tasks for context
    const similarTasks = await this.findSimilarTasks(task, { limit: 3 });

    const prompt = this.buildSkillRecommendationPrompt(task, availableSkills, similarTasks);

    try {
      const response = await llmClient.chatDirect([
        { role: 'system', content: SKILL_RECOMMENDER_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);

      return this.parseSkillRecommendations(response);
    } catch (error) {
      console.error('[PatternMatcher] Skill recommendation failed:', error);
      return [];
    }
  }

  /**
   * Analyze traces and generate a skill draft
   */
  async generateSkillFromPatterns(
    patternIds: string[]
  ): Promise<{ name: string; description: string; content: string } | null> {
    const patterns = this.cachedPatterns.filter(p => patternIds.includes(p.id));

    if (patterns.length === 0) {
      return null;
    }

    const llmClient = createLLMClient();
    if (!llmClient) {
      return null;
    }

    const prompt = this.buildSkillGenerationPrompt(patterns);

    try {
      const response = await llmClient.chatDirect([
        { role: 'system', content: SKILL_GENERATOR_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]);

      return this.parseSkillGeneration(response);
    } catch (error) {
      console.error('[PatternMatcher] Skill generation failed:', error);
      return null;
    }
  }

  /**
   * Get comprehensive analysis of the system's learning
   */
  async getComprehensiveAnalysis(): Promise<LLMPatternAnalysis> {
    const patterns = await this.extractPatterns();

    const successfulTraces = this.traces.filter(t => t.success);
    const successRate = this.traces.length > 0
      ? successfulTraces.length / this.traces.length
      : 0;

    // Aggregate tool usage
    const toolUsage: Record<string, number> = {};
    for (const trace of this.traces) {
      for (const tool of trace.toolsUsed) {
        toolUsage[tool] = (toolUsage[tool] || 0) + 1;
      }
    }

    const topTools = Object.entries(toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => tool);

    const insights = [
      `Analyzed ${this.traces.length} execution traces`,
      `Overall success rate: ${(successRate * 100).toFixed(1)}%`,
      `Most used tools: ${topTools.join(', ') || 'None yet'}`,
      `Detected ${patterns.length} recurring patterns`
    ];

    return {
      patterns,
      suggestedSkills: [], // Populated by recommendSkills call
      insights
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private buildSimilarityPrompt(newTask: string, traces: ExecutionTrace[]): string {
    const traceDescriptions = traces.map((t, i) => `
[Trace ${i + 1}] ID: ${t.id}
Goal: ${t.goal}
Success: ${t.success}
Tools: ${t.toolsUsed.join(', ')}
`).join('\n');

    return `Find traces similar to this new task:

NEW TASK: "${newTask}"

PAST EXECUTION TRACES:
${traceDescriptions}

Identify which traces are semantically similar to the new task.
For each similar trace, explain what aspects are relevant.

Return JSON:
{
  "matches": [
    {
      "traceId": "trace-id",
      "similarity": 0.85,
      "relevantAspects": ["aspect1", "aspect2"],
      "suggestedApproach": "Brief suggestion based on past success"
    }
  ]
}`;
  }

  private buildPatternExtractionPrompt(traces: ExecutionTrace[]): string {
    const traceDescriptions = traces.map(t => `
Goal: ${t.goal}
Success: ${t.success}
Tools: ${t.toolsUsed.join(', ')}
Duration: ${t.duration}ms
`).join('\n---\n');

    return `Analyze these execution traces and identify recurring patterns:

TRACES:
${traceDescriptions}

Look for:
1. Similar types of tasks (data analysis, visualization, file operations, etc.)
2. Common tool sequences that lead to success
3. Patterns in successful vs failed executions
4. Opportunities for skill creation

Return JSON:
{
  "patterns": [
    {
      "id": "pattern-uuid",
      "name": "Pattern Name",
      "description": "What this pattern represents",
      "triggers": ["when to apply this pattern"],
      "approach": ["step 1", "step 2"],
      "toolSequence": ["tool1", "tool2"],
      "successRate": 0.9,
      "exampleCount": 5
    }
  ]
}`;
  }

  private buildSkillRecommendationPrompt(
    task: string,
    skills: Array<{ id: string; name: string; description: string }>,
    similarTasks: PatternMatch[]
  ): string {
    const skillList = skills.map(s =>
      `- ${s.name} (${s.id}): ${s.description}`
    ).join('\n');

    const contextInfo = similarTasks.length > 0
      ? `\n\nSIMILAR PAST TASKS:\n${similarTasks.map(t => `- ${t.goal} (similarity: ${t.similarity})`).join('\n')}`
      : '';

    return `Recommend relevant skills for this task:

TASK: "${task}"

AVAILABLE SKILLS:
${skillList}
${contextInfo}

Return JSON:
{
  "recommendations": [
    {
      "skillId": "skill-id",
      "skillName": "Skill Name",
      "relevance": 0.9,
      "reason": "Why this skill is relevant",
      "applicableSteps": ["how to apply step 1", "step 2"]
    }
  ]
}`;
  }

  private buildSkillGenerationPrompt(patterns: ConsolidatedPattern[]): string {
    const patternDescriptions = patterns.map(p => `
Pattern: ${p.name}
Description: ${p.description}
Triggers: ${p.triggers.join(', ')}
Approach: ${p.approach.join(' → ')}
Success Rate: ${(p.successRate * 100).toFixed(0)}%
`).join('\n---\n');

    return `Generate a reusable skill from these patterns:

PATTERNS:
${patternDescriptions}

Create a comprehensive skill that captures the best practices from these patterns.

Return JSON:
{
  "name": "Skill Name",
  "description": "One-line description",
  "content": "Full markdown skill content with:\n## When to Use\n## Approach\n## Example"
}`;
  }

  private parseSimilarityResponse(response: string): PatternMatch[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const data = JSON.parse(jsonMatch[0]);
      return (data.matches || []).map((m: any) => ({
        traceId: m.traceId,
        goal: this.traces.find(t => t.id === m.traceId)?.goal || '',
        similarity: m.similarity,
        relevantAspects: m.relevantAspects || [],
        suggestedApproach: m.suggestedApproach
      }));
    } catch {
      return [];
    }
  }

  private parsePatternResponse(response: string): ConsolidatedPattern[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const data = JSON.parse(jsonMatch[0]);
      return (data.patterns || []).map((p: any) => ({
        id: p.id || `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: p.name,
        description: p.description,
        triggers: p.triggers || [],
        approach: p.approach || [],
        toolSequence: p.toolSequence || [],
        successRate: p.successRate || 0,
        exampleCount: p.exampleCount || 0
      }));
    } catch {
      return [];
    }
  }

  private parseSkillRecommendations(response: string): SkillRecommendation[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const data = JSON.parse(jsonMatch[0]);
      return (data.recommendations || []).map((r: any) => ({
        skillId: r.skillId,
        skillName: r.skillName,
        relevance: r.relevance,
        reason: r.reason,
        applicableSteps: r.applicableSteps || []
      }));
    } catch {
      return [];
    }
  }

  private parseSkillGeneration(response: string): { name: string; description: string; content: string } | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const data = JSON.parse(jsonMatch[0]);
      if (!data.name || !data.content) return null;

      return {
        name: data.name,
        description: data.description || '',
        content: data.content
      };
    } catch {
      return null;
    }
  }

  /**
   * Fallback keyword-based similarity when LLM is unavailable
   */
  private fallbackSimilaritySearch(query: string, limit: number): PatternMatch[] {
    const queryTerms = query.toLowerCase().split(/\s+/);

    const scored = this.traces.map(trace => {
      const goalLower = trace.goal.toLowerCase();
      const matchCount = queryTerms.filter(term => goalLower.includes(term)).length;
      const similarity = matchCount / Math.max(queryTerms.length, 1);

      return {
        traceId: trace.id,
        goal: trace.goal,
        similarity,
        relevantAspects: queryTerms.filter(term => goalLower.includes(term)),
        suggestedApproach: trace.success ? 'Previous execution was successful' : undefined
      };
    });

    return scored
      .filter(s => s.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // ===========================================================================
  // Trace Linking Methods (from llmunix gap analysis)
  // ===========================================================================

  /**
   * Build a trace graph from all traces
   */
  buildTraceGraph(rootTraceId?: string): TraceGraph {
    const nodes = new Map<string, ExecutionTrace>();
    const edges: TraceEdge[] = [];

    // Build node map
    for (const trace of this.traces) {
      nodes.set(trace.id, trace);
    }

    // Build edge list
    for (const trace of this.traces) {
      // Parent-child edges
      if (trace.parentTraceId && nodes.has(trace.parentTraceId)) {
        edges.push({
          from: trace.parentTraceId,
          to: trace.id,
          type: trace.linkType || 'hierarchical'
        });
      }

      // Dependency edges
      if (trace.dependsOn) {
        for (const dep of trace.dependsOn) {
          if (nodes.has(dep.traceId)) {
            edges.push({
              from: dep.traceId,
              to: trace.id,
              type: 'dependency',
              artifact: dep.outputFile
            });
          }
        }
      }
    }

    return { nodes, edges, rootTraceId };
  }

  /**
   * Find all children of a trace
   */
  findChildTraces(traceId: string): ExecutionTrace[] {
    return this.traces.filter(t => t.parentTraceId === traceId);
  }

  /**
   * Find the dependency chain for a trace
   */
  findDependencyChain(traceId: string): string[] {
    const trace = this.traces.find(t => t.id === traceId);
    if (!trace?.dependsOn) return [];

    const chain: string[] = [];
    for (const dep of trace.dependsOn) {
      chain.push(dep.traceId);
      chain.push(...this.findDependencyChain(dep.traceId));
    }
    return [...new Set(chain)]; // Remove duplicates
  }

  /**
   * Get execution order (topologically sorted by dependencies)
   */
  getExecutionOrder(rootTraceId?: string): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (traceId: string) => {
      if (visited.has(traceId)) return;
      visited.add(traceId);

      const trace = this.traces.find(t => t.id === traceId);
      if (!trace) return;

      // Visit dependencies first
      if (trace.dependsOn) {
        for (const dep of trace.dependsOn) {
          visit(dep.traceId);
        }
      }

      order.push(traceId);

      // Visit children
      for (const child of this.findChildTraces(traceId)) {
        visit(child.id);
      }
    };

    if (rootTraceId) {
      visit(rootTraceId);
    } else {
      // Find root traces (no parent) and process each
      const roots = this.traces.filter(t => !t.parentTraceId);
      for (const root of roots) {
        visit(root.id);
      }
    }

    return order;
  }

  /**
   * Create a trace with proper linking
   */
  createLinkedTrace(
    baseTrace: Omit<ExecutionTrace, 'id' | 'timestamp' | 'lifecycleState'>,
    parentTraceId?: string,
    linkType?: ExecutionTrace['linkType']
  ): ExecutionTrace {
    const parentTrace = parentTraceId ? this.traces.find(t => t.id === parentTraceId) : undefined;

    const trace: ExecutionTrace = {
      ...baseTrace,
      id: `trace-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      parentTraceId,
      linkType: linkType || (parentTraceId ? 'hierarchical' : undefined),
      depth: parentTrace ? (parentTrace.depth || 0) + 1 : 0,
      lifecycleState: 'active'
    };

    this.addTrace(trace);
    return trace;
  }

  // ===========================================================================
  // Trace Lifecycle Methods (from llmunix gap analysis)
  // ===========================================================================

  /**
   * Mark a trace as consolidated
   */
  consolidateTrace(traceId: string): boolean {
    const trace = this.traces.find(t => t.id === traceId);
    if (!trace) return false;

    trace.lifecycleState = 'consolidated';
    trace.consolidatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Mark a trace as archived
   */
  archiveTrace(traceId: string): boolean {
    const trace = this.traces.find(t => t.id === traceId);
    if (!trace) return false;

    trace.lifecycleState = 'archived';
    trace.archivedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get traces by lifecycle state
   */
  getTracesByLifecycle(state: ExecutionTrace['lifecycleState']): ExecutionTrace[] {
    return this.traces.filter(t => t.lifecycleState === state);
  }

  /**
   * Archive old traces (older than specified days)
   */
  archiveOldTraces(olderThanDays: number = 7): number {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let archivedCount = 0;

    for (const trace of this.traces) {
      if (trace.lifecycleState === 'consolidated') {
        const traceTime = new Date(trace.timestamp).getTime();
        if (traceTime < cutoff) {
          this.archiveTrace(trace.id);
          archivedCount++;
        }
      }
    }

    return archivedCount;
  }

  // ===========================================================================
  // Cross-Project Query Methods (from llmunix gap analysis)
  // ===========================================================================

  /**
   * Query memory with formalized options (implements QueryMemoryTool spec)
   */
  async queryMemory(
    query: string,
    options: QueryMemoryOptions = {}
  ): Promise<QueryMemoryResult> {
    const startTime = performance.now();
    const {
      memoryType = 'all',
      scope = 'project',
      limit = 10,
      minRelevance = 0.3,
      timeRange
    } = options;

    const matches: MemoryMatch[] = [];
    let totalSearched = 0;

    // Filter traces by memory type
    let candidateTraces = [...this.traces];

    // Apply time range filter
    if (timeRange?.from) {
      const fromTime = new Date(timeRange.from).getTime();
      candidateTraces = candidateTraces.filter(t =>
        new Date(t.timestamp).getTime() >= fromTime
      );
    }
    if (timeRange?.to) {
      const toTime = new Date(timeRange.to).getTime();
      candidateTraces = candidateTraces.filter(t =>
        new Date(t.timestamp).getTime() <= toTime
      );
    }

    // Apply memory type filter
    if (memoryType !== 'all') {
      candidateTraces = candidateTraces.filter(t => {
        switch (memoryType) {
          case 'traces':
            return true; // All traces
          case 'agent_templates':
            return t.agentType === 'dynamic';
          case 'workflow_patterns':
            return t.traceType === 'main';
          case 'domain_knowledge':
            return t.taskCategory != null;
          case 'skills':
            return t.filesCreated?.some(f => f.includes('/skills/'));
          default:
            return true;
        }
      });
    }

    totalSearched = candidateTraces.length;

    // Score and rank matches
    const queryTerms = query.toLowerCase().split(/\s+/);

    for (const trace of candidateTraces) {
      const searchText = `${trace.goal} ${trace.taskCategory || ''} ${trace.agentName || ''}`.toLowerCase();
      const matchCount = queryTerms.filter(term => searchText.includes(term)).length;
      const relevance = matchCount / Math.max(queryTerms.length, 1);

      if (relevance >= minRelevance) {
        matches.push({
          path: trace.projectPath || `memory/traces/${trace.id}`,
          relevance,
          type: trace.traceType || 'trace',
          excerpt: trace.goal.substring(0, 200),
          metadata: {
            traceId: trace.id,
            success: trace.success,
            timestamp: trace.timestamp,
            agentName: trace.agentName,
            toolsUsed: trace.toolsUsed,
            lifecycleState: trace.lifecycleState
          }
        });
      }
    }

    // Sort by relevance and limit
    matches.sort((a, b) => b.relevance - a.relevance);
    const limitedMatches = matches.slice(0, limit);

    const searchTimeMs = Math.round(performance.now() - startTime);

    return {
      matches: limitedMatches,
      querySummary: `Found ${limitedMatches.length} matches for "${query}" (searched ${totalSearched} traces)`,
      totalSearched,
      searchTimeMs
    };
  }

  /**
   * Get all traces (for external access)
   */
  getAllTraces(): ExecutionTrace[] {
    return [...this.traces];
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): ExecutionTrace | undefined {
    return this.traces.find(t => t.id === traceId);
  }
}

// =============================================================================
// System Prompts
// =============================================================================

const PATTERN_MATCHER_SYSTEM_PROMPT = `You are a pattern matching assistant that identifies semantic similarities between tasks.
Your goal is to find past execution traces that are relevant to a new task.
Consider:
- Similar objectives or goals
- Similar domains (data analysis, visualization, file operations)
- Similar tool requirements
- Partial matches that could provide useful context

Return results as valid JSON only.`;

const PATTERN_EXTRACTOR_SYSTEM_PROMPT = `You are a pattern analysis assistant that identifies recurring patterns in execution traces.
Your goal is to find:
1. Common task types and their characteristics
2. Successful tool sequences and approaches
3. Patterns that could become reusable skills
4. Insights about what makes executions successful

Be specific and actionable. Return results as valid JSON only.`;

const SKILL_RECOMMENDER_SYSTEM_PROMPT = `You are a skill recommendation assistant that matches available skills to tasks.
Consider:
- Direct relevance to the task
- Partial applicability
- Combination of skills that might be useful
- Context from similar past tasks

Return recommendations ranked by relevance as valid JSON only.`;

const SKILL_GENERATOR_SYSTEM_PROMPT = `You are a skill creation assistant that synthesizes patterns into reusable skills.
Create comprehensive, well-structured skills that:
1. Clearly explain when to use the skill
2. Provide step-by-step approach
3. Include examples where helpful
4. Are practical and actionable

Return the skill as valid JSON with markdown content.`;

// =============================================================================
// Singleton Instance
// =============================================================================

let patternMatcherInstance: LLMPatternMatcher | null = null;

export function getLLMPatternMatcher(): LLMPatternMatcher {
  if (!patternMatcherInstance) {
    patternMatcherInstance = new LLMPatternMatcher();
  }
  return patternMatcherInstance;
}
