# LLMos Standard Robot v1.0

**Official hardware specification for simulation-to-real robotics**

---

## Overview

The LLMos Standard Robot v1.0 is the official hardware platform designed to work seamlessly with the LLMos simulation environment. Every specification matches the virtual robot in the simulator, ensuring code written in simulation transfers directly to real hardware.

```
        [Distance Sensor]
             |||
        ┌────┴┴┴────┐
        │  ESP32-S3 │  ← Brain
        │   ┌───┐   │
        │   │USB│   │  ← Programming port
        └───┴───┴───┘
         │         │
    ┌────┴─┐   ┌──┴────┐
    │Wheel │   │ Wheel │  ← Motor + wheel assemblies
    └──────┘   └───────┘

    8cm x 8cm x 8cm cube form factor
```

---

## Core Specifications

### Physical Dimensions

```
Body:        80mm x 80mm x 80mm (cube)
Wheelbase:   70mm (center to center)
Wheel diameter: 65mm (32.5mm radius)
Wheel width: 10mm
Ground clearance: 5mm
Total weight: ~250g (with battery)
```

### Power System

```
Battery:     3.7V 1000mAh LiPo (18650 cell)
Voltage range: 3.0V - 4.2V
Runtime:     2-4 hours (typical use)
Charging:    USB-C or dedicated charger
Protection:  Over-discharge, over-current
```

### Performance

```
Max speed:      ~0.3 m/s (30 cm/s)
Max turn rate:  ~2 rad/s (115 deg/s)
Sensor range:   2.0m (distance sensors)
Precision:      ±5cm position accuracy
```

---

## Bill of Materials (BOM)

### Core Components

| Component | Specification | Quantity | Price (USD) | Source |
|-----------|---------------|----------|-------------|--------|
| **ESP32-S3 DevKit** | Dual-core 240MHz, WiFi/BLE | 1 | $10-12 | Amazon, AliExpress |
| **TT DC Motors** | 6V 200RPM with encoder | 2 | $8-10 (pair) | Amazon |
| **Motor Driver** | L298N or TB6612FNG | 1 | $3-5 | Amazon, AliExpress |
| **65mm Wheels** | Robot wheels with tire | 2 | $5-7 (pair) | Amazon |
| **18650 Battery** | 3.7V 1000mAh LiPo | 1 | $5-8 | Amazon |
| **Battery Holder** | 18650 holder with switch | 1 | $2-3 | Amazon |

**Core Total**: ~$35-45

### Sensors

| Component | Specification | Quantity | Price (USD) | Source |
|-----------|---------------|----------|-------------|--------|
| **HC-SR04** | Ultrasonic distance sensor | 1 | $2-3 | Amazon, AliExpress |
| **QTR-5RC** | 5-channel line sensor array | 1 | $8-10 | Pololu, Amazon |
| **MPU6050** (optional) | 6-axis IMU (accel + gyro) | 1 | $3-5 | Amazon |

**Sensors Total**: ~$13-18

### Actuators & Indicators

| Component | Specification | Quantity | Price (USD) | Source |
|-----------|---------------|----------|-------------|--------|
| **WS2812B LED Strip** | RGB addressable LEDs | 12 LEDs | $3-5 | Amazon, AliExpress |
| **Buzzer** (optional) | Passive or active buzzer | 1 | $1-2 | Amazon |

**Indicators Total**: ~$4-7

### Mechanical Parts

| Component | Specification | Quantity | Price (USD) | Source |
|-----------|---------------|----------|-------------|--------|
| **Robot Chassis** | 80mm cube frame or custom | 1 | $10-15 | 3D print or acrylic |
| **Jumper Wires** | Male-female, 20cm | 20 pack | $3-5 | Amazon |
| **Breadboard** (optional) | Mini breadboard for prototyping | 1 | $2-3 | Amazon |
| **Screws & Standoffs** | M3 screws, nuts, standoffs | Set | $5-8 | Amazon, hardware store |

