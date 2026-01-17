# LLMos Architecture

Technical architecture documentation for the LLMos - The Evolutionary Operating System for Physical AI Agents.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Directory Structure](#directory-structure)
4. [Core Architecture](#core-architecture)
5. [Agent System](#agent-system)
6. [Runtime Environments](#runtime-environments)
7. [Hardware Integration](#hardware-integration)
8. [Evolution System](#evolution-system)
9. [Tool System](#tool-system)
10. [State Management](#state-management)
11. [Data Flow](#data-flow)
12. [Security Considerations](#security-considerations)

---

## System Overview

LLMos is a **100% client-side operating system** that runs entirely in the browser. There is no backend server required - all computation, compilation, and execution happens in WebAssembly runtimes within the browser.

```mermaid
graph TB
    subgraph "Browser Environment"
        UI[React UI<br/>Next.js 14]

        subgraph "Runtimes"
            PY[Pyodide<br/>Python 3.11]
            QJS[QuickJS<br/>JavaScript]
            WASM[Wasmer/Clang<br/>C to WASM]
            R4[Robot4<br/>Firmware Simulator]
        end

        subgraph "Storage"
            VFS[Virtual File System<br/>localStorage]
            IDB[IndexedDB<br/>Large Artifacts]
        end

        subgraph "Agents"
            SA[System Agent]
            HA[Hardware Agent]
            MA[Mutation Agent]
        end
    end

    subgraph "External APIs"
        LLM[OpenAI-compatible API<br/>OpenRouter/Gemini/OpenAI]
        GH[GitHub API<br/>Git Operations]
    end

    subgraph "Hardware"
        ESP[ESP32-S3<br/>WASMachine]
    end

    UI --> PY
    UI --> QJS
    UI --> WASM
    UI --> R4
    UI --> VFS
    UI --> IDB
    UI --> SA
    SA --> LLM
    SA --> HA
    SA --> MA
    UI --> GH
    WASM --> ESP
```

---

## Architecture Principles

### Zero Backend

Everything runs in the browser:
- **No server-side compilation** - Clang runs in WASM
- **No backend database** - localStorage + IndexedDB
- **No proxy servers** - Direct API calls to OpenAI-compatible providers
- **No file servers** - Virtual File System in browser

### File-First

All artifacts are real files in persistent storage:
- Every output saved to organized project structures
- Complete file tree with real paths
- Git-backed persistence via isomorphic-git
- Read-only system volume with immutable artifacts

### Agent-Native

Agents are first-class citizens:
- Markdown-defined agent specifications
- Persistent agent memory and tools
- Evolutionary improvement over time
- Inter-agent communication protocol

### Physical AI First-Class

Hardware is a core primitive:
- Browser-to-hardware deployment pipeline
- Closed-loop telemetry feedback
- Robot4 abstraction for LLM-friendly APIs
- Virtual simulation before physical deployment

---

## Directory Structure

```
llmos/
├── README.md                       # Project overview
├── package.json                    # Project configuration
│
├── app/                            # Next.js App Router
│   ├── page.tsx                    # Main entry point
│   └── api/                        # API routes
│       ├── auth/github/            # GitHub OAuth
│       └── git-proxy/              # Git operations
│
├── components/                     # React components
│   ├── workspace/                  # Layout orchestration
│   ├── panels/                     # UI panels
│   │   ├── session/                # Chat interface
│   │   ├── artifacts/              # Artifact viewers
│   │   └── volumes/                # File explorer
│   ├── applets/                    # Interactive applets
│   ├── chat/                       # Chat components
│   ├── settings/                   # Settings UI
│   └── common/                     # Shared components
│
├── lib/                            # Core libraries
│   ├── llm/                        # LLM client (OpenAI-compatible)
│   ├── agents/                     # Agent system
│   ├── runtime/                    # Execution runtimes
│   ├── hardware/                   # Hardware integration
│   ├── kernel/                     # OS kernel
│   ├── llm-tools/                  # Tool definitions
│   └── artifacts/                  # Artifact management
│
├── contexts/                       # React contexts
├── hooks/                          # Custom hooks
│
├── public/                         # Static assets
│   ├── sdk/wasi-headers/           # ESP32 SDK headers
│   └── system/                     # System files
│       ├── agents/                 # Agent definitions
│       ├── applets/                # System applets
│       ├── domains/                # Domain knowledge
│       ├── kernel/                 # Kernel configuration
│       └── tools/                  # Tool specifications
│
├── volumes/                        # Persistent storage
│   └── system/                     # System volume
│       ├── agents/                 # Agent definitions
│       ├── skills/                 # Learned skills
│       ├── tools/                  # Tool specs
│       └── project-templates/      # Scaffolding
│
├── backend/                        # Optional backend services
│   ├── chat.py                     # Chat API
│   ├── collaboration-server.py    # Collaboration
│   └── webhooks/                   # Git webhooks
│
├── electron/                       # Desktop app
│   ├── main.ts                     # Electron main process
│   ├── preload.ts                  # Preload scripts
│   └── services/                   # Native services
│
├── docs/                           # Documentation
│   ├── architecture/               # Architecture docs
│   ├── guides/                     # User guides
│   ├── hardware/                   # Hardware guides
│   └── ui/                         # UI documentation
│
├── __tests__/                      # Test files
│   ├── lib/                        # Library tests
│   └── integration/                # Integration tests
│
├── scripts/                        # Build scripts
└── styles/                         # Global styles
```

---

## Core Architecture

### Three-Layer System

```mermaid
graph TB
    subgraph "Presentation Layer"
        RC[React Components]
        FL[FluidLayout / Holodeck]
        ME[Monaco Editor]
        TF[Three.js / Fiber]
    end

    subgraph "Application Layer"
        SAO[System Agent Orchestrator]
        MACO[Multi-Agent Chat Orchestrator]
        WCM[Workflow Context Manager]
        TS[Tool System]
    end

    subgraph "Runtime Layer"
        PYR[Pyodide Runtime]
        QJSR[QuickJS Runtime]
        WR[WASM Runtime]
        R4R[Robot4 Runtime]
    end

    subgraph "Persistence Layer"
        VFS[Virtual File System]
        IDB[IndexedDB]
        LS[localStorage]
    end

    RC --> SAO
    FL --> SAO
    ME --> SAO
    TF --> R4R

    SAO --> MACO
    MACO --> WCM
    WCM --> TS

    TS --> PYR
    TS --> QJSR
    TS --> WR
    TS --> R4R

    PYR --> VFS
    QJSR --> VFS
    WR --> VFS
    R4R --> VFS

    VFS --> LS
    VFS --> IDB
```

### Kernel Boot Sequence

```mermaid
sequenceDiagram
    participant Browser
    participant Kernel
    participant VFS
    participant Agents
    participant Runtimes

    Browser->>Kernel: Initialize
    Kernel->>VFS: Mount volumes
    VFS-->>Kernel: Volumes ready

    Kernel->>Agents: Load system agents
    Agents-->>Kernel: Agents loaded

    Kernel->>Runtimes: Initialize runtimes
    Note over Runtimes: Pyodide loads lazily<br/>WASM compiler loads lazily
    Runtimes-->>Kernel: Core runtimes ready

    Kernel-->>Browser: Boot complete
```

---

## Agent System

### Markdown-First Architecture

Agents are defined as markdown files with YAML frontmatter:

```markdown
---
name: HardwareControlAgent
type: specialized
capabilities:
  - esp32-control
  - wasm-deployment
  - sensor-reading
version: 1.0.0
---

# Hardware Control Agent

You are a specialized agent for controlling ESP32 hardware...

## Workflow

1. Analyze hardware requirements
2. Generate appropriate firmware
3. Compile and deploy
4. Monitor telemetry

## Tools Available

- deploy-wasm-app
- query-wasm-apps
- connect-device
```

### Agent Hierarchy

```mermaid
graph TB
    SA[System Agent<br/>Master Orchestrator]

    SA --> PA[Planning Agent<br/>Task Decomposition]
    SA --> HA[Hardware Control Agent<br/>ESP32 Operations]
    SA --> MA[Mutation Agent<br/>Code Evolution]
    SA --> PMA[Pattern Matcher Agent<br/>Semantic Search]

    HA --> WASM[WASM Compiler]
    HA --> DEP[Device Deployer]
    HA --> SIM[Robot Simulator]

    MA --> LE[Lens Evolution]
    MA --> ME[Mutation Engine]

    style SA fill:#f9f,stroke:#333
    style HA fill:#bbf,stroke:#333
    style MA fill:#bfb,stroke:#333
```

### Agent Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant SAO as System Agent Orchestrator
    participant LLM as OpenAI-compatible API
    participant Tools as Tool System
    participant Runtime as Runtime Environment

    User->>SAO: "Create a wall-avoiding robot"
    SAO->>LLM: System prompt + User message
    LLM-->>SAO: Tool call: generate-wasm-app

    SAO->>Tools: Execute generate-wasm-app
    Tools->>Runtime: Compile C to WASM
    Runtime-->>Tools: WASM binary
    Tools-->>SAO: Tool result

    SAO->>LLM: Tool result + Continue
    LLM-->>SAO: Tool call: spawn-robot

    SAO->>Tools: Execute spawn-robot
    Tools->>Runtime: Initialize Robot4 simulator
    Runtime-->>Tools: Robot spawned
    Tools-->>SAO: Tool result

    SAO->>LLM: Tool result + Continue
    LLM-->>SAO: Final response
    SAO-->>User: "Robot created and running in simulator"
```

### Model-Aware Execution

The orchestrator adapts based on LLM capabilities:

```mermaid
graph LR
    subgraph "Advanced Models"
        AM[Claude Opus 4.5<br/>GPT-4o]
        NA[Native Agents<br/>Full markdown]
    end

    subgraph "Standard Models"
        SM[Claude Sonnet<br/>GPT-4-mini]
        CA[Compiled Agents<br/>Simplified prompts]
    end

    subgraph "Lightweight Models"
        LM[Free Models<br/>mimo-v2-flash]
        RA[Robot4 Agents<br/>Minimal context]
    end

    AM --> NA
    SM --> CA
    LM --> RA
```

---

## Runtime Environments

### Overview

```mermaid
graph TB
    subgraph "Browser Runtimes"
        PY[Pyodide<br/>Python 3.11 WASM]
        QJS[QuickJS<br/>JavaScript Sandbox]
        WASM[Wasmer + Clang<br/>C Compiler]
        R4[Robot4<br/>Firmware Runtime]
    end

    subgraph "Capabilities"
        PY --> |numpy, matplotlib, scipy| SCI[Scientific Computing]
        QJS --> |Sandboxed execution| SEC[Secure JS Eval]
        WASM --> |C to WASM| COMP[Native Compilation]
        R4 --> |60Hz loop| SIM[Robot Simulation]
    end

    subgraph "Output"
        SCI --> PLOT[Plots & Visualizations]
        SEC --> APP[React Applets]
        COMP --> BIN[WASM Binaries]
        SIM --> V3D[3D Visualization]
    end
```

### Pyodide Runtime

Python execution in the browser:

```mermaid
sequenceDiagram
    participant Tool as execute-python Tool
    participant PY as Pyodide Runtime
    participant WASM as WASM Engine

    Tool->>PY: Execute code
    PY->>PY: Check initialized

    alt Not initialized
        PY->>WASM: Load Pyodide (~30MB)
        PY->>WASM: Load numpy, matplotlib
    end

    PY->>WASM: Run Python code
    WASM-->>PY: Stdout, Stderr
    PY->>PY: Capture matplotlib plots
    PY-->>Tool: ExecutionResult
```

### WASM Compiler

Browser-based C compilation:

```mermaid
sequenceDiagram
    participant Tool as compile-wasm Tool
    participant WC as WASM Compiler
    participant CDN as Wasmer CDN
    participant Clang as clang.wasm

    Tool->>WC: Compile request

    alt SDK not loaded
        WC->>CDN: Load Wasmer SDK (~30MB)
        CDN-->>WC: SDK loaded
    end

    WC->>Clang: Load clang package
    WC->>WC: Create virtual filesystem
    WC->>WC: Write source + headers

    WC->>Clang: Execute compilation
    Note over Clang: --target=wasm32-wasi<br/>-O3 optimization

    Clang-->>WC: WASM binary
    WC-->>Tool: CompileResult
```

### Robot4 Runtime

WASM4-inspired robot firmware runtime:

```mermaid
graph TB
    subgraph "Robot4 Architecture"
        FW[Firmware Code<br/>C with robot4.h]

        subgraph "API Functions"
            DR[drive(l, r)]
            DI[distance(sensor)]
            LE[led(r, g, b)]
            UP[update() @ 60Hz]
        end

        subgraph "Execution"
            LOOP[Main Loop<br/>16.6ms tick]
            SEN[Sensor Simulation]
            MOT[Motor Simulation]
            COL[Collision Detection]
        end

        subgraph "Visualization"
            TJS[Three.js Scene]
            ROB[Robot Model]
            ENV[Environment]
        end
    end

    FW --> DR
    FW --> DI
    FW --> LE
    FW --> UP

    UP --> LOOP
    LOOP --> SEN
    LOOP --> MOT
    LOOP --> COL

    MOT --> TJS
    COL --> TJS
    TJS --> ROB
    TJS --> ENV
```

---

## Hardware Integration

### ESP32 Deployment Pipeline

```mermaid
graph LR
    subgraph "Browser"
        C[C Source Code]
        COMP[Browser Compiler<br/>Clang WASM]
        BIN[WASM Binary]
    end

    subgraph "Virtual"
        SIM[Robot4 Simulator]
        TEST[Behavior Testing]
    end

    subgraph "Physical"
        USB[USB Serial]
        ESP[ESP32-S3<br/>WASMachine]
        HW[Physical Robot]
    end

    C --> COMP
    COMP --> BIN
    BIN --> SIM
    SIM --> TEST

    TEST --> |Success| USB
    USB --> ESP
    ESP --> HW

    HW --> |Telemetry| USB
```

### TCP Deployment Protocol

```mermaid
sequenceDiagram
    participant Browser
    participant TCP as TCP Client
    participant ESP as ESP32 Device

    Browser->>TCP: installWasmApp(binary)

    TCP->>TCP: Build protocol message
    Note over TCP: Leading bytes: 0x12 0x34<br/>Type: REQUEST<br/>Command: INSTALL

    TCP->>TCP: Encode metadata JSON
    Note over TCP: app_name, heap_size, size

    TCP->>TCP: Append WASM binary

    TCP->>ESP: Send via TCP:8080
    ESP->>ESP: Verify protocol
    ESP->>ESP: Save to flash
    ESP->>ESP: Load WASM app
    ESP-->>TCP: Response: success
    TCP-->>Browser: Installation complete
```

### Device Communication

```mermaid
graph TB
    subgraph "Browser"
        DM[Device Manager]
        WS[Web Serial API]
    end

    subgraph "Protocol"
        JSON[JSON Commands]
        BIN[Binary Protocol]
    end

    subgraph "ESP32"
        UART[UART Handler]
        WM[WASMachine Runtime]
        GPIO[GPIO/Sensors]
    end

    DM --> WS
    WS --> |Text| JSON
    WS --> |Binary| BIN

    JSON --> UART
    BIN --> UART

    UART --> WM
    WM --> GPIO
    GPIO --> |Telemetry| UART
```

---

## Evolution System

### Mutation Engine

```mermaid
graph TB
    subgraph "Input"
        CODE[Original Code]
        ERR[Error/Failure]
        CTX[Context]
    end

    subgraph "Mutation Engine"
        AN[Analyze Failure]
        GEN[Generate Variants]
        LENS[Apply Domain Lenses]
        FIT[Evaluate Fitness]
        SEL[Select Best]
    end

    subgraph "Output"
        NEW[Improved Code]
        SK[New Skill]
    end

    CODE --> AN
    ERR --> AN
    CTX --> AN

    AN --> GEN
    GEN --> LENS
    LENS --> |Multiple variants| FIT
    FIT --> SEL
    SEL --> NEW
    SEL --> SK
```

### Evolution Loop

```mermaid
sequenceDiagram
    participant Agent
    participant MutationEngine
    participant Simulator
    participant SkillStore

    Agent->>MutationEngine: Code failed

    loop Generate Variants
        MutationEngine->>MutationEngine: Apply lens mutations
        MutationEngine->>Simulator: Test variant
        Simulator-->>MutationEngine: Fitness score
    end

    MutationEngine->>MutationEngine: Select fittest
    MutationEngine->>SkillStore: Store successful pattern
    MutationEngine-->>Agent: Return best variant
```

### Lens Evolution

Domain lenses evolve through:

```mermaid
graph LR
    subgraph "Lens Operations"
        CROSS[Crossover<br/>Combine successful lenses]
        MUT[Mutation<br/>Random variations]
        CULL[Culling<br/>Remove poor performers]
    end

    subgraph "Lens Types"
        QC[Quantum Computing]
        ROB[Robotics]
        BIO[Bioinformatics]
        FIN[Finance]
    end

    QC --> CROSS
    ROB --> CROSS
    CROSS --> MUT
    MUT --> CULL
    CULL --> |Next generation| QC
    CULL --> |Next generation| ROB
```

---

## Tool System

### Tool Categories

```mermaid
graph TB
    subgraph "File Operations"
        RF[read-file]
        WF[write-file]
        LF[list-files]
        DF[delete-file]
    end

    subgraph "Code Execution"
        EP[execute-python]
        GA[generate-applet]
        CW[compile-wasm]
    end

    subgraph "Agent Operations"
        DSA[delegate-to-sub-agent]
        QM[query-memory]
        CA[create-agent]
    end

    subgraph "Hardware Tools"
        DWA[deploy-wasm-app]
        QWA[query-wasm-apps]
        UWA[uninstall-wasm-app]
        CD[connect-device]
        SDC[send-device-command]
    end

    subgraph "Project Management"
        CP[create-project]
        CDP[create-device-project]
    end
```

### Tool Execution Architecture

```mermaid
sequenceDiagram
    participant LLM
    participant Orchestrator
    participant ToolSystem
    participant Runtime
    participant VFS

    LLM->>Orchestrator: Tool call JSON
    Orchestrator->>ToolSystem: executeSystemTool()

    alt File Operation
        ToolSystem->>VFS: Read/Write/List
        VFS-->>ToolSystem: File data
    else Code Execution
        ToolSystem->>Runtime: Execute code
        Runtime-->>ToolSystem: Execution result
    else Hardware Operation
        ToolSystem->>Runtime: Deploy/Query
        Runtime-->>ToolSystem: Device response
    end

    ToolSystem-->>Orchestrator: Tool result
    Orchestrator-->>LLM: Continue with result
```

---

## State Management

### State Architecture

```mermaid
graph TB
    subgraph "React Context"
        WC[WorkspaceContext<br/>Layout & Agent State]
        AC[AppletContext<br/>Applet Lifecycle]
        PC[ProjectContext<br/>Project State]
    end

    subgraph "Zustand Stores"
        AS[Artifact Store]
        CS[Console Store]
        APS[Applet Store]
    end

    subgraph "Singletons"
        VFS[VirtualFileSystem]
        LLM[LLMClient]
        SAO[SystemAgentOrchestrator]
    end

    subgraph "Persistence"
        LS[localStorage]
        IDB[IndexedDB]
    end

    WC --> LS
    AC --> AS
    PC --> VFS

    AS --> IDB
    CS --> LS
    APS --> LS

    VFS --> LS
    LLM --> LS
```

### State Flow

```mermaid
sequenceDiagram
    participant UI as React UI
    participant Context as Contexts
    participant Store as Zustand Stores
    participant VFS as Virtual FS
    participant Storage as localStorage

    UI->>Context: Update state
    Context->>Store: Sync changes

    Store->>VFS: Persist artifacts
    VFS->>Storage: Write to localStorage

    Storage-->>VFS: Confirmed
    VFS-->>Store: Persist complete
    Store-->>Context: State updated
    Context-->>UI: Re-render
```

---

## Data Flow

### Complete Request Cycle

```mermaid
sequenceDiagram
    participant User
    participant ChatUI
    participant SAO as System Agent Orchestrator
    participant LLM as OpenAI-compatible API
    participant Tools as Tool System
    participant Runtime as Runtimes
    participant VFS as Virtual FS
    participant Display as UI Display

    User->>ChatUI: "Create a wall-avoiding robot"
    ChatUI->>SAO: Process message

    SAO->>LLM: System prompt + message
    LLM-->>SAO: Tool: generate-wasm-app

    SAO->>Tools: Execute tool
    Tools->>Runtime: Compile C to WASM
    Runtime->>VFS: Write binary
    Runtime-->>Tools: Compile result

    alt Compilation Error
        Tools-->>SAO: Error result
        SAO->>LLM: Error + retry
        LLM-->>SAO: Tool: fix-wasm-app
        SAO->>Tools: Execute fix
        Tools->>Runtime: Recompile
    end

    Tools-->>SAO: Success
    SAO->>LLM: Continue
    LLM-->>SAO: Tool: spawn-robot

    SAO->>Tools: Execute spawn
    Tools->>Runtime: Start Robot4 simulator
    Runtime->>Display: Render 3D scene

    Tools-->>SAO: Robot running
    SAO->>LLM: Final response
    LLM-->>SAO: Summary message
    SAO-->>ChatUI: Display response
    ChatUI-->>User: "Robot created and running!"
```

### Artifact Creation Flow

```mermaid
graph LR
    subgraph "Input"
        REQ[User Request]
    end

    subgraph "Processing"
        LLM[LLM Generation]
        TOOL[Tool Execution]
        RT[Runtime Processing]
    end

    subgraph "Storage"
        VFS[Virtual FS]
        ART[Artifact Store]
    end

    subgraph "Output"
        FILE[File in Tree]
        VIS[Visualization]
        HW[Hardware Deploy]
    end

    REQ --> LLM
    LLM --> TOOL
    TOOL --> RT
    RT --> VFS
    RT --> ART
    VFS --> FILE
    ART --> VIS
    VFS --> HW
```

---

## Security Considerations

### Sandboxed Execution

```mermaid
graph TB
    subgraph "Browser Sandbox"
        subgraph "WASM Isolation"
            PY[Pyodide<br/>No network access]
            QJS[QuickJS<br/>Limited APIs]
            CLANG[Clang<br/>Virtual filesystem only]
        end

        subgraph "Storage Isolation"
            LS[localStorage<br/>Origin-bound]
            IDB[IndexedDB<br/>Origin-bound]
        end
    end

    subgraph "API Security"
        KEY[API Keys<br/>Encrypted in storage]
        LLMAPI[LLM API<br/>HTTPS only]
        GH[GitHub<br/>OAuth tokens]
    end

    PY --> LS
    QJS --> LS
    KEY --> LLMAPI
    KEY --> GH
```

### Key Security Features

- **No Server-Side Code Execution** - All code runs in browser sandboxes
- **WASM Isolation** - Runtimes cannot access arbitrary system resources
- **Origin-Bound Storage** - Data isolated per domain
- **HTTPS Only** - All external API calls use TLS
- **No Eval** - JavaScript execution uses QuickJS sandbox, not native eval

### Execution Timeouts

```mermaid
graph LR
    CODE[User Code] --> TIMEOUT{Timeout<br/>30 seconds}
    TIMEOUT --> |Success| RESULT[Return Result]
    TIMEOUT --> |Exceeded| ERROR[Timeout Error]
```

---

## Performance Characteristics

| Component | First Load | Subsequent |
|-----------|-----------|------------|
| Pyodide | ~30MB, 5-10s | Instant (cached) |
| Wasmer SDK | ~30MB, 5-10s | Instant (cached) |
| WASM Compilation | 2-5s | 1-3s |
| Robot4 Simulation | <100ms | <100ms |
| File Operations | <10ms | <10ms |

### Optimization Strategies

- **Lazy Loading** - Heavy runtimes load on first use
- **CDN Caching** - WASM modules cached by browser
- **Virtual FS Caching** - LRU cache for frequently accessed files
- **Incremental Updates** - Only changed artifacts re-rendered

---

## Dependencies

### Core Dependencies

```json
{
  "next": "^14.0.0",
  "react": "^18.2.0",
  "pyodide": "^0.29.0",
  "@wasmer/sdk": "^0.10.0",
  "quickjs-emscripten": "^0.29.2",
  "@monaco-editor/react": "^4.6.0",
  "@react-three/fiber": "^8.15.0",
  "isomorphic-git": "^1.27.1",
  "zustand": "^4.5.0"
}
```

### Browser Requirements

- **Chrome 90+** / **Firefox 90+** / **Safari 15+**
- **WebAssembly** support required
- **Web Serial API** for hardware (Chrome only)
- **SharedArrayBuffer** for optimal performance

---

## Future Architecture

### Planned Improvements

```mermaid
graph TB
    subgraph "Current"
        LS[localStorage<br/>5-10MB limit]
        SYNC[Single-user]
    end

    subgraph "Planned"
        OPFS[Origin Private FS<br/>Unlimited storage]
        COLLAB[Real-time Collaboration<br/>Y.js CRDT]
        WW[Web Workers<br/>Background runtimes]
        SW[Service Worker<br/>Offline support]
    end

    LS --> OPFS
    SYNC --> COLLAB

    subgraph "Hardware Evolution"
        ESP32[ESP32-S3]
        SWARM[Swarm Intelligence]
        TELEMETRY[Telemetry Loop]
    end

    ESP32 --> SWARM
    SWARM --> TELEMETRY
    TELEMETRY --> ESP32
```

---

## Related Documentation

- **README.md** - Project overview and quick start
- **docs/hardware/ESP32_COMPLETE_TUTORIAL.md** - Hardware integration guide
- **docs/guides/** - User guides and tutorials
- **docs/architecture/** - Technical architecture documentation
- **docs/ui/** - UI-specific documentation
- **volumes/system/skills/** - Learned skill definitions

---

*Last Updated: January 2026*
