# Concept-to-Tool Mapping

This document maps LLMos conceptual operations to actual tool implementations, providing clear patterns for agents and developers.

---

## Overview

LLMos operates on high-level concepts (creating agents, querying memory, delegating tasks). These concepts are implemented using lower-level tools (write-file, read-file, execute-python, etc.).

This mapping ensures consistent implementation across the system.

---

## Agent Operations

### 1. Create a New Agent

**Concept**: Define a new specialized agent for a project

**Implementation**:
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/[project_name]/components/agents/[AgentName].md",
    "content": "---\nname: [AgentName]\ntype: specialist\ncapabilities:\n  - [cap1]\n  - [cap2]\ntools:\n  - [tool1]\n  - [tool2]\n---\n\n# [AgentName]\n\n[System prompt content...]"
  }
}
```

**Required Elements**:
- YAML frontmatter (name, type, capabilities, tools)
- System prompt with clear instructions
- Output format specification

**Example**:
```markdown
---
name: DataAnalyzerAgent
type: specialist
project: sales_analysis
capabilities:
  - statistical_analysis
  - data_visualization
tools:
  - execute-python
  - write-file
---

# DataAnalyzerAgent

You are a data analysis specialist focused on sales metrics...
```

---

### 2. Discover Available Agents

**Concept**: Find agents that can handle a task

**Implementation**:
```tool
{
  "tool": "discover-subagents",
  "inputs": {}
}
```

**Alternative (Manual)**:
```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "projects/[project_name]/components/agents"
  }
}
```

Then read each agent to check capabilities:
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "projects/[project]/components/agents/[AgentName].md"
  }
}
```

---

### 3. Delegate to an Agent

**Concept**: Execute a task using a specialized agent

**Implementation (with invoke-subagent)**:
```tool
{
  "tool": "invoke-subagent",
  "inputs": {
    "agentPath": "projects/[project]/components/agents/[AgentName].md",
    "agentName": "[AgentName]",
    "task": "[Brief task description]",
    "code": "[Python code to execute]",
    "projectPath": "projects/[project]"
  }
}
```

**Alternative (Manual Delegation)**:
1. Read the agent definition:
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "projects/[project]/components/agents/[AgentName].md"
  }
}
```

2. Execute code following agent's instructions:
```tool
{
  "tool": "execute-python",
  "inputs": {
    "code": "[code following agent's specification]",
    "projectPath": "projects/[project]"
  }
}
```

---

## Memory Operations

### 4. Log an Interaction (Create Trace)

**Concept**: Record an agent interaction for future learning

**Implementation**:
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/[project]/memory/short_term/[timestamp]_[agent]_[task].md",
    "content": "---\ntrace_id: [uuid]\ntimestamp: [ISO8601]\nagent_name: [name]\nstatus: [status]\n---\n\n# [Agent] - [Task]\n\n## Request\n[prompt]\n\n## Response\n[response]\n\n## Outputs\n- [file1]\n- [file2]"
  }
}
```

**Naming Convention**:
- Format: `YYYYMMDD_HHMMSS_[AgentName]_[TaskSummary].md`
- Example: `20240115_143022_DataAnalyzer_sales_metrics.md`

---

### 5. Query Memory

**Concept**: Search for relevant past experiences

**Implementation (3-step pattern)**:

**Step 1**: Find candidate files
```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "projects/[project]/memory/long_term"
  }
}
```

Or for global search:
```bash
Glob pattern="projects/*/memory/long_term/**/*.md"
```

**Step 2**: Search for keywords (using grep or similar)
```bash
Grep pattern="[keywords]" path="projects/" output_mode="files_with_matches"
```

**Step 3**: Read matching files
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "[matched_file_path]"
  }
}
```

---

### 6. Consolidate Memory

**Concept**: Transform short-term traces into long-term learnings

**Implementation**:

1. Read all short-term traces:
```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "projects/[project]/memory/short_term"
  }
}
```

2. Read each trace file:
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "projects/[project]/memory/short_term/[trace_file].md"
  }
}
```

3. Synthesize patterns (in your analysis)

4. Write consolidated learnings:
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/[project]/memory/long_term/project_learnings.md",
    "content": "[consolidated insights]"
  }
}
```

---

## Project Operations

### 7. Create Project Structure

**Concept**: Initialize a new project workspace

**Implementation**:
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/[project_name]/components/agents/.gitkeep",
    "content": ""
  }
}
```

Repeat for all directories:
- `projects/[name]/components/agents/.gitkeep`
- `projects/[name]/output/code/.gitkeep`
- `projects/[name]/output/visualizations/.gitkeep`
- `projects/[name]/memory/short_term/.gitkeep`
- `projects/[name]/memory/long_term/.gitkeep`
- `projects/[name]/applets/.gitkeep`

---

