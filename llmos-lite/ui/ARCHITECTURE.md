# LLMos-Lite UI Architecture

## Overview
LLMos-Lite uses a three-volume architecture backed by GitHub repositories, with temporal sessions that can generate permanent artifacts.

---

## 1. Volume/Disk System

### Three Volumes (Disks)

```
┌─────────────────────────────────────────────────────────┐
│                    VOLUME ARCHITECTURE                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ SYSTEM VOLUME (Read-Only)                       │   │
│  │ - Managed by system cron jobs                   │   │
│  │ - Contains: Base skills, system agents, tools   │   │
│  │ - GitHub Repo: llmunix/system-volume            │   │
│  │ - Updated: Automated via cron                   │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ TEAM VOLUME (Shared, Read/Write)                │   │
│  │ - Shared workspace for team                     │   │
│  │ - Contains: Team skills, shared agents/workflows│   │
│  │ - GitHub Repo: org/team-volume                  │   │
│  │ - Updated: Manual commits + team cron           │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ USER VOLUME (Personal, Read/Write)              │   │
│  │ - Personal workspace                            │   │
│  │ - Contains: User skills, personal projects      │   │
│  │ - GitHub Repo: user/llmos-workspace             │   │
│  │ - Updated: Manual commits + user cron           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Volume Structure (GitHub Repo Layout)

```
user-volume/  (or team-volume, system-volume)
├── agents/
│   ├── quantum-researcher.json
│   └── code-optimizer.json
├── skills/
│   ├── vqe-optimization.md
│   └── circuit-design.md
├── tools/
│   ├── matrix-solver.py
│   └── plot-generator.py
├── workflows/
│   ├── quantum-pipeline.json
│   └── data-analysis.json
├── code-artifacts/
│   ├── circuits/
│   │   └── bell-state.py
│   ├── animations/
│   │   └── molecule-viz.py
│   └── notebooks/
│       └── vqe-demo.ipynb
└── sessions/  (temporal - not committed by default)
    └── session-12345.json
```

---

## 2. Session Management

### Session Types

Sessions are **temporal** (in-memory + localStorage) until explicitly saved:

```typescript
interface Session {
  id: string;
  name: string;
  type: 'user' | 'team';  // NEW: Determines which volume it belongs to
  status: 'temporal' | 'saved';  // NEW: Temporal or committed to repo
  volume: 'system' | 'team' | 'user';
  messages: Message[];
  artifacts: ArtifactReference[];  // NEW: References to generated artifacts
  createdAt: string;
  updatedAt: string;
}
```

### Session Workflow

```
┌──────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. CREATE SESSION                                        │
│     ┌─────────────────────────────────────┐             │
│     │ User clicks "New Session"            │             │
│     │ Chooses: User or Team session        │             │
│     └─────────────────────────────────────┘             │
│                    ↓                                      │
│  2. WORK IN SESSION (Temporal)                            │
│     ┌─────────────────────────────────────┐             │
│     │ Chat interactions                    │             │
│     │ Generate artifacts (agents/tools)    │             │
│     │ Preview code artifacts               │             │
│     │ Status: temporal (localStorage)      │             │
│     └─────────────────────────────────────┘             │
│                    ↓                                      │
│  3. SAVE OR DELETE                                        │
│     ┌──────────────────┐   ┌──────────────────┐         │
│     │ SAVE             │   │ DELETE           │         │
│     │ - Commit to repo │   │ - Remove from    │         │
│     │ - Save artifacts │   │   localStorage   │         │
│     │ Status: saved    │   │ - Discard all    │         │
│     └──────────────────┘   └──────────────────┘         │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Unified Artifact System

### Artifact Types

All artifacts follow a unified structure:

```typescript
type ArtifactType = 'agent' | 'tool' | 'skill' | 'workflow' | 'code';

interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  volume: 'system' | 'team' | 'user';
  status: 'temporal' | 'committed';
  createdAt: string;
  createdBy: string;  // session ID

  // Code artifacts have both views
  codeView?: string;  // Source code
  renderView?: RenderData;  // Visual representation

  // Metadata
  description?: string;
  tags?: string[];
  dependencies?: string[];  // References to other artifacts
}

interface RenderData {
  type: 'quantum-circuit' | '3d-scene' | 'plot' | 'interactive';
  data: any;  // Type-specific render data
}
```

### Artifact Examples

**1. Agent Artifact**
```json
{
  "id": "agent-quantum-researcher",
  "name": "Quantum Researcher",
  "type": "agent",
  "volume": "user",
  "status": "committed",
  "codeView": "# Agent definition\nclass QuantumResearcher:\n  ...",
  "renderView": {
    "type": "interactive",
    "data": { "agentConfig": {...} }
  }
}
```

**2. Code Artifact (Quantum Circuit)**
```json
{
  "id": "circuit-bell-state",
  "name": "Bell State Circuit",
  "type": "code",
  "volume": "user",
  "status": "temporal",
  "codeView": "from qiskit import QuantumCircuit\nqc = ...",
  "renderView": {
    "type": "quantum-circuit",
    "data": {
      "numQubits": 2,
      "gates": [...]
    }
  }
}
```

**3. Skill Artifact**
```json
{
  "id": "skill-vqe-optimization",
  "name": "VQE Optimization",
  "type": "skill",
  "volume": "team",
  "status": "committed",
  "codeView": "# Skill pattern detected by cron\n...",
  "description": "Pattern for optimizing VQE convergence"
}
```

---

## 4. Artifact Views (Code Artifacts)

Code artifacts support **two views**:

### Render View (Default)
- Visual representation of the code
- Quantum circuits → Circuit diagrams
- 3D animations → Interactive 3D canvas
- Plots → Interactive charts
- Read-only by default

### Code View (Editable)
- Full source code
- Syntax highlighting
- Monaco editor
- Can edit and re-run
- Changes create new version or fork

```
┌─────────────────────────────────────────────────────────┐
│              ARTIFACT DUAL-VIEW SYSTEM                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐   │
│  │   RENDER VIEW        │  │    CODE VIEW         │   │
│  │   (Default)          │  │    (Editable)        │   │
│  ├──────────────────────┤  ├──────────────────────┤   │
│  │                      │  │ import qiskit        │   │
│  │      ●───H───●       │  │ from qiskit import   │   │
│  │      │       │       │  │   QuantumCircuit     │   │
│  │      ●───────⊕       │  │                      │   │
│  │                      │  │ qc = QuantumCircuit  │   │
│  │  [Run] [Edit Code]   │  │         (2, 2)       │   │
│  │                      │  │ qc.h(0)              │   │
│  └──────────────────────┘  │ qc.cx(0, 1)          │   │
│           ↕ Toggle          │                      │   │
│                             │ [Run] [Save Fork]    │   │
│                             └──────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Artifact Referencing in Chat

### Reference Syntax

Users can reference artifacts in chat using `@` syntax:

```
User: "Can you optimize @circuit-bell-state for better fidelity?"

User: "Use @agent-quantum-researcher to analyze this data"

User: "Apply the pattern from @skill-vqe-optimization here"
```

### Reference Resolution

```typescript
interface ArtifactReference {
  id: string;
  name: string;
  type: ArtifactType;
  volume: 'system' | 'team' | 'user';
  version?: string;
}

