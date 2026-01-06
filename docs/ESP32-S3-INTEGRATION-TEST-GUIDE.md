# LLMos ESP32-S3 Integration Test Guide

## The Ultimate Demo: The OS Building Itself

This guide documents the end-to-end integration test scenario where LLMos acts as a "Senior Engineer" building a flight simulator from scratch. This validates:

1. **Dynamic Code Generation** - LLMos generating working TypeScript/React code
2. **Hardware Abstraction** - Virtual and physical ESP32-S3 integration
3. **3D Visualization** - React Three Fiber rendering
4. **System Registration** - Dynamic applet installation
5. **Full Loop Simulation** - Hardware-in-the-Loop (HIL) testing

---

## Prerequisites

### Environment Setup

```bash
# Install dependencies (if not already installed)
cd llmos-lite/ui
npm install @react-three/fiber @react-three/drei three

# Verify hardware libraries
npm ls @react-three/fiber
```

### Context Injection for LLMos

Before starting the demo, ensure LLMos has the following context:

> "We are using Next.js 14, Tailwind CSS, TypeScript 5, and we have `@react-three/fiber` and `@react-three/drei` available for 3D graphics. The hardware layer uses `lib/hardware/serial-manager.ts` for device communication."

---

## Act 1: The Hardware Layer

**Goal:** Create the simulation logic (the "Brain" of the drone) before the visuals.

### Prompt to LLMos:

```
I need to design a virtual hardware interface for a drone project.

Create a TypeScript singleton class named `VirtualFlightController` in `lib/hardware/virtual-flight-controller.ts`.

Requirements:
1. It should store the state of 4 motors (0.0 to 1.0) and sensor data (orientation: x, y, z; altitude: number).
2. Implement a `tick(dt)` method that acts as the firmware loop.
3. Inside `tick`, implement a basic **PID Controller** to stabilize the drone's altitude at 5 meters.
4. Add a method `updateSensors` to receive physics data from the simulator.
5. Export a const instance named `flightController` so I can import it elsewhere.
```

### Expected Generated Code Structure:

```typescript
// lib/hardware/virtual-flight-controller.ts

interface MotorState {
  motor1: number; // 0.0 - 1.0
  motor2: number;
  motor3: number;
  motor4: number;
}

interface SensorData {
  orientation: { x: number; y: number; z: number };
  altitude: number;
  velocity: { x: number; y: number; z: number };
}

interface PIDState {
  kP: number;
  kI: number;
  kD: number;
  integral: number;
  previousError: number;
}

export class VirtualFlightController {
  motors: MotorState;
  sensors: SensorData;
  pid: PIDState;
  targetAltitude: number;
  autopilotEnabled: boolean;

  constructor();
  tick(dt: number): void;
  updateSensors(data: Partial<SensorData>): void;
  setTargetAltitude(altitude: number): void;
  enableAutopilot(enabled: boolean): void;
  getMotorThrust(): number;
}

export const flightController: VirtualFlightController;
```

### Self-Correction Prompts:

If LLMos forgets key features:
- "Please export a const instance named `flightController` so I can import it elsewhere."
- "Add PID tuning parameters (kP, kI, kD) with default values of 0.5, 0.1, 0.05."
- "Include a method to toggle autopilot on/off."

---

## Act 2: The Visual Layer

**Goal:** Create the 3D physics engine and renderer.

### Prompt to LLMos:

```
Now, create a visual simulator for this hardware.

Create a new component `FlightSimApplet` in `components/applets/specialized/FlightSimApplet.tsx`.

Technical Specs:
1. Use `@react-three/fiber` for the Canvas.
2. Create a `Drone` component that renders a simple box with 4 arms (representing motor mounts).
3. Use `useFrame` to simulate physics:
   - Read motor values from `flightController`.
   - Apply gravity (9.81 m/s²) and upward thrust based on motor speed.
   - Update the drone's position and rotation.
   - **Crucial:** Feed the calculated position/rotation back into `flightController.updateSensors()` so the PID loop works.
4. Add a ground plane for visual reference.
5. Add a button in the UI to toggle the Autopilot.
6. Display current altitude, motor power, and PID values.
```

### Expected Component Structure:

```tsx
// components/applets/specialized/FlightSimApplet.tsx

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { flightController } from '@/lib/hardware/virtual-flight-controller';

function Drone({ position, rotation }) {
  // 3D drone mesh with 4 arms
}

function PhysicsSimulation() {
  // useFrame for physics loop
  // Reads motors, applies physics, updates sensors
}

export default function FlightSimApplet({ onSubmit }) {
  // UI controls
  // Canvas with 3D scene
  // Telemetry display
}
```

### Physics Tuning Prompts:

If physics behave incorrectly:
- "The drone flies away instantly. Please add air resistance (damping) to the velocity."
- "Limit the maximum motor thrust to prevent infinite acceleration."
- "The physics feel too floaty. Increase gravity effect and reduce base thrust."
- "Add a ground collision check so the drone can't go below altitude 0."

---

## Act 3: System Registration

