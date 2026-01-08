# LLMos System Command

Execute LLMos system operations within the current session.

## Usage

```
/llmos <operation> [arguments]
```

## Operations

### Memory Operations

**Query Memory**
```
/llmos query "<search_query>" [--type <memory_type>] [--scope <scope>]
```
- `--type`: agent_templates, workflow_patterns, domain_knowledge, skills, traces, all (default: all)
- `--scope`: project, global, similar (default: project)

Example: `/llmos query "FFT signal processing" --type workflow_patterns --scope global`

**Build Trace Graph**
```
/llmos trace-graph <root_trace_id>
```
Visualize execution flow from a root trace.

**Archive Traces**
```
/llmos archive [--days <n>] [--project <name>]
```
Archive traces older than N days (default: 7).

### Agent Operations

**List Agents**
```
/llmos agents [--type <core|dynamic|system>]
```
List available agents with their capabilities.

**Spawn Agent**
```
/llmos spawn <agent_name> "<task>"
```
Spawn an agent to execute a task.

**Evolve Agent**
```
/llmos evolve <agent_name> "<improvement>"
```
Create an evolved version of an agent.

### Project Operations

**Initialize Project**
```
/llmos init <project_name> [--description "<desc>"]
```
Create a new LLMos project with memory structure.

**Project Status**
```
/llmos status [--project <name>]
```
Show project status, active traces, and memory usage.

### Skill Operations

**List Skills**
```
/llmos skills [--volume <name>]
```
List evolved skills in volumes.

**Export Skill**
```
/llmos export-skill <skill_name> [--to <path>]
```
Export a skill for reuse.

### System Operations

**Consolidate Memory**
```
/llmos consolidate [--project <name>]
```
Trigger memory consolidation for a project.

**System Info**
```
/llmos info
```
Display LLMos system information and configuration.

---

## Implementation

When the user runs `/llmos <operation>`, execute the appropriate tool:

### Query Memory
```tool
{
  "tool": "query_memory",
  "inputs": {
    "query": "<search_query>",
    "memory_type": "<type>",
    "scope": "<scope>",
    "limit": 10,
    "min_relevance": 0.3
  }
}
```

### Build Trace Graph
```tool
{
  "tool": "build_trace_graph",
  "inputs": {
    "root_trace_id": "<trace_id>"
  }
}
```

### Archive Traces
```tool
{
  "tool": "archive_traces",
  "inputs": {
    "older_than_days": <days>,
    "project": "<project_name>"
  }
}
```

### List Agents
Read and list from: `public/system/agents/*.md`
Filter by type if specified.

### Spawn Agent
Use the agentic orchestrator to spawn the agent with the given task.

### Initialize Project
Create project structure:
```
projects/<name>/
  memory/
    short_term/
    long_term/
      agent_templates/
      workflow_patterns/
      domain_knowledge/
  outputs/
  config.yaml
```

### System Info
Read and display:
- `public/system/kernel/config.md`
- `public/system/kernel/tool-registry.md`
- Current project state

---

## Examples

```bash
# Query for data processing patterns across all projects
/llmos query "data pipeline optimization" --scope global

# View trace execution flow
/llmos trace-graph trace-20240115-142800-xyz789

# List all core agents
/llmos agents --type core

# Initialize a new machine learning project
/llmos init ml_experiment --description "Neural network training experiments"

# Archive old traces
/llmos archive --days 14 --project my_project

# Get system status
/llmos status
```
