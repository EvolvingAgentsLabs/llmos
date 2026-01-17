---
name: esp32-wasm-native-api
category: coding
description: API Reference for ESP32 WASMachine Native Extensions
keywords: [api, mqtt, wifi, rainmaker, lvgl, http]
version: 1.0.0
---

# ESP32 WASMachine Native API Reference

## Overview

The WASMachine runtime provides native function extensions that expose ESP32-specific features to WebAssembly applications. These functions are implemented in the firmware and callable from your C code.

**Important:** Do NOT use standard socket APIs. The native extensions provide higher-level, ESP32-optimized interfaces for networking and cloud services.

---

## MQTT (Message Queue Telemetry Transport)

Native MQTT client for pub/sub messaging. Ideal for IoT telemetry and command/control.

### API Functions

#### `wasm_mqtt_init`
Initialize MQTT client and connect to broker.

```c
// Function signature (conceptual - actual implementation in firmware)
int wasm_mqtt_init(const char *broker_uri, const char *client_id);

// Usage example
int handle = wasm_mqtt_init("mqtt://broker.hivemq.com:1883", "esp32-device-001");
if (handle < 0) {
    printf("MQTT init failed\n");
    return 1;
}
```

**Parameters:**
- `broker_uri`: MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`)
- `client_id`: Unique client identifier

**Returns:** MQTT handle (>= 0 on success, < 0 on error)

#### `wasm_mqtt_publish`
Publish message to topic.

```c
int wasm_mqtt_publish(int handle, const char *topic, const char *data, int len, int qos);

// Usage example
char *payload = "{\"temperature\":23.5}";
wasm_mqtt_publish(handle, "sensors/temp", payload, strlen(payload), 1);
```

**Parameters:**
- `handle`: MQTT handle from `wasm_mqtt_init`
- `topic`: Topic string (e.g., `"sensors/temperature"`)
- `data`: Payload bytes
- `len`: Payload length
- `qos`: Quality of Service (0, 1, or 2)

**Returns:** 0 on success, < 0 on error

#### `wasm_mqtt_subscribe`
Subscribe to topic and receive messages.

```c
int wasm_mqtt_subscribe(int handle, const char *topic, int qos);

// Usage example
wasm_mqtt_subscribe(handle, "commands/#", 1);
```

**Parameters:**
- `handle`: MQTT handle
- `topic`: Topic filter (supports wildcards: `+` and `#`)
- `qos`: Quality of Service

**Returns:** 0 on success, < 0 on error

#### `wasm_mqtt_receive`
Read received message (non-blocking).

```c
int wasm_mqtt_receive(int handle, char *topic_out, char *data_out, int max_len);

// Usage example
char topic[128];
char data[256];
int len = wasm_mqtt_receive(handle, topic, data, sizeof(data));
if (len > 0) {
    printf("Received on %s: %.*s\n", topic, len, data);
}
```

**Parameters:**
- `handle`: MQTT handle
- `topic_out`: Buffer to store received topic
- `data_out`: Buffer to store payload
- `max_len`: Maximum bytes to read

**Returns:** Bytes received (> 0), 0 if no message, < 0 on error

#### `wasm_mqtt_disconnect`
Disconnect and cleanup.

```c
void wasm_mqtt_disconnect(int handle);
```

### Complete MQTT Example

