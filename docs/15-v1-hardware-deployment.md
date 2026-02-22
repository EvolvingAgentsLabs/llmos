# Chapter 15 — V1 Hardware Deployment

## Step-by-Step Build & Test Guide (20cm Cube, 10cm Wheel Base)

This chapter walks you through building and validating the V1 robot in logical, testable stages:

1. Power Infrastructure
2. Camera Subsystem (Eyes)
3. Motor Subsystem (Muscles)
4. Mechanical Assembly
5. Calibration (10cm Wheel Base)
6. Full System Integration

The robot consists of:

* 20×20×20 cm lightweight cube chassis
* 10 cm wheel base (center-to-center)
* 6 cm diameter wheels
* Two 28BYJ-48 stepper motors
* ESP32-CAM (vision)
* ESP32-S3 (motor controller)

Because the wheel base is only 10 cm, the system is mechanically efficient and ideal for the 28BYJ-48 motors.

---

# Stage 1 — Power Infrastructure

## Components

* 5V 3A power supply (recommended)
* Protoboard (or MB102)
* 1000uF 16V electrolytic capacitor

---

## Wiring

```
5V Power Supply → + Rail
GND Power Supply → – Rail

Capacitor (+) → + Rail
Capacitor (–) → – Rail
```

### Why 3A?

Even though the robot is light, the system includes:

* 2 steppers
* 2 ESP32 boards
* WiFi bursts from ESP32-CAM

3A provides headroom and prevents brownouts.

---

# Stage 2 — Camera Subsystem (Test Independently)

## Wiring

```
ESP32-CAM 5V → + Rail
ESP32-CAM GND → – Rail
```

Do NOT use 3.3V.

---

## Validation

Flash camera firmware.

Open:

```
http://<ESP32-CAM-IP>/stream
```

Confirm:

* 320x240 MJPEG
* ~10fps
* Stable stream
* No random resets

If stable → Eyes validated.

---

# Stage 3 — Motor Subsystem (Test Without Chassis)

## Left Motor Wiring

| ESP32-S3 | ULN2003 |
| -------- | ------- |
| GPIO 4   | IN1     |
| GPIO 5   | IN2     |
| GPIO 6   | IN3     |
| GPIO 7   | IN4     |

ULN2003:

* VCC → 5V
* GND → GND

---

## Right Motor Wiring

| ESP32-S3 | ULN2003 |
| -------- | ------- |
| GPIO 15  | IN1     |
| GPIO 16  | IN2     |
| GPIO 17  | IN3     |
| GPIO 18  | IN4     |

---

## Independent Tests

Left only:

```json
{"cmd":"move_steps","left":1000,"right":0,"speed":600}
```

Right only:

```json
{"cmd":"move_steps","left":0,"right":1000,"speed":600}
```

Forward:

```json
{"cmd":"move_cm","left_cm":10,"right_cm":10,"speed":600}
```

If stable → Muscles validated.

---

# Stage 4 — Mechanical Assembly

Now mount everything onto the 20cm cube.

## Important Geometry

* Outer cube: 20 cm
* Wheel base (center-to-center): **10 cm**
* Wheel diameter: 6 cm

The smaller 10 cm wheel base:

* Improves turning efficiency
* Reduces required torque
* Increases rotational responsiveness
* Slightly increases angular sensitivity to calibration errors

---

## Install Ball Caster

Because wheel base is compact (10 cm), ball caster alignment is critical.

If caster has friction:

* Robot will yaw during straight movement
* Odometry error increases

Ensure free rolling in all directions.

---

# Stage 5 — Calibration (10cm Wheel Base)

These are your starting physical constants:

| Parameter      | Value   |
| -------------- | ------- |
| Wheel diameter | 6.0 cm  |
| Wheel base     | 10.0 cm |

Apply:

```json
{"cmd":"set_config","wheel_diameter_cm":6.0,"wheel_base_cm":10.0}
```

---

## Forward Calibration

Send:

```json
{"cmd":"move_cm","left_cm":50,"right_cm":50,"speed":600}
```

Measure real distance.

If actual = 49cm:

```
6.0 × (49/50) = 5.88
```

Apply correction.

---

## Rotation Calibration

Send:

```json
{"cmd":"rotate_deg","degrees":360,"speed":600}
```

Because wheel base is 10 cm (shorter than previous 12 cm), rotation should feel:

* Faster
* More responsive
* Less torque-demanding

If rotation overshoots:

* Wheel base constant too small

If under-rotates:

* Wheel base constant too large

---

# Updated Kinematic Implications (10cm Base)

Angular displacement formula:

```
angularRad = (rightDistCm - leftDistCm) / wheelBaseCm
```

With 10 cm base:

* Same wheel difference produces larger rotation
* Calibration precision becomes more important

However:

* Lower inertia
* Less torque stress on motors
* More stable at 800 steps/sec

---

# Recommended Speed Limits

Because chassis is light and wheel base compact:

* Default: 700–800 steps/sec
* Safe max: 1024 steps/sec
* Typical linear speed ≈ 4.7 cm/s

This configuration is well within 28BYJ safe torque limits.

---

# Stage 6 — Integrated Test

Reconnect camera.

Confirm:

* No brownouts
* Motors move
* Video stable during motion

---

## Full Rotation + Vision Test

1. Open camera stream.
2. Send:

```json
{"cmd":"rotate_deg","degrees":360,"speed":700}
```

You should see the room rotate smoothly.

Because base is only 10 cm, rotation should appear tight and clean.

---

# Expected Performance (10cm Wheel Base)

With proper calibration:

* ±1 cm linear accuracy over 50 cm
* ±2° rotational accuracy
* No skipped steps at 800 steps/sec
* Smooth pivot turns

---

# Final Mechanical Summary

Even though the outer cube is 20 cm, the effective drive geometry is compact:

* Wheel base: 10 cm
* Wheel diameter: 6 cm
* Mass: <200g

This makes the robot mechanically efficient and ideal for stepper-based differential drive.

The body is large.
The drivetrain is compact.
The control loop remains identical.
