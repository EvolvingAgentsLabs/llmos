# Drone Simulator - Project Memory

## Summary

Hardware-in-the-Loop flight simulator demonstrating LLMos self-building capability with ESP32-S3 integration.

## Key Learnings

### PID Tuning
- Start with kP only, then add kD to dampen oscillation
- kI should be small to avoid windup
- Clamp integral term to ±0.5

### Physics Simulation
- Always use delta time (dt) for frame-rate independence
- Air resistance (0.98 damping) prevents unrealistic acceleration
- Ground collision check prevents negative altitude

### Hardware Integration
- Virtual device useful for testing without hardware
- Same command protocol works for virtual and physical
- Arm/disarm safety pattern essential

## Decisions Made

1. **2D vs 3D**: Started with 2D for simplicity, can upgrade to Three.js
2. **Inline PID**: Kept PID in applet for self-contained demo
3. **Virtual-first**: Virtual device enabled before physical hardware

## Future Improvements

- [ ] Add 3D visualization with React Three Fiber
- [ ] Implement roll/pitch control (not just altitude)
- [ ] Add waypoint navigation
- [ ] Support multi-drone swarm simulation
- [ ] Record and replay flight paths

## Related Artifacts

- `hardware-flight-controller` skill
- `esp32-json-protocol` skill
- `esp32-flight-controller` firmware

## Usage Statistics

- Created: [date]
- Last used: [date]
- Times opened: 0
- Success rate: N/A
