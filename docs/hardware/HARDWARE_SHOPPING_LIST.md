# Hardware Shopping List & Circuit Guide

## Build Your LLMos-Compatible Robot

This guide covers the hardware needed to build a physical AI robot agent compatible with LLMos. The goal is a robot that can:
- Run Qwen3-VL-8B (via OpenRouter) for runtime vision and navigation
- Execute navigation decisions through the HAL interface
- Operate both in simulation and real world via the same NavigationHALBridge

---

## Bill of Materials (BOM)

### Core Components

| Component | Specification | Qty | Est. Price | Notes |
|-----------|--------------|-----|------------|-------|
| **ESP32-S3 DevKit** | 8MB PSRAM, USB-C | 1 | $15 | Brain of the robot |
| **OV2640 Camera** | 2MP, 160x120 AI mode | 1 | $8 | For vision pipeline (frames sent to Qwen3-VL-8B via OpenRouter) |
| **Stepper Motor** | NEMA 17, 1.8deg/step | 2 | $12 each | Precise movement |
| **Stepper Driver** | A4988 or TMC2209 | 2 | $5 each | Motor control circuit |
| **Power Supply** | 12V 2A DC adapter | 1 | $10 | Motor power |
| **LiPo Battery** | 3.7V 2000mAh | 1 | $12 | Portable power |
| **Buck Converter** | 12V to 5V, 3A | 1 | $5 | ESP32 power from 12V |

### Mechanical Components

| Component | Specification | Qty | Est. Price | Notes |
|-----------|--------------|-----|------------|-------|
| **Wheels** | 65mm diameter, rubber | 2 | $5 pair | Traction |
| **Caster Wheel** | 25mm ball caster | 1 | $3 | Balance point |
| **Motor Brackets** | NEMA 17 mount | 2 | $4 pair | Attach motors to chassis |
| **Shaft Coupler** | 5mm to 6mm | 2 | $3 pair | Connect motor to wheel |

### Sensors (Optional but Recommended)

| Component | Specification | Qty | Est. Price | Notes |
|-----------|--------------|-----|------------|-------|
| **Ultrasonic Sensor** | HC-SR04 | 2-4 | $2 each | Distance sensing |
| **IMU** | MPU6050 | 1 | $5 | Orientation |
| **Line Sensor** | 5-channel IR array | 1 | $6 | Line following |

### Chassis

| Option | Description | Est. Price |
|--------|-------------|------------|
| **3D Printed** | Custom design, PLA | $5-15 filament |
| **Acrylic Kit** | Pre-cut platform | $15-25 |
| **DIY** | Cardboard prototype | Free |

---

## Total Estimated Cost

| Build Level | Components | Cost |
|-------------|-----------|------|
| **Minimal** | ESP32 + Camera + DC motors | ~$40 |
| **Standard** | Steppers + Sensors + Chassis | ~$100 |
| **Full Featured** | All components + quality chassis | ~$150 |

---

## Vision Pipeline: Qwen3-VL-8B via OpenRouter

LLMos uses a dual-LLM architecture:

- **Claude Opus 4.6**: Development-time reasoning, code generation, and system planning
- **Qwen3-VL-8B (via OpenRouter)**: Runtime vision processing and navigation decisions

The vision pipeline works as follows:

1. **Camera captures frame** (OV2640 on ESP32, or Three.js renderer in simulation)
2. **Frame sent to HAL** via `vision.captureFrame()`
3. **VisionWorldModelBridge** passes the frame to the runtime LLM
4. **Qwen3-VL-8B (via OpenRouter)** processes the image and returns navigation decisions
5. **NavigationLoop** converts the decision into HAL locomotion commands

The OpenRouter inference adapter handles the API communication. Camera frames are captured as JPEG and sent as base64-encoded data URLs. No local GPU is required -- all vision inference runs in the cloud via OpenRouter.

---

## Motor Control Circuit: Yes, You Need One

### Why a Motor Driver is Required

**The ESP32 GPIO cannot directly drive motors** because:

1. **Current Limitation**: ESP32 pins can only source ~20mA. Motors need 500mA-2A.
2. **Voltage Mismatch**: ESP32 runs at 3.3V logic. Motors typically need 12V.
3. **Back-EMF Protection**: Motors generate voltage spikes when stopping that can destroy the microcontroller.
4. **Isolation**: The driver provides electrical separation between logic and power circuits.

### Stepper Motor Driver Options

