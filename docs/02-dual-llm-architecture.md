# Chapter 2: Two Brains -- Development and Runtime

Imagine a self-driving car designed by a team of architects who spend months thinking
about every scenario, every edge case, every failure mode. Their deliberation is slow,
expensive, and brilliant. Now imagine the actual car on the road: it makes hundreds of
decisions per second, each one fast, cheap, and good enough. The architects and the
driver are not the same entity. They operate at different timescales, with different
tools, optimized for different kinds of intelligence. LLMos works the same way.

---

## Why Not One LLM?

The naive approach to LLM-powered robotics is to use a single large model for
everything. Pick the smartest model available -- say, Claude Opus or GPT-4 -- and
have it plan the architecture, write the skills, and also run the robot in real time.

The math kills this idea immediately.

A cloud-hosted frontier model takes 1-2 seconds per inference call. A robot running
at 1 Hz (one decision per second) needs that entire latency budget just for
inference, leaving nothing for sensor processing, path planning, or motor execution.
At 10 Hz -- the speed needed for reactive obstacle avoidance -- the model would need
to respond in under 100ms. No cloud API can do this.

Then there is cost. At approximately $15 per million input tokens and $75 per million
output tokens for a frontier model, a robot running at 10 Hz with ~2K tokens per
frame would cost roughly $36 per hour of operation. For a research lab running
overnight experiments, that is thousands of dollars per week. For a fleet of robots,
it is untenable.

The solution is not to compromise on either end. It is to use two models, each
optimized for its job.

---

## The Development LLM: Claude Opus 4.6

The development LLM runs at design time. It is invoked through Claude Code, the CLI
agent that reads the codebase, reasons about architecture, and writes code. In the
LLMos paradigm, this model is the architect:

- It creates agent definitions as markdown files in the volume system
- It writes and evolves robot skills (navigation strategies, recovery behaviors)
- It reasons about system architecture and suggests structural changes
- It runs the evolution engine, evaluating past robot performance and promoting
  successful behaviors

Speed does not matter here. A skill that takes 30 seconds to generate will run
millions of times on the robot. The investment is amortized over the robot's
operational lifetime. What matters is reasoning quality: the development LLM needs
to understand the full system context, reason about edge cases, and produce correct,
well-structured output.

Claude Opus 4.6 is well-suited to this role. Its long context window holds the
entire codebase in working memory. Its instruction-following capability produces
clean, typed code. Its reasoning depth handles multi-step architectural decisions.
And because it runs only during development -- not in the robot's control loop --
its latency and cost are acceptable.

---

## The Runtime LLM: Qwen3-VL-8B

The runtime LLM runs on the robot (or on a nearby GPU server). It is invoked every
navigation cycle -- typically once every 1-2 seconds -- and must respond fast enough
to keep the robot moving smoothly.

Qwen3-VL-8B is a vision-language model, meaning it can process both text and images
in a single inference call. This is critical for navigation: the robot sends both a
structured JSON execution frame (the world model, candidates, history) and visual
inputs (a top-down map image, a camera frame) to the model simultaneously. The model
reasons about both modalities and returns a single JSON decision.

Key properties of the runtime LLM:

- **8B parameters** -- small enough to run on a single consumer GPU (8GB VRAM)
- **Vision-capable** -- processes camera frames and map images natively
- **Fast inference** -- ~200-500ms per call on modern hardware
- **Structured output** -- can be constrained to produce valid JSON
- **Local deployment** -- no cloud dependency, no per-token cost at runtime

The runtime model does not need to be brilliant. It needs to be fast, reliable, and
good enough. The navigation loop has multiple safety nets: schema validation catches
malformed output, fallback strategies handle failed actions, the local planner
enforces collision-free paths, and the HAL enforces motor safety limits. The LLM
makes strategic decisions. Everything else is deterministic.

---

## The Execution Frame: What the Runtime LLM Receives

Each navigation cycle, the runtime LLM receives a `NavigationFrame` -- a structured
JSON document that compresses the robot's entire situation into what the model needs
to make one decision. The frame is defined in `lib/runtime/navigation-types.ts`:

```typescript
export interface NavigationFrame {
  cycle: number;
  goal: string;
  world_model: GridSerializationJSON | GridPatchUpdate;
  symbolic_layer: {
    objects: Array<{
      id: string;
      type: string;
      bbox_m: [number, number, number, number];
      label?: string;
    }>;
    topology: {
      waypoints: Array<{ id: string; pos_m: [number, number]; label: string }>;
      edges: Array<{ from: string; to: string; cost: number; status: 'clear' | 'blocked' | 'unknown' }>;
    };
  };
  candidates: Array<{
    id: string;
    type: 'subgoal' | 'frontier' | 'waypoint' | 'recovery';
    pos_m: [number, number];
    score: number;
    note: string;
  }>;
  last_step: { action: string; result: 'success' | 'blocked' | 'timeout' | 'collision'; details: string };
  state: {
    mode: NavigationMode;
    position_m: [number, number];
    yaw_deg: number;
    speed_mps: number;
    battery_pct: number;
    is_stuck: boolean;
    stuck_counter: number;
    confidence: number;
  };
  history: Array<{ cycle: number; action: string; result: string }>;
  map_image?: string;
  camera_frame?: string;
}
```

