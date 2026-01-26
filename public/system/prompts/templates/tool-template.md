---
name: ToolTemplate
type: template
version: "1.0"
description: Template for creating new tool definitions
variables:
  - name: toolName
    type: string
    description: Name of the tool
  - name: toolId
    type: string
    description: Unique identifier for the tool
  - name: toolDescription
    type: string
    description: Brief description of the tool's purpose
---

# Tool Definition Template

Use this template when creating new tool markdown definitions.

## Template Structure

```markdown
---
name: {{toolName}}
type: tool
id: {{toolId}}
description: {{toolDescription}}
version: 1.0.0
created_at: YYYY-MM-DD
agent: OptionalDelegatedAgent
parameters:
  - name: param1
    type: string
    required: true
    description: Description of parameter 1
  - name: param2
    type: number
    required: false
    default: 10
    description: Description of parameter 2
returns:
  type: object
  properties:
    success:
      type: boolean
      description: Whether the operation succeeded
    result:
      type: any
      description: The result of the operation
    error:
      type: string
      description: Error message if failed
evolution_metrics:
  track:
    - success_rate
    - execution_time
  improve_on:
    - failure_patterns
---

# {{toolName}} Tool

[Brief description of what the tool does]

## Purpose

This tool [detailed purpose description].

## When to Use

Use this tool when:
1. [Scenario 1]
2. [Scenario 2]
3. [Scenario 3]

## Parameters

### param1 (required)
- **Type:** string
- **Description:** [What this parameter is for]
- **Example:** `"example value"`

### param2 (optional)
- **Type:** number
- **Default:** 10
- **Description:** [What this parameter is for]
- **Example:** `42`

## Returns

The tool returns an object with:

| Property | Type | Description |
|----------|------|-------------|
| `success` | boolean | Whether the operation succeeded |
| `result` | any | The operation result |
| `error` | string | Error message if failed |

## Example Usage

\`\`\`tool
{
  "tool": "{{toolId}}",
  "inputs": {
    "param1": "example value",
    "param2": 42
  }
}
\`\`\`

### Example Response

\`\`\`json
{
  "success": true,
  "result": {
    "data": "processed result"
  }
}
\`\`\`

## Error Handling

Common errors and how to handle them:

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid parameter` | Wrong type provided | Check parameter types |
| `Resource not found` | Path doesn't exist | Verify the path exists |

## Implementation Notes

[Technical details about how the tool works]

## Related

- **[RelatedAgent]**: [How it relates]
- **[RelatedTool]**: [How it relates]
```

## Required Fields

### Frontmatter
- `name`: Tool display name
- `type`: Always "tool"
- `id`: Unique identifier (lowercase, hyphenated)
- `description`: One-line description
- `parameters`: List of input parameters
- `returns`: Return type specification

### Documentation
- Purpose section
- When to Use section
- Parameters documentation
- Example usage with tool call format
- Error handling information

## Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"hello"` |
| `number` | Numeric value | `42` |
| `boolean` | True/false | `true` |
| `array` | List of items | `[1, 2, 3]` |
| `object` | Key-value pairs | `{"key": "value"}` |

## Best Practices

1. **Clear naming** - Tool ID should describe the action
2. **Complete parameters** - Document all required and optional params
3. **Working examples** - Test examples before documenting
4. **Error documentation** - List common errors and solutions
5. **Delegation** - Reference agent if tool delegates to one
6. **Evolution tracking** - Define metrics for improvement
