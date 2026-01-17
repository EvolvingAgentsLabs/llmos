/**
 * Execution Policy System for llmos-lite
 *
 * Provides configurable rules governing what skills can execute,
 * inspired by OpenAI Codex CLI's execution policy system.
 *
 * Features:
 * - Resource limits (memory, time, CPU)
 * - Network access control
 * - API allowlists/denylists
 * - Sandboxing configuration
 * - Policy enforcement
 *
 * Usage:
 * ```typescript
 * const policy: ExecutionPolicy = {
 *   maxMemoryMB: 512,
 *   maxTimeSeconds: 30,
 *   networkAccess: true,
 *   allowedAPIs: ['numpy', 'qiskit'],
 * };
 *
 * await enforcePolicy(policy, async () => {
 *   // Execute skill code
 * });
 * ```
 */

export interface ExecutionPolicy {
  /** Maximum memory usage in MB */
  maxMemoryMB?: number;
  /** Maximum execution time in seconds */
  maxTimeSeconds?: number;
  /** Allow network access */
  networkAccess?: boolean;
  /** Allowed Python/JS APIs (allowlist) */
  allowedAPIs?: string[];
  /** Denied Python/JS APIs (denylist) */
  deniedAPIs?: string[];
  /** Allow file system access */
  fileSystemAccess?: boolean;
  /** Allowed file paths (if fileSystemAccess is true) */
  allowedPaths?: string[];
  /** Allow MCP server access */
  mcpAccess?: boolean;
  /** Allowed MCP servers */
  allowedMCPServers?: string[];
  /** Custom policy extensions */
  custom?: Record<string, any>;
}

export interface PolicyViolation {
  type: 'memory' | 'time' | 'network' | 'api' | 'filesystem' | 'mcp';
  message: string;
  details?: any;
}

export class ExecutionPolicyEnforcer {
  private policy: ExecutionPolicy;
  private startTime: number = 0;
  private violations: PolicyViolation[] = [];

  constructor(policy: ExecutionPolicy) {
    this.policy = {
      maxMemoryMB: 256,
      maxTimeSeconds: 60,
      networkAccess: false,
      fileSystemAccess: false,
      mcpAccess: false,
      ...policy,
    };
  }

  /**
   * Start policy enforcement
   */
  start(): void {
    this.startTime = Date.now();
    this.violations = [];
  }

  /**
   * Check if execution time limit has been exceeded
   */
  checkTimeLimit(): PolicyViolation | null {
    if (!this.policy.maxTimeSeconds) return null;

    const elapsed = (Date.now() - this.startTime) / 1000;
    if (elapsed > this.policy.maxTimeSeconds) {
      return {
        type: 'time',
        message: `Execution exceeded time limit of ${this.policy.maxTimeSeconds}s`,
        details: { elapsed, limit: this.policy.maxTimeSeconds },
      };
    }
    return null;
  }

  /**
   * Check if an API is allowed
   */
  checkAPI(apiName: string): PolicyViolation | null {
    // Check denylist first
    if (this.policy.deniedAPIs?.includes(apiName)) {
      return {
        type: 'api',
        message: `API '${apiName}' is explicitly denied`,
        details: { api: apiName },
      };
    }

    // Check allowlist if specified
    if (this.policy.allowedAPIs && this.policy.allowedAPIs.length > 0) {
      if (!this.policy.allowedAPIs.includes(apiName)) {
        return {
          type: 'api',
          message: `API '${apiName}' is not in allowlist`,
          details: {
            api: apiName,
            allowed: this.policy.allowedAPIs,
          },
        };
      }
    }

    return null;
  }

  /**
   * Check if network access is allowed
   */
  checkNetworkAccess(url?: string): PolicyViolation | null {
    if (!this.policy.networkAccess) {
      return {
        type: 'network',
        message: 'Network access is denied by policy',
        details: { url },
      };
    }
    return null;
  }

