/**
 * Participant Manager
 *
 * Manages participants in multi-agent chat sessions
 */

import {
  ChatParticipant,
  ParticipantType,
  ParticipantRole,
  ParticipationBubble,
  BubbleParticipant,
  ParticipantRelationship,
  RelationshipType,
  ChatEvent,
  ChatEventHandler,
} from './types';

export class ParticipantManager {
  private participants: Map<string, ChatParticipant> = new Map();
  private bubbles: Map<string, ParticipationBubble> = new Map();
  private relationships: Map<string, ParticipantRelationship> = new Map();
  private interactionCounts: Map<string, number> = new Map();
  private eventHandlers: Set<ChatEventHandler> = new Set();

  constructor() {
    // Initialize with system participant
    this.addParticipant({
      id: 'system',
      type: 'agent',
      name: 'System',
      role: 'moderator',
      online: true,
      capabilities: ['moderate', 'summarize', 'coordinate'],
    });
  }

  /**
   * Subscribe to participant events
   */
  onEvent(handler: ChatEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ChatEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  // ============================================================================
  // Participant Management
  // ============================================================================

  /**
   * Add a new participant
   */
  addParticipant(participant: Omit<ChatParticipant, 'online'> & { online?: boolean }): ChatParticipant {
    const fullParticipant: ChatParticipant = {
      ...participant,
      online: participant.online ?? true,
    };

    this.participants.set(participant.id, fullParticipant);

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'participant_joined',
      timestamp: Date.now(),
      actor: participant.id,
      data: { participant: fullParticipant },
    });