```c
#include <stdio.h>
#include <string.h>
#include <unistd.h>

// Native MQTT API (provided by WASMachine)
extern int wasm_mqtt_init(const char *broker_uri, const char *client_id);
extern int wasm_mqtt_publish(int handle, const char *topic, const char *data, int len, int qos);
extern int wasm_mqtt_subscribe(int handle, const char *topic, int qos);
extern int wasm_mqtt_receive(int handle, char *topic_out, char *data_out, int max_len);
extern void wasm_mqtt_disconnect(int handle);

int main() {
    // Connect to MQTT broker
    int mqtt = wasm_mqtt_init("mqtt://192.168.1.100:1883", "esp32-sensor");
    if (mqtt < 0) {
        printf("Failed to connect to MQTT broker\n");
        return 1;
    }

    // Subscribe to commands topic
    wasm_mqtt_subscribe(mqtt, "device/commands", 1);

    int counter = 0;
    char topic[128];
    char data[256];

    while (1) {
        // Publish telemetry every 10 seconds
        if (counter % 10 == 0) {
            float temp = read_temperature(); // Your sensor function
            snprintf(data, sizeof(data), "{\"temp\":%.2f,\"uptime\":%d}", temp, counter);
            wasm_mqtt_publish(mqtt, "device/telemetry", data, strlen(data), 1);
        }

        // Check for incoming commands
        int len = wasm_mqtt_receive(mqtt, topic, data, sizeof(data));
        if (len > 0) {
            printf("Command received: %.*s\n", len, data);
            // Handle command...
        }

        sleep(1);
        counter++;
    }

    wasm_mqtt_disconnect(mqtt);
    return 0;
}
```

---

## ESP RainMaker (AWS IoT Cloud)

ESP RainMaker is Espressif's cloud platform for smart home devices. It integrates with Alexa and Google Home.

### API Functions

#### `rmaker_node_init`
Initialize RainMaker node.

```c
int rmaker_node_init(const char *node_name, const char *node_type);

// Usage example
int node = rmaker_node_init("Smart Light", "esp.node.light");
```

**Parameters:**
- `node_name`: Human-readable node name
- `node_type`: Node type identifier (e.g., `esp.node.light`, `esp.node.switch`)

**Returns:** Node handle

#### `rmaker_device_create`
Create device within node.

```c
int rmaker_device_create(int node, const char *device_name, const char *device_type);

// Usage example
int device = rmaker_device_create(node, "Living Room Light", "esp.device.light");
```

**Parameters:**
- `node`: Node handle
- `device_name`: Device name
- `device_type`: Device type (e.g., `esp.device.light`, `esp.device.switch`)

**Returns:** Device handle

#### `rmaker_param_create`
Create controllable parameter.

```c
int rmaker_param_create(int device, const char *param_name, const char *param_type,
                        const char *data_type, int value, int properties);

// Usage example
// Create "Power" parameter (boolean, read-write)
rmaker_param_create(device, "Power", "esp.param.power", "bool", 0,
                    PROP_FLAG_READ | PROP_FLAG_WRITE);
```

**Parameters:**
- `device`: Device handle
- `param_name`: Parameter name (e.g., "Power", "Brightness")
- `param_type`: Parameter type (e.g., `esp.param.power`, `esp.param.brightness`)
- `data_type`: Data type (`"bool"`, `"int"`, `"float"`, `"string"`)
- `value`: Initial value
- `properties`: Flags (e.g., `PROP_FLAG_READ | PROP_FLAG_WRITE`)

**Returns:** 0 on success

#### `rmaker_param_update`
Update parameter value (triggers cloud sync).

```c
int rmaker_param_update(int device, const char *param_name, int value);

// Usage example
rmaker_param_update(device, "Power", 1); // Turn on
```

#### `rmaker_start`
Start RainMaker agent (cloud connection).

```c
int rmaker_start(int node);
```

### RainMaker Example (Smart Switch)

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

// RainMaker Native API
extern int rmaker_node_init(const char *node_name, const char *node_type);
extern int rmaker_device_create(int node, const char *device_name, const char *device_type);
extern int rmaker_param_create(int device, const char *param_name, const char *param_type,
                                const char *data_type, int value, int properties);
extern int rmaker_param_update(int device, const char *param_name, int value);
extern int rmaker_start(int node);

// GPIO control
#define GPIO_DEV "/dev/gpio"
#define GPIO_CMD_SET_DIRECTION 0x1001
#define GPIO_CMD_SET_LEVEL 0x1002

