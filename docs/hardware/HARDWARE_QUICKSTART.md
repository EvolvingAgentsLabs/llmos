# ESP32 Hardware Quick Start

**Last Updated:** January 2026

## For Developers - Testing the Implementation

### 1. Start the Dev Server

```bash
cd llmos
npm install
npm run dev
```

Open http://localhost:3000

### 2. Test with Virtual Device (No Hardware Needed!)

**NEW: You can now test without physical ESP32 hardware!**

**In the chat interface, try:**

```
"Connect to a virtual ESP32 device"
```
→ Instantly connects to simulated device (no browser picker)

```
"Turn on pin 2"
```
→ Virtual device responds: `{"status":"ok","msg":"GPIO set","pin":2,"state":1}`

```
"Read the voltage on ADC pin 1"
```
→ Virtual device simulates sensor: `{"status":"ok","pin":1,"value":2048,"voltage":1.650}`

```
"Monitor the virtual device every 2 seconds"
```
→ Creates device project with cron polling (updates state files automatically)

**Direct tool testing (browser console):**

```javascript
import { executeSystemTool } from './lib/system-tools';

// Connect virtual device
const result = await executeSystemTool('connect-device', { useVirtual: true });
console.log('Device ID:', result.deviceId);

// Send command
const cmdResult = await executeSystemTool('send-device-command', {
  deviceId: result.deviceId,
  command: { action: 'get_info' }
});
console.log('Device info:', cmdResult.response);
```

### 3. Test with Physical Device

**In the chat interface, try:**

```
"Connect to my ESP32 device"
```
→ Browser will show device picker

```
"Turn on pin 2"
```
→ Sends: `{"action":"set_gpio","pin":2,"state":1}`

```
"Read the voltage on ADC pin 1"
```
→ Sends: `{"action":"read_adc","pin":1}`

```
"Monitor the device every 2 seconds"
```
→ Creates device project with cron polling

### 4. Check Device State

After monitoring is active (works for both virtual and physical devices):

```
"Show me the current sensor data"
```
→ Reads from `projects/<device-name>/state/sensors.json`

### 5. View Files in VFS

Open browser devtools console:

```javascript
const vfs = window.__vfs || getVFS();
vfs.listDirectory('projects').directories.forEach(dir => {
  console.log(dir);
  vfs.listDirectory(dir).files.forEach(file => {
    console.log('  ', file.path);
  });
});
```

---

## For Collaborators - ESP32 Firmware

### Minimal Test Firmware

See `ESP32_HARDWARE_INTEGRATION.md` section "Collaborator Firmware Guide" for complete Arduino code.

### Quick Test via Serial Terminal

1. Flash firmware to ESP32-S3
2. Open serial monitor (115200 baud)
3. Send test commands:

```json
{"action":"get_info"}
{"action":"set_gpio","pin":2,"state":1}
{"action":"read_gpio","pin":2}
{"action":"read_adc","pin":1}
```

Expected responses:
```json
{"status":"ok","device":"ESP32-S3",...}
{"status":"ok","msg":"GPIO set"}
{"status":"ok","pin":2,"state":1}
{"status":"ok","pin":1,"value":2048,"voltage":1.65}
```

---

## Complete Documentation

- **docs/hardware/ESP32_COMPLETE_TUTORIAL.md** - Complete implementation guide
- **docs/architecture/WASM4-ROBOT-ARCHITECTURE.md** - Robot4 API specification
- **/volumes/system/** - System artifacts (tools, agents, skills)

