# LLMos Architecture v2: Adaptive Physical Intelligence

## The iPhone Moment for Robotics

This architecture transforms LLMos from a robot simulation platform into the **Smartphone of Robotics**:

| Smartphone | LLMos Robot |
|------------|-------------|
| Hardware (screen, touch) | ESP32 + Camera + Arm |
| Operating System (iOS/Android) | Gemini 3 Flash Kernel |
| App (.apk/.ipa) | Skill Cartridge (.md) |

**Result**: Generic hardware that runs *apps* to do anything.

---

## System Overview

```mermaid
graph TB
    subgraph "User Layer"
        User[User/Developer]
        NL[Natural Language Intent]
        SkillStore[(Skill Store<br/>Markdown Files)]
    end

    subgraph "Skill Cartridge Layer"
        SC[Active Skill Cartridge]
        Role[Role Definition]
        VC[Visual Cortex<br/>What to see]
        MC[Motor Cortex<br/>How to move]
        EH[Evolution History]

        SC --> Role
        SC --> VC
        SC --> MC
        SC --> EH
    end

    subgraph "Kernel Layer (Gemini 3 Flash)"
        Kernel[Gemini 3 Flash Thinking]
        Context[Context Window<br/>Video + Text + Skill]

        subgraph "Agentic Vision Loop"
            Think[THINK<br/>Analyze & Plan]
            Act[ACT<br/>Execute Code]
            Observe[OBSERVE<br/>Verify Result]

            Think --> Act
            Act --> Observe
            Observe --> |Continue| Think
        end

        ToolExec[Tool Executor<br/>JSON Tool Calls]

        Kernel --> Context
        Context --> Think
        Observe --> ToolExec
    end

    subgraph "HAL (Hardware Abstraction Layer)"
        ModeRouter{Mode Router}

        subgraph "Simulated World"
            SimDriver[Simulation Driver]
            ThreeJS[Three.js Renderer]
            Physics[Physics Engine]
            BlackBox[BlackBox Recorder]
        end

        subgraph "Real World"
            RealDriver[Hardware Driver]
            Serial[Web Serial/WiFi]
            ESP32[ESP32-S3 Device]
            Sensors[Cameras + Sensors]
            Actuators[Motors + LEDs]
        end
    end

    subgraph "Evolution Engine (The Dreaming)"
        Replay[Failure Replay]
        SimEngine[Physics Simulator]
        Optimizer[Evolution Agent]
        Patcher[Skill Patcher]
    end

    User --> NL
    NL --> |Context Detection| SkillStore
    SkillStore --> |Load| SC
    SC --> |System Prompt| Kernel

    ToolExec --> ModeRouter
    ModeRouter --> |Virtual| SimDriver
    ModeRouter --> |Physical| RealDriver

    SimDriver --> ThreeJS
    SimDriver --> Physics
    SimDriver --> BlackBox

    RealDriver --> Serial
    Serial --> ESP32
    ESP32 --> Sensors
    ESP32 --> Actuators

    Sensors --> |Video Stream| Context
    BlackBox --> Replay
    Replay --> SimEngine
    SimEngine --> Optimizer
    Optimizer --> Patcher
    Patcher --> |Update| SkillStore
```

---

## Component Deep Dive

### 1. Skill Cartridge (The "App")

A Skill Cartridge is a markdown file that transforms a generic robot into a specialist:

```markdown
---
name: PlantCare_Specialist
type: physical_skill
base_model: gemini-3-flash
hardware_profile: standard_arm_v1
version: 1.2.0
---

# Role
You are an expert botanist. Identify dry soil and water plants.

# Visual Cortex Instructions (Gemini Vision)
**Scan for:** withered_leaves, dry_soil_texture (cracked/light brown)
**Ignore:** Plastic pots, furniture
**Alert:** yellow_leaves → flag "Nutrient Deficiency"

# Motor Cortex Protocols (Tool Use)
- Use `arm.precision_mode(true)` for watering
- Verify water flow visually
- Stop if water reaches 1cm from rim

# Evolution History
- v1.0: Initial prompts
- v1.1: Added check_drainage (Dreaming discovered root rot risk)
- v1.2: Reduced water flow rate by 20% (field optimization)
```

### 2. Gemini 3 Flash Kernel (The "OS")

The kernel processes multimodal inputs with **Agentic Vision**:

```mermaid
sequenceDiagram
    participant Robot as Robot Camera
    participant Browser as LLMos Browser
    participant Gemini as Gemini 3 Flash
    participant HAL as HAL Layer

    Robot->>Browser: MJPEG Video Stream
    Browser->>Gemini: Image + Skill Context

    Note over Gemini: THINK Phase
    Gemini->>Gemini: Analyze scene + formulate plan

    Note over Gemini: ACT Phase
    Gemini->>Gemini: Execute Python code<br/>Zoom/Crop/Annotate

    Note over Gemini: OBSERVE Phase
    Gemini->>Gemini: Verify with transformed image

    Gemini->>Browser: Tool Calls (JSON)
    Browser->>HAL: hal.move_to(x, y, z)
    HAL->>Robot: Motor Commands
```