**Goal:** "Install" the new applet into the OS.

### Prompt to LLMos:

```
Register this new applet in the system.

Update `components/applets/system-applets.ts` to include the `flightSim` applet:
- Use the `Plane` icon from `lucide-react`.
- Set the category to 'simulation'.
- Include a simple inline version for the system applets registry.

Also update APPLET_CATEGORIES to include a new 'simulation' category.
```

### Expected Changes:

```typescript
// In system-applets.ts

export const SYSTEM_APPLETS = {
  // ... existing applets ...

  flightSim: {
    name: 'Flight Simulator',
    description: 'Hardware-in-the-Loop drone flight simulator',
    category: 'simulation',
    code: `function Component({ onSubmit }) {
      // Inline applet code
    }`,
  },
};

export const APPLET_CATEGORIES = {
  // ... existing categories ...

  simulation: {
    label: 'Simulation',
    icon: 'Plane',
    applets: ['flightSim'],
  },
};
```

---

## Act 4: ESP32-S3 Hardware Integration

**Goal:** Connect the simulation to real hardware.

### Option A: Virtual Device (Simulator Only)

```typescript
import { SerialManager } from '@/lib/hardware/serial-manager';

// Connect to virtual ESP32
const deviceId = await SerialManager.connectVirtual('ESP32-S3-FlightController');

// Send commands
await SerialManager.sendCommand(deviceId, {
  action: 'set_pwm',
  pin: 12,
  duty_cycle: 128,  // 50% throttle
  frequency: 50     // Standard servo PWM
});

// Read sensors
const response = await SerialManager.sendCommand(deviceId, {
  action: 'read_sensors'
});
console.log(response.sensors);
```

### Option B: Physical ESP32-S3

```typescript
// Connect to physical device (triggers browser picker)
const deviceId = await SerialManager.connect();

// Same API works for physical devices
await SerialManager.sendCommand(deviceId, {
  action: 'read_i2c',
  sensor: 'bme280'  // Read altitude from pressure sensor
});
```

### ESP32-S3 Firmware Template

For physical hardware testing, upload this firmware to your ESP32-S3:

```cpp
// esp32-flight-controller.ino
#include <ArduinoJson.h>

// Motor pins (adjust for your setup)
const int MOTOR_PINS[4] = {12, 13, 14, 15};
const int PWM_FREQ = 50;  // 50Hz for servo/ESC
const int PWM_RESOLUTION = 8;

void setup() {
  Serial.begin(115200);

  // Configure motor PWM channels
  for (int i = 0; i < 4; i++) {
    ledcSetup(i, PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(MOTOR_PINS[i], i);
    ledcWrite(i, 0);  // Start with motors off
  }
}

void loop() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    processCommand(input);
  }
}

void processCommand(String json) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, json);

  if (error) {
    sendError("JSON parse error");
    return;
  }

  const char* action = doc["action"];

  if (strcmp(action, "set_motors") == 0) {
    // Set all 4 motors at once
    for (int i = 0; i < 4; i++) {
      int duty = doc["motors"][i] | 0;
      ledcWrite(i, constrain(duty, 0, 255));
    }
    sendOk("Motors set");
  }
  else if (strcmp(action, "get_info") == 0) {
    sendInfo();
  }
  else {
    sendError("Unknown action");
  }
}

void sendOk(const char* msg) {
  Serial.print("{\"status\":\"ok\",\"msg\":\"");
  Serial.print(msg);
  Serial.println("\"}");
}

void sendError(const char* msg) {
  Serial.print("{\"status\":\"error\",\"msg\":\"");
  Serial.print(msg);
  Serial.println("\"}");
}

void sendInfo() {
  Serial.println("{\"status\":\"ok\",\"device\":\"ESP32-S3-FlightController\",\"firmware\":\"1.0.0\"}");
}
```

---

## Act 5: The Execution (Magic Moment)

### Demo Script:

1. **Open LLMos** in your browser

2. **Set Context** (paste into chat):
   > "We are building a drone flight simulator. We have Next.js, Tailwind CSS, @react-three/fiber and @react-three/drei for 3D graphics."

3. **Create Hardware Layer** (paste prompt from Act 1)
   - Watch LLMos generate the VirtualFlightController
   - Narrate: "First, I define the hardware abstraction layer."

4. **Create Visual Layer** (paste prompt from Act 2)
   - Watch LLMos generate the FlightSimApplet
   - Narrate: "Next, I define the physics simulation and 3D visualization."

5. **Register Applet** (paste prompt from Act 3)
   - Watch LLMos update system-applets.ts
   - Narrate: "Finally, I deploy it to the system."

6. **Launch** (say or type):
   > "Launch the Flight Simulator"

7. **Demo the Simulator**:
   - Toggle autopilot on/off
   - Show altitude stabilization via PID
   - Connect virtual ESP32 device
   - Show motor telemetry

### Narrative Script:

