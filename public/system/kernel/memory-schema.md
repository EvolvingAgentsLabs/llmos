# Memory Schema

This document defines how LLMos structures and queries memories.

---

## Memory Philosophy

> "Memory is not storage. Memory is retrieval capability."

The memory system:
1. Records every significant execution
2. Enables semantic similarity search
3. Informs future decisions
4. Consolidates learnings over time

---

## Memory Types

### Short-Term Memory
- **Location**: `projects/*/memory/short_term/`
- **Duration**: Current session + recent tasks
- **Format**: Execution logs, tool results
- **Purpose**: Immediate context

### Long-Term Memory
- **Location**: `projects/*/memory/long_term/`
- **Duration**: Permanent until pruned
- **Format**: Consolidated learnings
- **Purpose**: Pattern recognition, skill generation

### System Memory
- **Location**: `/system/memory_log.md`
- **Scope**: Cross-project, cross-user
- **Format**: Chronological experience log
- **Purpose**: Global learning

---

## Execution Trace Schema

Each execution creates a trace:

```yaml
---
trace_id: trace-{timestamp}-{random}
timestamp: "2024-01-01T12:00:00.000Z"
goal: "Original user request"
status: success|failure
duration_ms: 12345
tools_used:
  - tool_name_1
  - tool_name_2
files_created:
  - path/to/file1.py
  - path/to/file2.md
---

# Execution Trace: {goal}

## Plan
{execution plan details}

## Steps Executed
1. {step 1} - {status}
2. {step 2} - {status}

## Results
{key outcomes and metrics}

## Learnings
- {what worked}
- {what to improve}
```

---

## Memory Log Entry Schema

Entries in `/system/memory_log.md`:

```yaml
---
experience_id: exp_{auto_increment}
project_name: {project}
primary_goal: {goal}
final_outcome: success|failure|success_with_recovery
components_used:
  - {agent 1}
  - {agent 2}
  - {tool 1}
files_created: {count}
output_summary: {brief description}
execution_time_ms: {duration}
learnings_or_issues: |
  {multiline learnings}
timestamp: "2024-01-01T12:00:00.000Z"
---
```

---

## Memory Query Protocol

### Similarity Search
When querying memory for similar tasks:

1. **Normalize the query** (lowercase, remove punctuation)
2. **Compute embedding** (if vector store available)
3. **Search with parameters**:
   - `limit`: Maximum results (default: 3)
   - `min_similarity`: Minimum match score (default: 0.3)
   - `time_window`: Optional date range filter

### Query Response
```typescript
interface PatternMatch {
  goal: string;           // Original goal
  similarity: number;     // 0.0 - 1.0
  suggestedApproach?: string;
  toolsUsed: string[];
  success: boolean;
  traceId: string;
}
```

---

## Memory Consolidation

### When to Consolidate
- After 10+ traces in short-term memory
- Weekly scheduled consolidation
- Before project archival

### Consolidation Process
1. Read all traces from short-term memory
2. Group by goal similarity
3. Extract common patterns
4. Generate consolidated learning
5. Move to long-term memory
6. Optionally generate skills

### Consolidated Learning Format
```markdown
# Learning: {pattern name}

## Context
- Observed in {count} executions
- Success rate: {rate}%
- Common tools: {tools}

## Key Insights
1. {insight 1}
2. {insight 2}

## Recommended Approach
{step-by-step guidance}

## Anti-Patterns
- {what to avoid}
```

---

## Project Memory Structure

Each project has this memory layout:

```
projects/{name}/
├── memory/
│   ├── short_term/
│   │   ├── execution_log.md     # Current session log
│   │   ├── tool_results/        # Raw tool outputs
│   │   └── context_cache.md     # Working memory
│   └── long_term/
│       ├── learnings.md         # Consolidated insights
│       ├── patterns.md          # Detected patterns
│       └── decisions.md         # Key decision rationales
└── context.md                   # Project-level context
```

---

## Memory Retention Policy

### Short-Term
- Keep for current session
- Prune after 24 hours of inactivity
- Archive if project is reopened

### Long-Term
- Keep permanently unless manually deleted
- Consolidate after 6 months
- Compress after 1 year

### System Memory
- Keep last 1000 entries
- Archive older entries to cold storage
- Never delete (regulatory compliance)

---

## Privacy Considerations

### What NOT to Store
- Credentials and API keys
- Personal identifying information (PII)
- Sensitive business data
- Raw user input (summarize instead)

### Anonymization
- Replace user names with IDs
- Hash sensitive patterns
- Aggregate metrics where possible

---

## Memory-Aware Planning

When creating plans, the orchestrator should:

1. **Query memory FIRST** - Before any other action
2. **Extract patterns** - What worked before?
3. **Avoid anti-patterns** - What failed before?
4. **Reference learnings** - Cite relevant experiences
5. **Update memory** - Record new learnings
