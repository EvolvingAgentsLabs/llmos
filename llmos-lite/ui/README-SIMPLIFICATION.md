# LLMos-Lite UI Simplification Project

This document provides an overview of the UI simplification project for LLMos-Lite.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Key Concepts](#key-concepts)
3. [What's Been Implemented](#whats-been-implemented)
4. [How to Use](#how-to-use)
5. [Architecture](#architecture)
6. [Next Steps](#next-steps)
7. [Documentation](#documentation)

---

## Overview

The LLMos-Lite UI has been redesigned around a **three-volume architecture** with a unified **artifact system** that simplifies how users create, manage, and share their work.

### Key Goals

1. **Simplify** the volume/disk structure (system, team, user)
2. **Unify** all artifact types (agents, tools, skills, code) under one system
3. **Enable** easy session management (user vs team sessions)
4. **Support** artifact referencing and reuse across sessions
5. **Integrate** with GitHub for persistent storage

---

## Key Concepts

### 1. Three Volumes (Disks)

```
┌─────────────────────────────────────────┐
│ SYSTEM (Read-Only)                      │
│ - Base skills and system tools          │
│ - Managed by cron jobs                  │
│ - GitHub: llmunix/system-volume         │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ TEAM (Shared)                           │
│ - Team workspace                        │
│ - Shared artifacts                      │
│ - GitHub: org/team-volume               │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ USER (Personal)                         │
│ - Personal workspace                    │
│ - Private artifacts                     │
│ - GitHub: user/llmos-workspace          │
└─────────────────────────────────────────┘
```

### 2. Session Types

- **User Sessions**: Private, saved to user volume
- **Team Sessions**: Shared, saved to team volume
- **Temporal**: In-memory, not yet saved to GitHub
- **Saved**: Committed and pushed to GitHub

### 3. Unified Artifacts

All work products are now **artifacts**:

| Type | Description | Examples |
|------|-------------|----------|
| **Agent** | AI agents with specific roles | Quantum Researcher, Code Optimizer |
| **Tool** | Reusable functions | Matrix Solver, Plot Generator |
| **Skill** | Learned patterns (from cron) | VQE Optimization, Circuit Design |
| **Workflow** | Multi-step processes | Quantum Pipeline, Data Analysis |
| **Code** | Executable code with visuals | Quantum circuits, 3D animations |

### 4. Dual-View System

Code artifacts support **two views**:

- **Render View**: Visual representation (circuits, 3D, plots)
- **Code View**: Editable source code (Monaco editor)

---

## What's Been Implemented

### ✅ Core Systems

1. **Artifact Type System** (`lib/artifacts/`)
   - Complete TypeScript types
   - CRUD operations
   - Filtering and sorting
   - Fork functionality
   - GitHub persistence layer

2. **Enhanced Session Context** (`contexts/SessionContext.tsx`)
   - Session types (user/team)
   - Session status (temporal/saved)
   - Artifact tracking per session
   - Backward compatibility

### ✅ UI Components

3. **Session Management**
   - `NewSessionDialog` - Create user or team sessions
   - `SessionStatusBadge` - Visual indicators
   - Updated `SidebarPanel` with new dialog

4. **Artifact Views**
   - `ArtifactDualView` - Container with tab switching
   - `RenderView` - Visual representations
   - `CodeView` - Monaco code editor

### ✅ Documentation

5. **Design Documents**
   - `ARCHITECTURE.md` - Complete system design
   - `UI-MOCKUP.md` - Visual mockups
   - `IMPLEMENTATION-STATUS.md` - Detailed tracking
   - `PROGRESS-SUMMARY.md` - Progress overview

---

## How to Use

### Creating a Session

```tsx
// 1. Click "+ New" in sidebar
// 2. Fill in session details:
//    - Name: "VQE Optimization"
//    - Type: User or Team
//    - Goal: "Optimize quantum circuits" (optional)
// 3. Click "Create Session"
```

### Working with Artifacts

```tsx
// 1. Chat generates artifacts automatically
// 2. View artifact in dual-view:
//    - Render View: See visual representation
//    - Code View: Edit source code
// 3. Modify code if needed
// 4. Save to volume
```

### Code Example

```typescript
import { artifactManager } from '@/lib/artifacts';
import { useSessionContext } from '@/contexts/SessionContext';

// Create a code artifact
const circuit = artifactManager.create({
  name: 'Bell State Circuit',
  type: 'code',
  volume: 'user',
  createdBy: sessionId,
  codeView: `
from qiskit import QuantumCircuit

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])
  `,
  renderView: {
    type: 'quantum-circuit',
    data: {
      numQubits: 2,
      gates: [
        { type: 'H', target: 0, time: 0 },
        { type: 'CNOT', target: 1, control: 0, time: 1 }
      ],
      measurements: [0, 1]
    }
  }
});

// Link to session
const { addArtifactToSession } = useSessionContext();
addArtifactToSession(sessionId, circuit.id);

// Fork to user volume (if from team/system)
const forked = artifactManager.fork(circuit.id, 'user');

// Save to GitHub (coming soon)
await artifactStorage.saveToGitHub(circuit);
```

---

## Architecture

### Data Flow

```
User Creates Session
       ↓
Chat with LLM
       ↓
LLM Generates Artifacts
       ↓
Artifacts Added to Session (Temporal)
       ↓
User Views/Edits in Dual-View
       ↓
User Saves Session
       ↓
Artifacts Committed to GitHub
       ↓
Session Status → Saved
```

### Component Hierarchy

```
App
├── SessionProvider
│   └── TerminalLayout
│       ├── SidebarPanel
│       │   ├── VolumeTree
│       │   ├── SessionList
│       │   └── NewSessionDialog ✨
│       │
│       ├── ChatPanel
│       │   └── Messages
│       │       └── (Artifact references) 🚧
│       │
│       └── ContextPanel
│           ├── SessionInfo
│           ├── ArtifactList
│           └── ArtifactDualView ✨
│               ├── RenderView ✨
│               └── CodeView ✨
```

✨ = Newly implemented
🚧 = Coming soon

---

## Next Steps

### Phase 2: Integration & Persistence

1. **Save Session Flow**
   - Dialog for selecting artifacts to commit
   - Git commit message generation
   - Progress indicators
   - Error handling

2. **GitHub Integration**
   - OAuth authentication
   - Volume sync service
   - Pull/push operations
   - Conflict resolution

### Phase 3: Enhanced Workflows

3. **Artifact Referencing**
   - `@` autocomplete in chat
   - Inline artifact previews
   - Context injection for LLM

4. **Volume Browser**
   - Tree view of all artifacts
   - Filter by type/volume
   - Drag-to-reference

### Phase 4: Polish

5. **Testing & Optimization**
   - Unit tests
   - Integration tests
   - Performance optimization

6. **Documentation & Guides**
   - User tutorials
   - API documentation
   - Migration guides

---

## Documentation

### Quick Reference

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | Complete system design and technical details |
| `UI-MOCKUP.md` | Visual mockups for all screens |
| `IMPLEMENTATION-STATUS.md` | Detailed task tracking and status |
| `PROGRESS-SUMMARY.md` | Overview of what's complete and working |
| `README-SIMPLIFICATION.md` | This file - project overview |

### Code Documentation

| Location | What's There |
|----------|--------------|
| `lib/artifacts/types.ts` | Type definitions and interfaces |
| `lib/artifacts/artifact-manager.ts` | Core artifact operations |
| `lib/artifacts/artifact-storage.ts` | GitHub persistence |
| `contexts/SessionContext.tsx` | Session and artifact state |
| `components/session/` | Session UI components |
| `components/artifacts/` | Artifact viewer components |

---

## Project Status

**Phase 1: Foundation** ✅ **COMPLETE**

- 7/7 core tasks completed
- 14 files created
- ~2,100 lines of code
- 78% overall progress

**Current Focus**: Phase 2 (Integration & Persistence)

---

## Getting Started

### For Developers

1. Review the architecture:
   ```bash
   cat ARCHITECTURE.md
   ```

2. Check the mockups:
   ```bash
   cat UI-MOCKUP.md
   ```

3. Explore the artifact system:
   ```bash
   cat lib/artifacts/types.ts
   cat lib/artifacts/artifact-manager.ts
   ```

4. Try the components:
   ```tsx
   import { NewSessionDialog } from '@/components/session/NewSessionDialog';
   import { ArtifactDualView } from '@/components/artifacts/ArtifactDualView';
   ```

### For Users

1. Create a new session (+ button in sidebar)
2. Chat to generate artifacts
3. View artifacts in dual-view
4. Edit code if needed
5. Save to your volume (coming soon)

---

## Questions?

- **Architecture questions**: See `ARCHITECTURE.md`
- **UI/UX questions**: See `UI-MOCKUP.md`
- **Progress tracking**: See `IMPLEMENTATION-STATUS.md`
- **Code examples**: See `PROGRESS-SUMMARY.md`

---

**Created**: 2025-12-19
**Status**: Phase 1 Complete
**Next**: GitHub Integration
