# LLMos-Lite Codebase Analysis & Refactoring Guide

**Generated:** December 2024
**Purpose:** Comprehensive analysis of unused code, refactoring opportunities, and architectural improvements

---

## Executive Summary

After thorough analysis of the LLMos-Lite codebase (~221 source files, 34MB), this report identifies:

| Category | Count | Priority |
|----------|-------|----------|
| **Dead/Unused Files** | 22 files | High - Safe to remove |
| **Duplicate Code** | 8 pairs | High - Consolidate |
| **Oversized Components** | 6 files | Medium - Split |
| **Architecture Issues** | 12 items | Medium - Refactor |
| **Design Pattern Gaps** | 8 areas | Low - Improve |

**Estimated Cleanup Impact:** ~3,500 lines of dead code removal, ~2,000 lines of duplicate consolidation

---

## Table of Contents

1. [Dead Code - Safe to Remove](#1-dead-code---safe-to-remove)
2. [Duplicate Code - Consolidate](#2-duplicate-code---consolidate)
3. [Oversized Files - Split](#3-oversized-files---split)
4. [Component Organization Issues](#4-component-organization-issues)
5. [Architecture Improvements](#5-architecture-improvements)
6. [Design Pattern Recommendations](#6-design-pattern-recommendations)
7. [Refactoring Roadmap](#7-refactoring-roadmap)

---

## 1. Dead Code - Safe to Remove

### 1.1 Frontend Library Files (TypeScript)

These files have **zero imports** across the entire codebase:

| File | Path | Lines | Reason |
|------|------|-------|--------|
| `quantum-solver.ts` | `ui/lib/quantum-solver.ts` | ~200 | Unused quantum circuit solver |
| `openqasm-bridge.ts` | `ui/lib/openqasm-bridge.ts` | ~200 | Unused OpenQASM bridge |
| `session-storage.ts` | `ui/lib/session-storage.ts` | 138 | Replaced by other storage mechanism |
| `vector-search.ts` | `ui/lib/vector-search.ts` | ~150 | Unused semantic search |
| `skill-executor.ts` | `ui/lib/skill-executor.ts` | ~300 | Superseded by agent-executor |
| `workflow-executor.ts` | `ui/lib/workflow-executor.ts` | ~400 | Unused workflow DAG executor |
| `industry-templates.ts` | `ui/lib/industry-templates.ts` | ~350 | Unused template library |
| `refinement-service.ts` | `ui/lib/kernel/refinement-service.ts` | ~200 | Unused refinement logic |
| `error-supervisor.ts` | `ui/lib/kernel/error-supervisor.ts` | ~200 | Unused error supervision |
| `error-handler.ts` | `ui/lib/runtime/error-handler.ts` | ~100 | Unused runtime error handling |
| `ralph-loop.ts` | `ui/lib/runtime/ralph-loop.ts` | ~150 | Unused Ralph loop implementation |
| `websocket-client.ts` | `ui/lib/collaboration/websocket-client.ts` | ~200 | Unused WebSocket client |
| `latent-scratchpad.ts` | `ui/lib/memory/latent-scratchpad.ts` | ~150 | Unused memory scratchpad |
| `git-tools.ts` | `ui/lib/llm-tools/git-tools.ts` | 59 | Superseded by git-tools-enhanced.ts |
| `file-operations-wasm.ts` | `ui/lib/volumes/file-operations-wasm.ts` | ~200 | Never imported (marked as "drop-in replacement") |

**Total: ~2,997 lines of dead code**

### 1.2 Backend Files (Python)

| File | Path | Issue |
|------|------|-------|
| `vercel_kv.py` | `api/lib/vercel_kv.py` | 7,896 bytes - Never imported |
| `ui/core/` (entire directory) | `llmos-lite/ui/core/` | **DUPLICATE** of `llmos-lite/core/` |

**Critical:** The entire `ui/core/` directory is a copy of `core/`:
- `ui/core/volumes.py` = `core/volumes.py`
- `ui/core/volumes_vercel.py` = `core/volumes_vercel.py`
- `ui/core/skills.py` = `core/skills.py`
- `ui/core/workflow.py` = `core/workflow.py`
- `ui/core/evolution.py` = `core/evolution.py`
- `ui/core/sessions_vercel.py` = `core/sessions_vercel.py`

### 1.3 Unused Component

| Component | Path | Issue |
|-----------|------|-------|
| `VolumeExplorer.tsx` | `components/explorer/VolumeExplorer.tsx` | Never imported anywhere |

### Removal Commands

```bash
# Frontend dead code
rm llmos-lite/ui/lib/quantum-solver.ts
rm llmos-lite/ui/lib/openqasm-bridge.ts
rm llmos-lite/ui/lib/session-storage.ts
rm llmos-lite/ui/lib/vector-search.ts
rm llmos-lite/ui/lib/skill-executor.ts
rm llmos-lite/ui/lib/workflow-executor.ts
rm llmos-lite/ui/lib/industry-templates.ts
rm llmos-lite/ui/lib/kernel/refinement-service.ts
rm llmos-lite/ui/lib/kernel/error-supervisor.ts
rm llmos-lite/ui/lib/runtime/error-handler.ts
rm llmos-lite/ui/lib/runtime/ralph-loop.ts
rm llmos-lite/ui/lib/collaboration/websocket-client.ts
rm llmos-lite/ui/lib/memory/latent-scratchpad.ts
rm llmos-lite/ui/lib/llm-tools/git-tools.ts
rm llmos-lite/ui/lib/volumes/file-operations-wasm.ts

# Backend dead code
rm llmos-lite/api/lib/vercel_kv.py
rm -rf llmos-lite/ui/core/  # ENTIRE DUPLICATE DIRECTORY

# Unused component
rm llmos-lite/ui/components/explorer/VolumeExplorer.tsx
```

---

## 2. Duplicate Code - Consolidate

### 2.1 Pyodide Runtime Implementations

| Primary | Secondary | Issue |
|---------|-----------|-------|
| `pyodide-runtime.ts` (16 KB) | `pyodide-runner.ts` (3.3 KB) | Runner is thin wrapper |

**Recommendation:** Merge `pyodide-runner.ts` into `pyodide-runtime.ts`

### 2.2 LLM Client Variations

| File | Size | Purpose |
|------|------|---------|
| `llm-client.ts` | 8.8 KB | Core LLM client with OpenRouter |
| `llm-client-enhanced.ts` | 8.0 KB | Adds Claude Code-style file tools |

**Issue:** Overlapping interfaces and methods
**Recommendation:** Create unified `llm-client/` module:
```
lib/llm-client/
├── index.ts           # Public API
├── client.ts          # Core client logic
├── tools.ts           # Tool definitions
├── types.ts           # Shared types
└── streaming.ts       # Streaming support
```

### 2.3 Git Services (Different Purposes)

| File | Implementation | Use Case |
|------|----------------|----------|
| `git-service.ts` | GitHub REST API | Remote git operations |
| `git/wasm-git-client.ts` | isomorphic-git + LightningFS | Local git operations |

**Recommendation:** Document when to use each:
- `git-service.ts` → For GitHub API operations (PR, issues, etc.)
- `wasm-git-client.ts` → For local file operations

### 2.4 File Tree Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `VSCodeFileTree.tsx` | 944 | Full-featured tree |
| `VolumeFileTree.tsx` | 259 | Simplified artifact tree |
| `VolumeExplorer.tsx` | unused | Redundant (DELETE) |

**Recommendation:** Create configurable base component:
```typescript
// components/common/FileTree.tsx
interface FileTreeProps {
  mode: 'full' | 'compact' | 'artifact';
  showIcons?: boolean;
  showContextMenu?: boolean;
  // ...
}
```

### 2.5 Canvas/Artifact View Components

6 overlapping implementations:
- `CanvasView.tsx` (934 lines)
- `SplitViewCanvas.tsx` (285 lines)
- `ThreeJSCanvas.tsx` (195 lines)
- `ArtifactDualView.tsx` (221 lines)
- `CodeView.tsx` (286 lines)
- `RenderView.tsx` (156 lines)

**Recommendation:** Use Compound Component pattern:
```typescript
// components/canvas/Canvas.tsx
<Canvas>
  <Canvas.Code />
  <Canvas.Preview />
  <Canvas.Toolbar />
</Canvas>
```

### 2.6 Layout Components

| Component | Lines | Status |
|-----------|-------|--------|
| `TerminalLayout.tsx` | 190 | Original |
| `TerminalLayoutNew.tsx` | 222 | Incomplete refactor |
| `SimpleLayout.tsx` | 232 | Alternate layout |
| `FluidLayout.tsx` | 343 | JARVIS layout |

**Recommendation:** Keep `FluidLayout.tsx`, delete others or merge into configurable layout

---

## 3. Oversized Files - Split

### Components Over 500 Lines

| Component | Lines | Issues | Recommended Split |
|-----------|-------|--------|-------------------|
| **AppletGrid.tsx** | 1,368 | 12+ nested functions | `AppletIcon.tsx`, `AppletCard.tsx`, `AppletViewMode.tsx` |
| **CanvasView.tsx** | 934 | Multiple nested components | `FileIcon.tsx`, `ImagePreview.tsx`, `CodeBlock.tsx` |
| **VSCodeFileTree.tsx** | 944 | Custom icons + logic | Extract icons to `icons/VSCodeIcons.tsx` |
| **SystemEvolutionModal.tsx** | 677 | Complex state | Split into `EvolutionStats.tsx`, `PatternList.tsx` |
| **QuantumCircuitDesigner.tsx** | 631 | Mixed concerns | `CircuitGraph.tsx`, `ExecutionManager.tsx` |
| **ChatPanel.tsx** | 623 | Business logic in UI | Extract to `useChat.ts`, `useAgent.ts` hooks |

### Library Files Over 20KB

| File | Size | Concern |
|------|------|---------|
| `lens-evolution.ts` | 43 KB | Very complex - review usage |
| `quantum-designer.ts` | 36 KB | Complex but heavily used |
| `mutation-engine.ts` | 32 KB | Complex - verify necessity |
| `system-evolution.ts` | 26 KB | Core feature - keep but document |
| `system-tools.ts` | 24 KB | Review tool definitions |

---

## 4. Component Organization Issues

### 4.1 Directory Naming Inconsistencies

```
❌ Current (Inconsistent):
├── panel1-volumes/     # kebab-case with numbers
├── panel2-session/     # kebab-case with numbers
├── panel3-artifacts/   # kebab-case with numbers
├── workspace/          # camelCase
├── applets/            # camelCase

✓ Recommended:
├── panels/
│   ├── volumes/
│   ├── session/
│   └── artifacts/
├── workspace/
├── applets/
```

### 4.2 Nested Component Anti-Pattern

**AppletGrid.tsx** contains 12+ internal function components:
```typescript
// ❌ Bad - recreated on every render
function AppletGrid() {
  function AppletIconCard() { ... }  // Line 41
  function AppletViewMode() { ... }  // Inside main
  function AppletEmptyState() { ... } // Inside main
  return <div>...</div>;
}
```

**Fix:** Extract to separate files:
```typescript
// ✓ Good - stable references
import { AppletIconCard } from './AppletIconCard';
import { AppletViewMode } from './AppletViewMode';
```

### 4.3 Business Logic in Components

**ChatPanel.tsx** mixes:
- Direct `fetch()` calls for LLM configuration
- `SystemAgent` orchestration logic
- Base64 image processing
- Session creation and management

**Recommendation:** Extract to custom hooks:
```typescript
// hooks/useSystemAgent.ts
export function useSystemAgent() {
  // Orchestration logic
}

// hooks/useMessageProcessing.ts
export function useMessageProcessing() {
  // Image processing, markdown rendering
}

// hooks/useLLMConfiguration.ts
export function useLLMConfiguration() {
  // API setup
}
```

### 4.4 Missing Memoization

Components with excessive `useState` (10+ variables):
- `ChatPanel`: 8 useState calls
- `QuantumCircuitDesigner`: 8 useState calls
- `AppletGrid`: Complex nested state

**Recommendation:** Use `useReducer` for related state groups

---

## 5. Architecture Improvements

### 5.1 Backend Structure Issues

#### API Coupling

```python
# ❌ Current (api/main.py) - Tight coupling
from core.volumes import VolumeManager, GitVolume
from core.skills import SkillsManager, Skill
from core.evolution import EvolutionCron
from core.workflow import WorkflowEngine
```

**Recommendation:** Use Dependency Injection:
```python
# ✓ Better - Loose coupling with FastAPI dependencies
@app.get("/skills")
async def get_skills(
    skills_manager: SkillsManager = Depends(get_skills_manager)
):
    return skills_manager.list_skills()
```

#### Global State

```python
# ❌ Current - Global variables
volume_manager = VolumeManager(VOLUMES_PATH)
skills_manager = SkillsManager(volume_manager)
workflow_engine: Optional[WorkflowEngine] = None
```

**Recommendation:** Use FastAPI's dependency system

#### No API Versioning

```python
# ❌ Current
@app.get("/chat")
@app.get("/skills")

# ✓ Better
app.include_router(chat_router, prefix="/v1")
app.include_router(skills_router, prefix="/v1")
```

### 5.2 Incomplete Backend Features

| Feature | Status | Action |
|---------|--------|--------|
| `get_llm_response()` | TODO in code | Implement or remove |
| Evolution Crons | Mock data only | Complete implementation |
| GitHub Webhooks | Skeleton only | Complete or remove |
| `volumes_vercel.py` | Many TODOs | Complete or remove |

### 5.3 Frontend Architecture

#### Recommended Layer Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION                            │
│  components/ - Pure UI components (no business logic)       │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                       APPLICATION                            │
│  hooks/ - Custom hooks with business logic                  │
│  contexts/ - React context providers                        │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                         DOMAIN                               │
│  lib/services/ - Business logic services                    │
│  lib/models/ - Domain models and types                      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE                          │
│  lib/api/ - API clients                                     │
│  lib/storage/ - Storage adapters                            │
│  lib/runtime/ - Execution engines                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Design Pattern Recommendations

### 6.1 Repository Pattern (Storage Layer)

**Current:** Direct GitHub API calls scattered across files

**Recommended:**
```typescript
// lib/repositories/FileRepository.ts
interface FileRepository {
  read(volume: VolumeType, path: string): Promise<string>;
  write(volume: VolumeType, path: string, content: string): Promise<void>;
  delete(volume: VolumeType, path: string): Promise<void>;
  list(volume: VolumeType, path: string): Promise<FileEntry[]>;
}

// lib/repositories/GitHubFileRepository.ts
class GitHubFileRepository implements FileRepository {
  // Implementation using GitHub API
}

// lib/repositories/LocalFileRepository.ts
class LocalFileRepository implements FileRepository {
  // Implementation using localStorage/IndexedDB
}
```

### 6.2 Strategy Pattern (LLM Providers)

**Current:** OpenRouter hardcoded in `llm-client.ts`

**Recommended:**
```typescript
// lib/llm/LLMProvider.ts
interface LLMProvider {
  chat(messages: Message[], options: LLMOptions): Promise<Response>;
  streamChat(messages: Message[], options: LLMOptions): AsyncIterableIterator<Chunk>;
}

// lib/llm/OpenRouterProvider.ts
class OpenRouterProvider implements LLMProvider { ... }

// lib/llm/AnthropicProvider.ts
class AnthropicProvider implements LLMProvider { ... }

// lib/llm/LLMFactory.ts
function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'openrouter': return new OpenRouterProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
  }
}
```

### 6.3 Command Pattern (Tool Execution)

**Current:** Tools executed inline in agent code

**Recommended:**
```typescript
// lib/tools/ToolCommand.ts
interface ToolCommand {
  name: string;
  execute(params: ToolParams): Promise<ToolResult>;
  undo?(): Promise<void>;
}

// lib/tools/ReadFileCommand.ts
class ReadFileCommand implements ToolCommand {
  name = 'read_file';
  async execute({ volume, path }: ReadFileParams): Promise<ToolResult> {
    const content = await this.fileRepo.read(volume, path);
    return { success: true, content };
  }
}

// lib/tools/ToolExecutor.ts
class ToolExecutor {
  private history: ToolCommand[] = [];

  async execute(command: ToolCommand): Promise<ToolResult> {
    const result = await command.execute();
    this.history.push(command);
    return result;
  }

  async undo(): Promise<void> {
    const last = this.history.pop();
    if (last?.undo) await last.undo();
  }
}
```

### 6.4 Observer Pattern (State Updates)

**Current:** Props drilling and context overuse

**Recommended:**
```typescript
// lib/events/EventBus.ts
type EventHandler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();

  subscribe<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)!.delete(handler);
  }

  emit<T>(event: string, payload: T): void {
    this.handlers.get(event)?.forEach(h => h(payload));
  }
}

// Usage
eventBus.emit('file:created', { path: '/projects/foo.py' });
eventBus.subscribe('file:created', ({ path }) => refreshTree());
```

### 6.5 Facade Pattern (Complex Systems)

**Current:** Components directly use low-level APIs

**Recommended:**
```typescript
// lib/facades/AgentFacade.ts
class AgentFacade {
  constructor(
    private orchestrator: SystemAgentOrchestrator,
    private toolExecutor: ToolExecutor,
    private memory: MemorySystem
  ) {}

  async processMessage(message: string): Promise<AgentResponse> {
    const context = await this.memory.getRelevantContext(message);
    const plan = await this.orchestrator.plan(message, context);
    const results = await this.executePlan(plan);
    await this.memory.store(message, results);
    return this.formatResponse(results);
  }
}

// Components use the facade, not internals
const agent = useAgentFacade();
await agent.processMessage(userInput);
```

### 6.6 Compound Component Pattern (UI)

**Current:** Monolithic components with many props

**Recommended:**
```tsx
// components/Canvas/Canvas.tsx
const CanvasContext = createContext<CanvasState>(null);

function Canvas({ children }: { children: ReactNode }) {
  const state = useCanvasState();
  return (
    <CanvasContext.Provider value={state}>
      <div className="canvas-container">{children}</div>
    </CanvasContext.Provider>
  );
}

Canvas.Code = function CanvasCode() {
  const { code } = useContext(CanvasContext);
  return <MonacoEditor value={code} />;
};

Canvas.Preview = function CanvasPreview() {
  const { preview } = useContext(CanvasContext);
  return <PreviewPane content={preview} />;
};

// Usage
<Canvas>
  <Canvas.Code />
  <Canvas.Preview />
</Canvas>
```

---

## 7. Refactoring Roadmap

### Phase 1: Cleanup (Week 1)

**Priority: High | Impact: High | Risk: Low**

1. **Remove dead code files** (22 files, ~3,500 lines)
   - Run removal commands from Section 1
   - Verify build still works
   - Commit: "chore: remove unused code files"

2. **Delete duplicate `ui/core/` directory**
   - Remove entire `llmos-lite/ui/core/`
   - Commit: "chore: remove duplicate core directory"

3. **Remove unused dependencies from `requirements.txt`**
   - Remove `anthropic==0.18.1` (or implement usage)
   - Remove `python-dateutil==2.8.2` (verify unused)

### Phase 2: Consolidation (Week 2)

**Priority: High | Impact: Medium | Risk: Medium**

1. **Merge LLM clients**
   - Create `lib/llm-client/` module structure
   - Migrate code from both files
   - Update all imports

2. **Merge Pyodide runtimes**
   - Consolidate `pyodide-runner.ts` into `pyodide-runtime.ts`
   - Update imports

3. **Consolidate layout components**
   - Keep `FluidLayout.tsx` as primary
   - Remove or merge `TerminalLayoutNew.tsx`, `SimpleLayout.tsx`

### Phase 3: Component Restructure (Week 3)

**Priority: Medium | Impact: High | Risk: Medium**

1. **Extract nested components from AppletGrid.tsx**
   - Create `AppletIcon.tsx`, `AppletCard.tsx`, etc.
   - Move to `components/applets/` directory

2. **Extract business logic from ChatPanel.tsx**
   - Create `hooks/useChat.ts`
   - Create `hooks/useAgent.ts`
   - ChatPanel becomes pure presentation

3. **Rename directories**
   - `panel1-volumes/` → `panels/volumes/`
   - `panel2-session/` → `panels/session/`
   - `panel3-artifacts/` → `panels/artifacts/`

### Phase 4: Architecture (Week 4)

**Priority: Medium | Impact: High | Risk: High**

1. **Implement Repository Pattern**
   - Create `lib/repositories/` directory
   - Implement `FileRepository` interface
   - Replace direct GitHub API calls

2. **Implement LLM Provider Strategy**
   - Create `lib/llm/` module with interfaces
   - Support multiple providers

3. **Add API versioning**
   - Create `/v1/` prefix for all endpoints
   - Update frontend API calls

### Phase 5: Polish (Week 5+)

**Priority: Low | Impact: Medium | Risk: Low**

1. **Create shared UI components**
   - `LoadingSpinner`, `CollapsibleSection`, `DialogContainer`

2. **Add memoization strategy**
   - Implement `React.memo` on heavy components
   - Use `useReducer` for complex state

3. **Documentation**
   - Update ARCHITECTURE.md
   - Add module-level JSDoc comments

---

## Summary Statistics

| Metric | Before | After (Estimated) |
|--------|--------|-------------------|
| Total Files | 221 | ~195 |
| Dead Code Lines | ~3,500 | 0 |
| Duplicate Pairs | 8 | 0 |
| Avg Component Size | 400 lines | 200 lines |
| Nested Components | 30+ | 0 |
| Business Logic in UI | High | Low |

---

## Appendix A: Full File List for Removal

```
# Dead TypeScript files
llmos-lite/ui/lib/quantum-solver.ts
llmos-lite/ui/lib/openqasm-bridge.ts
llmos-lite/ui/lib/session-storage.ts
llmos-lite/ui/lib/vector-search.ts
llmos-lite/ui/lib/skill-executor.ts
llmos-lite/ui/lib/workflow-executor.ts
llmos-lite/ui/lib/industry-templates.ts
llmos-lite/ui/lib/kernel/refinement-service.ts
llmos-lite/ui/lib/kernel/error-supervisor.ts
llmos-lite/ui/lib/runtime/error-handler.ts
llmos-lite/ui/lib/runtime/ralph-loop.ts
llmos-lite/ui/lib/collaboration/websocket-client.ts
llmos-lite/ui/lib/memory/latent-scratchpad.ts
llmos-lite/ui/lib/llm-tools/git-tools.ts
llmos-lite/ui/lib/volumes/file-operations-wasm.ts

# Dead Python files
llmos-lite/api/lib/vercel_kv.py

# Duplicate directory (entire)
llmos-lite/ui/core/

# Unused component
llmos-lite/ui/components/explorer/VolumeExplorer.tsx
```

## Appendix B: Recommended New Directory Structure

```
llmos-lite/
├── api/                          # Backend (FastAPI)
│   ├── v1/                       # API v1 routes
│   │   ├── chat.py
│   │   ├── skills.py
│   │   └── workflows.py
│   ├── services/                 # Business logic
│   ├── repositories/             # Data access
│   └── main.py
│
├── core/                         # Shared Python modules
│   ├── volumes.py
│   ├── skills.py
│   └── evolution.py
│
└── ui/                           # Frontend (Next.js)
    ├── app/                      # Next.js pages
    ├── components/
    │   ├── common/               # Shared UI components
    │   │   ├── LoadingSpinner.tsx
    │   │   ├── CollapsibleSection.tsx
    │   │   └── FileTree/
    │   ├── panels/               # Panel components
    │   │   ├── volumes/
    │   │   ├── session/
    │   │   └── artifacts/
    │   ├── canvas/               # Canvas components
    │   ├── applets/              # Applet components
    │   └── layout/               # Layout components
    ├── hooks/                    # Custom React hooks
    │   ├── useChat.ts
    │   ├── useAgent.ts
    │   └── useFileSystem.ts
    ├── lib/
    │   ├── api/                  # API clients
    │   ├── llm/                  # LLM client module
    │   ├── repositories/         # Data repositories
    │   ├── services/             # Business services
    │   └── runtime/              # Execution engines
    └── contexts/                 # React contexts
```

---

*This document should be reviewed and updated as refactoring progresses.*
