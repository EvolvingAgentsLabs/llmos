# Chapter 8: Agents, Skills, and the Markdown OS

Most operating systems are written in C. Their kernels are compiled binaries. Their
configuration lives in opaque registries or arcane dot-files. LLMos is different. Its
kernel is markdown. Its agents are markdown. Its skills, memory, configuration, and
orchestration rules are all structured text files with YAML frontmatter and prose
bodies. This is not a limitation. It is the central architectural decision that makes
the system self-modifying: an LLM can read, understand, and rewrite every component
of the operating system using the same tools it uses to write any other text.

---

## Everything is Markdown

In a traditional system, behavior lives in compiled code. Changing behavior requires
modifying source, running a build, deploying, and restarting. In LLMos, behavior lives
in markdown files. Changing behavior means writing a new paragraph. The change takes
effect immediately. There is no build step.

This works because the LLM does not compile markdown into instructions. It reads
markdown and follows it the way a human follows a recipe. The agent definition IS the
documentation IS the execution specification.

The system is organized around three artifact types:

- **Agents**: Markdown files that define a persona, capabilities, tools, and prompt.
- **Skills**: Markdown files encoding reusable domain knowledge.
- **Kernel rules**: Markdown files defining system-level behavior.

---

## Agent Definitions

An agent is a markdown file with YAML frontmatter followed by a system prompt. Here is
the Hardware Control Agent at `public/volumes/system/agents/HardwareControlAgent.md`:

```markdown
---
name: Hardware Control Agent
type: agent
category: hardware
capabilities:
  - ESP32-S3 device control
  - Real-time sensor monitoring
  - GPIO state management
  - I2C/SPI communication
libraries:
  - Web Serial API
  - JSON protocol
version: 1.0.0
---

# Hardware Control Agent

Expert agent for controlling ESP32-S3 microcontrollers via Web Serial API.

## Role
Bridge between user intentions and hardware I/O. Translates natural
language requests into device commands and interprets sensor data.
```

The frontmatter declares identity, searchable capabilities, libraries, and version. The
body is the system prompt: when the SystemAgent invokes this agent, it reads this file
and follows its instructions.

The system ships with 13 agents in `public/system/agents/`:

| Agent | Role |
|-------|------|
| SystemAgent | Master orchestrator |
| PlanningAgent | Task decomposition |
| MutationAgent | Code modification and evolution |
| ReactiveRobotAgent | Real-time reactive robot control |
| RobotAIAgent | AI-driven robot behavior |
| StructuredRobotAgent | Structured output for robot commands |
| ExecutionStrategyAgent | Model-aware execution planning |
| MemoryAnalysisAgent | Past experience analysis |
| MemoryConsolidationAgent | Short-term to long-term compression |
| PatternMatcherAgent | Semantic pattern detection |
| ProjectAgentPlanner | Multi-agent project planning |
| LensSelectorAgent | Analysis perspective selection |
| UXDesigner | Interface and experience design |

---

## The Volume System

LLMos organizes knowledge into a three-tier hierarchy that reflects maturity.

### System Volume (read-only)

Path: `public/volumes/system/`. Ships with the repository. Contains base agents, core
skills, and project templates. The manifest at `manifest.json` declares every file.
Currently: 1 agent, 1 tool definition, 20 skills.

### Team Volume (shared)

Path: `volumes/team/`. Collective intelligence. Skills promoted from User after 5+
uses with 80%+ success rate.

### User Volume (personal)

Path: `volumes/user/`. Working directory for experiments, execution traces, and new
agents before they earn promotion.

### The Promotion Pipeline

Skills flow upward as they prove reliable. The implementation lives in
`lib/skills/skill-promotion.ts`:

```typescript
// lib/skills/skill-promotion.ts
export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  user_to_team: {
    min_uses: 5,
    min_success_rate: 0.8,
  },
  team_to_system: {
    min_uses: 10,
    min_success_rate: 0.9,
  },
};
```

The `SkillPromotionManager` tracks every invocation and evaluates eligibility:

```typescript
// lib/skills/skill-promotion.ts
export class SkillPromotionManager {
  recordUsage(skillId: string, skillName: string,
              volume: VolumeLevel, success: boolean): void { ... }

  evaluatePromotion(skillId: string): PromotionEvaluation | null {
    const metrics = this.metrics.get(skillId);
    const threshold = currentVolume === 'user'
      ? this.thresholds.user_to_team
      : this.thresholds.team_to_system;
    const eligible =
      metrics.total_uses >= threshold.min_uses &&
      metrics.success_rate >= threshold.min_success_rate;
    ...
  }
}
```

A personal experiment that succeeds 5 times at 80%+ becomes a team standard. A team
standard that succeeds 10 times at 90%+ becomes a system primitive. This is Darwinian
knowledge management.

---

## Skills

Skills are reusable knowledge documents -- not code, but structured explanations the
LLM reads and follows. From `public/volumes/system/skills/esp32-cube-robot.md`:

```yaml
---
name: ESP32 Cube Robot Controller
category: hardware
description: Controls a two-wheeled differential drive cube robot
keywords: [esp32, robot, differential-drive, motor, cube, simulation, kinematics]
version: 1.0.0
---
```

The body includes hardware specs, protocol definitions, kinematics equations, movement
pattern tables, code examples, and safety guidelines. The system volume ships with
skills for ESP32 robotics, WASM development, flight controllers, plan-first execution,
Python coding, semantic pattern matching, data analysis, and quantum circuit simulation.

