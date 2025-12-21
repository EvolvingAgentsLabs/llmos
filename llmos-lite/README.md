# LLMos-Lite 🚀

**An AI Operating System That Actually Learns**

LLMos-Lite isn't just another AI coding assistant—it's a **self-evolving operating system** that learns from every interaction, builds institutional knowledge, and gets smarter over time. Optimized for WebAssembly-compatible scientific computing, data science, and 3D visualization, expanding to any domain you teach it.

---

## 🎯 What Makes LLMos Different?

### It Has Memory

Unlike traditional AI assistants that forget everything after each conversation:

- ✅ **Learns from every execution** - Successful patterns become system knowledge
- ✅ **Queries past experiences** - Consults memory before planning new tasks
- ✅ **Improves over time** - Each run makes the next one better
- ✅ **Never forgets** - Persistent memory across all sessions

```
First Time:  "Create FFT analysis" → Takes 5 mins, requires guidance
Third Time:  "Analyze audio spectrum" → 30 seconds, applies learned patterns
Tenth Time:  "Process signal data" → Instant, uses refined techniques
```

### It's File-First (The Claude Code Way)

Everything is **real files in persistent storage**, not chat artifacts:

- 📁 All outputs saved to organized project structures
- 🌳 Complete file tree showing every file and folder
- 💾 Virtual file system with localStorage persistence
- 🔄 Auto-refreshing tree (picks up new files in <2 seconds)

### It's Self-Improving

The system doesn't stay static—it **evolves**:

- 🧠 **Memory System**: Short-term execution logs + long-term learnings
- 📊 **Pattern Recognition**: Identifies what works, what doesn't
- 🔄 **Continuous Learning**: Every task updates system knowledge
- 📈 **Compound Intelligence**: Gets better with use

---

## 🏗️ The LLMunix Architecture

### Complete Implementation

✅ **SystemAgent** - Memory-aware master orchestrator
✅ **Virtual File System (VFS)** - Browser-based persistent storage
✅ **Memory Analysis Agent** - Queries past experiences
✅ **Memory Consolidation Agent** - Transforms traces into learnings
✅ **System Memory Log** - Repository of all execution experiences
✅ **Enhanced File Tree** - Shows complete hierarchies recursively
✅ **Read-Only System Volume** - Immutable system artifacts

### How It Works

```
1. Planning Phase
   └─ SystemAgent reads /system/memory_log.md
   └─ Searches for similar past tasks
   └─ Extracts successful patterns
   └─ Incorporates learnings into plan

2. Execution Phase
   └─ Creates organized project structure
   └─ Generates all required directories
   └─ Executes Python code in browser
   └─ Saves outputs to structured folders

3. Memory Recording
   └─ Writes execution log to memory/short_term/
   └─ Appends experience to system memory
   └─ Includes: goal, outcome, learnings

4. Future Executions
   └─ Next similar task consults memory
   └─ Reuses successful patterns
   └─ Avoids past mistakes
   └─ Improves automatically
```

---

## 📁 Project Structure

Every SystemAgent execution creates:

```
projects/[project_name]/
├── components/
│   └── agents/          # Agent definitions
├── output/
│   ├── code/           # Generated Python files
│   ├── data/           # Data files
│   └── visualizations/ # Matplotlib plots
└── memory/
    ├── short_term/     # Execution logs
    └── long_term/      # Consolidated learnings
```

**All visible in the file tree. All persistent. All organized.**

---

## 🎮 Quick Start

### 1. Installation

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos.git
cd llmos/llmos-lite
npm install
npm run dev
```

Open http://localhost:3000

### 2. Setup

1. Enter your OpenRouter API key
2. Select your use case (Signal Processing, Data Science, 3D Visualization, Robotics)
3. Start chatting - the system learns your field

### 3. Your First Task

```
You: "Create a sine wave signal, add noise, then apply FFT to show frequency spectrum"

SystemAgent:
📝 Creating project: signal_fft_analysis
📝 Generating Python code with scipy.fft
✅ Executing in browser...
📊 FFT peak detected at 50 Hz
📁 Saved to output/visualizations/
📝 Logged to memory/short_term/

Your project is ready in User > projects > signal_fft_analysis
```

**What just happened?**
- Created organized project structure (9 files)
- Generated Python code with WebAssembly-compatible libraries
- Executed in your browser (no server needed)
- Saved all outputs to persistent VFS
- Logged execution for future learning
- **System now knows how to do FFT analysis**

---

## 🧠 The Memory System

### System-Wide Learning

**Location:** `/system/memory_log.md` (visible in System volume)

Every execution creates a structured experience entry:

```yaml
---
experience_id: exp_001
project_name: signal_fft_analysis
primary_goal: Create sine wave and apply FFT
final_outcome: success
components_used: [SystemAgent, scipy, matplotlib]
files_created: 9
execution_time_ms: 12500
learnings_or_issues: |
  scipy.fft + matplotlib works reliably in browser.
  Organized output/ structure improves clarity.
  Creating .gitkeep files ensures directory persistence.
