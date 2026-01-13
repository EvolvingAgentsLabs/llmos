# LLMos-Lite 🚀

**The Evolutionary Operating System for Physical AI Agents**

LLMos-Lite is an experimental "Operating System in the Browser" that bridges the gap between generative AI and the physical world. It's a self-evolving AI operating system where agents, sub-agents, and hardware artifacts live, interact, and **evolve**—moving beyond simple chatbots to create a persistent environment for autonomous physical computing.

Built for scientific computing, robotics, and edge AI—all running entirely in your browser with zero backend required.

<video src="https://github.com/user-attachments/assets/e7574fa5-a8be-4386-994a-232bd3224cb7" width="600" controls></video>

*JARVIS-powered Desktop experience with floating AI avatar, system applets, and intelligent task orchestration.*

---

## 🤖 Autonomous Robotics: From Chat to Firmware

LLMos-Lite treats **physical hardware as a first-class citizen**. Using the **Robot4 API**—think "Gameboy for Robots"—even lightweight LLMs can architect, code, compile, and deploy firmware for autonomous robots.

### The Wall-Avoiding Robot Demo

In a recent test, a free LLM (`mimo-v2-flash`) autonomously created a wall-avoiding robot:

```
You: "Program a wall-avoiding robot using the Robot4 API"

SystemAgent:
📝 Planning: Selected full implementation (confidence 85%)
🤖 Creating wallAvoider.c using robot4.h API
⚙️ Compiling in browser via WASM-Clang...
❌ Compilation error detected
🔧 Auto-fixing: Generated wallAvoider_fixed.c
✅ Compilation successful
🎮 Spawning Virtual Cube Robot in Obstacle Arena
🚀 Running at 60Hz - robot navigating autonomously!
```

### The Robot4 API

A clean, well-documented C API that abstracts complex hardware into simple functions:

```c
void update() {
    int front = distance(0);  // Read front sensor

    if (front < 60) {
        stop();
        led(255, 0, 0);  // Red LED - obstacle detected

        // Simple decision logic
        if (distance(6) > distance(1)) {
            drive(-80, 80);  // Turn Left
        } else {
            drive(80, -80);  // Turn Right
        }
    } else {
        drive(120, 120);     // Clear path - go forward
        led(0, 255, 0);      // Green LED
    }
}
```

### The Evolution Loop

This isn't just code generation—it's **evolution in the micro-scale**:

1. **Write** → Agent generates firmware
2. **Test** → Simulation runs in browser
3. **Fail** → Compilation or behavior errors detected
4. **Mutate** → Agent analyzes errors and fixes code
5. **Succeed** → Deploy to virtual or physical device

The same WASM binary running in the browser can be deployed to physical **ESP32-S3** devices running the WASMachine firmware.

---

## 🎯 Main Goals

### 🧬 **Evolutionary Intelligence**
Unlike traditional AI that generates static outputs, LLMos-Lite creates **living artifacts**:
- **Agents persist and evolve** - Not just prompts, but stored entities with memory and tools
- **Write → Test → Fail → Mutate → Succeed** - Evolutionary loops at micro-scale
- **Pattern recognition** - System identifies what works and breeds successful variations
- **Compound intelligence** - Each generation makes the next one smarter

### 🤖 **Physical AI First-Class**
Hardware isn't an afterthought—it's a core primitive:
- **Browser-to-hardware pipeline** - Compile C, simulate, deploy to ESP32
- **Closed feedback loops** - Telemetry flows back to drive firmware evolution
- **Robot4 abstraction** - Clean APIs that lightweight LLMs can master
- **Zero-backend deployment** - Everything happens in your browser

### 📁 **File-First Architecture**
Everything is **real files in persistent storage**, not chat artifacts:
- All outputs saved to organized project structures
- Complete file tree showing every file and folder
- Virtual file system with browser localStorage persistence
- Read-only system volume with immutable artifacts

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

### ESP32 Hardware Integration
- **Browser-Based WASM Compilation**: Compile C code to WebAssembly entirely in browser using Wasmer SDK
- **Zero Backend Required**: Clang/LLVM runs client-side, no Docker or server needed
- **Web Serial API**: Direct browser-to-ESP32 communication for deployment
- **ESP32 WASMachine Support**: Deploy compiled apps to ESP32 devices running WebAssembly runtime
- **Virtual Device Testing**: Test without hardware using virtual ESP32 simulator
- **Privacy-First**: Code never leaves your browser during compilation

### Available Libraries
**Python (WebAssembly via Pyodide):**
✅ numpy • scipy • matplotlib • pandas • scikit-learn • networkx • sympy

**React Applets (Browser-native):**
✅ React hooks • Tailwind CSS • Math/JSON APIs • Browser APIs

