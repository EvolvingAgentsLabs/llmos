/**
 * ESP32 WASM4 Tools for LLM
 *
 * LLM-callable tools for controlling ESP32-S3 devices running WASM4 games
 * and cube robot simulations.
 *
 * These tools enable natural language control of:
 * - Device connection and management
 * - Robot movement and LED control
 * - WASM4 game loading and interaction
 * - Floor map configuration
 * - Fleet management
 */

import { ToolDefinition } from '../system-tools';
import {
  getDeviceManager,
  ESP32DeviceManager,
  DeviceCommand,
  FLOOR_MAPS,
} from '../hardware/esp32-device-manager';
import { GAME_TEMPLATES, GAME_MODE } from '../hardware/esp32-wasm4-vm';
import { FloorMap } from '../hardware/cube-robot-simulator';

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Virtual Device Tool
 */
export const CreateVirtualDeviceTool: ToolDefinition = {
  id: 'create-virtual-device',
  name: 'Create Virtual Device',
  description: `Create a virtual ESP32-S3 cube robot for simulation.

Use this tool when:
- Testing robot behaviors without physical hardware
- Developing WASM4 games for robots
- Demonstrating robot capabilities
- Multi-robot simulation scenarios

The virtual device includes:
- Full WASM4 fantasy console (160x160 display)
- Cube robot physics simulation
- 8 distance sensors + 5 line sensors
- RGB LED control
- Battery simulation`,
  inputs: [
    {
      name: 'name',
      type: 'string',
      description: 'Optional name for the device (default: auto-generated)',
      required: false,
    },
    {
      name: 'mapName',
      type: 'string',
      description: 'Floor map preset: "ovalTrack", "maze", "figure8", "obstacleArena" (default: ovalTrack)',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { name, mapName } = inputs;
    const manager = getDeviceManager();

    // Get floor map
    const floorMap = mapName && FLOOR_MAPS[mapName as keyof typeof FLOOR_MAPS]
      ? FLOOR_MAPS[mapName as keyof typeof FLOOR_MAPS]()
      : undefined;

    const config = floorMap ? { floorMap } : undefined;
    const deviceId = await manager.createVirtualDevice(name, config);

    const device = manager.getDevice(deviceId);

    return {
      success: true,
      deviceId,
      name: device?.name,
      type: 'virtual',
      status: device?.status,
      mapName: mapName || 'ovalTrack',
      message: `Created virtual robot "${device?.name}" (${deviceId}). Use drive-robot to control movement.`,
    };
  },
};

/**
 * List Devices Tool
 */
export const ListRobotDevicesTool: ToolDefinition = {
  id: 'list-robot-devices',
  name: 'List Robot Devices',
  description: 'List all connected ESP32 cube robots (virtual and physical).',
  inputs: [],
  execute: async () => {
    const manager = getDeviceManager();
    const devices = manager.listDevices();

    return {
      success: true,
      count: devices.length,
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        firmwareName: d.firmwareName || 'none',
        lastSeen: new Date(d.lastSeen).toISOString(),
      })),
      message: `Found ${devices.length} robot device(s)`,
    };
  },
};

/**
 * Disconnect Device Tool
 */
export const DisconnectRobotDeviceTool: ToolDefinition = {
  id: 'disconnect-robot-device',
  name: 'Disconnect Robot Device',
  description: 'Disconnect and remove a robot device from the manager.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID to disconnect',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const device = manager.getDevice(deviceId);
    if (!device) {
      return {
        success: false,
        error: `Device not found: ${deviceId}`,
      };
    }

    await manager.disconnectDevice(deviceId);

    return {
      success: true,
      deviceId,
      name: device.name,
      message: `Disconnected robot "${device.name}"`,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ROBOT CONTROL TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Drive Robot Tool
 */
export const DriveRobotTool: ToolDefinition = {
  id: 'drive-robot',
  name: 'Drive Robot',
  description: `Control robot movement using differential drive motors.

Motor values range from -255 (full reverse) to 255 (full forward).

Examples:
- Forward: left=150, right=150
- Backward: left=-150, right=-150
- Spin left: left=-100, right=100
- Spin right: left=100, right=-100
- Turn left while forward: left=80, right=150
- Stop: left=0, right=0`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot to control',
      required: true,
    },
    {
      name: 'left',
      type: 'number',
      description: 'Left motor power (-255 to 255)',
      required: true,
    },
    {
      name: 'right',
      type: 'number',
      description: 'Right motor power (-255 to 255)',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, left, right } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, {
      type: 'drive',
      payload: { left, right },
    });

    if (!success) {
      return {
        success: false,
        error: `Failed to send drive command to ${deviceId}`,
      };
    }

    return {
      success: true,
      deviceId,
      motors: { left, right },
      message: `Robot motors set: L=${left}, R=${right}`,
    };
  },
};

