/**
 * Solution Proposer
 *
 * Generates solution proposals from multiple agents
 */

import {
  ProposedSolution,
  ImpactLevel,
  ChatParticipant,
  PredictedOutcome,
} from './types';
import { createLLMClient } from '@/lib/llm-client';

export interface ProposalGenerationOptions {
  maxProposals?: number;
  minConfidence?: number;
  includeCode?: boolean;
  timeout?: number;
}

const DEFAULT_OPTIONS: ProposalGenerationOptions = {
  maxProposals: 3,
  minConfidence: 0.5,
  includeCode: true,
  timeout: 30000,
};

export class SolutionProposer {
  private llmClient: ReturnType<typeof createLLMClient> | null = null;

  constructor() {
    this.llmClient = createLLMClient();
  }

  /**
   * Generate solution proposals for a given question/problem
   */
  async generateProposals(
    question: string,
    context: string,
    agents: ChatParticipant[],
    options: ProposalGenerationOptions = {}
  ): Promise<ProposedSolution[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const proposals: ProposedSolution[] = [];

    // Generate proposals from each agent (in parallel)
    const proposerAgents = agents.filter(
      (a) => a.type === 'agent' && a.role === 'proposer'
    );

    const proposalPromises = proposerAgents
      .slice(0, opts.maxProposals)
      .map((agent) => this.generateAgentProposal(question, context, agent, opts));

    const results = await Promise.allSettled(proposalPromises);

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.confidence >= (opts.minConfidence || 0)) {
          proposals.push(result.value);
        }
      }
    });

    // Sort by confidence
    proposals.sort((a, b) => b.confidence - a.confidence);

    return proposals;
  }

  /**
   * Generate a proposal from a specific agent
   */
  private async generateAgentProposal(
    question: string,
    context: string,
    agent: ChatParticipant,
    options: ProposalGenerationOptions
  ): Promise<ProposedSolution | null> {
    if (!this.llmClient) {
      console.warn('[SolutionProposer] LLM client not available');
      return this.createMockProposal(question, agent);
    }

    try {
      const systemPrompt = this.buildAgentSystemPrompt(agent);
      const userPrompt = this.buildProposalPrompt(question, context, options);

      const response = await this.llmClient.chatDirect([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      return this.parseProposalResponse(response, agent);
    } catch (error) {
      console.error(`[SolutionProposer] Failed to generate proposal from ${agent.name}:`, error);
      return null;
    }
  }

  /**
   * Build system prompt for agent
   */
  private buildAgentSystemPrompt(agent: ChatParticipant): string {
    const capabilities = agent.capabilities?.join(', ') || 'general assistance';

    return `You are ${agent.name}, an AI agent specializing in: ${capabilities}.

Your role is to propose solutions to problems. When proposing a solution:
1. Be specific and actionable
2. Provide clear reasoning
3. Estimate confidence level (0-100%)
4. Identify potential pros and cons
5. Include code if relevant

Respond in the following JSON format:
{
  "solution": "Your proposed solution description",
  "reasoning": "Why this is a good approach",
  "confidence": 85,
  "impact": "medium",
  "pros": ["Pro 1", "Pro 2"],
  "cons": ["Con 1"],
  "code": "Optional code snippet",
  "codeLanguage": "typescript",
  "predictedSuccess": 0.8,
  "estimatedDuration": "2-3 hours",
  "nextSteps": ["Step 1", "Step 2"]
}`;
  }

  /**
   * Build the proposal request prompt
   */
  private buildProposalPrompt(
    question: string,
    context: string,
    options: ProposalGenerationOptions
  ): string {
    let prompt = `# Problem/Question
${question}

# Context
${context}

Please propose a solution to address this. `;

    if (options.includeCode) {
      prompt += 'Include relevant code if applicable. ';
    }

    prompt += 'Respond with a JSON object as specified.';

    return prompt;
  }

  /**
   * Parse LLM response into a ProposedSolution
   */
  private parseProposalResponse(
    response: string,
    agent: ChatParticipant
  ): ProposedSolution | null {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback: create proposal from plain text
        return this.createProposalFromText(response, agent);
      }

      const data = JSON.parse(jsonMatch[0]);

      const proposal: ProposedSolution = {
        id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        proposerId: agent.id,
        proposerName: agent.name,
        proposerType: agent.type,
        content: data.solution || response,
        code: data.code,
        codeLanguage: data.codeLanguage,
        confidence: Math.min(1, (data.confidence || 70) / 100),
        reasoning: data.reasoning || '',
        estimatedImpact: this.parseImpact(data.impact),
        pros: data.pros || [],
        cons: data.cons || [],
        votes: [],
        status: 'pending',
        timestamp: Date.now(),
        predictedOutcome: data.predictedSuccess
          ? {
              successProbability: data.predictedSuccess,
              estimatedDuration: data.estimatedDuration,
              potentialIssues: data.cons || [],
              nextSteps: data.nextSteps || [],
            }
          : undefined,
      };

      return proposal;
    } catch (error) {
      console.error('[SolutionProposer] Failed to parse response:', error);
      return this.createProposalFromText(response, agent);
    }
  }

  /**
   * Create proposal from plain text response
   */
  private createProposalFromText(
    text: string,
    agent: ChatParticipant
  ): ProposedSolution {
    return {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      proposerId: agent.id,
      proposerName: agent.name,
      proposerType: agent.type,
      content: text,
      confidence: 0.7,
      reasoning: 'Generated from agent response',
      estimatedImpact: 'medium',
      votes: [],
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  /**
   * Create a mock proposal for testing/fallback
   */
  private createMockProposal(
    question: string,
    agent: ChatParticipant
  ): ProposedSolution {
    return {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      proposerId: agent.id,
      proposerName: agent.name,
      proposerType: agent.type,
      content: `Solution proposal from ${agent.name} for: ${question.slice(0, 100)}...`,
      confidence: 0.6 + Math.random() * 0.3,
      reasoning: 'Based on agent expertise and context analysis',
      estimatedImpact: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as ImpactLevel,
      votes: [],
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  /**
   * Parse impact level from string
   */
  private parseImpact(impact: string | undefined): ImpactLevel {
    if (!impact) return 'medium';
    const lower = impact.toLowerCase();
    if (lower.includes('high')) return 'high';
    if (lower.includes('low')) return 'low';
    return 'medium';
  }

  /**
   * Analyze and compare proposals
   */
  analyzeProposals(proposals: ProposedSolution[]): {
    bestConfidence: ProposedSolution | null;
    mostVoted: ProposedSolution | null;
    comparison: string;
  } {
    if (proposals.length === 0) {
      return { bestConfidence: null, mostVoted: null, comparison: 'No proposals available' };
    }

    // Find best by confidence
    const bestConfidence = proposals.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    // Find most voted
    const mostVoted = proposals.reduce((best, current) => {
      const currentScore = current.votes.reduce(
        (sum, v) => sum + (v.voteType === 'up' ? v.weight : v.voteType === 'down' ? -v.weight : 0),
        0
      );
      const bestScore = best.votes.reduce(
        (sum, v) => sum + (v.voteType === 'up' ? v.weight : v.voteType === 'down' ? -v.weight : 0),
        0
      );
      return currentScore > bestScore ? current : best;
    });

    // Generate comparison
    const comparison = this.generateComparison(proposals);

    return { bestConfidence, mostVoted, comparison };
  }

  /**
   * Generate a comparison summary of proposals
   */
  private generateComparison(proposals: ProposedSolution[]): string {
    if (proposals.length === 0) return 'No proposals to compare';
    if (proposals.length === 1) return `Single proposal from ${proposals[0].proposerName}`;

    const lines: string[] = ['Proposal Comparison:'];

    proposals.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.proposerName}: ${(p.confidence * 100).toFixed(0)}% confidence, ${p.estimatedImpact} impact`
      );
    });

    // Find consensus
    const avgConfidence =
      proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length;
    lines.push(`Average confidence: ${(avgConfidence * 100).toFixed(0)}%`);

    return lines.join('\n');
  }

  /**
   * Merge similar proposals
   */
  mergeSimilarProposals(
    proposals: ProposedSolution[],
    similarityThreshold: number = 0.7
  ): ProposedSolution[] {
    // Simple implementation: just return unique proposals
    // TODO: Implement semantic similarity checking
    const seen = new Set<string>();
    return proposals.filter((p) => {
      const key = p.content.slice(0, 100).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Predict the outcome of selecting a proposal
   */
  async predictOutcome(
    proposal: ProposedSolution,
    context: string
  ): Promise<PredictedOutcome> {
    // Default prediction based on proposal data
    const outcome: PredictedOutcome = {
      successProbability: proposal.confidence,
      estimatedDuration: '1-2 hours',
      potentialIssues: proposal.cons || [],
      nextSteps: [],
    };

    if (proposal.predictedOutcome) {
      return proposal.predictedOutcome;
    }

    // Try to enhance with LLM prediction
    if (this.llmClient) {
      try {
        const response = await this.llmClient.chatDirect([
          {
            role: 'system',
            content: `Analyze this proposed solution and predict the outcome. Respond with JSON:
{
  "successProbability": 0.8,
  "estimatedDuration": "2-3 hours",
  "potentialIssues": ["Issue 1"],
  "nextSteps": ["Step 1", "Step 2"]
}`,
          },
          {
            role: 'user',
            content: `Solution: ${proposal.content}\n\nContext: ${context}`,
          },
        ]);

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          return {
            successProbability: data.successProbability || outcome.successProbability,
            estimatedDuration: data.estimatedDuration || outcome.estimatedDuration,
            potentialIssues: data.potentialIssues || outcome.potentialIssues,
            nextSteps: data.nextSteps || outcome.nextSteps,
          };
        }
      } catch (error) {
        console.warn('[SolutionProposer] Failed to predict outcome:', error);
      }
    }

    return outcome;
  }
}
