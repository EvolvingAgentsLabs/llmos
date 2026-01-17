# Trace Linking Specification

This document defines how execution traces are linked together to enable workflow reconstruction, dependency tracking, and pattern analysis.

---

## Overview

Trace linking creates relationships between memory traces, enabling:
- Reconstruction of execution flows
- Dependency analysis between tasks
- Pattern detection across related traces
- Debugging of multi-agent workflows

---

## Link Types

### 1. Sequential
Task B follows Task A in execution order.

```
Task A ──────► Task B ──────► Task C
         (next)        (next)
```

**Metadata**:
```yaml
trace_id: trace_002
previous_trace_id: trace_001
link_type: sequential
```

### 2. Hierarchical
Task B is a subtask of Task A.

```
Task A (parent)
├── Task B (child)
├── Task C (child)
└── Task D (child)
```

**Metadata**:
```yaml
trace_id: trace_002
parent_trace_id: trace_001
link_type: hierarchical
depth: 1
```

### 3. Dependency
Task B requires output from Task A.

```
Task A ──────► Task B
       (requires output)
```

**Metadata**:
```yaml
trace_id: trace_002
depends_on:
  - trace_id: trace_001
    output_file: output/data.json
link_type: dependency
```

### 4. Parallel
Tasks execute concurrently under the same parent.

```
         ┌──► Task B
Task A ──┼──► Task C
         └──► Task D
         (parallel)
```

**Metadata**:
```yaml
trace_id: trace_002
parent_trace_id: trace_001
link_type: parallel
sibling_traces:
  - trace_003
  - trace_004
```

---

## Enhanced Trace Format

### Standard Trace with Linking

```yaml
---
# Core Identity
trace_id: trace-20240115-143022-abc123
timestamp: 2024-01-15T14:30:22.000Z
project: signal_analysis

# Agent Information
agent_name: SignalProcessorAgent
agent_type: dynamic
agent_path: projects/signal_analysis/components/agents/SignalProcessorAgent.md

# Task Information
task: "Apply FFT to audio signal"
task_category: signal_processing
status: completed

# Trace Linking
parent_trace_id: trace-20240115-142800-xyz789
link_type: hierarchical
depth: 1
depends_on:
  - trace_id: trace-20240115-143000-def456
    output_file: output/audio_data.npy
    dependency_type: data

# Lifecycle
lifecycle_state: active  # active | consolidated | archived
created_at: 2024-01-15T14:30:22.000Z
consolidated_at: null
archived_at: null
---

# SignalProcessorAgent - FFT Analysis

## Request
[Complete prompt sent to agent]

## Response
[Complete response from agent]

## Outputs
- File: output/fft_result.npy
- File: output/spectrum.png

## Metrics
- Duration: 2.3s
- Tool calls: 2
- Success: true

## Links
- Parent: SystemAgent orchestration (trace-20240115-142800-xyz789)
- Depends on: DataLoaderAgent output (trace-20240115-143000-def456)
- Next: VisualizationAgent (trace-20240115-143100-ghi012)
```

---

## Trace Lifecycle States

### 1. Active
```
State: active
Description: Trace is part of current or recent execution
Location: projects/[name]/memory/short_term/
Queryable: Yes (immediate access)
```

### 2. Consolidated
```
State: consolidated
Description: Patterns extracted, trace retained for reference
Location: projects/[name]/memory/short_term/ (original)
          projects/[name]/memory/long_term/ (learnings)
Queryable: Yes
```

### 3. Archived
```
State: archived
Description: Moved to cold storage after extended inactivity
Location: projects/[name]/memory/archive/
Queryable: Yes (with expanded search path)
```

---

## Lifecycle Transitions

```
                 ┌─────────────────────────────┐
                 │                             │
                 ▼                             │
┌─────────┐   create   ┌─────────┐   consolidate   ┌──────────────┐
│ (none)  │ ─────────► │ ACTIVE  │ ──────────────► │ CONSOLIDATED │
└─────────┘            └─────────┘                 └──────────────┘
                                                          │
                                                   archive (7d+)
                                                          │
                                                          ▼
                                                  ┌──────────┐
                                                  │ ARCHIVED │
                                                  └──────────┘
```

### Transition Triggers

| Transition | Trigger |
|------------|---------|
| create → active | New trace written during execution |
| active → consolidated | MemoryConsolidationAgent processes trace |
| consolidated → archived | 7 days since last access |

---

## Link Graph Construction

### Building the Execution Graph

