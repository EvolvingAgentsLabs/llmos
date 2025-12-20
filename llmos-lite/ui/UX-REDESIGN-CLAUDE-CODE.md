# LLMos UX Redesign: Claude Code Experience

## Executive Summary

Transform LLMos from a "chat with artifacts" model to a **Claude Code CLI experience** where:
- Chat directly modifies volume files (not generating separate artifacts)
- Canvas shows live previews using Pyodide runtime
- Volumes are Git repositories (GitHub-backed)
- Sub-agents execute from volume files

---

## 1. Chat = File Modification Engine

### Current (Wrong)
```
User: "Create a quantum circuit"
AI: [generates artifact object]
UI: Shows artifact in chat history
```

### New (Claude Code Style)
```
User: "Create a quantum circuit for VQE"
AI: I'll create a new file in your user volume.

[Tool: Write]
Creating: user-volume/circuits/h2_vqe.py

[Shows diff]
+++ user-volume/circuits/h2_vqe.py
+from qiskit import QuantumCircuit
+from qiskit.circuit.library import TwoLocal
+
+def create_h2_ansatz():
+    circuit = QuantumCircuit(4)
+    circuit.h(range(4))
+    ...
+    return circuit

File created: user-volume/circuits/h2_vqe.py
```

**Key difference**: AI uses **Write/Edit/Read tools** on volume files, not creating "artifacts"

---

## 2. Canvas = Live Runtime Preview

### Current (Wrong)
- Shows static "artifact view"
- Disconnected from execution

### New (Like VSCode Preview)
```
┌─────────────────────────────────────────────────────────┐
│ user-volume/circuits/h2_vqe.py          [● modified]    │
├──────────────────────┬──────────────────────────────────┤
│                      │                                   │
│  CODE VIEW           │   LIVE PREVIEW                    │
│                      │                                   │
│  def create_h2():    │   ┌─────────────────────┐       │
│    circuit = QC(4)   │   │  [Runtime Output]   │       │
│    circuit.h(0)      │   │                     │       │
│    ...               │   │   Circuit Diagram:  │       │
│                      │   │   q0: ──H──●────    │       │
│  if __name__:        │   │   q1: ─────┼────    │       │
│    c = create_h2()   │   │   q2: ──H──┼────    │       │
│    print(c)          │   │   q3: ─────⊕────    │       │
│                      │   │                     │       │
│  [Run in Runtime] ▶  │   │  [Auto-executed]    │       │
│                      │   └─────────────────────┘       │
└──────────────────────┴──────────────────────────────────┘
```

**Key Features**:
1. **Code View**: Shows actual file from volume (editable)
2. **Live Preview**: Auto-runs file in Pyodide when saved
3. **Split View**: Like Jupyter but file-based
4. **Runtime Output**: matplotlib plots, print statements, circuit diagrams

---

## 3. Volumes = Git Repositories

### Structure

Each volume **IS** a GitHub repository:

```
System Volume (github.com/llmos/system-volume)
├── agents/
│   ├── quantum-researcher/
│   │   ├── agent.py          # Executable sub-agent
│   │   └── config.json
│   └── code-optimizer/
│       ├── agent.py
│       └── config.json
├── skills/
│   ├── vqe-pattern.md        # Skill definitions
│   └── circuit-optimization.md
└── tools/
    ├── hamiltonian-solver.py
    └── plot-bloch.py

User Volume (github.com/{user}/llmos-workspace)
├── circuits/
│   ├── h2_vqe.py            # User's quantum circuits
│   └── bell_state.py
├── experiments/
│   ├── vqe_run_1.ipynb
│   └── results.json
└── .llmos/
    └── sessions/
        └── session-2024-12-20.json
```

### Git Operations in UI

```
Chat Integration:
User: "Save my work"
AI: I'll commit your changes to the repository.

[Tool: Git]
Staging files:
  - circuits/h2_vqe.py (modified)
  - experiments/vqe_run_1.ipynb (new)

git add circuits/h2_vqe.py experiments/vqe_run_1.ipynb
git commit -m "Add H2 VQE circuit and experiment notebook"
git push origin main

✓ Pushed to github.com/{user}/llmos-workspace
```

---

## 4. Sub-Agents from Volume Files

### Current (Wrong)
- Sub-agents are abstract concepts
- Not tied to files

### New (Claude Code Style)

Sub-agents **ARE executable Python files** in volumes:

```python
# system-volume/agents/quantum-researcher/agent.py

class QuantumResearcher:
    """
    Sub-agent for quantum algorithm research
    Used by main chat to perform specialized quantum tasks
    """
    
    def __init__(self, llm_client):
        self.llm = llm_client
        self.tools = self.load_tools()
    
    def research_algorithm(self, topic: str) -> dict:
        """Research quantum algorithm and return implementation"""
        # Uses LLM to research
        # Can call other tools from volumes
        # Returns structured results
        pass
    
    def optimize_circuit(self, circuit_path: str) -> dict:
        """Load circuit from volume and optimize"""
        circuit_code = read_file_from_volume(circuit_path)
        # Analyze and optimize
        return optimized_circuit
```

### Usage in Chat

```
User: "Research the best ansatz for H2 molecule"

AI: I'll use the quantum-researcher sub-agent for this task.

[Tool: Agent]
Launching: system-volume/agents/quantum-researcher/agent.py
Task: Research optimal ansatz for H2 molecule

[Sub-agent output]
Quantum Researcher Agent:
- Analyzed literature on H2 VQE
- Recommended: Hardware-efficient ansatz with 2 qubits
- Generated circuit template

[Tool: Write]
Creating: user-volume/circuits/h2_optimized_ansatz.py
...

The sub-agent has created an optimized ansatz in your circuits folder.
```

**Key Points**:
- Sub-agents are **files** in system/team/user volumes
- Can be **customized** by editing the .py file
- **Shared** via Git (team volume)
- **Versioned** like any code

---

## 5. Complete User Flow

### Scenario: Create and Run Quantum Circuit

```
1. USER PROMPT
   "Create a VQE circuit for the H2 molecule"

2. AI RESPONSE
   I'll create a VQE circuit file in your user volume.
   
   [Using Tool: Write]
   Creating: user-volume/circuits/h2_vqe.py
   
   [Shows file creation with syntax highlighting]

3. CANVAS AUTO-UPDATES
   - Left: Shows new file h2_vqe.py in Explorer
   - Center: Opens file in Code View
   - Right: Live Preview starts running the file

4. RUNTIME EXECUTES
   [Pyodide Runtime]
   Loading: user-volume/circuits/h2_vqe.py
   Installing: qiskit, numpy
   Running: __main__ block
   
   Output:
   - Circuit diagram (matplotlib)
   - Eigenvalue: -1.8572 Ha
   - Convergence plot

5. USER ITERATION
   "Modify it to use 4 qubits instead"
   
   AI: I'll update the file.
   
   [Using Tool: Edit]
   Modifying: user-volume/circuits/h2_vqe.py
   Line 15: circuit = QuantumCircuit(2) → circuit = QuantumCircuit(4)
   
   [Canvas auto-updates and re-runs]

6. USER SAVES
   "Save this to my repo"
   
   AI: I'll commit your changes.
   
   [Using Tool: Git]
   git add circuits/h2_vqe.py
   git commit -m "Add H2 VQE circuit with 4-qubit ansatz"
   git push origin main
   
   ✓ Saved to github.com/{user}/llmos-workspace
```

---

## 6. Key UI Changes Needed

### Explorer Panel

```
BEFORE:
- Sessions list
- Artifacts list  
- Cron jobs

AFTER:
- Volume switcher (System/Team/User)
- File tree (live from Git repo)
- Git status (modified files)
- Branch indicator
```

### Chat Panel

```
BEFORE:
- Messages with embedded "artifacts"
- Artifact preview cards

AFTER:
- Messages with file operations
- Tool use indicators (Write, Edit, Read, Git, Agent)
- Diff views for file changes
- Link to files (click to open in Canvas)
```

### Canvas Panel

```
BEFORE:
- Static artifact viewer
- Render/Code toggle

AFTER:
- VSCode-like editor
- Live runtime preview (split view)
- Auto-execute on save
- Console output panel
- Plot/visualization area
```

### Context Panel

```
BEFORE:
- Session metadata
- Artifact references

AFTER:
- Git status
- Modified files list
- Runtime status
- Active sub-agents
- Execution trace
```

---

## 7. Technical Implementation

### File Operations Layer