timestamp: 2025-12-21T18:30:45Z
---
```

### Memory-Informed Planning

Next time you run a similar task:

```
You: "Analyze audio frequency spectrum"

SystemAgent:
👁️ Reading /system/memory_log.md
📖 Found: exp_001 - FFT analysis with scipy.fft
✅ Applying learned pattern...
⚡ Completed in 3 seconds (vs 12 seconds first time)
```

The system **remembers** and **reuses** successful patterns.

---

## 🎨 What You Can Build

### WebAssembly-Compatible Domains

**Signal Processing & Audio Analysis**
- FFT spectrum analysis for audio signals
- Digital filter design (low-pass, high-pass, band-pass)
- Wavelet transforms and time-frequency analysis
- Noise reduction and signal enhancement
- Spectrograms and audio feature extraction

**Data Science & Machine Learning**
- Classification models (SVM, Random Forest, Decision Trees)
- Regression analysis and predictive modeling
- Clustering algorithms (K-means, DBSCAN, hierarchical)
- Principal Component Analysis (PCA) and dimensionality reduction
- Time series analysis and forecasting
- Interactive data visualizations with matplotlib

**Scientific Computing & Simulation**
- Numerical integration and differentiation
- Solving differential equations (ODEs, PDEs)
- Linear algebra operations and matrix decomposition
- Optimization problems (linear, nonlinear, constrained)
- Monte Carlo simulations
- Statistical distributions and hypothesis testing

**3D Visualization & Modeling**
- 3D surface plots and contour maps
- Parametric curves and surfaces
- Vector field visualization
- Molecular structure visualization
- Terrain modeling and topographic maps
- Interactive 3D scatter plots

**Robotics & Control Systems**
- Forward and inverse kinematics
- Trajectory planning and path optimization
- PID controller tuning and simulation
- Motion planning algorithms
- Sensor fusion and Kalman filtering
- Robot arm workspace analysis

**Network & Graph Analysis**
- Social network analysis
- Graph algorithms (shortest path, centrality, clustering)
- Network topology visualization
- Flow optimization problems
- Community detection

### Available Libraries (Browser-Compatible)

✅ **numpy** - Numerical computing
✅ **scipy** - Scientific computing
✅ **matplotlib** - Visualization
✅ **pandas** - Data analysis
✅ **scikit-learn** - Machine learning
✅ **networkx** - Graph analysis
✅ **sympy** - Symbolic mathematics

❌ **NOT Available**:  tensorflow, pytorch, qiskit_aer (use simulation alternatives)

---

## 💡 Key Features

### 1. Virtual File System (VFS)

**Browser-based persistent storage using localStorage:**

- 📂 Hierarchical directory structures
- 💾 Survives page refreshes
- 🔄 Auto-sync with file tree
- 📁 Organized by project

### 2. Enhanced File Tree

**Complete recursive directory display:**

- 🌳 Shows all folders and subfolders
- 📄 All files visible at every level
- 🔄 Auto-refresh every 2 seconds
- 📂 Proper sorting (dirs first, alphabetically)

### 3. System Volume (Read-Only)

**Immutable system artifacts:**

```
System/ (RO)
├── agents/
│   ├── SystemAgent.md                    # Master orchestrator
│   ├── MemoryAnalysisAgent.md            # Memory querying
│   └── MemoryConsolidationAgent.md       # Learning consolidation
└── memory_log.md                         # All execution experiences
```

### 4. Live Python Execution

**Run code in your browser:**

- ⚡ Instant execution with Pyodide
- 📊 Matplotlib plots captured as images
- 📝 Full stdout/stderr capture
- 🎯 30-second timeout protection

### 5. Memory Agents

**Specialized agents for learning:**

- **MemoryAnalysisAgent**: Query past experiences for insights
- **MemoryConsolidationAgent**: Transform traces into learnings
- **SystemAgent**: Memory-aware orchestration

---

## 🔧 How It's Built

### Architecture

```
┌─────────────────────────────────────┐
│    User Interaction (Chat/Canvas)   │
├─────────────────────────────────────┤
│    SystemAgent (LLMunix)            │  ← Memory-aware orchestrator
│    - Memory consultation            │
│    - Project creation                │
│    - Experience logging              │
├─────────────────────────────────────┤
│    Virtual File System              │  ← Browser localStorage
│    - Hierarchical storage            │
│    - Auto-refresh file tree          │
│    - Path normalization              │
├─────────────────────────────────────┤
│    Tools Layer                       │
│    - write-file (VFS)                │
│    - read-file (VFS + system)       │
│    - execute-python (Pyodide)       │
├─────────────────────────────────────┤
│    Runtime Environment              │
│    - Pyodide (Python in browser)    │
│    - Package auto-install            │
│    - Plot capture                    │
└─────────────────────────────────────┘
```

### Tech Stack

- **Next.js 14** - React framework
- **Pyodide v0.29.0** - Python runtime in browser
- **OpenRouter** - LLM API gateway (Claude 3.5 Sonnet)
- **localStorage** - Persistent VFS storage
- **Tailwind CSS** - Styling

---

## 📊 Example Workflow

### Signal Processing Task

```
You: "Create sine wave signal and apply FFT"

