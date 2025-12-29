# LLMos-Lite 🚀

**An AI Operating System That Actually Learns**

LLMos-Lite is a self-evolving AI operating system that learns from every interaction, builds institutional knowledge, and gets smarter over time. Built for scientific computing, data science, and 3D visualization—all running in your browser.

https://github.com/EvolvingAgentsLabs/llmos/raw/main/assets/llmos.mp4

*JARVIS-powered Desktop experience with floating AI avatar, system applets, and intelligent task orchestration.*

---

## 🆕 What's New

### 🤖 JARVIS AI Avatar - Your Personal AI Assistant

Experience a truly intelligent OS with **JARVIS**, a persistent floating AI avatar inspired by Iron Man's assistant:

- **Always Present**: Floating orb avatar visible across all views, like Siri on macOS
- **State-Aware Animation**: Visual feedback showing idle, thinking, executing, success, and error states
- **Interactive Expansion**: Click to expand for detailed status, minimize to a subtle indicator
- **Contextual Awareness**: Shows current task type and agent state in real-time

### 🖥️ Desktop-First Experience

A complete **desktop operating system** running in your browser:

- **Desktop View**: macOS/Windows-style desktop with app icons and quick launch
- **System Applets**: Pre-built utilities ready to use - Calculator, Timer, Color Picker, Notes
- **Category Organization**: Applets organized into Utilities, Quantum, 3D & Visual, and Automation
- **Quick Create**: Launch any system applet with one click from the desktop

### 🎯 Infinite App Store - Generative UI

**The biggest update yet**: LLMos-Lite generates **live, interactive React applets** on demand!

```
You: "Build an interactive 3D surface plotter with sliders for x/y range and colormap selection"

SystemAgent:
🎨 Generating React applet...
✅ Compiling and validating...
🚀 Applet deployed to Desktop!
📁 Project files saved to projects/surface_plotter/
```

**Key Features:**
- **Instant UI Generation**: Ask for any tool and get a working React component
- **Self-Healing Compilation**: Code is validated before deployment; errors auto-fixed
- **Persistent Files**: Applets saved as `.tsx` files you can modify and reuse
- **Complete Projects**: Every applet comes with source code, agents, and execution traces

**Try These Prompts:**
- "Build an interactive quantum circuit designer with drag-and-drop gates"
- "Create a signal analyzer with FFT visualization and adjustable parameters"
- "Make a color palette generator with hex/rgb conversion"

### 🧰 Built-in System Applets

Ready-to-use tools that showcase the platform's capabilities:

| Category | Applets |
|----------|---------|
| **Utilities** | Calculator, Timer/Stopwatch, Color Picker, Quick Notes |
| **Quantum** | Quantum Circuit Designer with gate palette |
| **3D & Visual** | 3D Scene Builder with object manipulation |
| **Automation** | Visual Workflow Builder with node connections |

### Recent Updates

- **JARVIS Avatar** - Persistent floating AI assistant with animated state feedback
- **Desktop View** - Default view showing system applets and quick launchers
- **Applet Categories** - Organized system applets by domain (Utilities, Quantum, 3D, Automation)
- **Multi-Step Agent Planning** - Detailed planning progress with real-time status updates
- **Sub-Agent Orchestration** - Intelligent task delegation to specialized agents
- **Canvas Tab** - Dedicated visualization tab for plots, images, and outputs
- **Enhanced File Explorer** - Organized sections for System, Team, and User volumes
- **Media Viewer** - Full support for images and media file display
- **Session Management** - Compact dropdown for session switching

---

## 🎯 Main Goals

### 🧠 **Memory-Powered Intelligence**
Unlike traditional AI assistants that forget everything after each conversation, LLMos-Lite:
- **Learns from every execution** - Successful patterns become system knowledge
- **Queries past experiences** - Consults memory before planning new tasks
- **Improves over time** - Each run makes the next one better
- **Never forgets** - Persistent memory across all sessions

