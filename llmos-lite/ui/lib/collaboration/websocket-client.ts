/**
 * Real-Time Collaboration - WebSocket Client
 *
 * Enables real-time synchronization of sessions, artifacts, and workspace changes
 * across multiple users and devices.
 */

export type CollaborationEvent =
  | { type: 'session_update'; sessionId: string; data: any }
  | { type: 'artifact_created'; artifactId: string; data: any }
  | { type: 'artifact_updated'; artifactId: string; data: any }
  | { type: 'user_joined'; userId: string; userName: string }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_move'; userId: string; position: { x: number; y: number } }
  | { type: 'typing'; userId: string; sessionId: string }
  | { type: 'commit'; volumeType: string; commitSha: string };

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  color: string;
  cursor?: { x: number; y: number };
  currentSession?: string;
}

export interface CollaborationRoom {
  id: string;
  type: 'workspace' | 'session';
  users: CollaborationUser[];
}

type EventCallback = (event: CollaborationEvent) => void;

export class WebSocketCollaborationClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventCallbacks: Map<string, EventCallback[]> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private currentRoom: string | null = null;
  private userId: string;

  constructor(
    private serverUrl: string,
    userId: string,
  ) {
    this.userId = userId;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('[Collaboration] Connected to WebSocket server');
          this.reconnectAttempts = 0;
          this.startHeartbeat();

          // Authenticate
          this.send({
            type: 'auth',
            userId: this.userId,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('[Collaboration] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Collaboration] WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('[Collaboration] WebSocket closed');
          this.stopHeartbeat();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Join a collaboration room
   */
  joinRoom(roomId: string, roomType: 'workspace' | 'session' = 'workspace'): void {
    this.currentRoom = roomId;
    this.send({
      type: 'join_room',
      roomId,
      roomType,
      userId: this.userId,
    });
  }

  /**
   * Leave current room
   */
  leaveRoom(): void {
    if (this.currentRoom) {
      this.send({
        type: 'leave_room',
        roomId: this.currentRoom,
        userId: this.userId,
      });
      this.currentRoom = null;
    }
  }

  /**
   * Broadcast session update
   */
  broadcastSessionUpdate(sessionId: string, data: any): void {
    this.broadcast({
      type: 'session_update',
      sessionId,
      data,
    });
  }

  /**
   * Broadcast artifact creation
   */
  broadcastArtifactCreated(artifactId: string, data: any): void {
    this.broadcast({
      type: 'artifact_created',
      artifactId,
      data,
    });
  }

  /**
   * Broadcast artifact update
   */
  broadcastArtifactUpdated(artifactId: string, data: any): void {
    this.broadcast({
      type: 'artifact_updated',
      artifactId,
      data,
    });
  }

  /**
   * Broadcast cursor position
   */
  broadcastCursor(position: { x: number; y: number }): void {
    this.broadcast({
      type: 'cursor_move',
      userId: this.userId,
      position,
    });
  }

  /**
   * Broadcast typing indicator
   */
  broadcastTyping(sessionId: string): void {
    this.broadcast({
      type: 'typing',
      userId: this.userId,
      sessionId,
    });
  }

  /**
   * Broadcast commit event
   */
  broadcastCommit(volumeType: string, commitSha: string): void {
    this.broadcast({
      type: 'commit',
      volumeType,
      commitSha,
    });
  }

  /**
   * Subscribe to specific event type
   */
  on(eventType: string, callback: EventCallback): () => void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.eventCallbacks.get(eventType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send message to server
   */
  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[Collaboration] Cannot send message, not connected');
    }
  }

  /**
   * Broadcast to all users in room
   */
  private broadcast(event: CollaborationEvent): void {
    this.send({
      type: 'broadcast',
      roomId: this.currentRoom,
      event,
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: any): void {
    if (data.type === 'event') {
      const event = data.event as CollaborationEvent;

      // Notify subscribers
      const callbacks = this.eventCallbacks.get(event.type);
      if (callbacks) {
        callbacks.forEach(callback => callback(event));
      }

      // Notify wildcard subscribers
      const wildcardCallbacks = this.eventCallbacks.get('*');
      if (wildcardCallbacks) {
        wildcardCallbacks.forEach(callback => callback(event));
      }
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect after connection loss
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Collaboration] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[Collaboration] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('[Collaboration] Reconnect failed:', error);
      });
    }, delay);
  }
}

/**
 * Create collaboration client instance
 */
export function createCollaborationClient(userId: string): WebSocketCollaborationClient {
  // Use WebSocket server URL from environment or default to localhost
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
  return new WebSocketCollaborationClient(wsUrl, userId);
}

/**
 * React hook for collaboration
 */
export function useCollaboration(userId: string, roomId?: string) {
  const [client] = React.useState(() => createCollaborationClient(userId));
  const [isConnected, setIsConnected] = React.useState(false);
  const [users, setUsers] = React.useState<CollaborationUser[]>([]);

  React.useEffect(() => {
    client.connect()
      .then(() => setIsConnected(true))
      .catch(error => console.error('Failed to connect:', error));

    return () => {
      client.disconnect();
    };
  }, [client]);

  React.useEffect(() => {
    if (isConnected && roomId) {
      client.joinRoom(roomId);

      return () => {
        client.leaveRoom();
      };
    }
  }, [isConnected, roomId, client]);

  // Listen for user events
  React.useEffect(() => {
    const unsubscribeJoin = client.on('user_joined', (event: any) => {
      if (event.type === 'user_joined') {
        setUsers(prev => [...prev, {
          id: event.userId,
          name: event.userName,
          email: '',
          color: generateUserColor(event.userId),
        }]);
      }
    });

    const unsubscribeLeave = client.on('user_left', (event: any) => {
      if (event.type === 'user_left') {
        setUsers(prev => prev.filter(u => u.id !== event.userId));
      }
    });

    return () => {
      unsubscribeJoin();
      unsubscribeLeave();
    };
  }, [client]);

  return {
    client,
    isConnected,
    users,
    joinRoom: (roomId: string) => client.joinRoom(roomId),
    leaveRoom: () => client.leaveRoom(),
  };
}

/**
 * Generate consistent color for user
 */
function generateUserColor(userId: string): string {
  const colors = [
    '#00ff88', '#00d4ff', '#ffcc00', '#ff6b6b', '#a78bfa',
    '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

// Add React import for hooks
import React from 'react';
