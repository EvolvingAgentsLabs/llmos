# LLMos UX: Claude Code CLI Alignment

## Summary of Required UX Changes

Transform LLMos from a chat-artifact system to a **file-based workspace** matching Claude Code CLI experience.

---

## Key Paradigm Shifts

### 1. **Chat Modifies Files (Not Generates Artifacts)**

**Current (Wrong):**
- User: "Create quantum circuit"
- AI: Generates artifact in chat history
- Artifact exists only in session

**New (Claude Code Way):**
- User: "Create quantum circuit"
- AI: `Writing to user-volume/circuits/h2_vqe.py...`
- AI: Creates/modifies actual file in volume
- File persists in GitHub repo

### 2. **Canvas = Live Runtime Preview**

**Current (Wrong):**
- Canvas shows static artifact renders
- Disconnected from actual execution

**New (Claude Code Way):**
- Canvas runs the selected file in Pyodide runtime
- Shows live output: plots, circuits, results
- Like running `python file.py` and seeing output
- Can re-run, see console, view images

### 3. **Volumes = GitHub Repositories**

**Current (Wrong):**
- Volumes are abstract storage
- No real persistence

**New (Claude Code Way):**
- Each volume IS a GitHub repo:
  - `system-volume` → `llmunix/system-volume` (read-only)
  - `team-volume` → `org/team-workspace`
  - `user-volume` → `user/llmos-workspace`
- Files sync bidirectionally
- Git operations: commit, push, pull
- Version history preserved

### 4. **Sub-agents Execute from Volume Files**

**Current (Wrong):**
- Sub-agents are abstract concepts
- Not connected to files

**New (Claude Code Way):**
- Sub-agents are `.agent` files in volumes
- Chat can invoke: `@quantum-researcher analyze this circuit`
- Agent file loaded and executed
- Like Claude Code's `/.claude/agents/` directory

---

## Detailed UX Flows

### Flow 1: Creating a New File

```
USER CHAT:
"Create a VQE circuit for H2 molecule optimization"

AI RESPONSE (Claude Code style):
"I'll create a VQE circuit for H2 molecule optimization.

📝 Writing to user-volume/quantum/h2_vqe.py

[Shows code being written with tool use]

✓ File created: user-volume/quantum/h2_vqe.py

The circuit uses a UCCSD ansatz with 4 qubits for the H2 molecule..."

EXPLORER PANEL:
user-volume/
  └── quantum/
      └── h2_vqe.py  ← NEW FILE APPEARS

CANVAS (Auto-opens):
[Shows live preview of h2_vqe.py running in Pyodide]
- Circuit diagram
- Energy values
- Matplotlib plots

CONTEXT PANEL:
- Shows execution trace
- Runtime output
- Any errors
```

### Flow 2: Modifying an Existing File

```
USER (with circuits/bell_state.py selected):
"Add measurement gates to this circuit"

AI RESPONSE:
"I'll add measurement gates to bell_state.py

📝 Editing circuits/bell_state.py

[Shows Edit tool with old/new code]

✓ File updated

The circuit now includes measurements on both qubits..."

CANVAS:
[Auto-refreshes to show updated circuit]
- Now shows measurement gates
- Updated diagram

GIT STATUS (in Context Panel):
M circuits/bell_state.py

USER CAN:
- Review changes in diff view
- Commit: "Add measurements to Bell state"
- Push to GitHub
```

### Flow 3: Using Sub-agents from Volumes

```
EXPLORER shows:
team-volume/
  └── agents/
      ├── quantum-optimizer.agent
      └── circuit-analyzer.agent

USER CHAT:
"@quantum-optimizer improve the circuit in h2_vqe.py"

AI RESPONSE:
"Loading agent from team-volume/agents/quantum-optimizer.agent

🤖 Running Quantum Optimizer Agent...

[Agent analyzes h2_vqe.py]

📝 Writing optimizations to h2_vqe_optimized.py

Optimization suggestions:
1. Reduced gate count by 30%
2. Improved fidelity estimate
3. Added noise mitigation..."

RESULT:
- New file: h2_vqe_optimized.py
- Shows in Canvas
- Agent execution trace in Context
```

### Flow 4: Canvas Runtime Execution

```
USER: Clicks on user-volume/plots/energy_landscape.py in Explorer

CANVAS VIEW:
┌─────────────────────────────────────────────────┐
│ energy_landscape.py                    [▶ Run]  │
├─────────────────────────────────────────────────┤
│                                                  │
│  [Tab: Preview] [Tab: Code] [Tab: Console]     │
│                                                  │
│  PREVIEW TAB (Active):                          │
│  ┌──────────────────────────────────┐          │
│  │  [3D Energy Landscape Plot]       │          │
│  │                                    │          │
│  │  Interactive matplotlib figure     │          │
│  │  Can rotate, zoom, inspect         │          │
│  └──────────────────────────────────┘          │
│                                                  │
│  CONSOLE OUTPUT:                                │
│  > Calculating energy landscape...              │
│  > Grid points: 100x100                         │
│  > Minimum energy: -1.137 Ha                    │
│  > Plot generated ✓                             │
│                                                  │
└─────────────────────────────────────────────────┘

CODE TAB:
Shows syntax-highlighted source code
Can edit inline → re-run

CONSOLE TAB:
Full Python console output
Errors, warnings, print statements
```

