# LLMos Kernel Runtime Specification

## Overview
Transform LLMos-Lite from a chat interface into a true **Autonomous Runtime Environment** with self-correcting artifact execution.

## Architecture

### 1. Boot Sequence (OS-like)

```
┌─────────────────────────────────────────────┐
│ BIOS (boot.ts)                              │
│ - Initialize UI shell                       │
│ - Show boot splash                          │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ System Volume Loader                        │
│ - Fetch /system/kernel/runtime.wasm        │
│ - Fetch /system/kernel/stdlib.js           │
│ - Fetch /system/kernel/logger.js           │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ Kernel Initialization                       │
│ - Mount WASM runtime (QuickJS)             │
│ - Initialize Python runtime (Pyodide)      │
│ - Setup error interceptors                 │
│ - Register system libraries                │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│ User Space Ready                            │
│ - Load user artifacts                       │
│ - Enable LLM interaction                   │
└─────────────────────────────────────────────┘
```

### 2. Engine Architecture

#### Components

**a) Execution Sandbox (WASM-based)**
- **QuickJS-WASM**: For JavaScript artifact execution
- **Pyodide**: For Python artifact execution (already integrated)
- **Isolation**: Each artifact runs in sandboxed memory space

**b) Error Supervisor**
```typescript
interface ErrorContext {
  artifactId: string;
  code: string;
  error: {
    message: string;
    stack: string;
    line: number;
    column: number;
  };
  runtimeState: {
    variables: Record<string, any>;
    logs: string[];
    memoryUsage: number;
  };
  attemptCount: number;
}
```

**c) Self-Correction Loop**
```
Artifact Execution
       │
       ▼
   [Try Run] ──────────────────────┐
       │                           │
       ▼                           │
   Success? ──No──> Capture Error  │
       │                  │        │
      Yes                 ▼        │
       │            Analyze Context│
       ▼                  │        │
   Return Result    Send to LLM    │
                          │        │
                          ▼        │
                    Get Fixed Code │
                          │        │
                          └────────┘
                     (Max 3 attempts)
```

### 3. Directory Structure

```
llmos-lite/
├── ui/
│   ├── lib/
│   │   ├── kernel/
│   │   │   ├── boot.ts                    # Boot loader
│   │   │   ├── wasm-runtime.ts            # QuickJS WASM wrapper
│   │   │   ├── execution-supervisor.ts    # Error handling & refinement
│   │   │   ├── stdlib/                    # Standard library
│   │   │   │   ├── dom.ts                # DOM manipulation APIs
│   │   │   │   ├── fetch.ts              # Network APIs
│   │   │   │   └── storage.ts            # Storage APIs
│   │   │   └── logger.ts                  # Error-to-LLM bridge
│   │   └── pyodide-runtime.ts            # (existing - enhance)
│   └── components/
│       └── kernel/
│           ├── BootScreen.tsx            # Boot animation
│           ├── KernelStatus.tsx          # System status display
│           └── RefinementConsole.tsx     # Real-time error fixing UI
└── volumes/
    └── system/
        └── kernel/
            ├── runtime.wasm              # QuickJS WASM binary
            ├── stdlib.js                 # Compiled stdlib
            └── init.js                   # Kernel initialization script
```

## Implementation Phases

### Phase 1: Boot Loader & WASM Integration
- [ ] Create boot sequence with visual feedback
- [ ] Integrate QuickJS-WASM for JS artifact execution
- [ ] Setup volume-based kernel loading
- [ ] Create kernel status monitoring

### Phase 2: Error Supervisor & Self-Correction
- [ ] Implement error capture system
- [ ] Create LLM refinement prompts
- [ ] Build retry mechanism with limits
- [ ] Add state snapshot/restore

### Phase 3: Standard Library
- [ ] DOM manipulation APIs for artifacts
- [ ] Safe fetch/network APIs
- [ ] Storage APIs (local/session)
- [ ] Visualization helpers (canvas, WebGL)

### Phase 4: UI Enhancement
- [ ] Boot screen with OS-like loading
- [ ] Real-time refinement console
- [ ] Kernel metrics dashboard
- [ ] Artifact execution visualization

## Key Design Decisions

### 1. WASM vs JavaScript Execution

**Decision: Use QuickJS-WASM for JavaScript artifacts**

**Rationale:**
- **Isolation**: WASM provides complete memory isolation
- **Killable**: Can terminate infinite loops without UI freeze
- **Snapshots**: Can save/restore execution state
- **Safety**: Cannot access parent window directly

**Trade-offs:**
- Slight performance overhead for DOM operations
- Requires message passing for UI updates
- Larger initial download (~500KB for QuickJS)

### 2. Error Refinement Strategy

**Approach: Progressive Enhancement with Context**

```typescript
interface RefinementRequest {
  attempt: number;          // 1, 2, or 3
  originalPrompt: string;   // User's original request
  code: string;             // Current code version
  error: ErrorContext;      // Detailed error information
  previousAttempts: {       // Learning from failures
    code: string;
    error: string;
  }[];
}
```

**LLM Prompt Template:**
```
You are the LLMos Kernel Error Supervisor. An artifact has failed execution.

Original User Request: {originalPrompt}

Current Code:
{code}

Error Details:
- Message: {error.message}
- Stack: {error.stack}
- Line: {error.line}
- Runtime State: {error.runtimeState}

Previous Failed Attempts: {previousAttempts.length}
{previousAttempts.map(a => `- Error: ${a.error}`)}

Task: Provide ONLY the corrected code. Do not explain. The code must:
1. Fix the specific error mentioned
2. Not repeat previous failure patterns
3. Be production-ready and safe

Output format: Raw code only, no markdown.
```

### 3. Kernel API for Artifacts

Artifacts will have access to a limited, safe API:

```typescript
// Available to all artifacts in sandbox
interface KernelAPI {
  // DOM (safe, sandboxed)
  dom: {
    createElement(tag: string): Element;
    querySelector(selector: string): Element | null;
    // ... limited DOM operations
  };

  // Visualization
  viz: {
    createCanvas(width: number, height: number): HTMLCanvasElement;
    plot(data: any, options: any): void;
    render3D(scene: any): void;
  };

  // Storage (scoped to artifact)
  storage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
  };

  // Logging
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}
```

## Performance Considerations

### Startup Time
- QuickJS WASM: ~100ms initialization
- Pyodide: ~2-3s initialization (existing)
- Total boot time target: <5s

### Runtime Performance
- JS artifacts via QuickJS: ~80% of native speed
- Python via Pyodide: ~50% of native speed
- Acceptable for most data viz/quantum simulation use cases

### Memory Management
- Each artifact gets isolated memory pool
- Automatic cleanup on artifact unload
- Kernel enforces memory limits (e.g., 500MB per artifact)

## Security Model

### Sandboxing
1. **No direct window access**: Artifacts cannot access parent window
2. **API whitelist**: Only approved APIs exposed via KernelAPI
3. **Network restrictions**: Fetch limited to approved domains
4. **Storage isolation**: Each artifact has private storage namespace

### Error Handling
- All errors caught and sanitized before display
- Stack traces filtered to remove internal kernel paths
- No exposure of system internals

## Next Steps

1. **Proof of Concept**: Simple boot loader with QuickJS
2. **Error Capture**: Basic error supervisor without LLM
3. **Self-Correction**: Add LLM refinement loop
4. **Polish**: Boot UI, kernel dashboard, refinement console

## References

- QuickJS-WASM: https://github.com/justjake/quickjs-emscripten
- Pyodide: https://pyodide.org/
- WebAssembly Security: https://webassembly.org/docs/security/
