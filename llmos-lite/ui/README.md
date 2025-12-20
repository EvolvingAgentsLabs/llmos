# LLMos-Lite UI

A VSCode-inspired interface for building and managing quantum computing workflows with AI assistance.

---

## What is LLMos-Lite?

LLMos-Lite is an interactive workspace that combines AI chat with code execution, artifact management, and quantum computing tools. Think of it as your personal quantum development environment with an AI copilot.

---

## Getting Started

### 1. Setup

1. **API Key Setup**: On first launch, you'll be prompted to enter your OpenRouter API key
2. **Choose Your Focus**: Select your primary use case:
   - **Quantum Computing**: VQE optimization, circuit design, quantum algorithms
   - **3D Visualization**: Molecular structures, animated scenes, data visualization

### 2. Your Workspace

The interface is organized into three main areas:

```
┌──────────────────────────────────────────────────────────┐
│                       [Header]                            │
├────────────┬──────────────────────┬──────────────────────┤
│            │                      │                       │
│  Explorer  │    Chat / Canvas     │   Context            │
│            │                      │                       │
│  - System  │  Switch between:     │  - Current Session   │
│  - Team    │  • Chat Interface    │  - Execution Traces  │
│  - User    │  • File Canvas       │  - Artifacts         │
│            │                      │                       │
└────────────┴──────────────────────┴──────────────────────┘
```

---

## Features

### 🗂️ Explorer Panel (Left)

**Volume-based Organization**

Your workspace is organized into three volumes, similar to disk drives:

- **System Volume** 🔒 (Read-only)
  - Pre-built quantum algorithms and tools
  - System agents and utilities
  - Reference implementations

- **Team Volume** 👥 (Shared)
  - Shared team workspace
  - Collaborative projects
  - Team-wide tools and agents

- **User Volume** 👤 (Personal)
  - Your personal workspace
  - Private projects and experiments
  - Custom agents and skills

**File Types**

- 🤖 **Agents**: AI assistants for specific tasks
- 🔧 **Tools**: Utility functions and helpers
- ⚡ **Skills**: Reusable computational patterns
- 🔄 **Workflows**: Multi-step automation
- 📄 **Code**: Python scripts, notebooks, circuits

---

### 💬 Chat Interface (Center)

**AI-Powered Conversations**

Chat with an AI assistant that can:
- Write and execute Python code (including quantum circuits)
- Create visualizations and plots
- Design quantum algorithms
- Generate agents, tools, and workflows
- Debug and optimize your code

**Session Management**

- **Temporal Sessions**: Work in progress, auto-saved locally
- **Saved Sessions**: Committed to your volume, versioned in Git
- Switch between sessions to work on different projects

**Python Code Execution**

Code runs directly in your browser using Pyodide:
```python
import numpy as np
import matplotlib.pyplot as plt

# Quantum computing support
from qiskit import QuantumCircuit
qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.draw('mpl')
```

Results appear inline with:
- Console output
- Matplotlib plots
- Execution traces
- Error messages

---

### 🎨 Canvas View (Center)

**File Preview & Editing**

When you select a file from the Explorer, the Canvas shows:

**Two View Modes:**

1. **Code View** 📝
   - Syntax-highlighted source code
   - Read and understand file contents
   - Copy code snippets

2. **Design View** 🎨
   - Visual representation of the file
   - See agent configurations as cards
   - View tool functions as diagrams
   - Quantum circuits as visual flows

**File Type Indicators**

Files are color-coded by type:
- 🟠 Orange: Agents
- 🟣 Purple: Tools
- 🟡 Yellow: Skills
- 🟢 Green: Runtimes

---

### 📊 Context Panel (Right)

**Session Information**

- Current session name and status
- Session type (User/Team)
- Temporal or Saved state

**Execution Traces**

See what's happening under the hood:
- LLM reasoning steps
- Code execution progress
- Tool invocations
- Error recovery

**Artifacts**

Generated code and resources:
- Quantum circuits
- Plots and visualizations
- Agent definitions
- Workflow specifications

---

## Common Workflows

### 1. Explore Quantum Circuits

```
1. Browse System volume → agents → quantum-researcher
2. Open in Canvas → View agent configuration
3. Switch to Chat → Ask: "Show me VQE examples"
4. AI generates circuit code
5. Code auto-executes → See circuit diagram
6. Save to User volume for later
```

### 2. Create a Custom Tool

```
1. Chat: "Create a tool to calculate Hamiltonian energy"
2. AI generates tool definition
3. Review in Canvas → Switch to Code view
4. Test in Chat: Use the new tool
5. Save to Team volume to share
```

### 3. Build a Workflow

```
1. Reference existing artifacts: "@quantum-optimizer"
2. Chat: "Build a workflow using this optimizer"
3. AI creates workflow referencing your tools
4. Preview workflow steps in Canvas
5. Execute workflow through chat
6. Commit to version control
```

---

## UI Highlights

### Compact VSCode-Style Design

- **Minimal Padding**: More space for your code
- **Small Badges**: Unobtrusive status indicators
- **Efficient Layout**: Information density without clutter
- **Clean Typography**: Easy-to-read monospace fonts

### Real-time Feedback

- **Loading Indicators**: See when AI is thinking
- **Execution Progress**: Watch code run step-by-step
- **Error Highlights**: Clear error messages with context
- **Success Badges**: Know when operations complete

### Keyboard-Friendly

- Quick file navigation in Explorer
- Tab between Chat and Canvas
- Searchable file tree
- Copy code with one click

---

## Next Steps

### Short-term Roadmap

1. **Enhanced Editor** ✏️
   - Inline code editing in Canvas
   - Save edited files back to volume
   - Diff view for changes

2. **Artifact Referencing** 🔗
   - `@mention` artifacts in chat
   - Auto-complete from volumes
   - Inline artifact previews

3. **GitHub Integration** 🐙
   - Commit sessions to GitHub
   - Pull team volume updates
   - Merge conflict resolution

4. **Advanced Visualization** 📈
   - Interactive 3D plots
   - Animated quantum state evolution
   - Circuit optimization visualizer

### Long-term Vision

- **Multi-user Collaboration**: Real-time shared sessions
- **Skill Evolution**: AI learns from your patterns
- **Custom Runtimes**: Beyond Python (Julia, R, C++)
- **Marketplace**: Share and discover community tools

---

## Tips & Tricks

### 💡 Pro Tips

1. **Use Sessions**: Keep different projects in separate sessions
2. **Save Often**: Convert temporal sessions to saved sessions
3. **Explore System Volume**: Lots of pre-built examples to learn from
4. **Reference Artifacts**: Build on existing work instead of starting from scratch
5. **Check Traces**: When something goes wrong, traces show exactly what happened

### 🎯 Best Practices

- **Descriptive Names**: Name sessions and files clearly
- **Add Comments**: Comment your code for future you
- **Tag Artifacts**: Use tags to organize your work
- **Share Useful Tools**: Move personal tools to Team volume when they're ready
- **Version Control**: Commit sessions regularly to preserve history

---

## Getting Help

### Documentation

- **ARCHITECTURE.md**: Technical implementation details for developers
- **API_KEY_SETUP.md**: Detailed API key configuration guide
- **UI-MOCKUP.md**: Design specifications and component documentation

### Common Issues

**Code Not Executing?**
- Check Console for Python errors
- Verify imports are available in Pyodide
- Some packages need installation: `import micropip; await micropip.install('package')`

**File Not Showing?**
- Refresh the Explorer panel
- Check you're in the correct volume
- Verify file was saved to the volume

**Session Lost?**
- Temporal sessions are in localStorage
- Save important sessions to persist them
- Saved sessions are in Git and recoverable

---

## What Makes LLMos Different?

### Traditional Jupyter Notebooks
- ❌ Code in cells, no AI assistance
- ❌ Manual file management
- ❌ No built-in version control

### LLMos-Lite
- ✅ AI copilot in every chat
- ✅ Organized volume system
- ✅ Built-in Git integration
- ✅ Visual + Code dual views
- ✅ Quantum computing ready
- ✅ Browser-based, no installation

---

## System Requirements

- **Browser**: Modern Chrome, Firefox, or Edge
- **Connection**: Internet for AI chat (code runs locally)
- **Storage**: ~100MB for Pyodide runtime (cached)

---

## License & Credits

Built with:
- [Next.js](https://nextjs.org) - React framework
- [Pyodide](https://pyodide.org) - Python in the browser
- [Qiskit](https://qiskit.org) - Quantum computing
- [OpenRouter](https://openrouter.ai) - LLM API access

---

**Ready to start?** Launch LLMos-Lite and create your first quantum circuit! 🚀