### 📁 **File-First Architecture**
Everything is **real files in persistent storage**, not chat artifacts:
- All outputs saved to organized project structures
- Complete file tree showing every file and folder
- Virtual file system with browser localStorage persistence
- Read-only system volume with immutable artifacts

### 🔄 **Self-Improving System**
The system doesn't stay static—it **evolves**:
- Memory system with short-term execution logs and long-term learnings
- Pattern recognition that identifies what works and what doesn't
- Continuous learning where every task updates system knowledge
- Compound intelligence that gets better with use

---

## 💻 What You Can Do Now

### 🖥️ Desktop Experience
- **JARVIS Avatar**: Your persistent AI companion with visual state feedback
- **System Applets**: Launch Calculator, Timer, Color Picker, Notes instantly
- **Quantum Tools**: Design quantum circuits with drag-and-drop gates
- **3D Scene Builder**: Create and animate 3D objects with CSS 3D transforms
- **Workflow Builder**: Visual automation designer with nodes and connections

### 🎨 Generative UI - Infinite App Store
- **Interactive Applets**: Ask for any tool and get a live React component
- **Parameter Explorers**: Sliders, dropdowns, inputs for real-time parameter adjustment
- **Calculators & Converters**: Unit converters, formula calculators, data transformers
- **Visualizers**: Interactive plots, 3D explorers, data dashboards
- **Form Builders**: NDA generators, configuration wizards, data entry forms
- **Simulators**: Physics simulations, quantum circuits, signal processors

### Scientific Computing & Data Science
- **Signal Processing**: FFT analysis, filtering, spectrograms, wavelet transforms
- **Machine Learning**: Classification, regression, clustering with scikit-learn
- **Data Analysis**: Statistical analysis, time series forecasting with pandas
- **3D Visualization**: Surface plots, parametric curves, vector fields with matplotlib
- **Numerical Computing**: Solve differential equations, optimization, Monte Carlo simulations

### Interactive Development
- **Live Python Execution**: Code runs instantly in your browser via Pyodide
- **Live React Applets**: Dynamic React components compiled and rendered in-browser
- **Real-time Previews**: See matplotlib plots and applet results as you code
- **Canvas Visualization**: Dedicated tab for viewing generated plots with Code/Design views
- **Applets Panel**: Interactive UI components with state, controls, and persistence
- **File Management**: Full file tree with VFS storage and organized project structures
- **Code Editor**: Split-view with syntax highlighting and auto-execution
- **Agent Dashboard**: Real-time progress tracking with planning steps and execution timeline

### Available Libraries
**Python (WebAssembly via Pyodide):**
✅ numpy • scipy • matplotlib • pandas • scikit-learn • networkx • sympy

**React Applets (Browser-native):**
✅ React hooks • Tailwind CSS • Math/JSON APIs • Browser APIs

---

## 🚀 Quick Start

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos.git
cd llmos/llmos-lite/ui
npm install
npm run dev
```

Open http://localhost:3000

**First Task Example:**
```
You: "Create a sine wave, add noise, then apply FFT to show the frequency spectrum"

SystemAgent:
📝 Creating project: signal_fft_analysis
📊 Generating Python code with scipy.fft
✅ Executing in browser...
📊 FFT peak detected at 50 Hz
📁 Saved to projects/signal_fft_analysis/output/
📝 Logged to memory for future learning

