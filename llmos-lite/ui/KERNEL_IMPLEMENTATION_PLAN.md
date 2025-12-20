# Kernel Runtime Implementation Plan

## Executive Summary

Transform LLMos-Lite into a self-correcting runtime environment with:
- OS-like boot sequence loading kernel from system volume
- WASM-based sandboxed execution for artifacts
- Automatic error detection and LLM-powered code refinement
- Real-time feedback and execution visualization

## Technology Stack Decision

### Execution Engine: **Hybrid WASM + Native**

**For JavaScript Artifacts: QuickJS-WASM**
- Pros: Complete isolation, killable execution, state snapshots
- Cons: ~500KB download, slight performance overhead
- Use case: Untrusted or experimental code from LLM

**For Python Artifacts: Pyodide (existing)**
- Already integrated and working well
- Excellent for scientific computing (quantum, plotting)
- Keep current implementation, enhance error handling

**For Trusted Code: Native JavaScript**
- Direct execution for verified artifacts from system volume
- Maximum performance for UI components
- No sandboxing overhead

### Decision Matrix

| Artifact Source | Engine | Rationale |
|----------------|---------|-----------|
| LLM-generated (new) | QuickJS-WASM | Needs isolation & refinement |
| User-edited (temporal) | QuickJS-WASM | Might have errors |
| System volume (verified) | Native JS | Trusted, needs performance |
| Python code | Pyodide | Existing integration, scientific |

## Implementation Roadmap

### Milestone 1: Boot System (Week 1)
**Goal**: Create OS-like boot experience with kernel loading

**Tasks**:
1. Create `lib/kernel/boot.ts` - Boot orchestrator
2. Create `components/kernel/BootScreen.tsx` - Visual boot UI
3. Enhance `lib/volume-loader.ts` - Priority kernel loading
4. Add system volume kernel artifacts:
   - `/system/kernel/stdlib.js` - Standard library
   - `/system/kernel/init.js` - Initialization script

**Deliverable**: App boots with loading screen, downloads kernel from system volume

### Milestone 2: QuickJS Integration (Week 2)
**Goal**: Execute JavaScript artifacts in WASM sandbox

**Tasks**:
1. Add QuickJS dependency: `quickjs-emscripten`
2. Create `lib/kernel/wasm-runtime.ts` - WASM execution wrapper
3. Create `lib/kernel/kernel-api.ts` - Safe API for artifacts
4. Update `ArtifactDualView.tsx` - Use WASM for execution

**Deliverable**: JavaScript artifacts execute in isolated WASM environment

### Milestone 3: Error Supervisor (Week 3)
**Goal**: Capture and analyze execution errors

**Tasks**:
1. Create `lib/kernel/execution-supervisor.ts`:
   - Error capture & context extraction
   - Execution state snapshots
   - Retry logic with limits
2. Create `lib/kernel/logger.ts` - Structured logging
3. Create `components/kernel/ExecutionTrace.tsx` - Error visualization

**Deliverable**: Errors are captured with full context, displayed to user

### Milestone 4: Self-Correction Loop (Week 4)
**Goal**: Automatic LLM-powered code refinement

**Tasks**:
1. Create refinement prompt templates in `lib/kernel/refinement-prompts.ts`
2. Integrate with existing LLM client (`lib/llm-client.ts`)
3. Create `components/kernel/RefinementConsole.tsx`:
   - Show error → fix → retry sequence
   - Display "thinking" state during LLM call
   - Show diff between versions
4. Add refinement to supervisor workflow

**Deliverable**: Failed artifacts auto-fix and retry transparently

### Milestone 5: Standard Library (Week 5)
**Goal**: Provide safe, useful APIs to artifacts

**Tasks**:
1. Create `lib/kernel/stdlib/` directory:
   - `dom.ts` - Safe DOM manipulation
   - `viz.ts` - Canvas/plotting helpers
   - `storage.ts` - Scoped localStorage
   - `quantum.ts` - Quantum circuit helpers
2. Bundle stdlib into `/system/kernel/stdlib.js`
3. Auto-inject into WASM runtime

**Deliverable**: Artifacts can use rich APIs without unsafe access

### Milestone 6: UI Polish (Week 6)
**Goal**: Professional, OS-like user experience

**Tasks**:
1. Enhance `BootScreen.tsx`:
   - Loading bars for kernel modules
   - "Mounting volumes..." messages
   - Kernel version display
2. Create `components/kernel/KernelDashboard.tsx`:
   - Active artifacts
   - Memory usage
   - Error history
3. Add real-time execution feedback in chat
4. Animations and transitions

**Deliverable**: Polished, professional kernel experience

## Technical Specifications

### Boot Sequence Implementation