typedef struct {
    int pin;
    int value;
} gpio_config_t;

int relay_state = 0;

int main() {
    // Initialize GPIO for relay control
    int gpio_fd = open(GPIO_DEV, O_RDWR);
    gpio_config_t config = {.pin = 4, .value = 1}; // OUTPUT
    ioctl(gpio_fd, GPIO_CMD_SET_DIRECTION, &config);

    // Initialize RainMaker node
    int node = rmaker_node_init("Smart Switch", "esp.node.switch");

    // Create device
    int device = rmaker_device_create(node, "Living Room Switch", "esp.device.switch");

    // Create "Power" parameter (boolean, read-write)
    rmaker_param_create(device, "Power", "esp.param.power", "bool", 0,
                        PROP_FLAG_READ | PROP_FLAG_WRITE);

    // Start RainMaker (connects to cloud)
    rmaker_start(node);

    printf("RainMaker device started. Now controllable via app/Alexa/Google Home.\n");

    while (1) {
        // Poll for parameter changes from cloud
        // (Actual implementation would have callback mechanism)

        // For demonstration, toggle every 10 seconds
        relay_state = !relay_state;

        // Update GPIO
        config.pin = 4;
        config.value = relay_state;
        ioctl(gpio_fd, GPIO_CMD_SET_LEVEL, &config);

        // Sync state to cloud
        rmaker_param_update(device, "Power", relay_state);

        printf("Switch %s\n", relay_state ? "ON" : "OFF");
        sleep(10);
    }

    close(gpio_fd);
    return 0;
}
```

---

## LVGL (Graphics Library)

If the WASMachine firmware includes LVGL support, you can create UI elements on connected displays.

### API Functions

LVGL functions are wrapped and callable directly:

```c
// Native LVGL functions (simplified signatures)
extern void* lv_obj_create(void *parent);
extern void* lv_label_create(void *parent);
extern void lv_label_set_text(void *label, const char *text);
extern void* lv_scr_act(void);
extern void lv_obj_align(void *obj, int align, int x_ofs, int y_ofs);
```

### LVGL Example (Display Sensor Data)

```c
#include <stdio.h>
#include <unistd.h>

// LVGL Native API
extern void* lv_scr_act(void);
extern void* lv_label_create(void *parent);
extern void lv_label_set_text(void *label, const char *text);
extern void lv_obj_align(void *obj, int align, int x_ofs, int y_ofs);

#define LV_ALIGN_CENTER 0

int main() {
    // Get screen object
    void *screen = lv_scr_act();

    // Create label
    void *label = lv_label_create(screen);
    lv_obj_align(label, LV_ALIGN_CENTER, 0, 0);

    int counter = 0;
    char buffer[64];

    while (1) {
        float temp = read_temperature(); // Your sensor function

        snprintf(buffer, sizeof(buffer), "Temperature: %.1f C\nUptime: %d s", temp, counter);
        lv_label_set_text(label, buffer);

        sleep(1);
        counter++;
    }

    return 0;
}
```

---

## WiFi Management

Native WiFi control (if your firmware requires manual WiFi setup).

### API Functions

```c
extern int wifi_connect(const char *ssid, const char *password);
extern int wifi_disconnect(void);
extern int wifi_get_status(void);
extern int wifi_get_ip(char *ip_out, int max_len);
```

### WiFi Example

```c
#include <stdio.h>
#include <unistd.h>

extern int wifi_connect(const char *ssid, const char *password);
extern int wifi_get_status(void);
extern int wifi_get_ip(char *ip_out, int max_len);

#define WIFI_CONNECTED 3

