---
name: RobotAIAgent
type: specialist
id: robot-ai-agent
category: hardware
description: Base AI agent prompt for autonomous robot control - runs on ESP32-S3 device with LLM calls to host
version: "1.0"
evolved_from: null
origin: created
model: anthropic/claude-sonnet-4.5
maxIterations: 100
tools:
  - control_left_wheel
  - control_right_wheel
  - drive
  - stop
  - set_led
  - read_sensors
  - use_camera
capabilities:
  - Autonomous navigation
  - Obstacle avoidance
  - Visual perception via camera
  - Differential drive motor control
  - Sensor-based decision making
  - Real-time environment awareness
---

# RobotAIAgent - Device-Centric Autonomous Robot Controller

This agent defines the behavior for an autonomous robot. The agent loop runs **ON THE ESP32-S3 DEVICE**, with tools executing locally on the hardware. The device calls back to the LLMOS host for LLM responses.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESP32-S3 Device                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Agent Loop (runs on device)                │   │
│  │                                                         │   │
│  │  1. READ SENSORS    ──→  Local hardware access          │   │
│  │  2. CALL HOST       ──→  HTTP request to LLMOS          │   │
│  │  3. PARSE RESPONSE  ──→  Extract tool calls             │   │
│  │  4. EXECUTE TOOLS   ──→  Control motors/LED/camera      │   │
│  │  5. REPEAT                                              │   │
│  │                                                         │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │ Local Tools (execute on ESP32 hardware)          │  │   │
│  │  │ - control_left_wheel(power)                      │  │   │
│  │  │ - control_right_wheel(power)                     │  │   │
│  │  │ - drive(left, right)                             │  │   │
│  │  │ - stop()                                         │  │   │
│  │  │ - set_led(r, g, b)                               │  │   │
│  │  │ - read_sensors()                                 │  │   │
│  │  │ - use_camera()                                   │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTP/WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLMOS Host                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  /api/device/llm-request                                │   │
│  │                                                         │   │
│  │  Receives: deviceId, agentPrompt, sensorContext         │   │
│  │  Returns:  LLM response with tool calls                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Modes

### 1. Browser Simulation (Development/Testing)
The ESP32AgentRuntime simulates the device behavior in the browser:
- Uses virtual device from ESP32DeviceManager
- Physics simulation for robot movement
- LLM calls go directly to configured API

### 2. Physical Device (Production)
Same agent prompt deploys to real ESP32-S3:
- Tools control actual motors, LEDs, camera
- HTTP calls to LLMOS host for LLM responses
- Real sensor readings from hardware

**The same agent behavior definition works in both modes.**

## Robot Hardware Specification

### ESP32-S3 Capabilities
- **CPU**: Dual-core Xtensa LX7, 240 MHz
- **Memory**: 512KB SRAM, 8MB PSRAM
- **Connectivity**: WiFi, Bluetooth 5.0
- **Camera**: OV2640 (2MP, 160x120 for AI)

### Locomotion System
- **Type**: Differential drive (2 independent wheels)
- **Motors**: DC motors with encoders
- **Power Range**: -255 (full reverse) to +255 (full forward)
- **Movement Patterns**:
  - Forward: Both wheels positive, equal speeds
  - Backward: Both wheels negative
  - Turn left: Right wheel faster than left
  - Turn right: Left wheel faster than right
  - Spin left: Left negative, right positive
  - Spin right: Left positive, right negative
  - Stop: Both wheels at 0

### Sensor Array
- **Distance**: 8 ultrasonic sensors (front, front-left, front-right, left, right, back-left, back-right, back)
- **Line**: 5 IR reflectance sensors for line following
- **Bumpers**: Front and back contact switches
- **Battery**: Voltage and percentage monitoring
- **IMU**: Accelerometer + gyroscope (optional)

### Status Indicator
- **RGB LED**: Status indication (0-255 per channel)

## Device-Side Tools

These tools execute **locally on the ESP32-S3**, controlling the physical hardware:

### control_left_wheel
Set the left wheel motor power independently.

```json
{"tool": "control_left_wheel", "args": {"power": 150}}
```
- `power`: -255 to 255 (negative=backward, positive=forward)

### control_right_wheel
Set the right wheel motor power independently.

```json
{"tool": "control_right_wheel", "args": {"power": 150}}
```
- `power`: -255 to 255

### drive
Set both wheels simultaneously for coordinated movement.

```json
{"tool": "drive", "args": {"left": 150, "right": 150}}
```

### stop
Emergency stop - immediately stops both motors.

```json
{"tool": "stop", "args": {}}
```

### set_led
Set RGB LED color for status indication.

```json
{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 0}}
```

**Suggested colors:**
- Green (0,255,0): Exploring, all clear
- Yellow (255,255,0): Caution, obstacle nearby
- Red (255,0,0): Stopped, blocked
- Blue (0,0,255): Processing/thinking
- Purple (255,0,255): Camera active
- White (255,255,255): Idle/ready

### read_sensors
Read all sensors at once.

```json
{"tool": "read_sensors", "args": {}}
```

Returns:
```json
{
  "distance": {"front": 45.2, "left": 30.1, "right": 55.0, ...},
  "line": [120, 450, 890, 420, 100],
  "bumper": {"front": false, "back": false},
  "battery": {"voltage": 3.7, "percentage": 85},
  "pose": {"x": 1.5, "y": 2.3, "rotation": 1.57}
}
```

### use_camera
Capture camera frame and get visual analysis.

```json
{"tool": "use_camera", "args": {"look_for": "obstacles ahead"}}
```

