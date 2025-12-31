/**
 * User & Team Management (localStorage-based)
 *
 * Simple localStorage-based user and team management for llmos-lite.
 * No backend required, perfect for local-first applications.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export const UserStorage = {
  STORAGE_KEYS: {
    USER: 'llmos_user',
    TEAM: 'llmos_team',
    // Additional keys to clear on logout
    SESSIONS: 'llmos_sessions',
    CRON_JOBS: 'llmos_cron_jobs',
    ACTIVE_SESSION: 'llmos_active_session',
    WORKSPACE_PREFERENCES: 'llmos_workspace_preferences',
    APPLET_STORE: 'llmos-applet-store',
    DESKTOP_APPLETS: 'llmos-desktop-applets',
    VFS_INDEX: 'vfs:index',
  },

  /**
   * Save user to localStorage
   */
  saveUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.USER, JSON.stringify(user));
    }
  },

  /**
   * Get user from localStorage
   */
  getUser(): User | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEYS.USER);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  },

  /**
   * Save team to localStorage
   */
  saveTeam(team: Team): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.TEAM, JSON.stringify(team));
    }
  },

  /**
   * Get team from localStorage
   */
  getTeam(): Team | null {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEYS.TEAM);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  },

  /**
   * Check if user is configured
   */
  isUserConfigured(): boolean {
    return !!this.getUser() && !!this.getTeam();
  },

  /**
   * Clear all user/team data and application state
   */
  clearAll(): void {
    if (typeof window !== 'undefined') {
      // Clear all defined storage keys
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      // Clear all VFS files (items with 'vfs:' prefix)
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('vfs:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  },

  /**
   * Get formatted display string (e.g., "john@engineering")
   */
  getUserDisplay(): string {
    const user = this.getUser();
    const team = this.getTeam();

    if (!user || !team) {
      return 'guest@unknown';
    }

    // Extract username from email (before @)
    const username = user.email.split('@')[0];
    return `${username}@${team.name}`;
  },

  /**
   * Get user email short form (e.g., "john@example.com" -> "john")
   */
  getUsernameShort(): string {
    const user = this.getUser();
    if (!user) return 'guest';
    return user.email.split('@')[0];
  },
};
