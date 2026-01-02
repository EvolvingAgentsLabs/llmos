# WASM Compilation and Deployment Pipeline Tests

This document contains test cases for the WASMachine hybrid integration.

## Test Environment Setup

### Prerequisites

1. Docker installed (or local wasi-sdk at `/opt/wasi-sdk`)
2. ESP32 WASMachine device with firmware flashed
3. Device connected to same network as development machine
4. Device IP address known (e.g., `192.168.1.100`)

### Test Categories

- **Unit Tests**: Individual component testing
- **Integration Tests**: Full pipeline testing
- **Deployment Tests**: Real device deployment

---

## Unit Tests

### Test 1: Compilation API Status Check

**Purpose**: Verify compile-wasm API is accessible and reports compiler availability.

**Test Code**:
```typescript
// Execute in browser console or test framework
const response = await fetch('/api/compile-wasm', { method: 'GET' });
const result = await response.json();

console.log('Compiler Status:', result);
// Expected: { status: 'ok', compiler: { docker: true/false, localWasiSdk: true/false, ready: true } }
```

**Expected Output**:
```json
{
  "status": "ok",
  "compiler": {
    "docker": true,
    "localWasiSdk": false,
    "ready": true
  },
  "message": "Docker-based compilation ready"
}
```

**Pass Criteria**: `result.compiler.ready === true`

---

### Test 2: Simple C Compilation (Hello World)

**Purpose**: Verify C to WASM compilation works.

**Source Code**:
```c
#include <stdio.h>

int main() {
    printf("Hello from WASM!\n");
    return 0;
}
```

**Test Code**:
```typescript
const sourceCode = `
#include <stdio.h>

int main() {
    printf("Hello from WASM!\\n");
    return 0;
}
`;

const response = await fetch('/api/compile-wasm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: sourceCode,
    name: 'hello',
    optimizationLevel: '3'
  })
});

const result = await response.json();
console.log('Compilation Result:', result);
```

**Expected Output**:
```json
{
  "success": true,
  "name": "hello.wasm",
  "size": 1234,
  "wasmBase64": "AGFzbQEAAAABB...",
  "compilationId": "abc123def456",
  "message": "Compiled successfully: 1234 bytes"
}
```

**Pass Criteria**:
- `result.success === true`
- `result.size > 0`
- `result.wasmBase64` is valid base64 string

---

### Test 3: Compilation Error Handling

**Purpose**: Verify compilation errors are properly reported.

**Source Code** (intentionally broken):
```c
#include <stdio.h>

int main() {
    printf("Missing semicolon")  // ERROR: Missing semicolon
    return 0;
}
```

**Expected Output**:
```json
{
  "success": false,
  "error": "Compilation failed",
  "details": "expected ';' after expression",
  "hint": "Check C code syntax. Common issues: missing semicolons, undefined functions, type errors."
}
```

**Pass Criteria**: `result.success === false` and `result.details` contains error description

---

### Test 4: GPIO Blink Compilation

**Purpose**: Verify hardware access code compiles.

**Source Code**:
```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

#define GPIO_DEV "/dev/gpio"
#define GPIO_CMD_SET_DIRECTION 0x1001
#define GPIO_CMD_SET_LEVEL 0x1002

typedef struct {
    int pin;
    int value;
} gpio_config_t;

int main() {
    int fd = open(GPIO_DEV, O_RDWR);
    if (fd < 0) {
        printf("Failed to open GPIO\\n");
        return 1;
    }

    // Configure GPIO 2 as OUTPUT
    gpio_config_t config = {.pin = 2, .value = 1};
    ioctl(fd, GPIO_CMD_SET_DIRECTION, &config);

    // Blink LED
    for (int i = 0; i < 10; i++) {
        config.value = 1;
        ioctl(fd, GPIO_CMD_SET_LEVEL, &config);
        sleep(1);

        config.value = 0;
        ioctl(fd, GPIO_CMD_SET_LEVEL, &config);
        sleep(1);
    }

    close(fd);
    return 0;
}
```

**Pass Criteria**: Compiles successfully without errors

---

## Integration Tests

### Test 5: TCP Deployer Query (Virtual)

**Purpose**: Verify TCP protocol implementation can handle query requests.

**Note**: This test requires mock TCP server or actual device.

**Test Code**:
```typescript
import { queryWasmApps } from '@/lib/hardware/wasm-deployer';

const config = {
  deviceIp: '192.168.1.100',
  port: 8080
};

const result = await queryWasmApps(config);
console.log('Query Result:', result);
```

**Expected Output** (no apps installed):
```json
{
  "success": true,
  "apps": []
}
```

**Expected Output** (with apps):
```json
{
  "success": true,
  "apps": [
    { "name": "blink", "heap": 8192 },
    { "name": "sensor", "heap": 16384 }
  ]
}
```

