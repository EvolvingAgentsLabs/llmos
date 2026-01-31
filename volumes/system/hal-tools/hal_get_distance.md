---
name: hal_get_distance
type: hal_tool
category: sensing
version: 1.0.0
safety_critical: false
---

# HAL Tool: hal_get_distance

Get distance sensor readings.

## Description

Reads all distance sensors and returns measurements in centimeters. Supports multiple sensor configurations (front, left, right, rear).

## Parameters

None required.

## Parameter Schema

```json
{
  "type": "object",
  "properties": {}
}
```

## Return Value

```json
{
  "front": 45.2,
  "left": 80.0,
  "right": 30.5,
  "rear": 120.0
}
```

All values in centimeters. Returns `null` for sensors not installed or out of range.

## Sensor Characteristics

| Property | Value |
|----------|-------|
| Min range | 2 cm |
| Max range | 400 cm |
| Accuracy | ±2 cm |
| Update rate | 10 Hz |
| Beam angle | 15° |

## Noise and Reliability

- Readings include ±2cm sensor noise
- Soft surfaces (fabric, foam) may give inaccurate readings
- Glass and water can cause false readings
- Narrow objects may be missed at angles

## Safety Thresholds

| Distance | Meaning | Action |
|----------|---------|--------|
| > 100cm | Clear | Full speed allowed |
| 30-100cm | Caution | Reduced speed recommended |
| 15-30cm | Warning | Slow speed only |
| 8-15cm | Danger | Very slow, prepare to stop |
| < 8cm | Critical | Emergency stop triggered |

## Examples

### Read all sensors
```json
{"name": "hal_get_distance", "args": {}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |

## Learning Notes
<!--
Dreaming Engine observations:
- Sensor noise patterns
- Surface-specific calibrations
- Obstacle detection improvements
-->
