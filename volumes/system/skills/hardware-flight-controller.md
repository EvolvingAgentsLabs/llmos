---
name: hardware-flight-controller
category: electronics
description: Design and implement virtual/physical flight controllers with PID stabilization
keywords: [drone, flight controller, pid, quadcopter, esp32, hil, simulation, motors]
version: 1.0.0
---

# Flight Controller Design Skill

## Overview

This skill teaches how to design Hardware-in-the-Loop (HIL) flight controllers that work with both virtual simulations and physical ESP32-S3 hardware. The pattern enables rapid prototyping of drone control systems.

## When to Use

Use this skill when:
- Building drone/quadcopter flight simulators
- Implementing PID-based control systems
- Creating Hardware-in-the-Loop (HIL) test environments
- Developing motor control interfaces
- Testing flight algorithms before deploying to hardware

## Architecture

A flight controller system consists of three layers:

```
┌─────────────────────────────────────────┐
│           Visual Layer                   │
│    (React Applet with 3D/2D viz)        │
├─────────────────────────────────────────┤
│          Physics Layer                   │
│    (Gravity, thrust, damping)           │
├─────────────────────────────────────────┤
│         Hardware Layer                   │
│  (Virtual ESP32 or Physical Device)     │
└─────────────────────────────────────────┘
```

## Implementation Pattern

### Step 1: Hardware Abstraction (TypeScript Singleton)

Create a flight controller class that acts as firmware simulation:

```typescript
// Structure for lib/hardware/virtual-flight-controller.ts
interface MotorState {
  motor1: number; // 0.0 - 1.0 throttle
  motor2: number;
  motor3: number;
  motor4: number;
}

interface SensorData {
  altitude: number;
  velocity: { x: number; y: number; z: number };
  orientation: { roll: number; pitch: number; yaw: number };
}

interface PIDState {
  kP: number;     // Proportional gain (start: 0.5)
  kI: number;     // Integral gain (start: 0.1)
  kD: number;     // Derivative gain (start: 0.2)
  integral: number;
  previousError: number;
}

class VirtualFlightController {
  motors: MotorState;
  sensors: SensorData;
  pid: PIDState;
  targetAltitude: number;
  autopilotEnabled: boolean;
  armed: boolean;

  // Main firmware loop - call every frame
  tick(dt: number): void {
    if (!this.armed) return;
    if (this.autopilotEnabled) {
      this.runAutopilot(dt);
    }
  }

  // PID altitude control
  private runAutopilot(dt: number): void {
    const error = this.targetAltitude - this.sensors.altitude;

    // PID calculation
    this.pid.integral += error * dt;
    this.pid.integral = clamp(this.pid.integral, -0.5, 0.5); // Anti-windup
    const derivative = (error - this.pid.previousError) / dt;

    const output = this.pid.kP * error +
                   this.pid.kI * this.pid.integral +
                   this.pid.kD * derivative;

    this.pid.previousError = error;

    // Apply to motors (base hover + correction)
    const throttle = clamp(0.5 + output, 0, 1);
    this.setAllMotors(throttle);
  }

  // Receive physics data from simulator
  updateSensors(data: Partial<SensorData>): void;

  // Control methods
  arm(): void;
  disarm(): void;
  setTargetAltitude(alt: number): void;
  enableAutopilot(enabled: boolean): void;
}

export const flightController = new VirtualFlightController();
```

### Step 2: Physics Simulation (React useFrame)

Implement physics in the visual layer:

```typescript
// Physics constants
const GRAVITY = 9.81;        // m/s²
const MAX_THRUST = 15;       // m/s² per motor at full
const AIR_RESISTANCE = 0.98; // Damping factor
const GROUND_LEVEL = 0;

// In useFrame or setInterval:
function simulatePhysics(dt: number) {
  // Get motor thrust from controller
  const thrust = flightController.getMotorThrust() * MAX_THRUST;

  // Apply physics
  const netAcceleration = -GRAVITY + (armed ? thrust : 0);
  velocity.y += netAcceleration * dt;
  velocity.y *= AIR_RESISTANCE;  // Air resistance
  position.y += velocity.y * dt;

  // Ground collision
  if (position.y < GROUND_LEVEL) {
    position.y = GROUND_LEVEL;
    velocity.y = 0;
  }

  // Feed back to controller
  flightController.updateSensors({
    altitude: position.y,
    velocity: { x: velocity.x, y: velocity.y, z: velocity.z }
  });

  // Run controller tick
  flightController.tick(dt);
}
```

### Step 3: Visual Applet (React Component)

Create an applet with visualization and controls:

```tsx
function Component({ onSubmit }) {
  const [altitude, setAltitude] = useState(0);
  const [targetAltitude, setTargetAltitude] = useState(5);
  const [velocity, setVelocity] = useState(0);
  const [motors, setMotors] = useState([0, 0, 0, 0]);
  const [armed, setArmed] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [running, setRunning] = useState(false);
  const pidRef = useRef({ integral: 0, lastError: 0, kP: 0.5, kI: 0.1, kD: 0.2 });

  useEffect(() => {
    if (!running || !armed) return;

    const interval = setInterval(() => {
      // Physics simulation runs here
      // Updates altitude, velocity, motors
    }, 50); // 20 FPS physics

    return () => clearInterval(interval);
  }, [running, armed, autopilot, altitude, velocity, targetAltitude]);

  return (
    <div className="p-4 h-full flex flex-col bg-gray-950">
      {/* Altitude visualization */}
      {/* Telemetry display */}
      {/* Control buttons: Start, Arm, Autopilot, Target adjustment */}
      {/* Status badges */}
    </div>
  );
}
```

## ESP32 Integration

### Virtual Device Commands

The Virtual ESP32 supports flight controller commands:

```typescript
import { SerialManager } from '@/lib/hardware/serial-manager';

// Connect virtual device
const deviceId = await SerialManager.connectVirtual('ESP32-S3-FlightController');

// Arm the controller
await SerialManager.sendCommand(deviceId, { action: 'arm' });

// Set motors (0-255 duty cycle)
await SerialManager.sendCommand(deviceId, {
  action: 'set_motors',
  motors: [128, 128, 128, 128]  // 50% all motors
});

// Read IMU sensor
const imu = await SerialManager.sendCommand(deviceId, { action: 'read_imu' });

// Read barometer/altitude
const baro = await SerialManager.sendCommand(deviceId, { action: 'read_barometer' });

// Set altitude (for HIL simulation)
await SerialManager.sendCommand(deviceId, {
  action: 'set_altitude',
  altitude: 5.0  // meters
});

// Disarm
await SerialManager.sendCommand(deviceId, { action: 'disarm' });
```

### Physical ESP32-S3 Hardware

For real hardware, use the JSON protocol over USB CDC:

```json
{"action":"arm"}
{"action":"set_motors","motors":[128,128,128,128]}
{"action":"read_sensors"}
{"action":"disarm"}
```

See `esp32-json-protocol.md` for full protocol specification.

## PID Tuning Guide

### Starting Values
- **kP = 0.5** - Proportional response to error
- **kI = 0.1** - Corrects steady-state error over time
- **kD = 0.2** - Dampens oscillations

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Oscillates around target | kP too high | Reduce kP by 20% |
| Slow to reach target | kP too low | Increase kP by 20% |
| Overshoots significantly | kD too low | Increase kD |
| Never quite reaches target | kI too low | Increase kI slightly |
| Keeps accelerating | kI too high (windup) | Add integral clamping |

### Tuning Process
1. Start with kI = 0, kD = 0
2. Increase kP until system oscillates
3. Back off kP by 30%
4. Add kD to dampen oscillations
5. Add small kI for steady-state accuracy
6. Fine-tune all three

## Example Prompts for LLMos

### Create Flight Controller Hardware Layer
```
Create a TypeScript singleton class named VirtualFlightController in lib/hardware/virtual-flight-controller.ts.

Requirements:
1. Store state of 4 motors (0.0 to 1.0) and sensor data (orientation, altitude, velocity)
2. Implement tick(dt) method as firmware loop
3. Inside tick, implement PID controller to stabilize altitude at target (default 5m)
4. Add updateSensors method to receive physics data
5. Export singleton instance named flightController
```

### Create Flight Simulator Applet
```
Generate an interactive flight simulator applet.

Technical specs:
1. Show 2D altitude visualization with drone and target line
2. Physics: gravity (9.81), motor thrust, air resistance (0.98 damping)
3. PID autopilot for altitude stabilization
4. Controls: Start/Pause, Reset, Arm/Disarm, Autopilot toggle
5. Target altitude adjustment (+/- buttons)
6. Telemetry: altitude, velocity, throttle, error
7. Status badges for armed/autopilot/running state

Save to team volume as applets/flight-simulator.app
```

### Add 3D Visualization (Advanced)
```
Update the flight simulator to use @react-three/fiber for 3D visualization.

Requirements:
1. 3D drone mesh with 4 motor arms
2. Ground plane with grid
3. Altitude marker ring at target height
4. Motor thrust visualization (glowing props)
5. OrbitControls for camera
6. Shadows and lighting
```

## Best Practices

1. **Separation of Concerns**: Keep physics separate from visualization
2. **Frame-Rate Independence**: Always use delta time (dt) in physics
3. **Clamping**: Prevent integral windup and motor values outside 0-1
4. **Ground Check**: Always prevent altitude < 0
5. **Armed State**: Require explicit arming before motors work
6. **Telemetry**: Display key values for debugging PID tuning

## Files Reference

```
lib/hardware/
├── serial-manager.ts          # Device communication
├── virtual-esp32.ts           # Virtual device emulator
└── virtual-flight-controller.ts  # Flight controller (generate this)

applets/
└── flight-simulator.app       # Generated applet (save here)

firmware/
└── esp32-flight-controller/   # Physical hardware firmware
```