> "What you're seeing is the operating system building itself. I didn't write any of this code - I simply described what I needed, and LLMos generated a complete Hardware-in-the-Loop simulator with:
> - A PID-based flight controller
> - Real-time 3D physics simulation
> - Hardware abstraction that works with both virtual and physical ESP32-S3 devices
>
> This is the future of software development - you describe the system, and the OS builds it."

---

## Troubleshooting

### Common Issues and Fixes

#### 1. "Module not found: @react-three/fiber"
```bash
npm install @react-three/fiber @react-three/drei three
```

#### 2. "Babel not loaded" error
The applet runtime needs Babel for TSX compilation. It will auto-load, but if it fails:
```typescript
import { preloadBabel } from '@/lib/runtime/applet-runtime';
await preloadBabel();
```

#### 3. Drone flies to infinity
Add damping and thrust limits:
```typescript
// In physics simulation
velocity.y *= 0.98; // Air resistance
thrust = Math.min(thrust, maxThrust);
```

#### 4. PID oscillation
Tune the parameters:
```typescript
flightController.pid.kP = 0.3;  // Reduce proportional
flightController.pid.kD = 0.1;  // Increase derivative
```

#### 5. Web Serial not working
- Ensure Chrome/Edge 89+ on HTTPS or localhost
- Check USB connection
- Verify ESP32-S3 is in USB-CDC mode

### Hallucination Handling

If LLMos imports unavailable libraries:

**Option 1 - Correct it:**
> "We don't have cannon-es installed. Please rewrite the physics using simple vector math in useFrame."

**Option 2 - Install it (if appropriate):**
> "Install the cannon-es package for physics."

For the demo, Option 1 (simple vector math) is recommended for stability.

---

## Validation Checklist

### Hardware Layer
- [ ] VirtualFlightController compiles without errors
- [ ] PID controller stabilizes at target altitude
- [ ] Motor values stay within 0.0-1.0 range
- [ ] Sensor updates work correctly

### Visual Layer
- [ ] 3D Canvas renders
- [ ] Drone mesh visible
- [ ] Physics simulation runs in useFrame
- [ ] Sensor feedback loop works
- [ ] UI controls function

### System Integration
- [ ] Applet registered in system-applets.ts
- [ ] Category appears in APPLET_CATEGORIES
- [ ] Applet can be launched from desktop
- [ ] State persists between sessions

### ESP32 Integration
- [ ] Virtual device connects
- [ ] Commands send successfully
- [ ] Responses parse correctly
- [ ] Physical device works (if available)

---

## Extended Scenarios

### Scenario 1: Digital Twin

Connect the simulator to a physical drone:

```typescript
// Bridge virtual controller to physical ESP32
SerialManager.addEventListener(physicalDeviceId, (response) => {
  if (response.sensor === 'imu') {
    flightController.updateSensors({
      orientation: response.data.orientation
    });
  }
});
```

### Scenario 2: Multi-Drone Swarm

Create multiple flight controllers:

```typescript
const swarm = [
  new VirtualFlightController(),
  new VirtualFlightController(),
  new VirtualFlightController(),
];

// Coordinate formation flight
swarm.forEach((drone, i) => {
  drone.setTargetAltitude(5 + i * 2);
});
```

### Scenario 3: Autonomous Mission

Add waypoint navigation:

```typescript
interface Waypoint {
  x: number;
  y: number;
  altitude: number;
}

class MissionController {
  waypoints: Waypoint[] = [];
  currentWaypoint: number = 0;

  addWaypoint(wp: Waypoint) {
    this.waypoints.push(wp);
  }

  navigate(flightController: VirtualFlightController) {
    // Navigate to current waypoint
    const wp = this.waypoints[this.currentWaypoint];
    flightController.setTargetAltitude(wp.altitude);
    // ... horizontal navigation
  }
}
```

---

## File Locations Reference

```
llmos-lite/
├── ui/
│   ├── lib/
│   │   └── hardware/
│   │       ├── virtual-esp32.ts          # Virtual device emulator
│   │       ├── serial-manager.ts          # Serial API wrapper
│   │       └── virtual-flight-controller.ts  # Flight controller (NEW)
│   └── components/
│       └── applets/
│           ├── system-applets.ts          # Applet registry
│           └── specialized/
│               └── FlightSimApplet.tsx    # Flight simulator (NEW)
├── volumes/
│   └── system/
│       └── skills/
│           └── esp32-json-protocol.md     # Protocol documentation
└── docs/
    └── ESP32-S3-INTEGRATION-TEST-GUIDE.md  # This guide
```

---

## Success Metrics

A successful integration test demonstrates:

1. **Code Generation Quality**: LLMos generates working, type-safe code
2. **Architecture Understanding**: Generated code follows project conventions
3. **Hardware Abstraction**: Same code works with virtual/physical devices
4. **Real-time Performance**: 60 FPS physics simulation
5. **System Integration**: Applet installs and runs without manual intervention
6. **Self-Correction**: LLMos responds to feedback and fixes issues

---

*Guide Version: 1.0.0*
*Last Updated: 2026-01-06*
*Compatible with: LLMos-Lite v2.x*