Your project is ready in the file tree!
```

---

## 🔮 What's Coming Next

### Near Future (Work in Progress)
- **Applet Library**: Save and reuse generated applets across sessions
- **Applet Sharing**: Export applets as standalone HTML files
- **Enhanced Memory System**: Visual memory browser and pattern visualization
- **Agent Evolution**: Agents that rewrite themselves based on success metrics
- **Three.js Runtime**: Interactive 3D graphics and animations in applets
- **Cross-Project Learning**: Share learnings between different projects
- **Session Replay**: Replay and analyze past executions

### Long-Term Vision
- **Self-Improving OS**: System that adapts to any technical domain you teach it
- **Research Accelerator**: Transform papers into implementations in minutes
- **Applet Marketplace**: Community-shared interactive tools and components
- **Community Knowledge**: Marketplace for sharing skills and agents
- **Multi-Language Support**: Extend beyond Python to JavaScript, R, Julia
- **Real-time Collaboration**: Multi-user sessions with shared memory

---

## 🏗️ Architecture Highlights

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLMos Desktop                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌────────────────────────────────────────┐  │
│  │   JARVIS     │  │           Desktop View                 │  │
│  │   Avatar     │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │  │
│  │  ┌───────┐   │  │  │Calc │ │Timer│ │Color│ │Notes│      │  │
│  │  │  ◉◉◉  │   │  │  └─────┘ └─────┘ └─────┘ └─────┘      │  │
│  │  │ ╱   ╲ │   │  │  ┌─────┐ ┌─────┐ ┌─────┐              │  │
│  │  └───────┘   │  │  │Quant│ │ 3D  │ │Work │              │  │
│  │  Thinking... │  │  │ um  │ │Scene│ │flow │              │  │
│  └──────────────┘  │  └─────┘ └─────┘ └─────┘              │  │
│                    └────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                        SystemAgent                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Memory System│  │  VFS Storage │  │ Applet Store │          │
│  │ Short + Long │  │ localStorage │  │ Active/Recent│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Python Runtime│  │Applet Runtime│  │  View Manager│          │
│  │   Pyodide    │  │ Babel + React│  │Desktop/Canvas│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Core Components:**
- **JARVIS Avatar** - Floating AI assistant showing agent state (idle/thinking/executing/success/error)
- **Desktop View** - macOS-style app grid with system applets and user-generated applets
- **Applet Store** - Manages active, recent, and system applets with state persistence
- **View Manager** - Handles Desktop, Canvas, Chat, and Media view modes

**Every execution creates:**
```
projects/[name]/
├── applets/              # React applet source files (.tsx)
├── components/
│   └── agents/           # Sub-agent definitions (.md)
├── tools/                # Custom tool definitions
├── skills/               # Skill nodes
├── output/
│   ├── code/             # Generated Python files
│   └── visualizations/   # Matplotlib plots
└── memory/
    ├── short_term/       # Execution traces
    └── long_term/        # Consolidated learnings
```

---

## 📚 Documentation

- **README.md** (this file) - Overview and quick start
- **llmos-lite/README.md** - Detailed feature documentation
- **llmos-lite/ARCHITECTURE.md** - Technical architecture
- **llmos-lite/LLMUNIX_COMPLETE.md** - Complete implementation guide

---

## 🤝 Contributing

LLMos-Lite is open source and actively developed. Contributions welcome!

**Areas for Contribution:**
- Domain packs for new fields (robotics, bioinformatics, finance)
- Memory algorithms and pattern recognition improvements
- New system tools and runtime capabilities
- UI/UX enhancements

See **llmos-lite/CONTRIBUTING.md** for guidelines.

---

## 📖 Philosophy

**Infinite App Store**
Don't download apps—describe what you need and the OS builds it. Every tool is generated on demand, compiled in real-time, and persisted for reuse.

**Text-In, Reality-Out**
Your words compile to code, UI, and visualizations. Input is natural language; output is working software.

**File-First, Browser-Native**
Inspired by Claude Code—files are the source of truth, everything is persistent, operations are transparent.

**Self-Evolving Intelligence**
Unlike static tools, learns from every execution and builds institutional knowledge.

**Domain-Ready, Not Domain-Specific**
Start with scientific computing, teach it your domain through use, watch it become fluent over time.

---

## 💬 Community

- **GitHub**: https://github.com/EvolvingAgentsLabs/llmos
- **Issues**: https://github.com/EvolvingAgentsLabs/llmos/issues
- **Discussions**: https://github.com/EvolvingAgentsLabs/llmos/discussions

---

## 📝 License

Apache 2.0 License - See LICENSE file for details

---

**Ready to build an AI that actually learns?** 🧠
**Ready for organized, persistent outputs?** 📁
**Ready for a system that gets smarter over time?** 📈

```bash
cd llmos-lite/ui
npm run dev
```

**Watch the system evolve.** 🚀
