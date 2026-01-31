---
name: hal_speak
type: hal_tool
category: communication
version: 1.0.0
safety_critical: false
---

# HAL Tool: hal_speak

Output audio message through robot speaker.

## Description

Converts text to speech and outputs through the robot's speaker. Used for communicating status, alerts, and information to humans.

## Parameters

| Parameter | Type | Required | Values | Description |
|-----------|------|----------|--------|-------------|
| text | string | yes | - | Message to speak |
| urgency | string | no | info/warning/alert | Affects tone and speed |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "text": {"type": "string", "description": "Message to speak"},
    "urgency": {
      "type": "string",
      "enum": ["info", "warning", "alert"],
      "description": "Urgency level affects tone/speed"
    }
  },
  "required": ["text"]
}
```

## Urgency Levels

| Level | Speech Rate | Tone | Use Case |
|-------|-------------|------|----------|
| info | Normal | Neutral | Status updates |
| warning | Slightly faster | Higher pitch | Caution notices |
| alert | Fast | High, urgent | Critical situations |

## Best Practices

- Keep messages short (under 10 words)
- Use clear, simple language
- Avoid technical jargon
- Match urgency to situation

## Examples

### Status announcement
```json
{"name": "hal_speak", "args": {"text": "Task complete"}}
```

### Warning message
```json
{"name": "hal_speak", "args": {"text": "Low battery, returning to charger", "urgency": "warning"}}
```

### Alert
```json
{"name": "hal_speak", "args": {"text": "Obstacle detected, stopping", "urgency": "alert"}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