**Mechanical Total**: ~$20-31

---

## **Total Cost: $72-101**

**Recommended Budget**: ~$80 for complete build with all sensors

---

## Detailed Component Specs

### 1. ESP32-S3 DevKit (Brain)

```
Microcontroller: ESP32-S3
CPU: Dual-core Xtensa 240MHz
RAM: 512KB SRAM
Flash: 8MB
Connectivity: WiFi 2.4GHz, Bluetooth 5.0 (BLE)
GPIO Pins: 34 programmable pins
ADC: 12-bit, 18 channels
PWM: 16 channels
UART: 3x serial ports
I2C: 2x buses
SPI: 4x buses
USB: Built-in USB for programming

Dimensions: 50mm x 25mm
Power: 3.3V logic, 5V via USB
Current draw: 50-250mA (depending on WiFi)

Why ESP32-S3?
- Powerful enough for complex algorithms
- Built-in sensors (accelerometer on some models)
- WiFi for remote control/data logging
- Native USB for easy programming
- Cheap and widely available
```

**Recommended Models**:
- ESP32-S3-DevKitC-1
- ESP32-S3-WROOM-1
- Generic ESP32-S3 dev boards

### 2. TT DC Motors (Movement)

```
Type: DC Gear Motor
Voltage: 3-6V DC
No-load speed: 200 RPM @ 6V
Gear ratio: 1:48
Torque: ~0.8 kg·cm @ 6V
Current: 70-250mA per motor
Shaft: 3mm D-shaft

Includes:
- Wheel coupling adapter
- Hall effect encoder (optional but recommended)
- Mounting bracket

Dimensions: 70mm x 22mm (motor body)
Weight: ~30g per motor

Why TT Motors?
- Perfect size for small robots
- Low cost, widely available
- Sufficient torque for 8cm robot
- Compatible with standard wheels
- Optional encoders for odometry
```

### 3. Motor Driver (L298N or TB6612FNG)

**Option A: L298N (Recommended for beginners)**
```
Channels: 2 (controls 2 motors)
Voltage: 5-35V
Current: 2A per channel (continuous)
Peak current: 3A
Logic voltage: 5V
PWM control: Yes
Protection: Thermal shutdown

Size: 43mm x 43mm
Connectors: Screw terminals (easy)

Pros:
- Very easy to use
- Built-in voltage regulator (5V out)
- Screw terminals (no soldering)
- Cheap ($3-5)

Cons:
- Larger size
- Less efficient (~70% efficiency)
```

**Option B: TB6612FNG (Advanced)**
```
Channels: 2 (controls 2 motors)
Voltage: 4.5-13.5V
Current: 1.2A per channel (continuous)
Peak current: 3.2A
Logic voltage: 3.3V or 5V
PWM control: Yes
Protection: Thermal shutdown, current limiting

Size: 20mm x 20mm
Connectors: Pin headers (may need soldering)

Pros:
- Very compact
- More efficient (~85%)
- Lower power consumption
- Works with 3.3V logic

Cons:
- Requires soldering
- More complex wiring
- Slightly more expensive ($5-8)
```

**Recommendation**: L298N for first build, TB6612FNG for compact/efficient builds

### 4. HC-SR04 Ultrasonic Sensor (Eyes)

```
Type: Ultrasonic distance sensor
Range: 2cm - 400cm (2-4 meters)
Accuracy: ±3mm
Resolution: 0.3cm
Frequency: 40kHz
Voltage: 5V
Current: 15mA
Trigger: 10µs pulse
Echo: PWM output (proportional to distance)

Pins:
- VCC (5V)
- GND
- TRIG (trigger input)
- ECHO (echo output)

Dimensions: 45mm x 20mm x 15mm
Beam angle: ~15 degrees

Why HC-SR04?
- Cheap ($2-3)
- Easy to use (2 wires)
- Reliable
- Good range for indoor robots
- Well-documented

Limitations:
- Soft surfaces (carpet, fabric) may absorb sound
- Very thin objects may not be detected
- Requires clear line of sight
```

