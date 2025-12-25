/**
 * System Evolution Service
 *
 * Analyzes sub-agents and artifacts across volumes,
 * detects successful patterns from long-term memory,
 * and promotes artifacts to the system volume.
 *
 * This is the "on-demand" evolution trigger that analyzes
 * user and team volumes to identify artifacts worth promoting
 * to the system volume for organization-wide use.
 */

import { getVFS } from './virtual-fs';
import { getSubAgentExecutor, SubAgentDefinition } from './subagents/subagent-executor';
import {
  getSubAgentUsage,
  recordSubAgentExecution,
  clearSubAgentUsage,
  SubAgentUsageRecord,
} from './subagents/usage-tracker';
import { artifactManager } from './artifacts/artifact-manager';
import { GitService, VolumeType } from './git-service';
import { createLLMClient } from './llm-client';
import { CronAnalyzer, Pattern } from './cron-analyzer';

// Re-export usage tracker functions for convenience
export { getSubAgentUsage, recordSubAgentExecution, clearSubAgentUsage };
export type { SubAgentUsageRecord };

// ============================================================================
// Types
// ============================================================================

export interface ArtifactAnalysis {
  id: string;
  name: string;
  type: 'agent' | 'tool' | 'skill' | 'workflow' | 'code';
  volume: VolumeType;
  usageCount: number;
  successRate: number;
  lastUsed: string | null;
  createdAt: string;
  description?: string;
  recommendPromotion: boolean;
  promotionReason?: string;
  confidence: number;
}

export interface EvolutionRecommendation {
  artifactId: string;
  artifactName: string;
  artifactType: string;
  sourceVolume: VolumeType;
  action: 'promote' | 'evolve' | 'merge' | 'archive';
  reason: string;
  confidence: number;
  basedOn: string[];  // Evidence from memory/patterns
}

export interface SystemEvolutionResult {
  analyzedAt: string;

  // Sub-agent analysis
  subAgents: {
    system: SubAgentDefinition[];
    team: SubAgentDefinition[];
    user: SubAgentDefinition[];
    usageStats: SubAgentUsageRecord[];
  };

  // Artifact analysis
  artifacts: ArtifactAnalysis[];

  // Patterns from commit history
  patterns: Pattern[];

  // Recommendations
  recommendations: EvolutionRecommendation[];

  // Long-term memory insights
  memoryInsights: {
    totalWorkflows: number;
    commonTools: string[];
    successPatterns: string[];
    recentLearnings: string[];
  };

  // Analysis stats
  analysisTime: number;
}

export interface PromotionResult {
  success: boolean;
  artifactId: string;
  artifactName: string;
  sourceVolume: VolumeType;
  targetVolume: VolumeType;
  newPath?: string;
  commitHash?: string;
  error?: string;
}

// ============================================================================
// System Evolution Analyzer
// ============================================================================

export class SystemEvolutionAnalyzer {
  private vfs = getVFS();
  private subAgentExecutor = getSubAgentExecutor();

