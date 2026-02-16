/**
 * Hardware Module Exports
 *
 * Central export point for ESP32 hardware and robot simulation modules.
 */

// Virtual ESP32 Device
export { VirtualESP32, virtualESP32 } from './virtual-esp32';

// Serial Communication
export { SerialManager } from './serial-manager';

// Cube Robot Simulator
export {
  CubeRobotSimulator,
  createCubeRobotSimulator,
  ROBOT_SPECS,
  FLOOR_MAPS,
} from './cube-robot-simulator';
export type {
  Vector2D,
  RobotPose,
  RobotVelocity,
  MotorState,
  SensorData,
  LEDState,
  BatteryState,
  Wall,
  Obstacle,
  LineTrack,
  FloorMap,
  CubeRobotConfig,
  CubeRobotState,
} from './cube-robot-simulator';

// ESP32 Device Manager (Fleet Management)
export {
  ESP32DeviceManager,
  createDeviceManager,
  getDeviceManager,
  resetDeviceManager,
} from './esp32-device-manager';
export type {
  DeviceConnectionType,
  DeviceStatus,
  DeviceInfo,
  DeviceTelemetry,
  FleetConfig,
  DeviceCommand,
} from './esp32-device-manager';

// Device Cron Handler
export {
  registerDeviceCron,
  unregisterDeviceCron,
} from './device-cron-handler';
