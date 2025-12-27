/**
 * Latent Scratchpad - External Working Memory
 *
 * This implements the "Latent Scratchpad" concept from the idea storm.
 * Instead of using context window for "thinking", the agent externalizes
 * its state to a file-like structure.
 *
 * Benefits:
 * 1. Reduces context window usage (0 tokens for stored thoughts)
 * 2. Enables resumption of complex tasks across sessions
 * 3. Provides visibility into agent "thinking" for debugging
 * 4. Allows multi-step planning without context overflow
 */

import { getVolumeFileSystem, VolumeType } from '../volumes/file-operations';

export interface ThoughtEntry {
  id: string;
  timestamp: string;
  type: 'observation' | 'hypothesis' | 'plan' | 'action' | 'result' | 'reflection';
  content: string;
  confidence?: number;
  related?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScratchpadState {
  taskId: string;
  taskDescription: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  currentPhase: string;
  thoughts: ThoughtEntry[];
  workingMemory: Record<string, unknown>;
  actionHistory: ActionEntry[];
  startedAt: string;
  updatedAt: string;
}

export interface ActionEntry {
  id: string;
  timestamp: string;
  action: string;
  params?: Record<string, unknown>;
  result?: string;
  success: boolean;
  duration?: number;
}

/**
 * LatentScratchpad - Manages agent working memory
 */
export class LatentScratchpad {
  private state: ScratchpadState | null = null;
  private volume: VolumeType = 'user';
  private basePath = 'system/memory';
  private fs = getVolumeFileSystem();
  private listeners: Set<(state: ScratchpadState) => void> = new Set();

  /**
   * Start a new task with fresh scratchpad
   */
  async startTask(taskDescription: string): Promise<ScratchpadState> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    this.state = {
      taskId,
      taskDescription,
      status: 'active',
      currentPhase: 'initialization',
      thoughts: [],
      workingMemory: {},
      actionHistory: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add initial thought
    this.addThought('observation', `Starting task: ${taskDescription}`);

    await this.persist();
    return this.state;
  }

  /**
   * Resume an existing task from file
   */
  async resumeTask(taskId: string): Promise<ScratchpadState | null> {
    try {
      const content = await this.fs.readFile(
        this.volume,
        `${this.basePath}/${taskId}.json`
      );
      this.state = JSON.parse(content);
      this.state!.status = 'active';
      this.addThought('observation', 'Task resumed');
      await this.persist();
      return this.state;
    } catch {
      return null;
    }
  }

  /**
   * Add a thought to the scratchpad
   */
  addThought(
    type: ThoughtEntry['type'],
    content: string,
    options: Partial<Omit<ThoughtEntry, 'id' | 'timestamp' | 'type' | 'content'>> = {}
  ): ThoughtEntry {
    if (!this.state) {
      throw new Error('No active task. Call startTask first.');
    }

    const thought: ThoughtEntry = {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      type,
      content,
      ...options,
    };

    this.state.thoughts.push(thought);
    this.state.updatedAt = new Date().toISOString();
    this.notifyListeners();

    return thought;
  }

