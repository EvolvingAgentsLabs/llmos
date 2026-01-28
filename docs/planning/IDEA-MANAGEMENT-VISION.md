# LLMOS Vision: AI Robot Agent Architecture & Evolution

> *"The new way to program is to organize ideas, drafts and sequences of prompts. An organized idea storm, with intervals of creativity and intervals of order."*

---

## Table of Contents

1. [Vision Statement](#vision-statement)
2. [Architecture Overview](#architecture-overview)
3. [Core Concepts](#core-concepts)
4. [Implementation Phases](#implementation-phases)
5. [Hardware Requirements](#hardware-requirements)
6. [Integration Opportunities](#integration-opportunities)
7. [Action Items](#action-items)
8. [Article Draft: AI Physical Agents](#article-draft-ai-physical-agents)

---

## Vision Statement

LLMOS represents a paradigm shift in robotics: **the inversion of control from firmware to cloud-based intelligence**. Instead of programming robots with fixed firmware, we provide hardware that connects tools and actuators to a Large Language Model that can reason, learn, and evolve.

The key insight is that the same AI agent software can operate in:
- **3D Simulated World** (digital twins dreaming and learning)
- **3D Real World** (physical robots acting and experiencing)

Both share the same agent logic, tools, and 3D navigation infrastructure. The only difference is the implementation of the hardware abstraction layer.

---

## Architecture Overview

### Current State (Already Implemented)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LLMOS BROWSER APPLICATION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │   React UI       │    │   3D Renderer    │    │   LLM Integration    │  │
│  │   Components     │    │   (Three.js)     │    │   (OpenAI API)       │  │
│  └────────┬─────────┘    └────────┬─────────┘    └──────────┬───────────┘  │
│           │                       │                          │              │
│           └───────────────────────┼──────────────────────────┘              │
│                                   │                                          │
│  ┌────────────────────────────────┴────────────────────────────────────────┐│
│  │                    ESP32 Agent Runtime                                   ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐││
│  │  │ Agent Loop  │  │   Tools     │  │ Navigation  │  │   World Model   │││
│  │  │ (500ms)     │  │ (Actions)   │  │ (Ray Cast)  │  │ (Cognitive Map) │││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘││
│  └────────────────────────────────┬────────────────────────────────────────┘│
│                                   │                                          │
│                    ┌──────────────┴──────────────┐                          │
│                    │     DeviceContext           │                          │
│                    │     (Abstract Interface)    │                          │
│                    └──────────────┬──────────────┘                          │
│                                   │                                          │
│           ┌───────────────────────┼───────────────────────┐                 │
│           │                       │                       │                 │
│  ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐        │
│  │ CubeRobotSim    │    │  Virtual ESP32   │    │ Physical ESP32  │        │
│  │ (Physics Only)  │    │  (WASM VM)       │    │ (Serial/WiFi)   │        │
│  │ 100Hz updates   │    │                  │    │                  │        │
│  └─────────────────┘    └──────────────────┘    └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Target Architecture: Live Instance + Digital Twins

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LLMOS CLOUD INFRASTRUCTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SHARED AGENT CORE (Markdown-Defined)              │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │ Agent System │ │    Tools     │ │  Navigation  │ │ World Model │ │    │
│  │  │   Prompt     │ │  (Abstract)  │ │   (3D Nav)   │ │ (Cognitive) │ │    │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  │           ▲              ▲               ▲                ▲          │    │
│  │           │              │               │                │          │    │
│  │           └──────────────┴───────────────┴────────────────┘          │    │
│  │                                   │                                   │    │
│  │                    ┌──────────────┴──────────────┐                   │    │
│  │                    │  Universal Hardware Interface│                   │    │
│  │                    │  (DeviceContext Protocol)   │                   │    │
│  │                    └──────────────┬──────────────┘                   │    │
│  └───────────────────────────────────┼──────────────────────────────────┘    │
│                                      │                                        │
│         ┌────────────────────────────┼────────────────────────────┐          │
│         │                            │                            │          │
│    ┌────▼────┐                  ┌────▼────┐                  ┌────▼────┐    │
│    │ LIVE    │                  │ TWIN 1  │                  │ TWIN N  │    │
│    │INSTANCE │                  │(Dreaming)│                  │(Dreaming)│    │
│    └────┬────┘                  └────┬────┘                  └────┬────┘    │
│         │                            │                            │          │
└─────────┼────────────────────────────┼────────────────────────────┼──────────┘
          │                            │                            │
          │                            │                            │
    ┌─────▼─────┐               ┌──────▼──────┐              ┌──────▼──────┐
    │  PHYSICAL │               │  SIMULATED  │              │  SIMULATED  │
    │   WORLD   │               │    WORLD    │              │    WORLD    │
    │           │               │  (Variant 1)│              │  (Variant N)│
    │ ┌───────┐ │               │ ┌─────────┐ │              │ ┌─────────┐ │
    │ │ESP32  │ │               │ │Physics  │ │              │ │Physics  │ │
    │ │+Camera│ │               │ │Engine   │ │              │ │Engine   │ │
    │ │+Motors│ │               │ │+Renderer│ │              │ │(Headless)│ │
    │ └───────┘ │               │ └─────────┘ │              │ └─────────┘ │
    │           │               │             │              │             │
    │  SENSORS  │               │  SIMULATED  │              │  SIMULATED  │
    │  ACTUATORS│               │  SENSORS    │              │  SENSORS    │
    └───────────┘               └─────────────┘              └─────────────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │   EXPERIENCE SYNCHRONIZATION │
                        │   & LEARNING AGGREGATION     │
                        └─────────────────────────────┘
```

---

## Core Concepts

### 1. Inversion of Control: From Firmware to LLM

**Traditional Robotics:**
```
┌───────────────────┐
│   MICROCONTROLLER │
│  ┌─────────────┐  │
│  │  Firmware   │  │  ← Fixed logic, hard to update
│  │  (C/C++)    │  │  ← Limited reasoning capability
│  └─────────────┘  │
│         │         │
│  ┌──────▼──────┐  │
│  │  Sensors    │  │
│  │  Actuators  │  │
│  └─────────────┘  │
└───────────────────┘
```

**LLMOS Inversion:**
```
┌───────────────────────────────────────────────────────┐
│                    CLOUD / EDGE                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │              LLM (Claude, GPT, Gemini)           │ │
│  │  - Natural language reasoning                    │ │
│  │  - Dynamic tool use                              │ │
│  │  - Learning from experience                      │ │
│  │  - Markdown-defined behavior (evolvable)         │ │
│  └──────────────────────┬───────────────────────────┘ │
└─────────────────────────┼─────────────────────────────┘
                          │ HTTP/WebSocket
┌─────────────────────────▼─────────────────────────────┐
│                    MICROCONTROLLER                     │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Minimal Firmware (Tool Provider)        │ │
│  │  - Exposes sensors as readable endpoints         │ │
│  │  - Exposes actuators as callable tools           │ │
│  │  - Handles timing-critical operations            │ │
│  │  - NO decision logic - just execution            │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │  Camera   │  │  Motors   │  │ Distance Sensors  │ │
│  └───────────┘  └───────────┘  └───────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 2. Shared Infrastructure: Simulation & Reality

Both simulated and physical robots share:

| Component | Simulated | Physical |
|-----------|-----------|----------|
| **Agent Logic** | Same ESP32AgentRuntime | Same ESP32AgentRuntime |
| **Tools** | DeviceContext → Simulator | DeviceContext → Hardware |
| **3D Navigation** | Ray casting on physics world | Ray casting on sensor data |
| **World Model** | Occupancy grid from sim sensors | Occupancy grid from real sensors |
| **LLM Reasoning** | Same prompts & context | Same prompts & context |

**Only difference:** The DeviceContext implementation

### 3. Live Instance + Digital Twins

```
                    ┌─────────────────────────┐
                    │     EXPERIENCE POOL     │
                    │  (Shared Memory Bank)   │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  ┌──────────┐           ┌──────────┐           ┌──────────┐
  │  LIVE    │           │  TWIN A  │           │  TWIN B  │
  │ INSTANCE │           │ (Dream)  │           │ (Dream)  │
  │          │           │          │           │          │
  │ Real     │           │ Scenario │           │ Scenario │
  │ sensors  │    ──►    │ based on │    ──►    │ edge     │
  │ Real     │    ──►    │ live     │    ──►    │ cases    │
  │ actuators│           │ data     │           │          │
  └──────────┘           └──────────┘           └──────────┘
       │                       │                       │
       │                       │                       │
       ▼                       ▼                       ▼
  ┌─────────────────────────────────────────────────────────┐
  │                  LEARNING AGGREGATOR                     │
  │  - Collects successful strategies                        │
  │  - Identifies failure patterns                           │
  │  - Updates shared world model                           │
  │  - Optimizes navigation heuristics                      │
  └─────────────────────────────────────────────────────────┘
       │
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │                LIVE INSTANCE IMPROVEMENT                 │
  │  - Updated agent prompts                                 │
  │  - Refined tool usage patterns                          │
  │  - Better navigation decisions                          │
  │  - Pre-computed action plans                            │
  └─────────────────────────────────────────────────────────┘
```

**Dream Scenarios Generated From:**
- Replaying live experiences with variations
- Edge cases discovered during operation
- User-defined training scenarios
- Randomly generated environments
- Adversarial conditions (obstacles, noise)

### 4. Markdown-Defined Agents & Tools

Following Claude Code's approach, agents and tools are defined in markdown:

```markdown
---
type: robot-agent
name: ExplorerBot
version: 1.0.0
hardware_requirements:
  - motors: 2x differential drive
  - sensors: [ultrasonic, ir_line, camera]
  - compute: ESP32-S3
---

# ExplorerBot Agent

## Objective
Navigate and map unknown environments while avoiding obstacles.

## Behavior Rules
1. Always prioritize safety - stop if collision imminent
2. Prefer exploring unexplored areas over revisiting
3. Build mental map of environment
4. Report interesting discoveries

## Available Tools

### drive(left, right)
Control differential drive motors.
- `left`: Power for left wheel (-255 to 255)
- `right`: Power for right wheel (-255 to 255)

### read_sensors()
Get all sensor readings.
Returns: {distance: {...}, line: [...], pose: {...}}

### capture_camera(look_for?)
Capture and analyze camera frame.
Optional: Specify what to look for.

## Decision Loop
Every 500ms:
1. Read all sensors
2. Update world model
3. Determine best action based on objective
4. Execute action via tools
5. Observe results
```

**Benefits:**
- Human-readable behavior definitions
- Version controlled evolution
- Easy experimentation
- Same format works for simulation & physical

---

## Implementation Phases

### Phase 1: Architecture Decoupling ⚙️

**Goal:** Fully decouple AI agent from 3D graphics

**Tasks:**
1. Create `@llmos/agent-core` package
   - ESP32AgentRuntime
   - DeviceContext interface
   - Tool definitions
   - World model
   - Navigation system

2. Create `@llmos/simulator` package
   - CubeRobotSimulator (already decoupled!)
   - Headless simulation runner
   - Scenario loader

3. Create `@llmos/visualization` package (optional)
   - Three.js renderer
   - Scene graph visualization
   - Debug overlays

4. Create `@llmos/hardware-bridge` package
   - Serial communication
   - WiFi/WebSocket bridge
   - Firmware protocol

```
Current Structure:          Target Structure:

/lib/                       /packages/
  /hardware/                  /agent-core/
  /runtime/                     /src/
  /components/                    agent-runtime.ts
                                  device-context.ts
                                  tools.ts
                                  world-model.ts
                                  navigation.ts

                                /simulator/
                                  /src/
                                    physics-engine.ts
                                    headless-runner.ts

                                /visualization/
                                  /src/
                                    robot-canvas.tsx

                                /hardware-bridge/
                                  /src/
                                    serial-driver.ts
                                    esp32-firmware/
```

### Phase 2: Physical Robot Implementation 🤖

**Goal:** Run the same agent on physical hardware

**Hardware Components:**
- ESP32-S3 DevKit
- Camera module (OV2640 or similar)
- 2x Stepper motors with drivers
- Motor driver board (L298N or similar)
- Ultrasonic sensors
- Battery pack
- 3D printed chassis

**Firmware Requirements:**
```c
// Minimal firmware that exposes tools
void setup() {
    setupWiFi();
    setupMotors();
    setupCamera();
    setupSensors();

    // Register tools with LLMOS host
    registerTool("drive", driveHandler);
    registerTool("stop", stopHandler);
    registerTool("read_sensors", sensorHandler);
    registerTool("capture_camera", cameraHandler);
    registerTool("set_led", ledHandler);

    // Start agent loop connection
    connectToLLMOS();
}

void loop() {
    // Wait for commands from cloud
    if (pendingCommand) {
        executeCommand(pendingCommand);
        reportResult();
    }
}
```

### Phase 3: Digital Twin Dreaming 💭

**Goal:** Run parallel simulations that learn from live instance

**Components:**

1. **Experience Logger**
   - Records all live instance sensor readings
   - Logs tool executions and results
   - Tracks navigation decisions

2. **Dream Scenario Generator**
   - Creates variations of recorded experiences
   - Generates edge case scenarios
   - Randomizes environments

3. **Parallel Simulation Runner**
   - Runs N simulations in parallel (headless)
   - Uses experience pool for scenarios
   - Collects success/failure metrics

4. **Learning Aggregator**
   - Analyzes twin performance
   - Identifies successful strategies
   - Updates live instance behavior

### Phase 4: Sub-Agent Support 🔄

**Goal:** Enable hierarchical agent composition

```markdown
---
type: robot-agent
name: MainController
subagents:
  - NavigationAgent
  - VisionAgent
  - SafetyMonitor
---

# MainController

## Subagent Delegation

### NavigationAgent
Handles pathfinding and obstacle avoidance.
Delegate when: Need to plan or execute movement.

### VisionAgent
Handles camera analysis and object recognition.
Delegate when: Need to understand visual scene.

### SafetyMonitor
Always active, can interrupt any action.
Priority: Highest - can override other agents.
```

---

## Hardware Requirements

### Bill of Materials (BOM)

| Component | Quantity | Estimated Cost | Notes |
|-----------|----------|----------------|-------|
| ESP32-S3 DevKit | 1 | $15 | WiFi + camera interface |
| OV2640 Camera Module | 1 | $10 | 2MP, works with ESP32-S3 |
| NEMA 17 Stepper Motors | 2 | $20 | For differential drive |
| A4988 Motor Drivers | 2 | $5 | Stepper motor control |
| 12V Battery Pack | 1 | $25 | Li-ion or LiPo |
| Ultrasonic Sensors HC-SR04 | 3-4 | $8 | Distance sensing |
| IR Line Sensors | 5 | $5 | Line following |
| 3D Printed Chassis | 1 | $10-20 | Custom design |
| Wheels + Hardware | 1 set | $10 | |
| **Total** | | **~$100-110** | |

### Motor Control Circuit

```
                    ┌─────────────────┐
                    │    ESP32-S3     │
                    │                 │
                    │  GPIO12 ──────────► A4988 Driver ──► Motor L
                    │  GPIO13 ──────────► (STEP/DIR)
                    │                 │
                    │  GPIO14 ──────────► A4988 Driver ──► Motor R
                    │  GPIO15 ──────────► (STEP/DIR)
                    │                 │
                    │  GPIO16 ◄───────── Ultrasonic ECHO
                    │  GPIO17 ──────────► Ultrasonic TRIG
                    │                 │
                    │  CAM_* ◄────────── OV2640 Camera
                    │                 │
                    └─────────────────┘
                           │
                        ┌──┴──┐
                        │ 3.3V│ Logic power
                        │ 12V │ Motor power (separate!)
                        └─────┘
```

**Q: Is a circuit needed to control motors?**

**A: Yes.** Microcontrollers cannot directly power motors. You need:
1. **Motor Driver IC** (A4988 for steppers, L298N for DC motors)
2. **Separate power supply** for motors (12V typically)
3. **Flyback diodes** for DC motors (built into driver boards)
4. **Capacitors** for voltage smoothing

Pre-made driver boards (A4988, L298N) include all necessary circuitry.

---

## Integration Opportunities

### Gemini Flash Vision Integration

Google's Gemini Flash models offer fast, cost-effective vision capabilities that could enhance LLMOS:

**Potential Integration Points:**

1. **Real-time Scene Understanding**
   ```typescript
   // Replace current camera analysis with Gemini Flash
   async function analyzeCamera(frame: CameraFrame): Promise<VisionAnalysis> {
       const response = await gemini.generateContent({
           model: "gemini-2.0-flash",
           contents: [{
               parts: [
                   { inlineData: { mimeType: "image/jpeg", data: frame.base64 } },
                   { text: "Analyze this robot camera view. Identify: obstacles, paths, interesting objects. Return structured JSON." }
               ]
           }]
       });
       return parseVisionResponse(response);
   }
   ```

2. **Multimodal Agent Loop**
   - Current: Text-based LLM receives formatted sensor data
   - Enhanced: Vision LLM receives camera frames directly
   - Benefit: More natural understanding of environment

3. **Object Recognition & Tracking**
   - Identify specific objects (people, pets, furniture)
   - Track objects across frames
   - Semantic scene understanding

4. **Applet-Style Visualizations**
   - Gemini's applet examples show interactive visualizations
   - Could generate real-time overlays on camera feed
   - Custom UI for specific tasks (object highlighting, path preview)

5. **Live API for Continuous Vision**
   - Gemini 2.0 Live API supports streaming
   - Could enable continuous scene monitoring
   - React to visual changes in real-time

**Implementation Approach:**
```typescript
// Multi-provider vision support
interface VisionProvider {
    analyzeFrame(frame: CameraFrame, prompt: string): Promise<VisionAnalysis>;
}

class GeminiVisionProvider implements VisionProvider {
    async analyzeFrame(frame: CameraFrame, prompt: string) {
        // Use Gemini Flash for fast, cheap analysis
    }
}

class ClaudeVisionProvider implements VisionProvider {
    async analyzeFrame(frame: CameraFrame, prompt: string) {
        // Use Claude for complex reasoning about scenes
    }
}

// In agent runtime
const vision = getVisionProvider(); // Configurable
const analysis = await vision.analyzeFrame(cameraFrame, "Navigate to the red object");
```

---

## Action Items

### Immediate (This Week) 📋

- [ ] **Call Paco Solsona** - Discuss sponsorship opportunity
- [ ] **Order hardware components:**
  - [ ] ESP32-S3 DevKit
  - [ ] Camera module (OV2640)
  - [ ] 2x Stepper motors (NEMA 17)
  - [ ] Motor drivers (A4988)
- [ ] **3D print robot chassis** - Use existing design or create new

### Short-term (Next 2 Weeks) 🔧

- [ ] Create architecture decoupling PR
  - [ ] Extract `@llmos/agent-core` package
  - [ ] Define clean DeviceContext interface
  - [ ] Ensure physics simulator has zero graphics deps
- [ ] Write ESP32 firmware skeleton
  - [ ] WiFi connection to LLMOS
  - [ ] Basic motor control
  - [ ] Sensor reading endpoints
- [ ] Research Gemini Flash Vision API
  - [ ] Test with sample robot camera frames
  - [ ] Benchmark latency vs current solution

### Medium-term (Next Month) 🚀

- [ ] Complete physical robot build
- [ ] Test same agent in simulation AND physical
- [ ] Implement experience logging
- [ ] Begin digital twin infrastructure

### Long-term (Quarter) 🌟

- [ ] Full digital twin dreaming system
- [ ] Sub-agent support
- [ ] Multi-robot coordination
- [ ] Open source release with documentation

---

## Article Draft: AI Physical Agents

# What is an AI Physical Agent? The Future of Robotics

## Introduction

An **AI Physical Agent** (or AI Robot Agent) is a new paradigm in robotics where the intelligence lives in the cloud, and the physical robot serves as a tool-equipped body that executes commands in the real world.

Unlike traditional robots programmed with fixed firmware, AI robot agents:
- **Reason in natural language** using Large Language Models
- **Learn from experience** through memory and reflection
- **Evolve their behavior** through prompt engineering, not code rewriting
- **Operate identically** in simulation and reality

## The Architecture: Simulated vs. Physical

```
┌─────────────────────────────────────────────────────────────────┐
│                      SHARED AI AGENT CORE                        │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   LLM       │  │   Tools     │  │ Navigation  │             │
│  │ Reasoning   │  │ (Abstract)  │  │   (3D)      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                            │                                     │
│              ┌─────────────┴─────────────┐                      │
│              │  Hardware Abstraction     │                      │
│              │       Interface           │                      │
│              └─────────────┬─────────────┘                      │
└────────────────────────────┼────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     ┌──────▼──────┐                   ┌──────▼──────┐
     │  SIMULATED  │                   │  PHYSICAL   │
     │    WORLD    │                   │    WORLD    │
     │             │                   │             │
     │ - Physics   │                   │ - Real      │
     │   engine    │                   │   physics   │
     │ - 3D        │                   │ - Real      │
     │   renderer  │                   │   sensors   │
     │ - Virtual   │                   │ - Real      │
     │   sensors   │                   │   motors    │
     └─────────────┘                   └─────────────┘
```

Both worlds share the same:
- **Agent software** (prompts, reasoning, memory)
- **Tool definitions** (drive, sense, capture)
- **3D Navigation** (ray casting, path planning)
- **World model** (cognitive map)

The only difference is _where_ the tools execute.

## Inversion of Control: The Key Innovation

**Traditional Approach:**
- Write firmware in C/C++
- Embed decision logic in microcontroller
- Hard to update, limited reasoning

**LLMOS Approach:**
- Microcontroller provides _tools_ (sensors, actuators)
- LLM in cloud makes _decisions_
- Behavior defined in markdown (easily editable)
- Updates happen instantly, no re-flashing

```markdown
# Robot Behavior (Markdown-Defined)

## Objective
Navigate to charging station when battery < 20%

## Strategy
1. Check battery level
2. If low, locate charging station
3. Plan path avoiding obstacles
4. Navigate carefully
5. Dock and charge

## Tools Available
- read_sensors(): Get all sensor data
- drive(left, right): Control motors
- find_object("charging station"): Vision search
```

This markdown can be edited in real-time, and the robot's behavior changes immediately.

## Digital Twins: Dreaming to Improve

The breakthrough insight: run multiple simulated "twins" of the live robot that dream (simulate) scenarios based on real experiences.

**How it works:**

1. **Live Instance** operates in real world, collecting experiences
2. **Experience Pool** stores sensor data, decisions, outcomes
3. **Digital Twins** run simulations based on real data
4. **Twins dream variations** - what if obstacle was closer? bigger? moving?
5. **Learning aggregated** - successful strategies shared
6. **Live Instance updated** - better behavior in real-time

This enables:
- **Parallel learning** without risking physical robot
- **Edge case training** on dangerous scenarios safely
- **Continuous improvement** while robot operates

## The Future: Sub-Agents and Collaboration

Next evolution: hierarchical agents where specialized sub-agents handle specific tasks:

- **NavigationAgent** - pathfinding expert
- **VisionAgent** - scene understanding
- **SafetyAgent** - emergency override
- **TaskAgent** - high-level goal execution

These can run on different hardware, different clouds, or even different LLMs, but coordinate through the shared tool interface.

## Conclusion

AI Physical Agents represent a fundamental shift from "programming robots" to "teaching robots." By moving intelligence to LLMs and treating hardware as tool providers, we enable:

- Rapid iteration on behavior
- Seamless simulation-to-reality transfer
- Continuous learning through digital twins
- Natural language programming

The robots of tomorrow won't be programmed—they'll be prompted.

---

*This article is part of the LLMOS project documentation. LLMOS is an open-source platform for AI robot agents that can operate in both simulated and physical environments.*

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-28 | 1.0.0 | Initial vision document |

---

*"The new way to program is to organize ideas, drafts and sequences of prompts. An organized idea storm, with intervals of creativity and intervals of order."*
