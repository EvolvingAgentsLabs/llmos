---
name: hal_stop
type: hal_tool
category: locomotion
version: 1.0.0
safety_critical: true
---

# HAL Tool: hal_stop

Stop all locomotion immediately.

## Description

Brings the robot to an immediate stop by setting all motor powers to zero. Use this for normal stops. For emergency situations, use `hal_emergency_stop` instead.

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

- Sets left and right motor power to 0
- Clears any active duration timer
- Does NOT trigger emergency state
- Robot can immediately receive new movement commands

## Safety Considerations

- This is a "soft stop" - motors coast to stop
- For immediate brake, use `hal_emergency_stop`
- Always call before precision operations

## Examples

### Stop moving
```json
{"name": "hal_stop", "args": {}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
