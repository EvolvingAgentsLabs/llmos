/**
 * ESP32 Robot Tool Executor
 *
 * Executes LLM tool calls for ESP32-S3 devices and robot control.
 * Bridges the gap between LLM tool definitions and actual hardware/simulation.
 */

import { ESP32WASM4VM, getESP32WASM4VM, GAME_LIBRARY, type ConnectionMode } from '../hardware/esp32-wasm4-vm';
import { BUTTON, DEFAULT_PALETTE, ROBOT_PALETTE } from '../hardware/wasm4-runtime';
import type { RobotCommand, FloorObstacle } from '../hardware/cube-robot-simulator';

// Tool result interface
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// LED patterns
const LED_PATTERNS: { [key: string]: number[][] } = {
  clear: Array(8).fill(null).map(() => Array(8).fill(0)),
  smile: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  arrow_up: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,0,1,1,0,1,1],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  arrow_down: [
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [1,1,0,1,1,0,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  heart: [
    [0,0,0,0,0,0,0,0],
    [0,1,1,0,0,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  check: [
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,0],
    [0,0,0,0,0,1,1,0],
    [0,0,0,0,1,1,0,0],
    [0,1,0,1,1,0,0,0],
    [0,1,1,1,0,0,0,0],
    [0,0,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  x: [
    [0,0,0,0,0,0,0,0],
    [0,1,0,0,0,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,0,0,0,0,1,0],
    [0,0,0,0,0,0,0,0],
  ],
};

/**
 * ESP32 Robot Tool Executor
 */
export class ESP32RobotToolExecutor {
  private vm: ESP32WASM4VM | null = null;
  private moveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {}

  /**
   * Execute a tool call
   */
  async execute(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    try {
      switch (toolName) {
        // ESP32 Device
        case 'esp32_connect':
          return this.esp32Connect(args);
        case 'esp32_disconnect':
          return this.esp32Disconnect();
        case 'esp32_get_info':
          return this.esp32GetInfo();
        case 'esp32_gpio':
          return this.esp32GPIO(args);
        case 'esp32_read_sensors':
          return this.esp32ReadSensors(args);

        // Robot Control
        case 'robot_move':
          return this.robotMove(args);
        case 'robot_stop':
          return this.robotStop();
        case 'robot_get_state':
          return this.robotGetState();
        case 'robot_set_led':
          return this.robotSetLED(args);
        case 'robot_camera':
          return this.robotCamera(args);
        case 'robot_set_mode':
          return this.robotSetMode(args);

        // WASM4 Games
        case 'wasm4_load_game':
          return this.wasm4LoadGame(args);
        case 'wasm4_control':
          return this.wasm4Control(args);
        case 'wasm4_input':
          return this.wasm4Input(args);
        case 'wasm4_get_state':
          return this.wasm4GetState(args);
        case 'wasm4_set_palette':
          return this.wasm4SetPalette(args);

        // Applet Generation
        case 'generate_robot_applet':
          return this.generateRobotApplet(args);
        case 'compile_wasm_game':
          return this.compileWasmGame(args);
        case 'deploy_to_device':
          return this.deployToDevice(args);

        // Floor Map
        case 'floor_map':
          return this.floorMap(args);

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // === ESP32 Device Methods ===

  private async esp32Connect(args: Record<string, any>): Promise<ToolResult> {
    const mode = (args.mode || 'simulated') as ConnectionMode;
    const enableRobot = args.enableRobot !== false;

    this.vm = getESP32WASM4VM({
      connectionMode: mode,
      enableRobot,
      deviceId: args.deviceId,
    });

    const connected = await this.vm.connect();

    if (connected) {
      const info = await this.vm.getDeviceInfo();
      return {
        success: true,
        data: {
          connected: true,
          mode,
          robotEnabled: enableRobot,
          deviceInfo: info,
        },
      };
    }

    return { success: false, error: 'Failed to connect' };
  }

  private esp32Disconnect(): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    this.vm.disconnect();
    return { success: true, data: { disconnected: true } };
  }

  private async esp32GetInfo(): Promise<ToolResult> {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const info = await this.vm.getDeviceInfo();
    const state = this.vm.getState();

    return {
      success: true,
      data: {
        ...info,
        vmState: state,
      },
    };
  }

  private async esp32GPIO(args: Record<string, any>): Promise<ToolResult> {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { action, pin, value } = args;

    let command: { action: string; pin: number; state?: number; duty_cycle?: number };

    switch (action) {
      case 'read':
        command = { action: 'read_gpio', pin };
        break;
      case 'write':
        command = { action: 'set_gpio', pin, state: value ? 1 : 0 };
        break;
      case 'pwm':
        command = { action: 'set_pwm', pin, duty_cycle: value };
        break;
      default:
        return { success: false, error: 'Invalid action' };
    }

    const response = await this.vm.sendESP32Command(command);
    return { success: response.status === 'ok', data: response };
  }

  private async esp32ReadSensors(args: Record<string, any>): Promise<ToolResult> {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const response = await this.vm.sendESP32Command({ action: 'read_sensors' });
    return { success: response.status === 'ok', data: response };
  }

  // === Robot Control Methods ===

  private robotMove(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { leftSpeed, rightSpeed, duration } = args;

    const command: RobotCommand = {
      type: 'move',
      leftSpeed,
      rightSpeed,
    };

    this.vm.sendRobotCommand(command);

    // Handle duration
    if (duration && duration > 0) {
      if (this.moveTimeout) {
        clearTimeout(this.moveTimeout);
      }
      this.moveTimeout = setTimeout(() => {
        this.vm?.sendRobotCommand({ type: 'stop' });
      }, duration);
    }

    return {
      success: true,
      data: {
        leftSpeed,
        rightSpeed,
        duration: duration || 'continuous',
      },
    };
  }

  private robotStop(): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }

    this.vm.sendRobotCommand({ type: 'stop' });
    return { success: true, data: { stopped: true } };
  }

  private robotGetState(): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const state = this.vm.getRobotState();
    if (!state) {
      return { success: false, error: 'Robot not enabled' };
    }

    return { success: true, data: state };
  }

  private robotSetLED(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { pattern, matrix } = args;

    let ledState: number[][];

    if (pattern === 'custom' && matrix) {
      ledState = matrix;
    } else if (LED_PATTERNS[pattern]) {
      ledState = LED_PATTERNS[pattern];
    } else {
      return { success: false, error: `Unknown pattern: ${pattern}` };
    }

    this.vm.sendRobotCommand({ type: 'led', ledState });
    return { success: true, data: { pattern, ledState } };
  }

  private robotCamera(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const robotState = this.vm.getRobotState();
    if (!robotState) {
      return { success: false, error: 'Robot not enabled' };
    }

    const format = args.format || 'indexed';
    const cameraBuffer = robotState.cameraBuffer;

    let data: any = { width: 160, height: 160 };

    switch (format) {
      case 'indexed':
        data.pixels = Array.from(cameraBuffer);
        break;
      case 'rgba':
        data.pixels = this.vm.getFramebufferRGBA();
        break;
      case 'base64':
        // Convert to base64 PNG (simplified - just raw data)
        data.base64 = Buffer.from(cameraBuffer).toString('base64');
        break;
    }

    return { success: true, data };
  }

  private robotSetMode(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { mode, game } = args;

    this.vm.sendRobotCommand({
      type: 'setMode',
      mode,
      game,
    });

    return { success: true, data: { mode, game } };
  }

  // === WASM4 Game Methods ===

  private async wasm4LoadGame(args: Record<string, any>): Promise<ToolResult> {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { gameId, enableRobot } = args;

    // Find game in library
    const gameEntry = GAME_LIBRARY.find(g => g.id === gameId);
    if (!gameEntry) {
      return {
        success: false,
        error: `Game not found: ${gameId}. Available: ${GAME_LIBRARY.map(g => g.id).join(', ')}`,
      };
    }

    const loaded = await this.vm.loadGame(gameId);
    if (!loaded) {
      return { success: false, error: 'Failed to load game' };
    }

    if (enableRobot) {
      this.vm.sendRobotCommand({
        type: 'setMode',
        mode: 'game',
        game: gameId,
      });
    }

    return {
      success: true,
      data: {
        loaded: true,
        game: gameEntry,
        robotEnabled: enableRobot,
      },
    };
  }

  private wasm4Control(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { action } = args;

    switch (action) {
      case 'start':
        this.vm.start();
        break;
      case 'pause':
        this.vm.pause();
        break;
      case 'stop':
        this.vm.stop();
        break;
      case 'reset':
        this.vm.reset();
        break;
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }

    return { success: true, data: { action, state: this.vm.getState() } };
  }

  private wasm4Input(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { buttons, release } = args;

    const buttonMap: Record<string, number> = {
      up: BUTTON.UP,
      down: BUTTON.DOWN,
      left: BUTTON.LEFT,
      right: BUTTON.RIGHT,
      x: BUTTON.X,
      z: BUTTON.Z,
    };

    let buttonMask = 0;
    for (const btn of buttons) {
      if (buttonMap[btn]) {
        buttonMask |= buttonMap[btn];
      }
    }

    if (release) {
      // Release buttons
      for (const btn of buttons) {
        this.vm.setButton(buttonMap[btn], false);
      }
    } else {
      // Press buttons
      for (const btn of buttons) {
        this.vm.setButton(buttonMap[btn], true);
      }
    }

    return { success: true, data: { buttons, release: !!release, buttonMask } };
  }

  private wasm4GetState(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const state = this.vm.getState();
    const dimensions = this.vm.getDimensions();

    const result: any = {
      ...state,
      dimensions,
    };

    if (args.includeFramebuffer) {
      result.framebuffer = Array.from(this.vm.getFramebuffer());
    }

    return { success: true, data: result };
  }

  private wasm4SetPalette(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { preset, colors } = args;

    let palette: number[];

    switch (preset) {
      case 'default':
        palette = DEFAULT_PALETTE;
        break;
      case 'robot':
        palette = ROBOT_PALETTE;
        break;
      case 'grayscale':
        palette = [0xffffff, 0xaaaaaa, 0x555555, 0x000000];
        break;
      case 'custom':
        if (!colors || colors.length !== 4) {
          return { success: false, error: 'Custom palette requires 4 colors' };
        }
        palette = colors;
        break;
      default:
        return { success: false, error: `Unknown preset: ${preset}` };
    }

    this.vm.setPalette(palette);
    return { success: true, data: { preset, palette } };
  }

  // === Applet Generation Methods ===

  private generateRobotApplet(args: Record<string, any>): ToolResult {
    const { type, options } = args;
    const theme = options?.theme || 'dark';
    const showFPS = options?.showFPS !== false;

    let appletCode: string;

    switch (type) {
      case 'controller':
        appletCode = this.generateControllerApplet(theme, showFPS);
        break;
      case 'monitor':
        appletCode = this.generateMonitorApplet(theme);
        break;
      case 'game-display':
        appletCode = this.generateGameDisplayApplet(theme, showFPS);
        break;
      case 'camera-view':
        appletCode = this.generateCameraViewApplet(theme);
        break;
      case 'floor-map':
        appletCode = this.generateFloorMapApplet(theme);
        break;
      case 'combined':
        appletCode = this.generateCombinedApplet(theme, showFPS);
        break;
      default:
        return { success: false, error: `Unknown applet type: ${type}` };
    }

    return {
      success: true,
      data: {
        type,
        code: appletCode,
        metadata: {
          name: `Robot ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          description: `ESP32 Robot ${type} applet`,
          tags: ['robot', 'esp32', 'wasm4', type],
        },
      },
    };
  }

  private generateControllerApplet(theme: string, showFPS: boolean): string {
    return `
// Robot Controller Applet
const RobotController = () => {
  const [connected, setConnected] = React.useState(false);
  const [speed, setSpeed] = React.useState({ left: 0, right: 0 });
  const canvasRef = React.useRef(null);

  const connect = async () => {
    const vm = window.getESP32WASM4VM?.();
    if (vm) {
      await vm.connect();
      setConnected(true);
    }
  };

  const move = (left, right) => {
    setSpeed({ left, right });
    const vm = window.getESP32WASM4VM?.();
    vm?.sendRobotCommand({ type: 'move', leftSpeed: left, rightSpeed: right });
  };

  const stop = () => {
    move(0, 0);
  };

  const buttonStyle = {
    width: 60, height: 60, borderRadius: 8,
    background: '${theme === 'dark' ? '#333' : '#ddd'}',
    border: 'none', color: '${theme === 'dark' ? '#fff' : '#000'}',
    fontSize: 20, cursor: 'pointer',
  };

  return (
    <div style={{ padding: 20, background: '${theme === 'dark' ? '#1a1a1a' : '#f0f0f0'}', minHeight: 300 }}>
      <h3 style={{ color: '${theme === 'dark' ? '#fff' : '#000'}' }}>Robot Controller</h3>

      {!connected ? (
        <button onClick={connect} style={{ ...buttonStyle, width: 120 }}>Connect</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* D-Pad */}
          <button style={buttonStyle} onMouseDown={() => move(50, 50)} onMouseUp={stop}>▲</button>
          <div style={{ display: 'flex', gap: 60 }}>
            <button style={buttonStyle} onMouseDown={() => move(-30, 30)} onMouseUp={stop}>◀</button>
            <button style={buttonStyle} onMouseDown={() => move(30, -30)} onMouseUp={stop}>▶</button>
          </div>
          <button style={buttonStyle} onMouseDown={() => move(-50, -50)} onMouseUp={stop}>▼</button>

          {/* Speed display */}
          <div style={{ color: '${theme === 'dark' ? '#888' : '#666'}', marginTop: 20 }}>
            L: {speed.left}% | R: {speed.right}%
          </div>
        </div>
      )}
    </div>
  );
};

render(<RobotController />);
`;
  }

  private generateMonitorApplet(theme: string): string {
    return `
// Robot Monitor Applet
const RobotMonitor = () => {
  const [state, setState] = React.useState(null);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const vm = window.getESP32WASM4VM?.();
      if (vm) {
        const robotState = vm.getRobotState();
        setState(robotState);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  if (!state) {
    return <div style={{ padding: 20, color: '${theme === 'dark' ? '#888' : '#666'}' }}>Connecting...</div>;
  }

  const labelStyle = { color: '${theme === 'dark' ? '#888' : '#666'}', fontSize: 12 };
  const valueStyle = { color: '${theme === 'dark' ? '#fff' : '#000'}', fontSize: 16, fontWeight: 'bold' };

  return (
    <div style={{ padding: 20, background: '${theme === 'dark' ? '#1a1a1a' : '#f0f0f0'}', fontFamily: 'monospace' }}>
      <h3 style={{ color: '${theme === 'dark' ? '#fff' : '#000'}' }}>Robot Status</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 15 }}>
        <div>
          <div style={labelStyle}>Position</div>
          <div style={valueStyle}>X: {state.x?.toFixed(1)} Y: {state.y?.toFixed(1)}</div>
        </div>
        <div>
          <div style={labelStyle}>Heading</div>
          <div style={valueStyle}>{state.heading?.toFixed(1)}°</div>
        </div>
        <div>
          <div style={labelStyle}>Distance Front</div>
          <div style={valueStyle}>{state.distanceFront?.toFixed(1)} cm</div>
        </div>
        <div>
          <div style={labelStyle}>Battery</div>
          <div style={{ ...valueStyle, color: state.batteryPercent > 20 ? '#4f4' : '#f44' }}>
            {state.batteryPercent?.toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={labelStyle}>Mode</div>
          <div style={valueStyle}>{state.mode}</div>
        </div>
        <div>
          <div style={labelStyle}>Velocity</div>
          <div style={valueStyle}>{state.linearVelocity?.toFixed(1)} cm/s</div>
        </div>
      </div>
    </div>
  );
};

render(<RobotMonitor />);
`;
  }

  private generateGameDisplayApplet(theme: string, showFPS: boolean): string {
    return `
// WASM4 Game Display Applet
const GameDisplay = () => {
  const canvasRef = React.useRef(null);
  const [game, setGame] = React.useState(null);
  const [fps, setFps] = React.useState(0);

  React.useEffect(() => {
    const vm = window.getESP32WASM4VM?.();
    if (!vm) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    vm.on('frameUpdate', ({ framebuffer, frame }) => {
      const rgba = vm.getFramebufferRGBA();
      const imageData = new ImageData(rgba, 160, 160);
      ctx.putImageData(imageData, 0, 0);
    });

    vm.on('stateChange', (state) => {
      setGame(state.game);
      setFps(state.fps);
    });

    return () => vm.disconnect();
  }, []);

  const handleKey = (e) => {
    const vm = window.getESP32WASM4VM?.();
    if (e.type === 'keydown') vm?.handleKeyDown(e.key);
    else vm?.handleKeyUp(e.key);
  };

  return (
    <div
      style={{ background: '#000', padding: 10 }}
      tabIndex={0}
      onKeyDown={handleKey}
      onKeyUp={handleKey}
    >
      <canvas
        ref={canvasRef}
        width={160}
        height={160}
        style={{
          width: 320,
          height: 320,
          imageRendering: 'pixelated',
          border: '2px solid #333'
        }}
      />
      ${showFPS ? `<div style={{ color: '#0f0', fontFamily: 'monospace', fontSize: 12 }}>
        {game} | {fps} FPS
      </div>` : ''}
    </div>
  );
};

render(<GameDisplay />);
`;
  }

  private generateCameraViewApplet(theme: string): string {
    return `
// Robot Camera View Applet
const CameraView = () => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const vm = window.getESP32WASM4VM?.();
    if (!vm) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const updateCamera = () => {
      const state = vm.getRobotState();
      if (!state) return;

      const rgba = vm.getFramebufferRGBA();
      const imageData = new ImageData(rgba, 160, 160);
      ctx.putImageData(imageData, 0, 0);
    };

    const interval = setInterval(updateCamera, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: '#000', padding: 10 }}>
      <h4 style={{ color: '#0f0', fontFamily: 'monospace' }}>Camera Feed</h4>
      <canvas
        ref={canvasRef}
        width={160}
        height={160}
        style={{
          width: 320,
          height: 320,
          imageRendering: 'pixelated',
          border: '2px solid #0f0'
        }}
      />
    </div>
  );
};

render(<CameraView />);
`;
  }

  private generateFloorMapApplet(theme: string): string {
    return `
// Floor Map Applet
const FloorMap = () => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const vm = window.getESP32WASM4VM?.();
    if (!vm) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const render = () => {
      const state = vm.getRobotState();
      if (!state) return;

      // Clear
      ctx.fillStyle = '${theme === 'dark' ? '#1a1a1a' : '#f0f0f0'}';
      ctx.fillRect(0, 0, 300, 300);

      // Draw grid
      ctx.strokeStyle = '${theme === 'dark' ? '#333' : '#ddd'}';
      for (let i = 0; i <= 300; i += 30) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, 300);
        ctx.moveTo(0, i); ctx.lineTo(300, i);
        ctx.stroke();
      }

      // Draw robot
      const scale = 300 / 200; // 200cm floor
      const rx = state.x * scale;
      const ry = state.y * scale;
      const angle = state.heading * Math.PI / 180;

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(angle);

      // Robot body
      ctx.fillStyle = '#4a4';
      ctx.fillRect(-7.5, -7.5, 15, 15);

      // Direction indicator
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.fill();

      ctx.restore();

      // Distance sensors
      ctx.strokeStyle = '#f44';
      const drawSensor = (dist, offsetAngle) => {
        const a = (state.heading + offsetAngle) * Math.PI / 180;
        const d = Math.min(dist, 50) * scale;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.sin(a) * d, ry - Math.cos(a) * d);
        ctx.stroke();
      };
      drawSensor(state.distanceFront, 0);
      drawSensor(state.distanceLeft, -90);
      drawSensor(state.distanceRight, 90);
    };

    const interval = setInterval(render, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 10, background: '${theme === 'dark' ? '#1a1a1a' : '#f0f0f0'}' }}>
      <h4 style={{ color: '${theme === 'dark' ? '#fff' : '#000'}' }}>Floor Map</h4>
      <canvas ref={canvasRef} width={300} height={300} style={{ border: '1px solid #333' }} />
    </div>
  );
};

render(<FloorMap />);
`;
  }

  private generateCombinedApplet(theme: string, showFPS: boolean): string {
    return `
// Combined Robot Control Applet
const CombinedRobotUI = () => {
  const canvasRef = React.useRef(null);
  const [connected, setConnected] = React.useState(false);
  const [state, setState] = React.useState(null);
  const [game, setGame] = React.useState(null);

  React.useEffect(() => {
    const vm = window.getESP32WASM4VM?.();
    if (!vm) return;

    vm.connect().then(() => setConnected(true));

    vm.on('frameUpdate', ({ framebuffer }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const rgba = vm.getFramebufferRGBA();
      const imageData = new ImageData(rgba, 160, 160);
      ctx.putImageData(imageData, 0, 0);
    });

    vm.on('stateChange', (s) => setGame(s.game));

    const interval = setInterval(() => {
      setState(vm.getRobotState());
    }, 100);

    return () => { clearInterval(interval); vm.disconnect(); };
  }, []);

  const handleKey = (e) => {
    const vm = window.getESP32WASM4VM?.();
    if (e.type === 'keydown') vm?.handleKeyDown(e.key);
    else vm?.handleKeyUp(e.key);
  };

  const loadGame = (id) => {
    const vm = window.getESP32WASM4VM?.();
    vm?.loadGame(id).then(() => vm?.start());
  };

  const btnStyle = {
    padding: '8px 16px', margin: 4, borderRadius: 4,
    background: '${theme === 'dark' ? '#333' : '#ddd'}',
    border: 'none', color: '${theme === 'dark' ? '#fff' : '#000'}',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        padding: 20,
        background: '${theme === 'dark' ? '#1a1a1a' : '#f0f0f0'}',
        fontFamily: 'monospace'
      }}
      tabIndex={0}
      onKeyDown={handleKey}
      onKeyUp={handleKey}
    >
      {/* Game Display */}
      <div>
        <canvas
          ref={canvasRef}
          width={160}
          height={160}
          style={{
            width: 320,
            height: 320,
            imageRendering: 'pixelated',
            border: '2px solid #0f0'
          }}
        />
        <div style={{ color: '#0f0', fontSize: 12 }}>{game || 'No game loaded'}</div>
        <div style={{ marginTop: 10 }}>
          <button style={btnStyle} onClick={() => loadGame('snake')}>Snake</button>
          <button style={btnStyle} onClick={() => loadGame('pong')}>Pong</button>
          <button style={btnStyle} onClick={() => loadGame('maze-runner')}>Maze</button>
        </div>
      </div>

      {/* Status Panel */}
      <div style={{ color: '${theme === 'dark' ? '#fff' : '#000'}' }}>
        <h4>Robot Status</h4>
        {state ? (
          <div style={{ fontSize: 14 }}>
            <div>Position: ({state.x?.toFixed(0)}, {state.y?.toFixed(0)})</div>
            <div>Heading: {state.heading?.toFixed(0)}°</div>
            <div>Distance: {state.distanceFront?.toFixed(0)}cm</div>
            <div>Battery: {state.batteryPercent?.toFixed(0)}%</div>
            <div>Mode: {state.mode}</div>
          </div>
        ) : (
          <div style={{ color: '#888' }}>Connecting...</div>
        )}

        <h4 style={{ marginTop: 20 }}>Controls</h4>
        <div style={{ fontSize: 12, color: '#888' }}>
          Arrow keys or WASD to move<br/>
          X/Z for action buttons
        </div>
      </div>
    </div>
  );
};

render(<CombinedRobotUI />);
`;
  }

  private async compileWasmGame(args: Record<string, any>): Promise<ToolResult> {
    // This would use the WASM compiler
    // For now, return a placeholder
    return {
      success: true,
      data: {
        message: 'WASM compilation not yet implemented in browser',
        language: args.language,
        name: args.name,
        sourceLength: args.sourceCode?.length || 0,
      },
    };
  }

  private async deployToDevice(args: Record<string, any>): Promise<ToolResult> {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const state = this.vm.getState();
    if (!state.connected) {
      return { success: false, error: 'Device not connected' };
    }

    // Would deploy via TCP to real device
    return {
      success: true,
      data: {
        message: 'Deployment simulated (real device not connected)',
        appName: args.appName,
        heapSize: args.heapSize || 65536,
      },
    };
  }

  private floorMap(args: Record<string, any>): ToolResult {
    if (!this.vm) {
      return { success: false, error: 'Not connected' };
    }

    const { action, dimensions, obstacle, gameId } = args;

    switch (action) {
      case 'create':
        if (dimensions) {
          this.vm.loadFloorMap({
            width: dimensions.width,
            height: dimensions.height,
            obstacles: [],
            goals: [],
            spawnPoint: { x: dimensions.width / 2, y: dimensions.height / 2, heading: 0 },
          });
        }
        return { success: true, data: { created: true, dimensions } };

      case 'addObstacle':
        if (obstacle) {
          // Would add obstacle to floor map
          return { success: true, data: { added: obstacle } };
        }
        return { success: false, error: 'Obstacle required' };

      case 'clear':
        // Would clear obstacles
        return { success: true, data: { cleared: true } };

      case 'fromGame':
        if (gameId) {
          this.vm.syncFloorWithGame();
          return { success: true, data: { synced: true, gameId } };
        }
        return { success: false, error: 'Game ID required' };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}

// Singleton instance
let executorInstance: ESP32RobotToolExecutor | null = null;

export function getESP32RobotToolExecutor(): ESP32RobotToolExecutor {
  if (!executorInstance) {
    executorInstance = new ESP32RobotToolExecutor();
  }
  return executorInstance;
}

export default ESP32RobotToolExecutor;
