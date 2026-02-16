# Chapter 11: The Evolution Engine -- Robots That Dream

What if a robot could improve while it sleeps? Not through firmware updates pushed by an engineer, but through a process where the robot reviews its own failures, generates variations of its behavior, tests those variations in simulation, and promotes the ones that work. This is the premise of the Evolution Engine in LLMos -- a system where robots dream about their mistakes and wake up better at their jobs. The metaphor is not accidental. The process is structurally similar to how biological organisms consolidate learning during sleep: replay recent experiences, try alternative responses, reinforce the ones that lead to better outcomes.

The Evolution Engine is an active area of development. The infrastructure described in this chapter is implemented and functional, but the full closed-loop pipeline -- from runtime traces to automatic agent improvement without human intervention -- is still being refined. What exists today is a foundation that the system is growing into.

## The Three Components

The Evolution Engine is built from three modules in `lib/evolution/`:

1. **BlackBoxRecorder** (`lib/evolution/black-box-recorder.ts`) -- Records everything that happens during robot operation.
2. **SimulationReplayer** (`lib/evolution/simulation-replayer.ts`) -- Replays recorded sessions in headless simulation.
3. **EvolutionaryPatcher** (`lib/evolution/evolutionary-patcher.ts`) -- Generates skill variants, tests them against recorded failures, and patches skill files.

A fourth module, the **AgenticAuditor** (`lib/evolution/agentic-auditor.ts`), gates promotion by validating skills before they can advance through the volume system.

## The Black-Box Recorder

Like an airplane's flight recorder, the BlackBoxRecorder captures every frame of robot operation: sensor telemetry, camera frames, tool calls and their results, LLM reasoning traces, confidence levels, and alert conditions. When something goes wrong, the recording tells you exactly what the robot saw, what it decided, and what happened next.

```typescript
// lib/evolution/black-box-recorder.ts

export interface RecordedFrame {
  timestamp: number;
  /** Time since session start (ms) */
  relativeTime: number;
  /** Full sensor telemetry */
  telemetry: Partial<DeviceTelemetry>;
  /** Camera frame as base64 data URL (may be sampled) */
  cameraFrame?: string;
  /** Tool calls made this frame */
  toolCalls: HALToolCall[];
  /** Tool results */
  toolResults: Array<{
    name: string;
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  /** LLM reasoning text */
  reasoning?: string;
  /** Confidence level from vision analysis */
  confidence?: number;
  /** Active alerts */
  alerts?: string[];
}
```

A recording session captures the full lifecycle from start to finish:

```typescript
// lib/evolution/black-box-recorder.ts

const recorder = getBlackBoxRecorder();

// Start recording a session
const sessionId = recorder.startSession({
  skillName: 'gardener',
  deviceId: 'robot-1',
});

// Record frames during operation
recorder.recordFrame({
  telemetry: { distance: { front: 45 } },
  toolCalls: [{ name: 'hal_drive', args: { left: 100, right: 100 } }],
  confidence: 0.85,
});

// Mark failure when it occurs
recorder.markFailure({
  type: 'collision',
  description: 'Hit unexpected obstacle',
  severity: 'moderate',
});

// End session and save for replay
await recorder.endSession();
```

Failures are categorized by type -- `collision`, `imminent_collision`, `motor_deadband`, `excessive_speed`, `timeout`, `low_confidence`, `safety_stop`, and others -- and by severity from `minor` to `critical`. Each failure marker records the frame index where it occurred, so the analysis system can look at exactly what happened in the moments before and after a failure.

The recorder is memory-conscious. Camera frames are sampled (default: every 5th frame) rather than captured every cycle, and when the frame buffer exceeds the limit (default: 1000 frames), old frames are flushed while preserving all frames associated with failures. This means the system never loses the critical moments around a failure, even in a long session.

## Session Analysis

The recorder includes a built-in analysis engine that extracts patterns from sessions:

```typescript
// lib/evolution/black-box-recorder.ts

export interface SessionAnalysis {
  sessionId: string;
  skillName: string;
  duration: number;
  /** Failure breakdown by type */
  failureBreakdown: Record<FailureType, number>;
  /** Time to first failure (ms from start) */
  timeToFirstFailure?: number;
  /** Failure clusters (failures within 5 frames of each other) */
  failureClusters: Array<{
    startFrame: number;
    endFrame: number;
    types: FailureType[];
    count: number;
  }>;
  /** Performance metrics */
  performance: {
    averageSpeed: number;
    maxSpeed: number;
    averageConfidence: number;
    minConfidence: number;
    totalDistance: number;
    emergencyStops: number;
  };
  /** Tool usage statistics */
  toolUsage: Record<string, {
    count: number;
    successRate: number;
  }>;
  /** Trajectory reconstruction */
  trajectory: Array<{ time: number; x: number; y: number; yaw: number }>;
  /** Recommendations based on analysis */
  recommendations: string[];
}
```

Failure clusters are particularly informative. A single collision is an isolated event. Three collisions within five frames of each other is a cascade -- the robot hit something, tried to recover, and failed. The clustering algorithm identifies these cascades automatically, revealing systemic problems that individual failure counts would miss.