  /**
   * Run full system evolution analysis
   */
  async analyze(
    onProgress?: (step: string, details?: string) => void
  ): Promise<SystemEvolutionResult> {
    const startTime = Date.now();

    onProgress?.('Starting analysis', 'Gathering sub-agents from all volumes...');

    // 1. Discover sub-agents across all volumes
    const [systemAgents, teamAgents, userAgents] = await Promise.all([
      this.subAgentExecutor.discoverAgents('system'),
      this.subAgentExecutor.discoverAgents('team'),
      this.subAgentExecutor.discoverAgents('user'),
    ]);

    onProgress?.('Sub-agents discovered', `System: ${systemAgents.length}, Team: ${teamAgents.length}, User: ${userAgents.length}`);

    // 2. Get usage statistics
    const usageStats = getSubAgentUsage();

    onProgress?.('Loading artifacts', 'Analyzing artifact metadata...');

    // 3. Analyze artifacts
    await artifactManager.initialize();
    const allArtifacts = artifactManager.getAll();
    const artifactAnalysis = this.analyzeArtifacts(allArtifacts, usageStats);

    onProgress?.('Analyzing patterns', 'Checking commit history for patterns...');

    // 4. Get patterns from commit history (user and team volumes)
    let patterns: Pattern[] = [];
    try {
      const userResult = await CronAnalyzer.analyzeVolume('user', {
        minOccurrences: 2,
        minConfidence: 0.6,
      });
      patterns = userResult.patterns;
    } catch (error) {
      console.warn('Pattern analysis failed:', error);
    }

    onProgress?.('Reading memory', 'Extracting insights from long-term memory...');

    // 5. Extract insights from long-term memory
    const memoryInsights = this.extractMemoryInsights();

    onProgress?.('Generating recommendations', 'Using LLM to analyze and recommend...');

    // 6. Generate recommendations using LLM
    const recommendations = await this.generateRecommendations(
      { system: systemAgents, team: teamAgents, user: userAgents },
      artifactAnalysis,
      patterns,
      memoryInsights,
      usageStats
    );

    const analysisTime = Date.now() - startTime;

    onProgress?.('Analysis complete', `Took ${(analysisTime / 1000).toFixed(1)}s`);

    return {
      analyzedAt: new Date().toISOString(),
      subAgents: {
        system: systemAgents,
        team: teamAgents,
        user: userAgents,
        usageStats,
      },
      artifacts: artifactAnalysis,
      patterns,
      recommendations,
      memoryInsights,
      analysisTime,
    };
  }

  /**
   * Analyze artifacts for promotion potential
   */
  private analyzeArtifacts(
    artifacts: any[],
    usageStats: SubAgentUsageRecord[]
  ): ArtifactAnalysis[] {
    return artifacts.map(artifact => {
      // Find usage stats if it's an agent
      const usageRecord = usageStats.find(
        u => u.agentPath.includes(artifact.name) || u.agentName === artifact.name
      );

      const usageCount = usageRecord?.executionCount || 0;
      const successRate = usageRecord
        ? usageRecord.successCount / Math.max(1, usageRecord.executionCount)
        : 0;

      // Determine if we should recommend promotion
      const isInUserOrTeam = artifact.volume === 'user' || artifact.volume === 'team';
      const hasGoodUsage = usageCount >= 3;
      const hasGoodSuccessRate = successRate >= 0.7;
      const recommendPromotion = isInUserOrTeam && hasGoodUsage && hasGoodSuccessRate;

      let promotionReason: string | undefined;
      let confidence = 0;

      if (recommendPromotion) {
        promotionReason = `Used ${usageCount} times with ${(successRate * 100).toFixed(0)}% success rate`;
        confidence = Math.min(0.95, 0.5 + (usageCount * 0.05) + (successRate * 0.3));
      }

      return {
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        volume: artifact.volume,
        usageCount,
        successRate,
        lastUsed: usageRecord?.lastExecuted || null,
        createdAt: artifact.createdAt,
        description: artifact.description,
        recommendPromotion,
        promotionReason,
        confidence,
      };
    });
  }

