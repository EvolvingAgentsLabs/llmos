---
name: hal_move_to
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_move_to

Move to a 3D position (for mobile platforms or arms).

## Description

High-level navigation command that moves the robot to a specified position. The HAL handles path planning and obstacle avoidance internally.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| x | number | yes | -10 to 10 | X coordinate in meters |
| y | number | yes | -10 to 10 | Y coordinate in meters |
| z | number | yes | 0 to 2 | Z coordinate in meters |
| speed | number | no | 0-100 | Movement speed percentage |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "x": {"type": "number", "description": "X coordinate in meters"},
    "y": {"type": "number", "description": "Y coordinate in meters"},
    "z": {"type": "number", "description": "Z coordinate in meters"},
    "speed": {"type": "number", "description": "Movement speed (0-100%)"}
  },
  "required": ["x", "y", "z"]
}
```

## Coordinate System

- **X**: Left/Right (positive = right)
- **Y**: Up/Down (positive = up)
- **Z**: Forward/Back (positive = forward)
- Origin: Robot's starting position

## Behavior

1. Calculate path to target
2. Check for obstacles
3. Begin movement at specified speed
4. Continuously adjust for obstacles
5. Stop when target reached (±5cm tolerance)

## Return Value

```json
{
  "success": true,
  "final_position": {"x": 1.0, "y": 0.0, "z": 2.0},
  "distance_traveled": 2.24,
  "time_ms": 4500
}
```

## Examples

### Move forward 1 meter
```json
{"name": "hal_move_to", "args": {"x": 0, "y": 0, "z": 1.0}}
```

### Move to position at half speed
```json
{"name": "hal_move_to", "args": {"x": 1.5, "y": 0, "z": 2.0, "speed": 50}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
