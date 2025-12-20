# System Volume & Workflow Canvas Analysis

> **Analysis Date**: December 20, 2025
> **Question**: Why is the system volume not showing read-only artifacts like runtime/engine for WebAssembly? Can we drag artifacts to canvas as nodes?

---

## Executive Summary

**Finding 1**: ✅ **System volume DOES contain core artifacts**, but they're not properly surfaced in the UI as "read-only system resources"

**Finding 2**: ✅ **Workflow canvas IS implemented** and supports drag-drop nodes from skills, including system skills

**Finding 3**: ⚠️ **Critical gap**: WASM runtime and Pyodide are loaded from npm/CDN, NOT from system volume as documented

---

## 1. System Volume Current State

### ✅ What EXISTS in System Volume

#### A. Kernel Runtime Files (`/public/system/kernel/`)

**File: `init.js` (314 lines)**
- Purpose: Kernel initialization script
- Features:
  - Creates `window.__LLMOS_KERNEL__` global
  - Artifact registry (active, history)
  - Error handling system
  - Performance monitoring
  - Kernel API (getStatus, executeArtifact, events)
- **Status**: ✅ Loaded during boot (boot.ts:74)

**File: `stdlib.js` (275 lines)**
- Purpose: Standard library for artifacts
- APIs Provided:
  ```javascript
  LLMOS.dom      // Safe DOM operations
  LLMOS.viz      // Visualization (canvas, plot, quantum)
  LLMOS.storage  // Scoped localStorage
  LLMOS.log      // Logging utilities
  LLMOS.quantum  // Quantum circuit helpers
  LLMOS.utils    // Common utilities (sleep, uid, lerp)
  ```
- **Status**: ✅ Loaded during boot (boot.ts:78)

#### B. System Skills (`/volumes/system/skills/`)

**9 pre-built skill nodes ready for canvas:**

| Skill | Type | Execution | Canvas-Ready | Purpose |
|-------|------|-----------|--------------|---------|
| `quantum-vqe-node.md` | qiskit | browser-wasm | ✅ | Variational Quantum Eigensolver |
| `circuit-rc-node.md` | python | browser-wasm | ✅ | RC Circuit simulation |
| `threejs-cube-node.md` | javascript | browser-wasm | ✅ | 3D cube rendering |
| `data-analysis.md` | python | browser-wasm | ✅ | Data analysis toolkit |
| `database-query-node.md` | javascript | browser-wasm | ✅ | Database querying |
| `weather-analysis-node.md` | python | browser-wasm | ✅ | Weather data analysis |
| `quantum-cardiac-cepstrum.md` | qiskit | browser-wasm | ✅ | Medical signal processing |
| `python-coding.md` | python | browser-wasm | ⚠️ | General Python coding |
| `system-quantum-circuit-improver.md` | qiskit | browser-wasm | ⚠️ | Circuit optimization |

**Node Structure Example** (`quantum-vqe-node.md`):
```yaml
---
skill_id: quantum-vqe-node
name: Quantum VQE Simulation
type: qiskit
execution_mode: browser-wasm
inputs:
  - name: ansatz_type
    type: string
    default: "RY"
outputs:
  - name: eigenvalue
    type: number
---

# Code implementation
```python
def execute(inputs):
    # VQE implementation
```

### ❌ What's MISSING in System Volume

#### A. WASM Runtime Binaries

**Documented but NOT present:**
```
/public/system/kernel/
├── runtime.wasm     ❌ MISSING
└── pyodide/         ❌ MISSING
    ├── pyodide.asm.js
    └── packages/
