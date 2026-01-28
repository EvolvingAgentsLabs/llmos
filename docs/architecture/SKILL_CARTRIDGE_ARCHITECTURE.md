# LLMOS Architecture v2: The Skill Cartridge Model

> The "iPhone moment" for robotics: generic hardware running downloadable skills.

## System Overview (Mermaid)

```mermaid
graph TD
    subgraph "Physical World (The Peripheral)"
        Robot[ESP32 Robot Body]
        Cam[Camera Feed<br/>MJPEG Stream]
        Motors[Actuators/Arm]
        Sensors[Mic/IMU/Distance]

        Robot -->|Streams| Cam
        Robot -->|Telemetry| Sensors
        Motors -->|Feedback| Robot
    end

    subgraph "Hardware Abstraction Layer (HAL)"
        Driver[Universal Driver<br/>WASM/Native]
        Router{Mode Router}

        Cam --> Router
        Sensors --> Router
        Router -->|Live Stream| Kernel
        Router -->|Simulated Stream| SimEngine

        Kernel -->|Tool Calls| Driver
        Driver -->|Serial/WiFi| Robot
    end

    subgraph "The Kernel (Gemini 2.0 Flash Thinking)"
        Kernel[Gemini 2.0<br/>Inference Engine]
        Context[Context Window<br/>Video + Text + Skill]
        Reasoning[Chain of Thought<br/>Agentic Vision]

        Kernel --> Context
        Context --> Reasoning
        Reasoning -->|Decision| ToolExec[Tool Executor]
        ToolExec -->|Motor Commands| Driver
    end

    subgraph "Filesystem (The Mind)"
        UserVol[(User Volume<br/>Personal Memories)]
        TeamVol[(Team Volume<br/>Shared Patterns)]
        SysVol[(System Volume<br/>Core Skills)]

        active_skill[LOADED SKILL CARTRIDGE<br/>gardener.md / sorter.md]

        UserVol -->|Personal Context| active_skill
        TeamVol -->|Team Learnings| active_skill
        SysVol -->|Base Capabilities| active_skill

        active_skill -->|System Prompt| Context
    end

    subgraph "The Dreaming Engine (Evolution)"
        BlackBox[BlackBox Recorder<br/>Failed Interactions]
        SimEngine[Physics Simulator<br/>Three.js / PhysX]
        Optimizer[Evolution Agent<br/>Mutation & Selection]

        Router -->|Copy Data| BlackBox
        BlackBox -->|Replay Failures| SimEngine
        SimEngine -->|Trial & Error| Optimizer
        Optimizer -->|Patch Skill| TeamVol
    end

    style Kernel fill:#ff6b6b,stroke:#333,stroke-width:2px,color:#fff
    style active_skill fill:#4ecdc4,stroke:#333,stroke-width:2px,color:#000
    style BlackBox fill:#95a5a6,stroke:#333,stroke-width:2px
    style Optimizer fill:#f39c12,stroke:#333,stroke-width:2px
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Skill as Skill Loader
    participant Kernel as Gemini 2.0 Kernel
    participant HAL as Hardware Abstraction
    participant Robot as Physical Robot
    participant Dream as Dreaming Engine

    User->>Skill: "Look at these plants"
    Skill->>Skill: Detect context
    Skill->>Kernel: Unmount navigator.md
    Skill->>Kernel: Mount gardener.md

    loop Agent Loop (500ms)
        Robot->>HAL: Video Frame + Sensors
        HAL->>Kernel: Formatted Input

        Note over Kernel: Chain of Thought:<br/>"Leaves drooping 20°<br/>Soil moisture 10%<br/>Need watering can"

        Kernel->>HAL: Tool Call: hal.vision.scan()
        HAL->>Robot: Execute scan
        Robot->>HAL: Objects detected

        Kernel->>HAL: Tool Call: hal.arm.move_to(can)
        HAL->>Robot: Move arm
        Robot->>HAL: Position reached

        Kernel->>HAL: Tool Call: hal.arm.pour(50ml)
        HAL->>Robot: Pour water
    end

    alt On Failure
        Robot->>Dream: Log failed attempt
        Dream->>Dream: Simulate 1000 variations
        Dream->>Skill: Patch skill with solution
    end
```

## Skill Cartridge Structure

