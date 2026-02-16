# Chapter 7: The Hardware Abstraction Layer -- One Interface, Two Worlds

There is a moment in every robotics project where you realize that your beautifully
architected software works perfectly in simulation and catastrophically on real
hardware. Motors overshoot. Sensors return garbage. Serial connections drop mid-command.
The gap between the simulated world and the physical one is not a crack -- it is a
canyon. Traditional robotics deals with this by writing two separate codebases: one for
testing, one for deployment. LLMos takes a different approach. It places a single
interface between the LLM and all hardware, simulated or physical, and guarantees that
the same high-level command produces equivalent behavior in both worlds.

---

## The Design Principle

The HAL exists because of a fundamental architectural decision: the LLM should never
know or care whether it is controlling a Three.js mesh in a browser or a differential
drive robot on a desk. It issues commands like "move to position (2.5, 1.0, 0)" and
"rotate left 90 degrees." The HAL translates those into the correct low-level
operations for the target environment. The firmware becomes a servant, not a master.

The full interface is defined in `lib/hal/types.ts`.

---

## HALMode and HALToolResult

Every HAL instance operates in one of three modes:

```typescript
// lib/hal/types.ts
export type HALMode = 'simulation' | 'physical' | 'hybrid';
```

Simulation mode routes commands to the Three.js engine. Physical mode routes them over
serial, WiFi, or Bluetooth to an ESP32. Hybrid mode runs both simultaneously.

Every HAL call returns the same result structure:

```typescript
// lib/hal/types.ts
export interface HALToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
  mode: HALMode;
  executionTime?: number;
}
```

The `mode` field tells the caller which world the command ran in. If a command succeeds
in simulation but fails in physical mode, you know the problem is hardware-specific.

---

## The Five Subsystems

The complete HAL interface composes five subsystem interfaces plus lifecycle methods:

```typescript
// lib/hal/types.ts
export interface HardwareAbstractionLayer {
  mode: HALMode;
  locomotion: LocomotionInterface;
  vision: VisionInterface;
  manipulation?: ManipulationInterface;  // optional for wheeled robots
  communication: CommunicationInterface;
  safety: SafetyInterface;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  isReady(): boolean;
  getDeviceInfo(): { id: string; type: string; mode: HALMode; capabilities: string[] };
}
```

### Locomotion

The most heavily used subsystem provides both low-level differential drive control and
high-level movement commands:

```typescript
// lib/hal/types.ts
export interface LocomotionInterface {
  drive(left: number, right: number, durationMs?: number): Promise<HALToolResult>;
  moveTo(x: number, y: number, z: number, speed?: number): Promise<HALToolResult>;
  rotate(direction: 'left' | 'right', degrees: number): Promise<HALToolResult>;
  moveForward(distanceCm: number): Promise<HALToolResult>;
  moveBackward(distanceCm: number): Promise<HALToolResult>;
  stop(): Promise<HALToolResult>;
  getPose(): Promise<{
    position: { x: number; y: number; z: number };
    rotation: { yaw: number; pitch: number; roll: number };
    velocity: { linear: number; angular: number };
  }>;
}
```

The `drive` method gives raw wheel-level control: left and right motor power from -255
to 255. The higher-level methods -- `moveTo`, `rotate`, `moveForward` -- are what the
navigation loop actually uses. The HAL translates between the two.

### Vision

The vision subsystem abstracts over cameras and distance sensors. `captureFrame`
returns a base64-encoded image -- a rendered Three.js snapshot in simulation, or a
frame from the OV2640 camera on hardware. The navigation loop feeds this to Qwen3-VL
for spatial reasoning. `getDistanceSensors` returns readings from front, left, and
right sensors. `getIMU` provides acceleration, gyroscope, and heading data.

### Communication

Robots communicate state through LEDs, speaker output, and telemetry: `speak(text)`,
`setLED(r, g, b, pattern)`, `playSound(soundId)`, and `log(message, level)`.

### Safety

Safety is the only subsystem with synchronous state queries. `isEmergencyStopped()`
returns cached local state immediately -- you never want to wait for an async
round-trip to check emergency status. The `getSafetyStatus()` method returns battery
level, temperature, and accumulated errors.

---

## HAL Configuration

```typescript
// lib/hal/types.ts
export interface HALConfig {
  mode: HALMode;
  deviceId: string;
  connection?: {
    type: 'serial' | 'wifi' | 'bluetooth';
    port?: string;
    baudRate?: number;
    host?: string;
  };
  simulator?: unknown;
  capabilities?: string[];
}
```

For simulation, pass a Three.js simulator reference. For physical mode, pass connection
settings. The `capabilities` array declares what the device supports.

---

## The Physical Adapter

The `PhysicalHAL` class in `lib/hal/physical-adapter.ts` implements the full HAL for
real ESP32-S3 hardware over a newline-delimited JSON protocol:

```typescript
// lib/hal/physical-adapter.ts
interface ESP32Command {
  type: 'command';
  command: string;
  params: Record<string, unknown>;
  timestamp: number;
}
```