The analysis also generates recommendations: "Improve obstacle detection -- collisions detected," "Reduce approach speed near obstacles -- multiple near-misses," "Increase minimum PWM values -- motor deadband detected." These are rule-based recommendations, not LLM-generated, providing fast feedback without inference cost.

Sessions can be compared against each other to measure improvement:

```typescript
// lib/evolution/black-box-recorder.ts

const comparison = recorder.compareSession(sessionA, sessionB);
// comparison.betterSession: 'A' | 'B' | 'equal'
// comparison.improvement: percentage
// comparison.details: ['3 fewer failures in session B', '12% better confidence in session B']
```

## The Evolutionary Patcher

The EvolutionaryPatcher is the core of the Dreaming Engine. It implements a genetic algorithm over skill definitions: generate mutations, test them against recorded failures, keep the best, repeat.

```typescript
// lib/evolution/evolutionary-patcher.ts

export interface EvolutionResult {
  skillName: string;
  originalVersion: string;
  generations: number;
  totalVariants: number;
  bestVariant: SkillVariant;
  improvement: number; // Percentage
  failuresFixed: number;
  newFailuresIntroduced: number;
  evolutionHistory: EvolutionEntry[];
  duration: number;
}
```

The evolutionary process works in five steps:

**Step 1: Load failures.** The patcher queries the BlackBoxRecorder for failed sessions associated with the target skill. If there are no failures, there is nothing to improve.

**Step 2: Analyze failure patterns.** Failures are categorized by type and severity. If collisions dominate, the patcher will bias its mutations toward safety-related changes. If low confidence is the primary issue, it will bias toward visual detection improvements.

**Step 3: Generate mutations.** Each generation produces a population of skill variants (default: 4). Mutations are drawn from a set of mutation types: `add_investigation_trigger`, `add_alert_condition`, `modify_safety_limit`, `add_visual_target`, `modify_protocol`, and `add_ignore_item`. The mutation rate (default: 0.3) controls how many mutations each variant receives. Selection is by tournament: two random parents are compared, and the fitter one is chosen for mutation.

**Step 4: Evaluate fitness.** Each variant is tested by replaying the failed sessions in the SimulationReplayer. Fitness is calculated as the ratio of failures avoided: if the original skill produced 10 failures and the variant produces 3, the fitness is 0.7. The system tracks which specific failures were avoided, providing detailed improvement reports.

**Step 5: Select and iterate.** The best variants (elites) survive to the next generation unchanged. The rest of the population is filled by mutating the top performers. Evolution continues for a configurable number of generations (default: 5) or until fitness exceeds 0.95.

Here is the mutation logic for collision-related failures:

```typescript
// lib/evolution/evolutionary-patcher.ts

if (failurePatterns.has('collision:critical') || failurePatterns.has('collision:moderate')) {
  possibleMutations.push('add_investigation_trigger', 'modify_safety_limit');
}

// ... applying a safety limit mutation:

case 'modify_safety_limit':
  if (!skill.motorCortex.safetyLimits) {
    skill.motorCortex.safetyLimits = {};
  }
  // Increase min confidence threshold
  const currentConfidence = skill.motorCortex.safetyLimits.minConfidence || 0.5;
  skill.motorCortex.safetyLimits.minConfidence = Math.min(0.9, currentConfidence + 0.1);
  // Decrease max speed
  const currentSpeed = skill.motorCortex.safetyLimits.maxSpeed || 100;
  skill.motorCortex.safetyLimits.maxSpeed = Math.max(20, currentSpeed - 10);
  break;
```

The mutation is targeted: if the robot keeps crashing, make it require higher visual confidence before moving and reduce its maximum speed. These are the same adjustments a human engineer would make, encoded as automated skill modifications.

## The Dreaming Cycle

The high-level API ties everything together:

```typescript
// lib/evolution/index.ts

const results = await runDreamingCycle({
  skillPath: 'skills/gardener.md',
  generations: 5,
  autoApply: true,
  autoApplyThreshold: 10, // Only apply if 10%+ improvement
});
```

When `autoApply` is enabled, the system automatically patches the skill file if the improvement exceeds the threshold. The patched skill gets an incremented version number and an evolution history entry:

```
- v1.0.4: add_investigation_trigger; modify_safety_limit (dreaming)
```

The system can also be scheduled to run during idle time:

```typescript
// lib/evolution/index.ts

await scheduleDreaming(['skills/gardener.md', 'skills/explorer.md'], {
  autoApply: true,
  generations: 10,
});
```

This checks each skill for accumulated failures (minimum 3 by default) and runs evolution only when there is enough data to learn from.

## The Agentic Auditor

Before a skill can be promoted through the volume system, it must pass an audit. The AgenticAuditor in `lib/evolution/agentic-auditor.ts` validates skills across six categories:

1. **Structure** -- Does the skill have a name, version, role, and objective?
2. **Content** -- Are the Visual Cortex and Motor Cortex sections complete?
3. **Compatibility** -- Do referenced HAL tools actually exist?
4. **Safety** -- Are there emergency stop protocols, collision handling, and confidence thresholds?
5. **Functional** -- Can the skill content compile? Are there placeholder markers?
6. **Quality** -- Is there an author, license, evolution history, and sufficient context?

