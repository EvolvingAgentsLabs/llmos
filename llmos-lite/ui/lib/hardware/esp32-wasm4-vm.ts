/**
 * ESP32 WASM4 Virtual Machine
 *
 * A combined virtual machine that integrates:
 * - ESP32-S3 microcontroller simulation
 * - WASM4 fantasy console runtime
 * - Cube robot physics simulation
 *
 * This allows WASM4 games to control cube robots through a unified interface.
 * The same game code can run in browser simulation or on real ESP32 hardware.
 *
 * Modes of Operation:
 * 1. Display Mode: Game renders to 160x160 virtual display
 * 2. Robot Mode: Game controls robot through memory-mapped I/O
 * 3. Hybrid Mode: Both display and robot control simultaneously
 */

import { WASM4Runtime, WASM4Config, WASM4State, BUTTON, SCREEN } from './wasm4-runtime';
import { CubeRobotSimulator, CubeRobotConfig, CubeRobotState, FloorMap, FLOOR_MAPS } from './cube-robot-simulator';
import { VirtualESP32 } from './virtual-esp32';

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED MEMORY MAP FOR ROBOT CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export const ROBOT_MEMORY = {
  // Robot control (after WASM4 user memory)
  ROBOT_BASE: 0x5000,

  // Motor control (4 bytes)
  MOTORS: 0x5000,        // int16_t left, int16_t right (-255 to 255)

  // LED control (4 bytes)
  LED: 0x5004,           // uint8_t r, g, b, brightness

  // Sensor inputs (read-only, 32 bytes)
  SENSORS: 0x5008,       // 8x distance sensors (uint8_t each)
  LINE_SENSORS: 0x5010,  // 5x line sensors (uint8_t each)
  BUMPER: 0x5015,        // uint8_t bumper flags
  BATTERY: 0x5016,       // uint8_t percentage

  // Robot pose (read-only, 12 bytes)
  POSE_X: 0x5018,        // float32 x position
  POSE_Y: 0x501C,        // float32 y position
  POSE_ROTATION: 0x5020, // float32 rotation

  // Robot velocity (read-only, 8 bytes)
  VEL_LINEAR: 0x5024,    // float32 linear velocity
  VEL_ANGULAR: 0x5028,   // float32 angular velocity

  // Encoders (read-only, 8 bytes)
  ENCODER_LEFT: 0x502C,  // int32_t left encoder
  ENCODER_RIGHT: 0x5030, // int32_t right encoder

  // Robot mode flags (2 bytes)
  ROBOT_FLAGS: 0x5034,   // uint16_t flags

  // Game mode (1 byte)
  GAME_MODE: 0x5036,     // 0=display, 1=robot, 2=hybrid
};

// Robot flags
export const ROBOT_FLAG = {
  ENABLE_MOTORS: 0x0001,
  ENABLE_SENSORS: 0x0002,
  ENABLE_LED: 0x0004,
  ENABLE_CAMERA: 0x0008,
  ROBOT_CONNECTED: 0x0100,
  ROBOT_MOVING: 0x0200,
  LOW_BATTERY: 0x0400,
  COLLISION_DETECTED: 0x0800,
};

// Game modes
export const GAME_MODE = {
  DISPLAY: 0,
  ROBOT: 1,
  HYBRID: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// ESP32 WASM4 VM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ESP32WASM4VMConfig {
  // Display settings
  canvas?: HTMLCanvasElement;
  frameRate?: number;

  // Robot settings
  physicsRate?: number;
  floorMap?: FloorMap;

  // Mode
  gameMode?: number;  // GAME_MODE constant

  // Callbacks
  onFrame?: (framebuffer: Uint8Array) => void;
  onRobotState?: (state: CubeRobotState) => void;
  onGamepadInput?: (gamepad: number) => number;
  onCheckpoint?: (index: number) => void;
  onCollision?: (x: number, y: number) => void;
  onSound?: (channel: number, frequency: number, duration: number, volume: number) => void;
}

export interface ESP32WASM4VMState {
  wasm4: WASM4State;
  robot: CubeRobotState;
  gameMode: number;
  running: boolean;
  firmwareName: string;
  firmwareSize: number;
  uptime: number;
  virtualDevice: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESP32 WASM4 VIRTUAL MACHINE
// ═══════════════════════════════════════════════════════════════════════════

export class ESP32WASM4VM {
  private wasm4: WASM4Runtime;
  private robot: CubeRobotSimulator;
  private esp32: VirtualESP32;

