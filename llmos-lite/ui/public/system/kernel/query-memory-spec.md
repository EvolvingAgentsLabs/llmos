# QueryMemory Tool Specification

This document formalizes the memory query interface for LLMos, enabling consistent and predictable memory retrieval across all agents.

---

## Function Signature

```typescript
QueryMemory(
  query: string,
  options?: QueryOptions
): Promise<QueryResult>

interface QueryOptions {
  memory_type?: "agent_templates" | "workflow_patterns" | "domain_knowledge" | "skills" | "traces" | "all";
  scope?: "project" | "global" | "similar";
  project_context?: string;
  time_range?: {
    from?: string;  // ISO 8601
    to?: string;    // ISO 8601
  };
  limit?: number;
  min_relevance?: number;  // 0.0 - 1.0
}

interface QueryResult {
  matches: MemoryMatch[];
  query_summary: string;
  total_searched: number;
  search_time_ms: number;
}

interface MemoryMatch {
  path: string;
  relevance: number;
  type: string;
  excerpt: string;
  metadata: Record<string, any>;
}
```

---

## Parameters

### query (required)
Natural language description of what to find.

**Examples:**
- `"Agent designs for mathematical analysis tasks"`
- `"Workflow patterns for quantum computing projects"`
- `"Successful strategies for multi-agent coordination"`
- `"Skills related to signal processing"`

### memory_type (optional, default: "all")
Scope of search within memory.

| Value | Description | Locations Searched |
|-------|-------------|-------------------|
| `agent_templates` | Reusable agent designs | `projects/*/memory/long_term/agent_templates/` |
| `workflow_patterns` | Task decomposition patterns | `projects/*/memory/long_term/workflow_patterns/` |
| `domain_knowledge` | Domain-specific insights | `projects/*/memory/long_term/domain_knowledge/` |
| `skills` | Auto-evolved skills | `volumes/*/skills/` |
| `traces` | Raw execution traces | `projects/*/memory/short_term/` |
| `all` | Search all memory types | All above locations |

### scope (optional, default: "project")
Breadth of search.

| Value | Description |
|-------|-------------|
| `project` | Current project only |
| `global` | All projects and system memory |
| `similar` | Projects with matching domain keywords |

### project_context (optional)
Current project description to improve relevance ranking.

### time_range (optional)
Filter results by creation/modification date.

### limit (optional, default: 10)
Maximum number of matches to return.

### min_relevance (optional, default: 0.3)
Minimum relevance score (0.0 - 1.0) for inclusion in results.

---

## Implementation Mapping

QueryMemory is implemented using Claude Code / LLMos tools:

### Step 1: Determine Search Locations

```javascript
function getSearchPaths(options) {
  const paths = [];

  if (options.scope === "project") {
    paths.push(`projects/${currentProject}/memory/`);
  } else if (options.scope === "global") {
    paths.push("projects/*/memory/");
    paths.push("system/memory_log.md");
    paths.push("volumes/*/skills/");
  }

  return paths;
}
```

### Step 2: Find Candidate Files

```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "[search_path]"
  }
}
```

Or using Glob patterns:
```bash
Glob pattern="projects/*/memory/long_term/**/*.md"
```

### Step 3: Search for Keywords

```tool
{
  "tool": "grep",
  "inputs": {
    "pattern": "[query_keywords]",
    "path": "[search_paths]",
    "output_mode": "files_with_matches"
  }
}
```

### Step 4: Read Matching Files

```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "[matched_file]"
  }
}
```

### Step 5: Rank by Relevance

Apply relevance scoring:
- Keyword frequency
- Recency (newer = higher)
- Success rate (if applicable)
- Project similarity (if scope = "similar")

### Step 6: Synthesize Results

Return structured QueryResult with matches, excerpts, and metadata.

---

## Usage Examples

### Example 1: Find Agent Templates

```json
{
  "query": "Agent for FFT signal analysis",
  "memory_type": "agent_templates",
  "scope": "global",
  "min_relevance": 0.5
}
```

