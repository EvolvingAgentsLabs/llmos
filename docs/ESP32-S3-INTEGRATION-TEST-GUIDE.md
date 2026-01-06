# LLMos ESP32-S3 Integration Test Guide

## The Ultimate Demo: The OS Building Itself

This guide demonstrates LLMos's self-building capability. **You don't write code** - you prompt LLMos to generate everything. LLMos acts as the "Senior Engineer" while you play the "Architect."

The demo validates:
1. **Dynamic Code Generation** - LLMos generating working TypeScript/React
2. **Hardware Abstraction** - Virtual and physical ESP32-S3 integration
3. **Applet System** - Generated applets saved to volumes and installed
4. **Skill Application** - LLMos using the `hardware-flight-controller` skill
5. **Self-Evolution** - Pattern becomes a skill for future use

---

## Prerequisites

### Verify Skills Are Loaded

LLMos should automatically load the `hardware-flight-controller` skill. You can verify:

```
> List available skills related to flight controllers
```

### Context Injection (Optional)

For best results, set context at the start:

```
We are using Next.js 14, Tailwind CSS, TypeScript 5.
The hardware layer uses lib/hardware/serial-manager.ts for ESP32 communication.
For 3D graphics, @react-three/fiber and @react-three/drei are available.
```

---

## Act 1: The Hardware Layer

**Goal:** Have LLMos create the simulation logic (the "Brain" of the drone).

### Prompt to LLMos:

```
I need to design a virtual hardware interface for a drone project.

Create a TypeScript singleton class named `VirtualFlightController` in
lib/hardware/virtual-flight-controller.ts.

Requirements:
1. Store state of 4 motors (0.0 to 1.0) and sensor data (orientation: x, y, z; altitude)
2. Implement a tick(dt) method that acts as the firmware loop
3. Inside tick, implement a basic PID Controller to stabilize altitude at 5 meters
4. Add a method updateSensors to receive physics data from the simulator
5. Export a const instance named `flightController` so I can import it elsewhere
```

### What LLMos Should Generate:

LLMos will use the `hardware-flight-controller` skill to generate:
- A TypeScript class with motor state, sensor data, PID controller
- A `tick(dt)` method with PID calculation
- Sensor update methods
- Exported singleton instance

### Self-Correction Prompts:

If LLMos misses something:
- *"Please export a const instance named `flightController`"*
- *"Add PID tuning parameters with default values kP=0.5, kI=0.1, kD=0.2"*
- *"Include a method to toggle autopilot on/off"*

---

## Act 2: The Visual Layer

**Goal:** Have LLMos create a visual simulator applet.

### Prompt to LLMos:

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

### What LLMos Should Do:

LLMos will:
1. Use the `generate_applet` tool to create a React component
2. Implement physics simulation in `useEffect`
3. Create the PID logic inline
4. Save to `team-volume/applets/flight-simulator.app`

### Physics Tuning Prompts:

If physics behave incorrectly:
- *"The drone flies away instantly. Add air resistance damping to velocity."*
- *"Limit maximum motor thrust to prevent infinite acceleration."*
- *"Add ground collision so drone can't go below altitude 0."*

---

## Act 3: Testing with Virtual ESP32

**Goal:** Connect the applet to the virtual ESP32 device.

### Prompt to LLMos:

```
Now let's test this with the virtual ESP32. Show me how to:
1. Connect to a virtual ESP32-S3 device
2. Send arm and motor commands
3. Read IMU and barometer data
4. Integrate the device with the flight simulator

Use the SerialManager from lib/hardware/serial-manager.ts
```

### Expected Integration Code:

LLMos will show how to use:
```typescript
const deviceId = await SerialManager.connectVirtual('ESP32-S3-FlightController');
await SerialManager.sendCommand(deviceId, { action: 'arm' });
await SerialManager.sendCommand(deviceId, { action: 'set_motors', motors: [128,128,128,128] });
```

---

## Act 4: The Execution (Magic Moment)

### Launch the Applet:

```
Launch the flight simulator applet
```

