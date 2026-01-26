---
name: ToolExecutionContinuationPrompt
type: system
version: "1.0"
description: Prompt to encourage tool execution when agent provides analysis without action
variables:
  - name: iteration
    type: number
    description: Current iteration number
  - name: minIterations
    type: number
    description: Minimum required iterations
evolved_from: null
origin: extracted
extracted_from: lib/system-agent-orchestrator.ts:473
---

# Tool Execution Required

You provided analysis but no tool calls. Please execute the required actions now using tool calls.

## Remember to:

1. **Create sub-agent markdown files** using `write-file`
   - Define agent capabilities and system prompt
   - Include proper frontmatter with metadata
   - Save to `{{workspacePath}}/components/agents/`

2. **Execute code** using `invoke-subagent` or `execute-python`
   - Generate Python code based on agent instructions
   - Track execution with invoke-subagent for evolution
   - Save outputs to appropriate directories

3. **Generate applets** using `generate-applet` if interactive UI is needed
   - Create React components for user interaction
   - Use function declaration syntax (not arrow functions)
   - Include proper state management

## Current Status

- Iteration: {{iteration}}/{{minIterations}}
- Tools executed: None yet
- Action required: Start with your first tool call NOW

## Next Step

Identify the most critical action needed to make progress and execute it immediately with a tool call.
