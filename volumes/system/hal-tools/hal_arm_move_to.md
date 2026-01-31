---
name: hal_arm_move_to
type: hal_tool
category: manipulation
version: 1.0.0
safety_critical: true
requires_capability: manipulator_arm
---

# HAL Tool: hal_arm_move_to

Move robot arm to position (for manipulation-capable robots).

## Description

Moves the robot's arm end-effector to a specified 3D position. Only available on robots with arm manipulation capability.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| x | number | yes | -0.5 to 0.5 | X coordinate in meters |
| y | number | yes | 0 to 0.5 | Y coordinate in meters |
| z | number | yes | 0 to 0.5 | Z coordinate in meters |
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

- Origin: Arm base
- **X**: Left/Right
- **Y**: Up/Down
- **Z**: Forward/Back

## Workspace Limits

The arm has a limited workspace. Positions outside the reachable area will return an error.

| Axis | Min | Max |
|------|-----|-----|
| X | -0.5m | 0.5m |
| Y | 0m | 0.5m |
| Z | 0m | 0.5m |

## Safety Considerations

- Collision detection enabled
- Speed limited near workspace boundaries
- Auto-stop if unexpected contact

## Examples

### Move arm forward
```json
{"name": "hal_arm_move_to", "args": {"x": 0, "y": 0.2, "z": 0.3}}
```

### Slow precision movement
```json
{"name": "hal_arm_move_to", "args": {"x": 0.1, "y": 0.15, "z": 0.25, "speed": 20}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