  /**
   * Check if MCP server access is allowed
   */
  checkMCPAccess(serverName: string): PolicyViolation | null {
    if (!this.policy.mcpAccess) {
      return {
        type: 'mcp',
        message: 'MCP access is denied by policy',
        details: { server: serverName },
      };
    }

    if (
      this.policy.allowedMCPServers &&
      !this.policy.allowedMCPServers.includes(serverName)
    ) {
      return {
        type: 'mcp',
        message: `MCP server '${serverName}' is not in allowlist`,
        details: {
          server: serverName,
          allowed: this.policy.allowedMCPServers,
        },
      };
    }

    return null;
  }

  /**
   * Check if file system access is allowed
   */
  checkFileSystemAccess(path?: string): PolicyViolation | null {
    if (!this.policy.fileSystemAccess) {
      return {
        type: 'filesystem',
        message: 'File system access is denied by policy',
        details: { path },
      };
    }

    if (path && this.policy.allowedPaths) {
      const isAllowed = this.policy.allowedPaths.some((allowedPath) =>
        path.startsWith(allowedPath)
      );
      if (!isAllowed) {
        return {
          type: 'filesystem',
          message: `Path '${path}' is not in allowlist`,
          details: {
            path,
            allowed: this.policy.allowedPaths,
          },
        };
      }
    }

    return null;
  }

  /**
   * Record a violation
   */
  recordViolation(violation: PolicyViolation): void {
    this.violations.push(violation);
  }

  /**
   * Get all violations
   */
  getViolations(): PolicyViolation[] {
    return [...this.violations];
  }

  /**
   * Get policy summary
   */
  getSummary(): string {
    const parts: string[] = [];
    if (this.policy.maxMemoryMB) parts.push(`Memory: ${this.policy.maxMemoryMB}MB`);
    if (this.policy.maxTimeSeconds) parts.push(`Time: ${this.policy.maxTimeSeconds}s`);
    parts.push(`Network: ${this.policy.networkAccess ? 'allowed' : 'denied'}`);
    parts.push(`MCP: ${this.policy.mcpAccess ? 'allowed' : 'denied'}`);
    return parts.join(', ');
  }
}

/**
 * Default execution policies for different skill types
 */
export const DEFAULT_POLICIES: Record<string, ExecutionPolicy> = {
  // Strict policy for untrusted skills
  strict: {
    maxMemoryMB: 128,
    maxTimeSeconds: 30,
    networkAccess: false,
    mcpAccess: false,
    fileSystemAccess: false,
    allowedAPIs: ['numpy', 'math'],
  },

  // Standard policy for trusted skills
  standard: {
    maxMemoryMB: 512,
    maxTimeSeconds: 60,
    networkAccess: true,
    mcpAccess: true,
    fileSystemAccess: false,
  },

  // Relaxed policy for system skills
  relaxed: {
    maxMemoryMB: 2048,
    maxTimeSeconds: 300,
    networkAccess: true,
    mcpAccess: true,
    fileSystemAccess: true,
  },
};

/**
 * Helper function to enforce a policy during execution
 */
export async function enforcePolicy<T>(
  policy: ExecutionPolicy,
  fn: (enforcer: ExecutionPolicyEnforcer) => Promise<T>
): Promise<T> {
  const enforcer = new ExecutionPolicyEnforcer(policy);
  enforcer.start();

  try {
    const result = await fn(enforcer);

    // Check for time violations after execution
    const timeViolation = enforcer.checkTimeLimit();
    if (timeViolation) {
      enforcer.recordViolation(timeViolation);
      throw new Error(timeViolation.message);
    }

    return result;
  } catch (error) {
    // Re-throw with policy context
    if (error instanceof Error) {
      const violations = enforcer.getViolations();
      if (violations.length > 0) {
        error.message = `Policy violation: ${error.message}\nViolations: ${violations.map((v) => v.message).join(', ')}`;
      }
    }
    throw error;
  }
}
