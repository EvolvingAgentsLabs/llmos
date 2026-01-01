# Virtual ESP32 Device - Implementation Guide

**Branch:** real-world-alpha-v01
**Date:** 2026-01-01
**Status:** ✅ COMPLETE - Ready for Testing

---

## What Is This?

The Virtual ESP32 Device is a TypeScript-based emulator that simulates the JSON protocol of a physical ESP32-S3 microcontroller. It allows you to:

- **Develop without hardware** - Test ESP32 integration immediately
- **Simulate realistic behavior** - ADC values with noise, GPIO state, I2C sensors
- **Test edge cases** - Inject custom sensor data, adjust latency
- **Unblock development** - No waiting for physical device shipment

---

## Implementation Summary

### Files Created/Modified

| File | Status | Purpose |
|------|--------|---------|
| `ui/lib/hardware/virtual-esp32.ts` | ✅ Created | VirtualESP32 class with full protocol simulation |
| `ui/lib/hardware/serial-manager.ts` | ✅ Modified | Added `connectVirtual()` and virtual device handling |
| `ui/lib/system-tools.ts` | ✅ Modified | Updated ConnectDeviceTool with `useVirtual` parameter |
| `HARDWARE_QUICKSTART.md` | ✅ Updated | Added virtual device testing examples |

---

## How It Works

### Architecture

```
User Request: "Connect to virtual ESP32"
    ↓
SystemAgent (LLM)
    ↓
ConnectDeviceTool (useVirtual: true)
    ↓
SerialManager.connectVirtual()
    ↓
VirtualESP32 instance created
    ↓
User sends commands via send-device-command
    ↓
VirtualESP32.processCommand()
    ↓
Simulated response (50ms delay)
```

### Virtual vs Physical Device Flow

**Virtual Device:**
- No browser picker
- No Web Serial API required
- Instant connection
- Simulated 50ms latency
- Perfect for development/testing

**Physical Device:**
- Browser device picker (Web Serial API)
- Requires Chrome/Edge 89+ on HTTPS/localhost
- Real hardware connection
- Real latency + USB overhead
- Required for production use

---

## Supported Commands

The virtual device implements the full ESP32 JSON protocol:

### 1. Get Device Info

**Command:**
```json
{"action": "get_info"}
```

**Response:**
```json
{
  "status": "ok",
  "device": "ESP32-S3-Virtual",
  "firmware": "1.0.0-virtual",
  "uptime_ms": 12345,
  "uptime_s": 12,
  "chip": "ESP32-S3",
  "cpu_freq_mhz": 240,
  "flash_size_mb": 8,
  "free_heap_kb": 220,
  "virtual": true
}
```

### 2. GPIO Control

**Set GPIO:**
```json
{"action": "set_gpio", "pin": 2, "state": 1}
```

**Response:**
```json
{"status": "ok", "msg": "GPIO set", "pin": 2, "state": 1}
```

**Read GPIO:**
```json
{"action": "read_gpio", "pin": 2}
```

**Response:**
```json
{"status": "ok", "pin": 2, "state": 1, "mode": "OUTPUT"}
```

### 3. ADC (Analog Sensors)

**Command:**
```json
{"action": "read_adc", "pin": 1}
```

**Response:**
```json
{"status": "ok", "pin": 1, "value": 2048, "voltage": 1.650}
```

**Note:** ADC values include realistic noise (+/- 100 counts per reading)

### 4. I2C Sensors

**Command:**
```json
{"action": "read_i2c", "sensor": "ina219"}
```

**Response:**
```json
{
  "status": "ok",
  "sensor": "ina219",
  "data": {
    "voltage_v": 5.02,
    "current_ma": 123.5,
    "power_mw": 620.0
  }
}
```

**Pre-configured sensors:**
- `ina219` - Power monitor (voltage, current, power)

### 5. PWM Control

**Command:**
```json
{"action": "set_pwm", "pin": 5, "duty_cycle": 128, "frequency": 5000}
```

**Response:**
```json
{"status": "ok", "msg": "PWM set", "pin": 5, "duty_cycle": 128, "frequency": 5000}
```

### 6. Read All Sensors

**Command:**
```json
{"action": "read_sensors"}
```

**Response:**
```json
{
  "status": "ok",
  "sensors": {
    "ina219": {
      "voltage_v": 5.02,
      "current_ma": 123.5,
      "power_mw": 620.0
    },
    "system": {
      "uptime_s": 42,
      "free_heap_kb": 205,
      "cpu_temp_c": 58
    }
  }
}
```

---

## Usage Examples

### Example 1: Quick Test via SystemAgent

**User:** "Connect to a virtual ESP32 and turn on the LED on pin 2"

