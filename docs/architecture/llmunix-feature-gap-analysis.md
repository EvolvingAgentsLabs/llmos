# LLMunix Feature Gap Analysis

**Last Updated:** January 2026

## Executive Summary

This document analyzes the llmunix Claude Code plugin to identify features that could enhance LLMos. While LLMos already has a richer feature set overall (more agents, hardware integration, GUI), llmunix has several elegant design patterns worth adopting.

**Bottom Line:** llmunix excels at **simplicity and self-documentation**. Its key innovations are formalized memory query interfaces, trace lifecycle management, and explicit tool mappings. llmos-lite should adopt these patterns while keeping its infrastructure advantages.

---

## Side-by-Side Comparison

### Component Inventory

| Component | llmunix | llmos-lite | Winner |
|-----------|---------|------------|--------|
| **Core Agents** | 3 | 11 | llmos-lite |
| **System Files** | 4 | 6 (kernel) | llmos-lite |
| **Memory Agents** | 2 (Analysis, Consolidation) | 2 (same) | Tie |
| **UI Agents** | 0 | 3 (UXDesigner, Applet*) | llmos-lite |
| **Planning Agents** | 0 (inline in SystemAgent) | 2 (Planning, ProjectPlanner) | llmos-lite |
| **Hardware Support** | 0 | 1 (HardwareControlAgent) | llmos-lite |
| **Slash Commands** | 1 (`/llmunix`) | 0 | llmunix |
| **Tool Mapping Docs** | 1 (ClaudeCodeToolMap) | 0 | llmunix |
| **Trace Lifecycle Docs** | 1 (MemoryTraceManager) | 0 | llmunix |
| **Query Interface Spec** | 1 (QueryMemoryTool) | 0 | llmunix |

### Agent Comparison

| llmunix Agent | llmos-lite Equivalent | Gap Analysis |
|---------------|----------------------|--------------|
| `SystemAgent.md` | `SystemAgent.md` | llmos-lite is **10x larger** (1400 vs ~100 lines) with more features |
| `MemoryAnalysisAgent.md` | `MemoryAnalysisAgent.md` | Similar purpose, llmos-lite has structured query format |
| `MemoryConsolidationAgent.md` | `MemoryConsolidationAgent.md` | Similar purpose, both produce learnings |
| *(none)* | `PlanningAgent.md` | llmos-lite has dedicated planning |
| *(none)* | `PatternMatcherAgent.md` | llmos-lite has pattern detection |
| *(none)* | `MutationAgent.md` | llmos-lite has code transformation |
| *(none)* | `LensSelectorAgent.md` | llmos-lite has perspective switching |
| *(none)* | `UXDesigner.md` | llmos-lite has UI generation |
| *(none)* | `AppletDebuggerAgent.md` | llmos-lite has self-healing applets |
| *(none)* | `ExecutionStrategyAgent.md` | llmos-lite has model-aware execution |
| *(none)* | `ProjectAgentPlanner.md` | llmos-lite has project planning |

---

## Features Missing from llmos-lite

### 1. Formalized QueryMemory Tool Specification

**llmunix Has:**
```markdown
# QueryMemoryTool.md

QueryMemory(
  query: string,
  memory_type: "agent_templates" | "workflow_patterns" | "domain_knowledge" | "all",
  project_context: string (optional)
)
```

**llmos-lite Gap:**
- Memory querying exists but is **not formally specified**
- No standardized query interface
- Ad-hoc implementation in Python code

**Recommendation:** Create `/public/system/kernel/query-memory-spec.md` with:
- Formal function signature
- Parameter types and options
- Return format specification
- Implementation mapping to Grep/Glob/Read

---

### 2. Trace Linking and Lifecycle Management

**llmunix Has (MemoryTraceManager.md):**
```yaml
trace_id: unique_identifier
parent_trace_id: optional_reference  # <-- Trace linking!
link_types:
  - Sequential: Task B follows Task A
  - Hierarchical: Task B is subtask of Task A
  - Dependency: Task B requires output from Task A
  - Parallel: Tasks execute concurrently
```

