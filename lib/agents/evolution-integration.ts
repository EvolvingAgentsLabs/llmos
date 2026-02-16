/**
 * Evolution Integration
 *
 * Connects the LLM-based pattern matcher with the system evolution engine.
 * This bridges the new agentic architecture with the existing evolution system.
 *
 * Key capabilities:
 * - Automatic skill generation from detected patterns
 * - LLM-enhanced pattern analysis
 * - Continuous learning pipeline
 */

import { getLLMPatternMatcher, ConsolidatedPattern, ExecutionTrace } from './llm-pattern-matcher';
import { getVFS } from '../virtual-fs';
import { createLLMClient } from '../llm/client';
// GitService removed during cleanup

// =============================================================================
// Types
// =============================================================================

export interface EvolutionTrigger {
  type: 'pattern_detected' | 'skill_generated' | 'learning_consolidated';
  patternId?: string;
  skillId?: string;
  details: string;
  timestamp: string;
}

export interface SkillCandidate {
  name: string;
  description: string;
  category: string;
  content: string;
  sourcePatterns: string[];
  confidence: number;
  suggestedPath: string;
}

export interface EvolutionReport {
  analyzedAt: string;
  tracesAnalyzed: number;
  patternsDetected: ConsolidatedPattern[];
  skillCandidates: SkillCandidate[];
  recommendations: string[];
  triggers: EvolutionTrigger[];
}

// =============================================================================
// Evolution Integration Service
// =============================================================================

export class EvolutionIntegration {
  private patternMatcher = getLLMPatternMatcher();
  private triggers: EvolutionTrigger[] = [];
  private lastEvolutionRun: number = 0;
  private evolutionInterval: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Record an execution for learning
   */
  recordExecution(trace: ExecutionTrace): void {
    this.patternMatcher.addTrace(trace);

    // Check if we should trigger evolution
    this.maybeRunEvolution();
  }

  /**
   * Run evolution analysis if enough time has passed
   */
  private async maybeRunEvolution(): Promise<void> {
    const now = Date.now();
    if (now - this.lastEvolutionRun < this.evolutionInterval) {
      return;
    }

    this.lastEvolutionRun = now;

    try {
      await this.runEvolutionCycle();
    } catch (error) {
      console.error('[Evolution] Cycle failed:', error);
    }
  }