**Pass Criteria**: `result.success === true`

---

### Test 6: Full Pipeline Test (Compile + Deploy)

**Purpose**: Test complete workflow from C source to deployed WASM app.

**Prerequisites**: ESP32 device at known IP address

**Test Code**:
```typescript
import { executeSystemTool } from '@/lib/system-tools';

const sourceCode = `
#include <stdio.h>
#include <unistd.h>

int main() {
    for (int i = 0; i < 10; i++) {
        printf("Hello from ESP32 WASM! Count: %d\\n", i);
        sleep(2);
    }
    return 0;
}
`;

const result = await executeSystemTool('deploy-wasm-app', {
  sourceCode,
  appName: 'test-hello',
  deviceIp: '192.168.1.100',
  heapSize: 8192
});

console.log('Deployment Result:', result);
```

**Expected Output**:
```json
{
  "success": true,
  "appName": "test-hello",
  "deviceIp": "192.168.1.100",
  "heapSize": 8192,
  "compiledSize": 1456,
  "message": "App \"test-hello\" compiled (1456 bytes) and deployed to 192.168.1.100. Heap: 8192 bytes."
}
```

**Pass Criteria**:
- `result.success === true`
- `result.compiledSize > 0`
- App appears in `query-wasm-apps` results

---

## Deployment Tests (Real Device)

### Test 7: GPIO Blink Deployment

**Purpose**: Deploy and run GPIO blink app on real device.

**Test Steps**:

1. **Deploy**:
```typescript
const blinkCode = `
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

#define GPIO_DEV "/dev/gpio"
#define GPIO_CMD_SET_DIRECTION 0x1001
#define GPIO_CMD_SET_LEVEL 0x1002

typedef struct {
    int pin;
    int value;
} gpio_config_t;

int main() {
    int fd = open(GPIO_DEV, O_RDWR);
    gpio_config_t config = {.pin = 2, .value = 1};
    ioctl(fd, GPIO_CMD_SET_DIRECTION, &config);

    while (1) {
        config.value = 1;
        ioctl(fd, GPIO_CMD_SET_LEVEL, &config);
        sleep(1);
        config.value = 0;
        ioctl(fd, GPIO_CMD_SET_LEVEL, &config);
        sleep(1);
    }
    return 0;
}
`;

const result = await executeSystemTool('deploy-wasm-app', {
  sourceCode: blinkCode,
  appName: 'blink',
  deviceIp: '192.168.1.100',
  heapSize: 8192
});
```

2. **Verify**: LED on GPIO 2 blinks every 1 second

3. **Query**:
```typescript
const apps = await executeSystemTool('query-wasm-apps', {
  deviceIp: '192.168.1.100'
});
// Should show: [{ name: "blink", heap: 8192 }]
```

4. **Uninstall**:
```typescript
const uninstall = await executeSystemTool('uninstall-wasm-app', {
  deviceIp: '192.168.1.100',
  appName: 'blink'
});
```

**Pass Criteria**:
- LED blinks as expected
- App shows in query results
- Uninstall succeeds
- LED stops blinking after uninstall

---

### Test 8: MQTT Publish Deployment

**Purpose**: Test native MQTT API integration.

