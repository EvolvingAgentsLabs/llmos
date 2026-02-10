---
name: hal_move_backward
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_move_backward

Move the robot backward by a specified distance in centimeters.

## Description

Drives the robot in a straight line opposite to its current facing direction. Uses polling-based distance tracking for precision. Includes stuck detection that automatically stops if an obstacle blocks the path.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| distance_cm | number | yes | 1 to 200 | Distance to move backward in centimeters |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "distance_cm": {
      "type": "number",
      "description": "Distance to move backward in centimeters (1-200)"
    }
  },
  "required": ["distance_cm"]
}
```

## Behavior

### Control Strategy

1. Record starting position
2. Drive both wheels backward at PWM -80
3. Poll position every 10ms, calculate Euclidean distance traveled
4. Stop when target distance reached (within 1cm tolerance)
5. Stuck detection: if no movement for 500ms, stop and report obstacle

### Safety Features

- **Stuck detection**: Stops after 500ms of no progress
- **Timeout**: Maximum 10 second execution time
- **Auto-stop**: Motors stopped on completion, obstacle, or timeout

## Examples

### Back up 20 centimeters
```json
{"name": "hal_move_backward", "args": {"distance_cm": 20}}
```

### Small retreat (5cm)
```json
{"name": "hal_move_backward", "args": {"distance_cm": 5}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-02-10 | Initial definition with stuck detection | Created |

## Learning Notes
<!--
Dreaming Engine observations will be appended here:
- Backward movement accuracy
- Rear obstacle detection behavior
-->
