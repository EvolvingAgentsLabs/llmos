# Model Context Protocol (MCP) Integration

LLMos-Lite now supports the **Model Context Protocol (MCP)**, enabling skills to communicate with external servers for data access, API integration, and service communication.

This feature is inspired by OpenAI's Codex CLI and provides a secure, policy-enforced way for browser-executed skills to access external resources.

## Overview

### What is MCP?

The Model Context Protocol (MCP) is a standardized protocol for AI tools to communicate with external services. It enables:

- **Database Access**: Query PostgreSQL, MySQL, MongoDB, Redis
- **API Integration**: Call REST, GraphQL, or custom APIs
- **File Systems**: Access cloud storage (S3, GCS) or remote filesystems
- **Custom Services**: Integrate any service with an MCP server

### Key Features

- ✅ **Browser-Compatible**: Works with WebAssembly execution
- ✅ **Security First**: Policy-based access control
- ✅ **Server Allowlisting**: Skills declare which MCP servers they need
- ✅ **Execution Policies**: Memory, time, network, and API limits
- ✅ **Sandboxed**: No direct network access, only via MCP

## Architecture

```
┌────────────────────────────────────────────────┐
│         Browser (Skills Execution)             │
│  ┌──────────────────────────────────────────┐  │
│  │  JavaScript/Python Skill                 │  │
│  │  - Declares MCP servers needed           │  │
│  │  - Execution policy enforced             │  │
│  └────────────────┬─────────────────────────┘  │
│                   │                            │
│  ┌────────────────▼─────────────────────────┐  │
│  │  MCP Client (Browser)                    │  │
│  │  - Manages server connections            │  │
│  │  - Routes method calls                   │  │
│  │  - Handles auth & timeouts               │  │
│  └────────────────┬─────────────────────────┘  │
└───────────────────┼────────────────────────────┘
                    │ HTTPS/fetch
                    │
┌───────────────────▼────────────────────────────┐
│          MCP Servers (External)                │
│  ┌──────────────┐  ┌──────────────┐           │
│  │ PostgreSQL   │  │ Weather API  │  ...      │
│  │ MCP Server   │  │ MCP Server   │           │
│  └──────────────┘  └──────────────┘           │
└────────────────────────────────────────────────┘
```

## Quick Start

### 1. Configure MCP Servers

MCP servers are configured in the browser's localStorage. You can add them via the UI settings or programmatically:

```typescript
import { MCPServerRegistry } from '@/lib/mcp-config';

// Add a PostgreSQL MCP server
MCPServerRegistry.addServer({
  name: 'postgres-dev',
  url: 'https://mcp.example.com/postgres',
  auth: 'Bearer your-token-here',
  timeout: 30000
});

// Add a weather API server (no auth required)
MCPServerRegistry.addServer({
  name: 'weather-api',
  url: 'https://mcp.example.com/weather',
  timeout: 15000
});
```

### 2. Create MCP-Enabled Skills

Skills declare which MCP servers they need in their frontmatter:

```markdown
---
skill_id: database-query-node
name: Database Query via MCP
type: javascript
mcp_servers: ["postgres-dev"]
execution_policy: standard
inputs:
  - name: query
    type: string
outputs:
  - name: rows
    type: array
---

\`\`\`javascript
async function execute(context) {
  const { inputs, mcp, enforcer } = context;

  // MCP access is automatically checked by executor
  const result = await mcp.call('postgres-dev', 'query', {
    sql: inputs.query
  });

  return {
    rows: result.rows,
    row_count: result.rows.length
  };
}
\`\`\`
```

### 3. Use in Workflows

Simply drag the MCP-enabled skill into your workflow and connect it to other nodes. The workflow executor will:

1. Check if MCP access is allowed by execution policy
2. Initialize MCP client with configured servers
3. Pass MCP client to the skill's execution context
4. Enforce policy violations

## Execution Policies

Skills can specify execution policies to limit resource usage and access:

### Named Policies

```yaml
execution_policy: strict    # Most restrictive
execution_policy: standard  # Balanced
execution_policy: relaxed   # Most permissive
```

### Policy Limits

