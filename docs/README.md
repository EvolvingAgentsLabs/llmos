---
layout: default
title: Home
nav_order: 0
permalink: /
---

# Building Robot Minds: A Practical Guide to LLM-Powered Physical Agents

![A small wheeled robot at the center of a glowing circuit-board landscape with holographic layers](assets/index.png)

<!-- IMAGE_PROMPT: Isometric digital illustration, clean technical style, dark navy (#0d1117) background, soft neon accent lighting in cyan and magenta, a small wheeled robot with a glowing blue eye sensor as recurring character, flat vector aesthetic with subtle depth, no photorealism, 16:9 aspect ratio. A small wheeled robot at the center of a glowing circuit-board landscape. Above it, translucent exploded-view layers: an occupancy grid, neural network pattern, camera lens, and markdown documents as holographic pages. Title "Building Robot Minds" as clean sans-serif text. -->

> A technical book accompanying the [LLMos](https://github.com/EvolvingAgentsLabs/llmos) project.

---

## What This Book Covers

Most robotics textbooks start with kinematics, PID controllers, and SLAM algorithms.
This book starts with a different question: what happens when you give a robot a large
language model as its brain? Not as a chatbot bolted onto a rover, but as the actual
kernel -- the central decision-making system that perceives, reasons, plans, and acts
in the physical world.

LLMos is an operating system built around this idea. It uses a dual-LLM architecture
where a cloud-hosted model (Claude Opus 4.6) develops and evolves robot behaviors at
design time, while a local vision-language model (Qwen3-VL-8B) runs the robot in
real time. Between them sits a complete navigation stack: occupancy grids, A*
pathfinding, candidate generation, vision pipelines, fleet coordination, and a
hardware abstraction layer that runs identically on a Three.js simulation and an
ESP32 microcontroller. The system has 349 tests and has been validated end-to-end
with real LLM inference.

This book walks through every layer of the system, from the philosophical thesis
("LLM as kernel") down to the TypeScript implementation. It is written for engineers
who want to build LLM-powered physical agents -- not toy demos, but systems that
handle stuck detection, fallback strategies, world model corrections, and multi-robot
coordination. If you have experience with TypeScript and a passing familiarity with
robotics concepts, you have everything you need to follow along.

---

## Quick Start

**If you want to understand the philosophy first:**
Start with [Chapter 1: The Thesis](01-the-thesis.md), then [Chapter 2: Two Brains](02-dual-llm-architecture.md).

**If you want to see the navigation system:**
Jump to [Chapter 3: The World Model](03-world-model.md) and [Chapter 4: The Navigation Loop](04-navigation-loop.md).

**If you want to run something immediately:**
Go straight to [Chapter 13: Getting Started](13-getting-started.md) for your first 10 minutes with LLMos.

**If you want to understand the hardware side:**
Read [Chapter 7: The HAL](07-hal-and-hardware.md), then [Chapter 15: V1 Hardware Deployment](15-v1-hardware-deployment.md).

**If you want to understand the agent/skill system:**
Start with [Chapter 8: Agents and Skills](08-agents-and-skills.md).

---

## Chapters

| # | Chapter | What You Will Learn |
|---|---------|---------------------|
| 1 | [The Thesis: LLM as Kernel](01-the-thesis.md) | Why the traditional robotics pipeline breaks down with LLMs, and what replaces it |
| 2 | [Two Brains: Development and Runtime](02-dual-llm-architecture.md) | Why LLMos uses two different LLMs and how they divide the work |
| 3 | [The World Model: How a Robot Thinks About Space](03-world-model.md) | The 50x50 occupancy grid, serialization formats, and the three-layer world representation |
| 4 | [The Navigation Loop: 13 Steps from Sensor to Motor](04-navigation-loop.md) | The complete cycle from sensor input to motor output, one step at a time |
| 5 | [The Dual Brain: Instinct, Planning, and Escalation](05-dual-brain-controller.md) | Fast instinct decisions vs. slow deliberate planning, and when to switch |
| 6 | [Seeing the World: Camera to Grid](06-vision-pipeline.md) | How camera frames become occupancy grid cells through the vision pipeline |
| 7 | [The HAL: One Interface, Two Worlds](07-hal-and-hardware.md) | The hardware abstraction layer that makes simulation and physical robots interchangeable |
| 8 | [Agents, Skills, and the Markdown OS](08-agents-and-skills.md) | How LLMos uses markdown files as executable programs and agents as processes |
| 9 | [Predictive Intelligence: Thinking Before Acting](09-predictive-intelligence.md) | Spatial heuristics that predict unseen space before the robot gets there |
| 10 | [Fleet Coordination: Multiple Robots, One World](10-fleet-coordination.md) | Shared world models, task assignment, and conflict resolution across robots |
| 11 | [The Evolution Engine: Robots That Dream](11-evolution-engine.md) | How LLMos evolves robot behaviors through automated evaluation and skill promotion |
| 12 | [349 Tests: Proving the System Works](12-testing.md) | The testing philosophy and how every layer is validated without real hardware |
| 13 | [Getting Started: Your First 10 Minutes](13-getting-started.md) | Install, run, and see navigation results in under 10 minutes |
| 14 | [What's Next: From Research to Reality](14-whats-next.md) | The roadmap from simulation to physical deployment |
| 15 | [V1 Hardware Deployment: From Code to Robot](15-v1-hardware-deployment.md) | Physical assembly, protocol validation, and first autonomous navigation |

---

## Technical Prerequisites

To follow along with the code and run the examples, you will need:

- **Node.js 18+** and **npm** -- the entire system runs on the Node.js runtime
- **TypeScript** familiarity -- LLMos is written entirely in TypeScript (strict mode)
- **Git** -- to clone the repository and follow along with the code

For running with real LLM inference (optional, not required for the book):

- **OpenRouter API key** -- for cloud-based inference with Qwen3-VL-8B or Claude
- **GPU with 8GB+ VRAM** -- if running the runtime LLM locally instead of via API

For physical robot deployment (covered in [Chapter 15](15-v1-hardware-deployment.md)):

- **ESP32-S3-DevKitC-1** -- Motor controller (WiFi UDP on port 4210)
- **ESP32-CAM (AI-Thinker)** -- Camera (WiFi HTTP MJPEG on port 80)
- **2x 28BYJ-48 stepper motors** + **2x ULN2003 drivers** -- Differential drive
- **V1 Stepper Cube chassis** -- 8cm 3D-printed cube (see `Agent_Robot_Model/Readme.md`)
- **5V 2A USB-C power supply** -- Powers both ESP32s and motors

All navigation demos can run with a mock LLM (no API key needed):

```bash
npm install
npx tsx scripts/run-navigation.ts --all --verbose
```

---

## How to Read This Book

The chapters are ordered from abstract to concrete. Chapters 1-2 establish the
philosophy and architecture. Chapters 3-7 walk through the core navigation stack,
one component at a time. Chapters 8-11 cover higher-level systems built on that
foundation. Chapters 12-14 are practical: testing, getting started, and the roadmap.

You do not need to read linearly. Each chapter opens with a conceptual hook, explains
the theory, walks through the implementation with code references, highlights the key
TypeScript types and functions, and closes with a summary linking to the next chapter.
If you already understand the concept, skip to the implementation section. If you just
want the code, look for the "Key Code" headers.

The book references specific files throughout. All paths are relative to the repository
root. When a chapter says `lib/runtime/navigation-loop.ts`, you can open that file
and see the exact code being discussed.

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Total tests | 346+ |
| Test suites | 21 |
| Navigation criteria passed (live LLM) | 6/6 |
| Average navigation cycle time | ~1.4s/cycle |
| World model grid size | 50x50 cells at 10cm resolution |
| Supported action types | 5 (MOVE_TO, EXPLORE, ROTATE_TO, FOLLOW_WALL, STOP) |
| HAL subsystems | 5 (locomotion, vision, manipulation, communication, safety) |
| Test arenas | 4 predefined configurations |
| V1 Robot wheel diameter | 6.0 cm |
| V1 Robot max speed | 1024 steps/s (~4.71 cm/s) |
| V1 Motor precision | 4096 steps/revolution |

---

## About This Book

This is a living document that accompanies the LLMos GitHub repository. As the
codebase evolves, so does this book. Each chapter references specific source files
with line-level precision -- when the code changes, the relevant chapters are updated
to match.

The book does not attempt to be a general robotics textbook or an LLM tutorial. It is
a focused, practical guide to one specific system: LLMos. The ideas are transferable,
but the implementation details are concrete. Every code snippet comes from the actual
codebase, every architecture diagram reflects real module boundaries, and every test
count reflects real test output.

LLMos is built and maintained by [Evolving Agents Labs](https://github.com/EvolvingAgentsLabs).

The book covers 15 chapters: from the philosophical thesis (LLM as kernel) through
the complete navigation stack to physical hardware deployment with the V1 Stepper
Cube Robot.

---

*Next: [Chapter 1 -- The Thesis: LLM as Kernel](01-the-thesis.md)*
