/**
 * ESP32-S3 WASM4 Virtual Machine
 *
 * Combines ESP32-S3 hardware emulation with WASM4 fantasy console runtime.
 * Enables running WASM4 games on ESP32-S3 devices (simulated or real).
 *
 * Features:
 * - Full WASM4 runtime (160x160, 4 colors, gamepad, sound)
 * - ESP32-S3 GPIO/sensor emulation
 * - Robot control integration
 * - Game <-> Robot state synchronization
 * - Serial/WiFi communication modes
 */

import { VirtualESP32 } from './virtual-esp32';
import { WASM4Runtime, BUTTON, DEFAULT_PALETTE, ROBOT_PALETTE, type SoundChannel } from './wasm4-runtime';
import { CubeRobotSimulator, SNAKE_GAME_MAPPING, PONG_GAME_MAPPING, MAZE_GAME_MAPPING, type RobotCommand, type RobotState, type FloorMap } from './cube-robot-simulator';
import { createGame, type WASM4Game } from './wasm4-games';
import type { DeviceCommand, DeviceResponse } from './serial-manager';

// Connection mode
export type ConnectionMode = 'simulated' | 'serial' | 'wifi' | 'bluetooth';

// VM configuration
export interface WASM4VMConfig {
  deviceId: string;
  deviceName: string;
  connectionMode: ConnectionMode;
  enableRobot: boolean;
  enableSound: boolean;
  floorSize: { width: number; height: number };
  wifiIP?: string;
  serialPort?: string;
}

// VM state
export interface WASM4VMState {
  connected: boolean;
  mode: 'idle' | 'running' | 'paused' | 'error';
  game: string | null;
  frame: number;
  fps: number;
  robotConnected: boolean;
  batteryPercent: number;
  errorMessage: string | null;
}

// Compiled game cartridge
export interface GameCartridge {
  name: string;
  author: string;
  description: string;
  wasmBytes: Uint8Array;
  palette?: number[];
  savedData?: Uint8Array;
}

// Game library entry
export interface GameLibraryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  thumbnail?: string;
  category: 'action' | 'puzzle' | 'racing' | 'arcade' | 'educational' | 'robot';
  robotCompatible: boolean;
  wasmUrl?: string;
  sourceCode?: string;
}

// Built-in game library
export const GAME_LIBRARY: GameLibraryEntry[] = [
  {
    id: 'snake',
    name: 'Snake',
    author: 'LLMOS',
    description: 'Classic snake game - eat food, grow longer, avoid walls',
    category: 'arcade',
    robotCompatible: true,
  },
  {
    id: 'pong',
    name: 'Pong',
    author: 'LLMOS',
    description: 'Classic pong - bounce the ball, score points',
    category: 'arcade',
    robotCompatible: true,
  },
  {
    id: 'maze-runner',
    name: 'Maze Runner',
    author: 'LLMOS',
    description: 'Navigate through procedurally generated mazes',
    category: 'puzzle',
    robotCompatible: true,
  },
  {
    id: 'line-follower',
    name: 'Line Follower',
    author: 'LLMOS',
    description: 'Robot follows a line - educational robot programming',
    category: 'educational',
    robotCompatible: true,
  },
  {
    id: 'obstacle-course',
    name: 'Obstacle Course',
    author: 'LLMOS',
    description: 'Navigate robot through obstacles using sensors',
    category: 'robot',
    robotCompatible: true,
  },
];

/**
 * Event emitter for VM events
 */
type VMEventType = 'stateChange' | 'frameUpdate' | 'robotUpdate' | 'error' | 'sound';

interface VMEventData {
  stateChange: WASM4VMState;
  frameUpdate: { framebuffer: Uint8Array; frame: number };
  robotUpdate: RobotState;
  error: { message: string; code?: string };
  sound: SoundChannel[];
}

/**
 * ESP32 WASM4 Virtual Machine
 */
export class ESP32WASM4VM {
  private config: WASM4VMConfig;
  private state: WASM4VMState;