**Alternative**: VL53L0X Time-of-Flight sensor (laser-based, more accurate, shorter range)

### 5. QTR-5RC Line Sensor Array

```
Type: Reflectance sensor array
Channels: 5 sensors
Spacing: 8mm between sensors
Total width: 32mm (covers 6cm with robot body)
Technology: IR reflectance (emitter + phototransistor)
Output: RC timing (digital)
Voltage: 3.3V or 5V
Current: 20mA (LEDs on)

Sensors detect:
- Black line on white surface: HIGH reading
- White surface: LOW reading
- Grayscale: Proportional reading

Dimensions: 45mm x 10mm
Weight: 3g

Why QTR-5RC?
- Designed for line following
- Easy to use (no ADC needed with RC mode)
- High quality (Pololu brand)
- Adjustable sensitivity
- Works on various surfaces

Alternatives:
- TCRT5000 (individual sensors, DIY array)
- Infrared line sensors (cheaper, lower quality)
```

### 6. WS2812B RGB LED Strip

```
Type: Addressable RGB LED
Protocol: WS2812B (single-wire control)
LEDs: 12 (or 8, 16)
Voltage: 5V
Current: 60mA per LED (full brightness white)
Colors: 16.7 million (24-bit color)
Refresh rate: 400Hz

Control: Single data line (DI)
Chainable: Yes (daisy-chain)

Dimensions: 10mm x 10mm per LED
Pitch: 16.6mm between LEDs (for 60 LED/m strip)

Why WS2812B?
- Individually controllable
- Bright and visible
- Easy to use (one wire)
- Many colors for status indication
- Cheap and available

Usage ideas:
- Green: Path clear
- Red: Obstacle detected
- Blue: Turning
- Rainbow: Success animation
```

---

## Wiring Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        ESP32-S3                              │
│                                                              │
│  3V3  ─────────────────► VCC (Line Sensors)                │
│  GND  ─────────────────► GND (Common ground)               │
│                                                              │
│  GPIO 16 ──────────────► Motor Driver IN1 (Left Motor +)    │
│  GPIO 17 ──────────────► Motor Driver IN2 (Left Motor -)    │
│  GPIO 18 ──────────────► Motor Driver IN3 (Right Motor +)   │
│  GPIO 19 ──────────────► Motor Driver IN4 (Right Motor -)   │
│                                                              │
│  GPIO 4  ──────────────► HC-SR04 TRIG                       │
│  GPIO 5  ──────────────► HC-SR04 ECHO                       │
│                                                              │
│  GPIO 32 ──────────────► Line Sensor 1                      │
│  GPIO 33 ──────────────► Line Sensor 2                      │
│  GPIO 34 ──────────────► Line Sensor 3                      │
│  GPIO 35 ──────────────► Line Sensor 4                      │
│  GPIO 36 ──────────────► Line Sensor 5                      │
│                                                              │
│  GPIO 2  ──────────────► WS2812B Data In                    │
│                                                              │
│  VIN (5V)  ────────────► HC-SR04 VCC                        │
│  VIN (5V)  ────────────► WS2812B VCC                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                │
                                ↓
                        ┌───────────────┐
                        │ Motor Driver  │
                        │   (L298N)     │
                        ├───────────────┤
                        │ IN1  IN2      │
                        │ IN3  IN4      │
                        │               │
                        │ OUT1 OUT2     │ ──► Left Motor
                        │ OUT3 OUT4     │ ──► Right Motor
                        │               │
                        │ +12V  GND     │ ◄── Battery (3.7V)
                        └───────────────┘

Power Distribution:
┌──────────────┐
│   Battery    │
│ 3.7V 1000mAh │
└──────┬───────┘
       │
       ├──────► Motor Driver VCC (motors)
       │
       └──────► ESP32 VIN (via switch)
                  │
                  ├──► 3V3 regulator ──► 3.3V sensors
                  └──► 5V output ──────► 5V sensors
