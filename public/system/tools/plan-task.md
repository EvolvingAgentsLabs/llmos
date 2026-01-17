---
name: plan-task
type: tool
id: plan-task
description: Create a detailed execution plan before starting a task, incorporating memory insights and available resources
version: 1.0.0
created_at: 2025-12-30
parameters:
  - name: task
    type: string
    required: true
    description: The user's goal or task to plan
  - name: include_memory
    type: boolean
    required: false
    default: true
    description: Whether to query memory for similar past tasks
  - name: discover_agents
    type: boolean
    required: false
    default: true
    description: Whether to discover available sub-agents
  - name: max_steps
    type: number
    required: false
    default: 10
    description: Maximum number of steps in the plan
returns:
  type: object
  properties:
    plan:
      type: object
      description: The detailed execution plan
    memory_context:
      type: object
      description: Relevant memory insights used in planning
    available_agents:
      type: array
      description: Discovered agents that could help
---

# plan-task Tool

Create a detailed execution plan before starting a task.

## Purpose

This tool implements the **Plan-First Execution** pattern from the Claude Agent SDK. Instead of diving directly into execution, agents first create a comprehensive plan that:

- Breaks the task into concrete steps
- Identifies required tools and agents
- Incorporates learnings from memory
- Anticipates potential issues

## When to Use

Use this tool at the **very start** of any non-trivial task:

1. Before executing complex multi-step tasks
2. When memory has relevant past experiences
3. When multiple tools or agents might be needed
4. When the task has potential failure modes

## Implementation

This tool delegates to the **PlanningAgent** which:

1. Queries memory for similar past tasks (via query-memory)
2. Discovers available sub-agents (via discover-subagents)
3. Analyzes the task requirements
4. Creates a step-by-step plan with dependencies

### Process:

```
task → query-memory → discover-subagents → PlanningAgent → plan
```

## Example Usage

```tool
{
  "tool": "plan-task",
  "inputs": {
    "task": "Analyze customer churn data and create a predictive model",
    "include_memory": true,
    "discover_agents": true
  }
}
```

### Example Response:

```json
{
  "success": true,
  "plan": {
    "id": "plan-churn-analysis-001",
    "task_analysis": {
      "summary": "Build a customer churn prediction model from data",
      "complexity": "high",
      "domain": "data-science"
    },
    "steps": [
      {
        "id": "step-1",
        "name": "Load and Explore Data",
        "tool": "execute-python",
        "description": "Load churn dataset and perform EDA"
      },
      {
        "id": "step-2",
        "name": "Feature Engineering",
        "tool": "execute-python",
        "depends_on": ["step-1"]
      },
      {
        "id": "step-3",
        "name": "Train Model",
        "tool": "execute-python",
        "depends_on": ["step-2"]
      },
      {
        "id": "step-4",
        "name": "Create Dashboard",
        "tool": "generate-applet",
        "depends_on": ["step-3"]
      }
    ],
    "confidence": 0.85
  },
  "memory_context": {
    "similar_tasks": ["ML model for sales prediction (success)"],
    "relevant_patterns": ["sklearn pipeline pattern"]
  },
  "available_agents": [
    {
      "name": "DataAnalystAgent",
      "relevant_capabilities": ["statistical analysis"]
    }
  ]
}
```

## Plan Execution

After getting a plan, the SystemAgent should:

1. **Review** the plan for completeness
2. **Execute** each step in order
3. **Track** progress and results
4. **Adapt** if steps fail (use fallbacks)
5. **Log** execution for future learning

## Evolution

This tool evolves by:
- Improving plan accuracy based on execution outcomes
- Learning which plan structures work best
- Adapting to user's workflow preferences
- Building domain-specific planning templates

## Related

- **PlanningAgent**: Performs the actual planning
- **query-memory**: Provides memory context for planning
- **discover-subagents**: Finds available specialist agents
