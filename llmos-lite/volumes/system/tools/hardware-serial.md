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
