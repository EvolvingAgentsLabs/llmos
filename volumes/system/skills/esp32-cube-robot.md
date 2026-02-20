---
name: ESP32 Cube Robot Controller
category: hardware
description: Controls a two-wheeled differential drive cube robot based on ESP32-S3
keywords: [esp32, robot, differential-drive, motor, cube, simulation, kinematics]
version: 1.0.0
---

# Skill: ESP32 Cube Robot Controller

## When to Use
When controlling or simulating a two-wheeled differential drive cube robot based on ESP32-S3. This skill teaches you how to send motor commands, receive telemetry, and understand the robot's movement physics.

## Hardware Specifications

| Component | Description |
|-----------|-------------|
| MCU | ESP32-S3 |
| Drive System | Differential (Left/Right motors) |
| Wheel Base | 0.5 meters (distance between wheels) |
| Sensors | Front Camera, Wheel Encoders |
| Protocol | JSON over Serial (115200 baud) |
| Motor Range | -255 (full reverse) to 255 (full forward) |

## Protocol Definition

### Commands (PC -> Robot)

#### 1. Drive Motors
```json
{"action": "drive", "l": <int>, "r": <int>}
```
- `l`: Left motor speed (-255 to 255)
- `r`: Right motor speed (-255 to 255)
- Positive values = forward, Negative = reverse

**Response:**
```json
{"status": "ok", "msg": "motors set"}
```

#### 2. Stop Motors
```json
{"action": "stop"}
```

**Response:**
```json
{"status": "ok", "msg": "motors stopped"}
```

#### 3. Get Robot Pose
```json
{"action": "get_pose"}
```

**Response:**
```json
{
  "status": "telemetry",
  "pose": {"x": 0.0, "y": 0.0, "rotation": 0.0},
  "motors": {"left": 0, "right": 0},
  "encoders": {"left": 1024, "right": 1024}
}
```

#### 4. Set LED Color
```json
{"action": "set_led", "r": 255, "g": 0, "b": 0}
```

**Response:**
```json
{"status": "ok", "msg": "LED color set"}
```

#### 5. Reset Pose
```json
{"action": "reset_pose"}
```

**Response:**
```json
{"status": "ok", "msg": "pose reset", "pose": {"x": 0, "y": 0, "rotation": 0}}
```

#### 6. Get Camera Status
```json
{"action": "get_camera_status"}
```

**Response:**
```json
{"status": "ok", "cam_status": "ready", "resolution": "640x480"}
```

### Telemetry (Robot -> PC)
Periodic telemetry (every 100ms when enabled):
```json
{
  "status": "telemetry",
  "vbat": 3.7,
  "enc_l": 1024,
  "enc_r": 1024,
  "pose": {"x": 1.5, "y": 2.3, "rotation": 0.785},
  "cam_status": "ready"
}
```

## Differential Drive Kinematics

The robot uses differential drive kinematics for movement:

```
Linear Velocity:  v = (v_right + v_left) / 2
Angular Velocity: ω = (v_right - v_left) / wheel_base

Position Update (per dt):
  rotation += ω * dt
  x += v * sin(rotation) * dt
  y += v * cos(rotation) * dt
```

Note: rotation=0 means facing +Y direction. Positive angular velocity increases rotation (clockwise turn).

### Movement Patterns

| Left Motor | Right Motor | Movement |
|------------|-------------|----------|
| +100 | +100 | Forward |
| -100 | -100 | Backward |
| +100 | -100 | Rotate Left (CCW) |
| -100 | +100 | Rotate Right (CW) |
| +150 | +50 | Curve Left |
| +50 | +150 | Curve Right |

## Usage Examples

### Basic Movement (JavaScript)
```javascript
// Drive forward
await sendDeviceCommand({ action: 'drive', l: 100, r: 100 });

// Turn left (rotate in place) - left motor faster/forward, right slower/reverse
await sendDeviceCommand({ action: 'drive', l: 100, r: -100 });

// Turn right (rotate in place) - right motor faster/forward, left slower/reverse
await sendDeviceCommand({ action: 'drive', l: -100, r: 100 });

// Stop
await sendDeviceCommand({ action: 'stop' });

// Get current position
const telemetry = await sendDeviceCommand({ action: 'get_pose' });
console.log('Robot at:', telemetry.pose);
```

### Drive in a Square
```javascript
async function driveSquare(sideLength = 1.0, speed = 100) {
  const DRIVE_TIME = sideLength * 1000; // Approximate ms per meter
  const TURN_TIME = 1500; // Time for 90-degree turn

  for (let i = 0; i < 4; i++) {
    // Drive forward
    await sendDeviceCommand({ action: 'drive', l: speed, r: speed });
    await delay(DRIVE_TIME);

    // Turn 90 degrees right (right motor reverse, left motor forward)
    await sendDeviceCommand({ action: 'drive', l: -speed, r: speed });
    await delay(TURN_TIME);
  }

  await sendDeviceCommand({ action: 'stop' });
}
```

