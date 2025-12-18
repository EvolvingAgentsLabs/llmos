/**
 * Semantic Search via Client-Side LLM Analysis
 *
 * Uses iterative batch LLM analysis running in the browser to find relevant
 * skills, tools, and agents. No server calls, no embeddings - pure LLM reasoning.
 */

import { createLLMClient } from './llm-client';

export interface SearchResult {
  id: string;
  type: 'skill' | 'tool' | 'agent';
  name: string;
  description: string;
  content: string;
  score: number;
  relevanceReason: string;
  metadata: Record<string, any>;
}

export interface SearchDocument {
  id: string;
  text: string;
  metadata: Record<string, any>;
}

/**
 * Semantic Search Client using LLM Analysis
 */
export class SemanticSearchClient {
  private documents: Map<string, SearchDocument> = new Map();
  private batchSize: number = 10; // Process 10 items per LLM call

  constructor() {}

  /**
   * Index a document
   */
  async index(doc: SearchDocument): Promise<void> {
    this.documents.set(doc.id, doc);
  }

  /**
   * Index multiple documents
   */
  async indexBatch(docs: SearchDocument[]): Promise<void> {
    docs.forEach(doc => this.documents.set(doc.id, doc));
  }

  /**
   * Search for relevant documents using LLM analysis
   */
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const llm = createLLMClient();
    if (!llm) {
      throw new Error('LLM client not configured');
    }

    const allDocs = Array.from(this.documents.values());
    const results: SearchResult[] = [];

    // Process documents in batches
    for (let i = 0; i < allDocs.length; i += this.batchSize) {
      const batch = allDocs.slice(i, i + this.batchSize);

      // Ask LLM to analyze relevance
      const batchResults = await this.analyzeBatch(llm, query, batch);
      results.push(...batchResults);

      // If we have enough high-quality results, stop early
      if (results.filter(r => r.score >= 0.7).length >= limit) {
        break;
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Analyze a batch of documents for relevance
   */
  private async analyzeBatch(
    llm: any,
    query: string,
    docs: SearchDocument[]
  ): Promise<SearchResult[]> {
    // Create analysis prompt
    const prompt = this.createAnalysisPrompt(query, docs);

    try {
      // Call LLM directly from browser
      const response = await llm.chatDirect([
        {
          role: 'user' as const,
          content: prompt,
        },
      ]);

      // Parse LLM response
      return this.parseAnalysisResponse(response, docs);
    } catch (error) {
      console.error('[SemanticSearch] Batch analysis failed:', error);
      return [];
    }
  }

  /**
   * Create analysis prompt for LLM
   */
  private createAnalysisPrompt(query: string, docs: SearchDocument[]): string {
    return `You are analyzing ${docs.length} items to find the most relevant matches for a search query.

Search Query: "${query}"

Items to analyze:
${docs.map((doc, i) => `
${i + 1}. ID: ${doc.id}
   Name: ${doc.metadata.name}
   Type: ${doc.metadata.type}
   Description: ${doc.metadata.description}
   Content Preview: ${doc.text.substring(0, 200)}...
`).join('\n')}

For each item, determine:
1. Relevance score (0.0 to 1.0, where 1.0 is perfect match)
2. Brief reason for the score

Respond ONLY with valid JSON in this exact format:
{
  "results": [
    {
      "id": "item-id",
      "score": 0.95,
      "reason": "Directly addresses query about X"
    }
  ]
}

Only include items with score >= 0.3. Be concise but accurate.`;
  }

  /**
   * Parse LLM analysis response
   */
  private parseAnalysisResponse(
    response: string,
    docs: SearchDocument[]
  ): SearchResult[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonText = response.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }

      const parsed = JSON.parse(jsonText);
      const results: SearchResult[] = [];

      for (const item of parsed.results || []) {
        const doc = docs.find(d => d.id === item.id);
        if (doc && item.score >= 0.3) {
          results.push({
            id: doc.id,
            type: doc.metadata.type || 'skill',
            name: doc.metadata.name || doc.id,
            description: doc.metadata.description || '',
            content: doc.text,
            score: item.score,
            relevanceReason: item.reason || 'Relevant to query',
            metadata: doc.metadata,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[SemanticSearch] Failed to parse LLM response:', error);
      return [];
    }
  }

  /**
   * Delete document from index
   */
  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  /**
   * Clear all documents
   */
  async clear(): Promise<void> {
    this.documents.clear();
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      documentCount: this.documents.size,
      batchSize: this.batchSize,
      method: 'LLM-based semantic analysis',
    };
  }
}

/**
 * Global semantic search instance
 */
let globalSearchClient: SemanticSearchClient | null = null;

/**
 * Get or create semantic search client
 */
export function getSemanticSearchClient(): SemanticSearchClient {
  if (!globalSearchClient) {
    globalSearchClient = new SemanticSearchClient();
  }
  return globalSearchClient;
}

/**
 * Index skills, tools, and agents from volume
 */
export async function indexVolumeArtifacts(
  skills: any[],
  tools: any[],
  agents: any[]
): Promise<void> {
  const client = getSemanticSearchClient();

  const documents: SearchDocument[] = [];

  // Index skills
  for (const skill of skills) {
    documents.push({
      id: `skill:${skill.id}`,
      text: `${skill.name}\n${skill.description}\n${skill.content}`,
      metadata: {
        type: 'skill',
        name: skill.name,
        description: skill.description,
        category: skill.category,
        version: skill.version,
      },
    });
  }

  // Index tools
  for (const tool of tools) {
    documents.push({
      id: `tool:${tool.id}`,
      text: `${tool.name}\n${tool.description}\n${tool.content}`,
      metadata: {
        type: 'tool',
        name: tool.name,
        description: tool.description,
        runtime: tool.runtime,
      },
    });
  }

  // Index agents
  for (const agent of agents) {
    documents.push({
      id: `agent:${agent.id}`,
      text: `${agent.name}\n${agent.description}\n${agent.content}`,
      metadata: {
        type: 'agent',
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities,
      },
    });
  }

  await client.indexBatch(documents);

  console.log(`[SemanticSearch] Indexed ${documents.length} artifacts`);
}

/**
 * Search skills by semantic similarity
 */
export async function searchSkills(query: string, limit: number = 5): Promise<SearchResult[]> {
  const client = getSemanticSearchClient();
  const results = await client.search(query, limit * 2); // Get more results to filter
  return results.filter(r => r.type === 'skill').slice(0, limit);
}

/**
 * Search tools by semantic similarity
 */
export async function searchTools(query: string, limit: number = 5): Promise<SearchResult[]> {
  const client = getSemanticSearchClient();
  const results = await client.search(query, limit * 2); // Get more results to filter
  return results.filter(r => r.type === 'tool').slice(0, limit);
}

/**
 * Search agents by semantic similarity
 */
export async function searchAgents(query: string, limit: number = 5): Promise<SearchResult[]> {
  const client = getSemanticSearchClient();
  const results = await client.search(query, limit * 2); // Get more results to filter
  return results.filter(r => r.type === 'agent').slice(0, limit);
}

/**
 * Search all artifacts
 */
export async function searchAll(query: string, limit: number = 10): Promise<SearchResult[]> {
  const client = getSemanticSearchClient();
  return client.search(query, limit);
}

/**
 * Get search statistics
 */
export function getSearchStats() {
  const client = getSemanticSearchClient();
  return client.getStats();
}