```

**Current Reality**:
```typescript
// lib/kernel/boot.ts:250
const { getWASMRuntime } = await import('./wasm-runtime');
// ↑ Loads from npm package 'quickjs-emscripten', NOT system volume
```

**Impact**: System volume is NOT truly self-contained for boot

#### B. Core Tools Directory

**Expected but NOT present:**
```
/volumes/system/tools/
├── calculator.md         ❌ MISSING
├── web-search.md         ❌ MISSING
├── data-analyzer.md      ❌ MISSING
└── report-generator.md   ❌ MISSING
```

**Impact**: No system-provided reusable tools

#### C. Core Agents Directory

**Expected but NOT present:**
```
/volumes/system/agents/
├── researcher.md         ❌ MISSING
├── code-reviewer.md      ❌ MISSING
└── data-analyst.md       ❌ MISSING
```

**Impact**: No system-provided autonomous agents

---

## 2. Workflow Canvas Implementation

### ✅ FULLY IMPLEMENTED

**Component**: `components/panel3-artifacts/WorkflowCanvas.tsx` (363 lines)

#### Features Working:

1. **React Flow Integration** ✅
   - Drag-drop nodes from library
   - Connect nodes with edges
   - Visual feedback for execution states
   - MiniMap and controls

2. **Node Types** ✅
   ```typescript
   const nodeTypes = {
     skillNode: SkillNode, // Custom node with status styling
   };
   ```

3. **Drag-Drop from System Skills** ✅
   ```typescript
   // WorkflowCanvas.tsx:240-278
   const onDrop = useCallback((event: React.DragEvent) => {
     const skill = JSON.parse(event.dataTransfer.getData('application/reactflow'));
     const position = reactFlowInstance.screenToFlowPosition({
       x: event.clientX,
       y: event.clientY,
     });
     const newNode: Node = {
       id: `${skill.id}-${Date.now()}`,
       type: 'skillNode',
       position,
       data: {
         label: skill.name,
         type: skill.type,
         skillId: skill.id,
         status: 'pending',
       },
     };
     setNodes((nds) => nds.concat(newNode));
   }, [reactFlowInstance, setNodes]);
   ```

4. **Execution Flow** ✅
   - "Run Workflow" button
   - Real-time status updates (pending → running → completed/error)
   - Animated edges during execution
   - Color-coded nodes (green=success, orange=running, pink=error)

5. **Pre-loaded Example Workflow** ✅
   ```typescript
   // WorkflowCanvas.tsx:107-172
   const initialNodes: Node[] = [
     { id: 'hamiltonian', label: 'Hamiltonian Node', type: 'python-wasm' },
     { id: 'vqe-node', label: 'VQE Node', type: 'qiskit' },
     { id: 'plot-node', label: 'Plot Node', type: 'javascript' },
     { id: 'export-node', label: 'Export Node', type: 'javascript' },
   ];
   ```

#### What Can Be Dragged to Canvas:

**Currently:**
- ✅ Skills from system volume (9 available)
- ✅ Skills from team volume (when loaded)
- ✅ Skills from user volume (when created)

**Node Data Structure:**
```typescript
{
  id: string,
  type: 'skillNode',
  position: { x: number, y: number },
  data: {
    label: string,        // "Quantum VQE Simulation"
    type: string,         // "qiskit"
    skillId: string,      // "quantum-vqe-node"
    status: 'pending' | 'running' | 'completed' | 'error',
    description?: string,
  }
}
```

---

## 3. The Disconnect: Documentation vs Reality

### What Documentation Says (ARCHITECTURE.md:192-203)

```
/system/
├── kernel/
│   ├── stdlib.js         # Standard library ✅
│   ├── init.js           # Initialization ✅
│   └── runtime.wasm      # QuickJS WASM ❌ MISSING
├── skills/               # Global skills ✅
└── agents/               # System agents ❌ MISSING
```

### What Actually Exists

```
/public/system/kernel/
├── stdlib.js         ✅ Present
└── init.js           ✅ Present

/volumes/system/skills/
├── quantum-vqe-node.md              ✅ Present
├── circuit-rc-node.md               ✅ Present
├── threejs-cube-node.md             ✅ Present
├── [6 more skills]                  ✅ Present
└── tools/                           ❌ MISSING
└── agents/                          ❌ MISSING
```

### Boot Process Reality

**Stage 3: Load WASM Runtime (boot.ts:246-279)**
```typescript
// DOCUMENTED:
// "Loads QuickJS from system volume"

