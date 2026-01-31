---
name: hal_reset_emergency
type: hal_tool
category: safety
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_reset_emergency

Reset from emergency stop state.

## Description

Clears the emergency stop state and returns the robot to normal operation. Should only be called after the emergency condition has been resolved.

## Parameters

None required.

## Parameter Schema

```json
{
  "type": "object",
  "properties": {}
}
```

## Behavior

When called:
1. Verify sensors show safe conditions
2. Clear emergency state flag
3. Reset LED to normal (green)
4. Enable motor control
5. Log recovery event

## Pre-conditions

Reset will **fail** if:
- Distance sensors show obstacle < 15cm
- Critical hardware fault detected
- Manual override is active

## Examples

### Reset after emergency
```json
{"name": "hal_reset_emergency", "args": {}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
