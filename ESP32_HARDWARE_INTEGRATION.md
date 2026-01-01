# ESP32-S3 Hardware Integration - Complete Implementation Guide

**Version:** 1.0.0
**Branch:** real-world-alpha-v01
**Target:** LLMos v0.1 Release (1 week timeline)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Mental Model: Device-as-Project](#mental-model-device-as-project)
3. [File System Structure](#file-system-structure)
4. [System-Level Artifacts](#system-level-artifacts)
5. [Runtime Implementation](#runtime-implementation)
6. [Cron Polling Mechanism](#cron-polling-mechanism)
7. [Collaborator Firmware Guide](#collaborator-firmware-guide)
8. [Implementation Checklist](#implementation-checklist)
9. [Testing & Validation](#testing--validation)

---

## Architecture Overview

### Core Principle: File-First, Project-Based

LLMos treats **hardware devices as persistent projects**, not transient I/O endpoints.

```
┌──────────────────────────────────────────────────────────────────┐
│                         LLMos Architecture                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Browser UI (React + Next.js)                                   │
│    ↓                                                             │
│  SystemAgent (LLM Orchestrator)                                 │
│    ↓ uses                                                        │
│  System Tools (hardware-serial, create-device-project)          │
│    ↓ calls                                                       │
│  SerialManager (Web Serial API wrapper)                         │
│    ↓                                                             │
│  Browser ←→ USB ←→ ESP32-S3                                      │
│    ↑                                                             │
│  CronScheduler (polls device every 1s)                          │
│    ↓ updates                                                     │
│  VFS (projects/my-device/state/*.json)                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Devices = Projects**: Each device gets a project directory with state, config, and cron jobs
2. **System Artifacts = Templates**: Tools/agents/skills in `/system/` are read-only, version-controlled
3. **Cron = Real-Time**: Continuous polling updates device state without user intervention
4. **State = VFS Files**: All device state stored as JSON files in virtual file system
5. **Web Serial = Direct**: No middleware - browser talks directly to USB

---

## Mental Model: Device-as-Project

### Traditional Approach (WRONG for LLMos)
```
User → Click "Connect" → Transient connection → State lost on refresh
```

### LLMos Approach (CORRECT)
```
User → "Create device project" → Persistent VFS project → Cron polls → State survives refresh
```

### Example: User Flow

**User:** "Connect to my ESP32 test bench and monitor power consumption"

**SystemAgent workflow:**
1. Use `connect-device` tool → Get `deviceId: "device-abc123"`
2. Use `create-device-project` tool → Create `projects/esp32-bench-monitor/`
3. Set up cron job → Poll every 1s: `{"action":"read_ina219"}`
4. Update state → Write to `state/sensors.json`
5. Generate applet → Dashboard showing live power graph
6. User closes browser → Project persists in VFS
7. User returns → Cron resumes, state restored

---

## File System Structure

### System Volume (Read-Only)
```
llmos-lite/volumes/system/
├── tools/
│   └── hardware-serial.md         ← Tool definition (SystemAgent reads this)
├── agents/
│   └── HardwareControlAgent.md    ← Agent template (copied to projects)
└── skills/
    └── esp32-json-protocol.md     ← Reusable protocol knowledge
```

### User Volume (Read-Write)
```
llmos-lite/ui/ (VFS stored in localStorage)
└── projects/
    └── esp32-bench-monitor/
        ├── device.config.json     ← Device metadata
        ├── state/                 ← Live state (updated by cron)
        │   ├── connection.json    ← {"connected":true,"deviceId":"..."}
        │   ├── sensors.json       ← {"voltage_v":5.02,"current_ma":123}
        │   └── gpio.json          ← {"pin4":1,"pin5":0}
        ├── cron/
        │   └── poll-device.json   ← Cron config (runs every 1000ms)
        ├── components/
        │   ├── agents/
        │   │   └── BenchMonitorAgent.md  ← Custom agent
        │   └── applets/
        │       └── dashboard.tsx  ← Custom UI
        └── output/
            └── telemetry/
                └── 2026-01-01.log ← Time-series logs
```

### Team Volume (Shared)
```
projects_team/
└── shared-test-bench/
    └── ... (same structure as user projects)
```

---

## System-Level Artifacts

### 1. Tool Definition: `hardware-serial.md`

**Location:** `llmos-lite/volumes/system/tools/hardware-serial.md`

**Purpose:** Defines the hardware serial communication tool that SystemAgent can use.

```markdown
---
name: Hardware Serial Communication
type: tool
category: hardware
version: 1.0.0
---

# Tool: Hardware Serial Communication

## Description
Provides low-level Web Serial API access for ESP32-S3 and similar microcontrollers.

## Operations

### connect-device
Prompts user to select a USB serial device and establishes connection.

**Returns:**
- `deviceId`: Unique device identifier
- `deviceInfo`: Port metadata (vendor/product ID)

**Example:**
```json
{
  "success": true,
  "deviceId": "device-1234567890-abc123",
  "metadata": {
    "name": "ESP32-S3",
    "vendorId": 12346,
    "productId": 32823
  }
}
```

### send-command
Sends JSON command to device and waits for response.

**Inputs:**
- `deviceId` (required): Device ID from connect-device
- `command` (required): JSON object following ESP32 protocol

**Returns:**
- `response`: Device JSON response
- `success`: Boolean indicating if command succeeded

**Example:**
```json
{
  "success": true,
  "response": {
    "status": "ok",
    "msg": "GPIO set"
  }
}
```

### disconnect-device
Closes connection and releases serial port.

**Inputs:**
- `deviceId` (required)

### list-devices
Returns all currently connected devices.

**Returns:**
- `devices`: Array of device connections

## Protocol Specification

Devices must implement newline-delimited JSON:

**Request Format:**
```json
{"action":"<ACTION_NAME>",...params}\n
```

**Response Format:**
```json
{"status":"ok"|"error",...data}\n
```

## Error Handling
- Timeout: 5s per command
- Auto-reconnect: On read/write errors
- Validation: JSON schema checking
- User feedback: Clear error messages

## Browser Requirements
- Chrome/Edge 89+ (Web Serial API support)
- HTTPS or localhost (security requirement)
- User gesture required for initial connection

## Security Considerations
- User must explicitly approve device connection
- No background access without user consent
- Connection state visible in UI
- Disconnect on page unload (optional persistent connection)
```

---

### 2. Agent Template: `HardwareControlAgent.md`

**Location:** `llmos-lite/volumes/system/agents/HardwareControlAgent.md`

**Purpose:** Expert agent that knows how to control ESP32 devices. Copied to projects when needed.

```markdown
---
name: Hardware Control Agent
type: agent
category: hardware
capabilities:
  - ESP32-S3 device control
  - Real-time sensor monitoring
  - GPIO state management
  - I2C/SPI communication
libraries:
  - Web Serial API
  - JSON protocol
version: 1.0.0
---

# Hardware Control Agent

Expert agent for controlling ESP32-S3 microcontrollers via Web Serial API.

## Role
Bridge between user intentions and hardware I/O. Translates natural language requests into device commands and interprets sensor data.

## Capabilities

### 1. Device Connection Management
- Initiate USB serial connections
- Handle reconnection on failures
- Manage multiple devices simultaneously
- Monitor connection health

### 2. GPIO Control
- Set digital outputs (HIGH/LOW)
- Read digital inputs
- Configure pin modes (INPUT/OUTPUT/INPUT_PULLUP)
- PWM control (duty cycle, frequency)

### 3. Sensor Data Acquisition
- Read analog sensors (ADC 0-4095)
- Parse I2C sensor data (INA219, BME280, etc.)
- Convert raw values to engineering units
- Handle sensor calibration

### 4. State Monitoring
- Poll device state periodically
- Detect state changes
- Trigger alerts on thresholds
- Log telemetry data

## Workflow Patterns

### Pattern 1: One-Shot Command
**Use when:** User wants immediate action (e.g., "turn on LED")

**Steps:**
1. Validate device connection (`list-devices`)
2. Send JSON command (`send-command`)
3. Parse response
4. Report result to user

**Example:**
```
User: "Turn on the relay on pin 4"

Agent:
1. Check device connected: list-devices
2. Send command: {"action":"set_gpio","pin":4,"state":1}
3. Verify response: {"status":"ok"}
4. Reply: "Relay on pin 4 is now ON"
```

---

### Pattern 2: Continuous Monitoring
**Use when:** User wants ongoing telemetry (e.g., "monitor temperature")

**Steps:**
1. Create device project structure (`create-device-project`)
2. Set up cron job for polling
3. Update state files in VFS
4. Generate dashboard applet
5. Trigger actions on events

**Example:**
```
User: "Monitor power consumption on the test bench"

Agent:
1. Create project: create-device-project(projectName="power-monitor", deviceId="...")
2. Configure cron: poll every 1s, read INA219 sensor
3. Update state: write to projects/power-monitor/state/sensors.json
4. Generate applet: Power dashboard with live graph
5. Set alert: if current_ma > 500, notify user
```

---

### Pattern 3: Data Logging
**Use when:** User wants historical data (e.g., "log voltage for 1 hour")

**Steps:**
1. Create device project
2. Set up cron with logging
3. Save to `output/telemetry/<date>.log`
4. Generate summary statistics
5. Create visualization

**Example:**
```
User: "Log temperature every second and show me a graph"

Agent:
1. Create project: create-device-project(projectName="temp-logger")
2. Configure cron: poll every 1s, read temperature
3. Log to file: projects/temp-logger/output/telemetry/2026-01-01.log
4. After 1 hour: analyze data, generate plot
5. Display: Time-series graph in applet
```

---

### Pattern 4: Custom Dashboard
**Use when:** User wants visual interface (e.g., "show me a control panel")

**Steps:**
1. Understand requirements
2. Generate React applet with controls
3. Bind applet to device state
4. Handle user interactions

**Example:**
```
User: "Build me a dashboard with GPIO toggles and sensor readings"

Agent:
1. Analyze needs: 8 GPIO controls + voltage/current display
2. Generate applet: generate-applet(name="GPIO Dashboard", code=<react-code>)
3. Bind state: Read from projects/device/state/gpio.json
4. Wire actions: Toggle → send-command → update state
5. Display: Live updating dashboard
```

---

## Integration with System Tools

### Tools Used by This Agent

1. **connect-device**: Establish USB connection
2. **send-device-command**: Execute JSON commands
3. **disconnect-device**: Close connection
4. **create-device-project**: Set up persistent monitoring
5. **write-file**: Save state and logs
6. **read-file**: Load device config
7. **generate-applet**: Create custom UIs
8. **execute-python**: Analyze sensor data

### Common Command Sequences

**Read a sensor:**
```
1. list-devices → get deviceId
2. send-device-command(deviceId, {"action":"read_adc","pin":1})
3. Parse response: {"status":"ok","value":2048,"voltage":1.65}
4. Report: "ADC reading: 1.65V"
```

**Set up monitoring:**
```
1. connect-device → get deviceId
2. create-device-project(projectName="monitor", deviceId=...)
3. Cron auto-starts polling
4. State updates in projects/monitor/state/sensors.json
5. User can read state anytime
```

**Control multiple GPIOs:**
```
1. For each pin in [2, 4, 5]:
   - send-device-command({"action":"set_gpio","pin":pin,"state":1})
2. Update state/gpio.json with all pin states
3. Confirm: "All pins set to HIGH"
```

---

## Error Handling

### Connection Errors
- **Device not found**: Ask user to plug in device and retry
- **Permission denied**: Explain browser security requirements
- **Connection lost**: Auto-reconnect or notify user

### Command Errors
- **Timeout**: Increase timeout or check device firmware
- **Invalid JSON**: Show user the malformed response
- **Unknown action**: Device firmware doesn't support command

### State Errors
- **State file missing**: Initialize with default state
- **Corrupted JSON**: Reset to empty state, log error
- **Cron failure**: Disable cron, notify user

---

## Best Practices

1. **Always validate device connection** before sending commands
2. **Store device state in VFS** for persistence
3. **Use cron for continuous tasks** instead of polling in applets
4. **Generate applets for complex UIs** instead of text responses
5. **Log errors to project output/** for debugging
6. **Provide clear feedback** to user on all operations
7. **Handle disconnections gracefully** with reconnect logic

---

## Example Interaction Flows

### Flow 1: Quick GPIO Toggle
```
User: "Turn on pin 2"
Agent: send-device-command({"action":"set_gpio","pin":2,"state":1})
Device: {"status":"ok"}
Agent: "Pin 2 is now HIGH"
```

### Flow 2: Setup Monitoring
```
User: "Monitor the INA219 sensor on my bench"
Agent:
  1. connect-device → deviceId="dev123"
  2. create-device-project("bench-monitor", "dev123")
  3. Cron starts: poll every 1s
  4. State updates: projects/bench-monitor/state/sensors.json
  5. Generate applet: Live power dashboard
Agent: "Monitoring started. View dashboard in Applets panel."
```

### Flow 3: Data Analysis
```
User: "Has the voltage been stable for the last hour?"
Agent:
  1. read-file(projects/bench-monitor/output/telemetry/2026-01-01.log)
  2. execute-python: Analyze voltage data (mean, stddev, range)
  3. Result: Mean=5.02V, StdDev=0.03V, Range=4.98-5.06V
Agent: "Voltage stable: 5.02V ± 0.03V over the last hour"
```

---

## Firmware Requirements

The agent expects devices to implement the ESP32 JSON Protocol (see skill: `esp32-json-protocol.md`).

**Minimum Requirements:**
- 115200 baud rate
- USB CDC (native USB)
- Newline-delimited JSON
- Standard command support: `set_gpio`, `read_adc`, `get_info`

**Recommended:**
- I2C sensor support: `read_i2c`
- PWM support: `set_pwm`
- Status reporting: `get_status`
- Error messages in responses
```

---

### 3. Skill Document: `esp32-json-protocol.md`

**Location:** `llmos-lite/volumes/system/skills/esp32-json-protocol.md`

**Purpose:** Reusable knowledge about the ESP32 communication protocol.

```markdown
---
name: ESP32 JSON Protocol
category: hardware
description: Standard JSON command protocol for ESP32 devices
keywords: [esp32, json, protocol, serial, hardware]
version: 1.0.0
---

# Skill: ESP32 JSON Protocol

## When to Use
When communicating with ESP32-S3 devices that implement the standard JSON protocol over USB serial.

## Protocol Specification

### Transport Layer
- **Interface**: USB CDC (native USB on ESP32-S3)
- **Baud Rate**: 115200 bps
- **Format**: Newline-delimited JSON (`\n` terminated)
- **Encoding**: UTF-8

### Message Format
All messages are JSON objects followed by newline:
```
<JSON_OBJECT>\n
```

**Example:**
```json
{"action":"set_gpio","pin":4,"state":1}\n
```

---

## Standard Commands

### 1. GPIO Control

#### Set GPIO
**Request:**
```json
{"action":"set_gpio","pin":4,"state":1}
```

**Parameters:**
- `pin`: GPIO pin number (0-48 on ESP32-S3)
- `state`: 0 (LOW) or 1 (HIGH)

**Response (Success):**
```json
{"status":"ok","msg":"GPIO set"}
```

**Response (Error):**
```json
{"status":"error","msg":"Invalid pin number"}
```

---

#### Read GPIO
**Request:**
```json
{"action":"read_gpio","pin":5}
```

**Response:**
```json
{"status":"ok","pin":5,"state":1}
```

---

### 2. Analog Input (ADC)

#### Read ADC
**Request:**
```json
{"action":"read_adc","pin":1}
```

**Parameters:**
- `pin`: ADC channel (1-10 on ESP32-S3)

**Response:**
```json
{"status":"ok","pin":1,"value":2048,"voltage":1.65}
```

**Notes:**
- `value`: Raw ADC reading (0-4095 for 12-bit)
- `voltage`: Calculated voltage (assuming 3.3V reference)

---

### 3. I2C Sensor Communication

#### Read INA219 (Current/Voltage Sensor)
**Request:**
```json
{"action":"read_i2c","sensor":"ina219"}
```

**Response:**
```json
{
  "status":"ok",
  "sensor":"ina219",
  "voltage_v":5.02,
  "current_ma":123.4,
  "power_mw":618.5
}
```

---

#### Read BME280 (Temperature/Humidity/Pressure)
**Request:**
```json
{"action":"read_i2c","sensor":"bme280"}
```

**Response:**
```json
{
  "status":"ok",
  "sensor":"bme280",
  "temperature_c":23.5,
  "humidity_pct":45.2,
  "pressure_hpa":1013.25
}
```

---

### 4. PWM Control

#### Set PWM
**Request:**
```json
{"action":"set_pwm","pin":12,"duty":128,"freq":1000}
```

**Parameters:**
- `pin`: GPIO pin for PWM output
- `duty`: Duty cycle (0-255)
- `freq`: Frequency in Hz

**Response:**
```json
{"status":"ok","msg":"PWM configured"}
```

---

### 5. System Information

#### Get Device Info
**Request:**
```json
{"action":"get_info"}
```

**Response:**
```json
{
  "status":"ok",
  "device":"ESP32-S3",
  "firmware":"1.0.0",
  "uptime_ms":123456,
  "free_heap":234567
}
```

---

#### Get Status
**Request:**
```json
{"action":"get_status"}
```

**Response:**
```json
{
  "status":"ok",
  "connected":true,
  "sensors_active":["ina219"],
  "gpio_states":{"pin2":1,"pin4":0}
}
```

---

## Error Responses

### Error Format
```json
{"status":"error","msg":"<ERROR_MESSAGE>"}
```

### Common Errors
```json
{"status":"error","msg":"Unknown action"}
{"status":"error","msg":"Invalid pin number"}
{"status":"error","msg":"Sensor not found"}
{"status":"error","msg":"I2C communication failed"}
{"status":"error","msg":"JSON parse error"}
```

---

## Firmware Implementation Guide

### Arduino Code Structure

```cpp
#include <Arduino.h>
#include <ArduinoJson.h>

// JSON buffer
JsonDocument doc;

void setup() {
  // Initialize USB serial (115200 baud)
  Serial.begin(115200);

  // Wait for USB connection
  while (!Serial) {
    delay(10);
  }

  // Initialize GPIO
  pinMode(2, OUTPUT);
  pinMode(4, OUTPUT);
  pinMode(5, INPUT);

  Serial.println("{\"status\":\"ok\",\"msg\":\"Device ready\"}");
}

void loop() {
  // Check for incoming data
  if (Serial.available() > 0) {
    // Read until newline
    String input = Serial.readStringUntil('\n');

    // Parse JSON
    DeserializationError error = deserializeJson(doc, input);

    if (error) {
      Serial.println("{\"status\":\"error\",\"msg\":\"JSON parse error\"}");
      return;
    }

    // Extract action
    String action = doc["action"];

    // Route to handlers
    if (action == "set_gpio") {
      handleSetGpio();
    } else if (action == "read_gpio") {
      handleReadGpio();
    } else if (action == "read_adc") {
      handleReadAdc();
    } else if (action == "read_i2c") {
      handleReadI2C();
    } else if (action == "get_info") {
      handleGetInfo();
    } else {
      Serial.println("{\"status\":\"error\",\"msg\":\"Unknown action\"}");
    }
  }
}

void handleSetGpio() {
  int pin = doc["pin"];
  int state = doc["state"];

  // Validate pin
  if (pin < 0 || pin > 48) {
    Serial.println("{\"status\":\"error\",\"msg\":\"Invalid pin number\"}");
    return;
  }

  // Set GPIO
  digitalWrite(pin, state);

  // Respond
  Serial.println("{\"status\":\"ok\",\"msg\":\"GPIO set\"}");
}

void handleReadGpio() {
  int pin = doc["pin"];
  int state = digitalRead(pin);

  Serial.print("{\"status\":\"ok\",\"pin\":");
  Serial.print(pin);
  Serial.print(",\"state\":");
  Serial.print(state);
  Serial.println("}");
}

void handleReadAdc() {
  int pin = doc["pin"];
  int value = analogRead(pin);
  float voltage = value * (3.3 / 4095.0);

  Serial.print("{\"status\":\"ok\",\"pin\":");
  Serial.print(pin);
  Serial.print(",\"value\":");
  Serial.print(value);
  Serial.print(",\"voltage\":");
  Serial.print(voltage, 2);
  Serial.println("}");
}

void handleReadI2C() {
  String sensor = doc["sensor"];

  if (sensor == "ina219") {
    // Read INA219 sensor
    float voltage = readINA219Voltage();
    float current = readINA219Current();
    float power = voltage * current;

    Serial.print("{\"status\":\"ok\",\"sensor\":\"ina219\",");
    Serial.print("\"voltage_v\":");
    Serial.print(voltage, 2);
    Serial.print(",\"current_ma\":");
    Serial.print(current, 1);
    Serial.print(",\"power_mw\":");
    Serial.print(power, 1);
    Serial.println("}");
  } else {
    Serial.println("{\"status\":\"error\",\"msg\":\"Sensor not found\"}");
  }
}

void handleGetInfo() {
  Serial.print("{\"status\":\"ok\",");
  Serial.print("\"device\":\"ESP32-S3\",");
  Serial.print("\"firmware\":\"1.0.0\",");
  Serial.print("\"uptime_ms\":");
  Serial.print(millis());
  Serial.print(",\"free_heap\":");
  Serial.print(ESP.getFreeHeap());
  Serial.println("}");
}
```

---

## Best Practices

### For Firmware Developers

1. **Always validate inputs** before acting on hardware
2. **Include error messages** for debugging
3. **Use consistent key naming** (snake_case)
4. **Add timestamps** for telemetry data
5. **Implement timeout handling** for I2C/SPI
6. **Test JSON parsing** with malformed inputs
7. **Document custom commands** in device-specific docs

### For Web Developers

1. **Send newline-terminated JSON** (`\n`)
2. **Wait for response** before sending next command
3. **Handle timeouts** (5s default)
4. **Parse responses** defensively (check `status` field)
5. **Log errors** for debugging
6. **Reconnect automatically** on connection loss
7. **Show user feedback** during operations

---

## Testing Commands

Use these commands to test firmware implementation:

```bash
# Test GPIO (via serial terminal)
{"action":"set_gpio","pin":2,"state":1}
{"action":"read_gpio","pin":2}

# Test ADC
{"action":"read_adc","pin":1}

# Test sensor
{"action":"read_i2c","sensor":"ina219"}

# Test system info
{"action":"get_info"}
```

---

## Extensions

Devices can implement custom commands beyond the standard protocol:

```json
{"action":"custom_calibrate","sensor":"ina219","shunt_ohms":0.1}
{"action":"custom_led_pattern","pattern":"blink","interval_ms":500}
```

**Convention:** Prefix custom actions with `custom_` to avoid conflicts.

---

## Version History

- **v1.0.0** (2026-01-01): Initial protocol specification
  - GPIO control (set/read)
  - ADC reading
  - I2C sensor support (INA219, BME280)
  - System info commands
```

---

## Runtime Implementation

### 4. Serial Manager: `serial-manager.ts`

**Location:** `llmos-lite/ui/lib/hardware/serial-manager.ts`

**Purpose:** Web Serial API wrapper with connection management and JSON protocol handling.

```typescript
/**
 * Serial Manager - Web Serial API wrapper for ESP32 devices
 *
 * Handles:
 * - Device connection/disconnection
 * - JSON command protocol
 * - Response handling with callbacks
 * - Auto-reconnect on errors
 * - Multi-device support
 */

export interface DeviceConnection {
  id: string;
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  connected: boolean;
  metadata: {
    vendorId?: number;
    productId?: number;
    name: string;
  };
  connectedAt: string;
}

export interface DeviceCommand {
  action: string;
  [key: string]: any;
}

export interface DeviceResponse {
  status: 'ok' | 'error';
  [key: string]: any;
}

type ResponseCallback = (response: DeviceResponse) => void;

class SerialManagerClass {
  private connections = new Map<string, DeviceConnection>();
  private responseCallbacks = new Map<string, ResponseCallback>();
  private eventListeners = new Map<string, Set<(data: DeviceResponse) => void>>();

  /**
   * Check if Web Serial API is supported
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Connect to a device (shows browser picker)
   */
  async connect(): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('Web Serial API not supported. Use Chrome/Edge 89+ on HTTPS or localhost.');
    }

    try {
      // Request port from user
      const port = await (navigator as any).serial.requestPort();

      // Open with standard settings
      await port.open({ baudRate: 115200 });

      // Generate unique device ID
      const deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // Get device info
      const info = port.getInfo();

      const connection: DeviceConnection = {
        id: deviceId,
        port,
        reader: port.readable.getReader(),
        writer: port.writable.getWriter(),
        connected: true,
        metadata: {
          vendorId: info.usbVendorId,
          productId: info.usbProductId,
          name: 'ESP32-S3',
        },
        connectedAt: new Date().toISOString(),
      };

      this.connections.set(deviceId, connection);
      this.startReading(deviceId);

      console.log(`[SerialManager] Connected device: ${deviceId}`, connection.metadata);
      return deviceId;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        throw new Error('No device selected. Please select a device from the picker.');
      }
      throw new Error(`Connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Send command and wait for response
   */
  async sendCommand(
    deviceId: string,
    command: DeviceCommand,
    timeout = 5000
  ): Promise<DeviceResponse> {
    const conn = this.connections.get(deviceId);
    if (!conn || !conn.connected) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    // Encode command as JSON + newline
    const commandJson = JSON.stringify(command) + '\n';
    const encoder = new TextEncoder();
    const data = encoder.encode(commandJson);

    console.log(`[SerialManager] Sending to ${deviceId}:`, command);

    try {
      // Send command
      await conn.writer.write(data);

      // Wait for response
      return await new Promise<DeviceResponse>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.responseCallbacks.delete(deviceId);
          reject(new Error(`Command timeout after ${timeout}ms`));
        }, timeout);

        this.responseCallbacks.set(deviceId, (response) => {
          clearTimeout(timeoutId);
          this.responseCallbacks.delete(deviceId);
          resolve(response);
        });
      });
    } catch (error) {
      console.error(`[SerialManager] Send error on ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;

    console.log(`[SerialManager] Disconnecting device: ${deviceId}`);

    try {
      conn.connected = false;

      // Cancel reader
      if (conn.reader) {
        await conn.reader.cancel();
        conn.reader.releaseLock();
      }

      // Close writer
      if (conn.writer) {
        await conn.writer.close();
      }

      // Close port
      if (conn.port) {
        await conn.port.close();
      }

      this.connections.delete(deviceId);
      this.responseCallbacks.delete(deviceId);
      this.eventListeners.delete(deviceId);

      console.log(`[SerialManager] Device ${deviceId} disconnected`);
    } catch (error) {
      console.error(`[SerialManager] Disconnect error:`, error);
    }
  }

  /**
   * Get device connection info
   */
  getConnection(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  /**
   * Get all connected devices
   */
  getAllConnections(): DeviceConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Check if device is connected
   */
  isConnected(deviceId: string): boolean {
    const conn = this.connections.get(deviceId);
    return conn?.connected ?? false;
  }

  /**
   * Add event listener for device responses
   */
  addEventListener(deviceId: string, callback: (data: DeviceResponse) => void): void {
    if (!this.eventListeners.has(deviceId)) {
      this.eventListeners.set(deviceId, new Set());
    }
    this.eventListeners.get(deviceId)!.add(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(deviceId: string, callback: (data: DeviceResponse) => void): void {
    this.eventListeners.get(deviceId)?.delete(callback);
  }

  /**
   * Start reading from device
   */
  private async startReading(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;

    const decoder = new TextDecoder();
    let buffer = '';

    console.log(`[SerialManager] Started reading from ${deviceId}`);

    try {
      while (conn.connected) {
        const { value, done } = await conn.reader.read();

        if (done) {
          console.log(`[SerialManager] Read stream closed for ${deviceId}`);
          break;
        }

        // Decode and buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: DeviceResponse = JSON.parse(line);
              console.log(`[SerialManager] Received from ${deviceId}:`, response);

              // Trigger callback if waiting for response
              const callback = this.responseCallbacks.get(deviceId);
              if (callback) {
                callback(response);
              }

              // Notify event listeners
              this.notifyListeners(deviceId, response);
            } catch (parseError) {
              console.warn(`[SerialManager] Invalid JSON from ${deviceId}:`, line);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[SerialManager] Read error on ${deviceId}:`, error);

      // Try to reconnect
      if (conn.connected) {
        console.log(`[SerialManager] Attempting reconnect for ${deviceId}...`);
        await this.disconnect(deviceId);
      }
    }
  }

  /**
   * Notify event listeners
   */
  private notifyListeners(deviceId: string, data: DeviceResponse): void {
    this.eventListeners.get(deviceId)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[SerialManager] Listener error:', error);
      }
    });
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    const deviceIds = Array.from(this.connections.keys());
    await Promise.all(deviceIds.map(id => this.disconnect(id)));
  }
}

// Singleton instance
export const SerialManager = new SerialManagerClass();

// Export for React hooks
export function useSerialManager() {
  return SerialManager;
}
```

---

### 5. Device Cron Handler: `device-cron-handler.ts`

**Location:** `llmos-lite/ui/lib/hardware/device-cron-handler.ts`

**Purpose:** Handles periodic device polling via cron scheduler.

```typescript
/**
 * Device Cron Handler
 *
 * Executes periodic device polling tasks defined in device projects.
 * Updates device state files in VFS.
 */

import { SerialManager, DeviceCommand, DeviceResponse } from './serial-manager';
import { getVFS } from '../virtual-fs';

export interface DeviceCronConfig {
  id: string;
  deviceId: string;
  projectPath: string;
  commands: DeviceCommand[];
  interval: number; // milliseconds
  enabled: boolean;
}

export interface DeviceState {
  sensors: Record<string, any>;
  gpio: Record<string, number>;
  connection: {
    connected: boolean;
    lastUpdate: string;
    deviceId: string;
  };
}

/**
 * Execute device polling task
 */
export async function executeDevicePoll(config: DeviceCronConfig): Promise<void> {
  const vfs = getVFS();

  try {
    // Check if device is still connected
    if (!SerialManager.isConnected(config.deviceId)) {
      console.warn(`[DeviceCron] Device ${config.deviceId} not connected, skipping poll`);

      // Update connection state
      const connectionPath = `${config.projectPath}/state/connection.json`;
      vfs.writeFile(connectionPath, JSON.stringify({
        connected: false,
        lastUpdate: new Date().toISOString(),
        deviceId: config.deviceId,
        error: 'Device disconnected',
      }, null, 2));

      return;
    }

    // Execute all commands
    const results: Record<string, any> = {};

    for (const command of config.commands) {
      try {
        const response = await SerialManager.sendCommand(config.deviceId, command, 3000);

        if (response.status === 'ok') {
          // Store result by action name
          results[command.action] = response;
        } else {
          console.warn(`[DeviceCron] Command ${command.action} failed:`, response.msg);
        }
      } catch (error) {
        console.error(`[DeviceCron] Command ${command.action} error:`, error);
      }
    }

    // Update state files
    await updateDeviceState(config.projectPath, config.deviceId, results);

    // Log telemetry
    await logTelemetry(config.projectPath, results);

  } catch (error) {
    console.error(`[DeviceCron] Poll execution failed:`, error);
  }
}

/**
 * Update device state files in VFS
 */
async function updateDeviceState(
  projectPath: string,
  deviceId: string,
  results: Record<string, any>
): Promise<void> {
  const vfs = getVFS();

  try {
    // Update sensors.json
    const sensorData: Record<string, any> = {};

    if (results.read_adc) {
      sensorData.adc = {
        value: results.read_adc.value,
        voltage: results.read_adc.voltage,
      };
    }

    if (results.read_i2c) {
      const sensor = results.read_i2c.sensor;
      sensorData[sensor] = {
        voltage_v: results.read_i2c.voltage_v,
        current_ma: results.read_i2c.current_ma,
        power_mw: results.read_i2c.power_mw,
      };
    }

    if (Object.keys(sensorData).length > 0) {
      const sensorsPath = `${projectPath}/state/sensors.json`;
      vfs.writeFile(sensorsPath, JSON.stringify({
        ...sensorData,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }

    // Update gpio.json
    if (results.read_gpio) {
      const gpioPath = `${projectPath}/state/gpio.json`;
      const currentGpio = JSON.parse(vfs.readFileContent(gpioPath) || '{}');

      currentGpio[`pin${results.read_gpio.pin}`] = results.read_gpio.state;
      currentGpio.timestamp = new Date().toISOString();

      vfs.writeFile(gpioPath, JSON.stringify(currentGpio, null, 2));
    }

    // Update connection.json
    const connectionPath = `${projectPath}/state/connection.json`;
    vfs.writeFile(connectionPath, JSON.stringify({
      connected: true,
      lastUpdate: new Date().toISOString(),
      deviceId,
    }, null, 2));

  } catch (error) {
    console.error('[DeviceCron] State update failed:', error);
  }
}

/**
 * Log telemetry data to output/telemetry/<date>.log
 */
async function logTelemetry(projectPath: string, results: Record<string, any>): Promise<void> {
  const vfs = getVFS();

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const telemetryPath = `${projectPath}/output/telemetry/${dateStr}.log`;

    // Read existing log or create new
    let logContent = vfs.readFileContent(telemetryPath) || '';

    // Append new entry
    const entry = {
      timestamp: now.toISOString(),
      data: results,
    };

    logContent += JSON.stringify(entry) + '\n';

    // Write back
    vfs.writeFile(telemetryPath, logContent);

  } catch (error) {
    console.error('[DeviceCron] Telemetry logging failed:', error);
  }
}

/**
 * Register device cron with scheduler
 */
export async function registerDeviceCron(config: DeviceCronConfig): Promise<void> {
  const { CronScheduler } = await import('../cron-scheduler');
  const scheduler = CronScheduler.getInstance();

  scheduler.registerCron({
    id: config.id,
    name: `Device Poll: ${config.projectPath}`,
    volume: 'user',
    intervalMs: config.interval,
    enabled: config.enabled,
  });

  // Override the execution to use device polling
  // Note: This requires modifying CronScheduler to support custom executors
  // For now, we'll use a workaround with setInterval

  if (config.enabled) {
    const pollInterval = setInterval(async () => {
      await executeDevicePoll(config);
    }, config.interval);

    // Store interval ID for cleanup (would need global registry)
    (globalThis as any).__deviceCronIntervals = (globalThis as any).__deviceCronIntervals || new Map();
    (globalThis as any).__deviceCronIntervals.set(config.id, pollInterval);
  }
}

/**
 * Unregister device cron
 */
export function unregisterDeviceCron(cronId: string): void {
  const intervals = (globalThis as any).__deviceCronIntervals as Map<string, NodeJS.Timeout>;
  if (intervals?.has(cronId)) {
    clearInterval(intervals.get(cronId));
    intervals.delete(cronId);
  }
}
```

---

## Cron Polling Mechanism

The cron system continuously polls the device and updates state files in the VFS.

### Cron Config Example

**File:** `projects/esp32-bench-monitor/cron/poll-device.json`

```json
{
  "id": "device-poll-abc123",
  "deviceId": "device-1234567890-abc123",
  "projectPath": "projects/esp32-bench-monitor",
  "interval": 1000,
  "enabled": true,
  "commands": [
    {
      "action": "read_i2c",
      "sensor": "ina219"
    },
    {
      "action": "read_gpio",
      "pin": 5
    }
  ]
}
```

### State File Updates

Every poll cycle (1s) updates:

**`state/sensors.json`:**
```json
{
  "ina219": {
    "voltage_v": 5.02,
    "current_ma": 123.4,
    "power_mw": 618.5
  },
  "timestamp": "2026-01-01T12:34:56.789Z"
}
```

**`state/gpio.json`:**
```json
{
  "pin5": 1,
  "timestamp": "2026-01-01T12:34:56.789Z"
}
```

**`state/connection.json`:**
```json
{
  "connected": true,
  "lastUpdate": "2026-01-01T12:34:56.789Z",
  "deviceId": "device-1234567890-abc123"
}
```

### Telemetry Logging

**`output/telemetry/2026-01-01.log`:**
```jsonl
{"timestamp":"2026-01-01T12:34:56.789Z","data":{"read_i2c":{"status":"ok","voltage_v":5.02}}}
{"timestamp":"2026-01-01T12:34:57.789Z","data":{"read_i2c":{"status":"ok","voltage_v":5.03}}}
{"timestamp":"2026-01-01T12:34:58.789Z","data":{"read_i2c":{"status":"ok","voltage_v":5.01}}}
```

---

## Collaborator Firmware Guide

### Quick Start for ESP32-S3 Firmware

**Requirements:**
- Arduino IDE 2.x or PlatformIO
- ESP32-S3 board package
- ArduinoJson library (v6+)

### Minimal Firmware Template

**File:** `firmware/esp32_llmos/esp32_llmos.ino`

```cpp
#include <Arduino.h>
#include <ArduinoJson.h>

// JSON buffer
JsonDocument doc;

// Pin definitions
#define RELAY_PIN 4
#define LED_PIN 2

void setup() {
  // Initialize USB serial
  Serial.begin(115200);

  // Wait for USB connection
  while (!Serial) {
    delay(10);
  }

  // Initialize GPIO
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(5, INPUT);

  // Send ready message
  Serial.println("{\"status\":\"ok\",\"msg\":\"ESP32-S3 ready\"}");
}

void loop() {
  // Check for incoming data
  if (Serial.available() > 0) {
    // Read until newline
    String input = Serial.readStringUntil('\n');

    // Parse JSON
    DeserializationError error = deserializeJson(doc, input);

    if (error) {
      Serial.println("{\"status\":\"error\",\"msg\":\"JSON parse error\"}");
      return;
    }

    // Extract action
    String action = doc["action"].as<String>();

    // Route to handlers
    if (action == "set_gpio") {
      handleSetGpio();
    } else if (action == "read_gpio") {
      handleReadGpio();
    } else if (action == "read_adc") {
      handleReadAdc();
    } else if (action == "get_info") {
      handleGetInfo();
    } else {
      Serial.println("{\"status\":\"error\",\"msg\":\"Unknown action\"}");
    }
  }
}

void handleSetGpio() {
  int pin = doc["pin"];
  int state = doc["state"];

  digitalWrite(pin, state);
  Serial.println("{\"status\":\"ok\",\"msg\":\"GPIO set\"}");
}

void handleReadGpio() {
  int pin = doc["pin"];
  int state = digitalRead(pin);

  Serial.print("{\"status\":\"ok\",\"pin\":");
  Serial.print(pin);
  Serial.print(",\"state\":");
  Serial.print(state);
  Serial.println("}");
}

void handleReadAdc() {
  int pin = doc["pin"];
  int value = analogRead(pin);
  float voltage = value * (3.3 / 4095.0);

  Serial.print("{\"status\":\"ok\",\"pin\":");
  Serial.print(pin);
  Serial.print(",\"value\":");
  Serial.print(value);
  Serial.print(",\"voltage\":");
  Serial.print(voltage, 2);
  Serial.println("}");
}

void handleGetInfo() {
  Serial.print("{\"status\":\"ok\",");
  Serial.print("\"device\":\"ESP32-S3\",");
  Serial.print("\"firmware\":\"1.0.0\",");
  Serial.print("\"uptime_ms\":");
  Serial.print(millis());
  Serial.println("}");
}
```

### Board Configuration

**Arduino IDE:**
1. Install ESP32 board package: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. Select: Tools > Board > ESP32S3 Dev Module
3. Set: Tools > USB CDC On Boot > Enabled
4. Set: Tools > Upload Speed > 115200

**PlatformIO:**
```ini
[env:esp32-s3-devkitm-1]
platform = espressif32
board = esp32-s3-devkitm-1
framework = arduino
lib_deps =
    bblanchon/ArduinoJson@^6.21.3
monitor_speed = 115200
```

---

## Implementation Checklist

### Phase 1: System Artifacts (Day 1)
- [ ] Create `llmos-lite/volumes/system/tools/hardware-serial.md`
- [ ] Create `llmos-lite/volumes/system/agents/HardwareControlAgent.md`
- [ ] Create `llmos-lite/volumes/system/skills/esp32-json-protocol.md`
- [ ] Verify files are copied to `public/system/` during build

### Phase 2: Runtime Core (Days 2-3)
- [ ] Create `llmos-lite/ui/lib/hardware/` directory
- [ ] Implement `serial-manager.ts`
- [ ] Implement `device-cron-handler.ts`
- [ ] Test SerialManager with mock device

### Phase 3: Tool Integration (Day 4)
- [ ] Add `ConnectDeviceTool` to `system-tools.ts`
- [ ] Add `SendDeviceCommandTool` to `system-tools.ts`
- [ ] Add `CreateDeviceProjectTool` to `system-tools.ts`
- [ ] Add `ListDevicesTool` to `system-tools.ts`
- [ ] Update `getSystemTools()` export

### Phase 4: Cron Integration (Day 5)
- [ ] Register device cron in `device-cron-handler.ts`
- [ ] Test periodic polling
- [ ] Verify state file updates
- [ ] Check telemetry logging

### Phase 5: ESP32 Firmware (Day 6)
- [ ] Flash minimal firmware to ESP32-S3
- [ ] Test GPIO commands
- [ ] Test ADC reading
- [ ] Add INA219 sensor support (if hardware available)

### Phase 6: End-to-End Testing (Day 7)
- [ ] Connect ESP32 via browser
- [ ] Send commands via SystemAgent
- [ ] Create device project
- [ ] Verify cron polling
- [ ] Check state persistence after page refresh
- [ ] Generate device control applet

---

## Testing & Validation

### Test Plan

#### 1. Web Serial API Test
```typescript
// In browser console
import { SerialManager } from './lib/hardware/serial-manager';

// Connect
const deviceId = await SerialManager.connect();
console.log('Connected:', deviceId);

// Send command
const response = await SerialManager.sendCommand(deviceId, {
  action: 'get_info'
});
console.log('Response:', response);

// Disconnect
await SerialManager.disconnect(deviceId);
```

#### 2. Tool Execution Test
```typescript
// Via SystemAgent
const result = await executeSystemTool('connect-device', {});
console.log('Device ID:', result.deviceId);

const cmdResult = await executeSystemTool('send-device-command', {
  deviceId: result.deviceId,
  command: { action: 'set_gpio', pin: 2, state: 1 }
});
console.log('GPIO set:', cmdResult);
```

#### 3. Device Project Test
```typescript
// Create project
const project = await executeSystemTool('create-device-project', {
  projectName: 'test-bench',
  deviceId: 'device-abc123',
  pollInterval: 2000
});

// Check VFS
const vfs = getVFS();
const config = vfs.readFile('projects/test-bench/device.config.json');
console.log('Project config:', config);

// Wait 5s
await new Promise(r => setTimeout(r, 5000));

// Check state
const sensors = vfs.readFile('projects/test-bench/state/sensors.json');
console.log('Sensor data:', sensors);
```

#### 4. Cron Polling Test
- Create device project
- Wait 10 seconds
- Check state files updated
- Verify telemetry log created
- Disconnect device
- Check connection.json shows disconnected

### Expected Behaviors

**Success Cases:**
- ✅ Browser shows device picker when connecting
- ✅ Device responds to commands within 1s
- ✅ State files update every poll cycle
- ✅ Telemetry logs grow over time
- ✅ Reconnect after USB unplug/replug
- ✅ State persists after page refresh

**Error Cases:**
- ❌ Device not selected → Clear error message
- ❌ Command timeout → Retry or report failure
- ❌ Invalid JSON → Log warning, continue
- ❌ Device disconnected → Update connection.json
- ❌ HTTPS required → Show security warning

---

## Future Enhancements

### v0.2 Features
- WiFi connectivity (ESP32 as web server)
- Bluetooth support
- Multi-device dashboards
- Custom protocol definitions
- Device firmware OTA updates

### v0.3 Features
- Device marketplace (share device configs)
- Team device sharing
- Real-time collaboration on shared devices
- Historical data analysis tools
- Alert/notification system

---

## Troubleshooting

### Common Issues

**"Web Serial API not supported"**
- Solution: Use Chrome/Edge 89+, ensure HTTPS or localhost

**"No device selected"**
- Solution: User cancelled picker, prompt again

**"Command timeout"**
- Solution: Check device firmware running, increase timeout

**"JSON parse error"**
- Solution: Check firmware uses `\n` terminator, validate JSON

**"Device disconnected"**
- Solution: Check USB cable, verify device power

**Cron not polling**
- Solution: Check cron enabled, verify interval > 0, check device connected

---

## Conclusion

This implementation provides:
1. ✅ **System-level artifacts** - Reusable tools/agents/skills
2. ✅ **Device-as-project model** - Persistent state in VFS
3. ✅ **Cron polling** - Real-time monitoring without user action
4. ✅ **Web Serial integration** - Direct browser-to-hardware
5. ✅ **Collaborator separation** - Firmware dev independent of web layer

**Ready for v0.1 release in 7 days.**

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-01
**Author:** LLMos Development Team
