# LLMos Prompts System

This directory contains all system prompts externalized as markdown files for easy analysis, evolution, and improvement.

## Architecture

```
public/system/prompts/          # System-level prompts (READ-ONLY)
├── README.md                   # This file
├── core/                       # Core orchestration prompts
│   ├── context-summarization.md
│   ├── tool-execution-continuation.md
│   └── workspace-context.md
├── runtime/                    # Runtime constraint prompts
│   ├── python-constraints.md
│   ├── quantum-constraints.md
│   └── browser-limitations.md
├── tools/                      # Tool-specific prompts
│   ├── generate-applet.md
│   ├── generate-robot-agent.md
│   ├── deploy-esp32-agent.md
│   └── ...
├── guides/                     # Code generation guides
│   ├── tool-call-format.md
│   ├── agent-creation.md
│   └── applet-development.md
└── templates/                  # Templates for new prompts
    ├── agent-template.md
    ├── tool-template.md
    └── prompt-template.md
```

## Hierarchy: System -> Team -> User

Prompts follow a layered architecture:

1. **System Level** (`/system/prompts/`) - Read-only base prompts
   - Cannot be modified directly
   - Provides stable, tested defaults
   - Evolved through formal PR process

2. **Team Level** (`team/prompts/`) - Team customizations
   - Copied from system, modified for team needs
   - Shared across team members
   - Version controlled per team

3. **User Level** (`user/prompts/`) - Personal customizations
   - Copied from system or team
   - Individual experimentation
   - Quick iteration without affecting others

## How to Evolve Prompts

### To customize a system prompt:

```javascript
// 1. Copy system prompt to user volume
const systemPrompt = await loadPrompt('system/prompts/core/context-summarization.md');

// 2. Write to user volume with modifications
await writeFile('user/prompts/core/context-summarization.md', modifiedPrompt);

// 3. The loader will prioritize user > team > system
const activePrompt = await loadPrompt('prompts/core/context-summarization.md');
```

### Prompt Loading Priority

The prompt loader checks locations in this order:
1. `user/prompts/[path]` - User customizations
2. `team/prompts/[path]` - Team customizations
3. `system/prompts/[path]` - System defaults

## Prompt Format

All prompts follow this markdown structure:

```markdown
---
name: PromptName
type: system|tool|guide|template
version: "1.0"
description: Brief description
variables:
  - name: variableName
    type: string|number|boolean|array
    description: What this variable is for
    default: optional default value
evolved_from: null|path/to/parent.md
---

# Prompt Title

[Prompt content here with {{variableName}} placeholders]

## Section 1

Content...

## Section 2

Content...
```

## Variable Interpolation

Prompts can include variables using `{{variableName}}` syntax:

```markdown
You are working in the {{volumeType}} workspace.
The project has {{fileCount}} files.
```

The prompt loader replaces these at runtime:

```javascript
const prompt = await loadPrompt('prompts/core/workspace-context.md', {
  volumeType: 'user',
  fileCount: 42
});
```

## Creating New Prompts

1. Copy a template from `templates/`
2. Fill in the frontmatter
3. Write the prompt content
4. Test with the prompt loader
5. Submit for review if adding to system

## Evolution Metrics

Each prompt tracks:
- `usage_count` - How often it's loaded
- `success_rate` - Task completion rate when used
- `evolved_from` - Parent prompt if evolved
- `children` - Prompts evolved from this one

This enables:
- A/B testing of prompt variants
- Automatic selection of best-performing prompts
- Lineage tracking for prompt evolution

## Related

- `/system/agents/` - Agent definitions (use prompts)
- `/system/tools/` - Tool definitions (use prompts)
- `/system/kernel/` - System configuration
