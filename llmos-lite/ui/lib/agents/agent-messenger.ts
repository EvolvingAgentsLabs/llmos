/**
 * Enhanced Agent Messenger
 *
 * Provides a robust messaging system for inter-agent communication,
 * especially optimized for compiled agents running on non-Claude models.
 *
 * Key features:
 * - Structured message formats (JSON, XML, or Markdown based on model)
 * - Context window management with automatic summarization
 * - Message history with relevance filtering
 * - Task delegation with result tracking
 * - Broadcast capabilities for multi-agent coordination
 */

import {
  ExecutionStrategyConfig,
  getExecutionStrategyConfig,
  getModelCapabilities,
} from './model-capabilities';
import { CompiledAgent } from './agent-compiler';

// =============================================================================
// Message Types
// =============================================================================

export interface AgentMessage {
  id: string;
  timestamp: string;

  // Routing
  from: AgentIdentity;
  to: AgentIdentity | 'broadcast' | 'controller';

  // Message content
  type: MessageType;
  content: MessageContent;

  // Metadata
  priority: 'low' | 'normal' | 'high' | 'critical';
  replyTo?: string;  // ID of message this is responding to
  correlationId?: string;  // For tracking related messages
  ttl?: number;  // Time-to-live in milliseconds

  // Context management
  contextSummary?: string;  // Summary for context window optimization
  tokenEstimate?: number;   // Estimated tokens in this message
}

export interface AgentIdentity {
  id: string;
  name: string;
  type: 'controller' | 'subagent' | 'compiled' | 'markdown';
  model?: string;
}

export type MessageType =
  | 'task_request'      // Request to perform a task
  | 'task_response'     // Response with task results
  | 'delegation'        // Delegating a task to another agent
  | 'delegation_result' // Result from delegated task
  | 'status_update'     // Progress update
  | 'error'             // Error notification
  | 'query'             // Information request
  | 'query_response'    // Information response
  | 'broadcast'         // Broadcast to all agents
  | 'sync';             // Synchronization message

export interface MessageContent {
  // Main content
  text: string;

  // Structured data
  data?: Record<string, any>;

  // For task requests/responses
  task?: TaskInfo;

  // For errors
  error?: ErrorInfo;

  // Attachments (code, files, etc.)
  attachments?: Attachment[];
}

export interface TaskInfo {
  description: string;
  expectedOutput?: string;
  constraints?: string[];
  deadline?: string;
  dependencies?: string[];
}

export interface ErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface Attachment {
  type: 'code' | 'file' | 'data' | 'image';
  name: string;
  content: string;
  mimeType?: string;
}

// =============================================================================
// Context Manager
// =============================================================================

export interface ContextWindow {
  messages: AgentMessage[];
  totalTokens: number;
  maxTokens: number;
  summarized: boolean;
  summary?: string;
}

export class ContextManager {
  private maxTokens: number;
  private summaryThreshold: number;
  private tokenEstimator: (text: string) => number;

  constructor(config: {
    maxTokens: number;
    summaryThreshold: number;
    tokenEstimator?: (text: string) => number;
  }) {
    this.maxTokens = config.maxTokens;
    this.summaryThreshold = config.summaryThreshold;
    this.tokenEstimator = config.tokenEstimator || this.defaultTokenEstimator;
  }