int main() {
    printf("Connecting to WiFi...\n");

    int ret = wifi_connect("MyHomeWiFi", "password123");
    if (ret < 0) {
        printf("WiFi connection failed\n");
        return 1;
    }

    // Wait for connection
    while (wifi_get_status() != WIFI_CONNECTED) {
        printf("Waiting for WiFi...\n");
        sleep(1);
    }

    char ip[16];
    wifi_get_ip(ip, sizeof(ip));
    printf("Connected! IP: %s\n", ip);

    // Now MQTT/HTTP/RainMaker will work
    return 0;
}
```

---

## HTTP Client

Simple HTTP requests (if supported by firmware).

### API Functions

```c
extern int http_get(const char *url, char *response_out, int max_len);
extern int http_post(const char *url, const char *data, int data_len, char *response_out, int max_len);
```

### HTTP Example

```c
#include <stdio.h>
#include <string.h>

extern int http_get(const char *url, char *response_out, int max_len);
extern int http_post(const char *url, const char *data, int data_len, char *response_out, int max_len);

int main() {
    char response[1024];

    // GET request
    int len = http_get("http://api.weather.com/temp?city=SF", response, sizeof(response));
    if (len > 0) {
        printf("Response: %.*s\n", len, response);
    }

    // POST request
    char *payload = "{\"sensor\":\"temp\",\"value\":23.5}";
    len = http_post("http://192.168.1.100/api/data", payload, strlen(payload), response, sizeof(response));
    if (len > 0) {
        printf("Server response: %.*s\n", len, response);
    }

    return 0;
}
```

---

## System Functions

Additional utility functions.

### Time

```c
#include <time.h>

// Standard POSIX time functions
time_t now = time(NULL);
struct tm *timeinfo = localtime(&now);
printf("Current time: %s", asctime(timeinfo));
```

### Sleep

```c
#include <unistd.h>

sleep(5);        // Sleep 5 seconds
usleep(500000);  // Sleep 500 milliseconds
```

### Random Numbers

```c
#include <stdlib.h>
#include <time.h>

srand(time(NULL)); // Seed RNG
int random_value = rand() % 100; // Random 0-99
```

---

## Important Notes

### Function Availability

Not all native functions may be available in every WASMachine firmware build. Check your firmware's configuration:

```c
// Safe way to check if function exists
#ifdef WASM_HAS_MQTT
    int mqtt = wasm_mqtt_init(...);
#else
    printf("MQTT not available in this firmware\n");
#endif
```

### Error Handling

Always check return values:

```c
int handle = wasm_mqtt_init(broker, client_id);
if (handle < 0) {
    printf("ERROR: MQTT init failed with code %d\n", handle);
    return 1;
}
```

### Memory Constraints

Native functions may allocate memory internally. Keep heap size adequate:

```javascript
// When deploying, allocate enough heap
await executeSystemTool('deploy-wasm-app', {
  sourceCode: myCode,
  appName: 'mqtt-app',
  deviceIp: '192.168.1.100',
  heapSize: 32768  // 32KB for MQTT buffers
});
```

---

## Summary Table

| Feature | Functions | Use Case |
|---------|-----------|----------|
| **MQTT** | `wasm_mqtt_*` | Telemetry, pub/sub messaging |
| **RainMaker** | `rmaker_*` | Smart home, Alexa/Google integration |
| **LVGL** | `lv_*` | Display UI on connected screens |
| **WiFi** | `wifi_*` | Network connectivity |
| **HTTP** | `http_*` | REST API calls |
| **System** | `sleep`, `time`, `rand` | General utilities |

---

## Next Steps

1. **Choose networking method:** MQTT for IoT, RainMaker for smart home, HTTP for web APIs
2. **Write C code:** Combine hardware access (VFS) with native APIs
3. **Deploy with adequate heap:** Networking requires more memory (16-32KB)
4. **Test incrementally:** Start with simple functions before complex integrations

For hardware access patterns, see `esp32-wasm-development.md`.

---

**Remember:** These native functions are **only available in WASMachine firmware**. They will NOT work in the JSON protocol mode. Use the `deploy-wasm-app` tool to compile and deploy applications that use these APIs.