  /**
   * Extract insights from the system memory log
   */
  private extractMemoryInsights(): SystemEvolutionResult['memoryInsights'] {
    const memoryPath = 'system/memory_log.md';
    const memoryContent = this.vfs.readFileContent(memoryPath) || '';

    // Parse memory log entries
    const entries = memoryContent.split('---').filter(e => e.trim());

    // Extract tools used
    const toolsUsed: Record<string, number> = {};
    const successPatterns: string[] = [];
    const recentLearnings: string[] = [];

    for (const entry of entries) {
      // Extract tools
      const toolsMatch = entry.match(/\*\*Tools Used:\*\*\s*(.+)/);
      if (toolsMatch) {
        const tools = toolsMatch[1].split(',').map(t => t.trim());
        for (const tool of tools) {
          if (tool && tool !== 'None') {
            toolsUsed[tool] = (toolsUsed[tool] || 0) + 1;
          }
        }
      }

      // Extract goals as potential success patterns
      const goalMatch = entry.match(/\*\*Goal:\*\*\s*(.+)/);
      if (goalMatch && !entry.includes('Errors Encountered')) {
        successPatterns.push(goalMatch[1].trim());
      }

      // Get recent learnings (last 5 entries)
      if (entries.indexOf(entry) >= entries.length - 5) {
        if (goalMatch) {
          recentLearnings.push(goalMatch[1].trim());
        }
      }
    }

    // Sort tools by frequency
    const commonTools = Object.entries(toolsUsed)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tool]) => tool);

    return {
      totalWorkflows: entries.length,
      commonTools,
      successPatterns: successPatterns.slice(-10),
      recentLearnings,
    };
  }

  /**
   * Generate recommendations using LLM analysis
   */
  private async generateRecommendations(
    subAgents: { system: SubAgentDefinition[]; team: SubAgentDefinition[]; user: SubAgentDefinition[] },
    artifacts: ArtifactAnalysis[],
    patterns: Pattern[],
    memoryInsights: SystemEvolutionResult['memoryInsights'],
    usageStats: SubAgentUsageRecord[]
  ): Promise<EvolutionRecommendation[]> {
    const recommendations: EvolutionRecommendation[] = [];

    // First, add recommendations based on usage data
    for (const artifact of artifacts) {
      if (artifact.recommendPromotion) {
        recommendations.push({
          artifactId: artifact.id,
          artifactName: artifact.name,
          artifactType: artifact.type,
          sourceVolume: artifact.volume,
          action: 'promote',
          reason: artifact.promotionReason || 'High usage and success rate',
          confidence: artifact.confidence,
          basedOn: ['Usage statistics', 'Success rate analysis'],
        });
      }
    }

    // Add recommendations for sub-agents based on usage
    for (const usage of usageStats) {
      if (usage.volume !== 'system' && usage.executionCount >= 5) {
        const successRate = usage.successCount / usage.executionCount;
        if (successRate >= 0.8) {
          // Check if already in recommendations
          const exists = recommendations.some(r => r.artifactName === usage.agentName);
          if (!exists) {
            recommendations.push({
              artifactId: `subagent:${usage.volume}:${usage.agentPath}`,
              artifactName: usage.agentName,
              artifactType: 'agent',
              sourceVolume: usage.volume,
              action: 'promote',
              reason: `Executed ${usage.executionCount} times with ${(successRate * 100).toFixed(0)}% success rate`,
              confidence: Math.min(0.95, 0.6 + (successRate * 0.3)),
              basedOn: [
                'Execution count',
                'Success rate',
                `Tasks: ${usage.tasks.slice(0, 3).join(', ')}`,
              ],
            });
          }
        }
      }
    }

    // Check for evolution opportunities (similar agents in different volumes)
    const systemAgentNames = subAgents.system.map(a => a.name.toLowerCase());

    for (const userAgent of [...subAgents.user, ...subAgents.team]) {
      const similarSystemAgent = systemAgentNames.find(name =>
        name.includes(userAgent.name.toLowerCase()) ||
        userAgent.name.toLowerCase().includes(name)
      );

      if (similarSystemAgent) {
        const usage = usageStats.find(u => u.agentName === userAgent.name);
        if (usage && usage.executionCount >= 3) {
          recommendations.push({
            artifactId: `subagent:${userAgent.volume}:${userAgent.path}`,
            artifactName: userAgent.name,
            artifactType: 'agent',
            sourceVolume: userAgent.volume,
            action: 'evolve',
            reason: `Could enhance system agent "${similarSystemAgent}" with learnings from this variant`,
            confidence: 0.7,
            basedOn: [
              `Similar to system agent: ${similarSystemAgent}`,
              `Local usage: ${usage.executionCount} executions`,
            ],
          });
        }
      }
    }

    // Use LLM for more sophisticated recommendations if available
    try {
      const llmClient = createLLMClient();
      if (llmClient && recommendations.length > 0) {
        const llmRecommendations = await this.getLLMRecommendations(
          llmClient,
          subAgents,
          artifacts,
          patterns,
          memoryInsights
        );

        // Merge LLM recommendations with existing ones
        for (const llmRec of llmRecommendations) {
          const existing = recommendations.find(r => r.artifactName === llmRec.artifactName);
          if (existing) {
            // Boost confidence if LLM agrees
            existing.confidence = Math.min(0.98, existing.confidence + 0.1);
            existing.basedOn.push('LLM analysis');
          } else {
            recommendations.push(llmRec);
          }
        }
      }
    } catch (error) {
      console.warn('LLM recommendation analysis failed:', error);
    }

    // Sort by confidence
    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get recommendations from LLM
   */
  private async getLLMRecommendations(
    llmClient: NonNullable<ReturnType<typeof createLLMClient>>,
    subAgents: { system: SubAgentDefinition[]; team: SubAgentDefinition[]; user: SubAgentDefinition[] },
    artifacts: ArtifactAnalysis[],
    patterns: Pattern[],
    memoryInsights: SystemEvolutionResult['memoryInsights']
  ): Promise<EvolutionRecommendation[]> {
    const prompt = `Analyze this system evolution data and recommend which artifacts should be promoted to the system volume.

## Current System Agents
${subAgents.system.map(a => `- ${a.name}: ${a.description || 'No description'}`).join('\n') || 'None'}

## User/Team Agents (candidates for promotion)
${[...subAgents.user, ...subAgents.team].map(a => `- ${a.name} (${a.volume}): ${a.description || 'No description'}`).join('\n') || 'None'}

## High-Usage Artifacts
${artifacts.filter(a => a.usageCount > 2).map(a => `- ${a.name} (${a.type}, ${a.volume}): ${a.usageCount} uses, ${(a.successRate * 100).toFixed(0)}% success`).join('\n') || 'None'}

## Detected Patterns
${patterns.map(p => `- ${p.name}: ${p.description} (${(p.confidence * 100).toFixed(0)}% confidence)`).join('\n') || 'None'}

## Recent Successful Workflows
${memoryInsights.recentLearnings.slice(0, 5).join('\n') || 'None'}

## Common Tools Used
${memoryInsights.commonTools.slice(0, 5).join(', ') || 'None'}

Based on this analysis, identify 1-3 artifacts that should be:
1. **Promoted** to system volume (for org-wide use)
2. **Evolved** (merged with existing system agents)
3. **Archived** (low usage, could be removed)

Return ONLY valid JSON in this format:
{
  "recommendations": [
    {
      "artifactName": "name",
      "artifactType": "agent|tool|skill|workflow|code",
      "sourceVolume": "user|team",
      "action": "promote|evolve|merge|archive",
      "reason": "Brief explanation",
      "confidence": 0.85
    }
  ]
}`;

    try {
      const response = await llmClient.chatDirect([
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const result = JSON.parse(jsonMatch[0]);

      return (result.recommendations || []).map((r: any) => ({
        artifactId: `llm:${r.sourceVolume}:${r.artifactName}`,
        artifactName: r.artifactName,
        artifactType: r.artifactType,
        sourceVolume: r.sourceVolume,
        action: r.action,
        reason: r.reason,
        confidence: r.confidence,
        basedOn: ['LLM pattern analysis', 'Cross-volume comparison'],
      }));
    } catch (error) {
      console.warn('LLM recommendations failed:', error);
      return [];
    }
  }

  /**
   * Promote an artifact to the system volume
   */
  async promoteArtifact(
    recommendation: EvolutionRecommendation,
    onProgress?: (step: string) => void
  ): Promise<PromotionResult> {
    try {
      onProgress?.('Reading artifact content...');

      // Determine the source path based on artifact type
      let sourcePath: string;
      let content: string | null = null;

      if (recommendation.artifactId.startsWith('subagent:')) {
        // It's a sub-agent file
        const [, volume, ...pathParts] = recommendation.artifactId.split(':');
        sourcePath = pathParts.join(':');
        content = this.vfs.readFileContent(`${volume}/${sourcePath}`);
      } else if (recommendation.artifactId.startsWith('llm:')) {
        // LLM-identified artifact - need to search for it
        const artifact = artifactManager.getAll().find(
          a => a.name === recommendation.artifactName
        );
        if (artifact) {
          content = artifact.codeView || JSON.stringify(artifact, null, 2);
          sourcePath = `${recommendation.artifactType}s/${recommendation.artifactName}`;
        } else {
          throw new Error(`Artifact ${recommendation.artifactName} not found`);
        }
      } else {
        // Regular artifact from artifact manager
        const artifact = artifactManager.get(recommendation.artifactId);
        if (!artifact) {
          throw new Error(`Artifact ${recommendation.artifactId} not found`);
        }
        content = artifact.codeView || JSON.stringify(artifact, null, 2);
        sourcePath = artifact.filePath || `${recommendation.artifactType}s/${recommendation.artifactName}`;
      }

      if (!content) {
        throw new Error('Could not read artifact content');
      }

      onProgress?.('Preparing for system volume...');

      // Determine target path in system volume
      const fileName = sourcePath.split('/').pop() || recommendation.artifactName;
      const targetPath = `${recommendation.artifactType}s/${fileName}`;

      // Add promotion metadata to content
      const promotedContent = this.addPromotionMetadata(
        content,
        recommendation,
        recommendation.artifactType
      );

      onProgress?.('Writing to system volume...');

      // Write to system volume (local VFS first)
      this.vfs.writeFile(`system/${targetPath}`, promotedContent);

      onProgress?.('Committing to GitHub...');

      // Commit to GitHub if authenticated
      let commitHash: string | undefined;
      try {
        commitHash = await GitService.commitSkill(
          'system',
          targetPath,
          promotedContent,
          `Promote ${recommendation.artifactType}: ${recommendation.artifactName}\n\n` +
          `Source: ${recommendation.sourceVolume} volume\n` +
          `Reason: ${recommendation.reason}\n` +
          `Confidence: ${(recommendation.confidence * 100).toFixed(0)}%\n\n` +
          `Based on:\n${recommendation.basedOn.map(b => `- ${b}`).join('\n')}\n\n` +
          `Promoted with LLMos System Evolution`
        );
      } catch (error) {
        console.warn('GitHub commit failed (continuing with local promotion):', error);
      }

      onProgress?.('Promotion complete!');

      return {
        success: true,
        artifactId: recommendation.artifactId,
        artifactName: recommendation.artifactName,
        sourceVolume: recommendation.sourceVolume,
        targetVolume: 'system',
        newPath: `system/${targetPath}`,
        commitHash,
      };
    } catch (error: any) {
      return {
        success: false,
        artifactId: recommendation.artifactId,
        artifactName: recommendation.artifactName,
        sourceVolume: recommendation.sourceVolume,
        targetVolume: 'system',
        error: error.message || String(error),
      };
    }
  }

  /**
   * Add promotion metadata to artifact content
   */
  private addPromotionMetadata(
    content: string,
    recommendation: EvolutionRecommendation,
    artifactType: string
  ): string {
    const metadata = {
      promotedFrom: recommendation.sourceVolume,
      promotedAt: new Date().toISOString(),
      promotionReason: recommendation.reason,
      confidence: recommendation.confidence,
      basedOn: recommendation.basedOn,
    };

    // Handle different file formats
    if (content.startsWith('---')) {
      // YAML frontmatter - add to it
      const parts = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (parts) {
        return `---\n${parts[1]}\npromotion:\n  from: ${metadata.promotedFrom}\n  at: ${metadata.promotedAt}\n  reason: "${metadata.promotionReason}"\n  confidence: ${metadata.confidence}\n---\n${parts[2]}`;
      }
    } else if (content.startsWith('{')) {
      // JSON - add to object
      try {
        const obj = JSON.parse(content);
        obj._promotion = metadata;
        return JSON.stringify(obj, null, 2);
      } catch {
        // Not valid JSON, treat as code
      }
    }

    // Default: add as header comment
    const comment = artifactType === 'agent' || content.includes('def ') || content.includes('class ')
      ? `# Promoted from ${metadata.promotedFrom} volume at ${metadata.promotedAt}\n# Reason: ${metadata.promotionReason}\n# Confidence: ${(metadata.confidence * 100).toFixed(0)}%\n\n`
      : `<!-- Promoted from ${metadata.promotedFrom} volume at ${metadata.promotedAt} -->\n<!-- Reason: ${metadata.promotionReason} -->\n\n`;

    return comment + content;
  }

  /**
   * Evolve a system agent based on a variant from user/team volume
   */
  async evolveSystemAgent(
    systemAgentPath: string,
    variantRecommendation: EvolutionRecommendation,
    onProgress?: (step: string) => void
  ): Promise<PromotionResult> {
    try {
      onProgress?.('Reading system agent...');

      // Read both agents
      const systemContent = this.vfs.readFileContent(`system/${systemAgentPath}`);
      if (!systemContent) {
        throw new Error('System agent not found');
      }

      onProgress?.('Reading variant agent...');

      // Get variant content
      let variantContent: string | null = null;
      if (variantRecommendation.artifactId.startsWith('subagent:')) {
        const [, volume, ...pathParts] = variantRecommendation.artifactId.split(':');
        variantContent = this.vfs.readFileContent(`${volume}/${pathParts.join(':')}`);
      }

      if (!variantContent) {
        throw new Error('Variant agent not found');
      }

      onProgress?.('Merging improvements with LLM...');

      // Use LLM to merge the agents
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured');
      }

      const mergePrompt = `Merge these two agent definitions, keeping the best features of both.

## System Agent (base)
${systemContent}

## Variant Agent (improvements to incorporate)
${variantContent}

## Variant Success Evidence
${variantRecommendation.basedOn.join('\n')}

Create an improved version of the system agent that incorporates successful patterns from the variant.
Keep the system agent's structure and add/improve capabilities based on the variant.
Return ONLY the merged agent code/definition.`;

      const mergedContent = await llmClient.chatDirect([
        { role: 'user', content: mergePrompt }
      ]);

      // Clean up LLM response (remove markdown code blocks if present)
      let cleanedContent = mergedContent
        .replace(/```\w*\n?/g, '')
        .trim();

      // Add evolution metadata
      const evolutionHeader = `# Evolved at ${new Date().toISOString()}\n` +
        `# Merged with: ${variantRecommendation.artifactName} from ${variantRecommendation.sourceVolume}\n` +
        `# Reason: ${variantRecommendation.reason}\n\n`;

      const finalContent = evolutionHeader + cleanedContent;

      onProgress?.('Writing evolved agent...');

      // Write evolved agent
      this.vfs.writeFile(`system/${systemAgentPath}`, finalContent);

      onProgress?.('Committing to GitHub...');

      // Commit to GitHub
      let commitHash: string | undefined;
      try {
        commitHash = await GitService.commitSkill(
          'system',
          systemAgentPath,
          finalContent,
          `Evolve: ${systemAgentPath}\n\n` +
          `Merged with: ${variantRecommendation.artifactName}\n` +
          `Source: ${variantRecommendation.sourceVolume} volume\n\n` +
          `Evolved with LLMos System Evolution`
        );
      } catch (error) {
        console.warn('GitHub commit failed:', error);
      }

      onProgress?.('Evolution complete!');

      return {
        success: true,
        artifactId: variantRecommendation.artifactId,
        artifactName: variantRecommendation.artifactName,
        sourceVolume: variantRecommendation.sourceVolume,
        targetVolume: 'system',
        newPath: `system/${systemAgentPath}`,
        commitHash,
      };
    } catch (error: any) {
      return {
        success: false,
        artifactId: variantRecommendation.artifactId,
        artifactName: variantRecommendation.artifactName,
        sourceVolume: variantRecommendation.sourceVolume,
        targetVolume: 'system',
        error: error.message || String(error),
      };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let evolutionAnalyzer: SystemEvolutionAnalyzer | null = null;

export function getSystemEvolutionAnalyzer(): SystemEvolutionAnalyzer {
  if (!evolutionAnalyzer) {
    evolutionAnalyzer = new SystemEvolutionAnalyzer();
  }
  return evolutionAnalyzer;
}

/**
 * Run system evolution analysis (convenience function)
 */
export async function runSystemEvolution(
  onProgress?: (step: string, details?: string) => void
): Promise<SystemEvolutionResult> {
  const analyzer = getSystemEvolutionAnalyzer();
  return analyzer.analyze(onProgress);
}

/**
 * Promote an artifact based on recommendation
 */
export async function promoteArtifact(
  recommendation: EvolutionRecommendation,
  onProgress?: (step: string) => void
): Promise<PromotionResult> {
  const analyzer = getSystemEvolutionAnalyzer();
  return analyzer.promoteArtifact(recommendation, onProgress);
}