Each subsystem class sends commands through a shared `PhysicalConnection` and parses
JSON responses. For example, the locomotion `rotate` method serializes direction and
degrees into an ESP32 command, awaits the response with a 5-second timeout, and wraps
it in a `HALToolResult`. If the ESP32 does not respond, the promise rejects and the
HAL returns `success: false`. The LLM never hangs waiting for hardware.

```typescript
// lib/hal/physical-adapter.ts (simplified)
export class PhysicalHAL implements HardwareAbstractionLayer {
  readonly mode: HALMode = 'physical';
  readonly locomotion: LocomotionInterface;
  readonly vision: VisionInterface;
  readonly communication: CommunicationInterface;
  readonly safety: SafetyInterface;

  constructor(options: { deviceId: string; connectionType: ConnectionType; ... }) {
    this.connection = new PhysicalConnection(options.connectionType, { ... });
    this.locomotion = new PhysicalLocomotion(this.connection);
    this.vision = new PhysicalVision(this.connection);
    this.communication = new PhysicalCommunication(this.connection);
    this.safety = new PhysicalSafety(this.connection);
  }
}
```

---

## The Safety Stack

Safety in LLMos is a four-layer stack. Each layer can independently prevent dangerous
actions:

1. **LLM picks an action** -- The navigation loop produces MOVE_TO or ROTATE_TO.
2. **HAL validates parameters** -- Coordinates within bounds, device not e-stopped.
3. **Firmware checks safety invariants** -- Motor current, stall detection, battery.
4. **Motors execute** -- Only after passing all three gates.

If any layer vetoes, the result propagates up as `HALToolResult` with `success: false`.
The LLM receives this and reasons about what went wrong.

---

## The Navigation HAL Bridge

The file `lib/runtime/navigation-hal-bridge.ts` connects the NavigationLoop to the HAL.
Each cycle follows four steps: capture a camera frame, run the LLM navigation cycle,
execute the decision on the HAL, and report the result back to the loop.

The decision execution translates action types to HAL calls:

```typescript
// lib/runtime/navigation-hal-bridge.ts (simplified)
switch (decision.action.type) {
  case 'MOVE_TO':
  case 'EXPLORE': {
    if (path?.success && path.waypoints.length > 0) {
      const wp = path.waypoints[Math.min(1, path.waypoints.length - 1)];
      await this.hal.locomotion.moveTo(wp.x, wp.y, 0);
    } else {
      await this.hal.locomotion.moveForward(10); // nudge recovery
    }
    break;
  }
  case 'ROTATE_TO': {
    const yaw = decision.action.yaw_deg ?? 90;
    await this.hal.locomotion.rotate(yaw >= 0 ? 'right' : 'left', Math.abs(yaw));
    break;
  }
  case 'STOP':
  default:
    await this.hal.locomotion.stop();
}
```

MOVE_TO and EXPLORE follow the A*-planned path. If no path exists, the bridge nudges
forward 10cm as recovery. The `run` method loops until the goal is reached or stopped.

---

## The ESP32 Device Manager

For multi-robot scenarios, `ESP32DeviceManager` in
`lib/hardware/esp32-device-manager.ts` manages a fleet with device registration,
firmware deployment, telemetry collection, and three fleet coordination modes:

```typescript
// lib/hardware/esp32-device-manager.ts
export interface FleetConfig {
  syncMode: 'independent' | 'synchronized' | 'leader-follower';
  leaderDeviceId?: string;
  defaultMap: string;
  defaultGame: string;
  autoStart: boolean;
}
```

Each device gets its own HAL instance via `createDeviceHAL()`, which routes to
simulation or physical mode based on device type.

---

## Hardware Target: The Standard Robot V1

The reference hardware platform is a minimal but capable wheeled robot:

- **MCU**: ESP32-S3, dual-core 240MHz, built-in WiFi/BLE
- **Drive**: Differential drive, two DC motors, 0.5m wheel base
- **Sensors**: 3-5 ultrasonic/ToF distance sensors (front, left, right)
- **Camera**: OV2640 module for vision frames sent to Qwen3-VL
- **Communication**: Status LED, USB-C for firmware and serial
- **Protocol**: Newline-delimited JSON at 115200 baud

Motor power ranges from -255 to 255. Differential drive kinematics:

```
Linear velocity:  v = (v_right + v_left) / 2
Angular velocity: w = (v_right - v_left) / wheel_base
```

Pose updates at 100ms intervals via dead reckoning. The LLM corrects drift through
the vision pipeline.

---

## Chapter Summary

The HAL is the seam between the LLM's abstract reasoning and the physical world. Five
subsystems provide a complete interface. The `PhysicalHAL` adapter translates HAL calls
into JSON commands over serial. The Navigation HAL Bridge connects the decision loop to
actuators. The four-layer safety stack ensures no single failure produces dangerous
behavior. The key insight: the LLM says "move to (2.5, 1.0)" and the HAL translates.
This separation is what makes it possible to develop in simulation and deploy to
hardware with zero code changes.

---

*Previous: [Chapter 6 -- Seeing the World: Camera to Grid](06-vision-pipeline.md)*
*Next: [Chapter 8 -- Agents, Skills, and the Markdown OS](08-agents-and-skills.md)*