/**
 * Stop Robot Tool
 */
export const StopRobotTool: ToolDefinition = {
  id: 'stop-robot',
  name: 'Stop Robot',
  description: 'Stop all motors on the robot.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot to stop',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, {
      type: 'drive',
      payload: { left: 0, right: 0 },
    });

    return {
      success,
      deviceId,
      message: success ? 'Robot stopped' : 'Failed to stop robot',
    };
  },
};

/**
 * Set Robot LED Tool
 */
export const SetRobotLEDTool: ToolDefinition = {
  id: 'set-robot-led',
  name: 'Set Robot LED',
  description: `Set the RGB LED color on the robot.

Color values range from 0-255 for each channel.

Common colors:
- Red: r=255, g=0, b=0
- Green: r=0, g=255, b=0
- Blue: r=0, g=0, b=255
- Yellow: r=255, g=255, b=0
- Cyan: r=0, g=255, b=255
- Magenta: r=255, g=0, b=255
- White: r=255, g=255, b=255
- Off: r=0, g=0, b=0`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
    {
      name: 'r',
      type: 'number',
      description: 'Red channel (0-255)',
      required: true,
    },
    {
      name: 'g',
      type: 'number',
      description: 'Green channel (0-255)',
      required: true,
    },
    {
      name: 'b',
      type: 'number',
      description: 'Blue channel (0-255)',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, r, g, b } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, {
      type: 'led',
      payload: { r, g, b },
    });

    return {
      success,
      deviceId,
      led: { r, g, b },
      message: success ? `LED set to RGB(${r}, ${g}, ${b})` : 'Failed to set LED',
    };
  },
};

/**
 * Get Robot State Tool
 */
