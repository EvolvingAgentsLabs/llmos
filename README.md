# LLMos

## Loop-Native Bytecode for Physical AI Agents

<div align="center">

![Status](https://img.shields.io/badge/Status-Active%20Research-red)
![Hardware](https://img.shields.io/badge/Target-ESP32%20S3-green)
![Runtime](https://img.shields.io/badge/Runtime-Distributed%20LLMBytecode-blue)
![License](https://img.shields.io/badge/License-Apache%202.0-lightgrey)

**LLMos explores a new execution model for physical AI agents:
LLMs generating loop-native bytecode that drives real microcontrollers.**

</div>

---

# ⚠️ Project Status

LLMos is under **active development and architectural refactoring**.

* The repository contains working simulation, firmware, HAL, and dual-brain runtime components.
* The structured protocol currently used between host and microcontroller acts as a **distributed LLM bytecode runtime**.
* The architecture is evolving toward a formalized embedded bytecode interpreter and eventually direct binary generation.
* Some parts of the repository reflect earlier iterations and may not match the latest architectural direction.

This is a **research-grade system**, not a production robotics framework.

---

# What Is LLMos?

LLMos is an experimental operating environment for **LLM-driven physical agents**.

It is built around a simple but non-traditional thesis:

> Large Language Models should generate deterministic execution instructions for physical agents — not high-level human-oriented code.

Instead of:

```
Intent → LLM → Python/C → Compiler → Binary → Robot
```

LLMos explores:

```
Intent → LLM → LLMBytecode → Runtime → Robot
```

Where the runtime executes a structured, loop-native instruction protocol that drives real hardware.

---

# Core Idea: Loop-Native LLM Bytecode

The system currently operates as a **distributed virtual machine**:

1. The LLM runs on a host machine.
2. It generates structured instructions.
3. These instructions are transmitted to the microcontroller.
4. The microcontroller runtime interprets and executes them.
5. Sensor state and execution results are fed back.
6. The loop repeats.

This structured instruction protocol already functions as:

> **LLMBytecode v0 (Distributed Runtime Version)**

It contains:

* Instruction semantics
* Variable updates
* State transitions
* Closed-loop execution structure
* External input injection (sensor readings)
* Deterministic execution on the MCU

The protocol is not human-readable high-level code.
It is not C.
It is not assembly.
It behaves as **bytecode executed by an embedded runtime**.

---

# Why This Matters

Traditional programming languages assume open-loop execution:

```
Write code → Compile → Run
```

Physical agents operate in closed loops:

```
Perceive → Update State → Decide → Act → Observe → Repeat
```

LLMos encodes this loop explicitly.

Each execution cycle includes:

* Goal
* History
* Internal State
* World Model
* Sensor Inputs
* Previous Tool Results
* Deterministic Fallback Logic

The LLM emits the next instruction frame.
The firmware executes deterministically.
The environment feeds back.
The loop continues.

This loop-native execution model is the foundation for the next step:
formal bytecode and eventual binary emission.

---

# Current Architecture

## 1. Distributed LLMBytecode Runtime (v0)

* Structured instruction protocol over serial
* Microcontroller runtime interprets instructions
* Deterministic safety validation before actuation
* Host-side LLM inference

This already behaves as a distributed VM.

---

## 2. Dual-Brain Cognitive System

LLMos uses a two-layer reasoning model:

**Instinct Brain**

* Fast multimodal inference (~200–500ms)
* Reactive behavior (avoidance, tracking)

**Planner Brain**

* RSA-enhanced deeper reasoning (3–8s)
* Strategy generation
* Multi-step planning

Both feed into the bytecode generation layer.

---

## 3. Hardware Abstraction Layer (HAL)

The HAL ensures:

* The same instructions work in simulation and hardware
* Motor limits and safety constraints are validated
* Deterministic enforcement before actuation

---

## 4. Firmware Runtime (ESP32-S3)

The microcontroller binary:

* Does NOT run the LLM
* Runs an execution runtime
* Interprets structured LLM instructions
* Maintains execution state
* Communicates feedback to host

This is the embryo of the future embedded bytecode interpreter.

---

# Technical Stack (Current Codebase)

Frontend / Desktop:

* Next.js
* Electron
* Three.js Simulation

Runtime:

* TypeScript
* Python (host inference)
* WebAssembly modules

Firmware:

* C++ (ESP32-S3)
* Serial protocol runtime
* Deterministic validation layer

LLM:

* Qwen3-VL-8B (multimodal)
* RSA reasoning engine

---

# Roadmap

## Phase 0 — Distributed Instruction Runtime (Current)

LLM → Structured Protocol → Firmware Runtime
✅ Implemented

The protocol acts as LLMBytecode v0.

---

## Phase 1 — Formal LLMBytecode Specification

* Define minimal instruction categories
* Formal grammar/schema
* State model definition
* Validation rules
* Safety invariants

🔄 In Progress

---

## Phase 2 — Embedded LLMBytecode Interpreter

* Move structured execution into a formal VM
* Define opcode table
* Replace ad-hoc protocol logic
* Deterministic execution core on MCU

Planned

---

## Phase 3 — Static LLMBytecode Compilation

* Pre-validated instruction blocks
* Reduced runtime overhead
* Safer bounded execution frames

Planned

---

## Phase 4 — Native Binary Generation

* LLM emits machine-level instruction blocks
* Remove intermediate human-oriented code generation
* Direct firmware synthesis

Research Stage

---

# Research Direction

LLMos sits at the intersection of:

* LLM-native programming languages
* Deterministic embedded runtimes
* Closed-loop embodied agents
* Edge inference systems
* Formal safety constraints for AI-driven hardware

The long-term objective is not to replace C with English.

It is to define:

> An agent-native execution model where LLMs generate deterministic machine-driving instructions.

---

# Contributing

This is a research system.

Expect:

* Architectural changes
* Refactors
* Breaking changes
* Experimental modules

Areas of contribution:

* Instruction set formalization
* Embedded interpreter design
* Firmware safety invariants
* Loop validation systems
* Bytecode specification
* Testing & simulation consistency

---

# License

Apache 2.0
Built by Evolving Agents Labs.

---

If you want, next we can:

* Write a separate `LLMBYTECODE_SPEC.md`
* Or define the minimal opcode table (first concrete ISA draft)
* Or formalize the execution frame schema (which is the real innovation)
