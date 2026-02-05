# LLMos Roadmap

**Vision**: An operating system where AI agents control physical hardware through natural language.

Talk to AI. Robots listen. That simple.

---

## 🎯 Project Goals

### Core Mission
Make robotics accessible to everyone. No coding required, just describe what you want.

### What Makes LLMos Different
- **Natural Language First**: Describe your robot's behavior in plain English
- **Physical World Focus**: Not just chat - real motors, sensors, and robots
- **AI Agent Architecture**: Specialized agents that understand hardware
- **Plugin Ecosystem**: Community-driven extensibility
- **Hybrid Runtime**: **Run natively on Desktop or directly in the Browser via Web Serial**

---

## 🚀 Development Phases

### Phase 1: Foundation (Months 1-3) - Q1 2026
**Goal**: One amazing workflow that works perfectly

#### Milestone 1.1: Desktop Core (Weeks 1-2)
- [x] Electron + Next.js desktop application
- [x] Clean chat interface
- [x] File system integration
- [x] Streamlined for desktop-only (remove web compilation)

#### Milestone 1.2: ESP32 Pipeline (Weeks 3-4)
- [ ] USB serial connection and device detection (Electron)
- [ ] One-click firmware flashing
- [ ] Natural language → C code generation
- [ ] Test workflow: "avoid walls" → working robot

#### Milestone 1.3: Polish & Reliability (Weeks 5-6)
- [ ] Error handling and user feedback
- [ ] Connection troubleshooting wizard
- [ ] Auto-recovery from failures

#### Milestone 1.5: The Web Frontier (Zero-Install Robotics) (Weeks 6-7)
**Goal**: Control hardware directly from `llmos.vercel.app` without installing Electron.

**Strategy**: Use the Adapter Pattern to bridge browser APIs to physical hardware.

- [ ] **Hardware Abstraction Layer (HAL) Refactor**:
    - Abstract `SerialManager` into an interface.
    - Create `ElectronSerialAdapter` (using `node-serialport`).
    - Create `WebSerialAdapter` (using `navigator.serial`).
- [ ] **Browser Integration**:
    - Add "Connect to Robot" UI for manual permission request (User Gesture).
    - Implement capability checks (Chrome/Edge detection).
- [ ] **Web Flashing**:
    - Integrate `esptool-js` to allow firmware flashing directly from the browser.

**Success Criteria**: A user can go to the website, plug in a robot, click "Connect", and control it without downloading software.

---

### Phase 2: Adaptive Physical Intelligence - Q2 2026
**Goal**: The "iPhone Moment" for Robotics - Move from hard-coded robots to skill-based adaptive agents

*(... Previous Phase 2 content remains unchanged ...)*

---

### Phase 3: Plugin Architecture (Months 7-9) - Q3 2026
**Goal**: Extensible system where community can contribute

*(... Previous Phase 3 content remains unchanged ...)*

---

### Phase 4: Community & Growth (Months 10-12) - Q4 2026

*(... Previous Phase 4 content remains unchanged ...)*

---

## 🛠️ Technology Stack

### Application Runtime
- **Framework**: Next.js 14 (Hybrid)
- **Desktop**: Electron (for native USB/FS access)
- **Web**: Vercel (for zero-install access)
- **Language**: TypeScript
- **State**: Zustand

### Backend Services
- **LLM Integration**: Claude API, OpenAI compatible
- **Code Generation**: AI-powered C/C++ generation
- **Compilation**: Platform-native tools (Docker/WASM)

### Hardware Integration (Hybrid)
- **Desktop Strategy**: `node-serialport` (Automatic detection, background connection)
- **Web Strategy**: `Web Serial API` (User-initiated connection, Chrome/Edge/Opera only)
- **Flashing**: `esptool.js` (Web) / `esptool.py` (Desktop)
- **Protocols**: JSON over Serial

### Plugin System
- **Format**: JSON manifest + TypeScript/JavaScript
- **Registry**: Git-based plugin registry

---

## 🎬 The Vision

**Today**: Programming robots requires weeks of learning and installing heavy IDEs.

**Tomorrow with LLMos**:
