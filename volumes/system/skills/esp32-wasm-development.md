---
name: esp32-wasm-development
category: electronics
description: Guide for developing WebAssembly applications for ESP32 WASMachine
keywords: [esp32, wasm, c, embedded, wamr, iot]
version: 1.0.0
---

# ESP32 WebAssembly Development

## Overview

The ESP32 WASMachine runs a WebAssembly Micro Runtime (WAMR) that allows you to deploy autonomous C applications compiled to WebAssembly. Unlike the JSON protocol (which requires continuous connection), WASM apps run independently on the device.

**Key Concept:** You write C code, compile it to `.wasm`, deploy it to the ESP32, and it runs autonomously - even when disconnected from LLMos.

## When to Use WASM Mode vs JSON Mode

### Use WASM Mode (Deployment) When:
- ✅ Need autonomous/offline operation
- ✅ Complex logic with state machines
- ✅ MQTT, HTTP, or cloud integration (RainMaker)
- ✅ Production deployment
- ✅ Battery-powered devices (sleep modes)
- ✅ High-frequency operations (< 10ms timing)

### Use JSON Mode (Exploration) When:
- ✅ Quick hardware tests
- ✅ Interactive debugging
- ✅ Learning hardware capabilities
- ✅ Prototyping without compilation

## Standard Library Support

### WASI Libc (Supported)
You can use standard C library functions:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>

// Standard functions available:
printf("Hello from WASM!\n");
void* ptr = malloc(1024);
free(ptr);
sleep(1);
```

### File System
- **Root:** `/storage` (mapped to ESP32 LittleFS)
- **Standard I/O:** `open()`, `read()`, `write()`, `close()`
- **Persistence:** Files survive device reboot

```c
int fd = open("/storage/data.txt", O_WRONLY | O_CREAT, 0644);
write(fd, "sensor data\n", 12);
close(fd);
```

### Networking
**Important:** Standard BSD sockets are **NOT** supported. Use the Native Extension APIs for networking:
- ❌ `socket()`, `connect()`, `send()`, `recv()` - Not available
- ✅ `wasm_mqtt_*()` - Use native MQTT API
- ✅ `wasm_http_*()` - Use native HTTP API (if available)

## Compilation Process

### C to WebAssembly
The WASI SDK clang compiler is used to generate `.wasm` binaries:

```bash
/opt/wasi-sdk/bin/clang \
    -O3 \
    -o output.wasm \
    source.c \
    -Wl,--export=main \
    -Wl,--export=__heap_base \
    -Wl,--export=__data_end \
    -Wl,--no-entry \
    -Wl,--allow-undefined
```

**Flags Explained:**
- `-O3`: Maximum optimization (important for ESP32's limited CPU)
- `--export=main`: Make main() visible to WAMR
- `--no-entry`: No WASI `_start` wrapper (we call `main()` directly)
- `--allow-undefined`: Native functions resolved at runtime

### In LLMos
You don't run this manually. Use the `deploy-wasm-app` tool:

```javascript
await executeSystemTool('deploy-wasm-app', {
  sourceCode: `
    #include <stdio.h>
    int main() {
      printf("Hello from WASM!\\n");
      return 0;
    }
  `,
  appName: 'hello',
  deviceIp: '192.168.1.100'
});
```

## Hardware Access via VFS (Virtual File System)

Hardware peripherals are accessed through special device files using file descriptors and `ioctl()`.

### GPIO Control

```c
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>

// GPIO device file
#define GPIO_DEV "/dev/gpio"

// ioctl commands (these match WASMachine firmware)
#define GPIO_CMD_SET_DIRECTION  0x1001
#define GPIO_CMD_SET_LEVEL      0x1002
#define GPIO_CMD_GET_LEVEL      0x1003

typedef struct {
    int pin;
    int value;
} gpio_config_t;