```javascript
function buildExecutionGraph(projectPath) {
  // 1. Load all traces
  const traces = loadTraces(`${projectPath}/memory/short_term/`);

  // 2. Build node map
  const nodes = new Map();
  traces.forEach(t => nodes.set(t.trace_id, t));

  // 3. Build edge list
  const edges = [];
  traces.forEach(t => {
    if (t.parent_trace_id) {
      edges.push({
        from: t.parent_trace_id,
        to: t.trace_id,
        type: t.link_type
      });
    }
    if (t.depends_on) {
      t.depends_on.forEach(dep => {
        edges.push({
          from: dep.trace_id,
          to: t.trace_id,
          type: 'dependency',
          artifact: dep.output_file
        });
      });
    }
  });

  return { nodes, edges };
}
```

### Visualization

```
trace-001 [SystemAgent - Orchestration]
    │
    ├── trace-002 [DataLoaderAgent - Load Audio]
    │       │
    │       └── output/audio_data.npy
    │
    ├── trace-003 [SignalProcessorAgent - FFT]
    │       │ depends on: trace-002
    │       │
    │       └── output/fft_result.npy
    │
    └── trace-004 [VisualizationAgent - Plot]
            │ depends on: trace-003
            │
            └── output/spectrum.png
```

---

## Querying Linked Traces

### Find All Children of a Trace

```javascript
function findChildren(traceId, allTraces) {
  return allTraces.filter(t =>
    t.parent_trace_id === traceId
  );
}
```

### Find Dependency Chain

```javascript
function findDependencyChain(traceId, allTraces) {
  const trace = allTraces.find(t => t.trace_id === traceId);
  if (!trace.depends_on) return [];

  const chain = [];
  for (const dep of trace.depends_on) {
    chain.push(dep.trace_id);
    chain.push(...findDependencyChain(dep.trace_id, allTraces));
  }
  return chain;
}
```

### Reconstruct Execution Order

```javascript
function getExecutionOrder(rootTraceId, allTraces) {
  const visited = new Set();
  const order = [];

  function visit(traceId) {
    if (visited.has(traceId)) return;
    visited.add(traceId);

    const trace = allTraces.find(t => t.trace_id === traceId);
    if (!trace) return;

    // Visit dependencies first
    if (trace.depends_on) {
      trace.depends_on.forEach(dep => visit(dep.trace_id));
    }

    order.push(traceId);

    // Visit children
    findChildren(traceId, allTraces).forEach(child => visit(child.trace_id));
  }

  visit(rootTraceId);
  return order;
}
```

---

## Implementation in TypeScript

### ExecutionTrace Interface (Enhanced)

```typescript
interface ExecutionTrace {
  // Core
  trace_id: string;
  timestamp: string;
  project: string;

  // Agent
  agent_name: string;
  agent_type: 'core' | 'dynamic';
  agent_path: string;

  // Task
  task: string;
  task_category?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';

  // Linking (NEW)
  parent_trace_id?: string;
  link_type?: 'sequential' | 'hierarchical' | 'dependency' | 'parallel';
  depth?: number;
  depends_on?: TraceDependency[];
  sibling_traces?: string[];

  // Lifecycle (NEW)
  lifecycle_state: 'active' | 'consolidated' | 'archived';
  consolidated_at?: string;
  archived_at?: string;

  // Outputs
  outputs: string[];
  duration_ms: number;
  success: boolean;
}

interface TraceDependency {
  trace_id: string;
  output_file: string;
  dependency_type: 'data' | 'config' | 'model';
}
```

---

## Integration with Core Agents

### SystemAgent

When orchestrating:
```markdown
1. Create root trace with lifecycle_state: active
2. For each sub-agent delegation:
   - Create child trace with parent_trace_id = root
   - Set link_type = hierarchical
   - Track dependencies on previous agent outputs
3. Update root trace with child count on completion
```

### MemoryAnalysisAgent

When logging:
```markdown
1. Generate unique trace_id
2. Set parent_trace_id from orchestration context
3. Determine link_type based on invocation pattern
4. Record depends_on from input parameters
```

### MemoryConsolidationAgent

When consolidating:
```markdown
1. Load all active traces
2. Build execution graph
3. Analyze patterns in linked sequences
4. Update lifecycle_state to consolidated
5. Generate cross-trace insights
```

---

## Best Practices

### Creating Traces

1. **Always set parent_trace_id** when delegating
2. **Record dependencies explicitly** with output file paths
3. **Use consistent trace_id format** for sorting
4. **Include depth** for hierarchical links

### Querying Traces

1. **Start from root** for full workflow view
2. **Use dependency chain** for data lineage
3. **Filter by lifecycle_state** for performance
4. **Index by parent_trace_id** for fast child lookup

### Maintaining Links

1. **Verify parent exists** before creating child
2. **Update sibling lists** for parallel traces
3. **Clean up orphaned traces** during consolidation
4. **Preserve links during archival**

---

## Future Enhancements

- **Visual trace browser**: Interactive graph visualization
- **Automatic link detection**: Infer dependencies from file access patterns
- **Cross-project links**: Reference traces from other projects
- **Link strength scoring**: Measure correlation between linked traces
- **Temporal patterns**: Detect recurring link structures