// In chat context
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: ArtifactReference[];  // Parsed @references
  generatedArtifacts?: Artifact[];  // Artifacts created by this message
}
```

### Artifact Context Flow

```
┌──────────────────────────────────────────────────────────┐
│           ARTIFACT REFERENCING IN CHAT                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. User types: "@bell-state"                             │
│                    ↓                                      │
│  2. Autocomplete suggests artifacts:                      │
│     - @circuit-bell-state (user/code)                     │
│     - @bell-state-optimizer (team/agent)                  │
│                    ↓                                      │
│  3. User selects artifact                                 │
│                    ↓                                      │
│  4. System loads artifact into context:                   │
│     - Adds code/definition to prompt                      │
│     - Shows artifact preview in sidebar                   │
│     - Tracks reference in message                         │
│                    ↓                                      │
│  5. LLM can read and modify artifact                      │
│                    ↓                                      │
│  6. If modified, creates new artifact or fork             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Session Persistence & GitHub Integration

### Save Session Flow

```
┌──────────────────────────────────────────────────────────┐
│              SAVE SESSION TO GITHUB                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. User clicks "Save Session"                            │
│                    ↓                                      │
│  2. System collects:                                      │
│     ✓ All generated artifacts                             │
│     ✓ Session metadata                                    │
│     ✓ Chat history                                        │
│                    ↓                                      │
│  3. Organize by artifact type:                            │
│     - agents/ → agent-*.json                              │
│     - skills/ → skill-*.md                                │
│     - tools/ → tool-*.py                                  │
│     - workflows/ → workflow-*.json                        │
│     - code-artifacts/ → *.py, *.ipynb                     │
│                    ↓                                      │
│  4. Git commit to volume repo:                            │
│     git add .                                             │
│     git commit -m "Session: [name] - [summary]"           │
│     git push origin main                                  │
│                    ↓                                      │
│  5. Update session status: temporal → saved               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Volume Synchronization

```typescript
// lib/volume-sync.ts
interface VolumeSync {
  // Pull latest from GitHub
  syncVolume(volume: 'system' | 'team' | 'user'): Promise<void>;

  // Commit artifacts to GitHub
  commitArtifacts(
    volume: 'system' | 'team' | 'user',
    artifacts: Artifact[],
    message: string
  ): Promise<void>;

  // Load artifacts from GitHub
  loadArtifacts(volume: 'system' | 'team' | 'user'): Promise<Artifact[]>;
}
```

---

## 7. UI Component Structure

### Simplified Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                          HEADER                                  │
│  [LLMos] [User: alice] [Volume: user] [Settings]               │
├──────────────┬──────────────────────────┬───────────────────────┤
│              │                          │                        │
│   SIDEBAR    │     CHAT/SESSION         │   CONTEXT/ARTIFACTS   │
│              │                          │                        │
│ ┌──────────┐│                          │ ┌───────────────────┐ │
│ │ VOLUMES  ││  Chat messages           │ │ Current Session   │ │
│ │  System  ││  with artifact           │ │  Type: User       │ │
│ │  Team    ││  references              │ │  Status: Temporal │ │
│ │ ●User    ││                          │ └───────────────────┘ │
│ └──────────┘│                          │                        │
│             │                          │ ┌───────────────────┐ │
│ ┌──────────┐│                          │ │ Artifacts (3)     │ │
│ │ SESSIONS ││                          │ │  circuit-1        │ │
│ │  Quantum ││                          │ │  agent-research   │ │
│ │  Analysis││                          │ │  plot-vqe        │ │
│ │ ●VQE Demo││                          │ │                   │ │
│ │  [+ New] ││                          │ │  [View] [Save]    │ │
│ └──────────┘│                          │ └───────────────────┘ │
│             │                          │                        │
│ ┌──────────┐│  ┌────────────────────┐  │ ┌───────────────────┐ │
│ │ GIT      ││  │ @artifact-ref      │  │ │ Volume Browser    │ │
│ │  3 files ││  │ [Preview]          │  │ │  /agents          │ │
│ │  modified││  └────────────────────┘  │ │  /skills          │ │
│ │ [Commit] ││                          │ │  /code-artifacts  │ │
│ └──────────┘│  Input: @...             │ └───────────────────┘ │
│             │  [Send]                  │                        │
└──────────────┴──────────────────────────┴───────────────────────┘
```

### Key Component Updates

