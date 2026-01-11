/**
 * Hardware Module Exports
 *
 * Central export point for all ESP32 WASM4 and robot simulation modules.
 */

// Virtual ESP32 Device
export { VirtualESP32, virtualESP32 } from './virtual-esp32';

// Serial Communication
export { SerialManager } from './serial-manager';

// WASM4 Fantasy Console Runtime
export {
  WASM4Runtime,
  createWASM4Runtime,
  WASM4_MEMORY,
  BUTTON,
  MOUSE_BUTTON,
  SYSTEM_FLAG,
  DRAW_COLORS,
  BLIT,
  TONE,
  SCREEN,
  DEFAULT_PALETTE,
} from './wasm4-runtime';
export type { WASM4Config, WASM4State } from './wasm4-runtime';

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

// ESP32 WASM4 Virtual Machine
export {
  ESP32WASM4VM,
  createESP32WASM4VM,
  ROBOT_MEMORY,
  ROBOT_FLAG,
  GAME_MODE,
  GAME_TEMPLATES,
  getGameTemplate,
  listGameTemplates,
} from './esp32-wasm4-vm';
export type {
  ESP32WASM4VMConfig,
  ESP32WASM4VMState,
} from './esp32-wasm4-vm';

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

// WASM Deployer
export {
  installWasmApp,
  queryWasmApps,
  uninstallWasmApp,
} from './wasm-deployer';

// Device Cron Handler
export {
  registerDeviceCron,
  unregisterDeviceCron,
} from './device-cron-handler';