---

## Component Behavior Changes

### Explorer Panel (Left)

**Before:**
- Shows file tree
- Click = view in Canvas

**Now:**
- Shows actual GitHub repo structure
- Real files, real folders
- Icons show git status: M (modified), A (added), ? (untracked)
- Right-click menu:
  - Run in Canvas
  - Open in Chat context
  - Git: Diff, Commit, Revert
  - Reference in chat (@file)

### Chat Panel (Center)

**Before:**
- Generates artifacts
- Chat history with embedded results

**Now (Claude Code CLI):**
- Uses file tools (Read, Write, Edit, Bash)
- Shows tool use clearly:
  ```
  📝 Writing to circuits/new_circuit.py
  ✏️ Editing agents/optimizer.agent
  👁️ Reading data/results.json
  🔧 Running python scripts/analyze.py
  ```
- Can reference files: "Look at circuits/bell_state.py"
- Can invoke agents: "@circuit-analyzer check this"
- Git operations shown: "Committing 3 files..."

### Canvas Panel (Center, Alternative View)

**Before:**
- Shows static artifact renders

**Now:**
- **RUNTIME EXECUTION VIEW**
- Three tabs:
  1. **Preview**: Live output (plots, circuits, visualizations)
  2. **Code**: Editable source code
  3. **Console**: Python stdout/stderr

- Top bar:
  ```
  [user-volume/quantum/h2_vqe.py]  [▶ Run] [⏹ Stop] [🔄 Reload]
  ```

- Behavior:
  - Auto-runs when file opens (optional)
  - Shows Pyodide execution
  - Captures matplotlib figures
  - Shows print() output
  - Displays errors inline

### Context Panel (Right)

**Before:**
- Session info
- Artifacts list

**Now:**
- **Current File Info**:
  - File: `user-volume/quantum/h2_vqe.py`
  - Status: Modified
  - Last run: 2s ago
  - Runtime: Pyodide

- **Execution Trace**:
  - LLM tool uses
  - Agent invocations
  - File operations
  - Git commands

- **Git Status**:
  - Modified files (M)
  - Untracked files (?)
  - Staged changes
  - Quick commit button

- **Active Agents**:
  - @quantum-optimizer (from team-volume)
  - @circuit-analyzer (from system-volume)

---

## Technical Implementation

### 1. Volume = GitHub Repo Integration

```typescript
interface Volume {
  name: 'system' | 'team' | 'user';
  githubRepo: string;  // e.g., "llmunix/system-volume"
  localPath: string;   // Local clone path
  accessToken: string; // GitHub PAT
}

// Operations
class VolumeManager {
  async syncFromGitHub(volume: Volume): Promise<void> {
    // git pull origin main
  }

  async commitAndPush(volume: Volume, files: string[], message: string): Promise<void> {
    // git add, git commit, git push
  }

  async readFile(volume: Volume, path: string): Promise<string> {
    // Read from local clone
  }

  async writeFile(volume: Volume, path: string, content: string): Promise<void> {
    // Write to local clone
    // Mark as modified
  }
}
```

### 2. Canvas Runtime Integration

```typescript
interface CanvasRuntime {
  fileUrl: string;  // user-volume/quantum/h2_vqe.py
  runtime: 'pyodide' | 'quickjs' | 'native';

  async execute(): Promise<{
    stdout: string;
    stderr: string;
    images: string[];  // base64 matplotlib pngs
    error?: string;
  }>;

  async stop(): Promise<void>;
}

// Canvas Component
function Canvas({ selectedFile }: { selectedFile: string }) {
  const [output, setOutput] = useState<RuntimeOutput>();
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'console'>('preview');

  const runFile = async () => {
    const runtime = new PyodideRuntime();
    const code = await volumeManager.readFile(selectedFile);
    const result = await runtime.execute(code);
    setOutput(result);
  };

  return (
    <div>
      <Tabs>
        <Tab name="preview">
          {output?.images.map(img => <img src={img} />)}
        </Tab>
        <Tab name="code">
          <MonacoEditor value={fileContent} onChange={handleEdit} />
        </Tab>
        <Tab name="console">
          <pre>{output?.stdout}</pre>
          <pre className="error">{output?.stderr}</pre>
        </Tab>
      </Tabs>
    </div>
  );
}
```

### 3. Chat File Tools Integration