  private config: Required<ESP32WASM4VMConfig>;
  private memory: WebAssembly.Memory | null = null;
  private memoryView: DataView | null = null;
  private memoryBytes: Uint8Array | null = null;

  private running = false;
  private gameMode = GAME_MODE.HYBRID;
  private firmwareName = '';
  private firmwareSize = 0;
  private startTime = 0;

  // Synchronization interval
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ESP32WASM4VMConfig = {}) {
    this.config = {
      canvas: config.canvas || null as any,
      frameRate: config.frameRate ?? 60,
      physicsRate: config.physicsRate ?? 100,
      floorMap: config.floorMap || FLOOR_MAPS.ovalTrack(),
      gameMode: config.gameMode ?? GAME_MODE.HYBRID,
      onFrame: config.onFrame ?? (() => {}),
      onRobotState: config.onRobotState ?? (() => {}),
      onGamepadInput: config.onGamepadInput ?? ((g) => g),
      onCheckpoint: config.onCheckpoint ?? (() => {}),
      onCollision: config.onCollision ?? (() => {}),
      onSound: config.onSound ?? (() => {}),
    };

    this.gameMode = this.config.gameMode;

    // Create WASM4 runtime
    this.wasm4 = new WASM4Runtime({
      canvas: config.canvas,
      frameRate: this.config.frameRate,
      onFrame: this.handleWASM4Frame.bind(this),
      onSound: this.config.onSound,
    });

    // Create robot simulator
    this.robot = new CubeRobotSimulator({
      physicsRate: this.config.physicsRate,
      onStateChange: this.handleRobotStateChange.bind(this),
      onCheckpoint: this.config.onCheckpoint,
      onCollision: (pos) => this.config.onCollision(pos.x, pos.y),
    });

    // Create virtual ESP32
    this.esp32 = new VirtualESP32();

    // Set floor map
    this.robot.setMap(this.config.floorMap);
  }

  /**
   * Load and run a WASM4 game/firmware
   */
  async loadFirmware(wasmBinary: Uint8Array, name: string = 'firmware'): Promise<void> {
    this.firmwareName = name;
    this.firmwareSize = wasmBinary.length;

    // Load into WASM4 runtime
    await this.wasm4.loadCartridge(wasmBinary);

    console.log(`[ESP32WASM4VM] Loaded ${name} (${wasmBinary.length} bytes)`);
  }

  /**
   * Start the virtual machine
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    // Start WASM4 runtime
    this.wasm4.start();

    // Start robot simulation if in robot or hybrid mode
    if (this.gameMode === GAME_MODE.ROBOT || this.gameMode === GAME_MODE.HYBRID) {
      this.robot.start();
    }

    // Start memory sync loop
    this.syncInterval = setInterval(() => {
      this.syncMemory();
    }, 1000 / this.config.physicsRate);

    console.log(`[ESP32WASM4VM] Started in ${this.getModeName()} mode`);
  }

  /**
   * Stop the virtual machine
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    this.wasm4.stop();
    this.robot.stop();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    console.log('[ESP32WASM4VM] Stopped');
  }

  /**
   * Reset the virtual machine
   */
  reset(): void {
    this.wasm4.reset();
    this.robot.reset();
    this.startTime = Date.now();
  }

  /**
   * Set game mode
   */
  setGameMode(mode: number): void {
    this.gameMode = mode;

    if (this.running) {
      if (mode === GAME_MODE.DISPLAY) {
        this.robot.stop();
      } else {
        if (!this.robot.isRunning()) {
          this.robot.start();
        }
      }
    }
  }

  /**
   * Set floor map for robot
   */
  setFloorMap(map: FloorMap): void {
    this.robot.setMap(map);
  }

  /**
   * Set gamepad input
   */
  setGamepad(player: number, buttons: number): void {
    const processed = this.config.onGamepadInput(buttons);
    this.wasm4.setGamepad(player, processed);

    // In robot mode, also control robot with gamepad
    if (this.gameMode === GAME_MODE.ROBOT || this.gameMode === GAME_MODE.HYBRID) {
      this.gamepadToRobot(processed);
    }
  }

  /**
   * Set mouse position
   */
  setMouse(x: number, y: number, buttons: number): void {
    this.wasm4.setMouse(x, y, buttons);
  }

  /**
   * Direct robot motor control
   */
  driveRobot(left: number, right: number): void {
    this.robot.drive(left, right);
  }

