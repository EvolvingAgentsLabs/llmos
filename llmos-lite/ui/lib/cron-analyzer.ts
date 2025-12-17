/**
 * Cron Analyzer Service
 * Analyzes commit messages, prompts, and traces to detect patterns
 * This is the "context memory" evolution engine
 */

import { GitService, type GitCommit, type VolumeType } from './git-service';
import { createLLMClient } from './llm-client';

export interface Pattern {
  name: string;
  description: string;
  occurrences: number;
  confidence: number;
  traceIds: number[];
  commitShas: string[];
  prompts: string[];
  artifacts: string[];
}

export interface AnalysisResult {
  patterns: Pattern[];
  totalCommits: number;
  totalTraces: number;
  skillsGenerated: string[];
  analysisTime: number;
}

export class CronAnalyzer {
  /**
   * Analyze commit history to detect patterns
   * This is the core "evolution" algorithm
   */
  static async analyzeVolume(
    volume: VolumeType,
    options: {
      since?: Date;
      minOccurrences?: number;
      minConfidence?: number;
    } = {}
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    const { since, minOccurrences = 2, minConfidence = 0.7 } = options;

    // Fetch commit history from GitHub
    const commits = await GitService.fetchCommitHistory(volume, {
      since: since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    });

    if (commits.length === 0) {
      return {
        patterns: [],
        totalCommits: 0,
        totalTraces: 0,
        skillsGenerated: [],
        analysisTime: Date.now() - startTime,
      };
    }

    // Extract context from commit messages
    const contexts = commits.map(commit => this.extractContext(commit));

    // Detect patterns using LLM
    const patterns = await this.detectPatterns(contexts, {
      minOccurrences,
      minConfidence,
    });

    // Generate skills from high-confidence patterns
    const skillsGenerated = await this.generateSkills(patterns.filter(p => p.confidence >= 0.85));

    return {
      patterns,
      totalCommits: commits.length,
      totalTraces: contexts.reduce((sum, ctx) => sum + ctx.traces.length, 0),
      skillsGenerated,
      analysisTime: Date.now() - startTime,
    };
  }

  /**
   * Extract structured context from commit message
   * Parses the rich context embedded in commit messages
   */
  private static extractContext(commit: GitCommit): {
    sha: string;
    prompt: string;
    messageCount: number;
    artifacts: string[];
    traces: number[];
  } {
    const lines = commit.message.split('\n');

    let prompt = '';
    const artifacts: string[] = [];
    const traces: number[] = [];
    let messageCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Extract prompt
      if (line.startsWith('Prompt:')) {
        prompt = line.replace('Prompt:', '').trim();
      }

      // Extract message count
      if (line.match(/- (\d+) messages/)) {
        messageCount = parseInt(line.match(/- (\d+) messages/)![1]);
      }

      // Extract artifacts
      if (line.match(/- (skill|code|workflow): (.+)/)) {
        const match = line.match(/- (skill|code|workflow): (.+)/)!;
        artifacts.push(`${match[1]}:${match[2].trim()}`);
      }

      // Extract trace IDs (if embedded in commit)
      if (line.match(/Trace #(\d+)/)) {
        const traceId = parseInt(line.match(/Trace #(\d+)/)![1]);
        traces.push(traceId);
      }
    }

    return {
      sha: commit.sha,
      prompt,
      messageCount,
      artifacts,
      traces,
    };
  }

  /**
   * Detect patterns using LLM analysis
   * Sends commit contexts to LLM for pattern recognition
   */
  private static async detectPatterns(
    contexts: Array<{
      sha: string;
      prompt: string;
      messageCount: number;
      artifacts: string[];
      traces: number[];
    }>,
    options: {
      minOccurrences: number;
      minConfidence: number;
    }
  ): Promise<Pattern[]> {
    if (contexts.length < 2) return [];

    const client = createLLMClient();
    if (!client) {
      console.warn('LLM client not configured, skipping pattern detection');
      return [];
    }

    // Create analysis prompt
    const promptsText = contexts
      .map((ctx, idx) => `${idx + 1}. ${ctx.prompt}`)
      .join('\n');

    const artifactsText = contexts
      .flatMap(ctx => ctx.artifacts)
      .join('\n');

    const analysisPrompt = `Analyze these ${contexts.length} user prompts from commit history and identify recurring patterns:

PROMPTS:
${promptsText}

ARTIFACTS GENERATED:
${artifactsText}

Task: Identify 3-5 recurring patterns or themes. For each pattern:
1. Name (concise, 3-5 words)
2. Description (1 sentence)
3. Which prompt numbers show this pattern
4. Confidence score (0-1)

Focus on:
- Similar problem domains (quantum, ML, data analysis, API development, etc.)
- Common workflows or techniques
- Recurring artifact types

Return ONLY valid JSON:
{
  "patterns": [
    {
      "name": "Pattern Name",
      "description": "Brief description",
      "promptIndices": [1, 3, 5],
      "confidence": 0.92
    }
  ]
}`;

    try {
      const response = await client.chatDirect([
        {
          role: 'user',
          content: analysisPrompt,
        },
      ]);

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('Failed to parse LLM pattern response');
        return [];
      }

      const result = JSON.parse(jsonMatch[0]);

      // Convert to Pattern format
      const patterns: Pattern[] = result.patterns
        .map((p: any) => ({
          name: p.name,
          description: p.description,
          occurrences: p.promptIndices.length,
          confidence: p.confidence,
          traceIds: p.promptIndices.flatMap((idx: number) => contexts[idx - 1]?.traces || []),
          commitShas: p.promptIndices.map((idx: number) => contexts[idx - 1]?.sha || '').filter(Boolean),
          prompts: p.promptIndices.map((idx: number) => contexts[idx - 1]?.prompt || '').filter(Boolean),
          artifacts: p.promptIndices.flatMap((idx: number) => contexts[idx - 1]?.artifacts || []),
        }))
        .filter((p: Pattern) =>
          p.occurrences >= options.minOccurrences &&
          p.confidence >= options.minConfidence
        );

      return patterns;
    } catch (error) {
      console.error('Pattern detection failed:', error);
      return [];
    }
  }

  /**
   * Generate skills from detected patterns
   * Creates reusable skill files from high-confidence patterns
   */
  private static async generateSkills(patterns: Pattern[]): Promise<string[]> {
    if (patterns.length === 0) return [];

    const client = createLLMClient();
    if (!client) return [];

    const skillsGenerated: string[] = [];

    for (const pattern of patterns) {
      const skillName = this.patternToSkillName(pattern.name);
      const skillPrompt = `Create a reusable skill document for: ${pattern.name}

Description: ${pattern.description}

Example prompts that use this pattern:
${pattern.prompts.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Artifacts produced: ${pattern.artifacts.slice(0, 5).join(', ')}

Create a skill document with:
1. Title
2. Purpose
3. Input parameters
4. Step-by-step workflow
5. Example code or template
6. Common variations

Format as Markdown.`;

      try {
        const skillContent = await client.chatDirect([
          {
            role: 'user',
            content: skillPrompt,
          },
        ]);

        skillsGenerated.push(skillName);

        // In production, would commit this to the repository
        console.log(`Generated skill: ${skillName}.md`);
      } catch (error) {
        console.error(`Failed to generate skill for pattern: ${pattern.name}`, error);
      }
    }

    return skillsGenerated;
  }

  /**
   * Convert pattern name to valid skill filename
   */
  private static patternToSkillName(patternName: string): string {
    return patternName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
