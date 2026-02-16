# LLM Configuration

LLMos uses a dual-LLM architecture. One model assists development. A different model
runs on the robot at runtime. This document covers how both are configured and how
to set up OpenRouter for runtime inference.

## Dual-LLM Architecture

### Development LLM: Claude Opus 4.6

Used during development for code generation, architecture decisions, test writing,
and debugging. Runs via Claude Code CLI or API. Not deployed to robots.

- **Model**: `claude-opus-4-6` (Anthropic)
- **Role**: Write and review code, design system architecture, generate tests
- **Where it runs**: Developer workstation only
- **Not used at runtime**: Too expensive and too slow for real-time navigation cycles

### Runtime LLM: Qwen3-VL-8B-Instruct

Used at runtime inside the navigation loop. Receives a serialized world model,
scored candidates, and optional camera/map images each cycle, then returns a
structured JSON navigation decision.

- **Model**: `qwen/qwen3-vl-8b-instruct` (via OpenRouter)
- **Role**: Pick navigation strategy (WHERE to go) each cycle
- **Where it runs**: Cloud API call from the robot controller
- **Cycle time**: ~1.4s average per navigation cycle
- **Validated**: 6/6 navigation criteria passed in live testing

## OpenRouter Setup

### 1. Get an API Key

Sign up at [openrouter.ai](https://openrouter.ai/) and create an API key at
[openrouter.ai/keys](https://openrouter.ai/keys). Keys start with `sk-or-`.

### 2. Set the Environment Variable

Create a `.env.local` file in the project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

Or export it directly:

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### 3. Verify

```bash
npx tsx scripts/run-navigation.ts --live
```

If the key is valid, you will see `Mode: LIVE (Qwen3-VL-8B via OpenRouter)` and
the navigation session will run against the real model.

## Default Model: qwen/qwen3-vl-8b-instruct

This is the default runtime model for navigation. It was selected for the following
reasons:

- **Vision-capable**: Accepts both text and image inputs (map renders + camera frames)
- **Fast inference**: Sub-2-second responses at 512 max tokens
- **Structured output**: Reliably produces valid JSON when prompted with a schema
- **Cost-effective**: Significantly cheaper per token than frontier models
- **Small enough for edge**: 8B parameters means future on-device deployment is feasible
- **Tested and validated**: 6/6 navigation criteria passed in end-to-end live testing

### Default Configuration

```typescript
{
  model: 'qwen/qwen3-vl-8b-instruct',
  temperature: 0.2,        // Low for deterministic navigation
  maxTokens: 512,          // Enough for decision JSON + explanation
  timeoutMs: 10000,        // 10s timeout per API call
  baseUrl: 'https://openrouter.ai/api/v1',
}
```

## Alternative Models

You can swap the runtime model by passing a different model ID. These have been
tested or are expected to work:

| Model ID | Vision | Notes |
|----------|--------|-------|
| `qwen/qwen3-vl-8b-instruct` | Yes | Default. Best cost/performance for navigation. |
| `google/gemini-2.5-flash-preview` | Yes | Fast, large context window. Good alternative. |
| `anthropic/claude-sonnet-4-5-20250929` | Yes | High quality but higher cost per cycle. |
| `meta-llama/llama-4-scout` | No | Text-only. Works without vision bridge. Cheaper. |

To use an alternative model:

```typescript
import { createOpenRouterInference } from '../lib/runtime/llm-inference';

const infer = createOpenRouterInference({
  model: 'google/gemini-2.5-flash-preview',
});
```

Or with the full adapter for stats tracking:

```typescript
import { createOpenRouterAdapter } from '../lib/runtime/openrouter-inference';

const adapter = createOpenRouterAdapter({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'anthropic/claude-sonnet-4-5-20250929',
  temperature: 0.2,
  maxTokens: 512,
});
```

Browse all available models at [openrouter.ai/models](https://openrouter.ai/models).

## Response Format

### Expected JSON Schema

The LLM must return a JSON object matching `LLMNavigationDecision`:

```json
{
  "action": {
    "type": "MOVE_TO",
    "target_id": "c1"
  },
  "fallback": {
    "if_failed": "EXPLORE"
  },
  "explanation": "Moving to candidate c1 which is closest to the goal."
}
```

### Free-Form Normalization

Real LLMs do not always return the exact schema. The `parseNavigationDecision`
function in `lib/runtime/navigation-types.ts` handles common deviations:

- **Markdown fences**: Strips ` ```json ` wrappers
- **Trailing commas**: Removes trailing commas before `}` or `]`
- **Qwen think tags**: Strips `<think>...</think>` reasoning blocks
- **Flat action strings**: Normalizes `{"action": "move_to", "target": "c1"}` to
  the nested schema
- **Synonym mapping**: Maps `GO`, `NAVIGATE`, `MOVE` to `MOVE_TO`; `TURN` to
  `ROTATE_TO`; `HALT`, `WAIT` to `STOP`; `SCAN` to `EXPLORE`
- **Alternative field names**: Accepts `reason`, `reasoning`, `rationale` for
  `explanation`; `target`, `subgoal`, `candidate` for `target_id`

### Valid Action Types

| Action | Required Fields | Description |
|--------|----------------|-------------|
| `MOVE_TO` | `target_id` or `target_m` | Move to a candidate or coordinate. `target_id` references a candidate ID (e.g., `"c1"`, `"f2"`). `target_m` is a `[x, y]` coordinate in meters. |
| `EXPLORE` | `target_id` (optional) | Explore toward a frontier. If `target_id` is provided, head toward that frontier candidate. |
| `ROTATE_TO` | `yaw_deg` | Rotate in place to the specified yaw in degrees. Used to scan surroundings. |
| `FOLLOW_WALL` | none | Follow the nearest wall. Used for systematic exploration. |
| `STOP` | none | Stop all movement. Used when goal is reached or situation is unsafe. |

### Valid Fallback Types

The `fallback.if_failed` field accepts: `EXPLORE`, `ROTATE_TO`, `STOP`.

### Optional: World Model Corrections

The LLM can optionally include corrections to the world model:

```json
{
  "world_model_update": {
    "corrections": [
      {
        "pos_m": [1.5, 2.0],
        "observed_state": "obstacle",
        "confidence": 0.9
      }
    ]
  }
}
```

Each correction specifies a position, an observed state (`free`, `obstacle`, or
`unknown`), and a confidence between 0 and 1. These are advisory -- the controller
validates them before applying.

## Programmatic Usage

### Simple: createOpenRouterInference

Returns an `InferenceFunction` compatible with `NavigationLoop`. Uses
`process.env.OPENROUTER_API_KEY` by default.

```typescript
import { createOpenRouterInference } from '../lib/runtime/llm-inference';
import { NavigationLoop } from '../lib/runtime/navigation-loop';

const infer = createOpenRouterInference();
// or with explicit config:
const infer2 = createOpenRouterInference({
  apiKey: 'sk-or-...',
  model: 'qwen/qwen3-vl-8b-instruct',
  temperature: 0.2,
});

const loop = new NavigationLoop(bridge, infer);
```

### Advanced: OpenRouterInference with Stats

The `OpenRouterInference` class tracks call counts, token usage, latency, and
error rates. Useful for monitoring and cost estimation.

```typescript
import { createOpenRouterAdapter } from '../lib/runtime/openrouter-inference';

const adapter = createOpenRouterAdapter({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'qwen/qwen3-vl-8b-instruct',
  maxTokens: 512,
  temperature: 0.3,
  timeoutMs: 15000,
  maxRetries: 1,
  supportsVision: true,
});

// Use as inference function
const infer = adapter.createInferenceFunction();
const response = await infer(systemPrompt, userMessage, [mapImageBase64]);

// Check stats after a session
const stats = adapter.getStats();
console.log(`Calls: ${stats.totalCalls}`);
console.log(`Success: ${stats.successfulCalls}`);
console.log(`Failed: ${stats.failedCalls}`);
console.log(`Total tokens: ${stats.totalTokens}`);
console.log(`Avg latency: ${stats.averageLatencyMs.toFixed(0)}ms`);

// Reset stats between sessions
adapter.resetStats();
```

### InferenceStats Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalCalls` | number | Total API calls attempted |
| `successfulCalls` | number | Calls that returned a response |
| `failedCalls` | number | Calls that failed after all retries |
| `totalTokens` | number | Sum of prompt + completion tokens |
| `promptTokens` | number | Total input tokens |
| `completionTokens` | number | Total output tokens |
| `averageLatencyMs` | number | Mean response time across successful calls |
| `totalLatencyMs` | number | Cumulative response time |

## Mock Inference for Testing

All 349 tests run without an API key using the mock inference adapter. The mock
parses candidate data from the prompt text and applies a deterministic strategy:

- Picks the highest-scoring candidate
- Prefers recovery candidates when stuck
- Falls back to `ROTATE_TO` if no candidates are available

```typescript
import { createMockInference } from '../lib/runtime/llm-inference';

const infer = createMockInference();
// Returns valid LLMNavigationDecision JSON, no network calls
const response = await infer(systemPrompt, userMessage);
```

This is what `npx tsx scripts/run-navigation.ts` uses by default (without `--live`).
It is also what the test suite uses, so `npx jest` never requires an API key.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Only for `--live` mode | OpenRouter API key (`sk-or-...`) |

No other LLM-related environment variables are needed. Model selection and
configuration are set programmatically in code.