Skills differ from agents: agents have a persona and act autonomously; skills are
passive knowledge that agents consume. One agent might read three skills for a task.

---

## The Kernel

The kernel is a set of markdown files in `public/system/kernel/` that define
system-level behavior:

| File | Purpose |
|------|---------|
| `config.md` | Runtime parameters, iteration limits, evolution thresholds |
| `orchestration-rules.md` | PLAN-EXECUTE-REFLECT-ITERATE loop |
| `evolution-rules.md` | Skill generation and agent evolution |
| `memory-schema.md` | Short-term traces, long-term learnings |
| `tool-registry.md` | Available tools and interfaces |
| `trace-linking.md` | Execution flow tracking metadata |

From `config.md`, the orchestration and evolution parameters:

```yaml
orchestration:
  maxIterations: 15
  maxToolCalls: 50
  planFirst: true
  queryMemory: true

evolution:
  promotion:
    userToTeam:
      minUses: 5
      minSuccessRate: 0.8
    teamToSystem:
      minUses: 10
      minSuccessRate: 0.9
```

The orchestration rules define the core agentic loop: PLAN (analyze task, query
memory, create steps), EXECUTE (run steps, make tool calls), REFLECT (evaluate,
extract lessons), ITERATE (adjust and retry if incomplete). Confidence thresholds
gate execution: above 0.8, execute freely; between 0.5 and 0.8, add checkpoints;
below 0.5, ask the user.

---

## The /llmos Command

The entry point is the `/llmos` slash command in `.claude/commands/llmos.md`. It
triggers an 8-phase workflow:

**Phase 0: Agent Discovery.** Glob all `**/agents/*.md` files across volumes. Build a
capability index from frontmatter.

**Phase 1: Memory Consultation.** Read `system/memory_log.md` and search project
memory for similar past tasks.

**Phase 2: Planning.** Create a multi-phase execution plan with sub-agent assignments.

**Phase 2.5: Multi-Agent Planning.** Every project must have at least 3 agents. Select
by priority: copy (80%+ match), evolve (50-79%), or create from scratch.

**Phase 3: Structure Creation.** Create the project directory:

```
projects/[name]/
  agents/           # minimum 3 sub-agent .md files
  memory/
    short_term/     # execution traces
    long_term/      # consolidated learnings
  output/
    code/           # generated scripts
    visualizations/ # plots and images
  skills/           # reusable patterns
```

**Phase 4: Agent Execution.** Read each agent, generate code per its spec, invoke with
the `invoke-subagent` tool which tracks usage for evolution.

**Phase 5: Synthesis.** Combine results into documentation and summaries.

**Phase 6: Validation.** Verify the 3-agent minimum. If short, create more before
proceeding.

**Phase 7: Memory Update.** Append experience entry to the system memory log with
project name, outcome, agents used, and learnings.

---

## Self-Modification

The most distinctive property of LLMos is that the system modifies itself. Because
agents and skills are markdown files, the LLM can:

- **Create new agents** by writing a `.md` file to an agents directory
- **Evolve existing agents** by reading, modifying, and rewriting their definitions
- **Generate skills** when it discovers recurring patterns
- **Update configuration** to adjust thresholds and parameters

From the `/llmos` command specification:

> "Agents = Markdown files with YAML frontmatter + system prompts. Memory = Structured
> markdown in memory/ directories. Skills = Reusable patterns in skills/ directories.
> Evolution = Writing/modifying markdown (no code deployment needed)."

When the system learns something, it writes a skill file. When it needs a capability,
it writes an agent file. When it improves an agent, it edits the file and the improved
version is available immediately. The TypeScript runtime provides deterministic
execution. The markdown provides adaptive behavior.

---

## Model-Aware Execution

The kernel maps models to execution strategies in `config.md`:

```yaml
models:
  anthropic/claude-opus-4.5:
    strategy: "markdown"
    supportsNativeAgents: true
  openai/gpt-4o:
    strategy: "compiled"
    supportsNativeAgents: false
  google/gemini-2.0-flash:
    strategy: "compiled"
    supportsNativeAgents: false
```

Claude models consume raw markdown agents directly. Other models get agents compiled
into structured formats with explicit tool definitions. Smaller models get minimal,
numbered instructions. The agent file is the single source of truth; the execution
strategy adapts at runtime.

At runtime on physical robots, Qwen3-VL-8B takes over from Claude. It consumes the
same skill specifications through the "simple" strategy: a camera frame, an ASCII world
model, and candidate actions in, a structured JSON decision out.

---

## Chapter Summary

LLMos is an operating system where everything that defines behavior is a text file.
Agents are markdown with YAML frontmatter. Skills are structured knowledge documents.
Kernel rules are configuration in prose. The three-tier volume system creates a
pipeline where good patterns propagate upward through meritocratic promotion. The
`/llmos` command triggers an 8-phase workflow from discovery through memory update.

The deepest implication is self-modification. The system improves through use. Every
task becomes a data point. Every successful pattern becomes a promotion candidate. The
robot learns not by retraining a neural network, but by writing better documentation
for itself.

---

*Previous: [Chapter 7 -- The HAL: One Interface, Two Worlds](07-hal-and-hardware.md)*
*Next: [Chapter 9 -- Predictive Intelligence: Thinking Before Acting](09-predictive-intelligence.md)*