**llmos-lite Gap:**
- Traces are created but **not linked**
- No parent-child relationships
- No dependency tracking between traces
- No trace lifecycle (active → consolidated → archived)

**Recommendation:** Enhance memory-schema.md with:
```yaml
# Add to trace format
trace_id: string
parent_trace_id: optional string
link_type: "sequential" | "hierarchical" | "dependency" | "parallel"
lifecycle_state: "active" | "consolidated" | "archived"
```

---

### 3. Claude Code Tool Mapping Document

**llmunix Has (ClaudeCodeToolMap.md):**

| LLMunix Concept | Claude Code Implementation |
|-----------------|----------------------------|
| Agent Creation | `Write` to agents/*.md |
| Agent Delegation | `Read` agent + `Task` with prompt |
| Memory Logging | `Write` to short_term/*.md |
| Memory Query | `Glob` + `Grep` + `Read` |

**llmos-lite Gap:**
- tool-registry.md documents tools but **not the conceptual mapping**
- No "how to implement X using Y" documentation
- Developers must infer patterns

**Recommendation:** Create `/public/system/kernel/concept-to-tool-map.md`:
```markdown
# Concept-to-Tool Mapping

## Create a New Agent
**Concept**: Define a new specialized agent
**Implementation**:
1. Write(path="projects/X/components/agents/Y.md", content=...)
2. Include YAML frontmatter + system prompt

## Query Past Experiences
**Concept**: Find relevant learnings
**Implementation**:
1. Glob(pattern="projects/*/memory/long_term/**/*.md")
2. Grep(pattern="keywords", output_mode="files_with_matches")
3. Read(matching files)
4. Synthesize results
```

---

### 4. Single-Command Entry Point (`/llmunix`)

**llmunix Has:**
```bash
/llmunix "Build a quantum computing solution for..."
```
A single slash command that:
1. Analyzes the goal
2. Creates project structure
3. Dynamically creates agents
4. Orchestrates execution
5. Consolidates learnings

**llmos-lite Gap:**
- No equivalent slash command
- SystemAgent is invoked through API
- No "one command does everything" experience

**Recommendation:** Create a slash command (if using Claude Code plugin system):
```markdown
# commands/llmos.md
---
description: Execute a goal using the LLMos multi-agent system
args:
  - name: goal
    type: string
    required: true
---
You are the SystemAgent orchestrator. Your goal is: {{.Args}}
[Include full SystemAgent prompt...]
```

---

### 5. Cross-Project Learning Queries

**llmunix Has:**
```
Glob(pattern="projects/*/memory/long_term/**/*.md")
```
Explicitly queries learnings from **all past projects**, not just the current one.

**llmos-lite Gap:**
- Memory queries are scoped to current project
- No formal mechanism for cross-project knowledge sharing
- Evolution system promotes skills but not agent templates

**Recommendation:** Add to memory-schema.md:
```markdown
## Cross-Project Queries

### Global Memory Locations
- `/system/memory_log.md` - System-wide experience log
- `projects/*/memory/long_term/` - All project learnings (queryable)

### Query Scope Options
- `project`: Current project only
- `global`: All projects
- `similar`: Projects with matching domain keywords
```

---

### 6. Trace Archival Strategy

**llmunix Has:**
```markdown
## Phase 3: Archival (Optional)
- Short_term traces moved to archive
- Long_term learnings remain accessible
- Archive available for deep historical analysis
- Reduces active memory footprint
```

**llmos-lite Gap:**
- Short-term memory retention mentioned (24 hours)
- No explicit archival mechanism
- No cold storage concept

**Recommendation:** Add to memory-schema.md:
```markdown
## Memory Archival

### Archive Location
`projects/[name]/memory/archive/`

### Archival Trigger
- After consolidation complete
- After project marked complete
- After 7 days of inactivity

