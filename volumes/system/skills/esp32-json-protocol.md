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

#### Read GPIO
**Request:**
```json
{"action":"read_gpio","pin":5}
```

**Response:**
```json
{"status":"ok","pin":5,"state":1}
```

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

## Extensions

Devices can implement custom commands beyond the standard protocol:

```json
{"action":"custom_calibrate","sensor":"ina219","shunt_ohms":0.1}
{"action":"custom_led_pattern","pattern":"blink","interval_ms":500}
```

**Convention:** Prefix custom actions with `custom_` to avoid conflicts.

## Version History

- **v1.0.0** (2026-01-01): Initial protocol specification
  - GPIO control (set/read)
  - ADC reading
  - I2C sensor support (INA219, BME280)
  - System info commands
