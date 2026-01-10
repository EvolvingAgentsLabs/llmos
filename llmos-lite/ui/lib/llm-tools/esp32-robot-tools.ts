/**
 * ESP32 Robot Control Tools for LLM
 *
 * Provides LLM-callable tools for:
 * - ESP32-S3 device management
 * - Robot control and monitoring
 * - WASM4 game development
 * - Applet generation for robot UI
 */

import type { Tool } from '../agents/mcp-tools';

// === ESP32 Device Tools ===

export const ESP32_CONNECT_TOOL: Tool = {
  name: 'esp32_connect',
  description: `Connect to an ESP32-S3 device.

Supports connection modes:
- simulated: Virtual device for testing
- serial: USB serial connection (requires browser Web Serial API)
- wifi: TCP/IP connection over WiFi
- bluetooth: BLE connection

Returns device info including firmware version, chip type, and capabilities.`,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['simulated', 'serial', 'wifi', 'bluetooth'],
        description: 'Connection mode',
        default: 'simulated',
      },
      deviceId: {
        type: 'string',
        description: 'Device identifier (for WiFi: IP address, for serial: port name)',
      },
      enableRobot: {
        type: 'boolean',
        description: 'Enable robot simulation/control',
        default: true,
      },
    },
    required: [],
  },
};

