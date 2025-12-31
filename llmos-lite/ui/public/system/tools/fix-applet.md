---
name: fix-applet
type: tool
id: fix-applet
description: Use AI to analyze and fix compilation errors in applet code
version: 1.0.0
created_at: 2025-12-31
agent: AppletDebuggerAgent
parameters:
  - name: code
    type: string
    required: true
    description: The original applet code that failed to compile
  - name: error
    type: string
    required: true
    description: The compilation error message
  - name: appletName
    type: string
    required: false
    description: Name of the applet for context
  - name: attemptNumber
    type: number
    required: false
    default: 1
    description: Current fix attempt (1-3)
returns:
  type: object
  properties:
    success:
      type: boolean
      description: Whether the fix was successful
    fixedCode:
      type: string
      description: The fixed applet code
    explanation:
      type: string
      description: Brief explanation of what was fixed
    error:
      type: string
      description: Error message if fix failed
evolution_metrics:
  track:
    - fix_success_rate
    - error_types_fixed
    - average_attempts
  improve_on:
    - low_success_rate_errors
    - repeated_failures
---

# fix-applet Tool

Analyze and fix compilation errors in React applet code using AI.

## Purpose

This tool delegates to the **AppletDebuggerAgent** to analyze compilation errors and generate fixed code. It implements the **self-healing code** pattern where the system automatically attempts to fix broken code.

## When to Use

Use this tool when:
1. An applet fails to compile
2. The error is a code issue (not infrastructure like Babel loading)
3. You have fix attempts remaining (max 3)

## Implementation

This tool:
1. Reads the **AppletDebuggerAgent** markdown definition
2. Constructs a prompt with the error and code
3. Calls the LLM to generate fixed code
4. Validates the response has an Applet component
5. Returns the fixed code for recompilation

### Process:

```
error + code → AppletDebuggerAgent → fixed code → recompile
                      ↓
              (if still fails)
                      ↓
                retry (up to 3x)
```

## Example Usage

```tool
{
  "tool": "fix-applet",
  "inputs": {
    "code": "function App() { return <div>{items.map(i => <span>{i}</span>)}</div> }",
    "error": "No component found. Make sure your component is named \"Component\", \"Applet\", or \"App\".",
    "appletName": "Item List",
    "attemptNumber": 1
  }
}
```

### Example Response:

```json
{
  "success": true,
  "fixedCode": "function Applet() { const [items] = useState(['a', 'b', 'c']); return <div>{items.map((i, idx) => <span key={idx}>{i}</span>)}</div> }",
  "explanation": "Fixed on attempt 1"
}
```

## Error Categories

The tool handles these error types:

1. **Component Naming**: Renames to "Applet"
2. **TypeScript Annotations**: Removes type annotations
3. **Import/Export**: Removes import/export statements
4. **Undefined Variables**: Replaces with available globals
5. **Syntax Errors**: Fixes brackets, quotes, JSX issues
6. **External Libraries**: Replaces with vanilla React equivalents

## Infrastructure Errors (Not Fixable)

These errors cannot be fixed by this tool:
- "babel not available"
- "babel not loaded"
- "failed to load babel"
- "network error"
- "fetch failed"

## Integration with generate-applet

The `generate-applet` tool automatically calls `fix-applet` when compilation fails:

```
generate-applet(code)
    ↓
compile(code) → error?
    ↓ yes
fix-applet(code, error)
    ↓
compile(fixedCode) → still error?
    ↓ yes (attempt < 3)
fix-applet(fixedCode, newError)
    ↓
... (up to 3 attempts)
```

## Evolution

This tool evolves by:
- Tracking which error patterns it fixes successfully
- Learning from fix failures to improve prompts
- Building specialized fix strategies for common errors
- Creating new agent variants for specific error types

## Related

- **AppletDebuggerAgent**: Performs the actual code analysis and fixing
- **generate-applet**: Uses this tool for auto-fix during applet creation
- **AppletViewer**: UI component that can trigger manual fixes
