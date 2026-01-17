---
name: Semantic Pattern Matching
category: learning
description: Skill for finding semantically similar tasks and extracting reusable patterns from execution history
keywords: [memory, learning, patterns, similarity, semantic, matching]
confidence: 0.9
created_at: 2025-12-30
version: 1.0.0
---

# Semantic Pattern Matching

## When to Use

Use this skill when you need to:
- Find similar past tasks before starting a new one
- Extract reusable patterns from execution history
- Recommend approaches based on past successes
- Build institutional knowledge from experiences

## Prerequisites

- Access to execution traces in `system/memory_log.md`
- PatternMatcherAgent available in system agents
- LLM capability for semantic analysis

## Approach

### 1. Collect Execution Traces

Read recent execution traces from memory:

```
Traces contain:
- goal: What the user wanted
- success: Whether it worked
- tools_used: Which tools were called
- files_created: Output files
- duration: How long it took
- timestamp: When it happened
```

### 2. Semantic Comparison

For each trace, compare against the new task using:

**Domain Similarity**
- Same field? (data science, visualization, automation)
- Similar libraries? (numpy, pandas, matplotlib)
- Similar outputs? (plots, reports, data)

**Structural Similarity**
- Similar steps? (load → process → save)
- Similar tool patterns? (read → execute → write)
- Similar complexity?

**Goal Similarity**
- Same underlying objective?
- Same type of problem?
- Same success criteria?

### 3. Pattern Extraction

From matched traces, extract:

```
Pattern:
  name: "Descriptive pattern name"
  description: "What this pattern accomplishes"
  triggers: ["keywords", "phrases", "that activate this pattern"]
  tool_sequence: ["tool1", "tool2", "tool3"]
  success_indicators: ["signs that the pattern worked"]
  example_goal: "An example task that uses this pattern"
```

### 4. Approach Recommendation

Synthesize findings into actionable advice:

```
Recommendation:
  summary: "Brief overview of suggested approach"
  steps: ["Step 1", "Step 2", "Step 3"]
  relevant_skills: ["skill-1", "skill-2"]
  confidence: 0.85
  source_traces: ["trace-001", "trace-002"]
```

## Example

**New Task**: "Create a visualization of network traffic over time"

**Semantic Matching Process**:

1. Parse task intent: time-series visualization of data
2. Search traces for:
   - "visualization" + "time" → 3 matches
   - "network" + "data" → 1 match
   - "plot" + "over time" → 5 matches

3. Best match: "Plot temperature readings over time" (0.85 similarity)
   - Same pattern: load data → process timestamps → create time series plot
   - Same tools: read-file, execute-python, write-file

4. Extract pattern:
   ```
   Pattern: Time Series Visualization
   Tools: read-file → execute-python (pandas + matplotlib) → write-file
   Success: Plot saved, axes labeled, legend included
   ```

5. Recommendation:
   ```
   Use pandas for data loading, matplotlib for plotting.
   X-axis: timestamps, Y-axis: metric values.
   Consider adding rolling average for noisy data.
   ```

## Tips

- **Prioritize recent traces** - They may reflect current project context
- **Weight success** - Failed traces are anti-patterns to avoid
- **Consider frequency** - Patterns used multiple times are more reliable
- **Cross-domain insight** - Sometimes patterns from different domains apply

## Anti-Patterns

- **Keyword-only matching** - Miss semantic similarities like "chart" ≈ "plot"
- **Ignoring failures** - Past failures teach what NOT to do
- **Over-fitting** - One success doesn't make a pattern
- **Stale patterns** - Old patterns may not apply to current context

## Evolution

This skill improves by:
- Tracking which pattern matches led to success
- Learning user-specific vocabulary and preferences
- Discovering new pattern types from diverse tasks
- Refining similarity scoring based on outcomes