export const ESP32_DISCONNECT_TOOL: Tool = {
  name: 'esp32_disconnect',
  description: 'Disconnect from the ESP32-S3 device and stop all simulations.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const ESP32_GET_INFO_TOOL: Tool = {
  name: 'esp32_get_info',
  description: `Get ESP32-S3 device information.

Returns:
- Device name and firmware version
- Chip type and CPU frequency
- Memory usage (heap, flash)
- Uptime
- Connection status`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const ESP32_GPIO_TOOL: Tool = {
  name: 'esp32_gpio',
  description: `Control ESP32-S3 GPIO pins.

Actions:
- read: Read pin state (0 or 1)
- write: Set pin state (0 or 1)
- pwm: Set PWM duty cycle (0-255)

Pins 0-47 are available on ESP32-S3.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'pwm'],
        description: 'GPIO action',
      },
      pin: {
        type: 'number',
        description: 'GPIO pin number (0-47)',
        minimum: 0,
        maximum: 47,
      },
      value: {
        type: 'number',
        description: 'Value to write (0/1 for digital, 0-255 for PWM)',
      },
    },
    required: ['action', 'pin'],
  },
};

export const ESP32_READ_SENSORS_TOOL: Tool = {
  name: 'esp32_read_sensors',
  description: `Read all ESP32 sensors at once.

Returns data from:
- IMU (accelerometer, gyroscope, orientation)
- Barometer (pressure, temperature, altitude)
- ADC pins (analog values)
- I2C sensors (power monitor, etc.)
- System info (uptime, temperature, heap)`,
  inputSchema: {
    type: 'object',
    properties: {
      sensors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific sensors to read (empty = all)',
      },
    },
    required: [],
  },
};

// === Robot Control Tools ===

export const ROBOT_MOVE_TOOL: Tool = {
  name: 'robot_move',
  description: `Control robot movement using differential drive.

The robot has 2 wheels. Set left and right wheel speeds independently:
- Positive values: forward
- Negative values: backward
- Different speeds cause turning

Examples:
- Forward: leftSpeed=50, rightSpeed=50
- Turn left: leftSpeed=-30, rightSpeed=30
- Spin in place: leftSpeed=-50, rightSpeed=50`,
  inputSchema: {
    type: 'object',
    properties: {
      leftSpeed: {
        type: 'number',
        description: 'Left wheel speed (-100 to 100)',
        minimum: -100,
        maximum: 100,
      },
      rightSpeed: {
        type: 'number',
        description: 'Right wheel speed (-100 to 100)',
        minimum: -100,
        maximum: 100,
      },
      duration: {
        type: 'number',
        description: 'Duration in milliseconds (0 = continuous)',
        default: 0,
      },
    },
    required: ['leftSpeed', 'rightSpeed'],
  },
};

export const ROBOT_STOP_TOOL: Tool = {
  name: 'robot_stop',
  description: 'Stop all robot movement immediately.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const ROBOT_GET_STATE_TOOL: Tool = {
  name: 'robot_get_state',
  description: `Get current robot state.

Returns:
- Position (x, y) and heading
- Wheel velocities
- Distance sensor readings (front, left, right)
- IMU data
- Battery level
- Current mode and game`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export const ROBOT_SET_LED_TOOL: Tool = {
  name: 'robot_set_led',
  description: `Control the 8x8 LED matrix on top of the robot.

Each LED can be set to a value 0-3 (4 colors from current palette).
The matrix is 8x8 = 64 LEDs total.`,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        enum: ['custom', 'clear', 'smile', 'arrow_up', 'arrow_down', 'heart', 'check', 'x'],
        description: 'Predefined pattern or custom',
      },
      matrix: {
        type: 'array',
        description: 'Custom 8x8 matrix (array of 8 arrays of 8 numbers)',
        items: {
          type: 'array',
          items: { type: 'number' },
        },
      },
    },
    required: ['pattern'],
  },
};

export const ROBOT_CAMERA_TOOL: Tool = {
  name: 'robot_camera',
  description: `Get camera image from robot.

The camera is 160x160 pixels (matching WASM4 display).
Returns image as indexed colors (0-3) using current palette.`,
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['indexed', 'rgba', 'base64'],
        description: 'Output format',
        default: 'indexed',
      },
    },
    required: [],
  },
};

export const ROBOT_SET_MODE_TOOL: Tool = {
  name: 'robot_set_mode',
  description: `Set robot operating mode.

Modes:
- idle: Robot stopped, waiting for commands
- manual: Direct control via move commands
- autonomous: Robot follows programmed behavior
- game: Robot reproduces WASM4 game movements`,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['idle', 'manual', 'autonomous', 'game'],
        description: 'Operating mode',
      },
      game: {
        type: 'string',
        description: 'Game to load (for game mode)',
      },
    },
    required: ['mode'],
  },
};

// === WASM4 Game Tools ===

export const WASM4_LOAD_GAME_TOOL: Tool = {
  name: 'wasm4_load_game',
  description: `Load a WASM4 game cartridge.

Available built-in games:
- snake: Classic snake game
- pong: Classic pong game
- maze-runner: Procedural maze navigation
- line-follower: Robot line following (educational)
- obstacle-course: Navigate through obstacles

Games can run on the virtual display and optionally control the robot.`,
  inputSchema: {
    type: 'object',
    properties: {
      gameId: {
        type: 'string',
        description: 'Game ID from library',
      },
      enableRobot: {
        type: 'boolean',
        description: 'Map game movements to robot',
        default: false,
      },
    },
    required: ['gameId'],
  },
};

export const WASM4_CONTROL_TOOL: Tool = {
  name: 'wasm4_control',
  description: `Control WASM4 game execution.

Actions:
- start: Start/resume game
- pause: Pause game
- stop: Stop and unload game
- reset: Reset to initial state`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'pause', 'stop', 'reset'],
        description: 'Control action',
      },
    },
    required: ['action'],
  },
};

export const WASM4_INPUT_TOOL: Tool = {
  name: 'wasm4_input',
  description: `Send input to WASM4 game.

Gamepad buttons:
- up, down, left, right: D-pad
- x: Button 1 (action)
- z: Button 2 (secondary action)

Multiple buttons can be pressed simultaneously.`,
  inputSchema: {
    type: 'object',
    properties: {
      buttons: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right', 'x', 'z'],
        },
        description: 'Buttons to press',
      },
      release: {
        type: 'boolean',
        description: 'Release buttons instead of pressing',
        default: false,
      },
    },
    required: ['buttons'],
  },
};

export const WASM4_GET_STATE_TOOL: Tool = {
  name: 'wasm4_get_state',
  description: `Get current WASM4 game state.

Returns:
- Current game name
- Frame count and FPS
- Display mode (running/paused)
- Framebuffer (as indexed colors or base64)`,
  inputSchema: {
    type: 'object',
    properties: {
      includeFramebuffer: {
        type: 'boolean',
        description: 'Include framebuffer data',
        default: false,
      },
    },
    required: [],
  },
};

export const WASM4_SET_PALETTE_TOOL: Tool = {
  name: 'wasm4_set_palette',
  description: `Set WASM4 display palette.

The palette has 4 colors. Each color is a 24-bit RGB value (0xRRGGBB).

Preset palettes:
- default: Classic gameboy green
- robot: Green/yellow/red/blue for robot status
- grayscale: Black to white gradient
- custom: Specify your own colors`,
  inputSchema: {
    type: 'object',
    properties: {
      preset: {
        type: 'string',
        enum: ['default', 'robot', 'grayscale', 'custom'],
        description: 'Palette preset',
      },
      colors: {
        type: 'array',
        items: { type: 'number' },
        description: 'Custom colors (4 RGB values)',
      },
    },
    required: ['preset'],
  },
};

// === Applet Generation Tools ===

export const GENERATE_ROBOT_APPLET_TOOL: Tool = {
  name: 'generate_robot_applet',
  description: `Generate a React applet for robot control/monitoring.

Applet types:
- controller: Gamepad-style controller for manual driving
- monitor: Real-time sensor dashboard
- game-display: WASM4 game display with controls
- camera-view: Robot camera feed
- floor-map: 2D floor map with robot position
- combined: Full robot control interface

The applet uses the ESP32 WASM4 VM and robot simulator APIs.`,
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['controller', 'monitor', 'game-display', 'camera-view', 'floor-map', 'combined'],
        description: 'Type of applet to generate',
      },
      options: {
        type: 'object',
        description: 'Additional options for the applet',
        properties: {
          theme: { type: 'string', enum: ['dark', 'light', 'retro'] },
          showFPS: { type: 'boolean' },
          enableSound: { type: 'boolean' },
          fullscreen: { type: 'boolean' },
        },
      },
    },
    required: ['type'],
  },
};

export const COMPILE_WASM_GAME_TOOL: Tool = {
  name: 'compile_wasm_game',
  description: `Compile C/Rust source code to WASM4 game cartridge.

Supports:
- C (using Clang in browser via Wasmer)
- Rust (using wasm-pack if available)
- AssemblyScript

The compiled WASM can run on the virtual display and control the robot.`,
  inputSchema: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['c', 'rust', 'assemblyscript'],
        description: 'Source language',
      },
      sourceCode: {
        type: 'string',
        description: 'Game source code',
      },
      name: {
        type: 'string',
        description: 'Game name',
      },
    },
    required: ['language', 'sourceCode', 'name'],
  },
};

export const DEPLOY_TO_DEVICE_TOOL: Tool = {
  name: 'deploy_to_device',
  description: `Deploy WASM application to physical ESP32-S3 device.

Requires active serial or WiFi connection to device.
The device must be running the WASMachine firmware.`,
  inputSchema: {
    type: 'object',
    properties: {
      wasmBytes: {
        type: 'string',
        description: 'Base64-encoded WASM binary',
      },
      appName: {
        type: 'string',
        description: 'Application name',
      },
      heapSize: {
        type: 'number',
        description: 'Heap size in bytes',
        default: 65536,
      },
    },
    required: ['wasmBytes', 'appName'],
  },
};

// === Floor Map Tools ===

export const FLOOR_MAP_TOOL: Tool = {
  name: 'floor_map',
  description: `Create or modify the robot's floor map.

The floor map defines:
- Floor dimensions (in cm)
- Obstacles (walls, objects)
- Goals (targets)
- Hazards (areas to avoid)
- Spawn point (robot starting position)

This can be used to create physical game levels for the robot.`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'addObstacle', 'removeObstacle', 'clear', 'fromGame'],
        description: 'Map action',
      },
      dimensions: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
        description: 'Floor dimensions in cm (for create)',
      },
      obstacle: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['wall', 'object', 'goal', 'hazard'] },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        description: 'Obstacle to add',
      },
      gameId: {
        type: 'string',
        description: 'Generate floor from game (for fromGame action)',
      },
    },
    required: ['action'],
  },
};

// === Tool Collection ===

export const ESP32_ROBOT_TOOLS: Tool[] = [
  // ESP32 Device
  ESP32_CONNECT_TOOL,
  ESP32_DISCONNECT_TOOL,
  ESP32_GET_INFO_TOOL,
  ESP32_GPIO_TOOL,
  ESP32_READ_SENSORS_TOOL,

  // Robot Control
  ROBOT_MOVE_TOOL,
  ROBOT_STOP_TOOL,
  ROBOT_GET_STATE_TOOL,
  ROBOT_SET_LED_TOOL,
  ROBOT_CAMERA_TOOL,
  ROBOT_SET_MODE_TOOL,

  // WASM4 Games
  WASM4_LOAD_GAME_TOOL,
  WASM4_CONTROL_TOOL,
  WASM4_INPUT_TOOL,
  WASM4_GET_STATE_TOOL,
  WASM4_SET_PALETTE_TOOL,

  // Applet Generation
  GENERATE_ROBOT_APPLET_TOOL,
  COMPILE_WASM_GAME_TOOL,
  DEPLOY_TO_DEVICE_TOOL,

  // Floor Map
  FLOOR_MAP_TOOL,
];

export default ESP32_ROBOT_TOOLS;
