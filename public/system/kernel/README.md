# LLMos Kernel

The kernel is the core set of rules and configurations that govern how the LLMos AI operating system behaves. Unlike traditional operating systems where the kernel is compiled binary code, the LLMos kernel is **pure text** - markdown files that both humans and AI can read and modify.

## Philosophy

> "If the AI can read it, the AI can understand it. If the AI can write it, the AI can improve it."

The kernel follows the **Pure Markdown** philosophy:
- Configuration is documentation
- Rules are readable prompts
- The AI operates by following written instructions, not compiled code

## Kernel Components

| File | Purpose |
|------|---------|
| `orchestration-rules.md` | How tasks are decomposed and executed |
| `evolution-rules.md` | How patterns are detected and skills are generated |
| `memory-schema.md` | How memories are structured and queried |
| `tool-registry.md` | Available tools and their usage patterns |
| `config.md` | Runtime parameters and limits |

## How It Works

1. **SystemAgent reads the kernel** - Before executing any task, the master orchestrator consults these files
2. **Rules are followed, not compiled** - The AI interprets the rules in context
3. **Changes take effect immediately** - Edit a rule, and the next execution uses it
4. **The AI can propose changes** - Through the evolution system, the AI can suggest kernel improvements

## Self-Modification

The kernel supports controlled self-modification:

```
User Request → Task Execution → Pattern Detection →
    ↓
Skill Generation (automatic)
    ↓
Kernel Rule Proposal (requires approval)
```

Skills are auto-generated. Kernel changes require human approval.

## Design Principles

1. **Transparency** - Every rule is readable
2. **Editability** - Every rule can be changed
3. **Safety** - Kernel changes are versioned and reversible
4. **Simplicity** - Rules are expressed in natural language
5. **Extensibility** - New rules can be added without code changes
