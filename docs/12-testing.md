---
layout: default
title: "12. Testing"
nav_order: 12
---

# Chapter 12: 346+ Tests -- Proving the System Works

![Wall of green checkmark badges with robot as quality inspector](assets/chapter-12.png)

<!-- IMAGE_PROMPT: Isometric digital illustration, clean technical style, dark navy (#0d1117) background, soft neon accent lighting in cyan and magenta, a small wheeled robot with a glowing blue eye sensor as recurring character, flat vector aesthetic with subtle depth, no photorealism, 16:9 aspect ratio. Wall of green checkmark badges in grid pattern, number "349" prominent. Robot stands in front like quality inspector with clipboard. Behind wall, faint outlines of components: grid, planner, navigation loop, vision pipeline. -->

A navigation system that cannot be tested is a navigation system that cannot be trusted.
When your robot is threading a 0.6-meter corridor at walking speed, you do not want to
discover a coordinate system bug for the first time on live hardware. The LLMos test
suite exists to make sure that every component -- from individual grid cells to full
end-to-end navigation runs -- behaves exactly as specified, every single time. At the
time of writing, the suite contains 346 tests across 21 test suites. Every one of them
runs without a network connection, without a GPU, and without a real LLM.

---

## Test Philosophy

The core design principle is simple: every module has its own test file. The test file
lives in `__tests__/lib/runtime/` mirroring the source layout under `lib/runtime/`. If
you touch `world-model-bridge.ts`, you run `world-model-bridge.test.ts`. No exceptions.

The second principle is equally important: tests run in isolation from the real world.
No network calls. No GPU inference. No HTML canvas rendering. The system is designed
from the ground up to be testable. The `InferenceFunction` abstraction in the
NavigationLoop means you can swap a real Qwen3-VL-8B backend for a three-line mock
function and the loop does not know the difference.

```typescript
// lib/runtime/navigation-loop.ts

export type InferenceFunction = (
  systemPrompt: string,
  userMessage: string,
  images?: string[]
) => Promise<string>;
```

This type signature is the seam that makes the entire navigation stack testable. The
loop assembles a prompt, calls whatever function you hand it, and parses the result.
In production, that function hits OpenRouter or a local Qwen3-VL-8B server. In tests,
it returns a hardcoded JSON string.

---

## The Test Stack

The suite uses Jest with ts-jest for TypeScript compilation and jsdom as the test
environment. The configuration is minimal:

```javascript
// jest.config.js

const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterSetup: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  preset: 'ts-jest',
}

module.exports = createJestConfig(customJestConfig)
```

Build and test commands:

- **Build**: `npm run build` (Next.js 14.1.0)
- **Type check**: `npx tsc --noEmit`
- **Tests**: `npx jest --no-coverage`

---

## Key Testing Patterns

### Pattern 1: WorldModel Singleton Cleanup

The WorldModel uses a singleton pattern keyed by device ID. If one test creates a
world model for device `"test-1"` and the next test creates another for `"test-1"`,
they share state. This is a leak. Every test file that touches the WorldModel must
clean up after itself:

```typescript
// __tests__/lib/runtime/world-model-bridge.test.ts

import { clearAllWorldModels } from '../../../lib/runtime/world-model';

afterEach(() => {
  clearAllWorldModels();
});
```

The `clearAllWorldModels()` function wipes the singleton map. Forget this call and you
will spend an hour debugging a test that passes alone but fails in the full suite.

### Pattern 2: Disabling Canvas in Tests

The MapRenderer generates PNG map images using an HTML canvas. jsdom does not provide
a real canvas implementation. Any test that runs the NavigationLoop must disable map
generation:

```typescript
const loop = new NavigationLoop(bridge, mockInfer, {
  generateMapImages: false,
});
```

Without this flag, the renderer will throw when it tries to call `canvas.getContext('2d')`.

### Pattern 3: The Coordinate System Pitfall

The WorldModel grid is centered at offset `(25, 25)`. When you call
`updatePose(0, 0, 0)`, the robot is at world origin, which maps to grid cell
`(25, 25)`. That cell gets marked as `explored`. If your test checks that the grid
center is `unknown` after setup, it will fail because the robot's initial pose already
modified it. Use offset positions when testing grid updates:

```typescript
// Good: robot at offset, center cell stays unknown
bridge.updateRobotPose({ x: 1.0, y: 1.0, rotation: 0 });

// Gotcha: robot at origin, marks grid center as explored
bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });
```

### Pattern 4: Mock Inference

The end-to-end tests create a deterministic mock LLM that parses candidates from the
prompt text and always picks the highest-scoring one:

```typescript
// __tests__/lib/runtime/navigation-e2e.test.ts

function createMockLLM(): InferenceFunction {
  return async (
    _systemPrompt: string,
    userMessage: string,
    _images?: string[]
  ): Promise<string> => {
    // Parse candidates from the prompt text
    const candidateRegex = /(\w+)\s+\[(\w+)\]\s+\(([^)]+)\)\s+score=([0-9.]+)/g;
    const candidates: Array<{
      id: string; type: string; pos: string; score: number
    }> = [];

    let match;
    while ((match = candidateRegex.exec(userMessage)) !== null) {
      candidates.push({
        id: match[1],
        type: match[2],
        pos: match[3],
        score: parseFloat(match[4]),
      });
    }

    // Pick best candidate...
  };
}
```

This approach tests the full pipeline -- serialization, prompt assembly, response
parsing, path planning -- without requiring any LLM inference. The mock is
deterministic, so test results are reproducible across machines.

For simpler unit tests, an even lighter mock suffices:

```typescript
const mockInfer = async () => JSON.stringify({
  action: { type: 'MOVE_TO', target_id: 'c1' },
  fallback: { if_failed: 'EXPLORE' },
  explanation: 'test'
});
const loop = new NavigationLoop(bridge, mockInfer);
```

---

## Test Arenas

The file `lib/runtime/test-arenas.ts` defines four predefined environments for
end-to-end testing. Each arena specifies walls, obstacles, beacons, a start pose,
a goal, and success criteria.

```typescript
// lib/runtime/test-arenas.ts

export interface TestArenaConfig {
  name: string;
  description: string;
  world: Robot4World;
  startPose: { x: number; y: number; rotation: number };
  goal: { x: number; y: number; text: string } | null;
  criteria: SuccessCriteria;
}

export interface SuccessCriteria {
  goalToleranceM: number;
  maxCollisions: number;
  minExploration: number;
  maxCycles: number;
  maxStuckCounter: number;
}
```

The four arenas cover distinct navigation challenges:

| Arena | Challenge | Key Constraint |
|-------|-----------|----------------|
| Simple Navigation | Corner-to-corner with 3 obstacles | 0 collisions, 100 cycles max |
| Exploration | Reach 80% coverage of 5x5m area | No goal, 150 cycles max |
| Dead-End Recovery | Escape L-shaped corridor | 0 collisions, 120 cycles max |
| Narrow Corridor | Thread a 0.6m gap | 0 collisions, 80 cycles max |

The `ARENA_SIMPLE_NAVIGATION` puts the robot in the bottom-left corner facing
northeast with three circular obstacles between it and the top-right goal. Zero
collisions allowed, 100 cycle limit. The arena definition in `lib/runtime/test-arenas.ts`
specifies walls as line segments, obstacles as circles with position and radius,
and criteria as hard pass/fail thresholds.

---

## The Test Suite at a Glance

The 21 test suites in `__tests__/lib/runtime/` cover the full stack: world model
(bridge, serializer, metrics, provider), navigation (types, e2e, runtime, LLM
corrections), vision (simulator, scene bridge, pipeline e2e), sensors (sensor bridge),
planning (candidate generator, local planner), the Phase 5 additions (predictive
world model, fleet coordinator, HAL bridge, UI bridge, OpenRouter inference), and the
V1 hardware layer (stepper kinematics, WiFi connection, firmware safety configuration,
serial protocol, command validator).

---

## Chapter Summary

The test suite is not an afterthought. It is the foundation that makes rapid
development possible. The `InferenceFunction` abstraction decouples the navigation
loop from any real LLM. The singleton cleanup pattern prevents cross-test
contamination. The four test arenas provide structured challenges that exercise
different navigation capabilities. When all 346 tests pass, you know that the
occupancy grid, the serializer, the candidate generator, the local planner, the
prompt builder, the decision parser, and the end-to-end pipeline all agree on how
the robot should behave.

---

*Previous: [Chapter 11 -- The Evolution Engine: Robots That Dream](11-evolution-engine.md)*
*Next: [Chapter 13 -- Getting Started: Your First 10 Minutes](13-getting-started.md)*