```typescript
// lib/file-operations.ts

interface VolumeFile {
  path: string;  // "user-volume/circuits/vqe.py"
  volume: 'system' | 'team' | 'user';
  content: string;
  gitStatus: 'unmodified' | 'modified' | 'new' | 'deleted';
}

class VolumeFileSystem {
  // Claude Code-style file operations
  async readFile(path: string): Promise<string>
  async writeFile(path: string, content: string): Promise<void>
  async editFile(path: string, oldContent: string, newContent: string): Promise<void>
  async deleteFile(path: string): Promise<void>
  
  // Git operations
  async gitStatus(volume: string): Promise<GitStatus>
  async gitCommit(volume: string, files: string[], message: string): Promise<void>
  async gitPush(volume: string): Promise<void>
  async gitPull(volume: string): Promise<void>
}
```

### Runtime Preview

```typescript
// lib/runtime-preview.ts

class RuntimePreview {
  private pyodide: PyodideInterface;
  
  async executeFile(filePath: string): Promise<ExecutionResult> {
    // Load file content
    const code = await readFileFromVolume(filePath);
    
    // Execute in Pyodide
    const result = await this.pyodide.runPythonAsync(code);
    
    // Capture outputs
    return {
      stdout: capturedOutput,
      stderr: capturedErrors,
      images: capturedPlots,
      returnValue: result
    };
  }
  
  // Auto-execute on file save
  watchFile(filePath: string, callback: (result: ExecutionResult) => void) {
    // Listen for file changes
    // Auto-run and send results to Canvas
  }
}
```

### Sub-Agent Execution

```typescript
// lib/subagent-executor.ts

class SubAgentExecutor {
  async executeAgent(
    agentPath: string,  // "system-volume/agents/quantum-researcher/agent.py"
    task: string
  ): Promise<AgentResult> {
    // Load agent file
    const agentCode = await readFileFromVolume(agentPath);
    
    // Execute agent in isolated Pyodide context
    const agent = await this.createAgentInstance(agentCode);
    
    // Run agent task
    const result = await agent.execute(task);
    
    return {
      output: result,
      filesCreated: agent.createdFiles,
      toolsUsed: agent.toolCalls
    };
  }
}
```

---

## 8. Migration Path

### Phase 1: File-Based Backend
- [ ] Implement VolumeFileSystem class
- [ ] Connect to GitHub API for repo operations
- [ ] Replace artifact storage with file-based storage
- [ ] Update chat to use Write/Edit/Read tools

### Phase 2: Runtime Preview
- [ ] Add split view to Canvas (Code | Preview)
- [ ] Implement auto-execute on save
- [ ] Capture matplotlib plots
- [ ] Show console output

### Phase 3: Git Integration
- [ ] Add Git status to Explorer
- [ ] Implement commit/push from chat
- [ ] Show diff views for changes
- [ ] Handle merge conflicts

### Phase 4: Sub-Agents
- [ ] Load agents from volume files
- [ ] Execute agents in isolated context
- [ ] Track agent file operations
- [ ] Allow agent customization

---

## 9. Benefits of This Approach

### For Users
✅ **Familiar**: Works like Claude Code CLI (trusted UX)
✅ **Persistent**: Everything in Git repos (never lose work)
✅ **Collaborative**: Share volumes via GitHub
✅ **Flexible**: Edit files directly or via chat
✅ **Transparent**: See exactly what AI is changing

### For Developers
✅ **Simpler**: No complex artifact system
✅ **Standard**: Uses Git, files, standard Python
✅ **Testable**: Files can be run outside LLMos
✅ **Extensible**: Easy to add new agents/tools
✅ **Debuggable**: Clear execution trace

---

## 10. Comparison: Old vs New

| Aspect | Old (Artifact-Centric) | New (Claude Code Style) |
|--------|------------------------|-------------------------|
| **Chat Output** | Generates artifacts | Modifies files |
| **Storage** | Artifact objects in DB | Files in Git repos |
| **Preview** | Static artifact view | Live runtime execution |
| **Persistence** | Save artifacts manually | Auto-synced with Git |
| **Sharing** | Export artifacts | Push/pull Git repos |
| **Sub-Agents** | Abstract concept | Executable .py files |
| **User Mental Model** | "Chat creates things" | "Chat edits my project" |

---

## Next Steps

1. **Review this design** with team
2. **Prototype** file operations layer
3. **Test** Git integration with real repos
4. **Implement** split-view Canvas with runtime
5. **Migrate** existing UI components
6. **Deploy** alpha version for testing

---

**Key Insight**: LLMos should feel like **Claude Code CLI in a browser**, where users have a **quantum workspace** (volumes) that the AI helps them build and modify, with live previews powered by Pyodide runtime.