  /**
   * Record an action taken
   */
  recordAction(
    action: string,
    params?: Record<string, unknown>
  ): ActionEntry {
    if (!this.state) {
      throw new Error('No active task');
    }

    const entry: ActionEntry = {
      id: `action-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action,
      params,
      success: false, // Will be updated by completeAction
    };

    this.state.actionHistory.push(entry);
    this.state.updatedAt = new Date().toISOString();

    return entry;
  }

  /**
   * Complete an action with result
   */
  completeAction(actionId: string, result: string, success: boolean): void {
    if (!this.state) return;

    const action = this.state.actionHistory.find((a) => a.id === actionId);
    if (action) {
      action.result = result;
      action.success = success;
      action.duration = Date.now() - new Date(action.timestamp).getTime();
    }

    this.state.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Update working memory with key-value pairs
   */
  remember(key: string, value: unknown): void {
    if (!this.state) {
      throw new Error('No active task');
    }

    this.state.workingMemory[key] = value;
    this.state.updatedAt = new Date().toISOString();
  }

  /**
   * Recall a value from working memory
   */
  recall<T = unknown>(key: string): T | undefined {
    return this.state?.workingMemory[key] as T | undefined;
  }

  /**
   * Update the current phase
   */
  setPhase(phase: string): void {
    if (!this.state) return;

    this.state.currentPhase = phase;
    this.addThought('observation', `Entering phase: ${phase}`);
    this.state.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Get recent thoughts for context injection
   */
  getRecentThoughts(limit: number = 5): ThoughtEntry[] {
    if (!this.state) return [];
    return this.state.thoughts.slice(-limit);
  }

  /**
   * Get thoughts by type
   */
  getThoughtsByType(type: ThoughtEntry['type']): ThoughtEntry[] {
    if (!this.state) return [];
    return this.state.thoughts.filter((t) => t.type === type);
  }

  /**
   * Generate a context summary for LLM injection
   * This replaces verbose chat history with structured state
   */
  generateContextSummary(): string {
    if (!this.state) return '';

    const recentThoughts = this.getRecentThoughts(3);
    const recentActions = this.state.actionHistory.slice(-3);
    const workingMemoryKeys = Object.keys(this.state.workingMemory);

    return `## Current Task Context
**Task:** ${this.state.taskDescription}
**Phase:** ${this.state.currentPhase}
**Status:** ${this.state.status}

### Recent Observations
${recentThoughts.map((t) => `- [${t.type}] ${t.content}`).join('\n')}

### Recent Actions
${recentActions.map((a) => `- ${a.action}: ${a.success ? '✓' : '✗'} ${a.result || ''}`).join('\n')}

### Working Memory
${workingMemoryKeys.length > 0 ? workingMemoryKeys.map((k) => `- ${k}: ${JSON.stringify(this.state!.workingMemory[k])}`).join('\n') : '(empty)'}
`;
  }

  /**
   * Complete the task
   */
  async completeTask(success: boolean, summary?: string): Promise<void> {
    if (!this.state) return;

    this.state.status = success ? 'completed' : 'failed';
    this.addThought('reflection', summary || `Task ${success ? 'completed' : 'failed'}`);
    this.state.updatedAt = new Date().toISOString();

    await this.persist();
    this.notifyListeners();
  }

  /**
   * Pause the task for later resumption
   */
  async pauseTask(): Promise<void> {
    if (!this.state) return;

    this.state.status = 'paused';
    this.addThought('observation', 'Task paused');
    this.state.updatedAt = new Date().toISOString();

    await this.persist();
    this.notifyListeners();
  }

  /**
   * Persist current state to file
   */
  async persist(): Promise<void> {
    if (!this.state) return;

    try {
      const content = JSON.stringify(this.state, null, 2);
      await this.fs.writeFile(
        this.volume,
        `${this.basePath}/${this.state.taskId}.json`,
        content
      );
    } catch (error) {
      console.error('Failed to persist scratchpad:', error);
    }
  }

  /**
   * Get current state
   */
  getState(): ScratchpadState | null {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: ScratchpadState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    if (!this.state) return;
    this.listeners.forEach((cb) => cb(this.state!));
  }

  /**
   * Clear the current task (for testing)
   */
  clear(): void {
    this.state = null;
  }
}

// Singleton instance
let scratchpadInstance: LatentScratchpad | null = null;

export function getScratchpad(): LatentScratchpad {
  if (!scratchpadInstance) {
    scratchpadInstance = new LatentScratchpad();
  }
  return scratchpadInstance;
}

/**
 * React hook for using the scratchpad
 */
export function useScratchpad() {
  return getScratchpad();
}

export default LatentScratchpad;