Three things to notice about this frame:

1. **It contains candidates, not raw coordinates.** The LLM selects from pre-scored
   subgoals (e.g., `c1: frontier at [3.2, 1.8], score 0.85`). It does not invent
   coordinates from scratch. This bounds the action space and makes validation
   straightforward.

2. **It includes the result of the last action.** If the previous decision failed
   ("blocked -- obstacle at [2.1, 3.0]"), the LLM sees this and can adjust strategy.
   This creates a feedback loop without explicit reward signals.

3. **It carries multimodal data.** The `map_image` field is a base64-encoded top-down
   rendering of the occupancy grid. The `camera_frame` is the robot's egocentric
   camera view. A vision-language model like Qwen3-VL-8B processes these alongside
   the structured JSON, enabling spatial reasoning that neither text nor images alone
   could support.

---

## LLM Bytecode: The Output Schema

The runtime LLM does not return free-form text. It returns a strict JSON decision
defined as `LLMNavigationDecision` in `lib/runtime/navigation-types.ts`:

```typescript
export interface LLMNavigationDecision {
  action: {
    type: 'MOVE_TO' | 'EXPLORE' | 'ROTATE_TO' | 'FOLLOW_WALL' | 'STOP';
    target_id?: string;
    target_m?: [number, number];
    yaw_deg?: number;
  };
  fallback: {
    if_failed: 'EXPLORE' | 'ROTATE_TO' | 'STOP';
    target_id?: string;
  };
  world_model_update?: {
    corrections: Array<{
      pos_m: [number, number];
      observed_state: 'free' | 'obstacle' | 'unknown';
      confidence: number;
    }>;
  };
  explanation: string;
}
```

This is what we call "LLM bytecode" -- structured, deterministic instructions that
the execution engine can process without interpretation. The five action types
(`MOVE_TO`, `EXPLORE`, `ROTATE_TO`, `FOLLOW_WALL`, `STOP`) are the robot's complete
instruction set. Every possible navigation behavior is composed from these primitives.

The `fallback` field is mandatory. Every decision must include a recovery strategy.
If the primary action fails (path blocked, target unreachable), the system
automatically executes the fallback without another LLM call. This makes the robot
resilient to transient failures without adding inference latency.

