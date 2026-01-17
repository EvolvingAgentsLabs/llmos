/**
 * GitHub OAuth and Authentication Service
 * Handles login, token management, and user profile
 */

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
  access_token: string;
}

const GITHUB_STORAGE_KEY = 'llmos_github_user';

export class GitHubAuth {
  static getClientId(): string {
    return process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '';
  }

  static getAuthUrl(): string {
    const clientId = this.getClientId();
    const redirectUri = `${window.location.origin}/api/auth/github/callback`;
    const scope = 'repo,user:email';

    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  }

  static startOAuthFlow(): void {
    const authUrl = this.getAuthUrl();
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl,
      'GitHub OAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  }

  static saveUser(user: GitHubUser): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(GITHUB_STORAGE_KEY, JSON.stringify(user));
  }

  static getUser(): GitHubUser | null {
    if (typeof window === 'undefined') return null;

    const stored = localStorage.getItem(GITHUB_STORAGE_KEY);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse GitHub user:', e);
      return null;
    }
  }

  static clearUser(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(GITHUB_STORAGE_KEY);
  }

  static isAuthenticated(): boolean {
    return this.getUser() !== null;
  }

  static async fetchUserProfile(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch GitHub user profile');
    }

    const data = await response.json();

    return {
      id: data.id,
      login: data.login,
      name: data.name || data.login,
      email: data.email || `${data.login}@users.noreply.github.com`,
      avatar_url: data.avatar_url,
      access_token: accessToken,
    };
  }
}