| Policy | Memory | Time | Network | MCP Access | File System |
|--------|--------|------|---------|------------|-------------|
| **strict** | 128MB | 30s | ❌ | ❌ | ❌ |
| **standard** | 512MB | 60s | ✅ | ✅ | ❌ |
| **relaxed** | 2GB | 300s | ✅ | ✅ | ✅ |

### Custom Policies

```yaml
execution_policy:
  maxMemoryMB: 256
  maxTimeSeconds: 45
  networkAccess: true
  mcpAccess: true
  allowedMCPServers: ["postgres-dev", "redis-cache"]
  deniedAPIs: ["eval", "exec"]
```

## MCP Client API

### JavaScript Skills

```javascript
async function execute(context) {
  const { mcp } = context;

  // Call a single method
  const result = await mcp.call('server-name', 'method', {
    param1: 'value1',
    param2: 'value2'
  });

  // Batch calls
  const results = await mcp.batch('server-name', [
    { method: 'query', params: { sql: 'SELECT * FROM users' } },
    { method: 'query', params: { sql: 'SELECT * FROM orders' } }
  ]);

  // Check server health
  const isHealthy = await mcp.ping('server-name');

  return result;
}
```

### Python Skills (Pyodide)

```python
import js

async def execute(context):
    mcp = context['mcp']

    # Call MCP server (requires JavaScript interop)
    result_promise = js.mcp.call('server-name', 'method', {
        'param': 'value'
    })

    # Await the promise
    result = await result_promise

    # Convert from JavaScript to Python
    data = result.to_py()

    return {
        'output': data
    }
```

## Policy Enforcement

The execution policy enforcer runs automatically during skill execution:

### Time Limits

```javascript
// Enforcer automatically checks time after execution
const timeViolation = enforcer.checkTimeLimit();
if (timeViolation) {
  throw new Error(timeViolation.message);
}
```

### API Access

```javascript
// Check if API is allowed
const violation = enforcer.checkAPI('numpy');
if (violation) {
  throw new Error(violation.message);
}
```

### MCP Access

```javascript
// Check if MCP server is allowed
const violation = enforcer.checkMCPAccess('postgres-dev');
if (violation) {
  throw new Error(violation.message);
}
```

### Network Access

```javascript
// Check if network access is allowed
const violation = enforcer.checkNetworkAccess('https://api.example.com');
if (violation) {
  throw new Error(violation.message);
}
```

## Example Skills

### Database Query (JavaScript)

See: `volumes/system/skills/database-query-node.md`

Features:
- Query PostgreSQL, MySQL, or any SQL database
- SQL injection protection via MCP server
- Automatic result pagination
- Error handling

### Weather Analysis (Python)

See: `volumes/system/skills/weather-analysis-node.md`

Features:
- Fetch weather forecasts via MCP
- Statistical analysis with Python
- Multi-day trends
- Human-readable summaries

## Creating MCP Servers

MCP servers are HTTP endpoints that implement the MCP protocol. A minimal MCP server:

```javascript
// Express.js example
app.post('/mcp', async (req, res) => {
  const { method, params, id } = req.body;

  try {
    let result;

    switch (method) {
      case 'ping':
        result = { status: 'ok' };
        break;

      case 'query':
        // Execute database query
        result = await db.query(params.sql);
        break;

      default:
        return res.json({
          error: { code: -32601, message: 'Method not found' },
          id
        });
    }

    res.json({ result, id });
  } catch (error) {
    res.json({
      error: { code: -32000, message: error.message },
      id
    });
  }
});
```

### MCP Server Requirements

1. **HTTP POST endpoint** accepting JSON
2. **Request format**:
   ```json
   {
     "method": "method-name",
     "params": { "key": "value" },
     "id": "request-id"
   }
   ```
3. **Response format**:
   ```json
   {
     "result": { "data": "..." },
     "id": "request-id"
   }
   ```
4. **Error format**:
   ```json
   {
     "error": {
       "code": -32000,
       "message": "Error message"
     },
     "id": "request-id"
   }
   ```

## Security Best Practices

### 1. Server Allowlisting

Always declare MCP servers in skill frontmatter:

```yaml
mcp_servers: ["postgres-dev", "redis-cache"]
```

Skills can only access servers they explicitly declare.

### 2. Authentication

Store auth tokens securely in MCP server configuration:

```typescript
MCPServerRegistry.addServer({
  name: 'secure-api',
  url: 'https://api.example.com',
  auth: 'Bearer ' + getSecureToken(), // From secure storage
  timeout: 30000
});
```

### 3. Execution Policies

Use appropriate policies for skill trust level:

- **strict**: Untrusted or experimental skills
- **standard**: Reviewed and tested skills
- **relaxed**: System skills only

### 4. Timeouts

Set reasonable timeouts to prevent hanging:

```typescript
MCPServerRegistry.addServer({
  name: 'slow-api',
  url: 'https://slow.example.com',
  timeout: 60000 // 60 seconds max
});
```

### 5. Input Validation

Always validate inputs before passing to MCP:

```javascript
async function execute(context) {
  const { inputs } = context;

  // Validate SQL query (basic check)
  if (!inputs.query || typeof inputs.query !== 'string') {
    throw new Error('Invalid query parameter');
  }

  // Check for dangerous patterns
  if (inputs.query.match(/DROP|DELETE|TRUNCATE/i)) {
    throw new Error('Destructive operations not allowed');
  }

  // Call MCP server
  const result = await mcp.call('db', 'query', { sql: inputs.query });
  return result;
}
```

## Troubleshooting

### MCP Server Not Found

```
Error: MCP server 'postgres-dev' not registered
```

**Solution**: Configure the server in MCP settings or add it programmatically:

```typescript
MCPServerRegistry.addServer({
  name: 'postgres-dev',
  url: 'https://mcp.example.com/postgres',
  auth: 'Bearer token'
});
```

### Policy Violation

```
Error: MCP access is denied by policy
```

**Solution**: Update execution policy to allow MCP:

```yaml
execution_policy:
  mcpAccess: true
  allowedMCPServers: ["postgres-dev"]
```

### Timeout

```
Error: MCP request to 'postgres-dev' timed out after 30000ms
```

**Solution**: Increase timeout or optimize query:

```typescript
MCPServerRegistry.addServer({
  name: 'postgres-dev',
  url: 'https://mcp.example.com/postgres',
  timeout: 60000 // Increase to 60 seconds
});
```

### Network Error

```
Error: Failed to fetch
```

**Solution**: Check:
1. MCP server URL is correct
2. Server is running and accessible
3. CORS is configured on server
4. Network connection is available

## API Reference

### MCPClient

```typescript
class MCPClient {
  registerServer(config: MCPServerConfig): void;
  unregisterServer(name: string): boolean;
  getServer(name: string): MCPServerConfig | undefined;
  listServers(): MCPServerConfig[];
  call<T>(serverName: string, method: string, params?: any): Promise<T>;
  batch<T>(serverName: string, calls: Array<{method: string, params?: any}>): Promise<T[]>;
  ping(serverName: string): Promise<boolean>;
}
```

### MCPServerRegistry

```typescript
class MCPServerRegistry {
  static loadServers(): MCPServerConfig[];
  static saveServers(servers: MCPServerConfig[]): void;
  static addServer(config: MCPServerConfig): void;
  static removeServer(name: string): boolean;
  static getServer(name: string): MCPServerConfig | undefined;
  static listServers(): MCPServerConfig[];
  static clearServers(): void;
}
```

### ExecutionPolicyEnforcer

```typescript
class ExecutionPolicyEnforcer {
  constructor(policy: ExecutionPolicy);
  start(): void;
  checkTimeLimit(): PolicyViolation | null;
  checkAPI(apiName: string): PolicyViolation | null;
  checkNetworkAccess(url?: string): PolicyViolation | null;
  checkMCPAccess(serverName: string): PolicyViolation | null;
  checkFileSystemAccess(path?: string): PolicyViolation | null;
  recordViolation(violation: PolicyViolation): void;
  getViolations(): PolicyViolation[];
  getSummary(): string;
}
```

## Related Documentation

- [WASM_WORKFLOWS.md](WASM_WORKFLOWS.md) - WebAssembly workflow execution
- [README.md](README.md) - Main documentation
- Skills examples in `volumes/system/skills/`
  - `database-query-node.md` - Database query via MCP
  - `weather-analysis-node.md` - Weather data via MCP

## Credits

MCP integration inspired by OpenAI's Codex CLI project. Implementation adapted for browser-based WebAssembly execution in llmos-lite.