The `world_model_update` field is optional and advisory. The LLM can suggest
corrections to the world model ("I see from the camera that cell [2.1, 3.0] is
actually free, not an obstacle"). These corrections are validated against sensor
confidence before being applied -- the LLM cannot override high-confidence sensor
data. This gives the LLM a channel to improve the world model while maintaining
safety.

---

## The OpenRouter Adapter

For cloud-based inference (testing, debugging, or when a local GPU is not available),
LLMos provides an OpenRouter adapter in `lib/runtime/openrouter-inference.ts`. This
adapter wraps the OpenRouter API with vision support, retry logic, and token tracking:

```typescript
export class OpenRouterInference {
  private config: OpenRouterConfig;
  private stats: InferenceStats;

  constructor(config: Partial<OpenRouterConfig> & { apiKey: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  createInferenceFunction(): InferenceFunction {
    return async (
      systemPrompt: string,
      userMessage: string,
      images?: string[]
    ): Promise<string> => {
      return this.infer(systemPrompt, userMessage, images);
    };
  }

  async infer(
    systemPrompt: string,
    userMessage: string,
    images?: string[]
  ): Promise<string> {
    this.stats.totalCalls++;
    const start = performance.now();

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.callAPI(systemPrompt, userMessage, images);
        // Track latency, token usage
        this.stats.successfulCalls++;
        this.stats.totalLatencyMs += performance.now() - start;
        return result.content;
      } catch (error) {
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw new Error('OpenRouter inference failed');
  }

  getStats(): InferenceStats { return { ...this.stats }; }
}
```

The adapter tracks every call: total tokens, prompt tokens, completion tokens,
average latency, success rate. This data feeds into the navigation evaluator, which
uses it to assess whether the LLM is performing within acceptable bounds.

The key design decision is the `createInferenceFunction()` method, which returns an
`InferenceFunction` -- the same type signature used throughout the navigation stack.
This means the navigation loop does not know or care whether it is talking to a local
Qwen3-VL-8B instance, a cloud Claude model via OpenRouter, or a mock function in a
test. The adapter pattern keeps the inference backend completely decoupled from the
navigation logic.

```typescript
// In production: real LLM via OpenRouter
const infer = createOpenRouterInference({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'qwen/qwen3-vl-8b',
});

// In tests: deterministic mock
const infer: InferenceFunction = async () => JSON.stringify({
  action: { type: 'MOVE_TO', target_id: 'c1' },
  fallback: { if_failed: 'EXPLORE' },
  explanation: 'Moving to nearest frontier.',
});

// Same NavigationLoop constructor either way
const loop = new NavigationLoop(bridge, infer);
```

The `OpenRouterConfig` supports vision models out of the box. When images are passed
to the inference function, the adapter automatically formats them as multimodal
content messages with base64-encoded image URLs. This is how the robot sends both
its top-down map and camera frame to the VLM in a single API call:

```typescript
// Inside callAPI — building the multimodal message
if (images && images.length > 0 && this.config.supportsVision) {
  const content = [
    { type: 'text', text: userMessage },
  ];
  for (const image of images) {
    const imageUrl = image.startsWith('data:')
      ? image
      : `data:image/png;base64,${image}`;
    content.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }
  messages.push({ role: 'user', content });
}
```

---

## Handling LLM Unreliability

LLMs are stochastic. They sometimes produce malformed JSON, invent action types that
do not exist, or hallucinate coordinates outside the arena. The navigation loop in
`lib/runtime/navigation-loop.ts` handles this at multiple levels:

1. **Response normalization.** The `parseNavigationDecision` function in
   `navigation-types.ts` strips markdown fences, removes Qwen3's `<think>` tags,
   fixes trailing commas, and normalizes free-form responses to the expected schema.
   A response like `{"action": "move", "target": "c1"}` is automatically converted
   to `{"action": {"type": "MOVE_TO", "target_id": "c1"}, ...}`.

2. **Validation.** Every parsed decision is validated against the schema. Invalid
   decisions trigger a fallback with reduced confidence.

3. **Confidence tracking.** The navigation loop maintains a confidence score (0-1)
   that increases with successful LLM responses and decreases with failures. This
   score can trigger escalation to a more deliberate reasoning mode.

4. **Timeout.** LLM inference has a configurable timeout (default 5 seconds). If the
   model does not respond in time, the fallback decision is used and the robot keeps
   moving.

5. **Deterministic fallback.** The `getFallbackDecision` function produces a safe
   default action (typically EXPLORE or STOP) that requires no LLM inference. The
   robot is never waiting on a model to know what to do next.

---

## The Separation in Practice

Here is what a single navigation cycle looks like with both LLMs in their roles:

**Design time** (Claude Opus 4.6, run once):
- Create the navigation prompt template
- Define the `LLMNavigationDecision` schema
- Write the stuck-recovery strategy
- Generate test arenas and evaluation criteria

**Runtime** (Qwen3-VL-8B, every cycle):
1. Receive execution frame (world model + candidates + camera + map)
2. Reason about current situation (~300ms)
3. Return JSON decision: `MOVE_TO c3` with fallback `EXPLORE`
4. Decision is validated, path is planned, robot moves

The development LLM creates the rules. The runtime LLM plays by them. The
development LLM optimizes for correctness, completeness, and edge-case coverage. The
runtime LLM optimizes for speed, consistency, and good-enough decisions under time
pressure.

This separation also enables the evolution engine (Chapter 11). The development LLM
can analyze logs of runtime LLM decisions, identify patterns of failure, and evolve
better prompts or skill files -- all without touching the runtime loop. The robot
gets smarter overnight without any change to its real-time control system.

---

## Summary

LLMos uses two LLMs because the constraints of design-time and runtime intelligence
are fundamentally different. The development LLM (Claude Opus 4.6) is slow, expensive,
and brilliant -- it designs the system. The runtime LLM (Qwen3-VL-8B) is fast, cheap,
and reliable -- it drives the robot. Between them, the `InferenceFunction` abstraction
and the OpenRouter adapter ensure that any model can be swapped in without changing
the surrounding system.

The execution frame gives the runtime LLM exactly what it needs: a compressed world
model, pre-scored candidates, multimodal visual context, and action history. The
output schema constrains it to produce deterministic, executable bytecode. And
multiple layers of normalization, validation, and fallback ensure that LLM
unreliability never reaches the motors.

---

*Previous: [Chapter 1 -- The Thesis: LLM as Kernel](01-the-thesis.md)*
*Next: [Chapter 3 -- The World Model: How a Robot Thinks About Space](03-world-model.md)*
