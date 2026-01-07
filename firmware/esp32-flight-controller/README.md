# ESP32-S3 Flight Controller Firmware

This firmware implements the LLMos JSON protocol for Hardware-in-the-Loop (HIL) simulation, enabling real ESP32-S3 hardware to communicate with the LLMos Flight Simulator applet.

## Hardware Requirements

### Minimum
- ESP32-S3 DevKit or compatible board
- USB-C cable for programming and communication

### Optional (for full functionality)
- MPU6050 or ICM20948 IMU (I2C)
- BMP280 or BME280 barometer (I2C)
- 4x ESCs and brushless motors
- Battery and power distribution

## Pin Configuration

| Function | GPIO | Notes |
|----------|------|-------|
| Motor 1 (FL) | 12 | PWM 50Hz |
| Motor 2 (FR) | 13 | PWM 50Hz |
| Motor 3 (BL) | 14 | PWM 50Hz |
| Motor 4 (BR) | 15 | PWM 50Hz |
| I2C SDA | 21 | Sensors |
| I2C SCL | 22 | Sensors |
| Status LED | 2 | Built-in LED |

## Building & Uploading

### Using Arduino IDE

1. Install Arduino IDE 2.x
2. Add ESP32 board support:
   - Go to File → Preferences
   - Add to "Additional Board Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to Tools → Board → Boards Manager
   - Search "esp32" and install "esp32 by Espressif Systems"

3. Install required libraries:
   - ArduinoJson (by Benoit Blanchon)
   - Wire (built-in)

4. Select board and port:
   - Tools → Board → ESP32S3 Dev Module
   - Tools → USB CDC On Boot → Enabled
   - Tools → Port → (your COM port)

5. Upload the sketch

### Using PlatformIO

```ini
; platformio.ini
[env:esp32-s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
lib_deps =
    bblanchon/ArduinoJson@^6.21.0
build_flags =
    -DARDUINO_USB_CDC_ON_BOOT=1
```

## Protocol

Communication uses newline-delimited JSON over USB CDC at 115200 baud.

### Commands

```json
// Get device info
{"action":"get_info"}

// Arm/Disarm (required before motor control)
{"action":"arm"}
{"action":"disarm"}

// Set all 4 motors (0-255)
{"action":"set_motors","motors":[128,128,128,128]}

// Get motor states
{"action":"get_motors"}

// Read IMU
{"action":"read_imu"}

// Read barometer
{"action":"read_barometer"}

// Read all sensors
{"action":"read_sensors"}

// GPIO control
{"action":"set_gpio","pin":4,"state":1}
{"action":"read_gpio","pin":4}

// ADC reading
{"action":"read_adc","pin":1}

// PWM control
{"action":"set_pwm","pin":12,"duty_cycle":128,"frequency":1000}

// Set altitude (for HIL simulation)
{"action":"set_altitude","altitude":5.0}
```

### Responses

```json
// Success
{"status":"ok","msg":"Motors set","motors":[...]}

// Error
{"status":"error","msg":"Flight controller not armed"}
```

## Integration with LLMos

### Virtual Device (No Hardware)

The Flight Simulator applet can use the virtual ESP32 for testing:

```typescript
import { SerialManager } from '@/lib/hardware/serial-manager';

// Connect to virtual device
const deviceId = await SerialManager.connectVirtual('ESP32-S3-FlightController');

// Send commands
await SerialManager.sendCommand(deviceId, {
  action: 'arm'
});

await SerialManager.sendCommand(deviceId, {
  action: 'set_motors',
  motors: [128, 128, 128, 128]
});
```

### Physical Device

```typescript
// Connect to physical device (browser picker)
const deviceId = await SerialManager.connect();

// Same API works for physical devices
await SerialManager.sendCommand(deviceId, {
  action: 'read_sensors'
});
```

## Adding Real Sensors

### MPU6050 IMU

```cpp
#include <Adafruit_MPU6050.h>

Adafruit_MPU6050 mpu;

void initSensors() {
  if (!mpu.begin()) {
    Serial.println("{\"status\":\"error\",\"msg\":\"MPU6050 not found\"}");
    return;
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
}

void readIMUSensor() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  imuAccel[0] = a.acceleration.x;
  imuAccel[1] = a.acceleration.y;
  imuAccel[2] = a.acceleration.z;

  imuGyro[0] = g.gyro.x;
  imuGyro[1] = g.gyro.y;
  imuGyro[2] = g.gyro.z;
}
```

### BMP280 Barometer

```cpp
#include <Adafruit_BMP280.h>

Adafruit_BMP280 bmp;

void initSensors() {
  if (!bmp.begin()) {
    Serial.println("{\"status\":\"error\",\"msg\":\"BMP280 not found\"}");
    return;
  }
}

void readBaroSensor() {
  baroTemperature = bmp.readTemperature();
  baroPressure = bmp.readPressure() / 100.0; // Convert to hPa
  baroAltitude = bmp.readAltitude(1013.25);   // Sea level pressure
}
```

## Safety Notes

⚠️ **WARNING**: This firmware controls real motors which can cause injury.

1. **Always remove propellers** during development and testing
2. **Use a secure test stand** when testing with propellers
3. **Never arm the system** near people or objects
4. **Implement a kill switch** for emergency disarm
5. **Use appropriate battery safety** measures
6. **Follow local regulations** for drone operation

## License

MIT License - Part of the LLMos project