Or if you want LLMos to load it:

```
Load the flight-simulator.app from team volume and display it
```

### Demo Narrative:

1. **"First, I described the hardware interface."** (Prompt 1) → *Code generated*
2. **"Next, I described the physics simulation."** (Prompt 2) → *Applet created*
3. **"Then, I connected to virtual hardware."** (Prompt 3) → *Integration shown*
4. **"Now we have a Hardware-in-the-Loop simulator, built entirely by the OS."**

---

## Act 5: Evolution - Making It a Pattern

**Goal:** The interaction becomes a learnable pattern.

### What Happens Automatically:

1. **Execution Trace**: LLMos records the conversation and tool calls
2. **Pattern Detection**: Daily cron analyzes traces for repeated patterns
3. **Skill Draft**: If similar requests recur, a skill draft is created
4. **Promotion**: High-success patterns promote to team/system skills

### Manually Trigger Evolution:

```
Analyze my recent interactions and suggest skills that could be created from patterns.
```

---

## Physical Hardware Testing

### ESP32-S3 Firmware

Upload the firmware from `firmware/esp32-flight-controller/`:

1. Install Arduino IDE or PlatformIO
2. Select ESP32-S3 DevKit board
3. Enable USB CDC On Boot
4. Upload `esp32-flight-controller.ino`

### Connect Physical Device:

```
Connect to my physical ESP32-S3 device via USB serial
```

LLMos will use `SerialManager.connect()` which opens the browser device picker.

### Test Commands:

```json
{"action":"get_info"}
{"action":"arm"}
{"action":"set_motors","motors":[100,100,100,100]}
{"action":"read_sensors"}
{"action":"disarm"}
```

---

## Sharing & Installation

### Share Project to Team

The applet is saved to `team-volume/applets/flight-simulator.app`, automatically accessible to team members.

### Install from Marketplace (Future)

```
Publish the flight-simulator applet to the marketplace
```

### Create a Project

```
Create a new project called "drone-simulator" that includes:
- The VirtualFlightController hardware layer
- The flight simulator applet
- Documentation on how to use it
- Example PID tuning parameters
```

---

## Troubleshooting

### LLMos Generates Wrong Code

**Correct it naturally:**
```
That doesn't look right. The PID integral should be clamped to prevent windup.
Please fix the runAutopilot method.
```

### Missing Dependencies

```
We don't have cannon-es physics. Use simple vector math instead of a physics engine.
```

### Applet Doesn't Save

```
Save the applet to team volume at applets/flight-simulator.app
```

---

## Validation Checklist

### Code Generation
- [ ] VirtualFlightController compiles without errors
- [ ] PID controller stabilizes at target altitude
- [ ] Motor values stay within 0.0-1.0

### Applet System
- [ ] Applet generated via `generate_applet` tool
- [ ] Applet saved to team volume
- [ ] Applet loads and runs correctly

### Hardware Integration
- [ ] Virtual device connects
- [ ] Commands send successfully
- [ ] Physical device works (if available)

### Evolution
- [ ] Execution traces recorded
- [ ] Pattern could be detected (after repeated use)

---

## Key Insight

The demo's power isn't in the flight simulator itself - it's that:

1. **You describe what you want** (natural language)
2. **LLMos generates working code** (using skills as guides)
3. **The applet is saved and installable** (volume system)
4. **The pattern becomes reusable** (evolution system)
5. **Others can use your creation** (team sharing)

This is the OS building itself - each interaction teaches the system new capabilities.

---

## Files Created by This Demo

```
team-volume/
└── applets/
    └── flight-simulator.app    # Generated applet

lib/hardware/
└── virtual-flight-controller.ts  # Generated hardware layer

volumes/system/skills/
└── hardware-flight-controller.md # Pre-existing skill (teaches LLMos)

firmware/
└── esp32-flight-controller/      # Physical hardware firmware
```

---

*Guide Version: 2.0.0 - Prompt-Based Approach*
*Last Updated: 2026-01-06*
*Compatible with: LLMos-Lite v2.x*