### 8. Validate Project Agents

**Concept**: Check that project meets 3-agent minimum

**Implementation**:
```tool
{
  "tool": "validate-project-agents",
  "inputs": {
    "projectPath": "projects/[project_name]",
    "userGoal": "[original user goal]"
  }
}
```

**Returns**:
- `isValid`: Boolean (>= 3 agents)
- `agentCount`: Number of agents
- `agents`: List with origin (copied/evolved/created)
- `recommendations`: Suggested agents if invalid

---

## Execution Operations

### 9. Execute Python Code

**Concept**: Run Python code with visualization support

**Implementation**:
```tool
{
  "tool": "execute-python",
  "inputs": {
    "code": "import numpy as np\nimport matplotlib.pyplot as plt\n...",
    "projectPath": "projects/[project_name]"
  }
}
```

**Returns**:
- `stdout`: Standard output
- `stderr`: Errors
- `images`: Base64 matplotlib plots
- `savedImages`: Paths to saved visualizations

---

### 10. Generate Interactive Applet

**Concept**: Create a live UI component

**Implementation**:
```tool
{
  "tool": "generate-applet",
  "inputs": {
    "name": "[Applet Name]",
    "description": "[Brief description]",
    "code": "function Applet() {\n  const [value, setValue] = useState(0);\n  return (\n    <div>...</div>\n  );\n}"
  }
}
```

**Code Requirements**:
- Use `function Applet() {}` syntax
- Can use React hooks (useState, useEffect, etc.)
- Can use Tailwind CSS
- NO imports/exports
- NO TypeScript annotations

---

## File Operations

### 11. Read a File

**Concept**: Get contents of a file

**Implementation**:
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "[absolute or relative path]"
  }
}
```

### 12. Write a File

**Concept**: Create or overwrite a file

**Implementation**:
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "[file path]",
    "content": "[file content]"
  }
}
```

### 13. List Directory Contents

**Concept**: See files in a directory

**Implementation**:
```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "[directory path]"
  }
}
```

---

## Common Patterns

### Pattern A: Agent Creation + Delegation

```javascript
// 1. Create agent
write-file("projects/X/components/agents/MyAgent.md", agent_spec)

// 2. Read agent for delegation
agent_def = read-file("projects/X/components/agents/MyAgent.md")

// 3. Delegate task using invoke-subagent
invoke-subagent({
  agentPath: "projects/X/components/agents/MyAgent.md",
  agentName: "MyAgent",
  task: "Analyze data",
  code: "..."
})

// 4. Log interaction
write-file("projects/X/memory/short_term/[timestamp]_MyAgent_task.md", log)
```

### Pattern B: Memory Query + Template Reuse

```javascript
// 1. Search for templates
files = Glob("projects/*/memory/long_term/agent_templates/*.md")
matches = Grep("data analysis", path)

// 2. Read best match
template = read-file(matches[0])

// 3. Adapt template
new_agent = adapt(template, current_needs)

// 4. Create new agent
write-file("projects/X/components/agents/AdaptedAgent.md", new_agent)
```

### Pattern C: Full Project Workflow

```javascript
// 1. Create structure
write-file("projects/X/components/agents/.gitkeep", "")
write-file("projects/X/output/.gitkeep", "")
write-file("projects/X/memory/short_term/.gitkeep", "")
write-file("projects/X/memory/long_term/.gitkeep", "")

// 2. Create agents (at least 3)
write-file("projects/X/components/agents/Agent1.md", spec1)
write-file("projects/X/components/agents/Agent2.md", spec2)
write-file("projects/X/components/agents/Agent3.md", spec3)

// 3. Execute with each agent
invoke-subagent(agent1, task1)
invoke-subagent(agent2, task2)
invoke-subagent(agent3, task3)

// 4. Log all interactions
write-file("projects/X/memory/short_term/[timestamp]_Agent1.md", log1)
write-file("projects/X/memory/short_term/[timestamp]_Agent2.md", log2)
write-file("projects/X/memory/short_term/[timestamp]_Agent3.md", log3)

// 5. Validate agents
validate-project-agents("projects/X")

// 6. Consolidate learnings
// Read all short_term logs
// Write project_learnings.md

// 7. Write README
write-file("projects/X/README.md", documentation)
```

---

## Tool Limitations

| Tool | Limitation | Workaround |
|------|------------|------------|
| `write-file` | Cannot create in non-existent dirs | Create .gitkeep files first |
| `execute-python` | 30s timeout | Break into smaller scripts |
| `generate-applet` | No TypeScript | Use plain JavaScript |
| `invoke-subagent` | One-shot (no follow-up) | Log results, create new call |

---

## Future Tool Extensions

As the system evolves, new mappings may be added for:
- Native semantic search
- Vector database queries
- Real-time collaboration
- External API integration
- Hardware device communication
