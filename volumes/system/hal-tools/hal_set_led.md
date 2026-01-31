---
name: hal_set_led
type: hal_tool
category: communication
version: 1.0.0
safety_critical: false
---

# HAL Tool: hal_set_led

Control robot LED indicators.

## Description

Sets the RGB color and pattern of the robot's status LED. Used for visual communication of robot state to humans.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| r | number | yes | 0-255 | Red intensity |
| g | number | yes | 0-255 | Green intensity |
| b | number | yes | 0-255 | Blue intensity |
| pattern | string | no | solid/blink/pulse | LED animation pattern |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "r": {"type": "number", "description": "Red value (0-255)"},
    "g": {"type": "number", "description": "Green value (0-255)"},
    "b": {"type": "number", "description": "Blue value (0-255)"},
    "pattern": {
      "type": "string",
      "enum": ["solid", "blink", "pulse"],
      "description": "LED pattern"
    }
  },
  "required": ["r", "g", "b"]
}
```

## Standard Color Codes

| Color | RGB | Meaning |
|-------|-----|---------|
| Green | 0, 255, 0 | Ready/Healthy/Success |
| Blue | 0, 0, 255 | Processing/Thinking |
| Cyan | 0, 255, 255 | Active operation |
| Yellow | 255, 255, 0 | Caution/Warning |
| Orange | 255, 128, 0 | Alert/Attention needed |
| Red | 255, 0, 0 | Error/Danger/Stop |
| White | 255, 255, 255 | Task complete |
| Purple | 128, 0, 255 | Learning/Dreaming |

## Pattern Behavior

| Pattern | Behavior |
|---------|----------|
| solid | Constant color |
| blink | On/off every 500ms |
| pulse | Fade in/out smoothly (1s cycle) |

## Examples

### Green ready indicator
```json
{"name": "hal_set_led", "args": {"r": 0, "g": 255, "b": 0}}
```

### Blinking red alert
```json
{"name": "hal_set_led", "args": {"r": 255, "g": 0, "b": 0, "pattern": "blink"}}
```

### Pulsing blue (processing)
```json
{"name": "hal_set_led", "args": {"r": 0, "g": 0, "b": 255, "pattern": "pulse"}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