```

---

## Assembly Order

### Phase 1: Electronics Testing (1-2 hours)

1. **Test ESP32**
   - Connect to computer via USB
   - Upload blink sketch
   - Verify programming works

2. **Test Motors**
   - Connect motor driver to ESP32
   - Connect ONE motor
   - Test forward/reverse/speed control
   - Test second motor
   - Verify both motors work

3. **Test Distance Sensor**
   - Connect HC-SR04
   - Read distance values
   - Verify 0-200cm range

4. **Test Line Sensors**
   - Connect QTR-5RC array
   - Place on white/black surfaces
   - Verify readings change

5. **Test LEDs**
   - Connect WS2812B strip
   - Display different colors
   - Test animations

### Phase 2: Mechanical Assembly (2-3 hours)

1. **Mount Motors**
   - Attach motors to chassis
   - Secure with screws
   - Attach wheels

2. **Mount ESP32**
   - Place on top of chassis
   - Secure with standoffs
   - Ensure USB port is accessible

3. **Mount Motor Driver**
   - Place near motors
   - Secure firmly
   - Keep wires short

4. **Mount Sensors**
   - Distance sensor: Front, facing forward, elevated
   - Line sensors: Bottom, 4mm above floor
   - LED strip: Top or sides, visible

5. **Wire Management**
   - Route wires neatly
   - Secure with zip ties or tape
   - Avoid wheels and moving parts
   - Label connections

### Phase 3: Final Integration (1 hour)

1. **Battery Installation**
   - Mount battery holder
   - Install battery
   - Add power switch
   - Test power on/off

2. **Final Testing**
   - Power from battery (not USB)
   - Test all sensors
   - Test motor movement
   - Test LED indicators
   - Check for loose connections

3. **Calibration**
   - Measure wheel diameter
   - Test straight-line driving
   - Adjust motor speeds for balance
   - Calibrate sensor thresholds

---

## Software Flashing

### Option 1: LLMos Desktop (Recommended)

```bash
# 1. Start LLMos Desktop
npm run electron:dev

# 2. In chat:
"Connect to my ESP32"
"Upload wall-avoiding robot code"

# 3. Select serial port
# 4. LLMos compiles and flashes automatically
# 5. Done!
```

### Option 2: Manual (Advanced)

```bash
# Install esptool
pip install esptool

# Flash firmware
esptool.py --chip esp32s3 --port /dev/ttyUSB0 write_flash 0x1000 firmware.bin

# Monitor serial output
screen /dev/ttyUSB0 115200
```

---

## Calibration Procedures

### Motor Speed Calibration

```c
// Test forward motion
drive(100, 100);  // Both motors at same PWM
delay(1000);
stopMotors();

// Measure: Does robot go straight?
// If veers left: Increase right motor PWM
// If veers right: Increase left motor PWM

// Add calibration offset
#define LEFT_MOTOR_OFFSET 1.05   // 5% faster
#define RIGHT_MOTOR_OFFSET 1.00

void drive(int left, int right) {
    leftPWM = left * LEFT_MOTOR_OFFSET;
    rightPWM = right * RIGHT_MOTOR_OFFSET;
}
```

### Distance Sensor Calibration

```c
// Measure known distances
// Compare sensor reading to actual distance

// Example calibration:
float calibratedDistance(int raw) {
    // Adjust for sensor offset and scaling
    return (raw * 1.02) - 3;  // Example: 2% scale, -3cm offset
}
```

### Line Sensor Calibration

```c
// 1. Place robot on WHITE surface
int whiteReadings[5];
for (int i = 0; i < 5; i++) {
    whiteReadings[i] = readLineSensor(i);
}

// 2. Place robot on BLACK line
int blackReadings[5];
for (int i = 0; i < 5; i++) {
    blackReadings[i] = readLineSensor(i);
}

