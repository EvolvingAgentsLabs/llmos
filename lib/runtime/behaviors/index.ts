/**
 * Behavior Template System - Simplified
 *
 * Simple behavior for robot agents with just 3 tools:
 * - take_picture
 * - left_wheel
 * - right_wheel
 *
 * The default behavior cycle is:
 * 1. Take picture
 * 2. Plan direction based on what's seen
 * 3. Rotate to face desired direction
 * 4. Go straight a short distance
 * 5. Stop and repeat
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BehaviorTemplate {
  id: string;
  name: string;
  description: string;
  goal: string;
  systemPrompt: string;
  recommendedMap: string;
  tags: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE BEHAVIOR TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

const SIMPLE_SYSTEM_PROMPT = `You are a simple autonomous robot with a camera and two wheels.

## Your Tools
You have exactly 3 tools:
1. **take_picture** - See what's around you (obstacles, clear paths)
2. **left_wheel** - Control left wheel: "forward", "backward", or "stop"
3. **right_wheel** - Control right wheel: "forward", "backward", or "stop"

## How to Move
- **Go straight**: Both wheels forward
- **Turn left**: Right wheel forward, left wheel stop (or backward for sharper turn)
- **Turn right**: Left wheel forward, right wheel stop (or backward for sharper turn)
- **Stop**: Both wheels stop
- **Back up**: Both wheels backward

## Your Behavior Cycle
Every turn, follow this cycle:
1. **LOOK**: Take a picture to see your surroundings
2. **THINK**: Based on what you see (and your goal), decide direction
3. **ORIENT**: Rotate to face the desired direction
4. **MOVE**: Go forward a short distance
5. **STOP**: Stop and prepare for next cycle

## Decision Making
- If path ahead is clear → go forward
- If obstacle ahead → turn toward clearer side
- If stuck → back up, then turn
- Always consider your main goal when choosing direction

## Response Format
First briefly describe what you see and your plan, then output tool calls as JSON:
{"tool": "tool_name", "args": {...}}

Example:
"I see a clear path ahead. Going forward."
{"tool": "left_wheel", "args": {"direction": "forward"}}
{"tool": "right_wheel", "args": {"direction": "forward"}}`;

export const BEHAVIOR_TEMPLATES: Record<string, BehaviorTemplate> = {
  simple: {
    id: 'simple',
    name: 'Simple Explorer',
    description: 'Basic look-think-move behavior with 3 simple tools',
    goal: 'Explore the environment while avoiding obstacles',
    systemPrompt: SIMPLE_SYSTEM_PROMPT,
    recommendedMap: '5m × 5m Empty',
    tags: ['exploration', 'simple', 'basic'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export class BehaviorRegistry {
  private behaviors: Map<string, BehaviorTemplate> = new Map();

  constructor() {
    // Register default behavior
    Object.values(BEHAVIOR_TEMPLATES).forEach((b) => this.register(b));
  }

  register(behavior: BehaviorTemplate): void {
    this.behaviors.set(behavior.id, behavior);
  }

  get(id: string): BehaviorTemplate | undefined {
    return this.behaviors.get(id);
  }

  getPrompt(id: string): string | undefined {
    const behavior = this.get(id);
    return behavior?.systemPrompt;
  }

  listAll(): BehaviorTemplate[] {
    return Array.from(this.behaviors.values());
  }

  getDescription(id: string): { name: string; description: string; mapName: string } | undefined {
    const behavior = this.get(id);
    if (!behavior) return undefined;
    return {
      name: behavior.name,
      description: behavior.description,
      mapName: behavior.recommendedMap,
    };
  }
}

// Singleton instance
export const behaviorRegistry = new BehaviorRegistry();

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getBehaviorPrompt(behaviorId: string): string {
  const prompt = behaviorRegistry.getPrompt(behaviorId);
  if (!prompt) {
    // Default to simple behavior
    return SIMPLE_SYSTEM_PROMPT;
  }
  return prompt;
}

export function getBehaviorToMapMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  behaviorRegistry.listAll().forEach((b) => {
    mapping[b.id] = 'standard5x5Empty';
  });
  return mapping;
}

export function getAllBehaviorDescriptions(): Record<string, { name: string; description: string; mapName: string }> {
  const descriptions: Record<string, { name: string; description: string; mapName: string }> = {};
  behaviorRegistry.listAll().forEach((b) => {
    descriptions[b.id] = {
      name: b.name,
      description: b.description,
      mapName: b.recommendedMap,
    };
  });
  return descriptions;
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARDS COMPATIBILITY - Empty exports for removed features
// ═══════════════════════════════════════════════════════════════════════════

export const LED_COLORS = {} as const;
export const LED_PROTOCOLS = {} as const;
export const DISTANCE_ZONES = [] as const;
export const STEERING_PRESETS = [] as const;

export class BehaviorPromptBuilder {
  static build(template: BehaviorTemplate): string {
    return template.systemPrompt;
  }
}