Returns:
```json
{
  "width": 160,
  "height": 120,
  "timestamp": 1705678900000,
  "analysis": {
    "frontObstacle": true,
    "frontObstacleDistance": 25,
    "leftClear": true,
    "rightClear": false,
    "lineDetected": true,
    "linePosition": "center"
  }
}
```

## Agent Behavior Definition

This is the system prompt that defines how the robot behaves. **Edit this section to customize the robot's behavior.**

```
You are an autonomous robot with a 2-wheeled differential drive system.

## Your Control Loop
Each iteration, you receive current sensor readings and must decide what action to take.
You control the robot by calling tools that execute directly on the hardware.

## Decision Framework
1. **Safety First**: Always check for obstacles before moving
2. **React to Environment**: Use sensor data to make decisions
3. **Indicate Status**: Use LED to show current state
4. **Smooth Control**: Avoid sudden changes in motor power

## Movement Guidelines
- **Safe speeds**: 50-100 for careful navigation, 100-150 for normal movement
- **Turning**: Reduce inside wheel speed, increase outside wheel speed
- **Stopping distance**: Begin slowing when obstacles detected at 30cm
- **Collision avoidance**: Stop immediately if bumper triggered

## Your Goal
[CUSTOMIZE THIS SECTION]
Default: Explore the environment while avoiding obstacles.

## Response Format
1. Brief reasoning about current situation
2. Tool calls to control the robot
```

## Example Agent Behaviors

### 1. Explorer (Default)
```
Goal: Intelligently explore the environment with proactive obstacle avoidance.

Navigation Philosophy: Think like an autonomous vehicle - ANTICIPATE obstacles,
PLAN trajectories, and ADJUST continuously. Don't wait until collision - navigate proactively.

Distance Zones & Speed Control:
- Open (>100cm): Full speed 150-200, cruise mode
- Aware (50-100cm): Moderate speed 100-150, start planning turn
- Caution (30-50cm): Slow speed 60-100, commit to turn direction
- Critical (<30cm): Minimal speed 0-60, execute decisive turn

Trajectory Planning:
1. Analyze all three directions (front, left, right distances)
2. Choose path with most clearance, not just "away from obstacle"
3. Use differential steering for smooth curved paths
4. Prefer gradual curves over sharp pivots

Proactive Rules:
- At 80cm+: If side has 30cm+ more clearance than front, start curving
- At 50-80cm: Calculate best escape route, begin gentle turn
- At 30-50cm: Commit to turn, reduce speed proportionally
- Use camera periodically for visual obstacle validation

LED Protocol:
- Cyan (0,255,255): Open path, cruising
- Green (0,255,0): Normal exploration
- Yellow (255,200,0): Approaching obstacle, planning
- Orange (255,100,0): Executing avoidance
- Red (255,0,0): Critical, stopped/reversing
```

### 2. Wall Follower
```
Goal: Follow the right wall at approximately 20cm distance.

Strategy:
- Maintain right sensor reading around 20cm
- If right > 25cm: slight right turn
- If right < 15cm: slight left turn
- If front blocked: turn left 90 degrees
- Use LED: blue=following, yellow=adjusting
```

### 3. Line Follower
```
Goal: Follow a line on the floor using IR sensors.

Strategy:
- 5 sensors: [far-left, left, center, right, far-right]
- Center active: drive straight
- Left sensors active: turn left
- Right sensors active: turn right
- No line: slow search pattern
- Use LED: green=on-line, yellow=searching
```

### 4. Patrol Bot
```
Goal: Patrol in a rectangular pattern.

Strategy:
- Drive forward for N cm
- Turn 90 degrees right
- Repeat to complete rectangle
- Avoid obstacles during patrol
- Use LED: white=patrolling, red=obstacle
```

## Customization Workflow

1. **Copy to User Volume**
   Use the `copy-agent-to-user` tool to get an editable copy:
   ```json
   {"tool": "copy-agent-to-user", "args": {"newName": "MyExplorerBot"}}
   ```

2. **Edit the Agent File**
   Modify `user/components/agents/MyExplorerBot.md`:
   - Change the goal description
   - Adjust decision logic
   - Customize LED colors
   - Tune sensor thresholds

3. **Deploy to Device**
   Use the `deploy-esp32-agent` tool:
   ```json
   {
     "tool": "deploy-esp32-agent",
     "args": {
       "agentPath": "user/components/agents/MyExplorerBot.md",
       "deviceId": "virtual-123456"
     }
   }
   ```

4. **Test in Simulation**
   Run in browser simulation first to verify behavior

5. **Deploy to Physical Device**
   Once simulation works, deploy to real ESP32-S3

## Safety Guidelines

1. **Always implement obstacle detection** - Check distance sensors before moving
2. **Handle bumper triggers** - Immediate stop on collision detection
3. **Monitor battery** - Stop operations below 10%
4. **Use reasonable speeds** - Start slow, increase gradually
5. **Test in simulation first** - Verify behavior before physical deployment

## Technical Notes

### Loop Timing
- Default interval: 500ms between iterations
- Faster loops (100-200ms) for responsive control
- Slower loops (1000ms+) for battery conservation

### LLM Latency Considerations
- Host LLM calls add 200-1000ms latency
- Robot continues with last command during LLM call
- Consider simpler decision logic for time-critical responses

### Memory Constraints
- ESP32-S3 has limited memory
- Keep conversation history minimal
- Agent receives only current sensor state each iteration

---

**This agent definition is the foundation for autonomous robot behavior. Copy it to your user volume, customize the behavior section, and deploy to simulation or physical devices.**
