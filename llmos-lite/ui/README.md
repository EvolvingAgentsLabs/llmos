# LLMos-Lite UI

A Claude Code-style development environment for quantum computing and scientific computing in your browser.

---

## What is LLMos-Lite?

LLMos-Lite brings the power of Claude Code CLI to the browser. Chat with AI to create, modify, and run code files stored in Git-backed volumes. Watch your Python code execute live with real-time output and visualizations.

**Think of it as:** Claude Code + Jupyter + VSCode, all in your browser.

---

## Quick Start

### 1. First Launch

1. Enter your OpenRouter API key
2. Choose your focus area (Quantum Computing or 3D Visualization)
3. Start chatting!

### 2. Your First Interaction

```
You: Create a quantum circuit that makes a Bell state

AI: I'll create that circuit for you
    [Creates file: user-volume/circuits/bell-state.py]

    ✓ File created successfully

You can now see the file in the Explorer and run it in the Canvas.
```

---

## How It Works

### File-Based Workflow (Like Claude Code)

Unlike traditional chatbots that show code in messages, LLMos-Lite works with **real files** stored in **Git repositories**:

```
Traditional Chat                    LLMos-Lite (Claude Code Style)
─────────────────                   ───────────────────────────────
User: "Create a circuit"            User: "Create a circuit"
Bot: "Here's the code:              AI: [Creates file]
      ```python                         ✓ user-volume/circuits/bell.py
      qc = QuantumCircuit(2)
      ...                           User: "Modify that circuit"
      ```                           AI: [Edits file]
      Copy and paste this"              ✏️ Modified bell.py (3 changes)

User: Has to copy/paste             User: File automatically saved
```

### The AI Uses Tools (Just Like Claude Code)

When you chat, the AI uses file operation tools:

- **Read File** 👁️ - Read code from volumes
- **Write File** 📝 - Create new files
- **Edit File** ✏️ - Modify existing files
- **Delete File** 🗑️ - Remove files
- **List Files** 📂 - Browse directories
- **Git Commit** 🔧 - Save changes to Git

You'll see these tools in action as the AI works:

```
You: "Add error handling to that circuit"

AI: 👁️ Read File
    user-volume/circuits/bell.py

    ✏️ Edit File
    user-volume/circuits/bell.py
    + try:
    +     qc.draw('mpl')
    + except Exception as e:
    +     print(f"Error: {e}")

    ✓ File updated successfully
```

---

## The Workspace

### 3-Panel Layout

```
┌─────────────────────────────────────────────────────────┐
│                    [Header Bar]                          │
├──────────┬────────────────────────┬────────────────────┤
│          │                        │                     │
│ Explorer │    Chat / Canvas       │   Context           │
│          │                        │                     │
│ 📁 Files │ Talk with AI          │ 📊 Session Info    │
│ 🔀 Git   │ or                     │ 🔍 Execution Logs  │
│ 🤖 Agents│ Preview/Run Files      │ 📝 Artifacts       │
│          │                        │                     │
└──────────┴────────────────────────┴────────────────────┘
```

---

## Volumes: Your File System

Files are organized into three "volumes" (like disk drives):

### 🔒 System Volume (Read-Only)
Pre-built tools and examples maintained by LLMos
- Quantum algorithms
- Example agents
- Utility tools

### 👥 Team Volume (Shared)
Shared workspace for your team
- Team projects
- Shared agents
- Collaborative code

### 👤 User Volume (Personal)
Your personal workspace
- Your projects
- Private experiments
- Custom agents

**All volumes are backed by GitHub repositories**, so your work is version controlled and persistent.

---

## Live Code Execution

### Split View: Code + Preview

When you open a Python file, you see it split into two panels:

```
┌────────────────────┬──────────────────────┐
│  Code Editor       │  Live Preview        │
├────────────────────┼──────────────────────┤
│ from qiskit import │  ✓ Executed in 1.2s │
│   QuantumCircuit   │                      │
│                    │  Output:             │
│ qc = Quantum...    │  Energy: -1.85       │
│ qc.h(0)           │                      │
│ qc.cx(0, 1)       │  [Circuit Diagram]   │
│                    │       ●─H─●          │
│ qc.draw('mpl')    │       │   │          │
│                    │       ●───⊕          │
│ [Save] [Run]      │                      │
└────────────────────┴──────────────────────┘
```

