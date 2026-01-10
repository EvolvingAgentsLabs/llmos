/**
 * Hardware Module Index
 *
 * Exports all ESP32 robot and WASM4 related components.
 */

// Core ESP32 Emulation
export { VirtualESP32, virtualESP32 } from './virtual-esp32';
export type { DeviceCommand, DeviceResponse } from './serial-manager';

// WASM4 Fantasy Console
export { WASM4Runtime, BUTTON, DEFAULT_PALETTE, ROBOT_PALETTE } from './wasm4-runtime';
export type { WASM4Config, GamepadState, SoundChannel, WASM4State } from './wasm4-runtime';

// WASM4 Games
export { GAMES, createGame } from './wasm4-games';
export type { WASM4Game } from './wasm4-games';

// Cube Robot Simulator
export {
  CubeRobotSimulator,
  SNAKE_GAME_MAPPING,
  PONG_GAME_MAPPING,
  MAZE_GAME_MAPPING,
} from './cube-robot-simulator';
export type {
  RobotConfig,
  RobotState,
  RobotCommand,
  RobotEvent,
  RobotEventType,
  FloorMap,
  FloorObstacle,
  GameMapping,
} from './cube-robot-simulator';

// ESP32 WASM4 Virtual Machine
export {
  ESP32WASM4VM,
  getESP32WASM4VM,
  resetESP32WASM4VM,
  GAME_LIBRARY,
} from './esp32-wasm4-vm';
export type {
  ConnectionMode,
  WASM4VMConfig,
  WASM4VMState,
  GameCartridge,
  GameLibraryEntry,
} from './esp32-wasm4-vm';

// Serial Manager
export { SerialManager, useSerialManager } from './serial-manager';
export type { DeviceConnection } from './serial-manager';

// Device Manager
export {
  ESP32DeviceManager,
  getESP32DeviceManager,
} from './esp32-device-manager';
export type {
  DeviceType,
  DeviceStatus,
  ESP32Device,
  DeploymentTarget,
  DeploymentResult,
  FleetEvent,
} from './esp32-device-manager';
