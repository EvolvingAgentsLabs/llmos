---
name: PromptTemplate
type: template
version: "1.0"
description: Template for creating new system prompts
variables:
  - name: promptName
    type: string
    description: Name of the prompt
  - name: promptType
    type: string
    description: Type of prompt (system, tool, guide, runtime)
---

# Prompt Definition Template

Use this template when creating new externalized prompt markdown files.

## Template Structure

```markdown
---
name: {{promptName}}
type: {{promptType}}
version: "1.0"
description: Brief description of the prompt's purpose
variables:
  - name: variableName
    type: string|number|boolean|array
    description: What this variable is for
    default: optional default value
evolved_from: null  # or path/to/parent.md
origin: created     # created | extracted | evolved
extracted_from: null  # lib/file.ts:lineNumber if extracted
---

# Prompt Title

[Main prompt content here]

## Section 1

[Content with optional {{variableName}} placeholders]

## Section 2

[More content...]

## Guidelines

- [Guideline 1]
- [Guideline 2]

## Examples

### Example 1
[Example content]

### Example 2
[Example content]
```

## Prompt Types

### system
Core system prompts used by the orchestrator and agents.
- Context summarization
- Workspace context
- Error handling

### tool
Prompts specific to tool execution and code generation.
- Tool-specific instructions
- Code templates
- Parameter validation

### guide
Educational and instructional prompts.
- How-to guides
- Best practices
- Code patterns

### runtime
Runtime constraint and limitation prompts.
- Python constraints
- Browser limitations
- Resource limits

## Variable Interpolation

Use `{{variableName}}` syntax for dynamic values:

```markdown
You are working in the {{volumeType}} workspace.
There are {{fileCount}} files available.
```

### Conditional Blocks

Use Handlebars-style conditionals:

```markdown
{{#if hasMemory}}
### Memory Contents
{{memoryContent}}
{{else}}
*No memory available*
{{/if}}
```

### Loops

```markdown
### Available Files
{{#each files}}
- {{this.name}}: {{this.size}} bytes
{{/each}}
```

## Best Practices

### 1. Clear Structure
- Use consistent heading levels
- Organize logically
- Include table of contents for long prompts

### 2. Specific Instructions
- Be precise about expected behavior
- Include examples
- Define edge cases

### 3. Testable
- Prompts should produce verifiable outputs
- Include success criteria
- Define failure modes

### 4. Versioned
- Update version on changes
- Track evolution lineage
- Document breaking changes

### 5. Documented Variables
- List all variables in frontmatter
- Provide descriptions and types
- Include default values

## Evolution

Prompts can be evolved by:

1. **Copying to user/team volume**
   ```
   system/prompts/core/example.md  # Original
   user/prompts/core/example.md    # User's evolved version
   ```

2. **Updating frontmatter**
   ```yaml
   evolved_from: system/prompts/core/example.md
   origin: evolved
   ```

3. **Tracking metrics**
   ```yaml
   evolution_metrics:
     track:
       - usage_count
       - success_rate
     improve_on:
       - failure_patterns
   ```

## Related

- `agent-template.md` - For agent definitions
- `tool-template.md` - For tool definitions
- `/system/prompts/README.md` - Full documentation