### Drive in a Circle
```javascript
async function driveCircle(radius = 1.0, speed = 100) {
  // For a circle, inner wheel goes slower than outer wheel
  const outerSpeed = speed;
  const innerSpeed = speed * (radius - 0.25) / (radius + 0.25);

  await sendDeviceCommand({
    action: 'drive',
    l: Math.round(innerSpeed),
    r: Math.round(outerSpeed)
  });

  // Drive for one full circle (time depends on speed and radius)
  await delay(2 * Math.PI * radius * 1000 / (speed * 0.01));

  await sendDeviceCommand({ action: 'stop' });
}
```

### Figure-Eight Pattern
```javascript
async function driveFigureEight(radius = 0.5, speed = 80) {
  const HALF_CIRCLE_TIME = Math.PI * radius * 1000 / (speed * 0.01);

  // First circle (clockwise)
  const innerSpeed = speed * 0.5;
  await sendDeviceCommand({ action: 'drive', l: speed, r: innerSpeed });
  await delay(HALF_CIRCLE_TIME);

  // Second circle (counter-clockwise)
  await sendDeviceCommand({ action: 'drive', l: innerSpeed, r: speed });
  await delay(HALF_CIRCLE_TIME);

  await sendDeviceCommand({ action: 'stop' });
}
```

## Simulation Mode

The Virtual ESP32 provides a physics simulation for testing without hardware:

1. **Kinematics Engine**: Updates position at 100ms intervals using differential drive equations
2. **Encoder Simulation**: Generates encoder counts based on motor speeds
3. **Pose Tracking**: Maintains world coordinates (x, y, rotation in radians)
4. **Battery Simulation**: Simulates voltage drop under load

### Switching Between Real/Virtual

```javascript
// The system automatically routes to virtual device when no hardware connected
const response = await sendDeviceCommand({ action: 'get_info' });

if (response.virtual) {
  console.log('Running in simulation mode');
} else {
  console.log('Connected to real hardware');
}
```

## Safety Guidelines

1. **Always test in simulation first** before running on real hardware
2. **Set motor limits** - never exceed rated voltage/current
3. **Implement emergency stop** - bind to a physical button or keyboard
4. **Check battery voltage** - stop if below 3.2V per cell
5. **Clear the area** - ensure no obstacles when testing new movements

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Robot drifts | Unequal wheel friction | Calibrate motor speeds |
| Rotation overshoots | Too fast angular velocity | Reduce turn speed |
| Position error accumulates | No encoder feedback | Use get_pose periodically |
| Motors not responding | Not armed | Send arm command first |

## V1 Hardware — Stepper Motors over WiFi

The V1 hardware replaces DC motors with 28BYJ-48 steppers and USB serial with WiFi UDP.

### V1 Hardware Overview

| Component | Purpose |
|-----------|---------|
| ESP32-S3-DevKitC-1 | WiFi motor controller |
| ESP32-CAM (AI-Thinker) | WiFi camera (MJPEG streaming) |
| 2x 28BYJ-48 + ULN2003 | Stepper motors with drivers |
| 6cm wheels, 12cm wheel base | Differential drive |

### WiFi UDP Command Protocol (Port 4210)

Replaces the serial JSON protocol with UDP JSON for lower latency:

```json
// Move by steps
{"cmd":"move_steps", "left":2173, "right":2173, "speed":512}

// Move by centimeters
{"cmd":"move_cm", "left_cm":10.0, "right_cm":10.0, "speed":5.0}

// Rotate in place
{"cmd":"rotate_deg", "degrees":90, "speed":5.0}

// Stop immediately
{"cmd":"stop"}

// Get robot status (pose, step counts, running state)
{"cmd":"get_status"}

// Update calibration
{"cmd":"set_config", "wheel_diameter_cm":6.0, "wheel_base_cm":12.0}
```

### Camera Streaming Setup

The ESP32-CAM streams MJPEG over HTTP:

```
Stream URL: http://<ESP32-CAM-IP>/stream
Status URL: http://<ESP32-CAM-IP>/status
```

Resolution: 320x240 (QVGA), ~10fps, JPEG quality 12.

### V1 Stepper Drive Commands

| Left Steps | Right Steps | Movement |
|-----------|------------|----------|
| +2173 | +2173 | Forward 10cm |
| -2173 | -2173 | Backward 10cm |
| +1664 | -1664 | Rotate right 90° |
| -1664 | +1664 | Rotate left 90° |
| +2173 | +1087 | Arc right |
| +1087 | +2173 | Arc left |

### Key Differences from DC Motor Protocol

| Feature | DC Motor (v0) | Stepper (V1) |
|---------|--------------|--------------|
| Transport | USB Serial JSON | WiFi UDP JSON |
| Motor control | PWM -255 to 255 | Step counts + speed |
| Movement | Continuous (time-based) | Discrete (step-based) |
| Pose tracking | Host-side estimation | Firmware dead reckoning |
| Camera | Same ESP32 | Separate ESP32-CAM |
| Max speed | ~1 m/s | ~4.7 cm/s |
| Precision | Low (PWM deadband) | High (individual steps) |

## Version History

- **v1.1.0** (2026-02): V1 stepper hardware support
  - WiFi UDP command protocol
  - 28BYJ-48 stepper motor support
  - ESP32-CAM MJPEG streaming
  - Stepper-specific drive commands
- **v1.0.0** (2026-01-10): Initial protocol specification
  - Differential drive motor control
  - Pose tracking (x, y, rotation)
  - LED control
  - Camera status