    return fullParticipant;
  }

  /**
   * Remove a participant
   */
  removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      this.participants.delete(participantId);
      this.emit({
        id: `evt-${Date.now()}`,
        type: 'participant_left',
        timestamp: Date.now(),
        actor: participantId,
        data: { participantId },
      });
    }
  }

  /**
   * Update participant status
   */
  updateParticipant(participantId: string, updates: Partial<ChatParticipant>): void {
    const participant = this.participants.get(participantId);
    if (participant) {
      Object.assign(participant, updates);
    }
  }

  /**
   * Set participant online status
   */
  setOnlineStatus(participantId: string, online: boolean): void {
    this.updateParticipant(participantId, { online });
  }

  /**
   * Get a participant by ID
   */
  getParticipant(participantId: string): ChatParticipant | undefined {
    return this.participants.get(participantId);
  }

  /**
   * Get all participants
   */
  getAllParticipants(): ChatParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get participants by type
   */
  getParticipantsByType(type: ParticipantType): ChatParticipant[] {
    return Array.from(this.participants.values()).filter((p) => p.type === type);
  }

  /**
   * Get participants by role
   */
  getParticipantsByRole(role: ParticipantRole): ChatParticipant[] {
    return Array.from(this.participants.values()).filter((p) => p.role === role);
  }

  /**
   * Get online participants
   */
  getOnlineParticipants(): ChatParticipant[] {
    return Array.from(this.participants.values()).filter((p) => p.online);
  }

  /**
   * Create agent participant from agent definition
   */
  createAgentParticipant(
    agentId: string,
    name: string,
    capabilities: string[] = [],
    role: ParticipantRole = 'proposer'
  ): ChatParticipant {
    return this.addParticipant({
      id: `agent-${agentId}`,
      type: 'agent',
      name,
      role,
      capabilities,
      metadata: { agentId },
    });
  }

  /**
   * Create user participant
   */
  createUserParticipant(
    userId: string,
    name: string,
    role: ParticipantRole = 'voter'
  ): ChatParticipant {
    return this.addParticipant({
      id: `user-${userId}`,
      type: 'user',
      name,
      role,
    });
  }

  // ============================================================================
  // Participation Bubbles
  // ============================================================================

  /**
   * Create a new participation bubble for a topic
   */
  createBubble(topicId: string, topic: string, description?: string): ParticipationBubble {
    const bubbleId = `bubble-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const bubble: ParticipationBubble = {
      id: bubbleId,
      topicId,
      topic,
      description,
      participants: [],
      relationships: [],
      createdAt: now,
      lastActivity: now,
      messageCount: 0,
      decisionCount: 0,
    };

    this.bubbles.set(bubbleId, bubble);
    return bubble;
  }

  /**
   * Add a participant to a bubble
   */
  addToBubble(
    bubbleId: string,
    participantId: string,
    role: 'owner' | 'contributor' | 'observer' = 'contributor'
  ): BubbleParticipant | null {
    const bubble = this.bubbles.get(bubbleId);
    const participant = this.participants.get(participantId);

    if (!bubble || !participant) return null;

    // Check if already in bubble
    const existing = bubble.participants.find((p) => p.participantId === participantId);
    if (existing) return existing;

    const bubbleParticipant: BubbleParticipant = {
      id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      participantId,
      type: participant.type,
      name: participant.name,
      role,
      online: participant.online,
      contributions: 0,
      lastContribution: Date.now(),
    };

    bubble.participants.push(bubbleParticipant);
    return bubbleParticipant;
  }

  /**
   * Remove a participant from a bubble
   */
  removeFromBubble(bubbleId: string, participantId: string): void {
    const bubble = this.bubbles.get(bubbleId);
    if (!bubble) return;

    bubble.participants = bubble.participants.filter((p) => p.participantId !== participantId);

    // Also remove relationships involving this participant
    bubble.relationships = bubble.relationships.filter(
      (r) => r.from !== participantId && r.to !== participantId
    );
  }

  /**
   * Record a contribution in a bubble
   */
  recordContribution(bubbleId: string, participantId: string): void {
    const bubble = this.bubbles.get(bubbleId);
    if (!bubble) return;

    const participant = bubble.participants.find((p) => p.participantId === participantId);
    if (participant) {
      participant.contributions++;
      participant.lastContribution = Date.now();
    }

    bubble.lastActivity = Date.now();
    bubble.messageCount++;
  }

  /**
   * Record a decision in a bubble
   */
  recordDecision(bubbleId: string): void {
    const bubble = this.bubbles.get(bubbleId);
    if (bubble) {
      bubble.decisionCount++;
      bubble.lastActivity = Date.now();
    }
  }

  /**
   * Get a bubble by ID
   */
  getBubble(bubbleId: string): ParticipationBubble | undefined {
    return this.bubbles.get(bubbleId);
  }

  /**
   * Get bubbles for a topic
   */
  getBubblesForTopic(topicId: string): ParticipationBubble[] {
    return Array.from(this.bubbles.values()).filter((b) => b.topicId === topicId);
  }

  /**
   * Get bubbles a participant is in
   */
  getBubblesForParticipant(participantId: string): ParticipationBubble[] {
    return Array.from(this.bubbles.values()).filter((b) =>
      b.participants.some((p) => p.participantId === participantId)
    );
  }

  // ============================================================================
  // Relationship Tracking
  // ============================================================================

  /**
   * Record an interaction between participants
   */
  recordInteraction(
    fromId: string,
    toId: string,
    type: RelationshipType = 'collaborates'
  ): void {
    const key = `${fromId}->${toId}`;
    const count = (this.interactionCounts.get(key) || 0) + 1;
    this.interactionCounts.set(key, count);

    // Update or create relationship
    this.updateRelationship(fromId, toId, type, count);
  }

  /**
   * Update relationship strength based on interactions
   */
  private updateRelationship(
    fromId: string,
    toId: string,
    type: RelationshipType,
    interactionCount: number
  ): void {
    const relationshipId = `rel-${fromId}-${toId}`;
    const reverseId = `rel-${toId}-${fromId}`;

    // Calculate strength (logarithmic scale, max 1.0)
    const strength = Math.min(1, Math.log10(interactionCount + 1) / 2);

    let relationship = this.relationships.get(relationshipId);
    const reverseRelationship = this.relationships.get(reverseId);

    if (relationship) {
      relationship.strength = strength;
      relationship.type = type;
    } else {
      relationship = {
        id: relationshipId,
        from: fromId,
        to: toId,
        type,
        strength,
        bidirectional: !!reverseRelationship,
      };
      this.relationships.set(relationshipId, relationship);
    }

    // Update bidirectional flag if reverse exists
    if (reverseRelationship) {
      relationship.bidirectional = true;
      reverseRelationship.bidirectional = true;
    }
  }

  /**
   * Add relationship to a bubble
   */
  addRelationshipToBubble(
    bubbleId: string,
    fromId: string,
    toId: string,
    type: RelationshipType
  ): ParticipantRelationship | null {
    const bubble = this.bubbles.get(bubbleId);
    if (!bubble) return null;

    // Check if participants are in bubble
    const fromParticipant = bubble.participants.find((p) => p.participantId === fromId);
    const toParticipant = bubble.participants.find((p) => p.participantId === toId);
    if (!fromParticipant || !toParticipant) return null;

    // Check if relationship exists
    const existing = bubble.relationships.find(
      (r) => r.from === fromId && r.to === toId
    );
    if (existing) {
      existing.type = type;
      return existing;
    }

    const relationship: ParticipantRelationship = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      from: fromId,
      to: toId,
      type,
      strength: 0.5,
      bidirectional: false,
    };

    bubble.relationships.push(relationship);
    return relationship;
  }

  /**
   * Get relationships for a participant
   */
  getRelationshipsForParticipant(participantId: string): ParticipantRelationship[] {
    return Array.from(this.relationships.values()).filter(
      (r) => r.from === participantId || r.to === participantId
    );
  }

  /**
   * Calculate participant positions for bubble visualization (force-directed layout)
   */
  calculateBubblePositions(bubbleId: string): Map<string, { x: number; y: number }> {
    const bubble = this.bubbles.get(bubbleId);
    if (!bubble) return new Map();

    const positions = new Map<string, { x: number; y: number }>();
    const count = bubble.participants.length;

    if (count === 0) return positions;

    // Simple circular layout
    const radius = 100;
    const centerX = 150;
    const centerY = 150;

    bubble.participants.forEach((participant, index) => {
      const angle = (2 * Math.PI * index) / count - Math.PI / 2;
      positions.set(participant.participantId, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });

    // TODO: Implement force-directed layout based on relationships

    return positions;
  }

  // ============================================================================
  // Topic Detection
  // ============================================================================

  /**
   * Detect topic from message content (simple keyword extraction)
   */
  detectTopic(content: string): string {
    // Simple implementation - extract key terms
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Remove common words
    const stopWords = new Set([
      'that', 'this', 'with', 'have', 'will', 'from', 'they', 'been',
      'would', 'could', 'should', 'their', 'there', 'where', 'which',
      'about', 'into', 'more', 'some', 'them', 'then', 'than', 'what',
    ]);

    const keywords = words.filter((w) => !stopWords.has(w));

    // Return first 3 significant words as topic
    return keywords.slice(0, 3).join(' ') || 'general discussion';
  }

  /**
   * Find or create bubble for a topic
   */
  findOrCreateBubble(content: string): ParticipationBubble {
    const topic = this.detectTopic(content);
    const topicId = topic.replace(/\s+/g, '-').toLowerCase();

    // Check if bubble exists for this topic
    const existing = this.getBubblesForTopic(topicId);
    if (existing.length > 0) {
      return existing[0];
    }

    // Create new bubble
    return this.createBubble(topicId, topic);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up inactive bubbles
   */
  cleanupInactiveBubbles(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    this.bubbles.forEach((bubble, id) => {
      if (now - bubble.lastActivity > maxAgeMs) {
        this.bubbles.delete(id);
      }
    });
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.participants.clear();
    this.bubbles.clear();
    this.relationships.clear();
    this.interactionCounts.clear();

    // Re-add system participant
    this.addParticipant({
      id: 'system',
      type: 'agent',
      name: 'System',
      role: 'moderator',
      online: true,
      capabilities: ['moderate', 'summarize', 'coordinate'],
    });
  }
}
