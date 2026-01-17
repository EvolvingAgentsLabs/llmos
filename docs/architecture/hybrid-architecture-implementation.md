# Hybrid Architecture Implementation Guide

**Last Updated:** January 2026

## Overview

This guide provides actionable steps to transform LLMos into a hybrid OS that combines:
- **LLMos infrastructure**: React UI, Pyodide, hardware integration, Vercel deployment
- **llmunix philosophy**: Pure markdown agents, dynamic creation, self-modifying kernel

**Note**: LLM integration now supports OpenAI-compatible APIs (OpenRouter, Gemini, OpenAI) configurable via settings for maximum flexibility.

---

## The Core Transformation

### Before: Code-Defined Agents
```python
# backend/agents.py
class DataAnalyzerAgent:
    def __init__(self):
        self.tools = ['execute-python', 'write-file']

    async def analyze(self, data: str) -> str:
        # 100 lines of hardcoded logic
        ...
```

**Problem**: To add/modify an agent, you must:
1. Edit Python code
2. Update type definitions
3. Rebuild the application
4. Redeploy to production

### After: Text-Defined Agents
```markdown
# projects/X/agents/DataAnalyzerAgent.md
---
name: DataAnalyzerAgent
type: specialist
capabilities:
  - data_analysis
  - pattern_detection
tools:
  - execute-python
  - write-file
---

# DataAnalyzerAgent

You analyze data and detect patterns...

## Task
Given data, perform statistical analysis...

## Output
Return insights in structured format...
```

**Solution**: To add/modify an agent, you simply:
1. Write/edit a markdown file

That's it. The change is instant.

---

## Implementation Steps

### Step 1: Create the Markdown Executor (Python Backend)

Replace complex orchestration logic with a simple "dumb executor":

```python
# backend/executor.py

import yaml
import re
from pathlib import Path

class MarkdownExecutor:
    """
    Simple executor that follows markdown agent instructions.
    Replaces complex Python agent classes.
    """

    def __init__(self, llm_client):
        self.llm = llm_client

    async def execute(self, agent_path: str, task: str, context: dict = None):
        """Execute a markdown agent."""

        # 1. Read the agent file
        agent_content = Path(agent_path).read_text()

        # 2. Parse frontmatter and system prompt
        frontmatter, system_prompt = self._parse_agent(agent_content)

        # 3. Build the full prompt
        full_prompt = self._build_prompt(system_prompt, task, context)

        # 4. Execute with LLM
        result = await self.llm.complete(
            system=system_prompt,
            user=task,
            tools=frontmatter.get('tools', [])
        )

        return result

    def _parse_agent(self, content: str):
        """Parse YAML frontmatter from markdown."""
        pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
        match = re.match(pattern, content, re.DOTALL)

        if match:
            frontmatter = yaml.safe_load(match.group(1))
            system_prompt = match.group(2)
        else:
            frontmatter = {}
            system_prompt = content

        return frontmatter, system_prompt

    def _build_prompt(self, system_prompt, task, context):
        """Combine system prompt with task and context."""
        if context:
            context_str = "\n\n## Context\n" + yaml.dump(context)
            return system_prompt + context_str
        return system_prompt
```

### Step 2: Simplify the API Layer

Update `api/chat.py` to use the executor:

```python
# api/chat.py (SIMPLIFIED)

from core.executor import MarkdownExecutor
from glob import glob

executor = MarkdownExecutor(llm_client)

@app.post("/chat")
async def chat(request: ChatRequest):
    # 1. Discover available agents
    agents = glob("**/agents/*.md", recursive=True)

    # 2. Select best agent for task (could use LLM for this)
    best_agent = await select_agent(agents, request.message)

    # 3. Execute the markdown agent
    result = await executor.execute(
        agent_path=best_agent,
        task=request.message,
        context={"project": request.project}
    )

    # 4. Log the trace
    await log_trace(request.message, result, best_agent)

    return {"response": result}

async def select_agent(agents: list, task: str) -> str:
    """Select the most appropriate agent for a task."""
    # Simple keyword matching or LLM-based selection
    for agent_path in agents:
        content = Path(agent_path).read_text()
        # Parse capabilities and match to task
        ...
    return agents[0]  # Fallback to first agent
```

### Step 3: Enable Dynamic Agent Discovery

Create a discovery service:

```python
# core/discovery.py

from pathlib import Path
from glob import glob
import yaml

class AgentDiscovery:
    """Discovers and indexes markdown agents."""

    def __init__(self, base_paths: list):
        self.base_paths = base_paths
        self._cache = {}

    def discover_all(self) -> list:
        """Find all markdown agents."""
        agents = []
        for base_path in self.base_paths:
            for pattern in ["**/agents/*.md", "**/components/agents/*.md"]:
                full_pattern = f"{base_path}/{pattern}"
                agents.extend(glob(full_pattern, recursive=True))
        return agents

    def get_agent_metadata(self, path: str) -> dict:
        """Extract metadata from agent frontmatter."""
        if path in self._cache:
            return self._cache[path]

        content = Path(path).read_text()
        pattern = r'^---\s*\n(.*?)\n---'
        match = re.match(pattern, content, re.DOTALL)

        if match:
            metadata = yaml.safe_load(match.group(1))
            metadata['path'] = path
            self._cache[path] = metadata
            return metadata

        return {'path': path, 'name': Path(path).stem}

    def find_by_capability(self, capability: str) -> list:
        """Find agents with a specific capability."""
        all_agents = self.discover_all()
        matches = []

        for agent_path in all_agents:
            metadata = self.get_agent_metadata(agent_path)
            capabilities = metadata.get('capabilities', [])
            if capability in capabilities:
                matches.append(metadata)

        return matches
```

