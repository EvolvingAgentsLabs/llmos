---
name: hal_rotate
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_rotate

Rotate the robot in place by a specified number of degrees.

## Description

Performs a precise in-place rotation (spin) without linear movement. Uses differential drive with opposite wheel directions and polling-based feedback control for accuracy. The robot slows down as it approaches the target angle for precision.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| direction | string | yes | left, right | Rotation direction: left (counter-clockwise) or right (clockwise) |
| degrees | number | yes | 1 to 360 | Degrees to rotate |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "direction": {
      "type": "string",
      "enum": ["left", "right"],
      "description": "Rotation direction: left (counter-clockwise) or right (clockwise)"
    },
    "degrees": {
      "type": "number",
      "description": "Degrees to rotate (1-360)"
    }
  },
  "required": ["direction", "degrees"]
}
```

## Behavior

### Control Strategy

1. Start rotation at full speed (PWM 80)
2. When within 15 degrees of target, switch to slow speed (PWM 45)
3. Stop when within 5 degree tolerance of target
4. Timeout after 10 seconds if target not reached

### Movement Mechanics

| Direction | Left Wheel | Right Wheel | Angular Velocity |
|-----------|-----------|-------------|-----------------|
| right (clockwise) | -80 | +80 | Positive |
| left (counter-clockwise) | +80 | -80 | Negative |

## Safety Considerations

- **Timeout**: Maximum 10 second execution time
- **Auto-stop**: Motors stopped on completion or timeout
- **Tolerance**: ~5 degree accuracy

## Examples

### Rotate right 90 degrees
```json
{"name": "hal_rotate", "args": {"direction": "right", "degrees": 90}}
```

### Rotate left 45 degrees
```json
{"name": "hal_rotate", "args": {"direction": "left", "degrees": 45}}
```

### Full 360 degree spin
```json
{"name": "hal_rotate", "args": {"direction": "right", "degrees": 360}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-02-10 | Initial definition with polling-based control | Created |

## Learning Notes
<!--
Dreaming Engine observations will be appended here:
- Optimal rotation speeds for different angles
- Precision calibration values
- Surface-dependent friction adjustments
-->
