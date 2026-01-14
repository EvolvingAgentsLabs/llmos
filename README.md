# LLMos-Lite 🚀

**The Evolutionary Operating System for Physical AI Agents**

LLMos-Lite is an experimental "Operating System in the Browser" that bridges the gap between generative AI and the physical world. It's a self-evolving AI operating system where agents, sub-agents, and hardware artifacts live, interact, and **evolve**—moving beyond simple chatbots to create a persistent environment for autonomous physical computing.

Built for scientific computing, robotics, and edge AI—all running entirely in your browser with zero backend required.

<video src="https://github.com/user-attachments/assets/f7a17e3f-42c8-47ae-a8f1-0f9f67490e07" width="600" controls></video>

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

## 📚 Documentation

- **README.md** (this file) - Overview and quick start
- **llmos-lite/ui/README.md** - UI development guide
- **llmos-lite/ui/ARCHITECTURE.md** - Technical architecture
- **llmos-lite/ui/docs/** - Detailed feature documentation

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