  /**
   * Set robot LED
   */
  setRobotLED(r: number, g: number, b: number): void {
    this.robot.setLED(r, g, b);
  }

  /**
   * Get current VM state
   */
  getState(): ESP32WASM4VMState {
    return {
      wasm4: this.wasm4.getState(),
      robot: this.robot.getState(),
      gameMode: this.gameMode,
      running: this.running,
      firmwareName: this.firmwareName,
      firmwareSize: this.firmwareSize,
      uptime: Date.now() - this.startTime,
      virtualDevice: true,
    };
  }

  /**
   * Get WASM4 framebuffer as ImageData
   */
  getFramebufferAsImageData(): ImageData | null {
    return this.wasm4.getFramebufferAsImageData();
  }

  /**
   * Get raw framebuffer
   */
  getFramebuffer(): Uint8Array {
    return this.wasm4.getFramebuffer();
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private getModeName(): string {
    switch (this.gameMode) {
      case GAME_MODE.DISPLAY: return 'display';
      case GAME_MODE.ROBOT: return 'robot';
      case GAME_MODE.HYBRID: return 'hybrid';
      default: return 'unknown';
    }
  }

  private handleWASM4Frame(framebuffer: Uint8Array): void {
    this.config.onFrame(framebuffer);
  }

  private handleRobotStateChange(state: CubeRobotState): void {
    this.config.onRobotState(state);
  }

  /**
   * Convert gamepad input to robot movement
   */
  private gamepadToRobot(buttons: number): void {
    let left = 0;
    let right = 0;
    const speed = 150; // Base motor speed

    if (buttons & BUTTON.UP) {
      left += speed;
      right += speed;
    }
    if (buttons & BUTTON.DOWN) {
      left -= speed;
      right -= speed;
    }
    if (buttons & BUTTON.LEFT) {
      left -= speed * 0.5;
      right += speed * 0.5;
    }
    if (buttons & BUTTON.RIGHT) {
      left += speed * 0.5;
      right -= speed * 0.5;
    }

    // Button X for boost
    if (buttons & BUTTON.X) {
      left *= 1.5;
      right *= 1.5;
    }

    // Clamp values
    left = Math.max(-255, Math.min(255, left));
    right = Math.max(-255, Math.min(255, right));

    this.robot.drive(left, right);
  }

  /**
   * Sync memory between WASM4 and robot
   * This allows the game to read sensor data and control the robot
   */
  private syncMemory(): void {
    if (!this.running) return;

    // This would be used if we had shared memory between WASM4 and robot
    // For now, the connection is through the gamepad controls

    // If implementing memory-mapped I/O:
    // - Read motor commands from ROBOT_MEMORY.MOTORS
    // - Write sensor data to ROBOT_MEMORY.SENSORS
    // - etc.
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
    this.wasm4.dispose();
    this.robot.dispose();
    this.esp32.dispose();
  }
}

/**
 * Create a new ESP32 WASM4 VM
 */
export function createESP32WASM4VM(config?: ESP32WASM4VMConfig): ESP32WASM4VM {
  return new ESP32WASM4VM(config);
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN GAME TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Built-in game source code templates
 * These can be compiled with the WASM compiler
 */
export const GAME_TEMPLATES = {
  /**
   * Simple Snake game
   */
  snake: `
// Snake game for WASM4
#include "wasm4.h"

#define GRID_SIZE 16
#define MAX_LENGTH 100

typedef struct { int x, y; } Point;

Point snake[MAX_LENGTH];
int length = 3;
int dx = 1, dy = 0;
Point food;
int frame = 0;

void spawn_food() {
  food.x = (frame * 7 + 3) % (160 / GRID_SIZE);
  food.y = (frame * 13 + 5) % (160 / GRID_SIZE);
}

void start() {
  snake[0] = (Point){5, 5};
  snake[1] = (Point){4, 5};
  snake[2] = (Point){3, 5};
  spawn_food();
}

void update() {
  frame++;

  // Input
  uint8_t gamepad = *GAMEPAD1;
  if (gamepad & BUTTON_UP && dy != 1) { dx = 0; dy = -1; }
  if (gamepad & BUTTON_DOWN && dy != -1) { dx = 0; dy = 1; }
  if (gamepad & BUTTON_LEFT && dx != 1) { dx = -1; dy = 0; }
  if (gamepad & BUTTON_RIGHT && dx != -1) { dx = 1; dy = 0; }

  // Move every 6 frames
  if (frame % 6 != 0) return;

  // Move snake
  Point new_head = {
    (snake[0].x + dx + 160/GRID_SIZE) % (160/GRID_SIZE),
    (snake[0].y + dy + 160/GRID_SIZE) % (160/GRID_SIZE)
  };

  // Check food
  if (new_head.x == food.x && new_head.y == food.y) {
    if (length < MAX_LENGTH) length++;
    spawn_food();
    tone(262, 10, 100, TONE_PULSE1);
  }

  // Move body
  for (int i = length - 1; i > 0; i--) {
    snake[i] = snake[i - 1];
  }
  snake[0] = new_head;

  // Draw
  *DRAW_COLORS = 0x0004;
  rect(0, 0, 160, 160);

  *DRAW_COLORS = 0x0002;
  for (int i = 0; i < length; i++) {
    rect(snake[i].x * GRID_SIZE, snake[i].y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1);
  }

  *DRAW_COLORS = 0x0003;
  rect(food.x * GRID_SIZE, food.y * GRID_SIZE, GRID_SIZE - 1, GRID_SIZE - 1);
}
`,

  /**
   * Pong game
   */
  pong: `
// Pong game for WASM4
#include "wasm4.h"

#define PADDLE_HEIGHT 20
#define PADDLE_WIDTH 4
#define BALL_SIZE 4

int paddle1_y = 70;
int paddle2_y = 70;
int ball_x = 80, ball_y = 80;
int ball_dx = 2, ball_dy = 1;
int score1 = 0, score2 = 0;

void start() {
  *PALETTE = 0x1a1c2c;  // Dark blue background
  *(PALETTE + 1) = 0x5d275d;  // Purple
  *(PALETTE + 2) = 0xb13e53;  // Red
  *(PALETTE + 3) = 0xffcd75;  // Yellow
}

void update() {
  // Input - Player 1
  uint8_t gamepad = *GAMEPAD1;
  if (gamepad & BUTTON_UP) paddle1_y -= 3;
  if (gamepad & BUTTON_DOWN) paddle1_y += 3;

  // Clamp paddle
  if (paddle1_y < 0) paddle1_y = 0;
  if (paddle1_y > 160 - PADDLE_HEIGHT) paddle1_y = 160 - PADDLE_HEIGHT;

  // AI for paddle 2
  if (ball_y > paddle2_y + PADDLE_HEIGHT/2) paddle2_y += 2;
  if (ball_y < paddle2_y + PADDLE_HEIGHT/2) paddle2_y -= 2;
  if (paddle2_y < 0) paddle2_y = 0;
  if (paddle2_y > 160 - PADDLE_HEIGHT) paddle2_y = 160 - PADDLE_HEIGHT;

  // Ball movement
  ball_x += ball_dx;
  ball_y += ball_dy;

  // Ball collision with top/bottom
  if (ball_y <= 0 || ball_y >= 160 - BALL_SIZE) {
    ball_dy = -ball_dy;
    tone(440, 5, 50, TONE_TRIANGLE);
  }

  // Ball collision with paddles
  if (ball_x <= PADDLE_WIDTH + 4 && ball_y >= paddle1_y && ball_y <= paddle1_y + PADDLE_HEIGHT) {
    ball_dx = -ball_dx;
    ball_x = PADDLE_WIDTH + 4;
    tone(262, 10, 80, TONE_PULSE1);
  }
  if (ball_x >= 160 - PADDLE_WIDTH - BALL_SIZE - 4 && ball_y >= paddle2_y && ball_y <= paddle2_y + PADDLE_HEIGHT) {
    ball_dx = -ball_dx;
    ball_x = 160 - PADDLE_WIDTH - BALL_SIZE - 4;
    tone(330, 10, 80, TONE_PULSE1);
  }

  // Score
  if (ball_x < 0) {
    score2++;
    ball_x = 80;
    ball_y = 80;
    tone(196, 30, 100, TONE_NOISE);
  }
  if (ball_x > 160) {
    score1++;
    ball_x = 80;
    ball_y = 80;
    tone(196, 30, 100, TONE_NOISE);
  }

  // Draw
  *DRAW_COLORS = 0x0001;
  rect(0, 0, 160, 160);

  *DRAW_COLORS = 0x0004;
  rect(4, paddle1_y, PADDLE_WIDTH, PADDLE_HEIGHT);
  rect(160 - PADDLE_WIDTH - 4, paddle2_y, PADDLE_WIDTH, PADDLE_HEIGHT);

  *DRAW_COLORS = 0x0003;
  oval(ball_x, ball_y, BALL_SIZE, BALL_SIZE);

  // Center line
  *DRAW_COLORS = 0x0002;
  for (int y = 0; y < 160; y += 8) {
    rect(79, y, 2, 4);
  }
}
`,

  /**
   * Line follower robot game
   */
  lineFollower: `
// Line Follower for WASM4 + Robot4
#include "wasm4.h"
#include "robot4.h"

int mode = 0; // 0=manual, 1=auto

void start() {
  *PALETTE = 0x1a1c2c;
  *(PALETTE + 1) = 0x5d275d;
  *(PALETTE + 2) = 0x41a6f6;
  *(PALETTE + 3) = 0x73eff7;
  led(0, 255, 0); // Green = ready
}

void update() {
  uint8_t gamepad = *GAMEPAD1;

  // Toggle mode with button X
  static uint8_t prev_gamepad = 0;
  if ((gamepad & BUTTON_1) && !(prev_gamepad & BUTTON_1)) {
    mode = !mode;
    tone(mode ? 523 : 262, 10, 80, TONE_PULSE1);
    led(mode ? 255 : 0, mode ? 0 : 255, 0);
  }
  prev_gamepad = gamepad;

  if (mode == 0) {
    // Manual mode - gamepad control
    int left = 0, right = 0;

    if (gamepad & BUTTON_UP) { left += 150; right += 150; }
    if (gamepad & BUTTON_DOWN) { left -= 150; right -= 150; }
    if (gamepad & BUTTON_LEFT) { left -= 80; right += 80; }
    if (gamepad & BUTTON_RIGHT) { left += 80; right -= 80; }

    drive(left, right);
  } else {
    // Auto mode - line following
    int sensors[5];
    for (int i = 0; i < 5; i++) {
      sensors[i] = line(i);
    }

    // Calculate error
    int error = (sensors[0] - sensors[4]) * 2 + (sensors[1] - sensors[3]);

    // PID control (simplified)
    int base_speed = 120;
    int correction = error / 2;

    int left = base_speed + correction;
    int right = base_speed - correction;

    // Check if on line
    int on_line = sensors[0] + sensors[1] + sensors[2] + sensors[3] + sensors[4];
    if (on_line < 100) {
      // Lost line - spin to find
      drive(80, -80);
    } else {
      drive(left, right);
    }
  }

  // Draw display
  *DRAW_COLORS = 0x0001;
  rect(0, 0, 160, 160);

  *DRAW_COLORS = 0x0004;
  text(mode ? "AUTO" : "MANUAL", 60, 10);

  // Draw sensor values
  *DRAW_COLORS = 0x0003;
  for (int i = 0; i < 5; i++) {
    int val = line(i);
    int h = val / 4;
    rect(40 + i * 20, 140 - h, 15, h);
  }

  // Draw distance sensors
  *DRAW_COLORS = 0x0002;
  int d = distance(0) / 2;
  rect(75, 60, 10, d > 80 ? 80 : d);
}
`,

  /**
   * Obstacle avoidance robot game
   */
  obstacleAvoidance: `
// Obstacle Avoidance for WASM4 + Robot4
#include "wasm4.h"
#include "robot4.h"

int state = 0; // 0=forward, 1=turning

void start() {
  *PALETTE = 0x0f380f;
  *(PALETTE + 1) = 0x306230;
  *(PALETTE + 2) = 0x8bac0f;
  *(PALETTE + 3) = 0x9bbc0f;
  led(0, 0, 255); // Blue = exploring
}

void update() {
  // Get distance sensors
  int front = distance(0);
  int front_left = distance(1);
  int front_right = distance(2);

  // Draw radar view
  *DRAW_COLORS = 0x0001;
  rect(0, 0, 160, 160);

  // Center robot icon
  *DRAW_COLORS = 0x0004;
  oval(75, 75, 10, 10);

  // Draw distance readings
  *DRAW_COLORS = 0x0003;

  // Front
  int f = front / 2;
  if (f > 60) f = 60;
  rect(78, 75 - f, 4, f);

  // Front-left
  int fl = front_left / 2;
  if (fl > 50) fl = 50;
  for (int i = 0; i < fl; i += 2) {
    rect(75 - i/2, 75 - i/2, 2, 2);
  }

  // Front-right
  int fr = front_right / 2;
  if (fr > 50) fr = 50;
  for (int i = 0; i < fr; i += 2) {
    rect(85 + i/2, 75 - i/2, 2, 2);
  }

  // Status text
  *DRAW_COLORS = 0x0004;
  if (state == 0) {
    text("FORWARD", 50, 10);
  } else {
    text("TURNING", 50, 10);
  }

  // Display distances
  char buf[20];
  *DRAW_COLORS = 0x0002;

  // Navigation logic
  if (state == 0) {
    // Forward state
    if (front < 30) {
      // Obstacle ahead - start turning
      state = 1;
      led(255, 165, 0); // Orange = turning
      tone(440, 20, 60, TONE_TRIANGLE);
    } else {
      // Move forward
      int speed = front < 60 ? 100 : 150;
      drive(speed, speed);
    }
  } else {
    // Turning state
    if (front > 50 && front_left > 30 && front_right > 30) {
      // Clear - go forward
      state = 0;
      led(0, 255, 0); // Green = moving
    } else {
      // Keep turning - pick direction based on which side is clearer
      if (front_left > front_right) {
        drive(-80, 80); // Turn left
      } else {
        drive(80, -80); // Turn right
      }
    }
  }

  // Check for bumper collision
  if (bumper(0x01)) {
    // Back up
    drive(-150, -150);
    led(255, 0, 0); // Red = collision
    tone(196, 30, 100, TONE_NOISE);
  }
}
`,

  /**
   * Maze runner game
   */
  mazeRunner: `
// Maze Runner for WASM4 + Robot4
#include "wasm4.h"
#include "robot4.h"

// Wall following algorithm
int follow_wall = 0; // 0=left, 1=right
int turning = 0;
int turn_timer = 0;

void start() {
  *PALETTE = 0x332c50;
  *(PALETTE + 1) = 0x46878f;
  *(PALETTE + 2) = 0x94e344;
  *(PALETTE + 3) = 0xe2f3e4;
  led(255, 255, 0); // Yellow = maze mode
}

void update() {
  int front = distance(0);
  int left = distance(3);
  int right = distance(4);

  // Draw top-down view
  *DRAW_COLORS = 0x0001;
  rect(0, 0, 160, 160);

  // Draw robot
  *DRAW_COLORS = 0x0004;
  oval(75, 75, 10, 10);

  // Draw sensors as lines
  *DRAW_COLORS = 0x0003;
  // Front
  line(80, 75, 80, 75 - front/3);
  // Left
  line(75, 80, 75 - left/3, 80);
  // Right
  line(85, 80, 85 + right/3, 80);

  // Status
  *DRAW_COLORS = 0x0004;
  text(follow_wall ? "FOLLOW R" : "FOLLOW L", 45, 10);

  // Toggle wall following with button
  uint8_t gamepad = *GAMEPAD1;
  static uint8_t prev = 0;
  if ((gamepad & BUTTON_1) && !(prev & BUTTON_1)) {
    follow_wall = !follow_wall;
    tone(follow_wall ? 523 : 392, 10, 60, TONE_PULSE1);
  }
  prev = gamepad;

  // Wall following algorithm
  if (turning) {
    turn_timer--;
    if (turn_timer <= 0) {
      turning = 0;
    }
  } else {
    if (follow_wall == 0) {
      // Left wall following
      if (left > 40) {
        // No wall on left - turn left
        drive(-60, 100);
        turning = 1;
        turn_timer = 15;
      } else if (front < 25) {
        // Wall ahead - turn right
        drive(100, -60);
        turning = 1;
        turn_timer = 10;
      } else {
        // Follow left wall
        int error = 30 - left;
        int correction = error * 2;
        drive(100 - correction, 100 + correction);
      }
    } else {
      // Right wall following
      if (right > 40) {
        // No wall on right - turn right
        drive(100, -60);
        turning = 1;
        turn_timer = 15;
      } else if (front < 25) {
        // Wall ahead - turn left
        drive(-60, 100);
        turning = 1;
        turn_timer = 10;
      } else {
        // Follow right wall
        int error = 30 - right;
        int correction = error * 2;
        drive(100 + correction, 100 - correction);
      }
    }
  }

  // LED indicates direction
  if (turning) {
    led(255, 165, 0); // Orange when turning
  } else {
    led(0, 255, 0); // Green when following
  }
}
`,
};

/**
 * Get game template by name
 */
export function getGameTemplate(name: keyof typeof GAME_TEMPLATES): string {
  return GAME_TEMPLATES[name];
}

/**
 * List available game templates
 */
export function listGameTemplates(): string[] {
  return Object.keys(GAME_TEMPLATES);
}