**Returns:**
```json
{
  "matches": [
    {
      "path": "projects/signal_analyzer/memory/long_term/agent_templates/SignalProcessorAgent.md",
      "relevance": 0.87,
      "type": "agent_template",
      "excerpt": "# SignalProcessorAgent\nSpecialized in FFT and spectral analysis...",
      "metadata": {
        "created_from": "project_signal_analyzer",
        "success_rate": 0.95,
        "usage_count": 12
      }
    }
  ],
  "query_summary": "Found 1 agent template matching FFT signal analysis",
  "total_searched": 24,
  "search_time_ms": 145
}
```

### Example 2: Find Workflow Patterns

```json
{
  "query": "Multi-agent coordination for data pipelines",
  "memory_type": "workflow_patterns",
  "scope": "similar",
  "project_context": "Building a data processing pipeline"
}
```

### Example 3: Search Skills

```json
{
  "query": "Python visualization with matplotlib",
  "memory_type": "skills",
  "scope": "global",
  "limit": 5
}
```

### Example 4: Recent Traces

```json
{
  "query": "execution errors",
  "memory_type": "traces",
  "scope": "project",
  "time_range": {
    "from": "2024-01-01T00:00:00Z"
  }
}
```

---

## Integration with Core Agents

### MemoryAnalysisAgent

Uses QueryMemory to:
- Find relevant past experiences during planning
- Identify patterns across historical executions
- Provide evidence-based recommendations

```markdown
## Query Example in Agent Prompt

Before creating a new agent, query memory:

1. QueryMemory("agent for [domain]", {memory_type: "agent_templates", scope: "global"})
2. If relevant templates found → adapt template
3. If no templates found → create from scratch
```

### SystemAgent

Uses QueryMemory during Phase 1 (Memory Consultation):

```markdown
## Memory Consultation Protocol

1. Extract domain keywords from user goal
2. QueryMemory(goal, {scope: "global", memory_type: "all"})
3. Apply insights from matches to planning phase
```

### MemoryConsolidationAgent

Creates queryable artifacts that are indexed for future searches:

```markdown
## Artifact Indexing

When creating long_term artifacts:
1. Include searchable keywords in content
2. Add structured metadata for filtering
3. Organize by type for type-filtered queries
```

---

## Return Format Details

### MemoryMatch Fields

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Absolute path to the matched file |
| `relevance` | number | Relevance score (0.0 - 1.0) |
| `type` | string | Memory type (agent_template, skill, trace, etc.) |
| `excerpt` | string | Relevant excerpt from the file (max 500 chars) |
| `metadata` | object | Extracted metadata from file frontmatter |

### Metadata Fields (Common)

| Field | Description |
|-------|-------------|
| `created_at` | ISO 8601 timestamp |
| `project` | Source project name |
| `success_rate` | Historical success rate (if applicable) |
| `usage_count` | Number of times this artifact was used |
| `keywords` | List of searchable keywords |
| `category` | Classification (coding, analysis, etc.) |

---

## Best Practices

### Query Formulation

- **Be specific**: "Agent for FFT analysis" > "signal processing"
- **Include domain**: "quantum computing" > "computation"
- **Specify format**: "workflow pattern for data pipeline" > "pipeline"

### Scope Selection

- Use `project` for context-specific queries
- Use `global` for broad pattern searches
- Use `similar` when looking for related domain knowledge

### Handling No Results

```markdown
## No Results Protocol

If QueryMemory returns 0 matches:
1. Broaden the query (remove specific terms)
2. Change scope from "project" to "global"
3. Change memory_type from specific to "all"
4. If still no results → create from scratch and log for future
```

### Performance Optimization

- Limit results to needed count
- Use appropriate scope (narrower = faster)
- Cache frequently-accessed templates
- Index files by keywords for faster Grep

---

## Future Enhancements

- **Semantic search**: LLM-powered similarity matching
- **Vector embeddings**: For conceptual similarity beyond keywords
- **Auto-suggestions**: Recommend related queries
- **Query history**: Track what queries were successful
- **Federation**: Query across distributed LLMos instances
