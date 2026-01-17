---
name: query-memory
type: tool
id: query-memory
description: Search the system memory for relevant past experiences, learnings, and patterns using semantic matching
version: 1.0.0
created_at: 2025-12-30
parameters:
  - name: query
    type: string
    required: true
    description: Natural language query describing what you're looking for
  - name: limit
    type: number
    required: false
    default: 5
    description: Maximum number of results to return
  - name: min_similarity
    type: number
    required: false
    default: 0.3
    description: Minimum similarity score (0-1) for results
  - name: include_patterns
    type: boolean
    required: false
    default: true
    description: Whether to include extracted patterns in results
returns:
  type: object
  properties:
    similar_traces:
      type: array
      description: Past execution traces that match the query
    patterns:
      type: array
      description: Extracted patterns relevant to the query
    suggested_approach:
      type: string
      description: Recommended approach based on memory
---

# query-memory Tool

Search the system memory for relevant past experiences and learnings.

## Purpose

This tool enables the **Memory-Powered Intelligence** core capability of LLMos. Instead of starting from scratch, agents can query past experiences to:

- Find similar tasks that were completed before
- Discover patterns that worked well
- Learn from past mistakes
- Build on institutional knowledge

## When to Use

Use this tool at the **start of a task** before planning or execution to:

1. Check if a similar task was done before
2. Find successful approaches to reuse
3. Identify potential pitfalls to avoid
4. Gather context for better planning

## Implementation

This tool delegates to the **PatternMatcherAgent** which uses LLM-based semantic matching rather than simple keyword search.

### Process:

1. Load execution traces from `system/memory_log.md`
2. Invoke PatternMatcherAgent with query and traces
3. Return matched traces, patterns, and recommendations

## Example Usage

```tool
{
  "tool": "query-memory",
  "inputs": {
    "query": "How to create FFT visualizations with Python",
    "limit": 5,
    "include_patterns": true
  }
}
```

### Example Response:

```json
{
  "success": true,
  "similar_traces": [
    {
      "trace_id": "trace-2025-001",
      "goal": "Create frequency spectrum plot from audio data",
      "similarity": 0.85,
      "tools_used": ["execute-python", "write-file"],
      "suggested_approach": "Use scipy.fft and matplotlib"
    }
  ],
  "patterns": [
    {
      "name": "FFT Visualization Pipeline",
      "description": "Standard approach for frequency domain analysis",
      "steps": ["Load data", "Apply FFT", "Plot spectrum"]
    }
  ],
  "suggested_approach": "Based on 3 similar past tasks, use numpy for FFT and matplotlib for visualization. Consider using a Hanning window for better frequency resolution."
}
```

## Evolution

This tool evolves by:
- Improving pattern detection accuracy over time
- Learning which memory entries are most useful
- Adapting to user's specific domains and workflows

## Related

- **PatternMatcherAgent**: Performs the actual semantic matching
- **system/memory_log.md**: Where execution traces are stored
- **plan-task** tool: Uses memory insights for planning