**C/C++ to WebAssembly (Browser-compiled):**
✅ Clang/LLVM in browser • ESP32 SDK headers • WASI runtime • Zero backend needed

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

### Evolutionary Agents (Work in Progress)

**Mutation Engine**
If a physical task fails (e.g., a robot arm drops an object), the Mutation Engine forks the agent's logic, generates multiple variations, simulates them all, and deploys the fittest version back to hardware. Evolution at scale.

**Persistent Sub-Agent Hierarchies**
The OS will host specialized agent hierarchies. A "Gardener Agent" overseeing moisture sensors and water valves creates sub-agents for each device, monitoring health and rewriting sleep cycles to optimize battery life based on real-world usage patterns.

**Swarm Intelligence**
Define a high-level swarm goal (e.g., "Map this room"), and the OS generates distinct firmware for multiple robots that communicate via a simulated mesh network. Emergent behavior from simple agents.

**Complete Physical AI Agents Support**
Full end-to-end pipeline for physical AI agents: natural language → agent creation → firmware generation → simulation → hardware deployment → telemetry monitoring → autonomous evolution. The browser becomes the complete IDE for embodied AI.

### Near Future
- **Hardware Feedback Loop**: Deploy → Monitor telemetry → Evolve firmware → OTA update
- **Applet Library**: Save and reuse generated applets across sessions
- **Three.js Runtime**: Interactive 3D graphics and animations in applets
- **Cross-Project Learning**: Share learnings between different projects
- **Session Replay**: Replay and analyze past executions

### Long-Term Vision
- **Self-Breeding Firmware**: Thousands of simulation cycles in WASM, mutating robot `update()` loops to optimize for speed or battery life
- **Team Volumes**: Multiple users collaborate on the same physical device—one agent optimizes motor drivers while another optimizes vision
- **Research Accelerator**: Transform papers into physical implementations
- **Edge AI Marketplace**: Community-shared agents, skills, and robot behaviors

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
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ WASM Compiler│  │ Serial/Device│  │ ESP32 Runtime│          │
│  │Browser Clang │  │  Web Serial  │  │ WASMachine   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Core Components:**
- **JARVIS Avatar** - Floating AI assistant showing agent state (idle/thinking/executing/success/error)
- **Desktop View** - macOS-style app grid with system applets and user-generated applets
- **Applet Store** - Manages active, recent, and system applets with state persistence
- **View Manager** - Handles Desktop, Canvas, Chat, and Media view modes
- **WASM Compiler** - Browser-based C to WebAssembly compilation using Wasmer SDK and Clang
- **ESP32 Runtime** - Deploy compiled WASM apps to ESP32 devices via Web Serial API

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
- **llmos-lite/docs/BROWSER_COMPILATION.md** - Browser-based WASM compilation guide
- **ESP32_COMPLETE_TUTORIAL.md** - ESP32 hardware integration tutorial

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

**An OS That "Grows"**
Most AI tools have amnesia—they forget what they built yesterday. LLMos-Lite is a **living repository of Artifacts**. Agents aren't just prompts; they're stored entities with memory, tools, and specific jobs that persist and evolve.

**Darwinian Software Development**
We're moving beyond "write once" to **breed software**. The Mutation Engine generates variations, simulates them, and deploys the fittest version. Code isn't written—it's grown through evolutionary pressure.

**Physical World First-Class Citizen**
The browser isn't just a UI—it's a full development environment for the physical world. Compile C to WASM, deploy to ESP32 hardware, and close the feedback loop with real-world telemetry.

**Infinite App Store**
Don't download apps—describe what you need and the OS builds it. Every tool is generated on demand, compiled in real-time, and persisted for reuse.

**Text-In, Reality-Out**
Your words compile to code, UI, firmware, and physical robot behavior. Input is natural language; output is working software running in the real world.

**File-First, Browser-Native**
Inspired by Claude Code—files are the source of truth, everything is persistent, operations are transparent.

**Zero Backend, Maximum Privacy**
Everything runs client-side—Python via Pyodide, React applets via Babel, C via Clang in WebAssembly. Your code never leaves your browser.

---

## 💬 Community

- **GitHub**: https://github.com/EvolvingAgentsLabs/llmos
- **Issues**: https://github.com/EvolvingAgentsLabs/llmos/issues
- **Discussions**: https://github.com/EvolvingAgentsLabs/llmos/discussions

---

## 📝 License

Apache 2.0 License - See LICENSE file for details

---

**Ready to build AI that evolves?** 🧬
**Ready to program robots from natural language?** 🤖
**Ready for software that breeds itself?** 🔄

```bash
cd llmos-lite/ui
npm run dev
```

**Watch the future compile.** 🚀

---

*This project explores the convergence of AI, hardware, and evolutionary computing. The browser is more than a UI—it's the perfect sandbox for the next generation of physical AI agents.*
