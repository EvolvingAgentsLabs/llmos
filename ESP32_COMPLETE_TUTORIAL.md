# ESP32 Hardware Integration - Complete Tutorial

**Branch:** real-world-alpha-v01
**Date:** 2026-01-02
**Audience:** Developers and End Users

---

## Table of Contents

1. [Quick Start (Virtual Device)](#quick-start-virtual-device)
2. [Physical ESP32 Setup](#physical-esp32-setup)
3. [Firmware Development](#firmware-development)
4. [Browser-Based WASM Compilation](#browser-based-wasm-compilation)
5. [LLMos Usage Examples](#llmos-usage-examples)
6. [Building Custom Applets](#building-custom-applets)
7. [Advanced Examples](#advanced-examples)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start (Virtual Device)

**No hardware needed! Test immediately with virtual device.**

### 1. Start LLMos

```bash
cd llmos-lite/ui
npm install
npm run dev
```

Open http://localhost:3000

### 2. Connect Virtual Device

In the LLMos chat interface, type:

```
Connect to a virtual ESP32 device
```

**What happens:**
- SystemAgent uses `connect-device` tool with `useVirtual: true`
- Virtual ESP32 instance created instantly
- Returns deviceId: `virtual-1234567-abc123`

**Expected response:**
```
✓ Connected to virtual device virtual-1704134567-a3f2c1
  Device: ESP32-S3-Virtual
  Firmware: 1.0.0-virtual
```

### 3. Basic Commands

**Turn on LED:**
```
Turn on pin 2
```

**Read sensor:**
```
Read the voltage on ADC pin 1
```

**Get device info:**
```
Show me the device information
```

**Monitor continuously:**
```
Create a monitoring project and poll the device every 2 seconds
```

### 4. View State Files

After creating a monitoring project, check the VFS:

```
Show me the files in the monitoring project
```

You'll see:
```
projects/device-monitor/
├── device.config.json
├── state/
│   ├── connection.json    # {"connected":true,"deviceId":"..."}
│   ├── sensors.json        # Updated every 2s
│   └── gpio.json
├── cron/
│   └── poll-device.json
└── output/
    └── telemetry/
        └── 2026-01-02.log
```

---

## Physical ESP32 Setup

### Hardware Requirements

**Supported Boards:**
- ESP32-S3-DevKitC (recommended)
- ESP32-DevKitC
- Any ESP32/ESP32-S3 with USB CDC support

**Additional Components (Optional):**
- LED + 220Ω resistor (for GPIO testing)
- INA219 power monitor (for I2C testing)
- Potentiometer (for ADC testing)

### Wiring Diagram

**Basic Setup (GPIO + ADC):**

```
ESP32-S3               Components
=========              ===========

GPIO 2  ────────────── LED + ──┐
                                │
                       220Ω     │
                                │
GND     ───────────────────────┘

GPIO 4  ────────────── LED + ──┐
                                │
                       220Ω     │
                                │
GND     ───────────────────────┘

ADC1 (GPIO 1) ────┬──── Potentiometer (middle pin)
                  │
3.3V  ────────────┴──── Potentiometer (one end)
GND   ────────────────  Potentiometer (other end)
```

**Advanced Setup (I2C Power Monitor):**

```
ESP32-S3               INA219
=========              =======

GPIO 21 (SDA) ──────── SDA
GPIO 22 (SCL) ──────── SCL
3.3V    ──────────────  VCC
GND     ──────────────  GND

                       V+  ────── Power Supply +
                       V-  ────── Load +
                       GND ────── Load - & Power Supply -
```

---

## Firmware Development

### Arduino IDE Setup

**1. Install ESP32 Board Support:**

Open Arduino IDE → File → Preferences → Additional Board Manager URLs:
```
https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

Tools → Board → Boards Manager → Search "ESP32" → Install "ESP32 by Espressif Systems"

**2. Install Required Libraries:**

Sketch → Include Library → Manage Libraries:
- Search "ArduinoJson" → Install (by Benoit Blanchon)

**3. Board Configuration:**

- **Board:** ESP32S3 Dev Module (or your specific board)
- **USB CDC On Boot:** Enabled (important!)
- **USB Mode:** Hardware CDC and JTAG
- **Upload Speed:** 921600
- **Port:** Select your ESP32's COM port

### Complete Firmware Code

**File:** `esp32_llmos_firmware.ino`

```cpp
/**
 * LLMos ESP32 Firmware - JSON Protocol Implementation
 *
 * Supports: GPIO, ADC, I2C (INA219), PWM, System Info
 * Protocol: Newline-delimited JSON over USB Serial
 * Baud Rate: 115200
 */

#include <Arduino.h>
#include <ArduinoJson.h>

// I2C Configuration (if using INA219)
#include <Wire.h>
#define I2C_SDA 21
#define I2C_SCL 22

// INA219 Registers (if using power monitor)
#define INA219_ADDR 0x40
#define INA219_REG_BUSVOLTAGE 0x02
#define INA219_REG_CURRENT 0x04

// JSON buffer size
JsonDocument doc;

void setup() {
  // Initialize USB Serial
  Serial.begin(115200);
  while (!Serial) {
    delay(10); // Wait for serial port to connect
  }

  // Initialize common GPIO pins
  pinMode(2, OUTPUT);  // LED 1
  pinMode(4, OUTPUT);  // LED 2

  // Initialize I2C (if using INA219)
  Wire.begin(I2C_SDA, I2C_SCL);

  // Send ready message
  Serial.println("{\"status\":\"ok\",\"msg\":\"ESP32-S3 ready\",\"device\":\"ESP32-S3\",\"firmware\":\"1.0.0\"}");
}

void loop() {
  // Check for incoming commands
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() == 0) return;

    // Parse JSON command
    DeserializationError error = deserializeJson(doc, input);

    if (error) {
      sendError("JSON parse error");
      return;
    }

    // Get action
    String action = doc["action"].as<String>();

    // Route to appropriate handler
    if (action == "get_info") {
      handleGetInfo();
    }
    else if (action == "set_gpio") {
      handleSetGPIO();
    }
    else if (action == "read_gpio") {
      handleReadGPIO();
    }
    else if (action == "read_adc") {
      handleReadADC();
    }
    else if (action == "read_i2c") {
      handleReadI2C();
    }
    else if (action == "set_pwm") {
      handleSetPWM();
    }
    else if (action == "read_sensors") {
      handleReadSensors();
    }
    else {
      sendError("Unknown action: " + action);
    }
  }
}

/**
 * Get device information
 * Command: {"action":"get_info"}
 * Response: {"status":"ok","device":"ESP32-S3","firmware":"1.0.0","uptime_ms":12345,...}
 */
void handleGetInfo() {
  JsonDocument response;

  response["status"] = "ok";
  response["device"] = "ESP32-S3";
  response["firmware"] = "1.0.0";
  response["uptime_ms"] = millis();
  response["uptime_s"] = millis() / 1000;
  response["chip"] = "ESP32-S3";
  response["cpu_freq_mhz"] = ESP.getCpuFreqMHz();
  response["flash_size_mb"] = ESP.getFlashChipSize() / (1024 * 1024);
  response["free_heap_kb"] = ESP.getFreeHeap() / 1024;
  response["virtual"] = false;

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * Set GPIO pin state
 * Command: {"action":"set_gpio","pin":2,"state":1}
 * Response: {"status":"ok","msg":"GPIO set","pin":2,"state":1}
 */
void handleSetGPIO() {
  int pin = doc["pin"];
  int state = doc["state"];

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  if (state != 0 && state != 1) {
    sendError("State must be 0 or 1");
    return;
  }

  pinMode(pin, OUTPUT);
  digitalWrite(pin, state);

  JsonDocument response;
  response["status"] = "ok";
  response["msg"] = "GPIO set";
  response["pin"] = pin;
  response["state"] = state;

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * Read GPIO pin state
 * Command: {"action":"read_gpio","pin":2}
 * Response: {"status":"ok","pin":2,"state":1,"mode":"OUTPUT"}
 */
void handleReadGPIO() {
  int pin = doc["pin"];

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  int state = digitalRead(pin);

  JsonDocument response;
  response["status"] = "ok";
  response["pin"] = pin;
  response["state"] = state;

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * Read ADC value
 * Command: {"action":"read_adc","pin":1}
 * Response: {"status":"ok","pin":1,"value":2048,"voltage":1.65}
 */
void handleReadADC() {
  int pin = doc["pin"];

  if (pin < 0 || pin > 20) {
    sendError("Invalid ADC pin (0-20)");
    return;
  }

  int value = analogRead(pin);
  float voltage = value * (3.3 / 4095.0);

  JsonDocument response;
  response["status"] = "ok";
  response["pin"] = pin;
  response["value"] = value;
  response["voltage"] = round(voltage * 1000) / 1000.0; // Round to 3 decimals

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * Read I2C sensor (INA219 power monitor)
 * Command: {"action":"read_i2c","sensor":"ina219"}
 * Response: {"status":"ok","sensor":"ina219","data":{"voltage_v":5.02,"current_ma":123.5,"power_mw":620.0}}
 */
void handleReadI2C() {
  String sensor = doc["sensor"].as<String>();

  if (sensor == "ina219") {
    float voltage = readINA219Voltage();
    float current = readINA219Current();
    float power = voltage * current;

    JsonDocument response;
    response["status"] = "ok";
    response["sensor"] = "ina219";

    JsonObject data = response["data"].to<JsonObject>();
    data["voltage_v"] = round(voltage * 100) / 100.0;
    data["current_ma"] = round(current * 10) / 10.0;
    data["power_mw"] = round(power * 10) / 10.0;

    serializeJson(response, Serial);
    Serial.println();
  }
  else {
    sendError("Unknown sensor: " + sensor + ". Available: ina219");
  }
}

/**
 * Set PWM output
 * Command: {"action":"set_pwm","pin":5,"duty_cycle":128,"frequency":5000}
 * Response: {"status":"ok","msg":"PWM set","pin":5,"duty_cycle":128,"frequency":5000}
 */
void handleSetPWM() {
  int pin = doc["pin"];
  int dutyCycle = doc["duty_cycle"];
  int frequency = doc["frequency"] | 5000; // Default 5kHz

  if (pin < 0 || pin > 47) {
    sendError("Invalid pin number (0-47)");
    return;
  }

  if (dutyCycle < 0 || dutyCycle > 255) {
    sendError("Duty cycle must be 0-255");
    return;
  }

  // Setup PWM (using ledc on ESP32)
  ledcAttach(pin, frequency, 8); // 8-bit resolution
  ledcWrite(pin, dutyCycle);

  JsonDocument response;
  response["status"] = "ok";
  response["msg"] = "PWM set";
  response["pin"] = pin;
  response["duty_cycle"] = dutyCycle;
  response["frequency"] = frequency;

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * Read all sensors at once
 * Command: {"action":"read_sensors"}
 * Response: {"status":"ok","sensors":{...}}
 */
void handleReadSensors() {
  JsonDocument response;
  response["status"] = "ok";

  JsonObject sensors = response["sensors"].to<JsonObject>();

  // INA219 data
  float voltage = readINA219Voltage();
  float current = readINA219Current();

  JsonObject ina219 = sensors["ina219"].to<JsonObject>();
  ina219["voltage_v"] = round(voltage * 100) / 100.0;
  ina219["current_ma"] = round(current * 10) / 10.0;
  ina219["power_mw"] = round(voltage * current * 10) / 10.0;

  // System info
  JsonObject system = sensors["system"].to<JsonObject>();
  system["uptime_s"] = millis() / 1000;
  system["free_heap_kb"] = ESP.getFreeHeap() / 1024;
  system["cpu_temp_c"] = temperatureRead(); // ESP32-S3 internal temp sensor

  serializeJson(response, Serial);
  Serial.println();
}

/**
 * INA219 Helper Functions
 */
float readINA219Voltage() {
  Wire.beginTransmission(INA219_ADDR);
  Wire.write(INA219_REG_BUSVOLTAGE);
  Wire.endTransmission();

  Wire.requestFrom(INA219_ADDR, 2);
  if (Wire.available() == 2) {
    int16_t value = (Wire.read() << 8) | Wire.read();
    return ((value >> 3) * 4) / 1000.0; // Convert to volts
  }
  return 0.0;
}

float readINA219Current() {
  Wire.beginTransmission(INA219_ADDR);
  Wire.write(INA219_REG_CURRENT);
  Wire.endTransmission();

  Wire.requestFrom(INA219_ADDR, 2);
  if (Wire.available() == 2) {
    int16_t value = (Wire.read() << 8) | Wire.read();
    return value * 0.1; // Current in mA (depends on calibration)
  }
  return 0.0;
}

/**
 * Send error response
 */
void sendError(String message) {
  JsonDocument response;
  response["status"] = "error";
  response["msg"] = message;

  serializeJson(response, Serial);
  Serial.println();
}
```

### Upload Firmware

1. Connect ESP32 via USB
2. Select correct COM port in Tools → Port
3. Click Upload button
4. Wait for "Done uploading" message

### Test Firmware (Serial Monitor)

Open Tools → Serial Monitor (115200 baud):

**Input:**
```json
{"action":"get_info"}
```

**Expected Output:**
```json
{"status":"ok","device":"ESP32-S3","firmware":"1.0.0","uptime_ms":5234,...}
```

**Test GPIO:**
```json
{"action":"set_gpio","pin":2,"state":1}
```

LED on GPIO 2 should turn on!

---

## Browser-Based WASM Compilation

**LLMos compiles C code to WebAssembly entirely in your browser** - no backend server or Docker required!

### Overview

```
User writes C code
     ↓
Browser loads Clang (WASM) from CDN
     ↓
Compile C → WASM (in browser)
     ↓
Deploy to ESP32 via Web Serial
```

**Key Benefits:**
- ✅ Zero backend infrastructure
- ✅ Works on Vercel/Netlify/any platform
- ✅ Privacy-first (code never leaves browser)
- ✅ No Docker or build servers needed
- ✅ Aligns with "OS in the Browser" philosophy

### How It Works

**1. Wasmer SDK loads Clang in browser:**
```typescript
import { WasmCompiler } from '@/lib/runtime/wasm-compiler';

const compiler = WasmCompiler.getInstance();
await compiler.initialize(); // Loads Clang from CDN
```

**2. Compile C code client-side:**
```typescript
const result = await compiler.compile({
  source: `
    #include "wm_ext_wasm_native.h"

    int main() {
      gpio_set_direction(2, GPIO_MODE_OUTPUT);
      gpio_set_level(2, 1);
      return 0;
    }
  `,
  name: 'led_blink',
  optimizationLevel: '3'
});

// result.wasmBinary contains compiled WebAssembly
```

**3. Deploy to ESP32:**
```typescript
await deployWasmToESP32({
  deviceId: 'device-1234',
  wasmBinary: result.wasmBinary
});
```

### Performance

**First Compilation:**
- Initial load: ~30MB download (Clang + LLVM toolchain)
- Downloaded from: unpkg.com CDN
- Cached in browser: Instant on next use
- Compile time: 2-5 seconds

**Subsequent Compilations:**
- Load time: Instant (cached)
- Compile time: 1-3 seconds

### ESP32 SDK Headers

**Available headers** (loaded automatically):
- `wm_ext_wasm_native.h` - GPIO, WiFi, HTTP APIs
- `wm_ext_wasm_native_mqtt.h` - MQTT client
- `wm_ext_wasm_native_rainmaker.h` - ESP RainMaker cloud

**Example C code:**
```c
#include "wm_ext_wasm_native.h"

int main() {
    // GPIO control
    gpio_set_direction(2, GPIO_MODE_OUTPUT);
    gpio_set_level(2, 1);

    // WiFi connection
    wifi_connect("MySSID", "password");

    // HTTP request
    char response[1024];
    http_get("https://api.example.com/data", response, sizeof(response));

    return 0;
}
```

### Using the `deploy-wasm-app` Tool

**Natural language deployment:**
```
You: "Write a C program that blinks the LED on GPIO pin 2 and deploy it to my ESP32"

SystemAgent:
1. Generates C code
2. Compiles to WASM in browser
3. Deploys via Web Serial API
4. Confirms deployment success
```

**Behind the scenes:**
```typescript
// SystemAgent uses deploy-wasm-app tool:
await executeSystemTool('deploy-wasm-app', {
  sourceCode: cCode,
  appName: 'led_blink',
  optimizationLevel: '3',
  deviceId: 'device-1234'
});

// Tool internally:
// 1. Compiles in browser using WasmCompiler
// 2. Sends binary to ESP32 via TCP (0x12 0x34 leading bytes)
// 3. ESP32 WAMR runtime executes the app
```

### Compilation Options

```typescript
interface CompileOptions {
  source: string;           // C source code
  name: string;             // App name (e.g., 'led_blink')
  optimizationLevel?: string; // '0', '1', '2', '3', 's', 'z' (default: '3')
  includeDebugInfo?: boolean; // Include DWARF debug symbols (default: false)
}
```

**Optimization levels:**
- `'0'` - No optimization, fastest compilation
- `'3'` - Maximum optimization (default)
- `'s'` - Optimize for size
- `'z'` - Aggressively optimize for size

### Troubleshooting Compilation

**Error: "Failed to load Wasmer SDK"**
- **Cause**: Network error or CDN unavailable
- **Solution**: Check internet connection, retry

**Error: "Compilation failed with syntax error"**
- **Cause**: Invalid C syntax
- **Solution**: Check error details:
  - Missing semicolons
  - Undefined functions
  - Type mismatches
  - Missing header includes

**Error: "Out of memory"**
- **Cause**: Browser tab memory limit exceeded
- **Solution**: Close other tabs, restart browser

### Comparison: Browser vs. Server Compilation

| Feature | Browser-Based ✅ | Server-Based ❌ |
|---------|------------------|-----------------|
| **Privacy** | High (code stays local) | Low (code sent to server) |
| **Cost** | Zero (uses user's CPU) | High (Vercel/AWS costs) |
| **Setup** | None (just npm install) | Docker, wasi-sdk, backend |
| **Vercel Deploy** | Works perfectly | Fails (no Docker) |
| **Philosophy** | "OS in Browser" ✅ | Breaks philosophy ❌ |
| **Initial Load** | 30MB (~10s on 3G) | Zero |
| **Compile Speed** | 2-5 seconds | 1-2 seconds |

**For more details:** See `llmos-lite/docs/BROWSER_COMPILATION.md`

---

## LLMos Usage Examples

### Example 1: Simple GPIO Control

**User:** "Connect to my ESP32 and turn on the LED on pin 2"

**SystemAgent workflow:**
1. Uses `connect-device` tool (opens browser picker)
2. User selects ESP32 from list
3. Returns deviceId: `device-1704134567-x9k2m`
4. Uses `send-device-command`:
   ```json
   {
     "deviceId": "device-1704134567-x9k2m",
     "command": {"action": "set_gpio", "pin": 2, "state": 1}
   }
   ```
5. Responds: "LED on pin 2 is now ON"

### Example 2: ADC Monitoring

**User:** "Read the voltage on ADC pin 1 every second for 10 seconds"

**SystemAgent workflow:**
1. Connects to device (if not connected)
2. Creates monitoring project:
   ```javascript
   createDeviceProject({
     projectName: "adc-monitor",
     deviceId: "device-...",
     pollInterval: 1000,
     commands: [{"action": "read_adc", "pin": 1}]
   })
   ```
3. Cron updates `state/sensors.json` every 1s:
   ```json
   {
     "read_adc": {
       "status": "ok",
       "pin": 1,
       "value": 2048,
       "voltage": 1.650
     },
     "timestamp": "2026-01-02T10:30:45.123Z"
   }
   ```
4. After 10 seconds, reads state file and reports values

### Example 3: Power Monitoring Dashboard

**User:** "Monitor power consumption from the INA219 sensor and create a dashboard"

**SystemAgent workflow:**
1. Connects to device
2. Creates device project with I2C polling:
   ```javascript
   createDeviceProject({
     projectName: "power-monitor",
     deviceId: "device-...",
     pollInterval: 500,
     commands: [{"action": "read_i2c", "sensor": "ina219"}]
   })
   ```
3. Generates applet for visualization (see next section)
4. Applet reads from `projects/power-monitor/state/sensors.json`
5. Displays real-time graphs

### Example 4: Automated Testing

**User:** "Test all GPIO pins from 0 to 10, turn each on for 1 second"

**SystemAgent workflow:**
1. Connects to device
2. Loops through pins 0-10:
   ```javascript
   for (let pin = 0; pin <= 10; pin++) {
     await sendCommand({action: "set_gpio", pin, state: 1});
     await sleep(1000);
     await sendCommand({action: "set_gpio", pin, state: 0});
   }
   ```
3. Reports results for each pin

---

## Building Custom Applets

### Applet 1: Virtual Device Simulator UI

**Purpose:** Visual representation of virtual device state (like Wokwi)

**User prompt:** "Create an applet that shows a virtual ESP32 board with LEDs that respond to GPIO commands"

**Generated Applet Code:**

```javascript
function Applet() {
  const [gpioState, setGpioState] = useState({});
  const [deviceId, setDeviceId] = useState(null);
  const [connected, setConnected] = useState(false);

  // Connect to virtual device
  async function connectVirtual() {
    try {
      const result = await window.__executeSystemTool('connect-device', {
        useVirtual: true,
        deviceName: 'Applet-Simulator'
      });
      setDeviceId(result.deviceId);
      setConnected(true);
      pollDeviceState(result.deviceId);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }

  // Poll device state every 500ms
  function pollDeviceState(devId) {
    const interval = setInterval(async () => {
      try {
        // Read GPIO pins 0-10
        const newState = {};
        for (let pin = 0; pin <= 10; pin++) {
          const result = await window.__executeSystemTool('send-device-command', {
            deviceId: devId,
            command: { action: 'read_gpio', pin }
          });
          if (result.success) {
            newState[pin] = result.response.state;
          }
        }
        setGpioState(newState);
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 500);

    return () => clearInterval(interval);
  }

  // Toggle GPIO pin
  async function togglePin(pin) {
    if (!deviceId) return;

    const currentState = gpioState[pin] || 0;
    const newState = currentState === 1 ? 0 : 1;

    try {
      await window.__executeSystemTool('send-device-command', {
        deviceId,
        command: { action: 'set_gpio', pin, state: newState }
      });
    } catch (error) {
      console.error('Toggle error:', error);
    }
  }

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">ESP32 Virtual Board</h1>

      {!connected ? (
        <button
          onClick={connectVirtual}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          Connect Virtual Device
        </button>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-400">Device ID: {deviceId}</p>
            <p className="text-sm text-green-400">● Connected</p>
          </div>

          {/* ESP32 Board Visualization */}
          <div className="bg-gray-800 p-8 rounded-lg inline-block">
            <div className="text-center mb-4">
              <div className="text-lg font-bold">ESP32-S3</div>
              <div className="text-xs text-gray-400">Virtual Device</div>
            </div>

            {/* GPIO Pins */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left side pins */}
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map(pin => (
                  <div key={pin} className="flex items-center gap-3">
                    <div className="text-sm w-16 text-right">GPIO {pin}</div>
                    <button
                      onClick={() => togglePin(pin)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        gpioState[pin] === 1
                          ? 'bg-green-500 shadow-lg shadow-green-500/50'
                          : 'bg-gray-600'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* Right side pins */}
              <div className="space-y-3">
                {[5, 6, 7, 8, 9, 10].map(pin => (
                  <div key={pin} className="flex items-center gap-3">
                    <button
                      onClick={() => togglePin(pin)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        gpioState[pin] === 1
                          ? 'bg-green-500 shadow-lg shadow-green-500/50'
                          : 'bg-gray-600'
                      }`}
                    />
                    <div className="text-sm w-16">GPIO {pin}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Control Panel */}
          <div className="mt-6 p-4 bg-gray-800 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Quick Controls</h2>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  [0, 2, 4, 6, 8, 10].forEach(pin => togglePin(pin));
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
              >
                Even Pins ON
              </button>
              <button
                onClick={() => {
                  [1, 3, 5, 7, 9].forEach(pin => togglePin(pin));
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Odd Pins ON
              </button>
              <button
                onClick={() => {
                  for (let pin = 0; pin <= 10; pin++) {
                    window.__executeSystemTool('send-device-command', {
                      deviceId,
                      command: { action: 'set_gpio', pin, state: 0 }
                    });
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
              >
                All OFF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Usage:**
```
User: "Create an applet that shows a virtual ESP32 board with LEDs"
SystemAgent: [Generates above applet]
User: [Clicks "Connect Virtual Device" button]
User: [Clicks LED circles to toggle GPIO pins]
```

### Applet 2: Power Monitor Dashboard

**Purpose:** Real-time power consumption monitoring with graphs

**User prompt:** "Create a power monitoring dashboard that shows voltage, current, and power from the INA219 sensor"

**Generated Applet Code:**

```javascript
function Applet() {
  const [deviceId, setDeviceId] = useState(null);
  const [sensorData, setSensorData] = useState([]);
  const [currentReading, setCurrentReading] = useState(null);
  const [monitoring, setMonitoring] = useState(false);

  async function startMonitoring() {
    try {
      // Connect to device (virtual or physical)
      const connectResult = await window.__executeSystemTool('connect-device', {
        useVirtual: true // Change to false for physical device
      });
      setDeviceId(connectResult.deviceId);

      // Create device project with polling
      await window.__executeSystemTool('create-device-project', {
        projectName: 'power-monitor-applet',
        deviceId: connectResult.deviceId,
        pollInterval: 1000,
        commands: [{ action: 'read_i2c', sensor: 'ina219' }]
      });

      setMonitoring(true);
      startPolling();
    } catch (error) {
      console.error('Setup failed:', error);
    }
  }

  function startPolling() {
    const interval = setInterval(async () => {
      try {
        // Read state file
        const fileResult = await window.__executeSystemTool('read-file', {
          path: 'projects/power-monitor-applet/state/sensors.json'
        });

        if (fileResult.success) {
          const data = JSON.parse(fileResult.content);
          if (data.read_i2c && data.read_i2c.data) {
            const reading = {
              timestamp: Date.now(),
              ...data.read_i2c.data
            };
            setCurrentReading(reading);
            setSensorData(prev => [...prev.slice(-59), reading]); // Keep last 60 samples
          }
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }

  function getSparkline(data, key) {
    if (data.length < 2) return '';

    const values = data.map(d => d[key] || 0);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    }).join(' ');

    return points;
  }

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Power Monitor Dashboard</h1>

      {!monitoring ? (
        <button
          onClick={startMonitoring}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
        >
          Start Monitoring
        </button>
      ) : (
        <div className="space-y-6">
          {/* Current Readings */}
          {currentReading && (
            <div className="grid grid-cols-3 gap-4">
              {/* Voltage */}
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">Voltage</div>
                <div className="text-4xl font-bold text-yellow-400">
                  {currentReading.voltage_v.toFixed(2)}
                  <span className="text-xl ml-2">V</span>
                </div>
                <svg className="w-full h-16 mt-4" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    points={getSparkline(sensorData, 'voltage_v')}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              {/* Current */}
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">Current</div>
                <div className="text-4xl font-bold text-blue-400">
                  {currentReading.current_ma.toFixed(1)}
                  <span className="text-xl ml-2">mA</span>
                </div>
                <svg className="w-full h-16 mt-4" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    points={getSparkline(sensorData, 'current_ma')}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              {/* Power */}
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">Power</div>
                <div className="text-4xl font-bold text-green-400">
                  {currentReading.power_mw.toFixed(1)}
                  <span className="text-xl ml-2">mW</span>
                </div>
                <svg className="w-full h-16 mt-4" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline
                    points={getSparkline(sensorData, 'power_mw')}
                    fill="none"
                    stroke="#4ade80"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Statistics */}
          {sensorData.length > 0 && (
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Statistics (Last 60s)</h2>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-400">Avg Voltage</div>
                  <div className="text-xl font-semibold">
                    {(sensorData.reduce((sum, d) => sum + d.voltage_v, 0) / sensorData.length).toFixed(2)} V
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg Current</div>
                  <div className="text-xl font-semibold">
                    {(sensorData.reduce((sum, d) => sum + d.current_ma, 0) / sensorData.length).toFixed(1)} mA
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg Power</div>
                  <div className="text-xl font-semibold">
                    {(sensorData.reduce((sum, d) => sum + d.power_mw, 0) / sensorData.length).toFixed(1)} mW
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Device Info */}
          <div className="bg-gray-800 p-4 rounded-lg text-sm">
            <div className="text-gray-400">Device: {deviceId}</div>
            <div className="text-gray-400">Samples: {sensorData.length}</div>
            <div className="text-green-400">● Monitoring Active</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Usage:**
```
User: "Create a power monitoring dashboard"
SystemAgent: [Generates above applet]
User: [Clicks "Start Monitoring" in applet]
→ Real-time graphs update every second
→ Shows voltage, current, power with sparklines
```

---

## Advanced Examples

### Example 1: Multi-Device Management

**Scenario:** Control multiple ESP32 devices simultaneously

**User:** "Connect to two ESP32 devices and synchronize their LEDs"

```javascript
// SystemAgent would generate this workflow:

// Connect device 1
const dev1 = await executeSystemTool('connect-device', {});
// Connect device 2
const dev2 = await executeSystemTool('connect-device', {});

// Synchronize LEDs
for (let i = 0; i < 10; i++) {
  const state = i % 2; // Alternate on/off

  await executeSystemTool('send-device-command', {
    deviceId: dev1.deviceId,
    command: { action: 'set_gpio', pin: 2, state }
  });

  await executeSystemTool('send-device-command', {
    deviceId: dev2.deviceId,
    command: { action: 'set_gpio', pin: 2, state }
  });

  await sleep(500);
}
```

### Example 2: Data Logging and Analysis

**User:** "Monitor the sensor for 5 minutes and analyze the data"

**Workflow:**
1. Create device project with 1-second polling
2. Wait 5 minutes (300 samples)
3. Read telemetry log file
4. Analyze with Python:

```python
import json
import statistics

# Read telemetry file
vfs = get_vfs()
log_content = vfs.read_file('projects/sensor-monitor/output/telemetry/2026-01-02.log')

# Parse data
readings = []
for line in log_content.split('\n'):
    if line.strip():
        data = json.loads(line)
        if 'read_adc' in data:
            readings.append(data['read_adc']['voltage'])

# Analyze
avg = statistics.mean(readings)
std_dev = statistics.stdev(readings)
minimum = min(readings)
maximum = max(readings)

print(f"Average voltage: {avg:.3f}V")
print(f"Std deviation: {std_dev:.3f}V")
print(f"Min: {minimum:.3f}V, Max: {maximum:.3f}V")
```

### Example 3: Custom Protocol Extension

**Add new command to firmware:**

```cpp
// In firmware, add new handler:
else if (action == "blink_pattern") {
  handleBlinkPattern();
}

void handleBlinkPattern() {
  int pin = doc["pin"];
  String pattern = doc["pattern"].as<String>();
  int duration = doc["duration"] | 100;

  // Pattern: "101010" = on-off-on-off-on-off
  for (int i = 0; i < pattern.length(); i++) {
    int state = (pattern[i] == '1') ? HIGH : LOW;
    digitalWrite(pin, state);
    delay(duration);
  }
  digitalWrite(pin, LOW);

  sendSuccess("Blink pattern completed");
}
```

**Use in LLMos:**
```
User: "Blink pin 2 in a morse code SOS pattern"

SystemAgent sends:
{
  "action": "blink_pattern",
  "pin": 2,
  "pattern": "1110111000111011100001110111",
  "duration": 200
}
```

---

## Troubleshooting

### Problem: Browser doesn't show device picker

**Cause:** Web Serial API requires HTTPS or localhost

**Solution:**
- Use `https://` URL in production
- Use `http://localhost:3000` in development
- OR use virtual device: `useVirtual: true`

### Problem: "Device not found" error

**Cause:** ESP32 not recognized by browser

**Solution:**
1. Check USB cable (must be data cable, not charge-only)
2. Install CH340/CP2102 drivers if needed
3. In Arduino IDE: Tools → USB CDC On Boot → **Enabled**
4. Re-upload firmware

### Problem: Commands timeout

**Cause:** Firmware not responding or wrong baud rate

**Solution:**
1. Open Serial Monitor (115200 baud)
2. Manually test: `{"action":"get_info"}`
3. Verify JSON response
4. Check firmware uploaded correctly

### Problem: Virtual device doesn't respond

**Cause:** Virtual device instance not created

**Solution:**
```javascript
// Check if virtual device exists
import { SerialManager } from './lib/hardware/serial-manager';
console.log(SerialManager.getAllConnections());
// Should show device with virtual: true
```

### Problem: State files not updating

**Cause:** Cron not registered or device disconnected

**Solution:**
1. Check cron config:
   ```
   Read projects/device-monitor/cron/poll-device.json
   ```
2. Verify enabled: `"enabled": true`
3. Check connection:
   ```
   Read projects/device-monitor/state/connection.json
   ```

### Problem: I2C sensor returns all zeros

**Cause:** Sensor not connected or wrong address

**Solution:**
1. Check wiring (SDA, SCL, VCC, GND)
2. Test with I2C scanner:
   ```cpp
   Wire.beginTransmission(0x40);
   byte error = Wire.endTransmission();
   if (error == 0) Serial.println("INA219 found!");
   ```
3. Verify INA219 address (default 0x40)

---

## Summary

### What You Have Now

✅ **Virtual Device** - Test immediately without hardware
✅ **Browser-Based WASM Compiler** - Compile C to WebAssembly entirely in browser
✅ **Zero Backend Required** - No Docker, no build servers, works on Vercel
✅ **Web Serial Protocol** - Direct browser-to-ESP32 communication
✅ **Complete Firmware** - GPIO, ADC, I2C, PWM support
✅ **Device-as-Project** - Persistent state in VFS
✅ **Cron Polling** - Background monitoring
✅ **Custom Applets** - Visual interfaces for device control
✅ **Privacy-First Compilation** - Code never leaves your browser

### Quick Reference

**Connect Virtual Device:**
```
"Connect to a virtual ESP32 device"
```

**Connect Physical Device:**
```
"Connect to my ESP32 device"
```

**Basic Control:**
```
"Turn on pin 2"
"Read ADC pin 1"
"Get device info"
```

**Monitoring:**
```
"Monitor the device every 2 seconds"
"Create a power monitoring project"
```

**Applets:**
```
"Create an applet that shows a virtual board with LEDs"
"Create a power monitoring dashboard"
```

**WASM Deployment:**
```
"Write a C program that blinks an LED and deploy it to ESP32"
"Compile this C code to WASM and deploy: [paste code]"
"Deploy a WebAssembly app to control GPIO pins"
```

---

**You're ready to start using ESP32 with LLMos!**

### Key Features

🌐 **Browser-Based Compilation** - Compile C to WASM without leaving your browser
🔒 **Privacy-First** - Code never leaves your machine
☁️ **Deploy Anywhere** - Works on Vercel, Netlify, any serverless platform
🚀 **Zero Setup** - No Docker, no backend, just npm install
🎯 **Direct Hardware Control** - Deploy compiled apps to ESP32 via Web Serial

For more details:
- **Browser Compilation:** See llmos-lite/docs/BROWSER_COMPILATION.md
- **Architecture:** See llmos-lite/ARCHITECTURE.md
- **System Tools:** See llmos-lite/ui/lib/system-tools.ts

**Status:** ✅ Complete and ready for v0.1 release

**Document Version:** 2.0.0 (Browser-Based WASM Compilation)
**Date:** 2026-01-02
**Branch:** real-world-alpha-v01
