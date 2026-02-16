/**
 * Navigation Prompt Template
 *
 * Assembles the structured prompt for the Runtime LLM's navigation reasoning.
 * Combines the world model JSON, symbolic layer, candidates, and context
 * into a format optimized for Qwen3-VL-8B (or any VLM with structured output).
 *
 * The prompt has two parts:
 *   1. System message: defines the robot's role, output schema, and rules
 *   2. User message: the current navigation frame (world model + candidates + state)
 *
 * Multimodal inputs (map image + camera frame) are attached separately
 * as image content blocks — this template generates the text portions.
 */

import type { NavigationFrame, LLMNavigationDecision } from './navigation-types';

// =============================================================================
// System Prompt (set once per session)
// =============================================================================

export const NAVIGATION_SYSTEM_PROMPT = `You are the navigation brain of a mobile robot operating in a 5m x 5m arena.

## Your Role
You receive a world model each cycle and choose WHERE the robot should go next.
You do NOT control motors directly — a local planner handles pathfinding.

## Input Format
Each cycle you receive:
1. **World Model** — RLE-encoded occupancy grid (U=unknown, F=free, E=explored, O=obstacle, W=wall)
2. **Symbolic Layer** — Named objects and waypoint topology
3. **Candidates** — 3-5 ranked subgoals with scores and notes
4. **State** — Your position, heading, battery, stuck status
5. **History** — Results of your last few decisions
6. **Images** — Top-down map and camera frame (when available)

## Output Format
You MUST respond with a valid JSON object matching this exact schema:

\`\`\`json
{
  "action": {
    "type": "MOVE_TO" | "EXPLORE" | "ROTATE_TO" | "FOLLOW_WALL" | "STOP",
    "target_id": "c1",
    "target_m": [x, y],
    "yaw_deg": 90
  },
  "fallback": {
    "if_failed": "EXPLORE" | "ROTATE_TO" | "STOP",
    "target_id": "f1"
  },
  "world_model_update": {
    "corrections": [
      {"pos_m": [x, y], "observed_state": "free" | "obstacle" | "unknown", "confidence": 0.8}
    ]
  },
  "explanation": "Moving toward the goal via wide clearance path, avoiding the obstacle cluster."
}
\`\`\`

## Rules
1. **Always select from candidates** — prefer target_id over target_m
2. **MOVE_TO** requires either target_id or target_m
3. **ROTATE_TO** requires yaw_deg
4. **Always provide a fallback** in case the primary action fails
5. **Always provide an explanation** (1-2 sentences)
6. **world_model_update is optional** — only suggest corrections you're confident about
7. **Your corrections are advisory** — the controller validates them against sensors
8. **If stuck**, prefer recovery or frontier candidates
9. **If goal is nearby** (< 0.5m), MOVE_TO the goal directly
10. **Never output anything except the JSON** — no commentary, no markdown outside the JSON`;

// =============================================================================
// User Message Assembly
// =============================================================================

/**
 * Build the text portion of the user message from a NavigationFrame.
 * Images (map + camera) are attached separately as multimodal content blocks.
 */
