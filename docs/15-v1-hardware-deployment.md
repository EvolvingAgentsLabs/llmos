---
layout: default
title: "15. V1 Hardware Deployment"
nav_order: 15
---

# Chapter 15: V1 Hardware Deployment -- From Code to Robot

<!-- IMAGE_PROMPT: Isometric digital illustration, clean technical style, dark navy (#0d1117) background, soft neon accent lighting in cyan and magenta, a small wheeled robot with a glowing blue eye sensor as recurring character, flat vector aesthetic with subtle depth, no photorealism, 16:9 aspect ratio. Four-panel sequence: (1) 3D-printed cube chassis being assembled with screwdriver, (2) ESP32 chips being wired on workbench, (3) UDP packet flying between laptop and robot, (4) robot navigating a small room with occupancy grid overlay. Arrow connecting all four panels. -->

The fourteen chapters before this one describe a complete navigation stack that runs
in simulation: occupancy grids, A* pathfinding, LLM decision-making, vision pipelines,
fleet coordination, and 346 tests proving it all works. This chapter takes that stack
off the screen and onto a desk. The V1 Stepper Cube Robot is the reference hardware
platform -- an 8cm 3D-printed cube with two stepper motors, two ESP32 chips, and a
camera. The software layer is built. What follows is the physical assembly, protocol
validation, and the first time the robot drives under LLM control.

---

## The V1 Hardware at a Glance

The repository dictates the exact hardware. There is no guesswork.

| Component | Part | Purpose |
|-----------|------|---------|
| Motor Controller | ESP32-S3-DevKitC-1 | WiFi UDP listener, drives steppers via ULN2003 |
| Camera | ESP32-CAM (AI-Thinker) | WiFi MJPEG streaming to host VLM |
| Motors | 2x 28BYJ-48 stepper | Differential drive, 4096 steps/rev |
| Drivers | 2x ULN2003 Darlington | Stepper motor driver boards |
| Wheels | 6cm diameter (3D-printed) | Press-fit onto 28BYJ-48 shaft |
| Support | Ball caster | Rear low-friction contact point |
| Power | 5V 2A USB-C | Powers both ESP32s and motors |
| Chassis | 8cm 3D-printed cube | Mounts all components |

The complete BOM, wiring tables, and 3D model files are in
`Agent_Robot_Model/Readme.md`. The kinematic constants are in
`lib/hal/stepper-kinematics.ts`.

---

## Phase 1: Physical Assembly and Kinematic Calibration

The LLMos navigation math relies on precise physical measurements. If the assembled
robot deviates from the codebase constants, the LLM will miscalculate distances and
rotations -- it will "hallucinate" its position in space.

### Print the Chassis

3D print the chassis from `Agent_Robot_Model/Robot_one/`. The design is an 8cm cube
that tightly mounts:
- ESP32-S3-DevKitC-1 (motor controller)
- ESP32-CAM (camera)
- 2x ULN2003 driver boards
- 2x 28BYJ-48 stepper motors

### Mount the Ball Caster

The rear ball caster is critical. 28BYJ-48 stepper motors have relatively low torque
(~34 mN*m). If the third contact point has too much friction, the wheels will slip
during rotation commands, and the dead-reckoning odometry will drift. A smooth ball
caster minimizes this.

### Verify Wheel Dimensions

The codebase hardcodes these values in `lib/hal/stepper-kinematics.ts`:

| Parameter | Hardcoded Value |
|-----------|----------------|
| Wheel diameter | 6.0 cm |
| Wheel circumference | 18.85 cm |
| Wheel base (center-to-center) | 12.0 cm |
| Steps per cm | ~217.3 |

If your 3D-printed wheels or tires are slightly larger or smaller, calibrate using
the firmware's set_config command:

```json
{"cmd":"set_config","wheel_diameter_cm":6.2,"wheel_base_cm":11.8}
```

To verify calibration: command the robot to move exactly 50cm forward, then measure
the actual distance. If it moved 52cm, your wheel diameter is slightly too large.
For rotation: command a 360-degree turn and check if the robot ends facing the same
direction. If it over-rotates, the wheel base constant is too small.

### Wiring

**Left Motor (ULN2003 #1):**

| ESP32-S3 GPIO | ULN2003 Pin | 28BYJ-48 Coil |
|---------------|-------------|----------------|
| GPIO 4 | IN1 | Blue |
| GPIO 5 | IN2 | Pink |
| GPIO 6 | IN3 | Yellow |
| GPIO 7 | IN4 | Orange |

**Right Motor (ULN2003 #2):**

| ESP32-S3 GPIO | ULN2003 Pin | 28BYJ-48 Coil |
|---------------|-------------|----------------|
| GPIO 15 | IN1 | Blue |
| GPIO 16 | IN2 | Pink |
| GPIO 17 | IN3 | Yellow |
| GPIO 18 | IN4 | Orange |

**Power:** ULN2003 VCC to 5V rail, GND to common ground.

---

## Phase 2: Deploying the Communication Protocols

LLMos uses two completely separate, parallel networks: one for vision (HTTP) and
one for motor control (UDP). Both ESP32 chips connect to the same WiFi network as
the host PC.

### The "Eyes" -- ESP32-CAM (Port 80)

**Firmware**: `firmware/esp32-cam-mjpeg/esp32-cam-mjpeg.ino`

Flash the ESP32-CAM using the Arduino IDE or PlatformIO. Before flashing, set your
WiFi credentials in the firmware source.

**Validation:**

1. Open `http://<ESP32-CAM-IP>/stream` in your browser
2. You should see a live 320x240 JPEG stream at approximately 10fps
3. Check `http://<ESP32-CAM-IP>/status` for FPS count and WiFi RSSI

The camera firmware features:
- QVGA resolution (320x240) with JPEG quality 12
- Target 10fps with frame interval throttling
- Double-buffered frame capture
- Auto exposure, white balance, and gain control
- Flash LED control

The host PC's VLM (Qwen3-VL-8B) reads frames from this endpoint to generate
VisionFrames for the navigation loop.

### The "Spinal Cord" -- ESP32-S3 (Port 4210)

**Firmware**: `firmware/esp32-s3-stepper/esp32-s3-stepper.ino`

Flash the ESP32-S3 with the UDP listener firmware. UDP is used instead of TCP
because it has zero handshake latency, critical for the 200ms instinct loop.

**Validation:**

Use a UDP testing tool (e.g., PacketSender, netcat, or a Python script) to send
this JSON over UDP to `<ESP32-S3-IP>:4210`:

```json
{"cmd":"move_cm","left_cm":10.0,"right_cm":10.0,"speed":500}
```

If the robot moves forward exactly 10cm (~2173 steps), the somatic layer is
complete. The firmware will respond with a JSON status including step counts and
pose.

**Available Commands:**

| Command | Description |
|---------|-------------|
| `move_steps` | Step-based movement: `{"cmd":"move_steps","left":N,"right":N,"speed":N}` |
| `move_cm` | Distance-based: `{"cmd":"move_cm","left_cm":F,"right_cm":F,"speed":F}` |
| `rotate_deg` | In-place rotation: `{"cmd":"rotate_deg","degrees":F,"speed":F}` |
| `stop` | Immediate stop: `{"cmd":"stop"}` |
| `get_status` | Pose + step counts: `{"cmd":"get_status"}` |
| `set_config` | Calibration: `{"cmd":"set_config","wheel_diameter_cm":F,"wheel_base_cm":F}` |

**Safety Features:**
- 2-second host timeout triggers automatic emergency stop
- Maximum 40960 steps per command (10 revolutions)
- Maximum 1024 steps/second
- Status LED heartbeat (blink patterns indicate state)
- Motor coils disabled when idle (power saving, heat prevention)

---

## Phase 3: Activating the LLMos Navigation Loop

Now that the hardware matches the network specifications, connect it to the LLMos
TypeScript runtime.

### Configure IP Bindings

Set the local IP addresses of your ESP32-S3 (motor controller) and ESP32-CAM
(camera) in your environment configuration or `.env` file. The
`lib/hal/wifi-connection.ts` module uses these to establish the UDP transport.

### Test Movement Commands

The `NavigationHALBridge` in `lib/runtime/navigation-hal-bridge.ts` connects the
navigation loop to the HAL. When running with a PhysicalHAL:

1. The navigation loop runs a cycle: serialize world model, generate candidates,
   call LLM, validate decision
2. The decision (e.g., MOVE_TO target) is planned via A* pathfinding
3. The path waypoints are translated to HAL locomotion commands
4. The HAL sends UDP JSON to the ESP32-S3
5. The robot moves, and the step counts update the pose

**Speed Limits:**

The 28BYJ-48 has a maximum reliable speed of 1024 steps/second (~4.71 cm/s). Do
not let the LLM command speeds higher than this or the steppers will skip steps,
causing odometry drift. The firmware clamps speed to this limit, but the host
should also validate.

### The Navigation Cycle on Real Hardware

```
Camera Frame (ESP32-CAM HTTP) --> Qwen3-VL-8B --> VisionFrame
  --> VisionWorldModelBridge --> Occupancy Grid Update
  --> Candidate Generation --> LLM Navigation Decision
  --> A* Path Planning --> HAL Locomotion Command
  --> UDP JSON (ESP32-S3 port 4210) --> Stepper Motors
  --> Step Count Odometry --> Pose Update --> Next Cycle
```

Each cycle takes approximately 1-2 seconds with cloud LLM inference (OpenRouter),
or 200-500ms with local inference for the instinct brain.

---

## Phase 4: Closing the Loop with Spatial Memory

The final step to making the hardware autonomous is spatial awareness through
odometry.

### Continuous Status Polling

The host runtime should continuously send `{"cmd":"get_status"}` via UDP to the
ESP32-S3. The response includes:

- Current pose (x, y, heading) computed by the firmware
- Accumulated left and right step counts
- Whether motors are currently running
- Uptime

The pose is computed on the firmware using differential drive kinematics:

```
linearCm = (leftDistCm + rightDistCm) / 2
angularRad = (rightDistCm - leftDistCm) / wheelBaseCm
newX = prevX + linearCm * sin(prevHeading + angularRad / 2)
newY = prevY + linearCm * cos(prevHeading + angularRad / 2)
newHeading = prevHeading + angularRad
```

Because stepper motors execute precise discrete steps (unlike DC motors which slip),
this odometry is highly accurate over short distances. Over long distances, small
errors accumulate -- the vision pipeline corrects this drift.

### Obstacle Detection and Response

Place the physical robot in front of a wall:

1. The ESP32-CAM streams the camera frame to the host
2. Qwen3-VL-8B analyzes the frame and detects the wall
3. The VisionWorldModelBridge marks the wall cells as obstacles
4. The candidate generator avoids candidates behind the wall
5. The LLM decides to ROTATE_TO clear the obstacle
6. The navigation loop sends `{"cmd":"rotate_deg","degrees":90.0,"speed":1024}`
7. The robot rotates 90 degrees, the new camera frame shows open space
8. Navigation continues

This is the fundamental closed loop: see, think, act, observe the result, repeat.

---

## Troubleshooting

### Robot Moves the Wrong Distance

The wheel diameter or wheel base constant does not match your physical hardware.
Calibrate:

1. Command `{"cmd":"move_cm","left_cm":50,"right_cm":50,"speed":500}`
2. Measure actual distance traveled
3. If it moved 52cm instead of 50cm: your actual wheel diameter is
   `6.0 * (52/50) = 6.24 cm`
4. Update: `{"cmd":"set_config","wheel_diameter_cm":6.24}`

### Robot Over/Under-Rotates

The wheel base constant is wrong.

1. Command `{"cmd":"rotate_deg","degrees":360,"speed":500}`
2. If the robot does more than one full rotation: wheel base is too small
3. If it does less: wheel base is too large
4. Adjust: `{"cmd":"set_config","wheel_base_cm":F}`

### Stepper Motors Skip Steps

Speed is too high for the load. Reduce to 500-800 steps/second. Also check:
- Ball caster friction (should be very low)
- Power supply (needs 5V 2A minimum for two steppers)
- Wheel binding (should spin freely by hand)

### WiFi Connection Drops

The `lib/hal/wifi-connection.ts` transport retries 3 times with 2-second timeouts.
If drops persist:
- Ensure both ESP32s and host PC are on the same network
- Check WiFi RSSI via `GET /status` on the ESP32-CAM
- Move closer to the router or use a dedicated 2.4GHz network
- The firmware has a 2-second host timeout -- if the host is too slow, the robot
  emergency-stops

### Camera Stream Stutters

- Check frame rate via `GET /status` endpoint
- Reduce JPEG quality (higher number = lower quality but faster)
- Ensure only one client is consuming the stream
- The ESP32-CAM has limited memory -- restart if frames corrupt

---

## Key Code Files

| File | Purpose |
|------|---------|
| `firmware/esp32-s3-stepper/esp32-s3-stepper.ino` | Motor controller firmware |
| `firmware/esp32-cam-mjpeg/esp32-cam-mjpeg.ino` | Camera streaming firmware |
| `lib/hal/stepper-kinematics.ts` | Motor math (step/distance conversions) |
| `lib/hal/wifi-connection.ts` | UDP transport layer |
| `lib/hal/physical-adapter.ts` | PhysicalHAL implementation |
| `lib/hal/firmware-safety-config.ts` | Safety parameters |
| `lib/hal/serial-protocol.ts` | CRC-16 framing (wired connection) |
| `lib/runtime/navigation-hal-bridge.ts` | NavigationLoop to HAL bridge |
| `lib/runtime/openrouter-inference.ts` | Cloud LLM inference adapter |
| `Agent_Robot_Model/Readme.md` | Full BOM and wiring diagrams |

---

## What to Do Today

If you already have the hardware wired:

1. **Build the 3D-printed 8cm chassis** and mount all components
2. **Flash both ESP32s** with the firmware from the `firmware/` directory
3. **Test UDP commands**: send `{"cmd":"move_cm","left_cm":10,"right_cm":10,"speed":800}` to port 4210
4. **Verify the camera**: open `http://<ESP32-CAM-IP>/stream` in a browser
5. Once the robot respects the JSON payload perfectly, **the LLM takes over the steering wheel**

---

## Chapter Summary

The V1 Stepper Cube Robot is the physical manifestation of everything described in
the preceding fourteen chapters. Two ESP32 chips -- one for eyes, one for muscles --
communicate over WiFi with the host PC running the LLMos TypeScript runtime. The
camera feeds frames to Qwen3-VL-8B for spatial understanding. The motor controller
receives UDP JSON commands and drives precise stepper motors. The odometry loop
tracks position through step counting. The safety firmware enforces emergency stops
when the host goes silent. Assembly, calibration, and protocol validation take the
system from simulation to reality. The same navigation code, the same world model,
the same LLM decision loop -- now driving a physical robot.

---

*Previous: [Chapter 14 -- What's Next: From Research to Reality](14-whats-next.md)*