int main() {
    int fd = open(GPIO_DEV, O_RDWR);
    if (fd < 0) {
        printf("Failed to open GPIO device\n");
        return 1;
    }

    // Configure GPIO 2 as OUTPUT
    gpio_config_t config = {.pin = 2, .value = 1}; // 1 = OUTPUT
    ioctl(fd, GPIO_CMD_SET_DIRECTION, &config);

    // Blink LED
    while (1) {
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

### I2C Communication

```c
#define I2C_DEV "/dev/i2c/0"

#define I2C_CMD_WRITE  0x2001
#define I2C_CMD_READ   0x2002

typedef struct {
    uint8_t addr;
    uint8_t reg;
    uint8_t *data;
    size_t len;
} i2c_transaction_t;

int read_sensor() {
    int fd = open(I2C_DEV, O_RDWR);

    uint8_t buffer[2];
    i2c_transaction_t txn = {
        .addr = 0x40,  // INA219 address
        .reg = 0x02,   // Bus voltage register
        .data = buffer,
        .len = 2
    };

    ioctl(fd, I2C_CMD_READ, &txn);

    int16_t raw = (buffer[0] << 8) | buffer[1];
    float voltage = ((raw >> 3) * 4) / 1000.0;

    close(fd);
    return voltage;
}
```

### SPI Communication

```c
#define SPI_DEV "/dev/spi/0"

#define SPI_CMD_TRANSFER  0x3001

typedef struct {
    uint8_t *tx_data;
    uint8_t *rx_data;
    size_t len;
} spi_transfer_t;

void spi_send_command(uint8_t cmd) {
    int fd = open(SPI_DEV, O_RDWR);

    uint8_t tx[1] = {cmd};
    uint8_t rx[1];

    spi_transfer_t transfer = {
        .tx_data = tx,
        .rx_data = rx,
        .len = 1
    };

    ioctl(fd, SPI_CMD_TRANSFER, &transfer);
    close(fd);
}
```

## Memory Management Best Practices

ESP32 has limited RAM (typically 320KB SRAM). Optimize carefully:

### 1. Stack Size
Default stack is 64KB. Reduce if possible:

```c
// Avoid large stack allocations
void bad() {
    char buffer[10000]; // BAD - wastes stack
}

void good() {
    char *buffer = malloc(10000); // GOOD - uses heap
    // ... use buffer ...
    free(buffer);
}
```

### 2. Heap Size
Configured during app installation (default 8KB):

```javascript
await executeSystemTool('deploy-wasm-app', {
  sourceCode: myCode,
  appName: 'sensor',
  deviceIp: '192.168.1.100',
  heapSize: 16384  // 16KB heap
});
```

### 3. Static Allocation
Use static for persistent data:

```c
// Persists across function calls, doesn't use heap
static uint8_t sensor_readings[100];
static int reading_count = 0;

void log_reading(uint8_t value) {
    if (reading_count < 100) {
        sensor_readings[reading_count++] = value;
    }
}
```

## Common Patterns

### Pattern 1: Periodic Sensor Reading

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

#define I2C_DEV "/dev/i2c/0"
#define I2C_CMD_READ 0x2002

typedef struct {
    uint8_t addr;
    uint8_t reg;
    uint8_t *data;
    size_t len;
} i2c_transaction_t;

int main() {
    int fd = open(I2C_DEV, O_RDWR);

    while (1) {
        // Read temperature sensor
        uint8_t buffer[2];
        i2c_transaction_t txn = {
            .addr = 0x48,  // Temperature sensor address
            .reg = 0x00,   // Temperature register
            .data = buffer,
            .len = 2
        };

        ioctl(fd, I2C_CMD_READ, &txn);

        int16_t raw = (buffer[0] << 8) | buffer[1];
        float temp = raw * 0.0625;

        printf("Temperature: %.2f C\n", temp);

        // Sleep for 60 seconds
        sleep(60);
    }

    close(fd);
    return 0;
}
```

### Pattern 2: Threshold-Based Action

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>

#define GPIO_DEV "/dev/gpio"
#define I2C_DEV "/dev/i2c/0"

#define GPIO_CMD_SET_DIRECTION 0x1001
#define GPIO_CMD_SET_LEVEL 0x1002
#define I2C_CMD_READ 0x2002

typedef struct {
    int pin;
    int value;
} gpio_config_t;

typedef struct {
    uint8_t addr;
    uint8_t reg;
    uint8_t *data;
    size_t len;
} i2c_transaction_t;

int main() {
    int gpio_fd = open(GPIO_DEV, O_RDWR);
    int i2c_fd = open(I2C_DEV, O_RDWR);

    // Configure GPIO 4 as OUTPUT (fan control)
    gpio_config_t config = {.pin = 4, .value = 1};
    ioctl(gpio_fd, GPIO_CMD_SET_DIRECTION, &config);

    const float TEMP_THRESHOLD = 30.0;

    while (1) {
        // Read temperature
        uint8_t buffer[2];
        i2c_transaction_t txn = {
            .addr = 0x48,
            .reg = 0x00,
            .data = buffer,
            .len = 2
        };
        ioctl(i2c_fd, I2C_CMD_READ, &txn);

        int16_t raw = (buffer[0] << 8) | buffer[1];
        float temp = raw * 0.0625;

        // Control fan based on temperature
        if (temp > TEMP_THRESHOLD) {
            config.pin = 4;
            config.value = 1;  // Turn on fan
            ioctl(gpio_fd, GPIO_CMD_SET_LEVEL, &config);
            printf("Fan ON (temp: %.2f C)\n", temp);
        } else {
            config.pin = 4;
            config.value = 0;  // Turn off fan
            ioctl(gpio_fd, GPIO_CMD_SET_LEVEL, &config);
            printf("Fan OFF (temp: %.2f C)\n", temp);
        }

        sleep(5);
    }

    close(gpio_fd);
    close(i2c_fd);
    return 0;
}
```

### Pattern 3: Data Logging to File

```c
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <time.h>

int main() {
    while (1) {
        // Read sensor (simplified)
        float value = read_sensor();

        // Open log file (append mode)
        int fd = open("/storage/sensor.log", O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            char buffer[64];
            time_t now = time(NULL);
            snprintf(buffer, sizeof(buffer), "%ld,%.2f\n", now, value);
            write(fd, buffer, strlen(buffer));
            close(fd);
        }

        sleep(60);
    }

    return 0;
}
```

## Debugging

### Print Debugging
`printf()` output goes to the device's serial console:

```c
printf("Sensor value: %d\n", value);
printf("Error: failed to open device\n");
```

**View output:** Connect serial monitor at 115200 baud, or use `iwasm` command to see output.

### Error Handling

```c
int fd = open("/dev/gpio", O_RDWR);
if (fd < 0) {
    printf("ERROR: Failed to open GPIO device\n");
    return 1;
}

// ... use fd ...

close(fd);
```

### Assertions

```c
#include <assert.h>

void process_data(uint8_t *data) {
    assert(data != NULL);  // Will abort if data is NULL
    // ... process data ...
}
```

## Limitations

### What Works
- ✅ Standard C library (stdio, stdlib, string, etc.)
- ✅ File I/O via `/storage`
- ✅ Hardware access via VFS ioctl
- ✅ Native extensions (MQTT, HTTP, RainMaker)
- ✅ Timer functions (sleep, usleep)

### What Doesn't Work
- ❌ BSD sockets (use native networking APIs instead)
- ❌ Threads (WAMR is single-threaded)
- ❌ Fork/exec
- ❌ Signal handling
- ❌ Dynamic loading of libraries

## Performance Tips

1. **Minimize allocations:** Reuse buffers instead of malloc/free in loops
2. **Use `-O3` compilation:** Already done by default
3. **Avoid floating-point:** ESP32-S3 has FPU, but integer math is faster
4. **Batch I/O:** Read/write multiple bytes at once instead of byte-by-byte
5. **Sleep appropriately:** Use `sleep()` or `usleep()` to save power

## Next Steps

After writing C code:
1. Use `deploy-wasm-app` tool to compile and deploy
2. Monitor serial output for printf debugging
3. Use `query-wasm-apps` tool to verify installation
4. Test with real sensors/actuators
5. Iterate based on device behavior

For networking (MQTT, HTTP, RainMaker), see `esp32-wasm-native-api.md`.

---

**Remember:** WASM apps run autonomously. Once deployed, they continue running even when LLMos disconnects. This is perfect for production IoT devices.