  // Core components
  private esp32: VirtualESP32;
  private wasm4: WASM4Runtime;
  private robot: CubeRobotSimulator | null = null;

  // Game state
  private currentCartridge: GameCartridge | null = null;
  private gameMapping: typeof SNAKE_GAME_MAPPING | null = null;
  private jsGame: WASM4Game | null = null;
  private jsGameLoop: ReturnType<typeof setInterval> | null = null;

  // Input state
  private gamepadState: number = 0;
  private mouseState = { x: 0, y: 0, buttons: 0 };

  // Frame timing
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsUpdateTime = 0;
  private currentFPS = 0;
  private jsFrameCount = 0;

  // Event listeners
  private eventListeners: Map<VMEventType, Array<(data: any) => void>> = new Map();

  constructor(config: Partial<WASM4VMConfig> = {}) {
    this.config = {
      deviceId: `esp32-${Date.now().toString(36)}`,
      deviceName: 'ESP32-S3 WASM4',
      connectionMode: 'simulated',
      enableRobot: true,
      enableSound: true,
      floorSize: { width: 200, height: 200 },
      ...config,
    };

    this.state = {
      connected: false,
      mode: 'idle',
      game: null,
      frame: 0,
      fps: 0,
      robotConnected: false,
      batteryPercent: 100,
      errorMessage: null,
    };

    // Initialize components
    this.esp32 = new VirtualESP32();
    this.wasm4 = new WASM4Runtime({
      enableSound: this.config.enableSound,
    });

    if (this.config.enableRobot) {
      this.robot = new CubeRobotSimulator({
        floorWidth: this.config.floorSize.width,
        floorHeight: this.config.floorSize.height,
      });
    }

    this.setupCallbacks();
  }

  private setupCallbacks(): void {
    // WASM4 frame update callback
    this.wasm4.onUpdate((framebuffer) => {
      this.frameCount++;
      this.state.frame = this.wasm4.getFrame();

      // Calculate FPS
      const now = performance.now();
      if (now - this.fpsUpdateTime >= 1000) {
        this.currentFPS = this.frameCount;
        this.state.fps = this.currentFPS;
        this.frameCount = 0;
        this.fpsUpdateTime = now;
      }

      // Sync with robot if enabled
      if (this.robot && this.state.mode === 'running') {
        this.robot.setGameButtons(this.gamepadState);
        this.robot.updateCamera();
      }

      this.emit('frameUpdate', { framebuffer, frame: this.state.frame });
    });

    // WASM4 sound callback
    this.wasm4.onSound((channels) => {
      this.emit('sound', channels);
    });

    // Robot state update callback
    if (this.robot) {
      this.robot.on('stateUpdate', (event) => {
        this.state.robotConnected = event.data.connected;
        this.state.batteryPercent = event.data.batteryPercent;
        this.emit('robotUpdate', event.data);
      });

      this.robot.on('collision', (event) => {
        // Play collision sound
        this.wasm4.tone(200, 100, 80, 3);
      });

      this.robot.on('goalReached', (event) => {
        // Play success sound
        this.wasm4.tone(800, 200, 100, 0);
      });
    }
  }

  // === Connection Methods ===

  /**
   * Connect to device (simulated or real)
   */
  async connect(): Promise<boolean> {
    try {
      switch (this.config.connectionMode) {
        case 'simulated':
          this.state.connected = true;
          this.state.robotConnected = this.config.enableRobot;
          if (this.robot) {
            this.robot.start();
          }
          break;

        case 'serial':
          // Would use Web Serial API
          throw new Error('Serial connection not implemented in browser simulation');

        case 'wifi':
          // Would use WebSocket
          throw new Error('WiFi connection not implemented in browser simulation');

        case 'bluetooth':
          // Would use Web Bluetooth API
          throw new Error('Bluetooth connection not implemented in browser simulation');
      }

      this.updateState();
      return true;
    } catch (error) {
      this.state.errorMessage = (error as Error).message;
      this.emit('error', { message: this.state.errorMessage });
      return false;
    }
  }