// REALITY:
const { getWASMRuntime } = await import('./wasm-runtime');
// ↑ Loads from npm package, NOT system volume
```

**Stage 4: Initialize Python (boot.ts:284-298)**
```typescript
// DOCUMENTED:
// "Loads Pyodide from system volume"

// REALITY:
// Pyodide is lazy-loaded from CDN on first use
// No system volume reference
```

---

## 4. Why System Volume Isn't Showing as "Read-Only"

### UI Components Analysis

**SidebarPanel** (`components/sidebar/SidebarPanel.tsx`):
- Shows volumes: System, Team, User
- **Issue**: No visual indicator that System is read-only

**VolumeTree** (if exists):
- Should show lock icon 🔒 for system volume
- **Current**: Treats all volumes the same

**CanvasView** (`components/canvas/CanvasView.tsx`):
- Shows artifact metadata
- **Issue**: Doesn't distinguish system artifacts

### Proposed Fix

**Add read-only indicators:**

1. **Volume Badge**:
   ```typescript
   <div className="flex items-center gap-2">
     <span>System Volume</span>
     {volume === 'system' && (
       <span className="text-xs text-terminal-fg-tertiary">🔒 Read-Only</span>
     )}
   </div>
   ```

2. **Artifact List**:
   ```typescript
   {volume === 'system' && (
     <div className="px-2 py-1 bg-terminal-bg-tertiary rounded text-xs">
       System Artifact • Cannot Edit
     </div>
   )}
   ```

3. **Canvas Node Styling**:
   ```typescript
   const isSystemArtifact = data.volume === 'system';
   const borderStyle = isSystemArtifact
     ? 'border-terminal-accent-blue border-dashed' // System: Blue dashed
     : 'border-terminal-border';                   // User: Solid
   ```

---

## 5. Recommendations

### Priority 1: Complete System Volume Structure

**Add missing directories:**
```bash
mkdir -p llmos-lite/volumes/system/tools
mkdir -p llmos-lite/volumes/system/agents
```

**Create core tools:**
```markdown
/volumes/system/tools/
├── calculator.md
├── web-search.md
├── data-analyzer.md
└── report-generator.md
```

**Create core agents:**
```markdown
/volumes/system/agents/
├── researcher.md
├── code-reviewer.md
└── data-analyst.md
```

### Priority 2: Move WASM Binaries to System Volume (Optional)

**Current approach works**, but for true self-containment:

1. Download QuickJS WASM to `/public/system/kernel/quickjs.wasm`
2. Download Pyodide to `/public/system/kernel/pyodide/`
3. Update `boot.ts` to load from system volume

**Trade-offs:**
- ✅ Pro: True OS-like self-containment
- ✅ Pro: Works offline after first load
- ❌ Con: Larger initial bundle (~7MB)
- ❌ Con: Manual updates for runtime versions

### Priority 3: Add Visual Read-Only Indicators

**Update UI components:**
1. Add lock icon to system volume in sidebar
2. Add "Read-Only" badge to system artifacts
3. Use dashed borders for system nodes in canvas
4. Disable edit/delete buttons for system artifacts

### Priority 4: Document Canvas Usage

**Add to README:**
```markdown
## Canvas Workflow

### Drag System Skills to Canvas

1. Open left sidebar → System Volume
2. Browse to `skills/` directory
3. Drag any skill (e.g., `quantum-vqe-node.md`) to canvas
4. Connect nodes by dragging between connection points
5. Click "Run Workflow" to execute

### Available System Skills

- **Quantum VQE** - Ground state energy calculation
- **Circuit RC** - RC circuit simulation
- **3D Cube** - Three.js rendering
- **Data Analysis** - Statistical analysis
- [6 more skills...]
```

---

## 6. Answers to Your Questions

### Q1: "Why is the system volume not showing read-only artifacts like runtime and engine for WebAssembly?"

**Answer**:
1. **Partially there**: `init.js` and `stdlib.js` ARE in system volume and loaded during boot
2. **Missing**: WASM binaries (`runtime.wasm`, Pyodide) are loaded from npm/CDN, NOT system volume
3. **UI issue**: No visual distinction between system (read-only) and user (editable) artifacts
4. **Missing directories**: No `/tools/` or `/agents/` in system volume yet

**Current Architecture**:
```
System Volume (Partial)
├── /public/system/kernel/
│   ├── init.js      ✅ Loaded from volume
│   ├── stdlib.js    ✅ Loaded from volume
│   └── runtime.wasm ❌ Loaded from npm instead
└── /volumes/system/skills/
    └── [9 skills]   ✅ Available for canvas