  /**
   * Run a full evolution cycle
   */
  async runEvolutionCycle(): Promise<EvolutionReport> {
    console.log('[Evolution] Starting evolution cycle...');

    // 1. Extract patterns using LLM
    const patterns = await this.patternMatcher.extractPatterns(true);

    // 2. Generate skill candidates from viable patterns
    const skillCandidates: SkillCandidate[] = [];
    const viablePatterns = patterns.filter(p =>
      p.successRate >= 0.7 && p.exampleCount >= 3
    );

    for (const pattern of viablePatterns) {
      const skill = await this.generateSkillFromPattern(pattern);
      if (skill) {
        skillCandidates.push(skill);

        this.triggers.push({
          type: 'pattern_detected',
          patternId: pattern.id,
          details: `Pattern "${pattern.name}" detected with ${(pattern.successRate * 100).toFixed(0)}% success rate`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // 3. Generate recommendations
    const recommendations = this.generateRecommendations(patterns, skillCandidates);

    // 4. Get comprehensive analysis
    const analysis = await this.patternMatcher.getComprehensiveAnalysis();

    const report: EvolutionReport = {
      analyzedAt: new Date().toISOString(),
      tracesAnalyzed: analysis.insights.length > 0
        ? parseInt(analysis.insights[0].match(/\d+/)?.[0] || '0')
        : 0,
      patternsDetected: patterns,
      skillCandidates,
      recommendations,
      triggers: this.triggers.slice(-20) // Keep last 20 triggers
    };

    // 5. Persist evolution report
    await this.persistReport(report);

    console.log(`[Evolution] Cycle complete: ${patterns.length} patterns, ${skillCandidates.length} skill candidates`);

    return report;
  }

  /**
   * Generate a skill from a pattern
   */
  private async generateSkillFromPattern(pattern: ConsolidatedPattern): Promise<SkillCandidate | null> {
    const llmClient = createLLMClient();
    if (!llmClient) {
      return this.generateBasicSkill(pattern);
    }

    const prompt = `Create a comprehensive skill from this pattern:

Pattern Name: ${pattern.name}
Description: ${pattern.description}
Success Rate: ${(pattern.successRate * 100).toFixed(0)}%
Tool Sequence: ${pattern.toolSequence.join(' → ')}
Triggers: ${pattern.triggers.join(', ')}

Approach:
${pattern.approach.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Generate a detailed, reusable skill in markdown format.

Return JSON:
{
  "name": "Skill Name",
  "description": "One-line description",
  "category": "coding|analysis|visualization|automation",
  "content": "Full markdown skill content with sections:\n## When to Use\n## Prerequisites\n## Approach\n## Example\n## Tips",
  "confidence": 0.85
}`;

    try {
      const response = await llmClient.chatDirect([
        { role: 'system', content: 'You are a skill creation assistant. Generate practical, actionable skills from patterns. Return valid JSON only.' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.generateBasicSkill(pattern);
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        name: data.name || pattern.name,
        description: data.description || pattern.description,
        category: data.category || 'general',
        content: data.content || this.generateBasicContent(pattern),
        sourcePatterns: [pattern.id],
        confidence: data.confidence || pattern.successRate,
        suggestedPath: `skills/${this.slugify(data.name || pattern.name)}.md`
      };
    } catch (error) {
      console.warn('[Evolution] LLM skill generation failed:', error);
      return this.generateBasicSkill(pattern);
    }
  }

  /**
   * Generate a basic skill without LLM
   */
  private generateBasicSkill(pattern: ConsolidatedPattern): SkillCandidate {
    return {
      name: pattern.name,
      description: pattern.description,
      category: this.inferCategory(pattern),
      content: this.generateBasicContent(pattern),
      sourcePatterns: [pattern.id],
      confidence: pattern.successRate,
      suggestedPath: `skills/${this.slugify(pattern.name)}.md`
    };
  }

  /**
   * Generate basic skill content
   */
  private generateBasicContent(pattern: ConsolidatedPattern): string {
    return `# ${pattern.name}

## Description
${pattern.description}

## When to Use
${pattern.triggers.map(t => `- ${t}`).join('\n')}

## Approach
${pattern.approach.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Recommended Tools
${pattern.toolSequence.map(t => `- \`${t}\``).join('\n')}

## Success Rate
This pattern has a ${(pattern.successRate * 100).toFixed(0)}% success rate based on ${pattern.exampleCount} executions.

---
*Auto-generated from execution patterns*
`;
  }

  /**
   * Infer skill category from pattern
   */
  private inferCategory(pattern: ConsolidatedPattern): string {
    const text = `${pattern.name} ${pattern.description} ${pattern.triggers.join(' ')}`.toLowerCase();

    if (text.includes('visualiz') || text.includes('plot') || text.includes('chart')) {
      return 'visualization';
    }
    if (text.includes('analys') || text.includes('data') || text.includes('statistic')) {
      return 'analysis';
    }
    if (text.includes('code') || text.includes('script') || text.includes('program')) {
      return 'coding';
    }
    if (text.includes('automat') || text.includes('workflow') || text.includes('batch')) {
      return 'automation';
    }

    return 'general';
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    patterns: ConsolidatedPattern[],
    skillCandidates: SkillCandidate[]
  ): string[] {
    const recommendations: string[] = [];

    // High success patterns
    const highSuccess = patterns.filter(p => p.successRate >= 0.9);
    if (highSuccess.length > 0) {
      recommendations.push(
        `Consider promoting ${highSuccess.length} high-success patterns to system skills`
      );
    }

    // Low success patterns
    const lowSuccess = patterns.filter(p => p.successRate < 0.5);
    if (lowSuccess.length > 0) {
      recommendations.push(
        `Review ${lowSuccess.length} low-success patterns for potential improvements`
      );
    }

    // Skill candidates
    if (skillCandidates.length > 0) {
      recommendations.push(
        `${skillCandidates.length} skill candidates ready for review and approval`
      );
    }

    // Tool diversity
    const allTools = new Set<string>();
    for (const pattern of patterns) {
      pattern.toolSequence.forEach(t => allTools.add(t));
    }

    if (allTools.size < 3) {
      recommendations.push(
        'Consider exploring more tools for diverse problem-solving approaches'
      );
    }

    return recommendations;
  }

  /**
   * Persist the evolution report
   */
  private async persistReport(report: EvolutionReport): Promise<void> {
    const vfs = getVFS();

    // Save report to VFS
    const reportPath = `system/evolution/report_${Date.now()}.json`;
    vfs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Update latest report link
    vfs.writeFile('system/evolution/latest_report.json', JSON.stringify(report, null, 2));

    // Append to evolution log
    const logPath = 'system/evolution/evolution_log.md';
    let existingLog = '';
    try {
      existingLog = vfs.readFileContent(logPath) || '';
    } catch {
      // File may not exist
    }

    const logEntry = `
## [${report.analyzedAt}] Evolution Cycle

- **Patterns Detected:** ${report.patternsDetected.length}
- **Skill Candidates:** ${report.skillCandidates.length}
- **Recommendations:** ${report.recommendations.length}

### Top Patterns
${report.patternsDetected.slice(0, 3).map(p =>
  `- ${p.name} (${(p.successRate * 100).toFixed(0)}% success)`
).join('\n') || '(none)'}

### Recommendations
${report.recommendations.map(r => `- ${r}`).join('\n') || '(none)'}

---
`;

    vfs.writeFile(logPath, existingLog + logEntry);
  }

  /**
   * Approve and persist a skill candidate
   */
  async approveSkill(candidate: SkillCandidate): Promise<boolean> {
    try {
      const vfs = getVFS();

      // Add frontmatter
      const fullContent = `---
name: ${candidate.name}
category: ${candidate.category}
description: ${candidate.description}
confidence: ${candidate.confidence}
sourcePatterns: ${JSON.stringify(candidate.sourcePatterns)}
createdAt: ${new Date().toISOString()}
---

${candidate.content}`;

      // Write to VFS
      vfs.writeFile(candidate.suggestedPath, fullContent);

      // Git commit removed during cleanup

      this.triggers.push({
        type: 'skill_generated',
        skillId: candidate.suggestedPath,
        details: `Skill "${candidate.name}" approved and saved`,
        timestamp: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('[Evolution] Failed to approve skill:', error);
      return false;
    }
  }

  /**
   * Get recent evolution triggers
   */
  getTriggers(limit: number = 10): EvolutionTrigger[] {
    return this.triggers.slice(-limit);
  }

  /**
   * Slugify a string for file paths
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let evolutionInstance: EvolutionIntegration | null = null;

export function getEvolutionIntegration(): EvolutionIntegration {
  if (!evolutionInstance) {
    evolutionInstance = new EvolutionIntegration();
  }
  return evolutionInstance;
}

/**
 * Run an evolution cycle (convenience function)
 */
export async function runEvolutionCycle(): Promise<EvolutionReport> {
  const integration = getEvolutionIntegration();
  return integration.runEvolutionCycle();
}