  /**
   * Disconnect from device
   */
  disconnect(): void {
    this.stop();
    this.state.connected = false;
    this.state.robotConnected = false;
    if (this.robot) {
      this.robot.stop();
    }
    this.updateState();
  }

  // === Game Loading Methods ===

  /**
   * Load a game from the library
   */
  async loadGame(gameId: string): Promise<boolean> {
    const entry = GAME_LIBRARY.find(g => g.id === gameId);
    if (!entry) {
      this.state.errorMessage = `Game not found: ${gameId}`;
      return false;
    }

    // Try to load JavaScript game implementation
    const jsGame = createGame(gameId);
    if (jsGame) {
      this.jsGame = jsGame;
      jsGame.init();
    }

    // Generate game cartridge
    const cartridge = await this.generateBuiltInGame(gameId);
    if (!cartridge) {
      this.state.errorMessage = `Failed to generate game: ${gameId}`;
      return false;
    }

    return this.loadCartridge(cartridge);
  }

  /**
   * Load a game cartridge
   */
  async loadCartridge(cartridge: GameCartridge): Promise<boolean> {
    try {
      this.currentCartridge = cartridge;
      this.state.game = cartridge.name;

      // Set custom palette if provided
      if (cartridge.palette) {
        this.wasm4.setPalette(cartridge.palette);
      } else {
        this.wasm4.setPalette(DEFAULT_PALETTE);
      }

      // Load WASM bytes
      if (cartridge.wasmBytes.length > 0) {
        await this.wasm4.loadCartridge(cartridge.wasmBytes);
      }

      // Setup robot game mapping
      if (this.robot) {
        switch (cartridge.name.toLowerCase()) {
          case 'snake':
            this.gameMapping = SNAKE_GAME_MAPPING;
            this.robot.loadGameMapping(SNAKE_GAME_MAPPING);
            break;
          case 'pong':
            this.gameMapping = PONG_GAME_MAPPING;
            this.robot.loadGameMapping(PONG_GAME_MAPPING);
            break;
          case 'maze runner':
          case 'maze':
            this.gameMapping = MAZE_GAME_MAPPING;
            this.robot.loadGameMapping(MAZE_GAME_MAPPING);
            break;
        }
      }

      this.state.mode = 'paused';
      this.updateState();
      return true;
    } catch (error) {
      this.state.errorMessage = (error as Error).message;
      this.emit('error', { message: this.state.errorMessage });
      return false;
    }
  }

  /**
   * Generate a built-in game
   */
  private async generateBuiltInGame(gameId: string): Promise<GameCartridge | null> {
    // For now, return empty cartridge - games will use JavaScript simulation
    // In production, these would be actual WASM files
    switch (gameId) {
      case 'snake':
        return {
          name: 'Snake',
          author: 'LLMOS',
          description: 'Classic snake game',
          wasmBytes: new Uint8Array(0),
          palette: DEFAULT_PALETTE,
        };

      case 'pong':
        return {
          name: 'Pong',
          author: 'LLMOS',
          description: 'Classic pong game',
          wasmBytes: new Uint8Array(0),
          palette: DEFAULT_PALETTE,
        };

      case 'maze-runner':
        return {
          name: 'Maze Runner',
          author: 'LLMOS',
          description: 'Navigate through mazes',
          wasmBytes: new Uint8Array(0),
          palette: DEFAULT_PALETTE,
        };

      case 'line-follower':
        return {
          name: 'Line Follower',
          author: 'LLMOS',
          description: 'Robot line following',
          wasmBytes: new Uint8Array(0),
          palette: ROBOT_PALETTE,
        };

      case 'obstacle-course':
        return {
          name: 'Obstacle Course',
          author: 'LLMOS',
          description: 'Navigate obstacles',
          wasmBytes: new Uint8Array(0),
          palette: ROBOT_PALETTE,
        };

      default:
        return null;
    }
  }

  // === Game Control Methods ===