```mermaid
graph LR
    subgraph "Skill File (.md)"
        Header[YAML Frontmatter<br/>name, model, hardware]
        Role[Role Definition<br/>Persona & Objective]
        Visual[Visual Cortex<br/>What to scan for]
        Motor[Motor Cortex<br/>How to move safely]
        History[Evolution History<br/>Version changes]
    end

    Header --> Role
    Role --> Visual
    Visual --> Motor
    Motor --> History

    style Header fill:#3498db,color:#fff
    style Role fill:#9b59b6,color:#fff
    style Visual fill:#e74c3c,color:#fff
    style Motor fill:#2ecc71,color:#fff
    style History fill:#95a5a6,color:#fff
```

## Volume Hierarchy

```mermaid
graph TB
    subgraph "Knowledge Cascade"
        System[System Volume<br/>Base Skills & OS]
        Team[Team Volume<br/>Shared Learning]
        User[User Volume<br/>Personal Memory]
        Robot[Active Robot]

        System -->|Core capabilities| Team
        Team -->|Team patterns| User
        User -->|Context| Robot

        Robot -->|Failures| Dream[Dreaming Engine]
        Dream -->|Patches| Team
    end

    style System fill:#2c3e50,color:#fff
    style Team fill:#27ae60,color:#fff
    style User fill:#3498db,color:#fff
    style Dream fill:#f39c12,color:#000
```

## Skill Hot-Swap Process

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> ContextDetection: User speaks
    ContextDetection --> SkillMatch: Analyze intent

    SkillMatch --> CurrentSkill: Same skill needed
    SkillMatch --> UnmountSkill: Different skill needed

    UnmountSkill --> SaveState: Save current context
    SaveState --> MountSkill: Load new skill
    MountSkill --> Reasoning: Begin new task

    CurrentSkill --> Reasoning: Continue task

    Reasoning --> Execution: Tool calls
    Execution --> Reasoning: Observe result

    Execution --> FailureLog: On failure
    FailureLog --> Dreaming: Queue for simulation
    Dreaming --> SkillPatch: Find solution
    SkillPatch --> Reasoning: Apply patch

    Reasoning --> Idle: Task complete
```

## HAL Tool Interface

```mermaid
classDiagram
    class HAL {
        +vision: VisionModule
        +manipulator: ManipulatorModule
        +sensors: SensorModule
        +voice: VoiceModule
        +led: LEDModule
    }

    class VisionModule {
        +scan(): ObjectList
        +track(objectId): Position
        +classify(region): Label
    }

    class ManipulatorModule {
        +move_to(x, y, z): void
        +grasp(force): void
        +release(): void
        +precision_mode(enabled): void
    }

    class SensorModule {
        +read(): SensorData
        +distance(): float
        +imu(): Orientation
    }

    class VoiceModule {
        +speak(text): void
        +listen(): string
    }

    class LEDModule {
        +set(r, g, b): void
        +pulse(color, duration): void
    }

    HAL --> VisionModule
    HAL --> ManipulatorModule
    HAL --> SensorModule
    HAL --> VoiceModule
    HAL --> LEDModule
```

---

## Key Architecture Decisions

### 1. Gemini 2.0 as the Kernel

**Why Gemini 2.0 Flash Thinking?**
- Native multimodal input (video + text in one context)
- Chain-of-thought reasoning visible in output
- Fast inference for real-time control (~200ms)
- Tool use / function calling support
- Live API for streaming video analysis

### 2. Markdown as the App Format

**Why Markdown?**
- Human-readable and editable
- Version controllable (git)
- Same format Claude Code uses for agents
- Can be generated/patched by LLM
- No compilation needed

### 3. Three-Layer Volume System

| Volume | Purpose | Persists Across |
|--------|---------|-----------------|
| System | Core skills, OS | All users |
| Team | Shared learnings | Team/org |
| User | Personal tweaks | Individual |

### 4. Dreaming for Evolution

The key insight: **failures are training data**.

Instead of discarding errors:
1. Log everything to BlackBox
2. Replay in physics simulation
3. Mutate approach thousands of times
4. Patch the skill when solution found
5. Propagate to fleet via Team Volume

---

*This architecture enables the "infinite app store for reality" - one robot body, infinite downloadable skills.*