**Key Insight**: Agentic Vision doesn't just "see" - it *investigates*. When detecting fine details, it:
- Generates Python code to crop/zoom the region
- Appends the transformed image to its context
- Makes decisions grounded in pixel-level evidence

### 3. Hardware Abstraction Layer (HAL)

The HAL enables the same skill to run in both worlds:

```mermaid
graph LR
    subgraph "Unified Tool Interface"
        vision_scan["hal.vision.scan()"]
        move_to["hal.manipulator.move_to(x,y,z)"]
        grasp["hal.manipulator.grasp(force)"]
        speak["hal.voice.speak(text)"]
    end

    subgraph "Simulated Implementation"
        sim_scan["ThreeJS Raycasting"]
        sim_move["Physics Interpolation"]
        sim_grasp["Collision Detection"]
        sim_speak["Web Speech API"]
    end

    subgraph "Physical Implementation"
        real_scan["ESP32 Camera + Gemini"]
        real_move["Stepper Motor Control"]
        real_grasp["Servo + Force Sensor"]
        real_speak["Speaker Module"]
    end

    vision_scan --> |Virtual| sim_scan
    vision_scan --> |Physical| real_scan

    move_to --> |Virtual| sim_move
    move_to --> |Physical| real_move

    grasp --> |Virtual| sim_grasp
    grasp --> |Physical| real_grasp

    speak --> |Virtual| sim_speak
    speak --> |Physical| real_speak
```

### 4. The Dreaming Engine (Evolution)

Digital twins learn while the live instance operates:

```mermaid
graph TB
    subgraph "Live Instance (Real World)"
        Live[Live Robot]
        RealWorld[Physical Environment]
        Experience[Experience Stream]

        Live --> |Actuates| RealWorld
        RealWorld --> |Feedback| Experience
    end

    subgraph "Digital Twins (Dream World)"
        Twin1[Twin #1]
        Twin2[Twin #2]
        Twin3[Twin #3]
        SimWorld[Physics Simulation]

        Twin1 --> SimWorld
        Twin2 --> SimWorld
        Twin3 --> SimWorld
    end

    subgraph "Evolution Process"
        BlackBox[(BlackBox<br/>Failure Logs)]
        Mutator[Mutation Engine]
        Evaluator[Fitness Evaluator]
        Patcher[Skill Patcher]
    end

    Experience --> |Record Failures| BlackBox
    BlackBox --> |Replay| SimWorld

    SimWorld --> |Trial Results| Evaluator
    Evaluator --> |Select Best| Mutator
    Mutator --> |Generate Variants| Twin1
    Mutator --> |Generate Variants| Twin2
    Mutator --> |Generate Variants| Twin3

    Evaluator --> |Best Strategy| Patcher
    Patcher --> |Update| Live
```

**The Dream Cycle**:
1. **Record**: Live instance logs failures to BlackBox
2. **Replay**: Dreaming engine reconstructs scenario in simulation
3. **Mutate**: Generate skill variants with different approaches
4. **Evaluate**: Test variants in accelerated simulation (1000x real-time)
5. **Patch**: Deploy winning strategy to live instance

---

## Data Flow Architecture

### Camera to Action Pipeline

```mermaid
sequenceDiagram
    participant Cam as ESP32 Camera
    participant ESP as ESP32 MCU
    participant Browser as LLMos Browser
    participant Gemini as Gemini 3 Flash
    participant HAL as HAL Layer
    participant Motor as Motor Driver

    Note over Cam,Motor: Frame Rate: 10-30 FPS for vision

    Cam->>ESP: Raw Frame
    ESP->>Browser: MJPEG over WiFi/Serial

    Browser->>Browser: Frame Buffer (latest N frames)
    Browser->>Gemini: POST /v1/chat/completions

    Note over Gemini: Multimodal Input:<br/>- Skill System Prompt<br/>- Recent Frames<br/>- Sensor Telemetry

    Gemini->>Gemini: Agentic Vision Loop
    Gemini-->>Browser: Tool Calls + Reasoning

    Browser->>HAL: Execute Tool Calls

    alt Simulation Mode
        HAL->>Browser: Update Three.js Scene
    else Physical Mode
        HAL->>ESP: JSON Command
        ESP->>Motor: PWM/Step Signals
    end

    Motor-->>Cam: Physical State Change
    Note over Cam,Motor: Loop continues
```

### Skill Hot-Swapping

