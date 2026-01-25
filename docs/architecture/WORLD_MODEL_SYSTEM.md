# World Model System for Robot AI Agents

**Cognitive Understanding Through Progressive Exploration**

---

## Overview

The World Model System enables robot AI agents to build and maintain an internal representation of their environment. This transforms robots from simple reactive machines into intelligent agents that **understand** their world.

### Core Philosophy

> "An AI robot must first analyze the world and create an internal model before it can effectively plan and act."

Every intelligent robot agent should:
1. **Build understanding** - Create a mental map of the environment
2. **Track exploration** - Know what areas have been visited vs. unexplored
3. **Remember obstacles** - Store locations of hazards for future navigation
4. **Update beliefs** - Adapt the model when new data contradicts old assumptions
5. **Visualize understanding** - Generate ASCII representations for debugging

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    Robot AI Agent System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │   WorldModel     │←────│  ESP32 Agent     │                 │
│  │                  │     │  Runtime         │                 │
│  │  - Grid cells    │     │                  │                 │
│  │  - Robot path    │     │  - Sensor data   │                 │
│  │  - Obstacles     │     │  - LLM calls     │                 │
│  │  - Collectibles  │     │  - Tool execute  │                 │
│  └────────┬─────────┘     └──────────────────┘                 │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │   Mini-Map UI    │     │  Agent Panel     │                 │
│  │                  │     │                  │                 │
│  │  - Top-down view │     │  - ASCII maps    │                 │
│  │  - Exploration % │     │  - Camera shots  │                 │
│  │  - Real-time     │     │  - Messages      │                 │
│  └──────────────────┘     └──────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
lib/runtime/
├── world-model.ts         # WorldModel class and utilities
├── camera-capture.ts      # Screenshot capture from 3D view
├── esp32-agent-runtime.ts # Agent loop integration
└── behaviors/
    └── index.ts           # Behavior prompts with world modeling

components/robot/
├── RobotCanvas3D.tsx      # Mini-map component
└── RobotAgentPanel.tsx    # World model messages display
```

---

## World Model API

### Core Classes

#### WorldModel

```typescript
import { WorldModel, getWorldModel } from '@/lib/runtime/world-model';

// Get or create a world model for a device
const worldModel = getWorldModel(deviceId, {
  gridResolution: 10,   // 10cm per cell
  worldWidth: 500,      // 5m arena
  worldHeight: 500,     // 5m arena
});

// Update from sensor readings
worldModel.updateFromSensors(
  pose,       // { x, y, rotation }
  distance,   // { front, left, right, ... }
  timestamp
);

// Get exploration progress
const progress = worldModel.getExplorationProgress(); // 0.0 to 1.0

// Generate ASCII visualization
const asciiMap = worldModel.generateASCIIMap(robotPose, 21);

// Generate compact summary for LLM
const summary = worldModel.generateCompactSummary(robotPose);
```

### Grid Cell States

| State | Symbol | Description |
|-------|--------|-------------|
| `unknown` | `·` | Not yet observed |
| `free` | `.` | Safe to traverse |
| `explored` | `*` | Visited by robot |
| `obstacle` | `█` | Contains an obstacle |
| `wall` | `▓` | Wall boundary |
| `collectible` | `◆` | Contains item to collect |
| `collected` | `◇` | Item was collected |

### ASCII Visualization

```
┌─────────────────────────┐
│ WORLD MODEL (Robot View)│
├─────────────────────────┤
│ · · · · · · · · · · · · │
│ · · · . . . . . . · · · │
│ · · * * * . . █ . · · · │
│ · * * * ▲ * * . . · · · │
│ · * * * * * * . . · · · │
│ · · * * * . . . . · · · │
│ · · · · · · · · · · · · │
├─────────────────────────┤
│ Legend:                 │
│ · unknown  ░ boundary   │
│ . free     █ obstacle   │
│ * explored ◆ collectible│
│ ▲▶▼◀ robot direction    │
└─────────────────────────┘
```

---

## Integration with Agent Runtime

### Automatic World Model Updates

The RobotAgentPanel automatically updates the world model on each iteration:

```typescript
// In agent state change handler
if (state.lastSensorReading && worldModelRef.current) {
  worldModelRef.current.updateFromSensors(
    sensors.pose,
    sensors.distance,
    Date.now()
  );
}
```

### Periodic Visualization

World model summaries are automatically shown every 10 iterations:

```typescript
// Every 10 iterations, show world model status
if (state.iteration % 10 === 0) {
  const summary = worldModel.generateCompactSummary(pose);
  addMessage('world-model', summary);
}
```

### Camera Captures

Screenshots from the robot's view are captured every 5 iterations:

```typescript
// Every 5 iterations, capture camera view
if (state.iteration % 5 === 0) {
  const capture = captureScreenshot();
  addMessage('camera', 'Camera view', capture, capture.dataUrl);
}
```

---

## Agent Prompt Integration

### Explorer Behavior

The explorer agent prompt includes world modeling instructions:

```markdown
## Core Philosophy: BUILD UNDERSTANDING OF YOUR WORLD
As an AI robot, your PRIMARY task is to progressively build an internal
model of your environment. Every sensor reading should update your understanding.

