---
name: hal_drive
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_drive

Control wheel motors for differential drive locomotion.

## Description

Sets the power level for left and right wheel motors independently, enabling forward/backward movement and turning. This is the primary locomotion command for wheeled robots.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| left | number | yes | -255 to 255 | Left wheel power (negative = reverse) |
| right | number | yes | -255 to 255 | Right wheel power (negative = reverse) |
| duration_ms | number | no | 0 to 10000 | Auto-stop after milliseconds |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "left": {
      "type": "number",
      "description": "Left wheel power (-255 to 255)"
    },
    "right": {
      "type": "number",
      "description": "Right wheel power (-255 to 255)"
    },
    "duration_ms": {
      "type": "number",
      "description": "Optional duration in milliseconds before auto-stop"
    }
  },
  "required": ["left", "right"]
}
```

## Behavior

### Movement Patterns

| Left | Right | Result |
|------|-------|--------|
| 100 | 100 | Forward |
| -100 | -100 | Backward |
| 100 | -100 | Spin right (in place) |
| -100 | 100 | Spin left (in place) |
| 100 | 50 | Curve right |
| 50 | 100 | Curve left |
| 0 | 100 | Pivot right (around left wheel) |

### Motor Deadband

Real motors don't move at very low power:
- PWM < 40: No movement (motor stall)
- PWM 40-80: Slow movement, may be inconsistent
- PWM > 80: Reliable movement

## Safety Considerations

- **Speed near obstacles**: Auto-reduced when distance < 30cm
- **Emergency stop distance**: Blocked when distance < 8cm
- **Maximum duration**: Commands longer than 5000ms are capped
- **Validation**: All values clamped to valid range

## Examples

### Drive forward at half speed
```json
{"name": "hal_drive", "args": {"left": 128, "right": 128}}
```

### Turn right gently
```json
{"name": "hal_drive", "args": {"left": 100, "right": 60}}
```

### Spin in place for 500ms
```json
{"name": "hal_drive", "args": {"left": 80, "right": -80, "duration_ms": 500}}
```

### Back up slowly
```json
{"name": "hal_drive", "args": {"left": -60, "right": -60}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |

## Learning Notes
<!--
Dreaming Engine observations will be appended here:
- Optimal speed ranges for different surfaces
- Turning radius calibrations
- Motor deadband compensation values
-->
