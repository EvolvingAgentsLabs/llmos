---
name: Plan-First Execution
category: orchestration
description: Skill for creating detailed execution plans before task execution, incorporating memory and resources
keywords: [planning, orchestration, steps, strategy, decomposition]
confidence: 0.9
created_at: 2025-12-30
version: 1.0.0
---

# Plan-First Execution

## When to Use

Use this skill when:
- Starting any non-trivial task (more than 2-3 steps)
- Task involves multiple tools or agents
- Memory has relevant past experiences
- Task has potential failure modes
- User would benefit from seeing the plan

## Prerequisites

- Access to query-memory tool or PatternMatcherAgent
- Knowledge of available tools and agents
- Understanding of task decomposition

## Approach

### 1. Task Analysis

Before planning, analyze:

```
Analysis:
  summary: "What does this task actually require?"
  complexity: low | medium | high
  domain: data-science | visualization | automation | general
  key_challenges:
    - "Challenge 1"
    - "Challenge 2"
  success_criteria:
    - "What defines success?"
```

### 2. Memory Consultation

Query memory for similar tasks:

```
Memory Query:
  query: "Semantic description of the task"
  results:
    - similar_task: "Previous task description"
      approach: "What worked"
      success: true/false
      tools_used: ["tool1", "tool2"]
```

### 3. Resource Discovery

Identify available resources:

```
Resources:
  tools:
    - id: "tool-id"
      useful_for: "What this tool does"
  agents:
    - name: "AgentName"
      capabilities: ["cap1", "cap2"]
      when_to_use: "Delegate when..."
```

### 4. Step Creation

Create concrete, atomic steps:

```
Step:
  id: "step-1"
  name: "Descriptive Step Name"
  description: "Detailed description"
  tool: "tool-id or null"
  agent: "agent-name or null"
  inputs:
    param1: "value or {{placeholder}}"
  expected_output: "What this produces"
  depends_on: ["step-0"]  # Dependencies
  can_fail: true/false
  fallback: "What to do if it fails"
```

### 5. Dependency Ordering

Ensure steps are properly ordered:

```
Dependencies:
  step-1: []           # No dependencies, can start
  step-2: [step-1]     # Needs step-1 output
  step-3: [step-1]     # Can run parallel to step-2
  step-4: [step-2, step-3]  # Needs both
```

### 6. Risk Assessment

Identify what could go wrong:

```
Risks:
  - risk: "What might fail"
    likelihood: low | medium | high
    impact: low | medium | high
    mitigation: "How to handle it"
```

## Example

**Task**: "Build a customer churn prediction model"

**Plan**:

```yaml
plan:
  id: plan-churn-001

  task_analysis:
    summary: "ML classification model for customer churn"
    complexity: high
    domain: data-science
    key_challenges:
      - "Data quality unknown"
      - "Feature selection needed"
      - "Model evaluation required"

  approach:
    strategy: "EDA → Feature Engineering → Model Training → Evaluation"
    rationale: "Standard ML pipeline, worked for similar tasks"
    memory_influence: "Used sklearn pipeline pattern from past"

  steps:
    - id: step-1
      name: "Load and Explore Data"
      tool: execute-python
      description: "Load dataset, check shape, missing values, distributions"
      expected_output: "EDA summary with data quality report"

    - id: step-2
      name: "Feature Engineering"
      tool: execute-python
      depends_on: [step-1]
      description: "Create features, handle missing values, encode categoricals"

    - id: step-3
      name: "Train Model"
      tool: execute-python
      depends_on: [step-2]
      description: "Train Random Forest, evaluate with cross-validation"

    - id: step-4
      name: "Create Dashboard"
      tool: generate-applet
      depends_on: [step-3]
      description: "Interactive dashboard showing predictions and metrics"

    - id: step-5
      name: "Save Artifacts"
      tool: write-file
      depends_on: [step-3, step-4]
      description: "Save model, code, and documentation"

  risks:
    - risk: "Imbalanced classes"
      likelihood: medium
      mitigation: "Use SMOTE or class weights"
    - risk: "Overfitting"
      likelihood: medium
      mitigation: "Use cross-validation, regularization"
```

## Tips

- **Start with the end** - Define success criteria first
- **Atomic steps** - Each step does ONE thing
- **Dependencies matter** - Order steps correctly
- **Plan for failure** - Every step should have a fallback
- **Use memory** - Don't reinvent approaches that worked

## Anti-Patterns

- **Vague steps** - "Do the analysis" is too vague
- **Missing dependencies** - Steps that need outputs from unfinished steps
- **Over-planning** - Too many steps for simple tasks
- **Ignoring memory** - Not learning from past experiences
- **No fallbacks** - Plans that assume everything works

## Evolution

This skill improves by:
- Tracking which plan structures lead to success
- Learning domain-specific planning patterns
- Adapting step granularity to task complexity
- Incorporating user feedback on plan quality