**SystemAgent workflow:**
1. Uses `connect-device` tool with `useVirtual: true`
2. Receives `deviceId: "virtual-1234567-abc123"`
3. Uses `send-device-command` with `{"action":"set_gpio","pin":2,"state":1}`
4. Reports success to user

### Example 2: Direct Tool Usage (Console)

```javascript
import { executeSystemTool } from './lib/system-tools';

// Connect virtual device
const connectResult = await executeSystemTool('connect-device', {
  useVirtual: true,
  deviceName: 'TestBench-1'
});
console.log('Connected:', connectResult.deviceId);

// Get device info
const infoResult = await executeSystemTool('send-device-command', {
  deviceId: connectResult.deviceId,
  command: { action: 'get_info' }
});
console.log('Device:', infoResult.response);

// Read ADC
const adcResult = await executeSystemTool('send-device-command', {
  deviceId: connectResult.deviceId,
  command: { action: 'read_adc', pin: 1 }
});
console.log('ADC Reading:', adcResult.response);
```

### Example 3: Create Device Project with Cron

**User:** "Connect virtual ESP32 and monitor power consumption every second"

**SystemAgent workflow:**
1. Connects virtual device
2. Creates device project: `projects/power-monitor/`
3. Configures cron to poll `{"action":"read_i2c","sensor":"ina219"}` every 1000ms
4. State files auto-update in background

**Project structure:**
```
projects/power-monitor/
├── device.config.json
├── state/
│   ├── connection.json
│   ├── sensors.json        # Updated every 1s
│   └── gpio.json
├── cron/
│   └── poll-device.json
└── output/
    └── telemetry/
        └── 2026-01-01.log  # Growing log file
```

### Example 4: Advanced - Inject Custom Sensor Data

```javascript
import { SerialManager } from './lib/hardware/serial-manager';

// Get virtual device instance
const deviceId = 'virtual-1234567-abc123';
const virtualDevice = SerialManager.virtualDevices.get(deviceId);

// Inject custom sensor data
virtualDevice.setSensorData('ina219', {
  voltage_v: 12.5,
  current_ma: 500.0,
  power_mw: 6250.0
});

// Simulate high latency (timeout testing)
virtualDevice.setResponseDelay(6000); // 6 seconds (will timeout)
```

---

## Key Features

### 1. Realistic Simulation

- **GPIO State Management** - Pins remember their state
- **ADC Noise** - Random variation (+/- 100 counts) simulates real sensors
- **I2C Sensor Drift** - Values change slightly on each read
- **Configurable Latency** - Default 50ms, adjustable for testing

### 2. Error Handling

**Invalid pin numbers:**
```json
{"status": "error", "msg": "Invalid pin number (0-47)"}
```

**Unknown commands:**
```json
{"status": "error", "msg": "Unknown action: invalid_action"}
```

**Missing sensors:**
```json
{"status": "error", "msg": "Sensor 'unknown' not found. Available: ina219"}
```

### 3. State Persistence

- Virtual device state persists across commands
- GPIO pins remain in their last state
- Uptime counter tracks from creation
- ADC values evolve with realistic noise

### 4. Testing Capabilities

- **Inject scenarios** - Custom sensor values
- **Simulate failures** - Increase latency beyond timeout
- **Edge case testing** - Invalid commands, out-of-range values
- **Reset state** - `virtualDevice.reset()` clears all state

---

## Testing the Integration

### Test Sequence 1: Basic Functionality

```bash
# Start dev server
cd llmos-lite/ui
npm run dev
```

**In chat interface:**
```
You: "Connect to a virtual ESP32"
Agent: "Connected to virtual device virtual-123456-abc..."

You: "Get device information"
Agent: "Device: ESP32-S3-Virtual, Firmware: 1.0.0-virtual, Uptime: 5 seconds..."

You: "Turn on pin 2"
Agent: "GPIO pin 2 set to HIGH"

You: "Read the voltage on ADC pin 1"
Agent: "ADC pin 1: 2048 counts = 1.650V"
```

### Test Sequence 2: Device Project

```
You: "Create a device monitoring project called 'test-bench' and poll the virtual device every 2 seconds"
Agent: "Created project at projects/test-bench/ with cron polling..."

[Wait 10 seconds]

You: "Show me the current sensor data"
Agent: [Reads from projects/test-bench/state/sensors.json and displays]
```

### Test Sequence 3: Multiple Devices

```javascript
// Connect multiple virtual devices
const dev1 = await executeSystemTool('connect-device', { useVirtual: true, deviceName: 'Bench1' });
const dev2 = await executeSystemTool('connect-device', { useVirtual: true, deviceName: 'Bench2' });

// List all devices
const devices = await executeSystemTool('list-devices', {});
console.log('Connected devices:', devices.devices);
// Output: 2 devices (1 virtual, 1 physical, or 2 virtual)
```

