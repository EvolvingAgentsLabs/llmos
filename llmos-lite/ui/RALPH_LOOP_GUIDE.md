# Ralph Loop - Self-Correcting Runtime System

## Overview

The Ralph Loop is LLMos-Lite's implementation of the "Ralph Wiggum Pattern" from Claude Code - a self-correcting execution system where code errors automatically trigger refinement loops.

**Named after Ralph Wiggum's famous quote:** *"I'm helping!"* - because the system helps itself by learning from mistakes.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Request                           │
│              "Create quantum circuit..."                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM Response                             │
│              Generated Python Code                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Runtime Executor                            │
│          (Pyodide, QuickJS, etc.)                          │
└───────────┬──────────────────────┬──────────────────────────┘
            │ Success              │ Error
            ▼                      ▼
      ┌─────────┐         ┌──────────────────┐
      │ Display │         │   Ralph Loop     │
      │ Result  │         │   Triggered      │
      └─────────┘         └────────┬─────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Error Formatter     │
                        │  Creates Prompt      │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   LLM Refinement     │
                        │  "Fix this error..." │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Refined Code        │
                        │  Re-execute          │
                        └──────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
              ✓ Success                    ✗ Still Fails
              Display                      Try Again
              (up to maxAttempts)          (max 3 attempts)
```

## File Structure

The Ralph Loop system is organized in the **system drive** under `/runtime`:

```
system/
└── runtime/
    ├── ralph-loop.ts           # Core refinement loop engine
    ├── error-handler.ts        # Error handling & LLM integration
    ├── pyodide-runtime.ts      # Python executor (WASM)
    ├── quickjs-runtime.ts      # JavaScript executor (WASM)
    └── kernel-executor.ts      # Multi-language dispatcher
```

## Usage

### 1. Basic Usage (Manual)

```typescript
import { getRalphLoop, RalphLoop } from '@/lib/runtime/ralph-loop';
import { executePython } from '@/lib/pyodide-runtime';
import { createLLMClient } from '@/lib/llm-client';

const ralphLoop = getRalphLoop({
  maxAttempts: 3,
  enableAutoFix: true
});

const llmClient = createLLMClient();

const result = await ralphLoop.executeWithRefinement(
  pythonCode,
  // Executor function
  async (code) => executePython(code),
  // Refiner function (calls LLM)
  async (context) => {
    const prompt = RalphLoop.createRefinementPrompt(context);
    const response = await llmClient.chatDirect([
      { role: 'user', content: prompt }
    ]);
    return extractCode(response);
  },
  'python'
);

if (result.success) {
  console.log('Executed successfully after', result.attempts, 'attempts');
  if (result.refinedCode) {
    console.log('Code was auto-fixed!');
  }
}
```

### 2. Using the Error Handler (Recommended)

```typescript
import { getErrorHandler } from '@/lib/runtime/error-handler';
import { createLLMClient } from '@/lib/llm-client';

const llmClient = createLLMClient();
const errorHandler = getErrorHandler({
  enableAutoFix: true,
  maxAttempts: 3,
  onRefinementStart: (context) => {
    console.log(`Refinement attempt ${context.attempt}/${context.maxAttempts}`);
    console.log('Error:', context.error);
  },
  onRefinementComplete: (code, result) => {
    console.log('Code successfully refined!');
  }
});

const result = await errorHandler.executeWithAutoFix(
  pythonCode,
  'python',
  llmClient
);
```

### 3. Integration with ChatPanel

The Ralph Loop is automatically used in the chat interface when:
1. User enables "Auto-fix errors" in settings
2. Code execution fails
3. LLM client is configured

```typescript
// In ChatPanel.tsx
const handleCodeExecution = async (code: string) => {
  const llmClient = createLLMClient();
  const errorHandler = getErrorHandler({ enableAutoFix: userSettings.autoFix });

  const result = await errorHandler.executeWithAutoFix(
    code,
    'python',
    llmClient
  );

  return result;
};
```

## Configuration

### RalphLoopConfig

```typescript
interface RalphLoopConfig {
  maxAttempts: number;              // Default: 3
  enableAutoFix: boolean;           // Default: true
  onRefinementStart?: (context) => void;
  onRefinementComplete?: (context, result) => void;
  onRefinementFailed?: (context) => void;
}
```

### ErrorHandlerConfig

```typescript
interface ErrorHandlerConfig {
  enableAutoFix: boolean;           // Default: false (opt-in)
  maxAttempts: number;              // Default: 3
  onRefinementStart?: (context) => void;
  onRefinementComplete?: (code, result) => void;
  onRefinementFailed?: (context) => void;
}
```

## Hook System (Claude Code Pattern)

The Ralph Loop uses a hook architecture for extensibility:

```typescript
import { getHookManager } from '@/lib/runtime/ralph-loop';

const hookManager = getHookManager();

// Pre-execution hook (e.g., security check)
hookManager.registerPreHook('python-executor', async (context) => {
  if (context.input.includes('os.system')) {
    console.warn('Potentially unsafe code detected');
    return 'stop'; // Prevent execution
  }
  return undefined; // Continue
});

