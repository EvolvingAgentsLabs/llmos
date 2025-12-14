/**
 * MCP Server Configuration
 *
 * Manages configuration for MCP servers that skills can use.
 * Stores configurations in localStorage for browser-based execution.
 *
 * Usage:
 * ```typescript
 * import { MCPServerRegistry } from '@/lib/mcp-config';
 *
 * // Add server configuration
 * MCPServerRegistry.addServer({
 *   name: 'postgres-dev',
 *   url: 'https://mcp.example.com/postgres',
 *   auth: 'Bearer token123'
 * });
 *
 * // Get all configured servers
 * const servers = MCPServerRegistry.listServers();
 * ```
 */

import { MCPServerConfig } from './mcp-client';

const MCP_STORAGE_KEY = 'llmos-lite:mcp-servers';

export class MCPServerRegistry {
  /**
   * Load all MCP server configurations from localStorage
   */
  static loadServers(): MCPServerConfig[] {
    if (typeof window === 'undefined') return [];

    try {
      const stored = localStorage.getItem(MCP_STORAGE_KEY);
      if (!stored) return [];

      const servers = JSON.parse(stored);
      return Array.isArray(servers) ? servers : [];
    } catch (error) {
      console.error('[MCP Registry] Failed to load servers:', error);
      return [];
    }
  }

  /**
   * Save MCP server configurations to localStorage
   */
  static saveServers(servers: MCPServerConfig[]): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
    } catch (error) {
      console.error('[MCP Registry] Failed to save servers:', error);
    }
  }

  /**
   * Add a new MCP server configuration
   */
  static addServer(config: MCPServerConfig): void {
    const servers = this.loadServers();

    // Check if server already exists
    const existingIndex = servers.findIndex((s) => s.name === config.name);
    if (existingIndex >= 0) {
      // Update existing server
      servers[existingIndex] = config;
    } else {
      // Add new server
      servers.push(config);
    }

    this.saveServers(servers);
  }

  /**
   * Remove an MCP server configuration
   */
  static removeServer(name: string): boolean {
    const servers = this.loadServers();
    const filtered = servers.filter((s) => s.name !== name);

    if (filtered.length < servers.length) {
      this.saveServers(filtered);
      return true;
    }

    return false;
  }

  /**
   * Get a specific MCP server configuration
   */
  static getServer(name: string): MCPServerConfig | undefined {
    const servers = this.loadServers();
    return servers.find((s) => s.name === name);
  }

  /**
   * List all MCP server configurations
   */
  static listServers(): MCPServerConfig[] {
    return this.loadServers();
  }

  /**
   * Clear all MCP server configurations
   */
  static clearServers(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MCP_STORAGE_KEY);
  }
}

/**
 * Example MCP server configurations
 */
export const EXAMPLE_MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'postgres-dev',
    url: 'https://mcp.example.com/postgres',
    auth: 'Bearer your-token-here',
    timeout: 30000,
  },
  {
    name: 'redis-cache',
    url: 'https://mcp.example.com/redis',
    auth: 'Bearer your-token-here',
    timeout: 10000,
  },
  {
    name: 'weather-api',
    url: 'https://mcp.example.com/weather',
    timeout: 15000,
  },
];
