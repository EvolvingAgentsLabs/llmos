---
name: hal_capture_frame
type: hal_tool
category: vision
version: 1.0.0
safety_critical: false
---

# HAL Tool: hal_capture_frame

Capture current camera frame as base64 image.

## Description

Captures the current camera view and returns it as a base64-encoded image for further processing or logging.

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
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "width": 640,
  "height": 480,
  "format": "jpeg",
  "timestamp": 1706745600000
}
```

## Image Specifications

| Property | Value |
|----------|-------|
| Format | JPEG |
| Resolution | 640x480 (default) |
| Quality | 80% |
| Color space | RGB |

## Use Cases

- Logging visual state for Dreaming Engine
- Before/after comparison
- Debugging vision issues
- Creating training data

## Examples

### Capture current view
```json
{"name": "hal_capture_frame", "args": {}}
```

## Evolution History

| Version | Date | Changes | Source |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-31 | Initial definition | Created |