```typescript
// lib/kernel/boot.ts
export class KernelBootLoader {
  private stages = [
    { name: 'Initializing system...', duration: 500 },
    { name: 'Mounting volumes...', duration: 800 },
    { name: 'Loading kernel runtime...', duration: 1200 },
    { name: 'Initializing Python environment...', duration: 2000 },
    { name: 'Loading standard library...', duration: 600 },
    { name: 'System ready', duration: 300 }
  ];

  async boot(onProgress: (stage: string, percent: number) => void): Promise<void> {
    let totalTime = 0;
    const allTime = this.stages.reduce((sum, s) => sum + s.duration, 0);

    for (const stage of this.stages) {
      onProgress(stage.name, (totalTime / allTime) * 100);

      // Actual work happens here
      switch (stage.name) {
        case 'Loading kernel runtime...':
          await this.loadWASMRuntime();
          break;
        case 'Initializing Python environment...':
          await this.initPyodide();
          break;
        case 'Loading standard library...':
          await this.loadStdLib();
          break;
      }

      await new Promise(resolve => setTimeout(resolve, stage.duration));
      totalTime += stage.duration;
    }

    onProgress('System ready', 100);
  }

  private async loadWASMRuntime(): Promise<void> {
    // Fetch /system/kernel/runtime.wasm
    // Initialize QuickJS
  }

  private async initPyodide(): Promise<void> {
    // Use existing pyodide-runtime.ts
  }

  private async loadStdLib(): Promise<void> {
    // Fetch /system/kernel/stdlib.js
    // Register in WASM context
  }
}
```

### Error Supervisor Implementation

```typescript
// lib/kernel/execution-supervisor.ts
export interface ExecutionContext {
  artifactId: string;
  code: string;
  language: 'javascript' | 'python';
  attempt: number;
  maxAttempts: number;
}

export interface ErrorReport {
  message: string;
  stack: string;
  line: number;
  column: number;
  runtimeState: {
    variables: Record<string, any>;
    logs: string[];
    memoryUsage: number;
  };
}

export class ExecutionSupervisor {
  constructor(
    private wasmRuntime: WASMRuntime,
    private llmClient: LLMClient
  ) {}

  async executeWithRefinement(
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const history: { code: string; error: string }[] = [];

    while (context.attempt <= context.maxAttempts) {
      try {
        // Try execution
        const result = await this.execute(context);
        return { success: true, result, attempts: context.attempt };

      } catch (error) {
        // Capture error context
        const errorReport = this.captureError(error, context);

        if (context.attempt >= context.maxAttempts) {
          // Give up after max attempts
          return {
            success: false,
            error: errorReport,
            attempts: context.attempt,
            history
          };
        }

        // Request fix from LLM
        const fixedCode = await this.requestRefinement({
          originalCode: context.code,
          error: errorReport,
          attempt: context.attempt,
          history
        });

        // Update context for retry
        history.push({ code: context.code, error: errorReport.message });
        context.code = fixedCode;
        context.attempt++;
      }
    }
  }

  private async execute(context: ExecutionContext): Promise<any> {
    if (context.language === 'javascript') {
      return await this.wasmRuntime.execute(context.code);
    } else if (context.language === 'python') {
      // Use existing Pyodide runtime
      return await executePython(context.code);
    }
  }

  private captureError(error: any, context: ExecutionContext): ErrorReport {
    return {
      message: error.message,
      stack: error.stack,
      line: this.extractLine(error),
      column: this.extractColumn(error),
      runtimeState: this.wasmRuntime.getState()
    };
  }

  private async requestRefinement(params: {
    originalCode: string;
    error: ErrorReport;
    attempt: number;
    history: { code: string; error: string }[];
  }): Promise<string> {
    const prompt = this.buildRefinementPrompt(params);
    const response = await this.llmClient.chatDirect([
      { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]);

    return this.extractCode(response);
  }

  private buildRefinementPrompt(params: any): string {
    return `
Code that failed:
\`\`\`javascript
${params.originalCode}
\`\`\`

Error at line ${params.error.line}:
${params.error.message}

Stack trace:
${params.error.stack}

Runtime state:
${JSON.stringify(params.error.runtimeState, null, 2)}

This is attempt ${params.attempt}. Previous failures:
${params.history.map((h, i) => `Attempt ${i + 1}: ${h.error}`).join('\n')}

Provide ONLY the corrected code. No explanation.
`;
  }
}
```

### Kernel API Implementation

```typescript
// lib/kernel/kernel-api.ts
export interface KernelAPI {
  dom: DOMAdapter;
  viz: VisualizationAPI;
  storage: StorageAPI;
  log: LogAPI;
}

