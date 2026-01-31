---
name: hal_emergency_stop
type: hal_tool
category: safety
version: 1.0.0
safety_critical: true
priority: highest
---

# HAL Tool: hal_emergency_stop

Immediately stop all robot motion (safety).

## Description

Emergency stop that immediately halts ALL robot motion and enters a safe state. This is a hard stop that requires explicit reset before normal operation can resume.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| reason | string | no | Reason for emergency stop (logged) |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "reason": {"type": "string", "description": "Reason for emergency stop"}
  }
}
```

## Behavior

When triggered:
1. **Immediate motor stop** - All PWM set to 0
2. **Arm retraction** - If arm extended, retract to safe position
3. **Emergency state** - Robot enters locked state
4. **LED alert** - Red blinking pattern
5. **Log event** - Reason and sensor state recorded

## Differences from hal_stop

| Aspect | hal_stop | hal_emergency_stop |
|--------|----------|-------------------|
| Motor behavior | Coast to stop | Immediate brake |
| State after | Ready | Locked (requires reset) |
| LED | Unchanged | Red blinking |
| Logging | Minimal | Full state capture |
| Use case | Normal stops | Safety situations |

## When to Use

- Imminent collision detected
- Unexpected obstacle
- Sensor failure
- Confidence dropped below threshold
- User requested stop
- Any unsafe condition

## Reset Procedure

After emergency stop, robot must be reset:
```json
{"name": "hal_reset_emergency", "args": {}}
```

## Examples

### Emergency stop with reason
```json
{"name": "hal_emergency_stop", "args": {"reason": "Obstacle detected at 5cm"}}
```

### Emergency stop (no reason)
```json
{"name": "hal_emergency_stop", "args": {}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |

## Learning Notes
<!--
Dreaming Engine observations:
- Common emergency stop triggers
- False positive patterns to reduce
- Response time measurements
-->
