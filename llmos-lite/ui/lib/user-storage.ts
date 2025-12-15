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
   * Clear all user/team data
   */
  clearAll(): void {
    if (typeof window !== 'undefined') {
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
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
