# ESP32 Hardware Integration Guide

**Last Updated:** January 2026

LLMos treats **physical hardware as a first-class citizen**. This comprehensive guide covers everything from quick start to advanced integration testing for ESP32 and ESP32-S3 devices.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Robot4 Architecture](#robot4-architecture)
3. [Complete Tutorial](#complete-tutorial)
4. [Physical ESP32 Setup](#physical-esp32-setup)
5. [Firmware Development](#firmware-development)
6. [Browser-Based WASM Compilation](#browser-based-wasm-compilation)
7. [LLM Tools for Robot Control](#llm-tools-for-robot-control)
8. [Building Custom Applets](#building-custom-applets)
9. [Advanced Examples](#advanced-examples)
10. [Fleet Management](#fleet-management)
11. [Integration Testing](#integration-testing)
12. [Troubleshooting](#troubleshooting)

---

## Quick Start

### No Hardware Needed - Test with Virtual Device

**NEW: You can now test without physical ESP32 hardware!**

#### 1. Start the Dev Server

```bash
cd llmos
npm install
npm run dev
```

Open http://localhost:3000

#### 2. Create a Virtual Robot

In the LLMos chat interface, type:

```
Create a virtual cube robot for simulation
```

**What happens:**
- SystemAgent uses `create-virtual-device` tool
- Virtual ESP32-S3 instance with physics simulation
- Returns deviceId: `virtual-1704134567-abc123`

**Expected response:**
```
Created virtual robot "Robot-1" (virtual-1704134567-abc123)
Device type: virtual
Status: connected
Map: ovalTrack
```

#### 3. Control the Robot

**Drive forward:**
```
Drive the robot forward at speed 150
```

**Turn left:**
```
Spin the robot left
```

**Set LED color:**
```
Set the robot LED to green
```

**Get robot state:**
```
Show me the robot's current position and sensors
```

#### 4. Load a Game

**Load built-in line follower:**
```
Load the line follower game on my robot
```

**Start the simulation:**
```
Start the robot device
```

#### 5. Available Floor Maps

The simulation includes several preset floor maps:

| Map Name | Description |
|----------|-------------|
| `ovalTrack` | Simple oval line-following track |
| `maze` | Maze with walls and obstacles |
| `figure8` | Figure-8 track with crossing |
| `obstacleArena` | Open arena with scattered obstacles |

**Change the map:**
```
Set the floor map to maze
```

### Testing with Physical Device

**In the chat interface:**

```
Connect to my ESP32 device
```
→ Browser will show device picker

```
Turn on pin 2
```
→ Sends: `{"action":"set_gpio","pin":2,"state":1}`

```
Read the voltage on ADC pin 1
```
→ Sends: `{"action":"read_adc","pin":1}`

```
Monitor the device every 2 seconds
```
→ Creates device project with cron polling

### Check Device State

After monitoring is active (works for both virtual and physical devices):

```
Show me the current sensor data
```
→ Reads from `projects/<device-name>/state/sensors.json`

---

## Robot4 Architecture

Robot4 is a WASM4-inspired API for robot firmware. Think of it as a "Game Boy for Robots" - simple, constrained, and deterministic.

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      LLMos Browser Environment                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ C Source    │───>│ Wasmer/Clang│───>│ WASM Binary │         │
│  │ (robot4.h)  │    │ (in browser)│    │ (.wasm)     │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                                │                 │
│        ┌───────────────────────────────────────┼─────────────┐  │
│        ▼                                       ▼             │  │
│  ┌─────────────────────┐         ┌─────────────────────┐    │  │
│  │ Browser Simulation  │         │ Physical Hardware   │    │  │
│  │ - VirtualESP32      │         │ - ESP32-S3 WAMR     │    │  │
│  │ - CubeRobotSimulator│         │ - WASMachine        │    │  │
│  │ - 3D Visualization  │         │ - TCP Deploy:8080   │    │  │
│  └─────────────────────┘         └─────────────────────┘    │  │
│                                                              │  │
└──────────────────────────────────────────────────────────────┘  │
```

**Key Benefits:**
- Zero backend - everything runs in the browser
- Privacy-first - code never leaves your machine
- Same code runs in simulation AND on hardware
- 60Hz game loop with deterministic physics
- Hot-swappable firmware without reflashing

### Memory-Mapped I/O

Following WASM4's design, Robot4 uses memory-mapped registers:

```c
// ═══════════════════════════════════════════════════════════════
//                     ROBOT4 MEMORY MAP
// ═══════════════════════════════════════════════════════════════

#define R4_MOTORS        ((volatile int16_t*)0x00)   // Left/Right PWM (-255 to 255)
#define R4_ENCODERS      ((volatile int32_t*)0x04)   // Encoder ticks
#define R4_LED           ((volatile uint8_t*)0x19)   // R,G,B values
#define R4_SENSORS       ((volatile uint8_t*)0x1C)   // 8 distance sensors (cm)
#define R4_LINE          ((volatile uint8_t*)0x24)   // 5 line sensors
#define R4_BUTTONS       ((volatile uint8_t*)0x29)   // Bumper switches
#define R4_TICK_COUNT    ((volatile uint32_t*)0x30)  // Milliseconds since boot
```

### Robot4 API Header

```c
// robot4.h - The "Game Boy for Robots" API

// Core callbacks (implement these in your game)
void start(void);   // Called once at startup
void update(void);  // Called 60 times per second

// Convenience macros
#define drive(left, right) do { \
    R4_MOTORS[0] = (int16_t)(left); \
    R4_MOTORS[1] = (int16_t)(right); \
} while(0)

#define stop() drive(0, 0)

#define distance(idx) (R4_SENSORS[(idx)])

#define led(r, g, b) do { \
    R4_LED[0] = (r); R4_LED[1] = (g); R4_LED[2] = (b); \
} while(0)

// Runtime-provided functions
extern void trace(const char* message);
extern void tone(uint32_t freq, uint32_t duration, uint8_t volume);
extern uint32_t random(void);
```

### Differential Drive Kinematics

The cube robot uses differential drive:

```
Linear Velocity:  v = (v_right + v_left) / 2
Angular Velocity: ω = (v_right - v_left) / wheel_base

Position Update (per dt):
  rotation += ω * dt
  x += v * cos(rotation) * dt
  y += v * sin(rotation) * dt
```

### Movement Patterns

| Left Motor | Right Motor | Movement |
|------------|-------------|----------|
| +150 | +150 | Forward |
| -150 | -150 | Backward |
| +100 | -100 | Spin Right (CW) |
| -100 | +100 | Spin Left (CCW) |
| +150 | +80 | Curve Right |
| +80 | +150 | Curve Left |
| 0 | 0 | Stop |

---

## Complete Tutorial

### Overview

This section provides a complete walkthrough of the ESP32-S3 integration, from setup to deployment.

### Hardware Requirements

**Supported Boards:**
- ESP32-S3-DevKitC (recommended)
- ESP32-DevKitC
- Any ESP32/ESP32-S3 with USB CDC support

**Cube Robot Components:**

| Component | Specification | Purpose |
|-----------|---------------|---------|
| MCU | ESP32-S3 (240MHz, 512KB SRAM) | Run WAMR + robot control |
| Motors | 2x DC motors with encoders | Differential drive |
| Motor Driver | TB6612FNG or L298N | PWM control |
| Distance Sensors | HC-SR04 ultrasonic (x3-8) | Obstacle detection |
| Line Sensors | QTR-5RC array | Line following |
| LED | WS2812B RGB | Status indication |
| Battery | 2S LiPo (7.4V, 1000mAh) | ~30 min runtime |

### Wiring Diagram

```
ESP32-S3                    Components
=========                   ===========

GPIO 16 (PWM) ────────────── Motor Left PWM
GPIO 17 (DIR) ────────────── Motor Left Direction
GPIO 18 (PWM) ────────────── Motor Right PWM
GPIO 19 (DIR) ────────────── Motor Right Direction

GPIO 4  ──────────────────── Ultrasonic Front TRIG
GPIO 5  ──────────────────── Ultrasonic Front ECHO
GPIO 6  ──────────────────── Ultrasonic Left TRIG
GPIO 7  ──────────────────── Ultrasonic Left ECHO

GPIO 32-36 ───────────────── QTR-5RC Line Sensors

GPIO 48 ──────────────────── WS2812B LED Data

ENC_A (GPIO 21) ──────────── Left Encoder A
ENC_B (GPIO 22) ──────────── Left Encoder B
ENC_A (GPIO 23) ──────────── Right Encoder A
ENC_B (GPIO 24) ──────────── Right Encoder B
```

---

## Physical ESP32 Setup

For collaborators working with physical ESP32 devices.

### Minimal Test Firmware

See the Firmware Development section below for complete Arduino code.

### Quick Test via Serial Terminal

1. Flash firmware to ESP32-S3
2. Open serial monitor (115200 baud)
3. Send test commands:

```json
{"action":"get_info"}
{"action":"set_gpio","pin":2,"state":1}
{"action":"read_gpio","pin":2}
{"action":"read_adc","pin":1}
```

Expected responses:
```json
{"status":"ok","device":"ESP32-S3",...}
{"status":"ok","msg":"GPIO set"}
{"status":"ok","pin":2,"state":1}
{"status":"ok","pin":1,"value":2048,"voltage":1.65}
```

---

## Firmware Development

### JSON Protocol Firmware

For direct control from LLMos, use the JSON protocol:

```cpp
/**
 * LLMos ESP32 Firmware - JSON Protocol
 * Baud Rate: 115200
 */

#include <Arduino.h>
#include <ArduinoJson.h>

JsonDocument doc;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(2, OUTPUT);
  Serial.println("{\"status\":\"ok\",\"msg\":\"ESP32-S3 ready\"}");
}

void loop() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() == 0) return;

    DeserializationError error = deserializeJson(doc, input);
    if (error) {
      sendError("JSON parse error");
      return;
    }

    String action = doc["action"].as<String>();

    if (action == "drive") {
      handleDrive();
    } else if (action == "stop") {
      handleStop();
    } else if (action == "set_led") {
      handleSetLED();
    } else if (action == "get_pose") {
      handleGetPose();
    } else if (action == "get_info") {
      handleGetInfo();
    } else {
      sendError("Unknown action: " + action);
    }
  }
}

void handleDrive() {
  int left = doc["l"];
  int right = doc["r"];

  setMotors(left, right);

  JsonDocument response;
  response["status"] = "ok";
  response["msg"] = "motors set";
  serializeJson(response, Serial);
  Serial.println();
}

void handleStop() {
  setMotors(0, 0);

  JsonDocument response;
  response["status"] = "ok";
  response["msg"] = "motors stopped";
  serializeJson(response, Serial);
  Serial.println();
}

void handleSetLED() {
  int r = doc["r"];
  int g = doc["g"];
  int b = doc["b"];

  setLED(r, g, b);

  JsonDocument response;
  response["status"] = "ok";
  response["msg"] = "LED color set";
  serializeJson(response, Serial);
  Serial.println();
}

void sendError(String msg) {
  JsonDocument response;
  response["status"] = "error";
  response["msg"] = msg;
  serializeJson(response, Serial);
  Serial.println();
}
```

### WASMachine Firmware

For autonomous WASM apps, flash the ESP-WASMachine firmware:

```bash
# Clone ESP-WASMachine
git clone https://github.com/espressif/esp-wasmachine.git
cd esp-wasmachine

# Configure for ESP32-S3
idf.py set-target esp32s3
idf.py menuconfig
# Enable: Component config → WASM Micro Runtime → Interpreter mode

# Build and flash
idf.py build flash monitor
```

---

## Browser-Based WASM Compilation

**LLMos compiles C code to WebAssembly entirely in your browser** - no backend required!

### Browser→ESP32 Deployment Flow

```mermaid
graph TD
    A[User writes C code] --> B[Browser: Wasmer SDK]
    B --> C[Compile C → WASM]
    C --> D{Deployment Target?}
    D -->|Virtual| E[VirtualESP32 Simulator]
    D -->|Physical| F[TCP Deploy to ESP32:8080]
    E --> G[Physics Simulation + Visualization]
    F --> H[WAMR Runtime on ESP32-S3]
    H --> I[Robot Hardware Control]
```

### How It Works

```mermaid
sequenceDiagram
    participant User
    participant LLMos
    participant WasmerSDK
    participant Clang

    User->>LLMos: Write C code with robot4.h
    LLMos->>WasmerSDK: Load Wasmer SDK from CDN
    WasmerSDK->>Clang: Initialize Clang WASM
    LLMos->>Clang: Compile C → WASM
    Clang-->>LLMos: Binary output
    LLMos->>User: Deploy to virtual or physical device
```

### Compilation Example

```typescript
import { WasmCompiler } from '@/lib/runtime/wasm-compiler';

const compiler = WasmCompiler.getInstance();
await compiler.initialize(); // Loads Clang from CDN (~30MB, cached)

const result = await compiler.compile({
  source: `
    #include "robot4.h"

    void start(void) {
      led(0, 255, 0);
    }

    void update(void) {
      int front = distance(0);
      if (front < 30) {
        drive(-100, 100);
      } else {
        drive(150, 150);
      }
    }
  `,
  name: 'wall_avoider',
  optimizationLevel: '3'
});

// result.wasmBinary contains compiled WebAssembly
```

### Performance

| Operation | First Time | Subsequent |
|-----------|------------|------------|
| SDK Load | ~30MB, 5-10s | Instant (cached) |
| Compilation | 2-5 seconds | 1-3 seconds |
| Deploy to Virtual | <100ms | <100ms |
| Deploy to Physical | 1-2 seconds | 1-2 seconds |

### Available Headers

Headers loaded automatically from `/public/sdk/wasi-headers/`:
- `robot4.h` - Robot4 API
- `wm_ext_wasm_native.h` - GPIO, WiFi, HTTP
- `wm_ext_wasm_native_mqtt.h` - MQTT client
- `wm_ext_wasm_native_rainmaker.h` - ESP RainMaker cloud

---

## LLM Tools for Robot Control

LLMos provides natural language tools for robot control:

### Device Management

| Tool | Description | Example |
|------|-------------|---------|
| `create-virtual-device` | Create virtual robot | "Create a virtual robot" |
| `list-robot-devices` | List all robots | "Show connected robots" |
| `disconnect-robot-device` | Remove device | "Disconnect Robot-1" |

### Robot Control

| Tool | Description | Example |
|------|-------------|---------|
| `drive-robot` | Set motor speeds | "Drive forward at 150" |
| `stop-robot` | Stop all motors | "Stop the robot" |
| `set-robot-led` | Set LED color | "Make the LED blue" |
| `get-robot-state` | Get telemetry | "Where is the robot?" |

### Games & Maps

| Tool | Description | Example |
|------|-------------|---------|
| `load-robot-game` | Load game template | "Load line follower game" |
| `list-robot-games` | Show available games | "What games are available?" |
| `set-floor-map` | Change arena | "Use the maze map" |
| `list-floor-maps` | Show available maps | "What maps are there?" |

### Device Lifecycle

| Tool | Description | Example |
|------|-------------|---------|
| `start-robot-device` | Begin simulation | "Start the robot" |
| `stop-robot-device` | Pause simulation | "Pause the robot" |
| `reset-robot-device` | Reset to start | "Reset robot position" |

### Natural Language Examples

```
User: "Create a virtual robot and make it drive in a circle"

SystemAgent:
1. Uses create-virtual-device → Gets deviceId
2. Uses start-robot-device → Begins simulation
3. Uses drive-robot with left=100, right=180 → Curved motion
```

```
User: "Load the obstacle avoidance game and show me the robot's sensors"

SystemAgent:
1. Uses load-robot-game with gameName="obstacleAvoidance"
2. Uses start-robot-device
3. Uses get-robot-state → Returns sensor readings
```

---

## Building Custom Applets

### Robot Control Dashboard

**User prompt:** "Create an applet with a D-pad to control the robot"

```javascript
function Applet() {
  const [motors, setMotors] = useState({ left: 0, right: 0 });
  const [led, setLed] = useState({ r: 0, g: 255, b: 0 });

  async function drive(left, right) {
    setMotors({ left, right });
    await window.__executeSystemTool('drive-robot', {
      deviceId: 'virtual-...',
      left,
      right
    });
  }

  async function stop() {
    setMotors({ left: 0, right: 0 });
    await window.__executeSystemTool('stop-robot', {
      deviceId: 'virtual-...'
    });
  }

  const btnClass = "w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-xl";

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4 text-center">Robot Control</h2>

      <div className="flex justify-center mb-4">
        <div className="grid grid-cols-3 gap-1">
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(150, 150)} onMouseUp={stop}>↑</button>
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(-100, 100)} onMouseUp={stop}>←</button>
          <button className={btnClass} onClick={stop}>■</button>
          <button className={btnClass} onMouseDown={() => drive(100, -100)} onMouseUp={stop}>→</button>
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(-150, -150)} onMouseUp={stop}>↓</button>
          <div></div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-gray-800 p-2 rounded">
        <span className="text-sm text-gray-400">Motors:</span>
        <span>L: {motors.left} R: {motors.right}</span>
      </div>
    </div>
  );
}
```

### Sensor Dashboard

**User prompt:** "Create an applet showing real-time sensor readings"

```javascript
function Applet() {
  const [state, setState] = useState(null);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (deviceId) {
        const result = await window.__executeSystemTool('get-robot-state', { deviceId });
        if (result.success) {
          setState(result);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [deviceId]);

  if (!state) {
    return <div className="p-4">Connect a robot first...</div>;
  }

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4">Robot Telemetry</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Position */}
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">Position</h3>
          <div>X: {state.robot.pose.x}</div>
          <div>Y: {state.robot.pose.y}</div>
          <div>θ: {state.robot.pose.rotation}</div>
        </div>

        {/* Sensors */}
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">Distance Sensors</h3>
          <div>Front: {state.robot.sensors.distanceFront}</div>
          <div>Left: {state.robot.sensors.distanceLeft}</div>
          <div>Right: {state.robot.sensors.distanceRight}</div>
        </div>

        {/* Battery */}
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">Battery</h3>
          <div className="text-2xl font-bold text-green-400">
            {state.robot.battery.percentage}
          </div>
        </div>

        {/* Motors */}
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">Motors</h3>
          <div>Left: {state.robot.motors.left}</div>
          <div>Right: {state.robot.motors.right}</div>
        </div>
      </div>
    </div>
  );
}
```

---

## Advanced Examples

### Example 1: Line Following Robot

```c
#include "robot4.h"

#define BASE_SPEED 150
#define KP 25

void start(void) {
    trace("Line Racer v1.0");
}

void update(void) {
    // Read 5 line sensors (0=white, 255=black)
    int sensors[5];
    for (int i = 0; i < 5; i++) {
        sensors[i] = R4_LINE[i];
    }

    // Calculate weighted position
    int position =
        -200 * (sensors[0] > 128 ? 1 : 0) +
        -100 * (sensors[1] > 128 ? 1 : 0) +
           0 * (sensors[2] > 128 ? 1 : 0) +
         100 * (sensors[3] > 128 ? 1 : 0) +
         200 * (sensors[4] > 128 ? 1 : 0);

    int count = 0;
    for (int i = 0; i < 5; i++) {
        if (sensors[i] > 128) count++;
    }
    if (count > 0) position /= count;

    // PD control
    int correction = (position * KP) / 100;

    int left_speed = BASE_SPEED + correction;
    int right_speed = BASE_SPEED - correction;

    // Clamp speeds
    if (left_speed > 255) left_speed = 255;
    if (left_speed < -255) left_speed = -255;
    if (right_speed > 255) right_speed = 255;
    if (right_speed < -255) right_speed = -255;

    drive(left_speed, right_speed);

    // LED indicates position
    if (position < -50) {
        led(255, 0, 0);  // Red = too far left
    } else if (position > 50) {
        led(0, 0, 255);  // Blue = too far right
    } else {
        led(0, 255, 0);  // Green = centered
    }
}
```

### Example 2: Maze Solver (Wall Following)

```c
#include "robot4.h"

#define SPEED 120
#define WALL_DISTANCE 40

typedef enum {
    FOLLOW_WALL,
    TURN_LEFT,
    TURN_RIGHT,
    FORWARD_CLEAR
} State;

State state = FOLLOW_WALL;

void start(void) {
    trace("Maze Runner v1.0");
}

void update(void) {
    int front = distance(0);
    int left = distance(3);
    int right = distance(4);

    switch (state) {
        case FOLLOW_WALL:
            if (front < WALL_DISTANCE) {
                // Wall ahead, need to turn
                if (right > left) {
                    state = TURN_RIGHT;
                    led(255, 128, 0);
                } else {
                    state = TURN_LEFT;
                    led(255, 255, 0);
                }
            } else if (right < WALL_DISTANCE) {
                // Following right wall
                int error = WALL_DISTANCE - right;
                int correction = error / 2;
                drive(SPEED - correction, SPEED + correction);
                led(0, 255, 0);
            } else {
                // No wall on right, turn right to find one
                drive(SPEED, SPEED / 2);
                led(0, 255, 255);
            }
            break;

        case TURN_LEFT:
            drive(-SPEED, SPEED);
            if (front > WALL_DISTANCE + 20) {
                state = FOLLOW_WALL;
            }
            break;

        case TURN_RIGHT:
            drive(SPEED, -SPEED);
            if (front > WALL_DISTANCE + 20) {
                state = FOLLOW_WALL;
            }
            break;
    }
}
```

### Example 3: Multi-Device Coordination

```javascript
// Coordinate multiple virtual robots

// Create fleet
const devices = [];
for (let i = 0; i < 3; i++) {
  const result = await executeSystemTool('create-virtual-device', {
    name: `Robot-${i + 1}`,
    mapName: 'obstacleArena'
  });
  devices.push(result.deviceId);
}

// Formation driving
async function driveFormation(direction, speed) {
  const commands = devices.map((deviceId, index) => {
    const offset = (index - 1) * 20; // Stagger formation
    return executeSystemTool('drive-robot', {
      deviceId,
      left: speed + offset,
      right: speed - offset
    });
  });

  await Promise.all(commands);
}

// Start all
await executeSystemTool('start-all-robot-devices');

// Drive formation forward
await driveFormation('forward', 150);
```

---

## Fleet Management

The ESP32 Device Manager supports fleet-wide operations:

### Creating a Fleet

```
User: "Create 3 virtual robots for swarm testing"

SystemAgent:
1. Uses create-virtual-device × 3
2. Returns: Robot-1, Robot-2, Robot-3 with unique IDs
```

### Fleet Commands

```
User: "Start all robots"
→ Uses start-all-robot-devices

User: "Stop all robots"
→ Uses stop-all-robot-devices

User: "Reset all robots to starting positions"
→ Uses reset-all-robot-devices
```

### Fleet Configuration

```typescript
interface FleetConfig {
  syncMode: 'independent' | 'synchronized' | 'leader-follower';
  leaderDeviceId?: string;
  defaultMap: string;
  defaultGame: string;
  autoStart: boolean;
}
```

### Event System

Subscribe to fleet events:

```typescript
const manager = getDeviceManager();

manager.on('device:connected', ({ deviceId, name }) => {
  console.log(`Robot connected: ${name}`);
});

manager.on('device:telemetry', (telemetry) => {
  console.log(`Robot ${telemetry.deviceId} at position:`, telemetry.robotState.pose);
});

manager.on('device:collision', ({ deviceId, x, y }) => {
  console.log(`Robot ${deviceId} collision at (${x}, ${y})`);
});

manager.on('device:checkpoint', ({ deviceId, checkpointIndex }) => {
  console.log(`Robot ${deviceId} reached checkpoint ${checkpointIndex}`);
});
```

---

## Integration Testing

This section demonstrates LLMos's self-building capability through comprehensive integration testing. You describe what you want in natural language, and LLMos generates working code.

### The Ultimate Demo: The OS Building Itself

This demonstrates:
1. **Dynamic Code Generation** - LLMos generating working TypeScript/React
2. **Hardware Abstraction** - Virtual and physical ESP32-S3 integration
3. **Applet System** - Generated applets saved to volumes and installed
4. **Skill Application** - LLMos using the `hardware-flight-controller` skill
5. **Self-Evolution** - Pattern becomes a skill for future use

### Prerequisites

#### Verify Skills Are Loaded

LLMos should automatically load the `hardware-flight-controller` skill. You can verify:

```
List available skills related to flight controllers
```

#### Context Injection (Optional)

For best results, set context at the start:

```
We are using Next.js 14, Tailwind CSS, TypeScript 5.
The hardware layer uses lib/hardware/serial-manager.ts for ESP32 communication.
For 3D graphics, @react-three/fiber and @react-three/drei are available.
```

### Act 1: The Hardware Layer

**Goal:** Have LLMos create the simulation logic (the "Brain" of the drone).

**Prompt to LLMos:**

```
I need to design a virtual hardware interface for a drone project.

Create a TypeScript singleton class named `VirtualFlightController` in
/lib/hardware/virtual-flight-controller.ts.

Requirements:
1. Store state of 4 motors (0.0 to 1.0) and sensor data (orientation: x, y, z; altitude)
2. Implement a tick(dt) method that acts as the firmware loop
3. Inside tick, implement a basic PID Controller to stabilize altitude at 5 meters
4. Add a method updateSensors to receive physics data from the simulator
5. Export a const instance named `flightController` so I can import it elsewhere
```

**What LLMos Should Generate:**

LLMos will use the `hardware-flight-controller` skill to generate:
- A TypeScript class with motor state, sensor data, PID controller
- A `tick(dt)` method with PID calculation
- Sensor update methods
- Exported singleton instance

**Self-Correction Prompts:**

If LLMos misses something:
- "Please export a const instance named `flightController`"
- "Add PID tuning parameters with default values kP=0.5, kI=0.1, kD=0.2"
- "Include a method to toggle autopilot on/off"

### Act 2: The Visual Layer

**Goal:** Have LLMos create a visual simulator applet.

**Prompt to LLMos:**

```
Now, create a visual simulator applet for this hardware.

Generate an interactive flight simulator applet with these specs:
1. Show 2D altitude visualization with a drone and target altitude line
2. Implement physics: gravity (9.81 m/s²), motor thrust, air resistance (0.98 damping)
3. Use PID autopilot for altitude stabilization
4. Controls: Start/Pause, Reset, Arm/Disarm, Autopilot toggle, Target altitude +/-
5. Telemetry display: altitude, velocity, throttle percentage, error
6. Status badges showing armed/autopilot/running state

Save to team volume as applets/flight-simulator.app
```

**What LLMos Should Do:**

LLMos will:
1. Use the `generate_applet` tool to create a React component
2. Implement physics simulation in `useEffect`
3. Create the PID logic inline
4. Save to `team-volume/applets/flight-simulator.app`

**Physics Tuning Prompts:**

If physics behave incorrectly:
- "The drone flies away instantly. Add air resistance damping to velocity."
- "Limit maximum motor thrust to prevent infinite acceleration."
- "Add ground collision so drone can't go below altitude 0."

### Act 3: Testing with Virtual ESP32

**Goal:** Connect the applet to the virtual ESP32 device.

**Prompt to LLMos:**

```
Now let's test this with the virtual ESP32. Show me how to:
1. Connect to a virtual ESP32-S3 device
2. Send arm and motor commands
3. Read IMU and barometer data
4. Integrate the device with the flight simulator

Use the SerialManager from /lib/hardware/serial-manager.ts
```

**Expected Integration Code:**

LLMos will show how to use:
```typescript
const deviceId = await SerialManager.connectVirtual('ESP32-S3-FlightController');
await SerialManager.sendCommand(deviceId, { action: 'arm' });
await SerialManager.sendCommand(deviceId, { action: 'set_motors', motors: [128,128,128,128] });
```

### Act 4: The Execution (Magic Moment)

**Launch the Applet:**

```
Launch the flight simulator applet
```

Or if you want LLMos to load it:

```
Load the flight-simulator.app from team volume and display it
```

**Demo Narrative:**

1. **"First, I described the hardware interface."** (Prompt 1) → *Code generated*
2. **"Next, I described the physics simulation."** (Prompt 2) → *Applet created*
3. **"Then, I connected to virtual hardware."** (Prompt 3) → *Integration shown*
4. **"Now we have a Hardware-in-the-Loop simulator, built entirely by the OS."**

### Act 5: Evolution - Making It a Pattern

**Goal:** The interaction becomes a learnable pattern.

**What Happens Automatically:**

1. **Execution Trace**: LLMos records the conversation and tool calls
2. **Pattern Detection**: Daily cron analyzes traces for repeated patterns
3. **Skill Draft**: If similar requests recur, a skill draft is created
4. **Promotion**: High-success patterns promote to team/system skills

**Manually Trigger Evolution:**

```
Analyze my recent interactions and suggest skills that could be created from patterns.
```

### Physical Hardware Testing

**ESP32-S3 Firmware:**

Upload the firmware from `firmware/esp32-flight-controller/`:

1. Install Arduino IDE or PlatformIO
2. Select ESP32-S3 DevKit board
3. Enable USB CDC On Boot
4. Upload `esp32-flight-controller.ino`

**Connect Physical Device:**

```
Connect to my physical ESP32-S3 device via USB serial
```

LLMos will use `SerialManager.connect()` which opens the browser device picker.

**Test Commands:**

```json
{"action":"get_info"}
{"action":"arm"}
{"action":"set_motors","motors":[100,100,100,100]}
{"action":"read_sensors"}
{"action":"disarm"}
```

### Validation Checklist

**Code Generation:**
- [ ] VirtualFlightController compiles without errors
- [ ] PID controller stabilizes at target altitude
- [ ] Motor values stay within 0.0-1.0

**Applet System:**
- [ ] Applet generated via `generate_applet` tool
- [ ] Applet saved to team volume
- [ ] Applet loads and runs correctly

**Hardware Integration:**
- [ ] Virtual device connects
- [ ] Commands send successfully
- [ ] Physical device works (if available)

**Evolution:**
- [ ] Execution traces recorded
- [ ] Pattern could be detected (after repeated use)

### Key Insight

The demo's power isn't in the flight simulator itself - it's that:

1. **You describe what you want** (natural language)
2. **LLMos generates working code** (using skills as guides)
3. **The applet is saved and installable** (volume system)
4. **The pattern becomes reusable** (evolution system)
5. **Others can use your creation** (team sharing)

This is the OS building itself - each interaction teaches the system new capabilities.

---

## Troubleshooting

### Problem: Browser doesn't show device picker

**Cause:** Web Serial API requires HTTPS or localhost

**Solution:**
- Use `https://` URL in production
- Use `http://localhost:3000` in development
- OR use virtual device (no hardware required)

### Problem: "Device not found" error

**Cause:** ESP32 not recognized by browser

**Solution:**
1. Check USB cable (must be data cable, not charge-only)
2. Install CH340/CP2102 drivers if needed
3. In Arduino IDE: Tools → USB CDC On Boot → **Enabled**
4. Re-upload firmware

### Problem: Commands timeout

**Cause:** Firmware not responding or wrong baud rate

**Solution:**
1. Open Serial Monitor (115200 baud)
2. Manually test: `{"action":"get_info"}`
3. Verify JSON response
4. Check firmware uploaded correctly

### Problem: Virtual robot drifts

**Cause:** Motor calibration or physics simulation

**Solution:**
1. Reset the robot: `reset-robot-device`
2. Check motor values are balanced
3. Use encoder feedback from `get-robot-state`

### Problem: Compilation fails

**Cause:** Invalid C syntax or missing headers

**Solution:**
1. Check the error message for line numbers
2. Ensure `#include "robot4.h"` is present
3. Verify function signatures match
4. Check for missing semicolons

### Problem: WASM binary doesn't run on hardware

**Cause:** Binary compiled for wrong target

**Solution:**
1. Verify target is `wasm32-wasi`
2. Check heap size configuration
3. Ensure native functions are available
4. Use `query-wasm-apps` to verify installation

### Problem: LLMos Generates Wrong Code

**Correct it naturally:**
```
That doesn't look right. The PID integral should be clamped to prevent windup.
Please fix the runAutopilot method.
```

### Problem: Missing Dependencies

```
We don't have cannon-es physics. Use simple vector math instead of a physics engine.
```

### Problem: Applet Doesn't Save

```
Save the applet to team volume at applets/flight-simulator.app
```

---

## Summary

### What You Have Now

| Feature | Status |
|---------|--------|
| Virtual Device Simulation | Complete |
| Robot4 API | Complete |
| Browser-Based WASM Compiler | Complete |
| LLM Natural Language Tools | Complete |
| Fleet Management | Complete |
| Physical Hardware Support | Complete |
| Integration Testing Framework | Complete |

### Quick Reference

**Create Robot:**
```
"Create a virtual cube robot"
```

**Control Robot:**
```
"Drive forward at speed 150"
"Turn left"
"Stop the robot"
"Set LED to red"
```

**Load Games:**
```
"Load the line follower game"
"Load obstacle avoidance"
"Load maze runner"
```

**Change Environment:**
```
"Set floor map to maze"
"Use the figure8 track"
```

**Get State:**
```
"Show robot position"
"What are the sensor readings?"
"Get robot telemetry"
```

### Related Documentation

- **docs/architecture/ARCHITECTURE.md** - Full system architecture with mermaid diagrams
- **docs/architecture/ROBOT4_GUIDE.md** - Robot4 API specification
- **volumes/system/skills/** - ESP32 skill definitions

### Source Code

- `/lib/hardware/virtual-esp32.ts` - Virtual device emulator
- `/lib/hardware/esp32-device-manager.ts` - Fleet management
- `/lib/hardware/esp32-wasm4-vm.ts` - WASM4 runtime + robot simulator
- `/lib/llm-tools/esp32-wasm4-tools.ts` - LLM tool definitions

---

**Last Updated:** January 2026
**Branch:** main