  /**
   * Default token estimator (rough approximation)
   */
  private defaultTokenEstimator(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Create a new context window
   */
  createWindow(): ContextWindow {
    return {
      messages: [],
      totalTokens: 0,
      maxTokens: this.maxTokens,
      summarized: false,
    };
  }

  /**
   * Add message to context window with automatic management
   */
  addMessage(window: ContextWindow, message: AgentMessage): ContextWindow {
    const messageTokens = message.tokenEstimate
      || this.tokenEstimator(this.messageToText(message));

    const newWindow = { ...window };
    newWindow.messages = [...window.messages, { ...message, tokenEstimate: messageTokens }];
    newWindow.totalTokens = window.totalTokens + messageTokens;

    // Check if we need to summarize
    if (newWindow.totalTokens > this.summaryThreshold) {
      return this.summarizeWindow(newWindow);
    }

    return newWindow;
  }

  /**
   * Summarize older messages to free up context space
   */
  private summarizeWindow(window: ContextWindow): ContextWindow {
    if (window.messages.length < 4) {
      return window; // Not enough messages to summarize
    }

    // Keep the most recent messages, summarize older ones
    const keepCount = Math.max(3, Math.floor(window.messages.length * 0.3));
    const toSummarize = window.messages.slice(0, -keepCount);
    const toKeep = window.messages.slice(-keepCount);

    // Create summary of older messages
    const summary = this.createSummary(toSummarize);
    const summaryTokens = this.tokenEstimator(summary);

    // Calculate new token count
    const keptTokens = toKeep.reduce((sum, m) => sum + (m.tokenEstimate || 0), 0);

    return {
      messages: toKeep,
      totalTokens: summaryTokens + keptTokens,
      maxTokens: window.maxTokens,
      summarized: true,
      summary: window.summary ? `${window.summary}\n\n${summary}` : summary,
    };
  }

  /**
   * Create a text summary of messages
   */
  private createSummary(messages: AgentMessage[]): string {
    const parts: string[] = ['Previous conversation summary:'];

    for (const msg of messages) {
      const fromName = msg.from.name;
      const toName = typeof msg.to === 'string' ? msg.to : msg.to.name;
      const type = msg.type;

      let summary = `- ${fromName} → ${toName}: ${type}`;

      if (msg.content.task) {
        summary += ` - "${msg.content.task.description}"`;
      } else if (msg.content.text.length < 100) {
        summary += ` - "${msg.content.text}"`;
      }

      parts.push(summary);
    }

    return parts.join('\n');
  }

  /**
   * Convert message to text for token estimation
   */
  private messageToText(message: AgentMessage): string {
    const parts = [
      message.content.text,
      message.content.task?.description || '',
      message.content.error?.message || '',
    ];

    if (message.content.data) {
      parts.push(JSON.stringify(message.content.data));
    }

    if (message.content.attachments) {
      for (const att of message.content.attachments) {
        parts.push(att.content);
      }
    }

    return parts.join('\n');
  }

  /**
   * Get context for LLM call
   */
  getContextForLLM(window: ContextWindow): string {
    const parts: string[] = [];

    if (window.summary) {
      parts.push(window.summary);
      parts.push('---\nRecent messages:');
    }

    for (const msg of window.messages) {
      parts.push(this.formatMessageForLLM(msg));
    }

    return parts.join('\n\n');
  }

  /**
   * Format a single message for LLM context
   */
  private formatMessageForLLM(msg: AgentMessage): string {
    const fromName = msg.from.name;
    const toName = typeof msg.to === 'string' ? msg.to : msg.to.name;

    let formatted = `[${fromName} → ${toName}] (${msg.type}):\n${msg.content.text}`;

    if (msg.content.task) {
      formatted += `\nTask: ${msg.content.task.description}`;
    }

    if (msg.content.error) {
      formatted += `\nError: ${msg.content.error.message}`;
    }

    return formatted;
  }
}

// =============================================================================
// Message Formatter
// =============================================================================

export type MessageFormat = 'json' | 'xml' | 'markdown';

export class MessageFormatter {
  private messageFormat: MessageFormat;

  constructor(format: MessageFormat) {
    this.messageFormat = format;
  }

  /**
   * Format a message for transmission
   */
  formatMessage(message: AgentMessage): string {
    switch (this.messageFormat) {
      case 'json':
        return this.formatAsJSON(message);
      case 'xml':
        return this.formatAsXML(message);
      case 'markdown':
        return this.formatAsMarkdown(message);
      default:
        return this.formatAsJSON(message);
    }
  }

  /**
   * Parse a received message
   */
  parse(text: string): Partial<AgentMessage> | null {
    switch (this.messageFormat) {
      case 'json':
        return this.parseJSON(text);
      case 'xml':
        return this.parseXML(text);
      case 'markdown':
        return this.parseMarkdown(text);
      default:
        return this.parseJSON(text);
    }
  }

  private formatAsJSON(message: AgentMessage): string {
    return JSON.stringify({
      id: message.id,
      type: message.type,
      from: message.from.id,
      to: typeof message.to === 'string' ? message.to : message.to.id,
      content: message.content,
      priority: message.priority,
      replyTo: message.replyTo,
    }, null, 2);
  }

  private formatAsXML(message: AgentMessage): string {
    const toId = typeof message.to === 'string' ? message.to : message.to.id;

    return `<message id="${message.id}" type="${message.type}">
  <from>${message.from.id}</from>
  <to>${toId}</to>
  <priority>${message.priority}</priority>
  <content>
    <text>${this.escapeXML(message.content.text)}</text>
    ${message.content.task ? `<task>${this.escapeXML(message.content.task.description)}</task>` : ''}
    ${message.content.error ? `<error code="${message.content.error.code}">${this.escapeXML(message.content.error.message)}</error>` : ''}
  </content>
</message>`;
  }

