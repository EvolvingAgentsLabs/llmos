/**
 * Flow Predictor
 *
 * Predicts the flow of decisions and outcomes
 */

import {
  FlowPrediction,
  PredictedStep,
  ProposedSolution,
  CompletedDecision,
  DecisionBranch,
} from '@/lib/chat/types';
import { createLLMClient } from '@/lib/llm-client';

export interface FlowPredictorConfig {
  maxPredictions: number;
  minConfidence: number;
  lookbackDecisions: number;
  cacheResults: boolean;
}

export const DEFAULT_PREDICTOR_CONFIG: FlowPredictorConfig = {
  maxPredictions: 5,
  minConfidence: 0.3,
  lookbackDecisions: 10,
  cacheResults: true,
};

export class FlowPredictor {
  private config: FlowPredictorConfig;
  private cache: Map<string, FlowPrediction> = new Map();
  private llmClient: ReturnType<typeof createLLMClient> | null = null;

  constructor(config: Partial<FlowPredictorConfig> = {}) {
    this.config = { ...DEFAULT_PREDICTOR_CONFIG, ...config };
    this.llmClient = createLLMClient();
  }

  /**
   * Predict next steps for a solution
   */
  async predictNextSteps(
    solution: ProposedSolution,
    context: string,
    history?: CompletedDecision[]
  ): Promise<FlowPrediction> {
    // Check cache
    const cacheKey = `${solution.id}-${context.slice(0, 50)}`;
    if (this.config.cacheResults && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const prediction: FlowPrediction = {
      id: `pred-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      nodeId: solution.id,
      predictedPath: [],
      confidence: solution.confidence,
      computationStarted: false,
      timestamp: Date.now(),
    };

    try {
      if (this.llmClient) {
        const steps = await this.generatePredictionsWithLLM(solution, context, history);
        prediction.predictedPath = steps;
        prediction.confidence = this.calculateOverallConfidence(steps);
      } else {
        // Fallback to basic prediction
        prediction.predictedPath = this.generateBasicPrediction(solution);
      }
    } catch (error) {
      console.error('[FlowPredictor] Failed to generate predictions:', error);
      prediction.predictedPath = this.generateBasicPrediction(solution);
    }

    // Cache result
    if (this.config.cacheResults) {
      this.cache.set(cacheKey, prediction);
    }

    return prediction;
  }

  /**
   * Generate predictions using LLM
   */
  private async generatePredictionsWithLLM(
    solution: ProposedSolution,
    context: string,
    history?: CompletedDecision[]
  ): Promise<PredictedStep[]> {
    if (!this.llmClient) {
      throw new Error('LLM client not available');
    }

    const historyContext = history
      ? history
          .slice(-this.config.lookbackDecisions)
          .map((d) => `- ${d.question}: Selected "${d.selectedOption}"`)
          .join('\n')
      : 'No previous decisions';

    const prompt = `Based on the following solution, predict the most likely next steps in the workflow.

Solution: ${solution.content}

Context: ${context}

Previous decisions:
${historyContext}

Predict 3-5 likely next steps that would follow if this solution is implemented.
For each step, estimate a probability (0-1) of it occurring.

Respond in JSON format:
{
  "steps": [
    { "description": "Step 1 description", "probability": 0.9 },
    { "description": "Step 2 description", "probability": 0.8 }
  ]
}`;

    try {
      const response = await this.llmClient.chatDirect([
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return (data.steps || []).map((step: { description: string; probability: number }, index: number) => ({
          id: `step-${index}`,
          description: step.description,
          probability: Math.min(1, Math.max(0, step.probability)),
          dependencies: index > 0 ? [`step-${index - 1}`] : [],
          speculativelyComputed: false,
          status: 'predicted' as const,
        }));
      }
    } catch (error) {
      console.error('[FlowPredictor] LLM prediction failed:', error);
    }

    return this.generateBasicPrediction(solution);
  }

  /**
   * Generate basic prediction without LLM
   */
  private generateBasicPrediction(solution: ProposedSolution): PredictedStep[] {
    const baseConfidence = solution.confidence;

    // Generic steps based on solution type
    const steps: PredictedStep[] = [];

    if (solution.code) {
      steps.push({
        id: 'step-0',
        description: 'Implement code changes',
        probability: baseConfidence * 0.95,
        dependencies: [],
        speculativelyComputed: false,
        status: 'predicted',
      });
      steps.push({
        id: 'step-1',
        description: 'Run tests',
        probability: baseConfidence * 0.9,
        dependencies: ['step-0'],
        speculativelyComputed: false,
        status: 'predicted',
      });
      steps.push({
        id: 'step-2',
        description: 'Review and refine',
        probability: baseConfidence * 0.85,
        dependencies: ['step-1'],
        speculativelyComputed: false,
        status: 'predicted',
      });
    } else {
      steps.push({
        id: 'step-0',
        description: 'Analyze requirements',
        probability: baseConfidence * 0.9,
        dependencies: [],
        speculativelyComputed: false,
        status: 'predicted',
      });
      steps.push({
        id: 'step-1',
        description: 'Implement solution',
        probability: baseConfidence * 0.85,
        dependencies: ['step-0'],
        speculativelyComputed: false,
        status: 'predicted',
      });
      steps.push({
        id: 'step-2',
        description: 'Validate results',
        probability: baseConfidence * 0.8,
        dependencies: ['step-1'],
        speculativelyComputed: false,
        status: 'predicted',
      });
    }

    return steps;
  }

  /**
   * Calculate overall confidence from steps
   */
  private calculateOverallConfidence(steps: PredictedStep[]): number {
    if (steps.length === 0) return 0;
    return steps.reduce((sum, step) => sum + step.probability, 0) / steps.length;
  }

  /**
   * Predict winning solution from a set of options
   */
  async predictWinner(
    solutions: ProposedSolution[],
    context: string
  ): Promise<{
    winnerId: string;
    probability: number;
    reasoning: string;
  } | null> {
    if (solutions.length === 0) return null;
    if (solutions.length === 1) {
      return {
        winnerId: solutions[0].id,
        probability: solutions[0].confidence,
        reasoning: 'Only option available',
      };
    }

    // Sort by confidence
    const sorted = [...solutions].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0];
    const second = sorted[1];

    // Calculate probability based on confidence gap
    const confidenceGap = top.confidence - second.confidence;
    const baseProbability = 0.5 + confidenceGap * 0.5;

    return {
      winnerId: top.id,
      probability: Math.min(0.95, baseProbability),
      reasoning: `Highest confidence (${(top.confidence * 100).toFixed(0)}%) with ${(confidenceGap * 100).toFixed(0)}% lead`,
    };
  }

  /**
   * Analyze historical patterns to improve predictions
   */
  analyzePatterns(history: CompletedDecision[]): {
    avgDecisionTime: number;
    commonPatterns: string[];
    successRate: number;
  } {
    if (history.length === 0) {
      return { avgDecisionTime: 0, commonPatterns: [], successRate: 0 };
    }

    const avgDecisionTime =
      history.reduce((sum, d) => sum + (d.votingDuration || 0), 0) / history.length;

    // Find common patterns (simplified)
    const questionTypes = new Map<string, number>();
    history.forEach((d) => {
      const type = d.question.split(' ').slice(0, 2).join(' ').toLowerCase();
      questionTypes.set(type, (questionTypes.get(type) || 0) + 1);
    });

    const commonPatterns = Array.from(questionTypes.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `"${type}" (${count}x)`);

    return {
      avgDecisionTime,
      commonPatterns,
      successRate: 1, // Placeholder - would need outcome tracking
    };
  }

  /**
   * Clear prediction cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton factory
let instance: FlowPredictor | null = null;

export function getFlowPredictor(
  config?: Partial<FlowPredictorConfig>
): FlowPredictor {
  if (!instance) {
    instance = new FlowPredictor(config);
  }
  return instance;
}

export function resetFlowPredictor(): void {
  if (instance) {
    instance.clearCache();
  }
  instance = null;
}