  /**
   * Start/resume game execution
   */
  start(): void {
    if (!this.state.connected) {
      this.emit('error', { message: 'Not connected' });
      return;
    }

    this.state.mode = 'running';

    // Start JavaScript game loop if we have a JS game
    if (this.jsGame) {
      this.startJsGameLoop();
    } else {
      // Fall back to WASM4 runtime
      this.wasm4.start();
    }

    this.updateState();
  }

  /**
   * Start the JavaScript game loop
   */
  private startJsGameLoop(): void {
    if (this.jsGameLoop) return;

    this.jsFrameCount = 0;
    this.fpsUpdateTime = performance.now();
    const framebuffer = this.wasm4.getState().framebuffer;

    this.jsGameLoop = setInterval(() => {
      if (!this.jsGame || this.state.mode !== 'running') return;

      // Update game
      this.jsGame.update(this.gamepadState, framebuffer, this.jsFrameCount);
      this.jsFrameCount++;
      this.state.frame = this.jsFrameCount;

      // Calculate FPS
      const now = performance.now();
      if (now - this.fpsUpdateTime >= 1000) {
        this.state.fps = this.frameCount;
        this.frameCount = 0;
        this.fpsUpdateTime = now;
      }
      this.frameCount++;

      // Sync with robot
      if (this.robot && this.jsGame.getRobotCommand) {
        const cmd = this.jsGame.getRobotCommand();
        this.robot.sendCommand({ type: 'move', leftSpeed: cmd.leftSpeed, rightSpeed: cmd.rightSpeed });
      }

      // Emit frame update
      this.emit('frameUpdate', { framebuffer, frame: this.jsFrameCount });
    }, 1000 / 60); // 60 FPS
  }

  /**
   * Stop the JavaScript game loop
   */
  private stopJsGameLoop(): void {
    if (this.jsGameLoop) {
      clearInterval(this.jsGameLoop);
      this.jsGameLoop = null;
    }
  }

  /**
   * Pause game execution
   */
  pause(): void {
    this.state.mode = 'paused';
    this.stopJsGameLoop();
    this.wasm4.stop();
    this.updateState();
  }

  /**
   * Stop and reset game
   */
  stop(): void {
    this.state.mode = 'idle';
    this.state.game = null;
    this.stopJsGameLoop();
    this.jsGame = null;
    this.wasm4.reset();
    if (this.robot) {
      this.robot.reset();
    }
    this.currentCartridge = null;
    this.updateState();
  }

  /**
   * Reset current game
   */
  reset(): void {
    this.stopJsGameLoop();
    this.wasm4.reset();

    // Re-initialize JS game
    if (this.jsGame) {
      this.jsGame.init();
    }

    if (this.robot) {
      this.robot.respawn();
    }
    if (this.currentCartridge) {
      this.loadCartridge(this.currentCartridge);
    }
    this.state.frame = 0;
    this.jsFrameCount = 0;
    this.updateState();
  }

  // === Input Methods ===

  /**
   * Set gamepad button state
   */
  setButton(button: number, pressed: boolean): void {
    if (pressed) {
      this.gamepadState |= button;
    } else {
      this.gamepadState &= ~button;
    }
    this.wasm4.setGamepad(0, this.gamepadState);
  }

  /**
   * Set gamepad state directly
   */
  setGamepad(buttons: number): void {
    this.gamepadState = buttons;
    this.wasm4.setGamepad(0, buttons);
  }

  /**
   * Set mouse position
   */
  setMouse(x: number, y: number, buttons: number): void {
    this.mouseState = { x, y, buttons };
    this.wasm4.setMouse(x, y, buttons);
  }

