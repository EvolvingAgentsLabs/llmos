---
name: hal_move_forward
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_move_forward

Move the robot forward by a specified distance in centimeters.

## Description

Drives the robot in a straight line in its current facing direction. Uses polling-based distance tracking for precision. Includes stuck detection that automatically stops the robot if an obstacle blocks its path.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| distance_cm | number | yes | 1 to 200 | Distance to move forward in centimeters |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "distance_cm": {
      "type": "number",
      "description": "Distance to move forward in centimeters (1-200)"
    }
  },
  "required": ["distance_cm"]
}
```

## Behavior

### Control Strategy

1. Record starting position
2. Drive both wheels forward at PWM 80
3. Poll position every 10ms, calculate Euclidean distance traveled
4. Stop when target distance reached (within 1cm tolerance)
5. Stuck detection: if no movement for 500ms, stop and report obstacle

### Safety Features

- **Stuck detection**: Stops after 500ms of no progress (obstacle blocked)
- **Timeout**: Maximum 10 second execution time
- **Auto-stop**: Motors stopped on completion, obstacle, or timeout

## Examples

### Move forward 30 centimeters
```json
{"name": "hal_move_forward", "args": {"distance_cm": 30}}
```

### Short advance (10cm)
```json
{"name": "hal_move_forward", "args": {"distance_cm": 10}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-02-10 | Initial definition with stuck detection | Created |

## Learning Notes
<!--
Dreaming Engine observations will be appended here:
- Distance accuracy on different surfaces
- Speed vs accuracy trade-offs
- Obstacle detection sensitivity tuning
-->