#### Option 1: A4988 (Recommended for Beginners)
- **Cost**: ~$3-5 each
- **Current**: Up to 2A per phase
- **Microstepping**: Up to 1/16
- **Features**: Built-in thermal shutdown

```
Wiring Diagram:

ESP32               A4988                NEMA 17
+--------+         +----------+         +---------+
|        |         |          |         |         |
|   D2 --+-------->| STEP     |         | A+ (Red)|<--+
|   D3 --+-------->| DIR      |         | A-(Blue)|<--+
|   D4 --+-------->| EN       |         | B+(Grn) |<--+
|        |         |          |         | B-(Blk) |<--+
|  GND --+-------->| GND      |         |         |
|        |         |    VMOT <+-------->| 12V     |
+--------+         |    GND  <+-------->| GND     |
                   |          |         +---------+
                   |  1A  1B  |
                   |  2A  2B -+----------> Motor Coils
                   +----------+
```

#### Option 2: TMC2209 (Quieter, More Precise)
- **Cost**: ~$8-12 each
- **Current**: Up to 2.8A peak
- **Microstepping**: Up to 1/256
- **Features**: Silent operation (StealthChop), stallGuard

#### Option 3: DRV8825 (Higher Current)
- **Cost**: ~$4-6 each
- **Current**: Up to 2.5A
- **Microstepping**: Up to 1/32

### Current Limiting (Important!)

Both A4988 and DRV8825 have adjustable current limiting via a potentiometer. Set this BEFORE connecting motors:

```
Vref = I_motor x 8 x R_sense

For A4988 with 0.1 ohm sense resistors and 1A motor:
Vref = 1.0 x 8 x 0.1 = 0.8V

Measure with multimeter between potentiometer and GND.
```

---

## Wiring Schematic

### Complete System Wiring

```
+---------------------------------------------------------------+
|                        POWER SYSTEM                             |
|                                                                 |
|    +---------+     +-------------+     +------------------+   |
|    |  12V DC |---->| Buck Conv.  |---->| ESP32 (5V/3.3V)  |   |
|    | Adapter |     | (12V->5V)   |     +------------------+   |
|    +----+----+     +-------------+                             |
|         |                                                       |
|         v                                                       |
|    +-----------------------------------------+                 |
|    |         MOTOR POWER (12V)               |                 |
|    |   +----------+      +----------+       |                 |
|    |   |  A4988   |      |  A4988   |       |                 |
|    |   | Driver 1 |      | Driver 2 |       |                 |
|    |   +----+-----+      +----+-----+       |                 |
|    |        v                  v             |                 |
|    |   +----------+      +----------+       |                 |
|    |   | Stepper  |      | Stepper  |       |                 |
|    |   | Motor 1  |      | Motor 2  |       |                 |
|    |   | (Left)   |      | (Right)  |       |                 |
|    |   +----------+      +----------+       |                 |
|    +-----------------------------------------+                 |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
|                      ESP32-S3 CONNECTIONS                       |
|                                                                 |
|   GPIO  |  Function      |  Connected To                       |
|  -------+----------------+---------------------                |
|    D2   |  Step Motor 1  |  A4988 #1 STEP                      |
|    D3   |  Dir Motor 1   |  A4988 #1 DIR                       |
|    D4   |  Step Motor 2  |  A4988 #2 STEP                      |
|    D5   |  Dir Motor 2   |  A4988 #2 DIR                       |
|    D6   |  Enable Both   |  A4988 #1 & #2 EN (parallel)        |
|   D12   |  Trigger       |  HC-SR04 #1 TRIG                    |
|   D13   |  Echo          |  HC-SR04 #1 ECHO (via divider!)     |
|   D14   |  Camera SCL    |  OV2640 SIOC                        |
|   D15   |  Camera SDA    |  OV2640 SIOD                        |
|  D16-21 |  Camera Data   |  OV2640 D0-D7                       |
|   3.3V  |  Logic Power   |  Sensors VCC                        |
|   GND   |  Ground        |  Common ground                      |
+---------------------------------------------------------------+
```

### Voltage Divider for 5V Sensors

The HC-SR04 ultrasonic sensor outputs 5V on ECHO, but ESP32 is 3.3V logic. Use a voltage divider:

```
HC-SR04 ECHO --+-- 1k ohm --+-- ESP32 GPIO
               |             |
              GND          2k ohm
                             |
                            GND
```

This divides 5V to 3.3V safely.

---

## Camera Integration

### OV2640 Camera Module Pinout

