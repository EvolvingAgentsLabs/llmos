---
name: GenerateRobotAgentPrompt
type: tool
version: "1.0"
description: Instructions for generating LLM-powered robot agents
tool_id: generate-robot-agent
variables: []
evolved_from: null
origin: extracted
extracted_from: lib/system-tools.ts:314-448
---

# Generate Robot Agent Tool

Generate an AI robot agent that autonomously controls a robot using LLM decision-making.

## When to Use

Use this tool when the user wants to create an autonomous robot behavior that:
- Makes decisions based on sensor readings
- Adapts to changing environments
- Uses LLM reasoning for navigation/control
- Continuously monitors and reacts to robot state
- Explores, avoids obstacles, follows lines, etc.

## Agent Architecture

The agent operates in a continuous control loop:

```
┌─────────────────────────────────────────────┐
│              Agent Control Loop              │
├─────────────────────────────────────────────┤
│  1. Read sensors (distance, line, battery)  │
│                    ↓                        │
│  2. Send state to LLM with system prompt    │
│                    ↓                        │
│  3. LLM decides next action (tool call)     │
│                    ↓                        │
│  4. Execute action (motors, LED)            │
│                    ↓                        │
│  5. Wait for loop interval                  │
│                    ↓                        │
│  6. Repeat from step 1                      │
└─────────────────────────────────────────────┘
```

## Available Robot Tools

The LLM can call these tools during each decision cycle:

### Motor Control

**drive_motors(left, right)**
- Control both motor powers simultaneously
- Power range: -255 (full reverse) to 255 (full forward)
- Example: `drive_motors(200, 200)` - forward
- Example: `drive_motors(150, -150)` - spin right
- Example: `drive_motors(100, 200)` - curve left

**stop_motors()**
- Immediately stop all motors
- Use for emergency stops or precise positioning

### LED Control

**set_led(r, g, b)**
- Set RGB LED color
- Values: 0-255 for each channel
- Example: `set_led(0, 255, 0)` - green (exploring)
- Example: `set_led(255, 255, 0)` - yellow (turning)
- Example: `set_led(255, 0, 0)` - red (obstacle)

### Sensor Reading

**get_sensors()**
- Read all sensor values
- Returns: `{ distance: [front, left, right], line: [left, center, right], battery: percentage }`

## System Prompt Guidelines

The system prompt defines the agent's behavior. It should include:

### 1. Role Definition
```
You are controlling a 2-wheeled differential drive robot in a [environment description].
```

### 2. Goal Statement
```
Your goal is to [specific objective: explore, avoid obstacles, follow line, etc.].
```

### 3. Sensor Interpretation
```
Sensor readings:
- Distance sensors: Values in cm. Lower = closer to obstacle.
- Line sensors: 0 = on line (dark), 1 = off line (light).
- Battery: Percentage remaining.
```

### 4. Decision Rules
```
Decision guidelines:
- If front distance < 30cm: Turn away from obstacle
- If side distances unequal: Favor the clearer side
- If battery < 20%: Return to starting position
```

### 5. LED Status Codes
```
Use LED to indicate status:
- Green (0,255,0): Normal exploration
- Yellow (255,255,0): Turning/maneuvering
- Red (255,0,0): Obstacle detected
- Blue (0,0,255): Goal reached
```

## Example System Prompts

### Wall Avoider
```
You are controlling a 2-wheeled robot in a 5m × 5m arena with walls and obstacles.

Your goal is to explore the arena while avoiding collisions.

Sensor interpretation:
- Distance[0] = front sensor (cm)
- Distance[1] = left sensor (cm)
- Distance[2] = right sensor (cm)
- Values below 30cm indicate nearby obstacle

Decision rules:
1. If front < 25cm: Stop and turn toward clearer side
2. If front < 50cm: Slow down, prepare to turn
3. If both sides blocked: Reverse and spin
4. Otherwise: Drive forward at moderate speed (150-180)

Use conservative speed (max 180) to allow reaction time.
LED: Green=exploring, Yellow=turning, Red=obstacle
```

### Line Follower
```
You are controlling a line-following robot on a track with a black line on white surface.

Your goal is to follow the line as accurately as possible.

Line sensor interpretation:
- line[0] = left sensor (0=on line, 1=off line)
- line[1] = center sensor
- line[2] = right sensor

Decision rules:
1. All sensors on line (0,0,0): Drive straight
2. Left on, others off: Turn left
3. Right on, others off: Turn right
4. Center only: Drive straight
5. All off: Stop, lost the line - reverse slowly

Speed: Keep moderate (120-150) for accurate tracking.
LED: Green=on track, Yellow=correcting, Red=lost line
```

### Maze Solver
```
You are controlling a robot in a maze. Find the exit marked by a beacon.

Your goal is to navigate the maze using wall-following strategy.

Strategy: Follow the right wall
1. If right side is clear (>40cm): Turn right and move forward
2. If front is clear (>30cm): Move forward
3. If front blocked: Turn left
4. Keep right wall at ~20-30cm distance

Memory: Track turns to avoid loops. If same position detected twice, try opposite direction.

LED: Blue=following wall, Green=found opening, Red=stuck
```

## Configuration Options

### Loop Interval
- Default: 2000ms (2 seconds)
- Minimum: 1000ms (1 second)
- Faster = more responsive but higher LLM costs
- Slower = lower cost but less reactive

### Max Iterations
- Default: unlimited
- Set to limit execution time
- Useful for testing (e.g., 10 iterations)

## Best Practices

1. **Start with simulation** - Test in virtual environment first
2. **Use conservative speeds** - Start at 100-150, increase gradually
3. **Include safety stops** - Always handle obstacle detection
4. **Log decisions** - Include reasoning in LLM responses for debugging
5. **Set LED status** - Visual feedback helps debugging
6. **Handle edge cases** - What if all sensors blocked? Battery low?