```typescript
// Chat LLM has these tools:
const tools = [
  {
    name: 'read_file',
    description: 'Read a file from a volume',
    parameters: {
      volume: 'system' | 'team' | 'user',
      path: 'string'
    }
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file',
    parameters: {
      volume: 'system' | 'team' | 'user',
      path: 'string',
      content: 'string'
    }
  },
  {
    name: 'edit_file',
    description: 'Edit existing file (like Claude Code)',
    parameters: {
      volume: 'system' | 'team' | 'user',
      path: 'string',
      old_string: 'string',
      new_string: 'string'
    }
  },
  {
    name: 'execute_in_canvas',
    description: 'Run file in Canvas runtime',
    parameters: {
      volume: 'system' | 'team' | 'user',
      path: 'string'
    }
  },
  {
    name: 'git_commit',
    description: 'Commit changes to volume',
    parameters: {
      volume: 'system' | 'team' | 'user',
      files: 'string[]',
      message: 'string'
    }
  },
  {
    name: 'invoke_agent',
    description: 'Run sub-agent from volume',
    parameters: {
      agent_path: 'string',  // e.g., "team-volume/agents/optimizer.agent"
      task: 'string'
    }
  }
];
```

### 4. Sub-agent File Format

```markdown
<!-- team-volume/agents/quantum-optimizer.agent -->
# Quantum Circuit Optimizer Agent

## Description
Analyzes quantum circuits and suggests optimizations for gate count and fidelity.

## Capabilities
- Gate reduction
- Circuit depth optimization
- Noise mitigation strategies
- Fidelity estimation

## System Prompt
You are a quantum circuit optimization expert. When given a circuit file:
1. Analyze gate usage and depth
2. Identify optimization opportunities
3. Suggest specific gate replacements
4. Estimate fidelity improvements
5. Generate optimized version

## Tools
- read_file
- write_file
- execute_in_canvas (for testing)

## Example Usage
@quantum-optimizer analyze user-volume/circuits/vqe.py
```

When chat sees `@quantum-optimizer`, it:
1. Loads the .agent file
2. Creates a sub-agent with that system prompt
3. Passes the task to sub-agent
4. Sub-agent uses tools to modify files
5. Returns results to main chat

---

## Migration Plan

### Phase 1: Volume-GitHub Integration
- [ ] Connect volumes to GitHub repos
- [ ] Implement git clone/pull/push
- [ ] File read/write from repos
- [ ] Git status display in UI

### Phase 2: Chat File Tools
- [ ] Add Read/Write/Edit tools to LLM
- [ ] Tool use display in chat (like Claude Code)
- [ ] File selection context
- [ ] Git commit through chat

### Phase 3: Canvas Runtime
- [ ] Pyodide execution engine
- [ ] Matplotlib image capture
- [ ] Console output display
- [ ] Preview/Code/Console tabs
- [ ] Run/Stop/Reload controls

### Phase 4: Sub-agents
- [ ] .agent file format parser
- [ ] Agent loading from volumes
- [ ] @mention syntax in chat
- [ ] Sub-agent task delegation
- [ ] Agent tool execution

---

## Key UX Principles

1. **Files Are First-Class**
   - Everything is a file in a volume
   - Chat modifies files, not artifacts
   - Files persist in Git

2. **Runtime = Canvas**
   - Canvas executes selected file
   - Shows live output
   - Not a static viewer

3. **Volumes = GitHub Repos**
   - Real repositories
   - Real git operations
   - Version controlled

4. **Agents = Executable Files**
   - Sub-agents live in volumes
   - Chat can invoke them
   - They modify files too

5. **Chat = Claude Code CLI**
   - Uses file tools
   - Shows tool execution
   - Git operations visible
   - Clear, structured output

---

## Examples Comparison

### Creating a Quantum Circuit

**OLD WAY:**
```
User: "Create a Bell state circuit"
AI: [Generates artifact with circuit diagram]
Result: Artifact in chat history, no file created
```

**NEW WAY (Claude Code):**
```
User: "Create a Bell state circuit"
AI: "I'll create a Bell state circuit for you.

📝 Writing to user-volume/circuits/bell_state.py

[Shows Write tool use with code]

✓ File created: user-volume/circuits/bell_state.py

The circuit creates an entangled Bell state using a Hadamard gate..."

Result:
- File appears in Explorer
- Auto-opens in Canvas
- Shows circuit diagram in Preview tab
- User can edit, re-run, commit to Git
```

### Optimizing Code

**OLD WAY:**
```
User: "Optimize this circuit"
AI: [Generates new artifact with optimized version]
Result: Two artifacts, no clear diff, manual copying needed
```

**NEW WAY (Claude Code):**
```
User: (with circuits/vqe.py selected) "Optimize this circuit"
AI: "I'll optimize the VQE circuit.

✏️ Editing circuits/vqe.py

Replacing gate sequence with optimized version:
  - Reduced gate count: 45 → 32
  - Improved depth: 12 → 8

✓ File updated

Result:
- File modified in place
- Canvas refreshes with new circuit
- Git shows: M circuits/vqe.py
- Can see diff, commit, or revert
```

---

## Next Steps

1. **Review this design** with team
2. **Prototype** the Canvas runtime first (most visible change)
3. **Implement** GitHub integration for volumes
4. **Refactor** chat to use file tools instead of artifacts
5. **Add** sub-agent system last

This transforms LLMos from a chat-with-artifacts app into a **file-based quantum development workspace** with AI assistance, matching the Claude Code CLI experience.
