#!/usr/bin/env npx tsx
/**
 * Navigation Demo Script
 *
 * Runs a complete navigation session using the LLMos navigation stack.
 * Can use either a mock LLM (deterministic, for testing) or a real
 * LLM via OpenRouter (for actual navigation demos).
 *
 * Usage:
 *   npx tsx scripts/run-navigation.ts                     # Mock LLM, simple arena
 *   npx tsx scripts/run-navigation.ts --arena exploration  # Mock LLM, exploration arena
 *   npx tsx scripts/run-navigation.ts --live               # Real LLM via OpenRouter
 *   npx tsx scripts/run-navigation.ts --all                # Run all arenas
 *   npx tsx scripts/run-navigation.ts --vision             # Vision mode (simulated camera)
 *
 * Environment:
 *   OPENROUTER_API_KEY=sk-...   (required for --live mode)
 */

import { NavigationRuntime, type NavigationRunResult } from '../lib/runtime/navigation-runtime';
import { createMockInference, createOpenRouterInference } from '../lib/runtime/llm-inference';
import { ALL_TEST_ARENAS, type TestArenaConfig } from '../lib/runtime/test-arenas';
import { formatEvaluationReport } from '../lib/runtime/navigation-evaluator';
import type { InferenceFunction } from '../lib/runtime/navigation-loop';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
  arena: string;
  live: boolean;
  all: boolean;
  verbose: boolean;
  vision: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  return {
    arena: args.find((_, i) => args[i - 1] === '--arena') ?? 'simple',
    live: args.includes('--live'),
    all: args.includes('--all'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    vision: args.includes('--vision'),
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs();

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       LLMos Navigation Runtime Demo             ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Create inference function
  let infer: InferenceFunction;
  if (args.live) {
    console.log('Mode: LIVE (Qwen3-VL-8B via OpenRouter)');
    try {
      infer = createOpenRouterInference();
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  } else {
    console.log(`Mode: MOCK (deterministic strategy)`);
    infer = createMockInference();
  }
  console.log(`Bridge: ${args.vision ? 'VISION (simulated camera)' : 'GROUND-TRUTH (full arena rasterization)'}`);
  console.log('');

  // Select arenas
  const arenas: Array<[string, TestArenaConfig]> = args.all
    ? Object.entries(ALL_TEST_ARENAS)
    : [[args.arena, ALL_TEST_ARENAS[args.arena]]];

  if (!arenas[0][1]) {
    console.error(`Unknown arena: "${args.arena}". Available: ${Object.keys(ALL_TEST_ARENAS).join(', ')}`);
    process.exit(1);
  }

  // Run each arena
  const results: NavigationRunResult[] = [];

  for (const [key, arena] of arenas) {
    console.log(`─── Arena: ${arena.name} ───`);
    console.log(`  ${arena.description}`);
    if (arena.goal) {
      console.log(`  Goal: (${arena.goal.x}, ${arena.goal.y}) — ${arena.goal.text}`);
    } else {
      console.log(`  Mode: Exploration (no specific goal)`);
    }
    console.log(`  Max cycles: ${arena.criteria.maxCycles}`);
    console.log('');

    const runtime = new NavigationRuntime(arena, infer, {
      bridgeMode: args.vision ? 'vision' : 'ground-truth',
      onCycle: args.verbose ? (cycle, result, entry) => {
        const pos = `(${entry.pose.x.toFixed(2)}, ${entry.pose.y.toFixed(2)})`;
        const action = result.decision.action.type;
        const target = result.decision.action.target_id ?? '';
        const goalDist = entry.goalDistanceM !== null
          ? ` goal=${entry.goalDistanceM.toFixed(2)}m`
          : '';
        const coll = entry.collision ? ' [COLLISION]' : '';
        console.log(`  [${String(cycle).padStart(3)}] ${pos} ${action} ${target}${goalDist}${coll}`);
      } : undefined,
    });

    const result = await runtime.run();
    results.push(result);

    // Print report
    console.log('');
    console.log(result.report);
    console.log(`  Wall-clock time: ${result.totalTimeMs}ms`);
    console.log('');
  }

  // Summary
  if (results.length > 1) {
    console.log('═══ Summary ═══');
    const passed = results.filter(r => r.evaluation.passed).length;
    console.log(`  ${passed}/${results.length} arenas passed`);
    for (const r of results) {
      const icon = r.evaluation.passed ? '+' : '-';
      console.log(`  [${icon}] ${r.evaluation.arenaName} (${r.evaluation.passedCount}/${r.evaluation.totalCount})`);
    }
    console.log('');
  }

  // Exit code
  const allPassed = results.every(r => r.evaluation.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
