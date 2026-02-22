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
| Wheel base | 10.0 cm |
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

### Bytecode Protocol (Epoch 2) — LLMos Reduced Control Protocol (RCP)

The JSON protocol above is Epoch 1. Epoch 2 replaces JSON with a 6-byte binary frame
that the ESP32 reads directly into a struct — no parsing, no ArduinoJson, ~0.1ms
instead of ~15ms.

**Frame Format (6 bytes):**

```
Byte 0: 0xAA  (start marker)
Byte 1: OPCODE
Byte 2: PARAM_LEFT  (0-255)
Byte 3: PARAM_RIGHT (0-255)
Byte 4: CHECKSUM    (XOR of bytes 1-3)
Byte 5: 0xFF  (end marker)
```

**Opcode Table:**

| Opcode | Name | PARAM_LEFT | PARAM_RIGHT |
|--------|------|-----------|------------|
| `0x01` | MOVE_FORWARD | speed | speed |
| `0x02` | MOVE_BACKWARD | speed | speed |
| `0x03` | TURN_LEFT | left_speed | right_speed |
| `0x04` | TURN_RIGHT | left_speed | right_speed |
| `0x05` | ROTATE_CW | degrees | speed |
| `0x06` | ROTATE_CCW | degrees | speed |
| `0x07` | STOP | 0 | 0 |
| `0x08` | GET_STATUS | 0 | 0 |
| `0x09` | SET_SPEED | max_speed | acceleration |
| `0x0A` | MOVE_STEPS | left_hi | left_lo |
| `0x0B` | MOVE_STEPS_R | right_hi | right_lo |
| `0x10` | LED_SET | R | G |
| `0xFE` | RESET | 0 | 0 |

**Example — "Move forward at speed 100":**

```
JSON (58 bytes):     {"cmd":"move_cm","left_cm":10,"right_cm":10,"speed":500}
Bytecode (6 bytes):  AA 01 64 64 CB FF
```

Breakdown: `AA` (start) `01` (MOVE_FORWARD) `64` (left=100) `64` (right=100) `CB` (checksum: 0x01 XOR 0x64 XOR 0x64) `FF` (end).

**Testing bytecode commands:**

```bash
# Send a 6-byte MOVE_FORWARD command via Python
python3 -c "
import socket
cmd = bytes([0xAA, 0x01, 0x64, 0x64, 0xCB, 0xFF])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.sendto(cmd, ('<ESP32-S3-IP>', 4210))
"

# Send a STOP command
python3 -c "
import socket
cmd = bytes([0xAA, 0x07, 0x00, 0x00, 0x07, 0xFF])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.sendto(cmd, ('<ESP32-S3-IP>', 4210))
"

# Send a ROTATE_CW 90° command (degrees=90, speed=128)
python3 -c "
import socket
cmd = bytes([0xAA, 0x05, 0x5A, 0x80, 0xD5, 0xFF])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.sendto(cmd, ('<ESP32-S3-IP>', 4210))
"
```

**Dual-mode firmware:** The ESP32-S3 firmware accepts both protocols on port 4210.
If the first byte is `{`, it routes to the JSON parser. If the first byte is `0xAA`,
it routes to the bytecode handler. Both coexist during the transition period.

See [Chapter 16: The Neural Compiler](https://evolvingagentslabs.github.io/llmos/16-the-neural-compiler.html) for the full ISA specification, grammar-constrained decoding, and the firmware transition plan.
