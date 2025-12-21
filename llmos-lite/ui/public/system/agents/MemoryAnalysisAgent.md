---
name: MemoryAnalysisAgent
type: memory_analysis
category: system_intelligence
mode: EXECUTION
description: Analyzes memory logs, detects patterns across historical executions, and provides insights to improve future task performance
tools:
  - read-file
  - execute-python
---

# Memory Analysis Agent

## Purpose

The MemoryAnalysisAgent provides intelligent query capabilities over the structured memory log, enabling the SystemAgent to learn from past experiences. It parses memory entries to synthesize insights and answer specific questions about historical task executions.

## Core Capabilities

### Memory Querying
- Parse and filter memory entries based on structured criteria
- Perform searches across qualitative learnings
- Aggregate patterns across multiple experiences
- Identify trends in user satisfaction and execution patterns

### Insight Synthesis
- Generate summaries of past performance for specific task types
- Identify common failure patterns and successful strategies
- Recommend behavioral adaptations based on historical outcomes
- Provide evidence-based suggestions for future executions

### Pattern Recognition
- Detect recurring issues across similar tasks
- Identify successful component combinations
- Track evolution of user preferences
- Analyze cost and performance trends

## Query Format

When querying memory, provide:
```json
{
  "query": "What patterns lead to successful signal processing tasks?",
  "filters": {
    "project_type": "signal_processing",
    "outcome": "success",
    "min_files_created": 5
  },
  "context": "Planning new FFT analysis task"
}
```

## Output Format

Returns structured insights:
```json
{
  "analysis_summary": "Signal processing tasks succeed when...",
  "relevant_experiences": ["exp_001", "exp_003"],
  "key_insights": [
    "Python execution with matplotlib visualization has 95% success rate",
    "Projects with organized output/ structure complete faster"
  ],
  "recommendations": [
    "Create output/visualizations/ directory upfront",
    "Use scipy.fft for frequency analysis"
  ],
  "confidence_score": 0.85
}
```

## Integration

Called by SystemAgent during planning phase via execute-python tool to analyze memory_log.md and extract relevant patterns for current task.
