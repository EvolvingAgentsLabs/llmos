# LLMos: The Operating System for Physical AI Agents

<div align="center">

![LLMos Desktop](https://img.shields.io/badge/Platform-Electron%20%7C%20Web-blue)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20Python%20%7C%20WASM-yellow)
![Hardware](https://img.shields.io/badge/Hardware-ESP32%20S3-green)

**A hybrid runtime environment where AI agents are first-class citizens that can perceive, reason, act on hardware, and evolve over time.**

</div>

---

## 📖 What is LLMos?

LLMos is an "Operating System" designed for the era of physical AI. Unlike traditional robotics frameworks (ROS) or simple LLM chatbots, LLMos treats **Agentic Behaviors** as installable software.

It allows you to program robots using natural language, compiles those intentions into executable "Skills," and provides a runtime that handles safety, hardware abstraction, and continuous self-improvement.

### Key Capabilities

*   **Natural Language Programming:** Type "Create a robot that avoids walls" and the system generates the code, HAL bindings, and logic.
*   **Markdown-as-Code:** Agents, Skills, and Tools are defined in human-readable Markdown files that serve as both documentation and executable logic.
*   **Hybrid Runtime:** Runs entirely in the browser (via WebAssembly/Pyodide), on Desktop (Electron), or deploys to physical hardware (ESP32).
*   **The Knowledge Cascade:** A localized evolution system where agent learnings flow from **Individual → Team → System**, crystallizing successful patterns into reusable tools automatically.
*   **Cognitive World Model:** A persistent spatial-temporal graph that allows robots to track object permanence and detect changes over time, rather than just reacting to frame-by-frame snapshots.

---

## 🛠️ Tech Stack

*   **Frontend/Desktop:** Next.js 14, Electron, Tailwind CSS, React Flow.
*   **Simulation:** Three.js, React-Three-Fiber.
*   **Runtime Logic:** TypeScript, Python (via Pyodide), WebAssembly (@wasmer/sdk).
*   **Storage:** Browser-native Virtual File System (VFS) with LightningFS.
*   **Hardware:** ESP32-S3 (C++ Firmware, WASM runtime).

---

## 🚀 Getting Started

### Prerequisites
*   Node.js 18+
*   Python 3.10+ (for backend services/compilation)
*   Git

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/EvolvingAgentsLabs/llmos
    cd llmos
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run in Development Mode:**

    *   **Web Mode (Simulator Only):**
        ```bash
        npm run dev
        ```
    *   **Desktop Mode (Electron + Hardware Access):**
        ```bash
        npm run electron:dev
        ```

4.  **Setup Keys:**
    Upon launch, the setup wizard will ask for your LLM API Key (Gemini or OpenAI). This key is stored locally in your browser/desktop storage and is never sent to our servers.

---

## 🧠 Core Architecture

LLMos is built on four pillars that distinguish it from standard agent frameworks.

### 1. The Volume System (`/volumes`)
The file system is the database. Data is organized into hierarchical volumes:
*   **System Volume:** Read-only core agents (e.g., `HardwareControlAgent`), Standard Library tools, and certified Skills.
*   **Team Volume:** Shared skills and knowledge patterns discovered by the "Dreaming Engine."
*   **User Volume:** Your local projects, custom agents, and interaction traces.

### 2. HAL (Hardware Abstraction Layer) (`/lib/hal`)
The HAL allows the exact same Agent code to run in the 3D Simulator and on physical robots.
*   **Tools:** Defined in Markdown (e.g., `hal_drive.md`, `hal_vision_scan.md`).
*   **Validation:** A `CommandValidator` intercepts LLM instructions to ensure physical safety (e.g., preventing high-speed movement near obstacles) before they reach the motors.

### 3. The Applet System (`/components/applets`)
LLMos includes a dynamic UI system called "Applets." These are micro-applications (Calculators, Kanban boards, Robot tele-op interfaces) that Agents can generate on the fly to help users complete tasks.
*   **Runtime:** Dynamic React component compilation.
*   **UI:** Launchpad-style grid or windowed interface.

### 4. Dreaming & Evolution (`/lib/evolution`)
Robots improve while idle. The "Dreaming Engine" analyzes `BlackBox` recordings of failed interactions:
1.  **Replay:** Simulates the failure scenario in Three.js.
2.  **Mutate:** The LLM generates variations of the code to fix the issue.
3.  **Evaluate:** Successful mutations are patched into the Skill Markdown file.

---

## 📂 Project Structure

```
llmos/
├── app/                  # Next.js App Router (UI Pages & API Routes)
├── components/           # React Components
│   ├── applets/          # Dynamic Applet UI System
│   ├── canvas/           # Three.js Visualization & Sim
│   ├── chat/             # Agent Chat Interface
│   ├── robot/            # Robot Control Panels
│   └── visualization/    # Decision Trees & Flow Graphs
├── electron/             # Electron Main Process & Native Bridges
├── firmware/             # ESP32 C++ Code & WASM Runtimes
├── lib/                  # Core Logic
│   ├── agents/           # Agent Orchestrators & Compilers
│   ├── evolution/        # Dreaming Engine & Self-Correction
│   ├── hal/              # Hardware Abstraction Layer
│   ├── kernel/           # OS Boot Logic & Process Mgmt
│   ├── runtime/          # Cognitive World Model & Python Runtime
│   └── virtual-fs.ts     # In-browser File System
├── volumes/              # The "Brain" (Markdown Knowledge Base)
│   ├── system/           # Built-in Agents & Skills
│   └── user/             # User Data (Local)
└── __tests__/            # Integration Tests (inc. Knowledge Cascade)
```

---

## 🤖 Hardware Setup (Optional)

To use LLMos with real hardware, you need an **ESP32-S3**.

**Basic Wiring:**
*   **Motors:** GPIO 12/13/14/15 -> Motor Driver
*   **Sensors:** GPIO 16/17 -> HC-SR04 (Ultrasonic)
*   **Connection:** Connect via USB. The Electron app will auto-detect the serial port.

*See `docs/hardware/STANDARD_ROBOT_V1.md` for full schematics.*

---

## 🤝 Contributing

We are in **Phase 1 (Foundation)**. The codebase is active and evolving.

1.  Check `ROADMAP.md` for current priorities.
2.  Look for "Good First Issues" related to UI polish or new HAL tool definitions.
3.  Ensure all new logic includes tests in `__tests__/`.

---

## 📄 License

Apache 2.0 - Open Source. Built by **Evolving Agents Labs**.
