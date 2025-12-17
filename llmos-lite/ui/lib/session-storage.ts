/**
 * Session Management (localStorage-based)
 *
 * Manages user sessions with real data persistence
 */

export interface Session {
  id: string;
  name: string;
  volume: 'system' | 'team' | 'user';
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  message_count: number;
}

export const SessionStorage = {
  STORAGE_KEY: 'llmos_sessions',

  /**
   * Get all sessions
   */
  getSessions(): Session[] {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  },

  /**
   * Get sessions for a specific volume
   */
  getSessionsByVolume(volume: 'system' | 'team' | 'user'): Session[] {
    return this.getSessions().filter(s => s.volume === volume && s.status === 'active');
  },

  /**
   * Create a new session
   */
  createSession(name: string, volume: 'system' | 'team' | 'user'): Session {
    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      volume,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
    };

    const sessions = this.getSessions();
    sessions.push(session);
    this.saveSessions(sessions);

    return session;
  },

  /**
   * Update a session
   */
  updateSession(sessionId: string, updates: Partial<Session>): void {
    const sessions = this.getSessions();
    const index = sessions.findIndex(s => s.id === sessionId);

    if (index !== -1) {
      sessions[index] = {
        ...sessions[index],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      this.saveSessions(sessions);
    }
  },

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    const sessions = this.getSessions().filter(s => s.id !== sessionId);
    this.saveSessions(sessions);
  },

  /**
   * Archive a session (soft delete)
   */
  archiveSession(sessionId: string): void {
    this.updateSession(sessionId, { status: 'archived' });
  },

  /**
   * Increment message count for a session
   */
  incrementMessageCount(sessionId: string): void {
    const sessions = this.getSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (session) {
      this.updateSession(sessionId, {
        message_count: session.message_count + 1
      });
    }
  },

  /**
   * Save sessions to localStorage
   */
  saveSessions(sessions: Session[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    }
  },

  /**
   * Clear all sessions
   */
  clearAll(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  },

  /**
   * Get formatted time ago string
   */
  getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  },
};
