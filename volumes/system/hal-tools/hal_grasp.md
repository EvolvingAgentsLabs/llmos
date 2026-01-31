---
name: hal_grasp
type: hal_tool
category: manipulation
version: 1.0.0
safety_critical: true
requires_capability: gripper
---

# HAL Tool: hal_grasp

Control gripper/end effector (for manipulation-capable robots).

## Description

Controls the robot's gripper to grasp, hold, or release objects. Only available on robots with manipulation capability.

## Parameters

| Parameter | Type | Required | Range | Description |
|-----------|------|----------|-------|-------------|
| force | number | yes | 0-100 | Grip force percentage |
| mode | string | no | open/close/hold | Grip operation mode |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "force": {
      "type": "number",
      "description": "Grip force percentage (0-100)"
    },
    "mode": {
      "type": "string",
      "enum": ["open", "close", "hold"],
      "description": "Grip mode"
    }
  },
  "required": ["force"]
}
```

## Grip Modes

| Mode | Behavior |
|------|----------|
| open | Release gripper fully |
| close | Close gripper to specified force |
| hold | Maintain current position with force |

## Force Guidelines

| Force | Use Case |
|-------|----------|
| 0-20% | Delicate objects (eggs, plants) |
| 20-50% | Normal objects (cups, tools) |
| 50-80% | Firm grip (heavy items) |
| 80-100% | Maximum grip (emergency hold) |

## Safety Considerations

- Gripper has force feedback to prevent crushing
- Auto-release if force exceeds safe threshold
- Verify object detected before closing

## Examples

### Gentle grasp
```json
{"name": "hal_grasp", "args": {"force": 30, "mode": "close"}}
```

### Release object
```json
{"name": "hal_grasp", "args": {"force": 0, "mode": "open"}}
```

### Hold with medium force
```json
{"name": "hal_grasp", "args": {"force": 50, "mode": "hold"}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |

## Learning Notes
<!--
Dreaming Engine observations:
- Optimal force for different object types
- Slip detection patterns
- Grip position adjustments
-->
