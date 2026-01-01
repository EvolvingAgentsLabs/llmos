# ESP32 Hardware Quick Start

## For Developers - Testing the Implementation

### 1. Start the Dev Server

```bash
cd llmos-lite/ui
npm install
npm run dev
```

Open http://localhost:3000

### 2. Test SystemAgent Commands

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

### 3. Check Device State

After monitoring is active:

```
"Show me the current sensor data"
```
→ Reads from `projects/<device-name>/state/sensors.json`

### 4. View Files in VFS

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

- **ESP32_HARDWARE_INTEGRATION.md** - Complete implementation guide
- **IMPLEMENTATION_SUMMARY.md** - Summary of all changes
- **llmos-lite/volumes/system/** - System artifacts (tools, agents, skills)

