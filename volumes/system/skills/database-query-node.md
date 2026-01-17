---
skill_id: database-query-node
name: Database Query via MCP
description: Query a database using Model Context Protocol (MCP) server
type: javascript
execution_mode: browser
category: data
tags: ["database", "mcp", "query", "data-access"]
version: 1.0.0
author: system
estimated_time_ms: 1000
memory_mb: 10
mcp_servers: ["postgres-dev"]
execution_policy: standard
inputs:
  - name: query
    type: string
    description: SQL query to execute
    default: "SELECT * FROM users LIMIT 10"
    required: true
  - name: server_name
    type: string
    description: Name of the MCP server to use
    default: "postgres-dev"
    required: true
outputs:
  - name: rows
    type: array
    description: Query result rows
  - name: row_count
    type: number
    description: Number of rows returned
  - name: execution_time
    type: number
    description: Query execution time in milliseconds
---

# Database Query via MCP

Executes SQL queries against a database using the Model Context Protocol (MCP).

This skill demonstrates how to use MCP servers to access external services from within llmos-lite workflows.

## Inputs
- **query** (string): SQL query to execute
- **server_name** (string): Name of the MCP server to use (must be configured in MCP settings)

## Outputs
- **rows** (array): Query result rows
- **row_count** (number): Number of rows returned
- **execution_time** (number): Query execution time in milliseconds

## MCP Configuration

This skill requires an MCP server to be configured. Before using this skill:

1. Configure an MCP server in the MCP settings
2. Add a server with name "postgres-dev" (or update the server_name input)
3. Ensure the server supports the "query" method

Example MCP server configuration:
```json
{
  "name": "postgres-dev",
  "url": "https://mcp.example.com/postgres",
  "auth": "Bearer your-token-here",
  "timeout": 30000
}
```

## Code

```javascript
async function execute(context) {
  /**
   * Execute database query via MCP
   *
   * This runs in the browser as native JavaScript.
   * It uses the MCP client to communicate with external database servers.
   */
  const { inputs, mcp, enforcer } = context;
  const query = inputs.query || "SELECT * FROM users LIMIT 10";
  const serverName = inputs.server_name || "postgres-dev";

  // Check if MCP access is allowed by execution policy
  const mcpViolation = enforcer.checkMCPAccess(serverName);
  if (mcpViolation) {
    throw new Error(mcpViolation.message);
  }

  const startTime = performance.now();

  try {
    // Call MCP server to execute query
    const result = await mcp.call(serverName, 'query', {
      sql: query,
    });

    const executionTime = performance.now() - startTime;

    // Extract rows from result
    const rows = result.rows || [];

    return {
      rows: rows,
      row_count: rows.length,
      execution_time: executionTime,
    };
  } catch (error) {
    // Enhanced error handling
    throw new Error(`Database query failed: ${error.message}`);
  }
}
```

## Usage Notes

This node executes in the browser.
Estimated execution time: 1000ms (depends on network and query complexity)
Memory usage: ~10MB

### Execution Policy

This skill uses the "standard" execution policy with the following limits:
- **Max Memory**: 512MB
- **Max Time**: 60 seconds
- **Network Access**: Allowed
- **MCP Access**: Allowed (restricted to declared servers)

### Example Workflow

**Simple Database Query:**
1. Use this node to query a database
2. Connect output to a "Data Visualization" node
3. Display results in a chart

**Data Pipeline:**
1. Query data from database (this node)
2. Process data with Python node
3. Store results back to database (another instance of this node with INSERT query)

**Multi-Database Join:**
1. Query table A from postgres-dev
2. Query table B from mysql-prod
3. Join results in a JavaScript processing node

### Security Notes

- MCP servers must be explicitly configured in settings
- Skills can only access servers listed in their `mcp_servers` declaration
- Execution policy enforces MCP access restrictions
- Authentication is handled at the MCP server level

### Example Queries

```sql
-- Fetch users
SELECT id, name, email FROM users LIMIT 10;

-- Aggregate data
SELECT department, COUNT(*) as count
FROM employees
GROUP BY department;

-- Join tables
SELECT o.id, o.total, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.created_at > '2024-01-01';
```

## Advanced Usage

### Custom MCP Servers

You can create custom MCP servers to expose any data source:
- Databases (PostgreSQL, MySQL, MongoDB, Redis)
- APIs (REST, GraphQL)
- File systems
- Cloud storage (S3, GCS)
- Custom services

### Error Handling

The skill automatically handles common errors:
- MCP server not configured
- Network timeouts
- SQL syntax errors
- Policy violations

### Performance Tips

1. Use LIMIT clauses to reduce data transfer
2. Index your database tables
3. Configure appropriate timeouts
4. Cache frequently accessed data

## Related Skills

- **data-analysis**: Process query results
- **csv-export**: Export results to CSV
- **visualization**: Create charts from data