### Archive Format
- Compressed trace bundles
- Indexed by date range
- Searchable via Grep with expanded path
```

---

### 7. Agent Template Versioning

**llmunix Has:**
```markdown
# Template Metadata
created_from: Project_quantum_navigation
reusability: high
version: 1.0
```

**llmos-lite Gap:**
- Skills have `created_at` timestamp
- Agents don't have version tracking
- No evolution history for templates

**Recommendation:** Add versioning to agent frontmatter:
```yaml
---
name: AnalyzerAgent
version: "1.2"
evolved_from: "system/agents/PatternMatcherAgent.md"
evolution_history:
  - "1.0": "Initial creation"
  - "1.1": "Added FFT analysis capability"
  - "1.2": "Improved error handling"
---
```

---

## Features llmos-lite Has That llmunix Lacks

### 1. Generative UI (Applets)
llmunix produces markdown and code files. LLMos can generate **live interactive React components** that run in the browser.

### 2. Model-Aware Execution
LLMos adapts its strategy based on the LLM model using OpenAI-compatible APIs:
- Claude: Native markdown agents
- GPT-4: Compiled agents
- Gemini: Optimized prompts
- Smaller models: Simplified prompts

llmunix assumes Claude Code only.

### 3. Hardware Integration
LLMos has:
- ESP32 microcontroller support
- WASM-based robot firmware
- Web Serial API for device communication

llmunix has no hardware concepts.

### 4. 3-Agent Minimum Requirement
LLMos enforces that every project must have at least 3 agents (copied, evolved, or created). This ensures complexity is properly decomposed.

### 5. WASM/Pyodide Runtime
LLMos can execute Python in the browser via Pyodide. llmunix relies on Claude Code's Bash tool.

### 6. Git-Backed Volumes
LLMos has version control built into the storage layer:
- Automatic commits on skill creation
- Branch-based collaboration
- Skill promotion across volumes

### 7. Self-Healing Applets
LLMos validates applet code before deployment and retries up to 3 times with fixes.

---

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| QueryMemory Tool Spec | High | Low | **P1** |
| Trace Linking | High | Medium | **P1** |
| Concept-to-Tool Map | Medium | Low | **P2** |
| Cross-Project Queries | High | Medium | **P2** |
| `/llmos` Slash Command | Medium | Low | **P2** |
| Trace Archival | Low | Medium | **P3** |
| Agent Template Versioning | Low | Low | **P3** |

---

## Recommended Implementation Plan

### Phase 1: Documentation (Low Effort, High Value)

1. **Create `/system/kernel/query-memory-spec.md`**
   - Formalize the query interface
   - Document parameter options
   - Show implementation patterns

2. **Create `/system/kernel/concept-to-tool-map.md`**
   - Map llmos-lite concepts to actual tools
   - Provide copy-paste implementation patterns
   - Similar to llmunix's ClaudeCodeToolMap.md

3. **Enhance `memory-schema.md`**
   - Add trace linking specification
   - Add archival strategy
   - Add cross-project query patterns

### Phase 2: Trace Enhancements (Medium Effort)

1. **Update trace format in TypeScript**
   - Add `parent_trace_id` to ExecutionTrace interface
   - Add `link_type` field
   - Track trace lifecycle state

2. **Implement trace linking in orchestrator**
   - When delegating to sub-agents, pass parent trace ID
   - Record dependency relationships

### Phase 3: Cross-Project Features (Higher Effort)

1. **Global memory index**
   - Index all project learnings for fast search
   - Implement cross-project query in MemoryAnalysisAgent

2. **Agent template versioning**
   - Track evolution history
   - Enable template comparisons

---

## Conclusion

llmunix's strength is its **elegant simplicity** and **self-documentation**. The core innovations to adopt are:

1. **Formalized query interfaces** - Makes the system predictable
2. **Trace linking** - Enables execution flow reconstruction
3. **Tool mapping documentation** - Reduces implementation guesswork
4. **Cross-project learning** - Leverages the full knowledge base

llmos-lite already surpasses llmunix in:
- Agent variety and specialization
- UI capabilities (applets)
- Hardware integration
- Model flexibility
- Execution runtime (Pyodide)

The recommended approach: **Adopt llmunix's documentation patterns while keeping LLMos's infrastructure advantages.**