**Features:**
- ✅ Auto-run on save (toggle on/off)
- ✅ See console output in real-time
- ✅ Matplotlib plots appear automatically
- ✅ Python runs in your browser (Pyodide)
- ✅ No server needed - it's all client-side

---

## Git Integration

### See Your Changes in Real-Time

The Git panel shows modified files with status badges:

```
Git Status
──────────
M circuits/bell.py
A circuits/ghz.py
M utils/optimizer.py

[3 files changed]
[Commit All]
```

**Status badges:**
- `M` = Modified
- `A` = Added (new file)
- `D` = Deleted

### Commit from Chat

You can ask the AI to commit your changes:

```
You: "Commit these circuit improvements"

AI: 🔧 Git Commit
    user volume
    "Add error handling and GHZ circuit"
    2 files

    ✓ Committed successfully
```

---

## Sub-Agents

Sub-agents are Python programs that perform specific tasks. They live in the `agents/` folder of any volume.

### Using Agents

Mention agents in chat with `@`:

```
You: "@quantum-optimizer improve my VQE circuit"

AI: I'll use the quantum-optimizer agent...

    🤖 Executing: quantum-optimizer
    Task: Improve VQE circuit convergence

    ✓ Agent completed
    Created: circuits/vqe-optimized.py
```

### Agent List

Browse available agents in the Explorer panel:
- System agents (built-in)
- Team agents (shared)
- Your personal agents

Each agent shows:
- Name and description
- Capabilities (what it can do)
- Location (which volume)

---

## Common Workflows

### 1. Create a New Quantum Circuit

```
1. You: "Create a VQE circuit for H2 molecule"
2. AI creates: user-volume/circuits/h2-vqe.py
3. Click the file in Explorer
4. See code on left, circuit diagram on right
5. Click [Run] to execute
6. See energy values and plots in Preview
```

### 2. Modify Existing Code

```
1. You: "Add parameter optimization to @h2-vqe"
2. AI reads the file
3. AI edits the file (shows diff)
4. Auto-runs with new changes
5. You see updated results in Preview
```

### 3. Save Your Work to Git

```
1. See modified files in Git panel (M badge)
2. You: "Commit these changes"
3. AI creates commit with descriptive message
4. Changes pushed to your GitHub repo
5. Work is saved and versioned
```

### 4. Use Pre-Built Tools

```
1. Browse System volume in Explorer
2. Find: agents/quantum-researcher.py
3. You: "@quantum-researcher analyze this circuit"
4. Agent executes and provides analysis
5. Results appear in chat + Context panel
```

---

## What You Can Build

### Quantum Computing
- ⚛️ VQE optimization circuits
- 🔬 Quantum chemistry simulations
- 🎯 QAOA algorithms
- 📊 Circuit analysis tools

### 3D Visualization
- 🧬 Molecular structures
- 📈 Data visualization
- 🎨 Animated scenes
- 🌍 Scientific plots

### Custom Agents
- 🤖 Task-specific assistants
- 🔄 Workflow automation
- 🔧 Specialized tools
- 📚 Knowledge bases

---

## Key Features

### ✅ Claude Code Experience
- AI modifies files directly (not code in chat)
- Real file operations with Git backing
- Tool use visualization
- Diff previews for changes

### ✅ Live Execution
- Python runs in browser (Pyodide)
- Real-time output capture
- Matplotlib plots automatically displayed
- No server setup needed

### ✅ Git Integration
- Every volume is a GitHub repo
- Real-time status tracking
- Commit from chat
- Full version history

### ✅ VSCode-Inspired UI
- Compact, efficient layout
- Split-view editing
- File explorer with Git status
- Keyboard shortcuts

---

## Tips for Best Results

### 💡 Be Specific About Files
```
❌ "Create a circuit"
✅ "Create a file called bell-state.py with a Bell state circuit"
```

### 💡 Reference Existing Files
```
❌ "Improve the VQE code"
✅ "Improve @h2-vqe by adding error mitigation"
```

### 💡 Use Agents for Complex Tasks
```
❌ "Analyze this circuit and optimize it and generate a report"
✅ "@quantum-optimizer analyze and optimize @my-circuit"
```

### 💡 Commit Regularly
```
You: "Commit this working version"
AI: Creates descriptive commit message
```

---

## Understanding the Interface

### Explorer Panel (Left)

**Volume Switcher**
- Switch between System/Team/User volumes
- Each volume shows its folder structure

**File Tree**
- 📁 Folders (expandable)
- 📄 Files with type badges
- Git status indicators (M/A/D)