---

## Advantages Over Alternatives

### vs. Espressif QEMU

| Feature | Virtual ESP32 (This) | QEMU |
|---------|---------------------|------|
| Browser integration | ✅ Direct | ❌ Needs bridge |
| Setup time | ✅ Zero | ❌ Hours |
| Web Serial API | ✅ Native | ❌ WebSocket hack |
| Scenario injection | ✅ Easy | ❌ Complex |
| Latency | ✅ Configurable | ⚠️ Network dependent |

### vs. Wokwi

| Feature | Virtual ESP32 (This) | Wokwi |
|---------|---------------------|------|
| Browser integration | ✅ Direct | ✅ WebAssembly |
| Visual simulation | ❌ No UI | ✅ Full GUI |
| Custom scenarios | ✅ Trivial | ⚠️ Limited |
| Development time | ✅ ~30 min | ⚠️ ~4 hours |
| Best for | v0.1 MVP | v0.2 Feature Complete |

---

## Migration Path

### Phase 1 (Current): Virtual Device
- ✅ Immediate development
- ✅ UI/agent testing
- ✅ Protocol validation
- ✅ Edge case handling

### Phase 2 (Next): Physical Device
- Connect real ESP32-S3 hardware
- Test with actual sensors
- Validate protocol compatibility
- Performance benchmarking

### Phase 3 (Future): Wokwi Integration
- Visual circuit simulation
- Component library (sensors, LEDs, motors)
- Shareable simulation links
- Better for demos/tutorials

---

## Troubleshooting

### Virtual device not responding

**Check device is connected:**
```javascript
import { SerialManager } from './lib/hardware/serial-manager';
console.log(SerialManager.getAllConnections());
```

**Verify deviceId:**
```javascript
const connected = SerialManager.isConnected(deviceId);
console.log('Connected:', connected);
```

### Commands timing out

**Check latency setting:**
```javascript
const virtualDevice = SerialManager.virtualDevices.get(deviceId);
console.log('Response delay:', virtualDevice.responseDelay);

// Reset to default
virtualDevice.setResponseDelay(50);
```

### State not updating

**Reset virtual device:**
```javascript
const virtualDevice = SerialManager.virtualDevices.get(deviceId);
virtualDevice.reset();
```

---

## Development Workflow

### Recommended Development Flow

1. **Develop with virtual device** (this implementation)
   - Instant connection, fast iteration
   - Test all workflows without hardware
   - Validate agent behaviors

2. **Test with physical device** (when hardware arrives)
   - Verify real-world compatibility
   - Measure actual latencies
   - Validate sensor accuracy

3. **Ship with both options**
   - Virtual device for demos/tutorials
   - Physical device for production
   - User chooses via `useVirtual` parameter

---

## API Reference

### VirtualESP32 Class

```typescript
class VirtualESP32 {
  // Process command and return response
  async processCommand(command: DeviceCommand): Promise<DeviceResponse>

  // Adjust response delay (ms)
  setResponseDelay(ms: number): void

  // Inject custom sensor data for testing
  setSensorData(sensor: string, data: any): void

  // Get current GPIO pin state
  getGPIOState(pin: number): VirtualPin | undefined

  // Reset device to initial state
  reset(): void
}
```

### SerialManager Extensions

```typescript
class SerialManagerClass {
  // Connect to virtual device (NEW)
  async connectVirtual(deviceName?: string): Promise<string>

  // Existing methods work with both virtual and physical devices
  async sendCommand(deviceId: string, command: DeviceCommand): Promise<DeviceResponse>
  async disconnect(deviceId: string): Promise<void>
  isConnected(deviceId: string): boolean
}
```

### ConnectDeviceTool Parameters

```typescript
{
  useVirtual?: boolean;   // Use virtual device (default: false)
  deviceName?: string;     // Optional name for virtual device
}
```

---

## Conclusion

The Virtual ESP32 Device enables immediate development and testing of the hardware integration layer without waiting for physical hardware. It provides:

- **Zero setup time** - Works out of the box
- **Full protocol support** - All ESP32 commands implemented
- **Realistic simulation** - ADC noise, sensor drift, latency
- **Testing utilities** - Scenario injection, latency control
- **Production path** - Same tools work with physical device

**Status:** ✅ **READY FOR v0.1 DEVELOPMENT**

**Next Steps:**
1. Start dev server: `npm run dev`
2. Try: "Connect to virtual ESP32"
3. Test all workflows without hardware
4. When hardware arrives, test with `useVirtual: false`

---

**Document Version:** 1.0.0
**Implementation Date:** 2026-01-01
**Branch:** real-world-alpha-v01