  /**
   * Map keyboard to gamepad
   */
  handleKeyDown(key: string): void {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.setButton(BUTTON.UP, true);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.setButton(BUTTON.DOWN, true);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.setButton(BUTTON.LEFT, true);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.setButton(BUTTON.RIGHT, true);
        break;
      case 'x':
      case 'X':
      case 'j':
      case 'J':
      case ' ':
        this.setButton(BUTTON.X, true);
        break;
      case 'z':
      case 'Z':
      case 'k':
      case 'K':
        this.setButton(BUTTON.Z, true);
        break;
    }
  }

  handleKeyUp(key: string): void {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.setButton(BUTTON.UP, false);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        this.setButton(BUTTON.DOWN, false);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.setButton(BUTTON.LEFT, false);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.setButton(BUTTON.RIGHT, false);
        break;
      case 'x':
      case 'X':
      case 'j':
      case 'J':
      case ' ':
        this.setButton(BUTTON.X, false);
        break;
      case 'z':
      case 'Z':
      case 'k':
      case 'K':
        this.setButton(BUTTON.Z, false);
        break;
    }
  }

  // === Robot Control Methods ===

  /**
   * Send command to robot
   */
  sendRobotCommand(command: RobotCommand): void {
    if (!this.robot) {
      this.emit('error', { message: 'Robot not enabled' });
      return;
    }
    this.robot.sendCommand(command);
  }

  /**
   * Get robot state
   */
  getRobotState(): RobotState | null {
    return this.robot?.getState() ?? null;
  }

  /**
   * Load floor map for robot
   */
  loadFloorMap(map: FloorMap): void {
    if (this.robot) {
      this.robot.loadFloorMap(map);
    }
  }

  /**
   * Generate floor from current game framebuffer
   */
  syncFloorWithGame(): void {
    if (!this.robot) return;

    const state = this.wasm4.getState();
    const { width, height } = this.wasm4.getDimensions();
    this.robot.generateFloorFromGame(state.framebuffer, width, height);
  }

  // === ESP32 Command Methods ===

  /**
   * Send command to ESP32
   */
  async sendESP32Command(command: DeviceCommand): Promise<DeviceResponse> {
    return this.esp32.processCommand(command);
  }

  /**
   * Get ESP32 device info
   */
  async getDeviceInfo(): Promise<DeviceResponse> {
    return this.esp32.processCommand({ action: 'get_info' });
  }

  // === Display Methods ===

  /**
   * Get current framebuffer as RGBA
   */
  getFramebufferRGBA(): Uint8ClampedArray {
    return this.wasm4.getFramebufferRGBA();
  }

  /**
   * Get current framebuffer (indexed colors)
   */
  getFramebuffer(): Uint8Array {
    return this.wasm4.getState().framebuffer;
  }

  /**
   * Get display dimensions
   */
  getDimensions(): { width: number; height: number } {
    return this.wasm4.getDimensions();
  }

  /**
   * Set palette
   */
  setPalette(colors: number[]): void {
    this.wasm4.setPalette(colors);
  }

  /**
   * Draw directly to framebuffer (for JavaScript games)
   */
  drawRect(x: number, y: number, width: number, height: number): void {
    (this.wasm4 as any).rect(x, y, width, height);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    (this.wasm4 as any).line(x1, y1, x2, y2);
  }

  drawOval(x: number, y: number, width: number, height: number): void {
    (this.wasm4 as any).oval(x, y, width, height);
  }

  clear(color: number = 0): void {
    this.wasm4.clear(color);
  }

  // === State Methods ===

  getState(): WASM4VMState {
    return { ...this.state };
  }

  getConfig(): WASM4VMConfig {
    return { ...this.config };
  }

  private updateState(): void {
    this.emit('stateChange', this.state);
  }

  // === Event Methods ===

  on<T extends VMEventType>(event: T, callback: (data: VMEventData[T]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off<T extends VMEventType>(event: T, callback: (data: VMEventData[T]) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    }
  }

  private emit<T extends VMEventType>(event: T, data: VMEventData[T]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback(data);
      }
    }
  }

  // === Cleanup ===

  destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }
}

// === Singleton Instance ===

let vmInstance: ESP32WASM4VM | null = null;

export function getESP32WASM4VM(config?: Partial<WASM4VMConfig>): ESP32WASM4VM {
  if (!vmInstance) {
    vmInstance = new ESP32WASM4VM(config);
  }
  return vmInstance;
}

export function resetESP32WASM4VM(): void {
  if (vmInstance) {
    vmInstance.destroy();
    vmInstance = null;
  }
}

export default ESP32WASM4VM;