## World Model Maintenance
You are continuously building a cognitive map:
- **Track explored areas** vs unexplored regions
- **Remember obstacle locations** and safe paths
- **Estimate your position** relative to known landmarks
- **Prefer unexplored directions** to maximize coverage
- **Update beliefs** when new sensor data contradicts old assumptions
```

### Response Format

Agents are instructed to report their world understanding:

```
OBSERVATION: Front=65cm, L=120cm, R=45cm. Position (0.5, 0.8), heading NE.
WORLD UPDATE: Obstacle detected ahead. Left path leads to unexplored area.
DECISION: Turn left toward unexplored region at moderate speed.
```

---

## UI Components

### Mini-Map Overlay

The RobotCanvas3D component includes an optional mini-map showing the world model:

```tsx
<RobotCanvas3D
  robotState={robotState}
  floorMap={floorMap}
  worldModel={worldModel}     // Pass world model
  showMiniMap={true}          // Enable mini-map
/>
```

Features:
- Real-time exploration progress percentage
- Color-coded cells (explored, obstacles, robot)
- Robot direction indicator
- Compact legend

### Agent Panel Messages

New message types in RobotAgentPanel:

| Type | Icon | Description |
|------|------|-------------|
| `camera` | 📷 | Camera screenshot from 3D view |
| `world-model` | 🗺️ | World model summary/ASCII map |

### Control Buttons

- **Capture**: Manually capture camera screenshot
- **World Map**: Show current world model ASCII visualization

---

## Configuration Options

### WorldModelConfig

```typescript
interface WorldModelConfig {
  gridResolution: number;    // Cell size in cm (default: 10)
  worldWidth: number;        // World width in cm (default: 500)
  worldHeight: number;       // World height in cm (default: 500)
  confidenceDecay: number;   // How quickly confidence decays (default: 0.995)
  explorationBonus: number;  // Bonus for exploring new areas (default: 0.1)
}
```

### Capture Settings

```typescript
interface CaptureConfig {
  width?: number;      // Image width (default: 320)
  height?: number;     // Image height (default: 240)
  quality?: number;    // JPEG quality 0.0-1.0 (default: 0.8)
  format?: 'png' | 'jpeg';  // Image format
}
```

---

## Best Practices

### 1. Encourage Exploration

Set up agent prompts to prefer unexplored areas:
- Use LED colors to indicate exploration vs. revisiting
- Track coverage percentage as a goal metric
- Reward moving toward unknown regions

### 2. Debugging with ASCII Maps

Use the ASCII visualization to understand robot behavior:
- Identify areas the robot hasn't reached
- Spot obstacles that were incorrectly detected
- Verify exploration patterns

### 3. Camera Context

Use camera captures to provide visual context:
- Show what the robot "sees" at key moments
- Debug sensor mismatches
- Understand navigation decisions

### 4. Memory Management

Clear world models when resetting:
```typescript
import { clearWorldModel, clearAllWorldModels } from '@/lib/runtime/world-model';

// Clear specific device
clearWorldModel(deviceId);

// Clear all
clearAllWorldModels();
```

---

## Future Enhancements

### Planned Features

1. **Persistent World Models**: Save/load world models between sessions
2. **Path Planning**: A* or similar algorithms using the world model
3. **Anomaly Detection**: Detect changes in previously mapped areas
4. **Multi-Robot Fusion**: Combine world models from multiple robots
5. **3D World Model**: Extend to vertical obstacles and terrain

### Research Directions

- **SLAM Integration**: More sophisticated localization
- **Semantic Mapping**: Label areas (e.g., "corner", "corridor")
- **Predictive Modeling**: Anticipate dynamic obstacles
- **Transfer Learning**: Apply learned maps to new environments

---

## Conclusion

The World Model System transforms robot AI agents from reactive machines into cognitive agents that understand their environment. By building and maintaining an internal representation of the world, robots can:

- Make better navigation decisions
- Explore more efficiently
- Remember and avoid hazards
- Provide meaningful feedback to users

This is a key step toward truly intelligent robot AI agents.
