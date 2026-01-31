---
name: hal_vision_scan
type: hal_tool
category: vision
version: 1.0.0
safety_critical: false
---

# HAL Tool: hal_vision_scan

Scan environment and return detected objects.

## Description

Performs visual analysis of the current camera view and returns detected objects with their positions, classifications, and confidence scores.

## Parameters

| Parameter | Type | Required | Values | Description |
|-----------|------|----------|--------|-------------|
| mode | string | no | full/targeted/quick | Scan thoroughness |

## Parameter Schema

```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["full", "targeted", "quick"],
      "description": "Scan mode: full (thorough), targeted (specific area), quick (fast overview)"
    }
  }
}
```

## Scan Modes

| Mode | Processing Time | Detail Level | Use Case |
|------|----------------|--------------|----------|
| quick | ~100ms | Low | Navigation, obstacle avoidance |
| targeted | ~300ms | Medium | Object tracking, approach |
| full | ~500ms | High | Analysis, identification |

## Return Value

```json
{
  "objects": [
    {
      "id": "obj_1",
      "class": "obstacle",
      "confidence": 0.92,
      "position": {"x": 0.3, "y": 0.0, "z": 0.5},
      "bounds": {"x": 100, "y": 150, "width": 80, "height": 120},
      "distance_cm": 45
    }
  ],
  "frame_id": "frame_12345",
  "timestamp": 1706745600000
}
```

## Object Classes

Common detected object classes:
- `obstacle` - Generic blocking object
- `wall` - Vertical surface
- `floor` - Ground plane
- `person` - Human detected
- `plant` - Vegetation
- `furniture` - Chairs, tables, etc.
- `unknown` - Unclassified object

## Integration with Skills

Skills define what to look for in their Visual Cortex section. The scan results are filtered and prioritized based on the active skill's Primary Targets.

## Examples

### Quick scan for navigation
```json
{"name": "hal_vision_scan", "args": {"mode": "quick"}}
```

### Full analysis
```json
{"name": "hal_vision_scan", "args": {"mode": "full"}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |

## Learning Notes
<!--
Dreaming Engine observations:
- Object detection accuracy by class
- Lighting condition effects
- False positive/negative patterns
-->