### Step 4: Implement Self-Evolution

Allow the system to create and modify its own agents:

```python
# core/evolution.py (ENHANCED)

class SelfEvolution:
    """Enables the system to modify its own agents."""

    def __init__(self, executor: MarkdownExecutor):
        self.executor = executor

    async def create_agent(self, name: str, purpose: str, project: str):
        """Create a new agent based on purpose description."""

        # Use the system agent to generate agent definition
        prompt = f"""Create a specialized agent for: {purpose}

Output the complete agent definition in markdown format with:
- YAML frontmatter (name, type, capabilities, tools)
- System prompt explaining the agent's role
- Task description
- Output requirements

Respond ONLY with the markdown content, no explanations."""

        result = await self.executor.execute(
            agent_path="system/agents/SystemAgent.md",
            task=prompt
        )

        # Save the new agent
        agent_path = f"projects/{project}/agents/{name}.md"
        Path(agent_path).parent.mkdir(parents=True, exist_ok=True)
        Path(agent_path).write_text(result)

        return agent_path

    async def evolve_agent(self, agent_path: str, improvements: str):
        """Modify an existing agent based on feedback."""

        current_content = Path(agent_path).read_text()

        prompt = f"""Improve this agent based on feedback:

Current Agent:
{current_content}

Improvements Requested:
{improvements}

Output the complete improved agent definition.
Preserve the original structure but enhance capabilities."""

        result = await self.executor.execute(
            agent_path="system/agents/MutationAgent.md",
            task=prompt
        )

        # Save the evolved agent
        Path(agent_path).write_text(result)
        return agent_path
```

### Step 5: Update the Frontend

Modify the React UI to work with dynamic agents:

```typescript
// ui/lib/agents/dynamic-loader.ts

export async function loadDynamicAgent(agentPath: string): Promise<Agent> {
  const response = await fetch(`/api/agents/read?path=${agentPath}`);
  const { content, metadata } = await response.json();

  return {
    name: metadata.name,
    type: metadata.type,
    capabilities: metadata.capabilities || [],
    systemPrompt: content,
    path: agentPath,
    origin: metadata.origin || 'dynamic'
  };
}

export async function discoverAgents(project?: string): Promise<Agent[]> {
  const response = await fetch(`/api/agents/discover${project ? `?project=${project}` : ''}`);
  const { agents } = await response.json();

  return Promise.all(agents.map(loadDynamicAgent));
}

export async function createAgent(
  name: string,
  purpose: string,
  project: string
): Promise<Agent> {
  const response = await fetch('/api/agents/create', {
    method: 'POST',
    body: JSON.stringify({ name, purpose, project })
  });

  const { agentPath } = await response.json();
  return loadDynamicAgent(agentPath);
}
```

---

## Migration Checklist

### Phase 1: Documentation (Complete)
- [x] Create OS Architecture Comparison document
- [x] Create concept-to-tool-map.md
- [x] Create trace-linking.md specification
- [x] Create query-memory-spec.md interface
- [x] Create /llmos slash command
- [x] Update kernel config for dynamic agents

### Phase 2: Backend Simplification
- [ ] Create `core/executor.py` - Markdown executor
- [ ] Create `core/discovery.py` - Agent discovery service
- [ ] Simplify `api/chat.py` - Use executor
- [ ] Update `core/evolution.py` - Enable self-modification

### Phase 3: Frontend Updates
- [ ] Add `dynamic-loader.ts` - Load agents from filesystem
- [ ] Update agent components to use dynamic loading
- [ ] Add agent creation UI (optional)

### Phase 4: Testing & Validation
- [ ] Test dynamic agent creation
- [ ] Test agent modification
- [ ] Test trace linking
- [ ] Test memory queries
- [ ] Validate 3-agent minimum

---

## Example Workflow

### Creating a New Capability (Before Hybrid)

```
1. Developer writes Python class in core/agents.py
2. Developer updates TypeScript types
3. Developer updates API endpoints
4. CI/CD builds the application
5. Application is deployed
6. Capability is now available
```

**Time: Hours to days**

### Creating a New Capability (After Hybrid)

```
1. System writes markdown file to agents/NewAgent.md
   (or user creates via UI)
2. Capability is immediately available
```

**Time: Seconds**

---

## Key Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Agent Creation** | Code + Deploy | Write markdown |
| **Time to New Capability** | Hours | Seconds |
| **Who Can Create Agents** | Developers | AI + Users |
| **Self-Improvement** | Impossible | Native |
| **Auditability** | Code diffs | Markdown diffs |
| **Rollback** | Git revert + redeploy | Git revert |

---

## Compatibility Notes

### What's Preserved
- React UI and components
- Pyodide WASM runtime
- Hardware integration (ESP32, Quantum)
- Vercel deployment infrastructure
- Git-backed volumes
- Self-healing applets

### What Changes
- Python becomes executor, not orchestrator
- Agents are discovered, not registered
- Evolution happens via text editing
- LLM follows markdown instructions

---

## Conclusion

The hybrid architecture transforms llmos-lite from a code-defined system to a text-defined system while preserving all infrastructure advantages. The key insight is:

> **The system can evolve its own architecture by editing text files.**

This enables true autonomy where the AI can:
1. Create new agents by writing markdown
2. Modify agents by editing markdown
3. Learn patterns by writing to memory
4. Consolidate knowledge by creating skills

All without any code changes or deployments.