// 3. Calculate threshold
int threshold[5];
for (int i = 0; i < 5; i++) {
    threshold[i] = (whiteReadings[i] + blackReadings[i]) / 2;
}
```

---

## Troubleshooting

### Robot Won't Move

- **Check battery voltage**: Should be > 3.3V
- **Check motor connections**: Swap wires if reversed
- **Check PWM signals**: Use multimeter or oscilloscope
- **Check motor driver**: Test with separate power supply
- **Check code**: Ensure drive() function is called

### Sensors Not Working

- **Distance sensor returns 255**: Check wiring, VCC should be 5V
- **Line sensors always 0**: Check power, calibrate thresholds
- **Inconsistent readings**: Add decoupling capacitors, check grounds

### ESP32 Won't Program

- **Driver issues**: Install CH340 or CP2102 drivers
- **Wrong port**: Check device manager / ls /dev/tty*
- **Boot mode**: Hold BOOT button while connecting USB
- **Cable issue**: Use data cable, not charge-only cable

### Robot Veers to One Side

- **Motor imbalance**: Calibrate motor speeds (see above)
- **Wheel slip**: Check wheel attachment, tighten screws
- **Weight distribution**: Balance battery and components
- **Floor surface**: Test on smooth, flat surface

---

## Maintenance

### Regular Checks (Every 10 hours of use)

- ✓ Tighten screws and connections
- ✓ Check battery voltage (recharge if < 3.5V)
- ✓ Clean sensors (dust affects readings)
- ✓ Check wheels for wear
- ✓ Inspect wires for damage

### Battery Care

- **Charge**: Before voltage drops below 3.0V
- **Storage**: Store at 3.7-3.8V (50-60% charge)
- **Never**: Over-discharge below 2.5V (damages battery)
- **Lifespan**: ~300-500 charge cycles

---

## Upgrade Paths

### Performance Upgrades

- **Faster motors**: 300-400 RPM motors (requires gear ratio adjustment)
- **Bigger battery**: 2000mAh for longer runtime
- **Better wheels**: Rubber wheels for better traction
- **Metal chassis**: More durable, better stability

### Sensor Upgrades

- **Camera module**: ESP32-CAM for vision
- **Lidar sensor**: 360-degree scanning (expensive)
- **Color sensor**: Detect colored objects
- **Touch sensors**: Tactile feedback

### Advanced Features

- **GPS module**: Outdoor navigation
- **Servo arm**: Pick and place objects
- **Speaker**: Voice feedback
- **Display**: OLED screen for status

---

## Comparison: Simulation vs Real

| Feature | Simulation | Real Robot |
|---------|------------|------------|
| Body size | 8cm cube | 8cm cube ✓ |
| Wheel diameter | 65mm | 65mm ✓ |
| Wheelbase | 70mm | 70mm ✓ |
| Max speed | 0.3 m/s | ~0.3 m/s ✓ |
| Distance sensors | 8 directions | 1 (front) ⚠️ |
| Line sensors | 5 sensors | 5 sensors ✓ |
| Battery | 1000mAh | 1000mAh ✓ |
| Weight | 250g | ~250g ✓ |

**Note**: ⚠️ = Real robot has fewer distance sensors by default (1 instead of 8). Can add more sensors to match simulation.

---

## Next Steps

1. **Order Parts**: Use BOM above (~$80 total)
2. **Follow Assembly Guide**: See [ASSEMBLY_GUIDE.md](ASSEMBLY_GUIDE.md)
3. **Test Components**: Verify each part works before final assembly
4. **Build Physical Arena**: See [ARENA_SETUP_GUIDE.md](../ARENA_SETUP_GUIDE.md)
5. **Run Challenges**: Try standard 5m x 5m challenges

---

## Community Builds

Share your build!
- Post photos to GitHub Discussions
- Document modifications
- Help other builders
- Submit improvements to this spec

**Tag**: `#LLMosStandardRobotV1`

---

**Version**: 1.0
**Last Updated**: January 18, 2026
**License**: CC BY-SA 4.0