```mermaid
sequenceDiagram
    participant User
    participant Detector as Context Detector
    participant Loader as Skill Loader
    participant Kernel as Gemini Kernel
    participant Robot as Robot

    User->>Robot: "Look at these plants"
    Robot->>Detector: Audio/Visual Context

    Detector->>Detector: Analyze Intent
    Note over Detector: Detected: Plants<br/>Current Skill: Navigator<br/>Recommended: Gardener

    Detector->>Loader: Request skill switch
    Loader->>Kernel: Unmount navigator.md
    Loader->>Loader: Load gardener.md
    Loader->>Kernel: Mount new system prompt

    Note over Kernel: Context Window Reset<br/>New skill instructions active

    Kernel->>Robot: New behavior active
    Note over Robot: Was: Avoiding walls<br/>Now: Scanning for leaf veins

    Robot-->>User: "I see 3 plants. The fern looks dry."
```

---

## Physical/Simulated Duality Architecture

### Shared Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHARED (100% Code Reuse)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Agent Def   │  │ Tool Specs  │  │ 3D Navigation System    │ │
│  │ (Markdown)  │  │ (JSON)      │  │ (Pathfinding, Mapping)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                                   ▼
┌───────────────────────┐           ┌───────────────────────────┐
│    SIMULATED WORLD    │           │       REAL WORLD          │
│ ┌───────────────────┐ │           │ ┌───────────────────────┐ │
│ │ Three.js Renderer │ │           │ │ ESP32-S3 + WASMachine │ │
│ ├───────────────────┤ │           │ ├───────────────────────┤ │
│ │ Cannon.js Physics │ │           │ │ Real World Physics    │ │
│ ├───────────────────┤ │           │ ├───────────────────────┤ │
│ │ Simulated Sensors │ │           │ │ OV2640 Camera         │ │
│ │ (Raycasting)      │ │           │ │ Distance Sensors      │ │
│ ├───────────────────┤ │           │ ├───────────────────────┤ │
│ │ Virtual Motors    │ │           │ │ Stepper/DC Motors     │ │
│ └───────────────────┘ │           │ └───────────────────────┘ │
└───────────────────────┘           └───────────────────────────┘
```

### Deployment Pipeline

```mermaid
graph LR
    subgraph "Development"
        Skill[Skill.md]
        Test[Write & Test]
    end

    subgraph "Simulation"
        Sim[Three.js Simulator]
        Validate[Behavior Validation]
    end

    subgraph "Production"
        Deploy[Deploy to ESP32]
        Live[Live Operation]
        Monitor[Telemetry Monitoring]
    end

    subgraph "Evolution"
        Learn[Continuous Learning]
        Update[Skill Updates]
    end

    Skill --> Test
    Test --> Sim
    Sim --> Validate

    Validate --> |Pass| Deploy
    Validate --> |Fail| Test

    Deploy --> Live
    Live --> Monitor
    Monitor --> Learn
    Learn --> Update
    Update --> Skill
```

---

## Inversion of Control Model

### Traditional Robotics (Firmware-Centric)

```
┌─────────────────────────────────────┐
│         MICROCONTROLLER             │
│  ┌───────────────────────────────┐  │
│  │         FIRMWARE              │  │
│  │  - Hardcoded behaviors        │  │
│  │  - Fixed sensor processing    │  │
│  │  - Predetermined responses    │  │
│  └───────────────────────────────┘  │
│                │                    │
│    ┌───────────┴───────────┐       │
│    ▼                       ▼       │
│  Sensors                Motors     │
└─────────────────────────────────────┘
```

### LLMos (LLM-Centric)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLOUD LLM (Gemini 3)                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              SKILL CARTRIDGE                          │  │
│  │  - Dynamic behaviors (markdown)                       │  │
│  │  - Contextual reasoning                               │  │
│  │  - Natural language evolution                         │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tool Calls (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    MICROCONTROLLER                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              TOOL EXECUTOR                             │  │
│  │  - Exposes sensors as readable tools                  │  │
│  │  - Exposes actuators as callable tools                │  │
│  │  - No behavior logic - just I/O                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                     │               │                       │
│         ┌───────────┘               └───────────┐          │
│         ▼                                       ▼          │
│  Tool: read_sensors()                 Tool: drive(l, r)   │
│  Tool: use_camera(prompt)             Tool: set_led(rgb)   │
└─────────────────────────────────────────────────────────────┘
```

**Key Difference**: The microcontroller becomes a "peripheral" that exposes tools. All intelligence lives in the cloud-based LLM with downloadable skill cartridges.

---

## Implementation Priorities

### Phase 1: Core Infrastructure
1. Gemini 3 Flash API integration wrapper
2. Agentic Vision Think-Act-Observe loop
3. Skill Cartridge loader with hot-swapping

### Phase 2: HAL Unification
1. Abstract existing Three.js simulation
2. Abstract ESP32 hardware interface
3. Unified tool definitions

### Phase 3: Dreaming Engine
1. BlackBox recorder for failures
2. Headless simulation for replay
3. Evolutionary skill patcher

### Phase 4: Production Ready
1. Multi-robot fleet support
2. Collaborative skill evolution (Team Volume)
3. Skill marketplace

---

*Architecture Version: 2.0*
*Last Updated: 2026-01-28*
*Status: Design Complete, Implementation Pending*