Each category produces a score, and the weighted aggregate determines whether the skill can be promoted:

```typescript
// lib/evolution/agentic-auditor.ts

// Score thresholds for promotion
minScoreForUserLevel: 50,
minScoreForTeamLevel: 70,
minScoreForSystemLevel: 85,
```

Safety is weighted 1.5x higher than other categories. A skill with perfect structure but no safety protocols will fail the audit. This reflects a design principle: in a system that controls physical hardware, safety is not optional.

## The Skill Promotion Pipeline

LLMos organizes skills and knowledge into a volume hierarchy (see `public/volumes/`):

- **User Volume** -- New patterns discovered during individual operation. Low barrier to entry.
- **Team Volume** -- Skills promoted after 5+ successful uses and 80%+ success rate.
- **System Volume** -- Skills promoted after 10+ successful uses and 90%+ success rate. These are the battle-tested behaviors that every robot in the fleet can rely on.

The evolution engine feeds this pipeline. A skill starts in the user volume as a rough draft. The dreaming engine refines it through evolutionary iteration. The agentic auditor validates it. When it meets the promotion criteria, it advances. The skill file itself contains its evolution history, making the file simultaneously the documentation, the executable definition, and the changelog.

The system volume (`public/volumes/system/skills/`) already contains production skills like `esp32-cube-robot.md`, `plan-first-execution.md`, and `semantic-pattern-matching.md` -- patterns that have been validated and are available to all robots in the fleet.

## Cross-Domain Analogies

The mutation engine can draw on cross-domain knowledge stored in `public/system/domains/`. These domain files encode mathematical models from evolutionary biology, thermodynamics, economics, circuit theory, and signal processing. The idea is that a robot struggling with obstacle avoidance might benefit from an analogy to predator-prey dynamics, or a robot optimizing its patrol route might gain insight from thermodynamic equilibrium models.

This is an aspirational feature. The domain files exist and contain rigorous mathematical models (the evolutionary biology domain includes the Price Equation, Fisher's Fundamental Theorem, and Hawk-Dove game dynamics). The bridge from these abstract models to concrete skill mutations is under active development.

## The Development LLM's Role

Claude Opus 4.6 serves as the development-time "architect" in the dual-LLM system (see Chapter 2). In the context of the evolution engine, its role is to:

1. **Analyze execution traces** -- Read black-box recordings and identify failure patterns that rule-based analysis might miss.
2. **Generate improved agent definitions** -- Write new skill files that address observed weaknesses.
3. **Propose architectural changes** -- Suggest modifications to safety protocols, visual detection targets, or motor control parameters.
4. **Write the results back as markdown** -- The agent definition IS the documentation IS the evolution history.

This is the key insight of the evolution system: in LLMos, agent behaviors are defined in markdown files. Improving an agent means editing a markdown file. An LLM is very good at reading markdown, understanding its intent, and producing an improved version. The evolution engine is, at its core, an automated markdown editor with a fitness function.

## Current State and Future Direction

What works today:
- Black-box recording captures complete session data with memory-efficient frame management.
- Session analysis identifies failure patterns, clusters, and generates rule-based recommendations.
- Session comparison quantifies improvement between runs.
- The evolutionary patcher runs a genetic algorithm over skill variants with targeted mutation strategies.
- The agentic auditor validates skills across six categories with configurable promotion thresholds.
- The dreaming cycle API orchestrates the full pipeline from failure analysis to skill patching.
- Scheduled dreaming checks for accumulated failures and runs evolution during idle time.

What is still being refined:
- The full closed loop from runtime trace to automatic improvement without any human review.
- Integration of cross-domain analogies into the mutation strategy.
- Multi-generational evolution tracking across the skill promotion pipeline.
- LLM-driven mutation generation (currently mutations are rule-based, not LLM-generated).

The architecture is designed so that each of these gaps can be filled incrementally. The recording infrastructure captures everything needed for analysis. The evolutionary framework supports arbitrary mutation strategies. The auditor can be extended with new validation categories. The pieces are in place; the wiring is ongoing.

## Chapter Summary

The Evolution Engine is LLMos's approach to continuous improvement. The BlackBoxRecorder captures every frame of robot operation, creating a complete audit trail. The SimulationReplayer allows failed sessions to be re-run with modified skill variants. The EvolutionaryPatcher implements a genetic algorithm over skill definitions, using targeted mutations driven by failure patterns and fitness evaluation via replay. The AgenticAuditor gates skill promotion through a six-category validation framework with configurable thresholds. Together, these components create a pipeline where robots record their failures, dream about alternatives, and wake up with improved behaviors -- a form of automated skill evolution that bridges the gap between runtime experience and design-time improvement.

---

*Previous: [Chapter 10 -- Fleet Coordination: Multiple Robots, One World](10-fleet-coordination.md)*

*Next: [Chapter 12 -- 349 Tests: Proving the System Works](12-testing.md)*