// Post-execution hook (e.g., trigger Ralph Loop)
hookManager.registerPostHook('python-executor', async (context) => {
  if (!context.output.success) {
    console.log('Execution failed, triggering Ralph Loop...');
    return 'retry'; // Trigger refinement
  }
  return undefined; // Continue normally
});
```

## Error Types & Handling

The system recognizes and formats common error types:

| Error Type | Example | Auto-Fix Strategy |
|------------|---------|-------------------|
| **ImportError** | `No module named 'qiskit'` | Auto-load package via Pyodide |
| **SyntaxError** | `invalid syntax` | Fix indentation, quotes, parentheses |
| **NameError** | `name 'x' is not defined` | Add variable definition |
| **TypeError** | `unsupported operand type` | Fix type conversions |

### Example: Import Error Handling

**Original Error:**
```
ModuleNotFoundError: No module named 'qiskit'
```

**Ralph Loop Refinement:**
1. Detects import error
2. Creates prompt: "Add package loading for 'qiskit'"
3. LLM generates:
```python
# Load required package
import micropip
await micropip.install('qiskit')

# Original code
from qiskit import QuantumCircuit
...
```
4. Re-executes successfully

## Best Practices

### 1. Progressive Disclosure
Don't show users all the refinement attempts. Instead:
- Show loading indicator during refinement
- Only display final result (success or final error)
- Optionally show "Auto-fixed" badge if refined

### 2. Attempt Limits
Keep `maxAttempts` low (3-5):
- Prevents infinite loops
- Reduces API costs
- Maintains user experience

### 3. Error Context
Always provide context in refinement prompts:
- Original code
- Error message
- Previous attempts (if any)
- Language and runtime info

### 4. User Control
Let users:
- Enable/disable auto-fix
- View refinement history
- Override auto-fixes
- Adjust attempt limits

## System Volume Integration

The Ralph Loop is a **system artifact**, meaning:

1. **Read-only**: Users can't edit the core loop logic
2. **Globally available**: All sessions can use it
3. **Auto-loaded**: Boots with the system drive
4. **Versioned**: Tracks refinements in `.local.md` files

### Boot Sequence

```
1. System Drive Mounts
   ├── Load /runtime/ralph-loop.ts
   ├── Load /runtime/error-handler.ts
   └── Initialize hook manager

2. Runtime Artifacts Indexed
   ├── Python Executor (Pyodide)
   ├── JavaScript Executor (QuickJS)
   └── Error Formatter

3. Hooks Registered
   ├── PreToolUse: Security Check
   ├── PostToolUse: Error Detection
   └── Stop: Completion Validation

4. Ready for Execution
```

## Comparison to Claude Code

| Feature | Claude Code | LLMos Ralph Loop |
|---------|-------------|------------------|
| **Trigger** | `Stop` hook | PostToolUse hook |
| **Refinement** | Manual prompt engineering | Auto-generated prompts |
| **Languages** | Multi-language | Python, JS, TS |
| **Max Attempts** | User-defined | 3 (default) |
| **State** | Plugin JSON | Runtime context |
| **Integration** | CLI-based | Browser-based WASM |

## Debugging

Enable detailed logging:

```typescript
const ralphLoop = getRalphLoop({
  maxAttempts: 3,
  onRefinementStart: (context) => {
    console.log('[RalphLoop] Attempt', context.attempt);
    console.log('[RalphLoop] Error:', context.error);
    console.log('[RalphLoop] Code:', context.originalCode);
  },
  onRefinementComplete: (context, result) => {
    console.log('[RalphLoop] Success after', context.attempt, 'attempts');
    console.log('[RalphLoop] Execution time:', result.executionTime, 'ms');
  },
  onRefinementFailed: (context) => {
    console.error('[RalphLoop] Failed after', context.maxAttempts, 'attempts');
    console.error('[RalphLoop] Final error:', context.error);
  }
});
```

## Future Enhancements

1. **Skill Learning**: Save successful refinements as skills
2. **Pattern Recognition**: Detect common errors and cache fixes
3. **Multi-Agent Refinement**: Use specialized debugging agents
4. **Cost Optimization**: Use smaller models for simple fixes
5. **A/B Testing**: Compare different refinement strategies

## Related Files

- `/lib/runtime/ralph-loop.ts` - Core implementation
- `/lib/runtime/error-handler.ts` - LLM integration
- `/lib/pyodide-runtime.ts` - Python executor
- `/components/chat/MarkdownRenderer.tsx` - UI integration
- `/QUANTUM_CEPSTRAL_WORKING_EXAMPLE.md` - Usage example

## Support

For issues or questions:
1. Check the error handler logs
2. Review refinement history
3. Adjust `maxAttempts` configuration
4. Disable auto-fix if needed

---

**Remember:** *"I'm helping!"* - The Ralph Loop is always working to make your code better.
