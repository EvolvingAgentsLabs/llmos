/**
 * Quantum Circuit Artifact System
 *
 * Manages quantum circuits as system artifacts that can be:
 * - Created from natural language
 * - Persisted to /volumes/artifacts/quantum-circuits/
 * - Improved by system cron jobs
 * - Versioned and tracked
 */

import { Node, Edge } from 'reactflow';
import { ParsedSkill } from './skill-parser';

export interface QuantumCircuitArtifact {
  id: string;
  type: 'quantum-circuit';
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  version: number;
  author: 'user' | 'system-cron' | 'ai';

  // Circuit data
  circuit: {
    nodes: Node[];
    edges: Edge[];
    skills: ParsedSkill[];
  };

  // NLP source
  nlp_input?: string;

  // Execution history
  executions: Array<{
    timestamp: string;
    status: 'success' | 'error';
    duration_ms: number;
    results?: any;
    error?: string;
  }>;

  // System improvements
  improvements: Array<{
    timestamp: string;
    version: number;
    description: string;
    changes: string;
    improved_by: 'system-cron' | 'user';
  }>;

  // Metadata
  tags: string[];
  category: 'medical' | 'optimization' | 'simulation' | 'general';
  complexity: 'low' | 'medium' | 'high';
  estimated_time_ms: number;
}

/**
 * Create a new quantum circuit artifact
 */
export function createQuantumCircuitArtifact(
  name: string,
  description: string,
  circuit: { nodes: Node[]; edges: Edge[]; skills: ParsedSkill[] },
  nlpInput?: string
): QuantumCircuitArtifact {
  const now = new Date().toISOString();

  return {
    id: `qc-${Date.now()}`,
    type: 'quantum-circuit',
    name,
    description,
    created_at: now,
    updated_at: now,
    version: 1,
    author: 'user',
    circuit,
    nlp_input: nlpInput,
    executions: [],
    improvements: [],
    tags: extractTags(nlpInput || description),
    category: determineCategory(nlpInput || description),
    complexity: estimateComplexity(circuit.nodes.length),
    estimated_time_ms: circuit.nodes.length * 500, // Rough estimate
  };
}

/**
 * Save artifact to filesystem (via API)
 */
export async function saveQuantumCircuitArtifact(
  artifact: QuantumCircuitArtifact,
  volume: 'system' | 'team' | 'user' = 'user'
): Promise<void> {
  try {
    const response = await fetch('/api/artifacts/quantum-circuits/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        volume,
        artifact,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save artifact: ${response.statusText}`);
    }

    console.log(`Saved quantum circuit artifact: ${artifact.id}`);
  } catch (error) {
    console.error('Error saving quantum circuit artifact:', error);
    throw error;
  }
}

/**
 * Load artifact from filesystem (via API)
 */
export async function loadQuantumCircuitArtifact(
  id: string,
  volume: 'system' | 'team' | 'user' = 'user'
): Promise<QuantumCircuitArtifact | null> {
  try {
    const response = await fetch(`/api/artifacts/quantum-circuits/${volume}/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to load artifact: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error loading quantum circuit artifact:', error);
    return null;
  }
}

/**
 * List all quantum circuit artifacts
 */
export async function listQuantumCircuitArtifacts(
  volume: 'system' | 'team' | 'user' = 'user'
): Promise<QuantumCircuitArtifact[]> {
  try {
    const response = await fetch(`/api/artifacts/quantum-circuits/${volume}`);

    if (!response.ok) {
      throw new Error(`Failed to list artifacts: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing quantum circuit artifacts:', error);
    return [];
  }
}

/**
 * Record execution of a circuit
 */
export function recordExecution(
  artifact: QuantumCircuitArtifact,
  status: 'success' | 'error',
  duration_ms: number,
  results?: any,
  error?: string
): QuantumCircuitArtifact {
  return {
    ...artifact,
    executions: [
      ...artifact.executions,
      {
        timestamp: new Date().toISOString(),
        status,
        duration_ms,
        results,
        error,
      },
    ],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Record system improvement
 */
export function recordImprovement(
  artifact: QuantumCircuitArtifact,
  description: string,
  changes: string,
  improved_by: 'system-cron' | 'user' = 'user'
): QuantumCircuitArtifact {
  const newVersion = artifact.version + 1;

  return {
    ...artifact,
    version: newVersion,
    improvements: [
      ...artifact.improvements,
      {
        timestamp: new Date().toISOString(),
        version: newVersion,
        description,
        changes,
        improved_by,
      },
    ],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Extract tags from text
 */
function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();

  if (lowerText.includes('quantum') || lowerText.includes('qft')) tags.push('quantum');
  if (lowerText.includes('cardiac') || lowerText.includes('medical')) tags.push('medical');
  if (lowerText.includes('echo')) tags.push('echo-detection');
  if (lowerText.includes('cepstrum')) tags.push('cepstrum');
  if (lowerText.includes('vqe') || lowerText.includes('optimization')) tags.push('optimization');
  if (lowerText.includes('fourier')) tags.push('fourier-transform');

  return tags;
}

/**
 * Determine category from text
 */
function determineCategory(text: string): 'medical' | 'optimization' | 'simulation' | 'general' {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('cardiac') || lowerText.includes('medical') || lowerText.includes('health')) {
    return 'medical';
  }
  if (lowerText.includes('vqe') || lowerText.includes('optimization') || lowerText.includes('minimize')) {
    return 'optimization';
  }
  if (lowerText.includes('simulate') || lowerText.includes('simulation')) {
    return 'simulation';
  }

  return 'general';
}

/**
 * Estimate complexity based on node count
 */
function estimateComplexity(nodeCount: number): 'low' | 'medium' | 'high' {
  if (nodeCount <= 3) return 'low';
  if (nodeCount <= 6) return 'medium';
  return 'high';
}

/**
 * Export artifact as JSON
 */
export function exportQuantumCircuitArtifact(artifact: QuantumCircuitArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

/**
 * Import artifact from JSON
 */
export function importQuantumCircuitArtifact(json: string): QuantumCircuitArtifact {
  return JSON.parse(json);
}