**Prerequisites**: MQTT broker accessible (e.g., mqtt://test.mosquitto.org:1883)

**Source Code**:
```c
#include <stdio.h>
#include <string.h>
#include <unistd.h>

// Native MQTT API
extern int wasm_mqtt_init(const char *broker_uri, const char *client_id);
extern int wasm_mqtt_publish(int handle, const char *topic, const char *data, int len, int qos);
extern void wasm_mqtt_disconnect(int handle);

int main() {
    int mqtt = wasm_mqtt_init("mqtt://test.mosquitto.org:1883", "esp32-test");
    if (mqtt < 0) {
        printf("MQTT init failed\n");
        return 1;
    }

    for (int i = 0; i < 10; i++) {
        char payload[64];
        snprintf(payload, sizeof(payload), "{\"count\":%d,\"msg\":\"Hello from ESP32 WASM\"}", i);
        wasm_mqtt_publish(mqtt, "esp32/test", payload, strlen(payload), 1);
        printf("Published: %s\n", payload);
        sleep(5);
    }

    wasm_mqtt_disconnect(mqtt);
    return 0;
}
```

**Test Steps**:

1. Deploy app with 16KB heap (MQTT needs more memory)
2. Subscribe to `esp32/test` topic on MQTT broker
3. Verify messages arrive every 5 seconds

**Pass Criteria**:
- Deployment succeeds
- MQTT messages received
- Messages contain correct JSON format

---

## Performance Tests

### Test 9: Binary Size Analysis

**Purpose**: Verify optimization reduces binary size.

**Test Matrix**:

| Source | -O0 (no opt) | -O3 (max opt) | -Oz (size opt) |
|--------|--------------|---------------|----------------|
| Hello World | ~3KB | ~1.5KB | ~1KB |
| GPIO Blink | ~5KB | ~2.5KB | ~2KB |
| MQTT Client | ~15KB | ~8KB | ~6KB |

**Pass Criteria**: `-O3` produces binaries 40-50% smaller than `-O0`

---

### Test 10: Heap Usage Validation

**Purpose**: Verify heap size parameter affects deployment.

**Test Code**:
```typescript
// Deploy with small heap
const small = await executeSystemTool('deploy-wasm-app', {
  sourceCode: simpleCode,
  appName: 'small-heap',
  deviceIp: '192.168.1.100',
  heapSize: 4096  // 4KB
});

// Deploy with large heap
const large = await executeSystemTool('deploy-wasm-app', {
  sourceCode: mqttCode,
  appName: 'large-heap',
  deviceIp: '192.168.1.100',
  heapSize: 32768  // 32KB
});

// Query to verify
const apps = await executeSystemTool('query-wasm-apps', {
  deviceIp: '192.168.1.100'
});
```

**Expected**: Query shows correct heap sizes for each app

---

## Error Handling Tests

### Test 11: Network Failure Handling

**Purpose**: Verify graceful failure when device unreachable.

**Test Code**:
```typescript
const result = await executeSystemTool('deploy-wasm-app', {
  sourceCode: simpleCode,
  appName: 'test',
  deviceIp: '192.168.1.999',  // Invalid IP
  heapSize: 8192
});
```

**Expected Output**:
```json
{
  "success": false,
  "error": "Deployment failed",
  "details": "Socket error: ETIMEDOUT",
  "compiledSize": 1234
}
```

**Pass Criteria**: Compilation succeeds, deployment fails gracefully

---

### Test 12: Device Memory Exhaustion

**Purpose**: Test behavior when heap allocation too large.

**Test Code**:
```typescript
const result = await executeSystemTool('deploy-wasm-app', {
  sourceCode: simpleCode,
  appName: 'huge-heap',
  deviceIp: '192.168.1.100',
  heapSize: 1048576  // 1MB (too large for ESP32)
});
```

**Expected**: Deployment fails with heap allocation error

---

## Regression Tests

### Test 13: Multiple App Coexistence

**Purpose**: Verify multiple WASM apps can run simultaneously.

**Test Steps**:

1. Deploy app1 (blink)
2. Deploy app2 (mqtt-publisher)
3. Deploy app3 (sensor-reader)
4. Query apps (should show all 3)
5. Verify all apps running
6. Uninstall all

**Pass Criteria**: All apps install, run, and uninstall without conflicts

---

## Test Execution Checklist

- [ ] Test 1: Compilation API Status
- [ ] Test 2: Simple C Compilation
- [ ] Test 3: Compilation Error Handling
- [ ] Test 4: GPIO Code Compilation
- [ ] Test 5: TCP Query
- [ ] Test 6: Full Pipeline
- [ ] Test 7: GPIO Blink Deployment
- [ ] Test 8: MQTT Deployment
- [ ] Test 9: Binary Size Analysis
- [ ] Test 10: Heap Usage Validation
- [ ] Test 11: Network Failure Handling
- [ ] Test 12: Memory Exhaustion
- [ ] Test 13: Multiple App Coexistence

---

## Known Limitations

1. **No Browser Testing**: Web Serial API requires HTTPS or localhost
2. **Docker Dependency**: Compilation requires Docker or local wasi-sdk
3. **Device Firmware**: Tests assume WASMachine firmware v1.0+
4. **Network Access**: Device must be on same network as development machine
5. **Single Device**: Current implementation doesn't support multi-device deployment

---

## Future Test Additions

- [ ] RainMaker cloud integration tests
- [ ] LVGL graphics display tests
- [ ] WiFi connection management tests
- [ ] HTTP client API tests
- [ ] File system persistence tests
- [ ] Watchdog timer tests
- [ ] Sleep mode / power management tests

---

## Test Report Template

```markdown
### Test Run: [Date]

**Environment**:
- Docker: [Yes/No]
- Device IP: [192.168.x.x]
- Firmware Version: [x.x.x]

**Results**:
| Test | Status | Notes |
|------|--------|-------|
| Test 1 | ✅ PASS | Compiler ready |
| Test 2 | ✅ PASS | 1234 bytes |
| Test 3 | ✅ PASS | Error properly reported |
| ... | ... | ... |

**Issues**:
- None

**Conclusion**: All tests passed ✅
```
