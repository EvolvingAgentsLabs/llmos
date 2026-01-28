# LLMOS Action Items & Checklist

> Practical tasks extracted from the vision document

---

## Legend
- [ ] Not started
- [~] In progress
- [x] Completed

---

## Immediate Actions (This Week)

### Business & Networking
- [ ] **Call Paco Solsona** - Discuss sponsorship opportunity for LLMOS project
  - Topics to cover: Vision, demo, hardware costs, potential collaboration

### Hardware Procurement
- [ ] **Order ESP32-S3 DevKit**
  - Recommended: ESP32-S3-DevKitC-1 (with camera interface)
  - Estimated cost: ~$15

- [ ] **Order Camera Module**
  - Recommended: OV2640 (compatible with ESP32-S3)
  - Estimated cost: ~$10

- [ ] **Order Stepper Motors (2x)**
  - Recommended: NEMA 17 (17HS4401)
  - Estimated cost: ~$20

- [ ] **Order Motor Drivers (2x)**
  - Recommended: A4988 Stepper Motor Driver
  - Alternative: TMC2208 (quieter)
  - Estimated cost: ~$5

- [ ] **Order Additional Components**
  - [ ] Ultrasonic sensors HC-SR04 (3-4 units) - ~$8
  - [ ] IR line sensors (5 units) - ~$5
  - [ ] 12V battery pack - ~$25
  - [ ] Wheels and hardware - ~$10
  - [ ] Jumper wires, breadboard, connectors - ~$10

### Fabrication
- [ ] **3D Print Robot Chassis**
  - Review existing designs or create new
  - Ensure mounting points for motors, ESP32, sensors

---

## Short-term Tasks (Next 2 Weeks)

### Architecture Decoupling

- [ ] **Create Package Structure**
  - [ ] Create `/packages` directory
  - [ ] Set up monorepo tooling (pnpm workspaces or similar)

- [ ] **Extract @llmos/agent-core Package**
  - [ ] Move `ESP32AgentRuntime` to new package
  - [ ] Move `DeviceContext` interface
  - [ ] Move tool definitions
  - [ ] Move `WorldModel`
  - [ ] Move `RayNavigation`
  - [ ] Move sensor formatters
  - [ ] Ensure zero graphics dependencies
  - [ ] Write package tests

- [ ] **Extract @llmos/simulator Package**
  - [ ] Move `CubeRobotSimulator`
  - [ ] Create headless runner
  - [ ] Create scenario loader
  - [ ] Implement DeviceContext for simulator
  - [ ] Write package tests

- [ ] **Create @llmos/visualization Package** (optional)
  - [ ] Move Three.js components
  - [ ] Move debug overlays
  - [ ] Create standalone visualization app

- [ ] **Create @llmos/hardware-bridge Package**
  - [ ] Serial communication driver
  - [ ] WiFi/WebSocket bridge
  - [ ] Define firmware protocol
  - [ ] Implement DeviceContext for physical hardware

### Firmware Development

- [ ] **Set up ESP32 Development Environment**
  - [ ] Install ESP-IDF or Arduino framework
  - [ ] Configure for ESP32-S3
  - [ ] Test basic connectivity

- [ ] **Write Minimal Firmware**
  - [ ] WiFi connection to LLMOS host
  - [ ] HTTP/WebSocket client
  - [ ] Motor control functions
  - [ ] Sensor reading functions
  - [ ] Camera capture and streaming
  - [ ] LED control
  - [ ] Tool registration system

- [ ] **Define Communication Protocol**
  - [ ] Tool call format (JSON-RPC or similar)
  - [ ] Sensor data format
  - [ ] Camera frame format
  - [ ] Error handling

### Research

- [ ] **Gemini Flash Vision Research**
  - [ ] Set up Gemini API access
  - [ ] Test with sample robot camera frames
  - [ ] Benchmark latency vs current solution
  - [ ] Evaluate Gemini Live API for streaming
  - [ ] Document integration approach

---

## Medium-term Tasks (Next Month)

### Physical Robot Build

- [ ] **Assemble Hardware**
  - [ ] Mount motors to chassis
  - [ ] Wire motor drivers
  - [ ] Connect ESP32-S3
  - [ ] Mount camera
  - [ ] Install sensors
  - [ ] Set up power distribution

- [ ] **Test Hardware**
  - [ ] Motor control test
  - [ ] Sensor reading test
  - [ ] Camera capture test
  - [ ] WiFi range test
  - [ ] Battery life test

- [ ] **Integration Testing**
  - [ ] Run same agent in simulation
  - [ ] Run same agent on physical robot
  - [ ] Compare behavior
  - [ ] Document differences

### Experience Logging