SystemAgent Execution:

1. 📖 Read /system/memory_log.md
   └─ No similar past tasks found

2. 📝 Create project structure
   ├─ projects/signal_fft_analysis/
   ├─ projects/signal_fft_analysis/components/agents/
   ├─ projects/signal_fft_analysis/output/code/
   ├─ projects/signal_fft_analysis/output/visualizations/
   └─ projects/signal_fft_analysis/memory/short_term/

3. 🐍 Generate Python code
   import numpy as np
   import matplotlib.pyplot as plt
   from scipy.fft import fft, fftfreq
   ...

4. ⚡ Execute in browser
   ✅ Execution successful (1.2s)
   📊 Generated plot: FFT spectrum

5. 💾 Save outputs
   ├─ output/code/signal_fft_analysis.py
   └─ output/README.md

6. 📝 Log execution
   ├─ memory/short_term/execution_log.md
   └─ /system/memory_log.md (append experience)

7. 📁 Files appear in tree
   └─ User > projects > signal_fft_analysis
       ├─ components/
       ├─ memory/
       └─ output/
```

**Next Time:** Similar task completes faster using learned patterns.

---

## 🎯 Test Pages

### SystemAgent Test Interface

**URL:** http://localhost:3000/test-system-agent

Test the LLMunix orchestrator with:
- Sample prompts (signal processing, 3D plots, robotics)
- View execution results
- Browse created files
- Inspect tool calls

### VFS Debug Page

**URL:** http://localhost:3000/debug-vfs

Inspect the Virtual File System:
- View all stored files
- Check file metadata
- Inspect localStorage contents
- Debug path normalization

---

## 📚 Documentation

- **LLMUNIX_COMPLETE.md** - Complete LLMunix implementation guide
- **LLMUNIX_INTEGRATION.md** - Integration details
- **ARCHITECTURE.md** - Technical architecture
- **IMPLEMENTATION-STATUS.md** - Development progress

---

## 🚀 What's Next

### Immediate Future

- **Memory Query UI** - Browse system memory visually
- **Pattern Visualization** - Charts showing learning patterns
- **Session Replay** - Replay past executions
- **Cross-Project Learning** - Share learnings between projects

### Long-Term Vision

**The Self-Improving OS:**
- System that adapts to any technical domain
- Agents that rewrite themselves based on success
- Skills that merge and evolve automatically
- Community knowledge marketplace

**The Research Accelerator:**
- Paper → Implementation in minutes
- Automated literature review
- Experiment design assistance
- Reproducibility by default

---

## 🤝 Contributing

LLMos-Lite is open source and actively developed. Contributions welcome!

### Areas for Contribution

- **Domain Packs**: Add support for new technical domains
- **Memory Algorithms**: Improve pattern recognition
- **Tool Development**: Create new system tools
- **UI Improvements**: Enhance file tree, canvas, chat

### Getting Started

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/llmos.git
cd llmos/llmos-lite

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

See **CONTRIBUTING.md** for guidelines.

---

## 📖 Philosophy

### File-First, Git-Native

Inspired by Claude Code:
- Files are the source of truth (not chat)
- Everything is persistent
- Operations are transparent
- Collaboration through sharing

### Self-Evolving Intelligence

Unlike static tools:
- Learns from every execution
- Builds institutional knowledge
- Improves continuously
- Never forgets successful patterns

### Domain-Ready, Not Domain-Specific

Built to adapt:
- Start with WebAssembly-compatible computing
- Teach it your domain through use
- System becomes fluent over time
- Knowledge compounds through doing

---

## 🔒 Security & Privacy

- **API Keys**: Stored in browser localStorage (consider external secrets management for production)
- **Code Execution**: Sandboxed in Pyodide (browser-based Python)
- **File Storage**: All in browser localStorage (no server storage)
- **Network Access**: Disabled from Python runtime

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- **Claude Code** - Inspiration for file-first architecture
- **LLMunix** - Original LLMunix pattern and memory system
- **Pyodide** - Python in the browser
- **OpenRouter** - LLM API access

---

## 💬 Community

- **GitHub Repository**: https://github.com/EvolvingAgentsLabs/llmos
- **Issues & Bug Reports**: https://github.com/EvolvingAgentsLabs/llmos/issues
- **Discussions**: https://github.com/EvolvingAgentsLabs/llmos/discussions
- **Documentation**: See `/llmos-lite/` folder in the repository

---

**Ready to build an AI that actually learns?** 🧠

**Ready for organized, persistent outputs?** 📁

**Ready for a system that gets smarter over time?** 📈

```bash
npm run dev
```

**Watch the system evolve.** 🚀