**1. SessionPanel** (`components/panel2-session/SessionPanel.tsx`)
- Add session type selector (User/Team)
- Show temporal vs saved status
- Add "Save Session" button
- Display referenced artifacts

**2. ArtifactPanel** (`components/panel3-artifacts/ArtifactPanel.tsx`)
- Unified artifact gallery
- Toggle between Render/Code view
- Edit code in Code view
- Save/Fork buttons
- Reference in chat button

**3. ChatPanel** (`components/chat/ChatPanel.tsx`)
- Artifact autocomplete on `@`
- Inline artifact previews
- Show generated artifacts
- Quick save artifact actions

**4. VolumeTree** (`components/panel1-volumes/VolumeTree.tsx`)
- Browse all artifacts by type
- Filter by volume
- Drag to reference in chat

---

## 8. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User creates session (choose user/team)                 │
│                    ↓                                         │
│  2. Chat in session, reference existing artifacts           │
│     "@circuit-bell → loads from volume                      │
│                    ↓                                         │
│  3. LLM generates new artifacts                              │
│     - Stored in session.artifacts (temporal)                 │
│     - Preview in Render view                                 │
│                    ↓                                         │
│  4. User can:                                                │
│     a) Edit artifact code → creates new version              │
│     b) Save artifact → commits to volume/GitHub              │
│     c) Reference in new message → continues development      │
│     d) Fork to user volume → makes personal copy             │
│                    ↓                                         │
│  5. Save entire session:                                     │
│     - Commits all artifacts to volume repo                   │
│     - Updates session status: saved                          │
│     - Git push to GitHub                                     │
│                    ↓                                         │
│  6. Cron jobs analyze saved sessions:                        │
│     - Extract patterns → create skills                       │
│     - Update system volume                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Priorities

### Phase 1: Core Artifact System
1. Create unified `Artifact` type
2. Implement artifact storage in context
3. Add artifact gallery to UI
4. Implement Render/Code dual views

### Phase 2: Artifact Referencing
1. Add `@` autocomplete in chat
2. Load artifact context into messages
3. Display referenced artifacts in sidebar
4. Track artifact usage

### Phase 3: Persistence
1. Implement save session flow
2. Connect GitHub API for commits
3. Add volume sync functionality
4. Handle merge conflicts

### Phase 4: Polish
1. Add artifact versioning
2. Implement fork functionality
3. Add artifact search/filter
4. Improve UX with loading states

---

## 10. Technical Stack

### Current Dependencies
- Next.js 14 (React framework)
- Zustand (State management - not currently used, can use for artifacts)
- Monaco Editor (Code editing)
- ReactFlow (Workflow visualization)
- Pyodide (Python runtime)

### New Dependencies Needed
- `@octokit/rest` - GitHub API client (may already be available)
- `simple-git` or GitHub API - Git operations

### File Structure Updates

```
lib/
├── artifacts/
│   ├── artifact-manager.ts      # NEW: Manage artifacts
│   ├── artifact-renderer.ts     # NEW: Render artifact views
│   ├── artifact-storage.ts      # NEW: Artifact persistence
│   └── artifact-references.ts   # NEW: Reference resolution
├── volumes/
│   ├── volume-sync.ts           # ENHANCE: existing volume-loader.ts
│   └── github-sync.ts           # NEW: GitHub integration
└── session/
    └── session-persistence.ts   # NEW: Session save/load

components/
├── artifacts/
│   ├── ArtifactViewer.tsx       # NEW: Unified artifact viewer
│   ├── ArtifactGallery.tsx      # EXISTS: Enhance
│   ├── CodeView.tsx             # NEW: Editable code view
│   └── RenderView.tsx           # NEW: Visual render view
└── chat/
    └── ArtifactReference.tsx    # NEW: @ autocomplete
```

---

## Next Steps

1. Review this architecture
2. Create visual mockups
3. Begin implementation with Phase 1
