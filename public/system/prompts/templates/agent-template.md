---
name: AgentTemplate
type: template
version: "1.0"
description: Template for creating new agent definitions
variables:
  - name: agentName
    type: string
    description: Name of the agent
  - name: agentType
    type: string
    description: Type of agent (specialist, orchestrator, memory, etc.)
  - name: agentDescription
    type: string
    description: Brief description of the agent's purpose
---

# Agent Definition Template

Use this template when creating new agent markdown definitions.

## Template Structure

```markdown
---
name: {{agentName}}
type: {{agentType}}
id: {{agentName | lowercase | replace(' ', '-')}}
category: domain_specific
mode: EXECUTION
description: {{agentDescription}}
version: "1.0"
evolved_from: null  # or path to parent agent if evolved
origin: created     # created | copied | evolved
model: anthropic/claude-sonnet-4.5
maxIterations: 10
tools:
  - tool-id-1
  - tool-id-2
capabilities:
  - Capability 1
  - Capability 2
  - Capability 3
libraries:
  - numpy
  - scipy
---

# {{agentName}}

You are [role description]. Your purpose is [primary function].

## Your Specific Task

[Detailed task description]

## Inputs

You will receive:
- [Input 1]: [Description]
- [Input 2]: [Description]

## Outputs

You must produce:
- [Output 1]: [Format and description]
- [Output 2]: [Format and description]

## Technical Approach

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Code Template

\`\`\`python
import numpy as np
# Your implementation pattern here

def main():
    # Main logic
    pass

if __name__ == "__main__":
    main()
\`\`\`

## Constraints

- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

## Examples

### Example Input
[Example input data or request]

### Example Output
[Expected output format]
```

## Required Sections

### Frontmatter (Required)
- `name`: Agent display name
- `type`: Agent type (specialist, orchestrator, memory)
- `id`: Unique identifier (lowercase, hyphenated)
- `description`: One-line description
- `tools`: List of tool IDs the agent can use
- `capabilities`: List of what the agent can do

### System Prompt Section (Required)
The main content after frontmatter serves as the system prompt. It should:
1. Define the agent's role clearly
2. Specify inputs and outputs
3. Provide technical approach
4. Include constraints and limitations

## Optional Sections

### Code Template
Provide example code patterns for the agent's typical tasks.

### Examples
Show input/output examples for clarity.

### Evolution Metrics
```yaml
evolution_metrics:
  track:
    - success_rate
    - execution_time
    - output_quality
  improve_on:
    - low_success_scenarios
    - slow_executions
```

## Agent Types

### Specialist
Focused on specific domain tasks (signal processing, data analysis, etc.)

### Orchestrator
Coordinates multiple agents and manages workflows

### Memory
Handles memory operations (consolidation, retrieval, analysis)

### Hardware
Interfaces with hardware devices (ESP32, sensors, robots)

## Best Practices

1. **Clear role definition** - Agent should know exactly what it does
2. **Specific tools** - Only list tools the agent actually needs
3. **Concrete examples** - Show don't tell
4. **Testable outputs** - Outputs should be verifiable
5. **Version tracking** - Update version when making changes
6. **Evolution path** - Track parent agents for lineage