class DOMAdapter {
  // Safe, scoped DOM operations
  createElement(tag: string, props?: any): HTMLElement {
    // Sanitize and create element
    const allowed = ['div', 'span', 'canvas', 'svg'];
    if (!allowed.includes(tag)) {
      throw new Error(`Tag ${tag} not allowed`);
    }
    const elem = document.createElement(tag);
    // Apply safe props only
    return elem;
  }

  querySelector(selector: string): HTMLElement | null {
    // Scope to artifact container only
    const container = document.querySelector(`#artifact-${this.artifactId}`);
    return container?.querySelector(selector) || null;
  }
}

class VisualizationAPI {
  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(width, 2000); // Limit size
    canvas.height = Math.min(height, 2000);
    return canvas;
  }

  plot(data: any, options?: any): void {
    // Wrapper around plotting library
    // Auto-detect data format and create appropriate visualization
  }

  render3D(scene: any): void {
    // Wrapper around Three.js for 3D rendering
  }

  renderQuantumCircuit(circuit: QuantumCircuitData): void {
    // Use existing CircuitRenderer
  }
}

class StorageAPI {
  private prefix: string;

  constructor(artifactId: string) {
    this.prefix = `artifact:${artifactId}:`;
  }

  async get(key: string): Promise<any> {
    const value = localStorage.getItem(this.prefix + key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any): Promise<void> {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }
}

class LogAPI {
  constructor(private artifactId: string) {}

  info(message: string): void {
    console.log(`[Artifact ${this.artifactId}] ${message}`);
    this.sendToKernelLog('info', message);
  }

  warn(message: string): void {
    console.warn(`[Artifact ${this.artifactId}] ${message}`);
    this.sendToKernelLog('warn', message);
  }

  error(message: string): void {
    console.error(`[Artifact ${this.artifactId}] ${message}`);
    this.sendToKernelLog('error', message);
  }

  private sendToKernelLog(level: string, message: string): void {
    // Send to kernel logger for persistence
  }
}

// Factory function to create API for each artifact
export function createKernelAPI(artifactId: string): KernelAPI {
  return {
    dom: new DOMAdapter(artifactId),
    viz: new VisualizationAPI(artifactId),
    storage: new StorageAPI(artifactId),
    log: new LogAPI(artifactId)
  };
}
```

## File Structure Summary

```
llmos-lite/ui/
├── lib/
│   └── kernel/
│       ├── boot.ts                      # Boot orchestrator
│       ├── wasm-runtime.ts              # QuickJS wrapper
│       ├── execution-supervisor.ts       # Error handling & refinement
│       ├── kernel-api.ts                # Safe APIs for artifacts
│       ├── logger.ts                    # Kernel logging system
│       ├── refinement-prompts.ts        # LLM prompts for fixing
│       └── stdlib/
│           ├── dom.ts                   # DOM utilities
│           ├── viz.ts                   # Visualization helpers
│           ├── storage.ts               # Storage APIs
│           └── quantum.ts               # Quantum helpers
├── components/
│   └── kernel/
│       ├── BootScreen.tsx               # Boot animation
│       ├── KernelDashboard.tsx          # System status
│       ├── RefinementConsole.tsx        # Error fixing UI
│       └── ExecutionTrace.tsx           # Execution visualization
└── volumes/
    └── system/
        └── kernel/
            ├── stdlib.js                # Bundled standard library
            └── init.js                  # Kernel init script
```

## Testing Strategy

### Unit Tests
- Each kernel module isolated
- Mock WASM runtime for fast tests
- Test error scenarios extensively

### Integration Tests
- Full boot sequence
- Artifact execution end-to-end
- Error refinement workflow

### Performance Tests
- Boot time < 5s
- WASM execution overhead < 20%
- Memory usage within limits

## Rollout Plan

### Phase 1: Foundation (Weeks 1-2)
- Boot system working
- WASM runtime integrated
- Basic artifact execution

### Phase 2: Self-Correction (Weeks 3-4)
- Error capture working
- LLM refinement functional
- UI shows refinement process

### Phase 3: Polish (Weeks 5-6)
- Standard library complete
- Professional UI
- Performance optimized

## Success Metrics

1. **Boot Time**: < 5 seconds from page load to ready
2. **Error Recovery**: > 80% of simple errors auto-fixed
3. **User Experience**: Smooth, professional, OS-like feel
4. **Performance**: WASM overhead < 20% vs native
5. **Reliability**: No UI freezes from bad artifact code

## Next Actions

1. Review and approve this plan
2. Set up QuickJS dependency
3. Create boot screen mockup
4. Implement Phase 1: Boot system

Would you like me to start implementation, or would you prefer to discuss any modifications to this plan first?