export const GetRobotStateTool: ToolDefinition = {
  id: 'get-robot-state',
  name: 'Get Robot State',
  description: 'Get the current state of a robot including position, sensors, and battery.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const state = manager.getDeviceState(deviceId);
    if (!state) {
      return {
        success: false,
        error: `Device not found or has no state: ${deviceId}`,
      };
    }

    return {
      success: true,
      deviceId,
      running: state.running,
      gameMode: state.gameMode === GAME_MODE.DISPLAY ? 'display' :
                state.gameMode === GAME_MODE.ROBOT ? 'robot' : 'hybrid',
      robot: {
        pose: {
          x: state.robot.pose.x.toFixed(3),
          y: state.robot.pose.y.toFixed(3),
          rotation: (state.robot.pose.rotation * 180 / Math.PI).toFixed(1) + '°',
        },
        motors: state.robot.motors,
        sensors: {
          distanceFront: state.robot.sensors.distance.front + 'cm',
          distanceLeft: state.robot.sensors.distance.left + 'cm',
          distanceRight: state.robot.sensors.distance.right + 'cm',
          lineSensors: state.robot.sensors.line,
          bumperFront: state.robot.sensors.bumper.front,
        },
        battery: {
          percentage: state.robot.battery.percentage + '%',
          voltage: state.robot.battery.voltage + 'V',
        },
        led: state.robot.led,
      },
      uptime: Math.round(state.uptime / 1000) + 's',
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GAME MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load Game Tool
 */
export const LoadRobotGameTool: ToolDefinition = {
  id: 'load-robot-game',
  name: 'Load Robot Game',
  description: `Load a WASM4 game template onto the robot.

Available games:
- snake: Classic snake game (display only)
- pong: Pong game with AI opponent
- lineFollower: Line following robot game
- obstacleAvoidance: Autonomous obstacle avoidance
- mazeRunner: Maze solving with wall following

Games with "robot" in description control the robot movement.
Games without it are display-only WASM4 games.`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
    {
      name: 'gameName',
      type: 'string',
      description: 'Game name: snake, pong, lineFollower, obstacleAvoidance, mazeRunner',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, gameName } = inputs;
    const manager = getDeviceManager();

    if (!GAME_TEMPLATES[gameName as keyof typeof GAME_TEMPLATES]) {
      return {
        success: false,
        error: `Unknown game: ${gameName}`,
        availableGames: Object.keys(GAME_TEMPLATES),
      };
    }

    const success = await manager.loadGameTemplate(deviceId, gameName as keyof typeof GAME_TEMPLATES);

    return {
      success,
      deviceId,
      gameName,
      message: success ? `Loaded game "${gameName}" on device` : `Failed to load game`,
      hint: success ? 'Use start-robot-device to run the game' : undefined,
    };
  },
};

/**
 * List Games Tool
 */
export const ListRobotGamesTool: ToolDefinition = {
  id: 'list-robot-games',
  name: 'List Robot Games',
  description: 'List all available WASM4 game templates for the robot.',
  inputs: [],
  execute: async () => {
    const games = Object.keys(GAME_TEMPLATES).map(name => {
      const isRobotGame = ['lineFollower', 'obstacleAvoidance', 'mazeRunner'].includes(name);
      return {
        name,
        type: isRobotGame ? 'robot' : 'display',
        description: getGameDescription(name),
      };
    });

    return {
      success: true,
      games,
      count: games.length,
    };
  },
};

function getGameDescription(name: string): string {
  switch (name) {
    case 'snake': return 'Classic snake game - eat food and grow without hitting yourself';
    case 'pong': return 'Pong game with AI opponent';
    case 'lineFollower': return 'Robot follows line track using line sensors';
    case 'obstacleAvoidance': return 'Robot autonomously avoids obstacles using distance sensors';
    case 'mazeRunner': return 'Robot solves maze using wall-following algorithm';
    default: return 'Unknown game';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE LIFECYCLE TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start Device Tool
 */
export const StartRobotDeviceTool: ToolDefinition = {
  id: 'start-robot-device',
  name: 'Start Robot Device',
  description: 'Start the robot simulation/game execution.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, { type: 'start' });

    return {
      success,
      deviceId,
      message: success ? 'Robot device started' : 'Failed to start device',
    };
  },
};

/**
 * Stop Device Tool
 */
export const StopRobotDeviceTool: ToolDefinition = {
  id: 'stop-robot-device',
  name: 'Stop Robot Device',
  description: 'Stop the robot simulation/game execution.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, { type: 'stop' });

    return {
      success,
      deviceId,
      message: success ? 'Robot device stopped' : 'Failed to stop device',
    };
  },
};

/**
 * Reset Device Tool
 */
export const ResetRobotDeviceTool: ToolDefinition = {
  id: 'reset-robot-device',
  name: 'Reset Robot Device',
  description: 'Reset the robot to initial position and state.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId } = inputs;
    const manager = getDeviceManager();

    const success = await manager.sendCommand(deviceId, { type: 'reset' });

    return {
      success,
      deviceId,
      message: success ? 'Robot device reset to initial state' : 'Failed to reset device',
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FLOOR MAP TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set Floor Map Tool
 */
export const SetFloorMapTool: ToolDefinition = {
  id: 'set-floor-map',
  name: 'Set Floor Map',
  description: `Set the floor map for robot simulation.

Available preset maps:
- ovalTrack: Simple oval line-following track
- maze: Maze with walls and obstacles
- figure8: Figure-8 track for line following
- obstacleArena: Open arena with scattered obstacles`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
    {
      name: 'mapName',
      type: 'string',
      description: 'Map preset name: ovalTrack, maze, figure8, obstacleArena',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, mapName } = inputs;
    const manager = getDeviceManager();

    if (!FLOOR_MAPS[mapName as keyof typeof FLOOR_MAPS]) {
      return {
        success: false,
        error: `Unknown map: ${mapName}`,
        availableMaps: Object.keys(FLOOR_MAPS),
      };
    }

    const success = manager.setMapByName(deviceId, mapName as keyof typeof FLOOR_MAPS);

    return {
      success,
      deviceId,
      mapName,
      message: success ? `Floor map set to "${mapName}"` : 'Failed to set floor map',
    };
  },
};

/**
 * List Floor Maps Tool
 */
export const ListFloorMapsTool: ToolDefinition = {
  id: 'list-floor-maps',
  name: 'List Floor Maps',
  description: 'List all available floor map presets.',
  inputs: [],
  execute: async () => {
    const maps = Object.keys(FLOOR_MAPS).map(name => ({
      name,
      description: getMapDescription(name),
    }));

    return {
      success: true,
      maps,
      count: maps.length,
    };
  },
};

function getMapDescription(name: string): string {
  switch (name) {
    case 'ovalTrack': return 'Simple oval track for line-following practice';
    case 'maze': return 'Maze with walls and obstacles for navigation';
    case 'figure8': return 'Figure-8 shaped track with crossing';
    case 'obstacleArena': return 'Open arena with random obstacles for avoidance testing';
    default: return 'Unknown map';
  }
}

/**
 * Create Custom Floor Map Tool
 */
export const CreateFloorMapTool: ToolDefinition = {
  id: 'create-floor-map',
  name: 'Create Custom Floor Map',
  description: `Create a custom floor map for robot simulation.

The map consists of:
- bounds: Arena boundaries {minX, maxX, minY, maxY}
- walls: Line segments [{x1, y1, x2, y2}, ...]
- obstacles: Circles [{x, y, radius}, ...]
- lines: Line tracks [{points: [{x, y}, ...], width, color}, ...]
- checkpoints: Goal positions [{x, y}, ...]
- startPosition: Robot start {x, y, rotation}

Coordinates are in meters. Typical arena is 2x2 meters (-1 to 1).`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot',
      required: true,
    },
    {
      name: 'map',
      type: 'object',
      description: 'Custom floor map configuration object',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, map } = inputs;
    const manager = getDeviceManager();

    // Validate map structure
    if (!map.bounds || !map.walls || !map.startPosition) {
      return {
        success: false,
        error: 'Invalid map: must include bounds, walls, and startPosition',
      };
    }

    const floorMap: FloorMap = {
      bounds: map.bounds,
      walls: map.walls || [],
      obstacles: map.obstacles || [],
      lines: map.lines || [],
      checkpoints: map.checkpoints || [],
      startPosition: map.startPosition,
    };

    const success = manager.setDeviceMap(deviceId, floorMap);

    return {
      success,
      deviceId,
      message: success ? 'Custom floor map applied' : 'Failed to apply floor map',
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FLEET MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start All Devices Tool
 */
export const StartAllDevicesTool: ToolDefinition = {
  id: 'start-all-robot-devices',
  name: 'Start All Robot Devices',
  description: 'Start simulation on all connected robot devices.',
  inputs: [],
  execute: async () => {
    const manager = getDeviceManager();
    await manager.startAll();

    const devices = manager.listDevices();

    return {
      success: true,
      devicesStarted: devices.length,
      message: `Started ${devices.length} robot device(s)`,
    };
  },
};

/**
 * Stop All Devices Tool
 */
export const StopAllDevicesTool: ToolDefinition = {
  id: 'stop-all-robot-devices',
  name: 'Stop All Robot Devices',
  description: 'Stop simulation on all connected robot devices.',
  inputs: [],
  execute: async () => {
    const manager = getDeviceManager();
    await manager.stopAll();

    const devices = manager.listDevices();

    return {
      success: true,
      devicesStopped: devices.length,
      message: `Stopped ${devices.length} robot device(s)`,
    };
  },
};

/**
 * Reset All Devices Tool
 */
export const ResetAllDevicesTool: ToolDefinition = {
  id: 'reset-all-robot-devices',
  name: 'Reset All Robot Devices',
  description: 'Reset all connected robot devices to initial state.',
  inputs: [],
  execute: async () => {
    const manager = getDeviceManager();
    await manager.resetAll();

    const devices = manager.listDevices();

    return {
      success: true,
      devicesReset: devices.length,
      message: `Reset ${devices.length} robot device(s)`,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// APPLET GENERATION TOOL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate Robot Control Applet Tool
 */
export const GenerateRobotAppletTool: ToolDefinition = {
  id: 'generate-robot-applet',
  name: 'Generate Robot Control Applet',
  description: `Generate a React applet for controlling a robot with a visual interface.

The applet includes:
- Joystick or D-pad controls
- LED color picker
- Sensor display
- Battery indicator
- Start/Stop buttons`,
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID of the robot to control',
      required: true,
    },
    {
      name: 'style',
      type: 'string',
      description: 'Control style: "joystick" or "dpad" (default: dpad)',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, style = 'dpad' } = inputs;
    const manager = getDeviceManager();

    const device = manager.getDevice(deviceId);
    if (!device) {
      return {
        success: false,
        error: `Device not found: ${deviceId}`,
      };
    }

    // Generate applet code
    const appletCode = generateRobotControlApplet(deviceId, device.name, style);

    return {
      success: true,
      deviceId,
      deviceName: device.name,
      appletCode,
      message: `Generated ${style} control applet for "${device.name}"`,
      _isApplet: true,
      _appletName: `${device.name} Controller`,
      _appletDescription: `Control panel for robot ${device.name}`,
    };
  },
};

function generateRobotControlApplet(deviceId: string, deviceName: string, style: string): string {
  if (style === 'joystick') {
    return `
function Applet() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [led, setLed] = useState({ r: 0, g: 255, b: 0 });
  const [status, setStatus] = useState('Ready');

  function handleJoystick(x, y) {
    const left = Math.round((y + x) * 255 / 2);
    const right = Math.round((y - x) * 255 / 2);
    setPosition({ x, y });
    setStatus(\`L:\${left} R:\${right}\`);
  }

  function handleLedChange(color) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    setLed({ r, g, b });
  }

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4">${deviceName} Control</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">Joystick</h3>
          <div className="relative w-32 h-32 bg-gray-700 rounded-full mx-auto"
               onMouseMove={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                 const y = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
                 handleJoystick(x, y);
               }}
               onMouseLeave={() => handleJoystick(0, 0)}>
            <div className="absolute bg-blue-500 w-8 h-8 rounded-full"
                 style={{
                   left: \`calc(50% + \${position.x * 40}px - 16px)\`,
                   top: \`calc(50% - \${position.y * 40}px - 16px)\`
                 }}/>
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-sm text-gray-400 mb-2">LED Color</h3>
          <input type="color"
                 value={\`#\${led.r.toString(16).padStart(2,'0')}\${led.g.toString(16).padStart(2,'0')}\${led.b.toString(16).padStart(2,'0')}\`}
                 onChange={(e) => handleLedChange(e.target.value)}
                 className="w-full h-12 rounded cursor-pointer"/>
        </div>
      </div>

      <div className="mt-4 p-2 bg-gray-800 rounded text-center">
        {status}
      </div>
    </div>
  );
}`;
  }

  // D-pad style
  return `
function Applet() {
  const [motors, setMotors] = useState({ left: 0, right: 0 });
  const [led, setLed] = useState({ r: 0, g: 255, b: 0 });

  function drive(left, right) {
    setMotors({ left, right });
  }

  function stop() {
    setMotors({ left: 0, right: 0 });
  }

  const btnClass = "w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-xl";

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4 text-center">${deviceName}</h2>

      <div className="flex justify-center mb-4">
        <div className="grid grid-cols-3 gap-1">
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(150, 150)} onMouseUp={stop}>↑</button>
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(-80, 80)} onMouseUp={stop}>←</button>
          <button className={btnClass} onClick={stop}>■</button>
          <button className={btnClass} onMouseDown={() => drive(80, -80)} onMouseUp={stop}>→</button>
          <div></div>
          <button className={btnClass} onMouseDown={() => drive(-150, -150)} onMouseUp={stop}>↓</button>
          <div></div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-gray-800 p-2 rounded">
        <span className="text-sm text-gray-400">Motors:</span>
        <span>L: {motors.left} R: {motors.right}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-gray-400">LED:</span>
        <input type="color"
               value="#00ff00"
               className="w-8 h-8 rounded cursor-pointer"/>
      </div>
    </div>
  );
}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL TOOLS
// ═══════════════════════════════════════════════════════════════════════════

export function getESP32WASM4Tools(): ToolDefinition[] {
  return [
    // Device management
    CreateVirtualDeviceTool,
    ListRobotDevicesTool,
    DisconnectRobotDeviceTool,

    // Robot control
    DriveRobotTool,
    StopRobotTool,
    SetRobotLEDTool,
    GetRobotStateTool,

    // Games
    LoadRobotGameTool,
    ListRobotGamesTool,

    // Device lifecycle
    StartRobotDeviceTool,
    StopRobotDeviceTool,
    ResetRobotDeviceTool,

    // Floor maps
    SetFloorMapTool,
    ListFloorMapsTool,
    CreateFloorMapTool,

    // Fleet management
    StartAllDevicesTool,
    StopAllDevicesTool,
    ResetAllDevicesTool,

    // Applets
    GenerateRobotAppletTool,
  ];
}