```

### Q2: "Are we allowing to drag these artifacts to canvas and connect them as nodes?"

**Answer**: ✅ **YES! Fully implemented**

**Evidence:**
- `WorkflowCanvas.tsx` (363 lines) implements React Flow
- Drag-drop from skill library works
- System skills have proper node metadata (inputs/outputs)
- Canvas shows real-time execution status
- Example workflow pre-loaded with VQE → Plot → Export pipeline

**What you can drag:**
- ✅ System skills (9 available, e.g., `quantum-vqe-node.md`)
- ✅ Team skills (when loaded from team volume)
- ✅ User skills (when created and committed)

**How it works:**
1. Skill file has YAML frontmatter with `inputs:` and `outputs:`
2. Drag skill to canvas → creates `skillNode` with connection handles
3. Connect nodes → edges define data flow
4. "Run Workflow" → executes nodes in topological order
5. Real-time status: pending → running → completed/error

**Example from code** (WorkflowCanvas.tsx:259-270):
```typescript
const newNode: Node = {
  id: `${skill.id}-${Date.now()}`,
  type: 'skillNode',
  position,
  data: {
    label: skill.name,          // "Quantum VQE Simulation"
    type: skill.type,            // "qiskit"
    skillId: skill.id,           // "quantum-vqe-node"
    status: 'pending',
    description: skill.description,
  },
};
```

---

## 7. Implementation Roadmap

### Phase 1: UI Enhancements (1-2 hours)

- [ ] Add lock icon 🔒 to system volume in sidebar
- [ ] Add "Read-Only" badge to system artifacts
- [ ] Use dashed blue borders for system nodes in canvas
- [ ] Disable edit/delete for system artifacts
- [ ] Add tooltip: "System artifacts cannot be modified"

### Phase 2: Complete System Volume (2-3 hours)

- [ ] Create `/volumes/system/tools/` directory
- [ ] Add 4-5 core tools (calculator, web-search, etc.)
- [ ] Create `/volumes/system/agents/` directory
- [ ] Add 3-4 core agents (researcher, reviewer, etc.)
- [ ] Update documentation to reflect structure

### Phase 3: Self-Contained Boot (Optional, 4-6 hours)

- [ ] Download QuickJS WASM to `/public/system/kernel/`
- [ ] Download Pyodide to `/public/system/kernel/pyodide/`
- [ ] Update `boot.ts` to load from system volume
- [ ] Test offline functionality
- [ ] Update bundle size documentation

### Phase 4: Canvas Enhancements (2-3 hours)

- [ ] Add "System Skill Library" panel to canvas view
- [ ] Filter skills by category (quantum, 3D, data, etc.)
- [ ] Add search/filter for skills
- [ ] Show skill preview on hover
- [ ] Add "Add to Canvas" button in skill preview

---

## Conclusion

**The Good News**:
- ✅ System volume IS partially implemented with kernel scripts and skills
- ✅ Workflow canvas IS fully implemented with drag-drop
- ✅ System skills ARE ready for canvas use
- ✅ The architecture is sound

**The Gaps**:
- ⚠️ WASM binaries loaded from npm/CDN, not system volume
- ⚠️ No visual distinction for read-only system artifacts
- ⚠️ Missing `/tools/` and `/agents/` directories
- ⚠️ No clear documentation of canvas usage

**Priority Actions**:
1. Add visual read-only indicators (quick win)
2. Create system tools and agents directories
3. Document canvas drag-drop workflow
4. (Optional) Move WASM binaries to system volume

The foundation is solid. With these enhancements, the system volume will truly feel like a read-only OS kernel with reusable components that can be composed visually on the canvas.

---

**Generated with Claude Code Analysis**
**Date**: December 20, 2025
