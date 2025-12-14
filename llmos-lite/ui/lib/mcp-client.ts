/**
 * Model Context Protocol (MCP) Client
 *
 * Enables llmos-lite skills to communicate with external MCP servers
 * for data access, API integration, and service communication.
 *
 * Based on the Model Context Protocol specification used in OpenAI Codex CLI.
 *
 * Features:
 * - Connect to multiple MCP servers
 * - Call server methods with parameters
 * - Handle authentication
 * - Error handling and retries
 * - Browser-compatible (fetch-based)
 *
 * Usage:
 * ```typescript
 * const client = new MCPClient();
 * await client.registerServer({
 *   name: 'postgres-dev',
 *   url: 'https://mcp.example.com/postgres',
 *   auth: 'Bearer token123'
 * });
 *
 * const data = await client.call('postgres-dev', 'query', {
 *   sql: 'SELECT * FROM users LIMIT 10'
 * });
 * ```
 */

export interface MCPServerConfig {
  /** Unique identifier for this server */
  name: string;
  /** Base URL of the MCP server */
  url: string;
  /** Authentication token (optional) */
  auth?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface MCPRequest {
  /** Method name to call on the server */
  method: string;
  /** Parameters to pass to the method */
  params?: any;
  /** Request ID for tracking */
  id?: string;
}

export interface MCPResponse<T = any> {
  /** Response data */
  result?: T;
  /** Error information if request failed */
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  /** Request ID that was echoed back */
  id?: string;
}

export class MCPClient {
  private servers: Map<string, MCPServerConfig>;
  private requestCounter: number;

  constructor() {
    this.servers = new Map();
    this.requestCounter = 0;
  }

  /**
   * Register a new MCP server
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.name, {
      timeout: 30000,
      ...config,
    });
  }

  /**
   * Unregister an MCP server
   */
  unregisterServer(name: string): boolean {
    return this.servers.delete(name);
  }

  /**
   * Get registered server config
   */
  getServer(name: string): MCPServerConfig | undefined {
    return this.servers.get(name);
  }

  /**
   * List all registered servers
   */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Call a method on an MCP server
   */
  async call<T = any>(
    serverName: string,
    method: string,
    params?: any
  ): Promise<T> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' not registered`);
    }

    const requestId = `req_${++this.requestCounter}`;
    const request: MCPRequest = {
      method,
      params,
      id: requestId,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), server.timeout);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...server.headers,
      };

      if (server.auth) {
        headers['Authorization'] = server.auth;
      }

      const response = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `MCP server '${serverName}' returned ${response.status}: ${response.statusText}`
        );
      }

      const data: MCPResponse<T> = await response.json();

      if (data.error) {
        throw new Error(
          `MCP error (${data.error.code}): ${data.error.message}`
        );
      }

      return data.result as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(
            `MCP request to '${serverName}' timed out after ${server.timeout}ms`
          );
        }
        throw error;
      }
      throw new Error(`MCP request to '${serverName}' failed: ${error}`);
    }
  }

  /**
   * Batch call multiple methods on an MCP server
   */
  async batch<T = any>(
    serverName: string,
    calls: Array<{ method: string; params?: any }>
  ): Promise<T[]> {
    const promises = calls.map(({ method, params }) =>
      this.call<T>(serverName, method, params)
    );
    return Promise.all(promises);
  }

  /**
   * Check if a server is healthy
   */
  async ping(serverName: string): Promise<boolean> {
    try {
      await this.call(serverName, 'ping', {});
      return true;
    } catch (error) {
      console.error(`MCP server '${serverName}' ping failed:`, error);
      return false;
    }
  }
}

/**
 * Global MCP client instance
 */
export const mcpClient = new MCPClient();

/**
 * Helper function to initialize MCP servers from configuration
 */
export function initializeMCPServers(configs: MCPServerConfig[]): void {
  configs.forEach((config) => {
    mcpClient.registerServer(config);
  });
}
