# Robot models

## Robot ONE

### Hardware Requirements

- ESP32-CAM (AI-Thinker)
- 2x Stepper motors (SMS4303R or similar)
- Motor driver (ULN2003)
- Power supply
- FTDI programmer

## Robot V1 — Stepper Cube Robot

### Bill of Materials

| # | Component | Quantity | Description |
|---|-----------|----------|-------------|
| 1 | ESP32-S3-DevKitC-1 | 1 | WiFi motor controller (GPIO4-7, GPIO15-18 for ULN2003) |
| 2 | ESP32-CAM (AI-Thinker) | 1 | WiFi camera, MJPEG streaming at 320x240 ~10fps |
| 3 | 28BYJ-48 Stepper Motor | 2 | 5V unipolar, 4096 steps/rev (64:1 gear ratio), ~15 RPM |
| 4 | ULN2003 Driver Board | 2 | Darlington array stepper driver |
| 5 | Wheels (6cm diameter) | 2 | Press-fit or 3D-printed for 28BYJ-48 shaft |
| 6 | Ball Caster | 1 | Rear support, low friction |
| 7 | 5V 2A Power Supply | 1 | USB-C or barrel jack, powers both ESP32s and motors |
| 8 | 3D-Printed Cube Chassis | 1 | 8cm cube, mounts all components |
| 9 | Jumper Wires | ~20 | Dupont female-female and male-female |
| 10 | USB-C Cable | 2 | Programming and power for each ESP32 |

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  Host PC                         │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │  Qwen3-VL-8B │    │  LLMos Navigation Loop │ │
│  │  (VLM)       │◄──►│  (TypeScript runtime)  │ │
│  └──────┬───────┘    └───────────┬────────────┘ │
│         │                        │               │
│         │ Vision Frames          │ Motor Commands │
└─────────┼────────────────────────┼───────────────┘
          │ HTTP MJPEG             │ UDP JSON
          │ port 80               │ port 4210
          ▼                        ▼
   ┌─────────────┐         ┌──────────────┐
   │  ESP32-CAM   │         │  ESP32-S3     │
   │  (camera)    │         │  (motors)     │
   │  WiFi STA    │         │  WiFi STA     │
   └─────────────┘         └──────┬───────┘
                                   │
                            ┌──────┴───────┐
                            │   ULN2003    │
                            │   x2         │
                            └──────┬───────┘
                                   │
                            ┌──────┴───────┐
                            │  28BYJ-48    │
                            │  x2          │
                            └──────────────┘
```

### Wiring — ESP32-S3 to ULN2003 Drivers

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

**Power:**
- ULN2003 VCC → 5V rail
- ULN2003 GND → Common ground
- 28BYJ-48 Red wire → 5V (via ULN2003 board connector)

### Motor Specifications — 28BYJ-48

| Parameter | Value |
|-----------|-------|
| Steps per revolution | 4096 (with 64:1 gear ratio) |
| Max RPM | ~15 |
| Operating voltage | 5V DC |
| Current draw (per coil) | ~240mA |
| Holding torque | ~34 mN·m |
| Step angle (internal) | 5.625° |
| Gear ratio | 64:1 |

### Kinematic Constants

| Parameter | Value |
|-----------|-------|
| Wheel diameter | 6.0 cm |
| Wheel circumference | 18.85 cm |
| Wheel base | 12.0 cm |
| Steps per cm | ~217.3 |
| Max speed | 1024 steps/s (~4.71 cm/s) |
| Max acceleration | 512 steps/s² |

### Communication Protocol

**Motor Controller (ESP32-S3):** UDP JSON on port 4210

Commands:
- `{"cmd":"move_steps","left":N,"right":N,"speed":N}` — step-based movement
- `{"cmd":"move_cm","left_cm":F,"right_cm":F,"speed":F}` — cm-based movement
- `{"cmd":"rotate_deg","degrees":F,"speed":F}` — in-place rotation
- `{"cmd":"stop"}` — immediate stop
- `{"cmd":"get_status"}` — pose, step counts, running state
- `{"cmd":"set_config","wheel_diameter_cm":F,"wheel_base_cm":F}` — calibration

**Camera (ESP32-CAM):** HTTP MJPEG on port 80

- `GET /stream` — multipart/x-mixed-replace JPEG frames
- `GET /status` — camera status JSON
