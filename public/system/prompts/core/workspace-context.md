---
name: WorkspaceContextPrompt
type: system
version: "1.0"
description: Preamble describing the workspace context for the SystemAgent
variables:
  - name: volumeType
    type: string
    description: The volume type (user, team, system)
  - name: workspacePath
    type: string
    description: Path to the workspace root
  - name: fileCount
    type: number
    description: Number of files in the workspace
  - name: sections
    type: array
    description: Top-level sections/directories
  - name: existingFiles
    type: array
    description: List of existing file paths
  - name: memoryContent
    type: string
    description: Content of workspace memory file
  - name: systemMemory
    type: string
    description: Content of system memory log
evolved_from: null
origin: extracted
extracted_from: lib/system-agent-orchestrator.ts:985-1040
---

# Workspace Context

## Target Workspace

**You are working in the {{volumeType}} workspace.**

The AI decides what context is relevant from the entire workspace.

### Workspace Overview

| Property | Value |
|----------|-------|
| **Volume** | {{volumeType}} |
| **Path** | `{{workspacePath}}` |
| **Files in Context** | {{fileCount}} |
| **Sections** | {{sections}} |

### Workspace Files

```
{{existingFiles}}
```

### Working Guidelines

1. **Write files** to the workspace root or appropriate subdirectories
2. **Read existing files** before modifying them
3. **Organize** code in logical directories:
   - `output/` - Generated outputs
   - `components/` - Reusable components
   - `components/agents/` - Agent definitions
   - `applets/` - Interactive applets
4. **Update** workspace memory with learnings

### Workspace Memory

{{#if memoryContent}}
```markdown
{{memoryContent}}
```
{{else}}
*No workspace memory file found*
{{/if}}

### System Memory (Recent Learnings)

{{#if systemMemory}}
```markdown
{{systemMemory}}
```
{{else}}
*No system memory available*
{{/if}}

---