```
OV2640 Module          ESP32-S3
+------------+        +------------+
|    3.3V ---+------->| 3.3V       |
|    GND  ---+------->| GND        |
|    SIOC ---+------->| GPIO14     | (I2C Clock)
|    SIOD ---+------->| GPIO15     | (I2C Data)
|    VSYNC --+------->| GPIO6      |
|    HREF ---+------->| GPIO7      |
|    PCLK ---+------->| GPIO13     |
|    D0-D7 --+------->| GPIO16-21  | (Parallel Data)
|    XCLK <--+--------| GPIO0      | (Clock out)
|    RESET --+------->| 3.3V       | (Always high)
|    PWDN ---+------->| GND        | (Always low)
+------------+        +------------+
```

### Camera Configuration for Vision Pipeline

```cpp
// ESP32 camera init for LLMos
// Frames captured here are sent to Qwen3-VL-8B via OpenRouter
// for runtime vision processing and navigation decisions
camera_config_t config;
config.ledc_channel = LEDC_CHANNEL_0;
config.ledc_timer = LEDC_TIMER_0;
config.pin_d0 = Y2_GPIO_NUM;
// ... other pins ...
config.xclk_freq_hz = 20000000;
config.pixel_format = PIXFORMAT_JPEG;
config.frame_size = FRAMESIZE_QVGA;  // 320x240 for AI
config.jpeg_quality = 12;            // 0-63, lower = better
config.fb_count = 2;                 // Double buffering
```

---

## Assembly Checklist

### Step 1: Test Components Individually
- [ ] ESP32 boots and connects to WiFi
- [ ] Camera captures and streams MJPEG
- [ ] Each stepper moves with manual commands
- [ ] Ultrasonic sensors return distance readings

### Step 2: Motor Driver Setup
- [ ] Set current limit potentiometer (see formula above)
- [ ] Wire STEP, DIR, EN pins to ESP32
- [ ] Connect motor coils (match phases!)
- [ ] Test with simple step sequence

### Step 3: Power System
- [ ] Connect 12V adapter to motor drivers
- [ ] Verify buck converter outputs 5V
- [ ] Power ESP32 from buck converter
- [ ] Check for heat issues under load

### Step 4: Mechanical Assembly
- [ ] Mount motors to chassis
- [ ] Attach wheels with shaft couplers
- [ ] Position caster for balance
- [ ] Mount camera with forward view
- [ ] Secure all wiring

### Step 5: Software Integration
- [ ] Flash LLMos firmware to ESP32
- [ ] Connect to LLMos via HAL physical adapter (serial or WiFi)
- [ ] Test in simulation mode first using SimulationHAL
- [ ] Switch to PhysicalHAL and verify real hardware operation
- [ ] Run NavigationLoop with Qwen3-VL-8B vision pipeline

---

## Troubleshooting

### Motors Not Moving
1. Check enable pin (should be LOW to enable)
2. Verify step/dir connections
3. Measure voltage at motor coils
4. Check current limit setting

### Camera Not Working
1. Verify I2C address (0x30 typical for OV2640)
2. Check XCLK output with oscilloscope
3. Ensure adequate power supply
4. Reset camera module

### ESP32 Restarting
1. Insufficient power (motors drawing too much)
2. Back-EMF spikes (add capacitors)
3. Memory issues (check heap usage)

---

## Recommended Suppliers

### Global
- **AliExpress**: Best prices, 2-4 week shipping
- **Amazon**: Fast shipping, higher prices
- **Adafruit**: Quality parts, great docs
- **SparkFun**: Similar to Adafruit

### Specific Recommendations
- **ESP32-S3**: Espressif DevKitC (official)
- **OV2640**: AI-Thinker ESP32-CAM module (includes ESP32)
- **Stepper Motors**: StepperOnline NEMA 17
- **Drivers**: BigTreeTech TMC2209 or generic A4988

---

## Next Steps After Building

1. **Print the Robot**: Use provided 3D models or design your own
2. **Flash Firmware**: Install LLMos-compatible firmware on ESP32
3. **Connect to LLMos**: Via HAL physical adapter (serial at 115200 baud or WiFi)
4. **Test Navigation**: Run NavigationLoop with one of the 4 test arenas (Simple Navigation, Exploration, Dead-End, Narrow Corridor)
5. **Enable Vision**: Connect Qwen3-VL-8B via OpenRouter for runtime perception

---

*Hardware Guide Version: 1.1*
*Last Updated: 2026-02-16*
*Compatibility: LLMos v0.x, ESP32-S3*
*Runtime Vision: Qwen3-VL-8B via OpenRouter*
*Development LLM: Claude Opus 4.6*