export function buildNavigationPrompt(frame: NavigationFrame): string {
  const lines: string[] = [];

  // Header
  lines.push(`=== CYCLE ${frame.cycle} ===`);
  lines.push(`GOAL: ${frame.goal}`);
  lines.push('');

  // State
  const s = frame.state;
  lines.push('STATE:');
  lines.push(`  position: (${s.position_m[0]}, ${s.position_m[1]})`);
  lines.push(`  heading: ${s.yaw_deg}°`);
  lines.push(`  mode: ${s.mode}`);
  lines.push(`  battery: ${s.battery_pct}%`);
  if (s.is_stuck) {
    lines.push(`  ⚠ STUCK for ${s.stuck_counter} cycles`);
  }
  lines.push('');

  // Last action result
  lines.push(`LAST ACTION: ${frame.last_step.action} → ${frame.last_step.result}`);
  if (frame.last_step.details) {
    lines.push(`  ${frame.last_step.details}`);
  }
  lines.push('');

  // World model summary
  const wm = frame.world_model;
  if (wm.frame === 'world') {
    lines.push('WORLD MODEL:');
    lines.push(`  grid: ${wm.grid_size[0]}x${wm.grid_size[1]} @ ${wm.resolution_m}m`);
    lines.push(`  exploration: ${(wm.exploration * 100).toFixed(1)}%`);
    lines.push(`  robot: (${wm.robot.pose_m[0]}, ${wm.robot.pose_m[1]}) heading ${wm.robot.yaw_deg}°`);
    if (wm.goal) {
      lines.push(`  goal: (${wm.goal.pose_m[0]}, ${wm.goal.pose_m[1]}) ±${wm.goal.tolerance_m}m`);
    }
    lines.push(`  occupancy: ${wm.occupancy_rle}`);
  } else {
    // Patch update
    lines.push('WORLD MODEL (patch):');
    lines.push(`  changes: ${wm.num_changes} cells updated`);
    lines.push(`  exploration: ${(wm.exploration * 100).toFixed(1)}%`);
    lines.push(`  robot: (${wm.robot.pose_m[0]}, ${wm.robot.pose_m[1]}) heading ${wm.robot.yaw_deg}°`);
    if (wm.num_changes > 0) {
      // Show first few changes
      const shown = wm.changes.slice(0, 5);
      for (const [x, y, state] of shown) {
        lines.push(`  [${x},${y}] → ${state}`);
      }
      if (wm.changes.length > 5) {
        lines.push(`  ... and ${wm.changes.length - 5} more`);
      }
    }
  }
  lines.push('');

  // Symbolic layer (compact)
  if (frame.symbolic_layer.objects.length > 0) {
    lines.push('OBJECTS:');
    for (const obj of frame.symbolic_layer.objects) {
      lines.push(`  ${obj.label || obj.id} (${obj.type}) at [${obj.bbox_m.join(',')}]`);
    }
    lines.push('');
  }

  if (frame.symbolic_layer.topology.waypoints.length > 0) {
    lines.push(`WAYPOINTS: ${frame.symbolic_layer.topology.waypoints.length} waypoints, ${frame.symbolic_layer.topology.edges.length} edges`);
    lines.push('');
  }

  // Candidates (the key decision input)
  lines.push('CANDIDATES:');
  for (const c of frame.candidates) {
    lines.push(`  ${c.id} [${c.type}] (${c.pos_m[0]}, ${c.pos_m[1]}) score=${c.score.toFixed(2)} — ${c.note}`);
  }
  lines.push('');

  // History
  if (frame.history.length > 0) {
    lines.push('HISTORY:');
    for (const h of frame.history) {
      lines.push(`  cycle ${h.cycle}: ${h.action} → ${h.result}`);
    }
    lines.push('');
  }

  lines.push('Respond with a JSON navigation decision:');

  return lines.join('\n');
}

// =============================================================================
// Multimodal Message Assembly
// =============================================================================

/**
 * Build the full multimodal message array for VLM APIs.
 * Returns an array of content blocks (text + images) suitable for
 * Claude, Qwen, or other VLM message formats.
 */
export function buildMultimodalMessage(
  frame: NavigationFrame
): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const blocks: Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string } }
  > = [];

  // Map image first (allocentric view — "where am I in the world")
  if (frame.map_image) {
    blocks.push({
      type: 'image_url',
      image_url: { url: frame.map_image },
    });
    blocks.push({
      type: 'text',
      text: '[Above: Top-down map of the arena. Green=robot, Red=goal, Blue/Orange=candidates]',
    });
  }

  // Camera frame (egocentric view — "what do I see right now")
  if (frame.camera_frame) {
    blocks.push({
      type: 'image_url',
      image_url: { url: frame.camera_frame },
    });
    blocks.push({
      type: 'text',
      text: '[Above: Current camera view from the robot]',
    });
  }

  // Main text prompt
  blocks.push({
    type: 'text',
    text: buildNavigationPrompt(frame),
  });

  return blocks;
}

// =============================================================================
// Fallback Decision
// =============================================================================

/**
 * Generate a deterministic fallback decision when the LLM fails.
 * Used when: LLM times out, returns invalid JSON, or communication lost.
 *
 * Strategy: STOP and wait. Safety first.
 */
export function getFallbackDecision(reason: string): LLMNavigationDecision {
  return {
    action: { type: 'STOP' },
    fallback: { if_failed: 'STOP' },
    explanation: `Fallback: ${reason}`,
  };
}

/**
 * Generate an exploration fallback when no goal is set.
 * Picks the first frontier candidate if available.
 */
export function getExplorationFallback(
  candidates: Array<{ id: string; type: string }>
): LLMNavigationDecision {
  const frontier = candidates.find(c => c.type === 'frontier');
  if (frontier) {
    return {
      action: { type: 'EXPLORE', target_id: frontier.id },
      fallback: { if_failed: 'ROTATE_TO' },
      explanation: 'Fallback: exploring nearest frontier',
    };
  }

  return {
    action: { type: 'ROTATE_TO', yaw_deg: 90 },
    fallback: { if_failed: 'STOP' },
    explanation: 'Fallback: rotating to scan for frontiers',
  };
}