**Git Widget**
- Modified files count
- Quick commit button
- Status indicators

**Agent List**
- Available sub-agents
- Filter by volume
- Click to insert @mention

### Chat/Canvas (Center)

**Chat Mode**
- Message history
- Tool use display (Read/Write/Edit files)
- Inline diffs for changes
- Agent execution logs

**Canvas Mode**
- Split view: Code | Preview
- Editable code on left
- Live execution results on right
- Save/Run controls

### Context Panel (Right)

**Session Info**
- Current session name
- Volume and type
- Timestamps

**Execution Logs**
- Real-time Python output
- Stdout/stderr
- Execution time
- Error messages

**Artifacts**
- Files created this session
- Quick preview
- Jump to file

---

## Keyboard Shortcuts

- `Ctrl/Cmd + K` - Focus chat input
- `Ctrl/Cmd + S` - Save current file
- `Ctrl/Cmd + Enter` - Run code
- `Ctrl/Cmd + /` - Toggle Code/Preview
- `@` - Autocomplete agents/files

---

## Troubleshooting

### Code Doesn't Execute?

1. Check Console for Python errors (in Preview panel)
2. Some packages need manual install:
   ```python
   import micropip
   await micropip.install('package-name')
   ```
3. Verify file has no syntax errors
4. Try clicking [Run] manually

### File Not Showing in Explorer?

1. Refresh the Explorer (click volume icon)
2. Check you're in the correct volume
3. Verify file was created (check chat for ✓)

### Git Changes Not Visible?

1. Git widget auto-refreshes every 2 seconds
2. Make sure file was actually modified
3. Check you're looking at the right volume

### AI Creates Code in Chat Instead of Files?

Make sure to ask explicitly for file operations:
```
❌ "Show me a VQE circuit"
✅ "Create a VQE circuit file in my user volume"
```

---

## Technical Requirements

### Browser
- Chrome 90+ (recommended)
- Firefox 88+
- Edge 90+
- Safari 14+

### Internet
- Required for AI chat (OpenRouter API)
- Code execution is local (Pyodide)

### Storage
- ~100MB for Pyodide runtime (cached after first load)
- Session data in browser localStorage
- Files stored in GitHub repos

---

## Differences from Other Tools

### vs Jupyter Notebooks
- ✅ AI assistant built-in
- ✅ File-based (not cell-based)
- ✅ Git integration
- ✅ Multi-file projects
- ✅ Sub-agent system

### vs Claude Code CLI
- ✅ Browser-based (no installation)
- ✅ Live code preview
- ✅ Visual circuit rendering
- ✅ Built for quantum computing
- ⚠️ Python only (CLI supports more languages)

### vs VSCode
- ✅ AI copilot in every interaction
- ✅ No setup required
- ✅ Quantum computing tools included
- ⚠️ Simpler editor (no extensions)
- ⚠️ Python-focused

---

## What's Next

### Coming Soon
- 📝 Monaco editor (better code editing)
- 🔀 Branch management
- 👥 Real-time collaboration
- 📓 Jupyter notebook support (.ipynb)
- 🎨 More visualization types

### Long-Term
- Multiple language support (Julia, R)
- Plugin/extension system
- Marketplace for agents
- Advanced debugging tools

---

## Getting Help

### Documentation
- **ARCHITECTURE.md** - Technical details for developers
- **IMPLEMENTATION-STATUS.md** - Current development status
- **UX-REDESIGN-CLAUDE-CODE.md** - Design specifications

### Common Questions

**Q: Where are my files stored?**
A: In GitHub repositories (one per volume). Your user volume is at `github.com/{username}/llmos-workspace`

**Q: Can I use my own GitHub repo?**
A: Yes! Configure your volume to point to any GitHub repo you own.

**Q: Is my code private?**
A: User volume repos can be private. Team/System volumes may be shared.

**Q: What Python packages are available?**
A: Most pure-Python packages work. Qiskit, NumPy, Matplotlib, SciPy are pre-installed.

**Q: Can I run this offline?**
A: Code execution works offline (after Pyodide loads), but AI chat requires internet.

---

## Built With

- **Next.js** - React framework
- **Pyodide** - Python in the browser
- **Qiskit** - Quantum computing
- **OpenRouter** - LLM API access
- **GitHub API** - Git operations
- **Monaco Editor** - Code editing (coming soon)

---

## License

See LICENSE file for details.

---

**Ready to build quantum circuits with AI?** Launch LLMos-Lite and start creating! 🚀
