---
name: Stepper Movement Primitives
category: hardware
description: Movement primitives for 28BYJ-48 stepper motors with differential drive kinematics
keywords: [stepper, 28byj-48, movement, kinematics, differential-drive, accelstepper]
version: 1.0.0
---

# Skill: Stepper Movement Primitives

## When to Use
When controlling V1 cube robot hardware with 28BYJ-48 stepper motors via WiFi UDP. This skill covers step math, movement commands, acceleration profiles, and calibration.

## 28BYJ-48 Motor Specifications

| Parameter | Value |
|-----------|-------|
| Steps per revolution | 4096 (64:1 gear ratio) |
| Internal step angle | 5.625° |
| Gear ratio | 64:1 |
| Max RPM | ~15 |
| Operating voltage | 5V DC |
| Current per coil | ~240mA |
| Drive mode | Half-step (AccelStepper HALF4WIRE) |

## Step Math

### Distance to Steps
```
WHEEL_CIRCUMFERENCE = WHEEL_DIAMETER × π = 6.0 × π ≈ 18.85 cm
STEPS_PER_CM = STEPS_PER_REV / WHEEL_CIRCUMFERENCE = 4096 / 18.85 ≈ 217.3

steps = distance_cm × STEPS_PER_CM
```

### Rotation to Steps (In-Place Turn)
```
ARC_CM = (degrees / 360) × π × WHEEL_BASE
       = (degrees / 360) × π × 10.0

left_steps  = +ARC_CM × STEPS_PER_CM   (forward)
right_steps = -ARC_CM × STEPS_PER_CM   (backward)
```

### Velocity Conversion
```
steps_per_second = cm_per_second × STEPS_PER_CM
max_velocity = 1024 steps/s ≈ 4.71 cm/s
```

## WiFi UDP Commands (Port 4210)

### Move by Steps
```json
{"cmd":"move_steps", "left":2173, "right":2173, "speed":512}
```
Moves both wheels forward ~10cm at half speed.

### Move by Centimeters
```json
{"cmd":"move_cm", "left_cm":20.0, "right_cm":20.0, "speed":5.0}
```
Moves forward 20cm at 5 cm/s.

### Rotate in Place
```json
{"cmd":"rotate_deg", "degrees":90, "speed":5.0}
```
Rotates 90° counter-clockwise.

### Emergency Stop
```json
{"cmd":"stop"}
```
Immediately stops both motors and disables coils.

### Get Status
```json
{"cmd":"get_status"}
```
Returns:
```json
{
  "ok": true,
  "pose": {"x": 12.5, "y": 3.2, "heading": 1.57},
  "steps": {"left": 4096, "right": 4096},
  "running": false,
  "emergency": false,
  "wifi_rssi": -45
}
```

## Movement Patterns

### Forward/Backward
```
Forward 10cm:  left=+2173 steps, right=+2173 steps
Backward 10cm: left=-2173 steps, right=-2173 steps
```

### Point Turn (Rotate in Place)
```
Turn right 90°:  left=+1707 steps, right=-1707 steps
Turn left 90°:   left=-1707 steps, right=+1707 steps
```

### Arc Turn
For an arc with radius R at speed V:
```
left_speed  = V × (R - WHEEL_BASE/2) / R
right_speed = V × (R + WHEEL_BASE/2) / R
```

### Drive in a Square (20cm sides)
```
Repeat 4 times:
  1. move_cm: left=20, right=20, speed=5
  2. Wait for completion
  3. rotate_deg: degrees=90, speed=3
  4. Wait for completion
```

## AccelStepper Acceleration Profiles

The firmware uses AccelStepper's trapezoidal motion profile:

```
Speed
  ^
  |     ┌──────────┐
  |    /            \
  |   / acceleration \  deceleration
  |  /                \
  | /                  \
  └──────────────────────► Time
```

- **Default acceleration**: 512 steps/s²
- **Max speed**: 1024 steps/s
- **Ramp time to max**: 1024/512 = 2 seconds
- **Minimum speed**: Instant start is OK for steppers but acceleration prevents power spikes

### Move Duration Estimation

**Trapezoidal profile** (long moves):
```
accel_time = max_speed / acceleration
accel_steps = 0.5 × acceleration × accel_time²
cruise_steps = total_steps - 2 × accel_steps
cruise_time = cruise_steps / max_speed
total_time = 2 × accel_time + cruise_time
```

**Triangle profile** (short moves, never reaches max speed):
```
total_time = 2 × √(total_steps / acceleration)
```

## Calibration Procedure

### 1. Wheel Diameter Calibration
1. Mark a starting position
2. Command: `move_steps left=4096 right=4096` (one full revolution)
3. Measure actual distance traveled
4. Calculate: `actual_diameter = measured_distance / π`
5. Update: `{"cmd":"set_config", "wheel_diameter_cm": <actual_diameter>}`

### 2. Wheel Base Calibration
1. Place robot on flat surface
2. Command: `rotate_deg degrees=360`
3. Measure actual rotation (should be 360°)
4. If over-rotates: increase wheel_base value
5. If under-rotates: decrease wheel_base value
6. Update: `{"cmd":"set_config", "wheel_base_cm": <actual_base>}`

### 3. Straight Line Correction
If robot drifts left/right when driving straight:
- Adjust individual wheel steps slightly
- Typical: ±2-5% difference between wheels

## Safety

- **Host timeout**: Motors stop if no command received for 2 seconds
- **Max continuous steps**: 40960 per command (10 revolutions)
- **Coil disable**: Motor coils are de-energized after each move to save power
- **Emergency stop**: `{"cmd":"stop"}` immediately halts all motion

## Version History

- **v1.0.0** (2026-02): Initial stepper movement primitives
  - 28BYJ-48 step math and kinematics
  - WiFi UDP command protocol
  - AccelStepper acceleration profiles
  - Calibration procedures
