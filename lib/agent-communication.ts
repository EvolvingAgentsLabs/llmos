/**
 * Agent Communication Protocol
 *
 * Enables agents to communicate with each other, delegate tasks,
 * and collaborate on complex problems
 */

import { AgentExecutor, Agent, AgentMessage, AgentExecutionResult } from './agent-executor';
import { LLMClient } from './llm-client';
import { ToolContext } from './tool-executor';

export interface AgentCommunication {
  id: string;
  from: string; // Agent ID
  to: string; // Agent ID or 'broadcast'
  type: 'request' | 'response' | 'notify' | 'delegate';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface DelegationRequest {
  taskDescription: string;
  context?: Record<string, any>;
  expectedOutput?: string;
  timeout?: number;
}

export interface AgentRegistry {
  agents: Map<string, AgentExecutor>;
  communications: AgentCommunication[];
}

/**
 * Agent Communication Hub
 *
 * Central coordinator for inter-agent communication
 */
export class AgentCommunicationHub {
  private registry: AgentRegistry = {
    agents: new Map(),
    communications: [],
  };

  private messageHandlers: Map<string, (msg: AgentCommunication) => void> = new Map();

  /**
   * Register an agent in the hub
   */
  registerAgent(agentId: string, executor: AgentExecutor): void {
    this.registry.agents.set(agentId, executor);
    console.log(`✓ Agent registered: ${agentId}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.registry.agents.delete(agentId);
    this.messageHandlers.delete(agentId);
    console.log(`✓ Agent unregistered: ${agentId}`);
  }

  /**
   * Send message from one agent to another
   */
  async sendMessage(message: Omit<AgentCommunication, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: AgentCommunication = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString(),
    };

    this.registry.communications.push(fullMessage);

    // Route message
    if (message.to === 'broadcast') {
      // Broadcast to all agents except sender
      for (const [agentId, _] of this.registry.agents) {
        if (agentId !== message.from) {
          this.deliverMessage(agentId, fullMessage);
        }
      }
    } else {
      // Direct message
      this.deliverMessage(message.to, fullMessage);
    }

    return fullMessage.id;
  }

  /**
   * Delegate task from one agent to another
   */
  async delegateTask(
    fromAgent: string,
    toAgent: string,
    request: DelegationRequest
  ): Promise<AgentExecutionResult> {
    const targetExecutor = this.registry.agents.get(toAgent);
    if (!targetExecutor) {
      throw new Error(`Target agent not found: ${toAgent}`);
    }

    // Send delegation request message
    await this.sendMessage({
      from: fromAgent,
      to: toAgent,
      type: 'delegate',
      content: `Delegated task: ${request.taskDescription}`,
      metadata: { request },
    });

    // Execute task on target agent
    try {
      const result = await targetExecutor.execute(
        request.taskDescription,
        request.context
      );

      // Send response back
      await this.sendMessage({
        from: toAgent,
        to: fromAgent,
        type: 'response',
        content: result.output || 'Task completed',
        metadata: { result },
      });

      return result;
    } catch (error: any) {
      // Send error response
      await this.sendMessage({
        from: toAgent,
        to: fromAgent,
        type: 'response',
        content: `Task failed: ${error.message}`,
        metadata: { error: error.message },
      });

      throw error;
    }
  }

  /**
   * Get communication history for an agent
   */
  getHistory(agentId: string): AgentCommunication[] {
    return this.registry.communications.filter(
      msg => msg.from === agentId || msg.to === agentId || msg.to === 'broadcast'
    );
  }

  /**
   * Get all registered agents
   */
  listAgents(): string[] {
    return Array.from(this.registry.agents.keys());
  }

  /**
   * Clear communication history
   */
  clearHistory(): void {
    this.registry.communications = [];
  }

  /**
   * Subscribe to messages for an agent
   */
  subscribe(agentId: string, handler: (msg: AgentCommunication) => void): () => void {
    this.messageHandlers.set(agentId, handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(agentId);
    };
  }

  private deliverMessage(toAgent: string, message: AgentCommunication): void {
    const handler = this.messageHandlers.get(toAgent);
    if (handler) {
      try {
        handler(message);
      } catch (error) {
        console.error(`Error delivering message to ${toAgent}:`, error);
      }
    }
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Global communication hub instance
 */
let hubInstance: AgentCommunicationHub | null = null;

export function getAgentHub(): AgentCommunicationHub {
  if (!hubInstance) {
    hubInstance = new AgentCommunicationHub();
  }
  return hubInstance;
}

/**
 * Multi-Agent System
 *
 * Orchestrates multiple agents working together
 */
export class MultiAgentSystem {
  private hub: AgentCommunicationHub;
  private agents: Map<string, AgentExecutor> = new Map();

  constructor(hub?: AgentCommunicationHub) {
    this.hub = hub || getAgentHub();
  }

  /**
   * Add agent to the system
   */
  addAgent(agentId: string, executor: AgentExecutor): void {
    this.agents.set(agentId, executor);
    this.hub.registerAgent(agentId, executor);
  }

  /**
   * Remove agent from the system
   */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.hub.unregisterAgent(agentId);
  }

  /**
   * Execute task with agent collaboration
   */
  async executeCollaborative(
    leadAgentId: string,
    task: string,
    options: {
      allowDelegation?: boolean;
      maxAgents?: number;
    } = {}
  ): Promise<{
    result: AgentExecutionResult;
    communications: AgentCommunication[];
  }> {
    const leadAgent = this.agents.get(leadAgentId);
    if (!leadAgent) {
      throw new Error(`Lead agent not found: ${leadAgentId}`);
    }

    const startTime = Date.now();

    // Execute lead agent
    const result = await leadAgent.execute(task);

    // Get communication history
    const communications = this.hub.getHistory(leadAgentId);

    return {
      result,
      communications,
    };
  }

  /**
   * Broadcast message to all agents
   */
  async broadcast(fromAgent: string, message: string, metadata?: Record<string, any>): Promise<void> {
    await this.hub.sendMessage({
      from: fromAgent,
      to: 'broadcast',
      type: 'notify',
      content: message,
      metadata,
    });
  }

  /**
   * Get system status
   */
  getStatus(): {
    agentCount: number;
    agents: string[];
    messageCount: number;
  } {
    return {
      agentCount: this.agents.size,
      agents: Array.from(this.agents.keys()),
      messageCount: this.hub.getHistory('').length,
    };
  }
}

/**
 * Enhanced Agent Executor with communication capabilities
 */
export class CommunicatingAgent extends AgentExecutor {
  private hub: AgentCommunicationHub;
  private agentId: string;

  constructor(
    agent: Agent,
    llmClient: LLMClient,
    toolContext: ToolContext,
    hub?: AgentCommunicationHub
  ) {
    super(agent, llmClient, toolContext);
    this.hub = hub || getAgentHub();
    this.agentId = agent.id;
    this.hub.registerAgent(this.agentId, this);
  }

  /**
   * Send message to another agent
   */
  async sendMessage(to: string, content: string, type: AgentCommunication['type'] = 'notify'): Promise<string> {
    return this.hub.sendMessage({
      from: this.agentId,
      to,
      type,
      content,
    });
  }

  /**
   * Delegate task to another agent
   */
  async delegateTask(toAgent: string, request: DelegationRequest): Promise<AgentExecutionResult> {
    return this.hub.delegateTask(this.agentId, toAgent, request);
  }

  /**
   * Broadcast message to all agents
   */
  async broadcast(content: string): Promise<string> {
    return this.hub.sendMessage({
      from: this.agentId,
      to: 'broadcast',
      type: 'notify',
      content,
    });
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: (msg: AgentCommunication) => void): () => void {
    return this.hub.subscribe(this.agentId, handler);
  }

  /**
   * Dispose agent and unregister from hub
   */
  dispose(): void {
    this.hub.unregisterAgent(this.agentId);
  }
}
