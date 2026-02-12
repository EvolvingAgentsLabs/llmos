# LLMos — Loop-Native Bytecode for Physical AI Agents

<div align="center">

![Status](https://img.shields.io/badge/Status-Active%20Research-red)
![Hardware](https://img.shields.io/badge/Target-ESP32%20S3-green)
![Runtime](https://img.shields.io/badge/Runtime-Distributed%20LLMBytecode-blue)
![License](https://img.shields.io/badge/License-Apache%202.0-lightgrey)

**LLMs should not generate human code for robots.
They should generate machine-native bytecode that drives real hardware in closed loops.**

[GitHub](https://github.com/EvolvingAgentsLabs/llmos) · [Contributing](#contributing) · [Roadmap](#roadmap)

</div>

---

## ⚠️ Project Status

LLMos is under **active development and architectural refactoring**.

- The repository contains working simulation, firmware, HAL, and dual-brain runtime components.
- The structured protocol between host and microcontroller already functions as a **distributed LLM bytecode runtime**.
- The architecture is evolving toward a formalized embedded bytecode interpreter and eventually direct binary generation.
- Some parts of the repository reflect earlier iterations and may not match the latest architectural direction.

This is a **research-grade system**, not a production robotics framework.

---

## The Thesis

Every LLM robotics project today follows the same pipeline:

```
Human Intent → LLM → Python/C → Compiler → Binary → Robot
```

This pipeline was designed for humans writing code. The LLM is forced to produce artifacts optimized for human readability — classes, inheritance, design patterns — then a compiler translates them into what the machine actually needs. The LLM is doing extra work to speak a language that was never designed for it, and the machine is doing extra work to undo those abstractions.

LLMos inverts this:

```
Human Intent → LLM → LLMBytecode → Runtime → Robot
```

The LLM generates structured, deterministic execution instructions that a microcontroller runtime interprets directly. No intermediate human-readable code. No compilation step. No object-oriented abstractions that serve human cognition but add nothing for machine execution.

**Object-oriented programming is a human abstraction. Low-level procedural flow with a small instruction set is what both LLMs and microcontrollers actually work with best.**

---

## Why This Matters

Traditional programming languages assume open-loop execution:

```
Write code → Compile → Run → Done
```

Physical agents do not work this way. They operate in closed loops:

```
Perceive → Update State → Decide → Act → Observe Result → Repeat
```

No existing programming language is designed around this cycle as its fundamental unit of execution. LLMos is.

Each execution cycle contains:

| Element | Description |
|---|---|
| **Goal** | What the agent is trying to achieve |
| **History** | Last N cycles providing temporal context |
| **Internal State** | Variables representing the agent's beliefs, updated each cycle |
| **World Model** | Internal spatial/environmental representation (critical for robots) |
| **Sensor Inputs** | Current physical readings — the agent's "sensory neurons" |
| **Previous Action Results** | Outcomes from last cycle's commands — the agent's "motor neuron" feedback |
| **Fallback Logic** | Deterministic state-maintenance computations that run when LLM inference fails or errors |

All of this is serialized and injected as input to the LLM. The LLM emits the next instruction frame: commands with parameters, state predictions, updated world model. The firmware executes deterministically. The environment feeds back. A new cycle begins.

This loop-native execution model is not an add-on. It is the foundation.

---

## Core Concept: LLMBytecode

The system currently operates as a **distributed virtual machine**:

1. The LLM runs on a host machine.
2. It generates structured instructions (not human-readable code).
3. Instructions are transmitted to the microcontroller over serial.
4. The microcontroller runtime interprets and executes them.
5. Sensor state and execution results are fed back to the host.
6. The loop repeats.

This structured instruction protocol already functions as **LLMBytecode v0** — a distributed runtime version. It contains:

- Instruction semantics (motor commands, sensor reads, LED control, timing)
- Variable updates (state mutation within the cycle)
- State transitions (mode changes, goal updates)
- Closed-loop execution structure (every frame assumes the loop continues)
- External input injection (sensor readings enter at defined points)
- Deterministic execution guarantees on the MCU side
- Safety validation before any actuation

The protocol is not human-readable high-level code. It is not C. It is not assembly. It behaves as **bytecode executed by an embedded runtime**.

---

## Key Finding: The Model-Size Boundary

Building LLMos has produced an empirical finding that informs the entire architecture:

> **The balance between hardcoded tool logic and LLM-generated bytecode is a function of model capability.**

When the model is small (4B parameters), the system must rely heavily on pre-built, hardcoded tool implementations. The LLM contributes high-level sequencing — *what* to do and *when* — but the *how* is locked in compiled firmware routines.

As model size increases (8B+), the LLM can reliably generate more of the low-level control flow itself, taking over increasingly fine-grained behavioral control.

This creates a **sliding scale**, not a binary choice. LLMBytecode must be designed to accommodate both ends: a minimal instruction set that small models can use to orchestrate pre-built tools, and a richer instruction space that larger models can use to express novel behaviors.

---

## Architecture

### 1. Distributed LLMBytecode Runtime (v0)

The current implementation:

- Structured instruction protocol over serial connection
- Microcontroller runtime parses, validates, and executes instructions
- Deterministic safety enforcement before any motor actuation
- Host-side LLM inference with full sensory context injection

This already behaves as a distributed VM where the LLM is the program generator and the MCU is the execution engine.

### 2. Dual-Brain Cognitive System

LLMos uses a two-layer reasoning architecture:

**Instinct Brain** — Fast multimodal inference (~200–500ms). Handles reactive behaviors: obstacle avoidance, wall following, object tracking. Single-pass Qwen3-VL-8B processing of camera frames and sensor data. This is the "reflex arc."

**Planner Brain** — RSA-enhanced deeper reasoning (3–8s). Handles strategy: exploration planning, skill generation, swarm coordination, recovery from novel situations. This is the "prefrontal cortex."

Both brains feed into the bytecode generation layer. The instinct brain can override the planner when immediate physical safety demands it.

### 3. Hardware Abstraction Layer (HAL)

The HAL ensures that:

- The same LLMBytecode instructions work identically in simulation and on real hardware
- Motor limits, voltage constraints, and timing boundaries are validated before execution
- Deterministic safety invariants are enforced regardless of what the LLM generates
- New hardware targets can be added without changing the bytecode specification

### 4. Firmware Runtime (ESP32-S3)

The microcontroller does **not** run the LLM. It runs an execution runtime that:

- Interprets structured LLM instructions received over serial
- Maintains local execution state between cycles
- Enforces safety constraints at the hardware boundary
- Communicates sensor readings and execution results back to the host
- Executes deterministic fallback logic when host communication is interrupted

This runtime is the embryo of the future embedded bytecode interpreter.

---

## The Execution Frame

Every cycle, the LLM receives a serialized execution frame and emits the next one. The frame is the atomic unit of LLMos computation:

```
┌─────────────────────────────────────────────────────────┐
│                    EXECUTION FRAME                       │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐ │
│  │  GOAL   │ │ HISTORY │ │  STATE   │ │ WORLD MODEL │ │
│  └─────────┘ └─────────┘ └──────────┘ └─────────────┘ │
│  ┌──────────────────┐ ┌──────────────────────────────┐ │
│  │  SENSOR READINGS │ │  PREVIOUS ACTION RESULTS     │ │
│  └──────────────────┘ └──────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐  │
│  │  FALLBACK STATE (deterministic error recovery)   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
                    LLM INFERENCE
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    OUTPUT FRAME                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  NEXT INSTRUCTIONS (commands + parameters)       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  STATE PREDICTIONS (updated beliefs)             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  WORLD MODEL UPDATE (spatial/environmental)      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                    FIRMWARE RUNTIME
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     ┌────────────────┐   ┌────────────────┐
     │ ACTUATORS       │   │ SENSORS        │
     │ (motor neurons) │   │ (sensory       │
     │                 │   │  neurons)       │
     └────────────────┘   └───────┬────────┘
                                  │
                         [Feed into next frame]
```

---

## Relationship to Emerging Research

LLMos sits at the intersection of several converging research directions:

**LLM OS thesis** (Karpathy, 2023–2025) — LLMs as kernel processes of a new operating system. Karpathy described token streams as "assembly-level execution traces" and, in his 2025 review, used the term "cognitive microcontrollers." LLMos extends this metaphor to literal microcontrollers: the LLM kernel generates instructions that a physical MCU executes.

**LLM-native programming languages** — Experimental work (Haslehurst, 2025) showed that when LLMs are asked to design their own optimal language, they converge toward assembly-like structures with short English mnemonics — not toward Python or natural language. This validates our intuition that human-oriented languages add overhead for LLM code generation.

**Interpreted vs. compiled LLM paradigm** (Verou, 2025) — The distinction between storing a prompt for repeated execution (interpreted) vs. using the LLM once to generate a deterministic program (compiled). LLMBytecode is explicitly "compiled": each cycle, the LLM generates a concrete instruction frame that executes deterministically. The probabilistic reasoning happens in the LLM; the execution is predictable.

**Edge LLM inference** (BitNet, TinyLlama, Qwen-nano) — Ongoing model compression research making on-device inference feasible. As models shrink enough to run on edge hardware, the distributed VM architecture of LLMos can progressively collapse into a single device — the LLM and its bytecode interpreter colocated on the same board.

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Desktop / Frontend** | Next.js, Electron, Three.js (simulation) |
| **Host Runtime** | TypeScript, Python (LLM inference) |
| **LLM** | Qwen3-VL-8B (multimodal), RSA reasoning engine |
| **Firmware** | C++ (ESP32-S3), serial protocol runtime, deterministic validation |
| **Bytecode Runtime** | Structured instruction interpreter on MCU |

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| **Phase 0** | Distributed Instruction Runtime — LLM → Structured Protocol → Firmware | ✅ Implemented |
| **Phase 1** | Formal LLMBytecode Specification — instruction categories, grammar, state model, safety invariants | 🔄 In Progress |
| **Phase 2** | Embedded LLMBytecode Interpreter — formal VM on MCU with opcode table, replacing ad-hoc protocol | 🔜 Planned |
| **Phase 3** | Static LLMBytecode Compilation — pre-validated instruction blocks, reduced runtime overhead, bounded execution frames | Planned |
| **Phase 4** | Native Binary Generation — LLM emits machine-level instruction blocks, removing all intermediate human-oriented representation | Research |

---

## Contributing

LLMos is a research system. Expect architectural changes, refactors, breaking changes, and experimental modules.

**Areas of contribution:**

- LLMBytecode instruction set formalization
- Embedded interpreter design and optimization
- Firmware safety invariant specification
- Loop validation and cycle-consistency testing
- Bytecode specification drafting
- Simulation-to-hardware consistency verification
- New sensor/actuator HAL definitions

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Next Steps

The following artifacts are planned as companion documents:

- **`LLMBYTECODE_SPEC.md`** — Formal specification of the bytecode instruction set, encoding format, and validation rules
- **`EXECUTION_FRAME_SCHEMA.md`** — JSON/binary schema for the execution frame — the real innovation of LLMos
- **`OPCODE_TABLE.md`** — First concrete ISA draft: minimal opcode set mapping to ESP32-S3 capabilities

---

## License

Apache 2.0 — Built by [Evolving Agents Labs](https://github.com/EvolvingAgentsLabs).

---

<div align="center">

**The LLM does not need to think in human code.
It needs to think in machine code.
We are building the bridge.**

</div>