  private formatAsMarkdown(message: AgentMessage): string {
    const fromName = message.from.name;
    const toName = typeof message.to === 'string' ? message.to : message.to.name;

    let md = `## Message: ${message.type}\n`;
    md += `**From:** ${fromName}\n`;
    md += `**To:** ${toName}\n`;
    md += `**Priority:** ${message.priority}\n\n`;
    md += message.content.text;

    if (message.content.task) {
      md += `\n\n### Task\n${message.content.task.description}`;
    }

    if (message.content.error) {
      md += `\n\n### Error (${message.content.error.code})\n${message.content.error.message}`;
    }

    return md;
  }

  private parseJSON(text: string): Partial<AgentMessage> | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch { }
    return null;
  }

  private parseXML(text: string): Partial<AgentMessage> | null {
    try {
      const idMatch = text.match(/id="([^"]+)"/);
      const typeMatch = text.match(/type="([^"]+)"/);
      const textMatch = text.match(/<text>([\s\S]*?)<\/text>/);

      if (typeMatch && textMatch) {
        return {
          id: idMatch?.[1],
          type: typeMatch[1] as MessageType,
          content: { text: this.unescapeXML(textMatch[1]) },
        };
      }
    } catch { }
    return null;
  }

  private parseMarkdown(text: string): Partial<AgentMessage> | null {
    try {
      const typeMatch = text.match(/## Message: (\w+)/);
      const contentStart = text.indexOf('\n\n');

      if (typeMatch && contentStart > -1) {
        return {
          type: typeMatch[1] as MessageType,
          content: { text: text.slice(contentStart + 2) },
        };
      }
    } catch { }
    return null;
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private unescapeXML(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
}

// =============================================================================
// Agent Messenger Hub
// =============================================================================

export interface MessengerConfig {
  modelId: string;
  maxContextTokens?: number;
  messageFormat?: MessageFormat;
}

export class AgentMessengerHub {
  private config: MessengerConfig;
  private strategyConfig: ExecutionStrategyConfig;
  private contextManager: ContextManager;
  private formatter: MessageFormatter;

  // Message storage
  private messages: Map<string, AgentMessage> = new Map();
  private agentContexts: Map<string, ContextWindow> = new Map();
  private pendingTasks: Map<string, PendingTask> = new Map();

  // Subscriptions
  private subscriptions: Map<string, MessageHandler[]> = new Map();

  constructor(config: MessengerConfig) {
    this.config = config;
    this.strategyConfig = getExecutionStrategyConfig(config.modelId);

    // Determine message format based on strategy
    const format: MessageFormat = config.messageFormat
      || (this.strategyConfig.subagentMessageFormat === 'json' ? 'json'
        : this.strategyConfig.subagentMessageFormat === 'xml' ? 'xml'
          : 'markdown');

    this.formatter = new MessageFormatter(format);

    this.contextManager = new ContextManager({
      maxTokens: config.maxContextTokens || this.strategyConfig.maxContextTokens,
      summaryThreshold: (config.maxContextTokens || this.strategyConfig.maxContextTokens) * 0.8,
    });
  }

  /**
   * Send a message between agents
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString(),
    };

    // Store message
    this.messages.set(fullMessage.id, fullMessage);

    // Update sender's context
    this.updateAgentContext(fullMessage.from.id, fullMessage);

    // Route message
    await this.routeMessage(fullMessage);

    return fullMessage.id;
  }

  /**
   * Send a task delegation request
   */
  async delegateTask(
    from: AgentIdentity,
    to: AgentIdentity,
    task: TaskInfo,
    timeout?: number
  ): Promise<DelegationResult> {
    const messageId = await this.sendMessage({
      from,
      to,
      type: 'delegation',
      content: {
        text: `Delegating task: ${task.description}`,
        task,
      },
      priority: 'high',
    });

    // Create pending task tracker
    const pendingTask: PendingTask = {
      messageId,
      from: from.id,
      to: to.id,
      task,
      startTime: Date.now(),
      timeout: timeout || 300000,
      status: 'pending',
    };

    this.pendingTasks.set(messageId, pendingTask);

    // Wait for result
    return new Promise((resolve, reject) => {
      const checkResult = () => {
        const pending = this.pendingTasks.get(messageId);
        if (!pending) {
          reject(new Error('Task not found'));
          return;
        }

        if (pending.status === 'completed') {
          resolve({
            success: true,
            result: pending.result,
            duration: Date.now() - pending.startTime,
          });
          this.pendingTasks.delete(messageId);
          return;
        }

        if (pending.status === 'failed') {
          resolve({
            success: false,
            error: pending.error,
            duration: Date.now() - pending.startTime,
          });
          this.pendingTasks.delete(messageId);
          return;
        }

        if (Date.now() - pending.startTime > pending.timeout) {
          pending.status = 'failed';
          pending.error = 'Timeout waiting for task completion';
          resolve({
            success: false,
            error: 'Timeout',
            duration: Date.now() - pending.startTime,
          });
          this.pendingTasks.delete(messageId);
          return;
        }

        // Check again
        setTimeout(checkResult, 100);
      };

      checkResult();
    });
  }

  /**
   * Complete a delegated task
   */
  completeDelegation(messageId: string, result: any): void {
    const pending = this.pendingTasks.get(messageId);
    if (pending) {
      pending.status = 'completed';
      pending.result = result;
    }
  }

  /**
   * Fail a delegated task
   */
  failDelegation(messageId: string, error: string): void {
    const pending = this.pendingTasks.get(messageId);
    if (pending) {
      pending.status = 'failed';
      pending.error = error;
    }
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(
    from: AgentIdentity,
    content: MessageContent,
    priority: AgentMessage['priority'] = 'normal'
  ): Promise<string> {
    return this.sendMessage({
      from,
      to: 'broadcast',
      type: 'broadcast',
      content,
      priority,
    });
  }

  /**
   * Subscribe to messages for an agent
   */
  subscribe(agentId: string, handler: MessageHandler): () => void {
    const handlers = this.subscriptions.get(agentId) || [];
    handlers.push(handler);
    this.subscriptions.set(agentId, handlers);

    return () => {
      const current = this.subscriptions.get(agentId) || [];
      this.subscriptions.set(agentId, current.filter(h => h !== handler));
    };
  }

  /**
   * Get context for an agent
   */
  getAgentContext(agentId: string): string {
    const window = this.agentContexts.get(agentId);
    if (!window) {
      return '';
    }
    return this.contextManager.getContextForLLM(window);
  }

  /**
   * Get formatted message for LLM consumption
   */
  formatMessageForLLM(message: AgentMessage): string {
    return this.formatter.formatMessage(message);
  }

  /**
   * Parse LLM response as a message
   */
  parseMessageFromLLM(text: string): Partial<AgentMessage> | null {
    return this.formatter.parse(text);
  }

  /**
   * Get message history for an agent
   */
  getMessageHistory(agentId: string, limit?: number): AgentMessage[] {
    const allMessages = Array.from(this.messages.values())
      .filter(m =>
        m.from.id === agentId ||
        (typeof m.to !== 'string' && m.to.id === agentId) ||
        m.to === 'broadcast'
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return limit ? allMessages.slice(-limit) : allMessages;
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messages.clear();
    this.agentContexts.clear();
    this.pendingTasks.clear();
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateAgentContext(agentId: string, message: AgentMessage): void {
    let window = this.agentContexts.get(agentId);
    if (!window) {
      window = this.contextManager.createWindow();
    }
    this.agentContexts.set(agentId, this.contextManager.addMessage(window, message));
  }

  private async routeMessage(message: AgentMessage): Promise<void> {
    if (message.to === 'broadcast') {
      // Notify all subscribers
      for (const [agentId, handlers] of this.subscriptions) {
        if (agentId !== message.from.id) {
          this.updateAgentContext(agentId, message);
          for (const handler of handlers) {
            try {
              await handler(message);
            } catch (e) {
              console.error(`Error in message handler for ${agentId}:`, e);
            }
          }
        }
      }
    } else {
      // Direct message
      const targetId = typeof message.to === 'string' ? message.to : message.to.id;
      const handlers = this.subscriptions.get(targetId) || [];

      this.updateAgentContext(targetId, message);

      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (e) {
          console.error(`Error in message handler for ${targetId}:`, e);
        }
      }
    }
  }
}

// =============================================================================
// Types for External Use
// =============================================================================

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

export interface PendingTask {
  messageId: string;
  from: string;
  to: string;
  task: TaskInfo;
  startTime: number;
  timeout: number;
  status: 'pending' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface DelegationResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a messenger hub for a specific model
 */
export function createMessengerHub(modelId: string): AgentMessengerHub {
  return new AgentMessengerHub({ modelId });
}

/**
 * Create agent identity
 */
export function createAgentIdentity(
  agent: CompiledAgent | { id: string; name: string; type?: string },
  agentType: AgentIdentity['type'] = 'subagent'
): AgentIdentity {
  return {
    id: agent.id,
    name: agent.name,
    type: agentType,
    model: 'model' in agent ? (agent as any).targetModel : undefined,
  };
}