- [ ] **Design Experience Schema**
  - [ ] Sensor reading format
  - [ ] Action/tool call format
  - [ ] Outcome tracking format
  - [ ] Episode boundaries

- [ ] **Implement Experience Logger**
  - [ ] Live instance data capture
  - [ ] Storage backend (IndexedDB, file system, cloud)
  - [ ] Export/import functionality

### Digital Twin Infrastructure

- [ ] **Headless Simulation Runner**
  - [ ] Command-line interface
  - [ ] Batch scenario execution
  - [ ] Metrics collection

- [ ] **Scenario Generator**
  - [ ] Replay with variations
  - [ ] Random environment generation
  - [ ] Edge case injection

---

## Long-term Tasks (Quarter)

### Digital Twin Dreaming System

- [ ] **Parallel Simulation Orchestrator**
  - [ ] Multi-process/worker architecture
  - [ ] Resource management
  - [ ] Result aggregation

- [ ] **Learning Aggregator**
  - [ ] Pattern extraction from twin results
  - [ ] Success/failure analysis
  - [ ] Strategy identification

- [ ] **Live Instance Updater**
  - [ ] Real-time prompt refinement
  - [ ] Navigation rule updates
  - [ ] Pre-computed decision caching

### Sub-Agent Support

- [ ] **Agent Composition Framework**
  - [ ] Define sub-agent interface
  - [ ] Implement delegation mechanism
  - [ ] Priority/interrupt handling

- [ ] **Standard Sub-Agents**
  - [ ] NavigationAgent
  - [ ] VisionAgent
  - [ ] SafetyAgent

### Multi-Robot Coordination

- [ ] **Fleet Management**
  - [ ] Device discovery
  - [ ] Task distribution
  - [ ] Collision avoidance

### Documentation & Release

- [ ] **Write Technical Documentation**
  - [ ] Architecture guide
  - [ ] API reference
  - [ ] Hardware build guide
  - [ ] Tutorial series

- [ ] **Open Source Preparation**
  - [ ] License selection
  - [ ] Contributing guidelines
  - [ ] Code of conduct
  - [ ] Issue templates

- [ ] **Launch Materials**
  - [ ] Demo videos
  - [ ] Blog post / article
  - [ ] Social media announcement

---

## Questions to Resolve

### Hardware Questions

1. **Motor Control Circuit?**
   - **Answer: Yes, required.** Use A4988 driver boards which include all necessary circuitry (logic level conversion, current limiting, protection diodes).

2. **WiFi vs Bluetooth for Communication?**
   - WiFi recommended for higher bandwidth (camera streaming)
   - Bluetooth could be backup for low-latency local control

3. **Battery Selection?**
   - 12V 2000mAh LiPo recommended
   - Or 3S 11.1V Li-ion pack
   - Step-down converter needed for 5V/3.3V logic

### Software Questions

1. **LLM Provider for Agent Loop?**
   - Options: OpenAI, Anthropic, Gemini, Local (Ollama)
   - Consider: latency, cost, vision capability

2. **Experience Storage Location?**
   - Browser: IndexedDB (limited size)
   - Local: File system (via Electron/Tauri)
   - Cloud: Firebase, Supabase, custom backend

3. **Multi-Twin Scaling?**
   - Web Workers for browser
   - Child processes for Node.js
   - Kubernetes for cloud scaling

---

## Hardware Shopping List (Ready to Order)

| Item | Quantity | Link Example | Price |
|------|----------|--------------|-------|
| ESP32-S3-DevKitC-1 | 1 | Amazon/AliExpress | $15 |
| OV2640 Camera Module | 1 | Amazon/AliExpress | $10 |
| NEMA 17 Stepper Motor | 2 | Amazon/AliExpress | $20 |
| A4988 Driver Board | 2 | Amazon/AliExpress | $5 |
| HC-SR04 Ultrasonic | 4 | Amazon/AliExpress | $8 |
| 5-way IR Line Sensor | 1 | Amazon/AliExpress | $5 |
| 12V 2000mAh LiPo | 1 | Amazon/AliExpress | $25 |
| LM2596 Step-Down | 2 | Amazon/AliExpress | $5 |
| Wheels (65mm) | 2 | Amazon/AliExpress | $5 |
| Caster Ball | 1 | Amazon/AliExpress | $2 |
| Jumper Wires | 1 set | Amazon/AliExpress | $5 |
| Breadboard | 1 | Amazon/AliExpress | $3 |
| **TOTAL** | | | **~$108** |

---

## Notes & Ideas

_Use this section for quick notes during development_

### 2026-01-28
- Initial planning document created
- Architecture analysis completed
- Good news: Physics simulator already decoupled from graphics
- Key insight: DeviceContext interface is the right abstraction point

---

*Last updated: 2026-01-28*
