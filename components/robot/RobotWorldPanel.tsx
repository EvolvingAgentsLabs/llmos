'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Radio, Wifi, Camera, Maximize2, Settings, Cpu, Bot, Coins, Star, Trophy, Layers, Move } from 'lucide-react';
import { createCubeRobotSimulator, type CubeRobotState as SimulatorState, type FloorMap, FLOOR_MAPS } from '@/lib/hardware/cube-robot-simulator';
import { getDeviceManager, type DeviceTelemetry } from '@/lib/hardware/esp32-device-manager';
import dynamic from 'next/dynamic';

// Lazy load 3D canvas for better performance
const RobotCanvas3D = dynamic(() => import('./RobotCanvas3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#0d1117] to-[#161b22]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-[#58a6ff] rounded-lg shadow-lg shadow-[#58a6ff]/50 flex items-center justify-center text-2xl animate-pulse">
          🤖
        </div>
        <p className="text-sm text-[#8b949e]">Loading 3D World...</p>
      </div>
    </div>
  ),
});

/**
 * RobotWorldPanel - The central 3D workspace for robot programming
 *
 * This panel shows:
 * - 3D visualization of robot in arena (simulation or real)
 * - Real-time robot position, orientation, sensor data
 * - Camera controls for different viewpoints
 * - Sim/Real toggle for execution environment
 * - Record/replay for telemetry
 *
 * Conceptual model:
 * - Robot = Physical AI Agent
 * - Chat programs the robot (generates firmware)
 * - 3D view shows robot executing autonomously
 * - User/Team volumes organize robot programs
 */

type ExecutionMode = 'simulation' | 'real-robot' | 'replay';
type CameraPreset = 'top-down' | 'isometric' | 'follow' | 'side';

// PiP (Picture-in-Picture) configuration
interface PiPConfig {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: 'small' | 'medium' | 'large';
}

type AgentPhase = 'idle' | 'analyzing' | 'planning' | 'voting' | 'executing' | 'sub-agent-execution' | 'completed';

interface AgentActivity {
  phase: AgentPhase;
  activeAgents: number;
  isLoading: boolean;
}

interface RobotWorldPanelProps {
  currentMap?: string; // e.g., 'standard5x5Empty'
  deviceId?: string | null; // Optional device ID to sync with robot agent
  onRobotClick?: () => void;
  onArenaClick?: (x: number, y: number) => void;
  agentActivity?: AgentActivity;
  robotAgentName?: string; // Name of the selected/created robot agent to display
}

// PiP (Picture-in-Picture) Top-Down View Component
function PiPTopView({
  robotState,
  floorMap,
  position,
  size,
  onDrag,
}: {
  robotState: SimulatorState | null;
  floorMap: FloorMap;
  position: PiPConfig['position'];
  size: PiPConfig['size'];
  onDrag?: (position: PiPConfig['position']) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Size mapping
  const sizeMap = {
    small: { width: 120, height: 120 },
    medium: { width: 160, height: 160 },
    large: { width: 200, height: 200 },
  };
  const { width, height } = sizeMap[size];

  // Position mapping
  const positionStyles: Record<PiPConfig['position'], string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-16 left-4',
    'bottom-right': 'bottom-16 right-4',
  };

  // Render top-down view on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Calculate scale to fit arena in canvas
    const bounds = floorMap.bounds;
    const arenaWidth = bounds.maxX - bounds.minX;
    const arenaHeight = bounds.maxY - bounds.minY;
    const scale = Math.min((width - 20) / arenaWidth, (height - 20) / arenaHeight);
    const offsetX = (width - arenaWidth * scale) / 2;
    const offsetY = (height - arenaHeight * scale) / 2;

    // Transform world coords to canvas coords
    const toCanvas = (x: number, y: number) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: offsetY + (y - bounds.minY) * scale,
    });

    // Draw grid
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 0.5;
    const gridStep = 0.5; // 0.5m grid
    for (let x = bounds.minX; x <= bounds.maxX; x += gridStep) {
      const start = toCanvas(x, bounds.minY);
      const end = toCanvas(x, bounds.maxY);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += gridStep) {
      const start = toCanvas(bounds.minX, y);
      const end = toCanvas(bounds.maxX, y);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    // Draw arena border
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    const topLeft = toCanvas(bounds.minX, bounds.minY);
    const bottomRight = toCanvas(bounds.maxX, bounds.maxY);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Draw walls
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 3;
    floorMap.walls.forEach(wall => {
      const start = toCanvas(wall.x1, wall.y1);
      const end = toCanvas(wall.x2, wall.y2);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    // Draw obstacles
    ctx.fillStyle = '#f85149';
    floorMap.obstacles?.forEach(obs => {
      const pos = toCanvas(obs.x, obs.y);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, obs.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw collectibles
    floorMap.collectibles?.forEach(col => {
      if (robotState?.collectibles?.collected.includes(col.id)) return;
      const pos = toCanvas(col.x, col.y);
      ctx.fillStyle = col.color || '#FFD700';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, col.radius * scale * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw robot
    if (robotState) {
      const robotPos = toCanvas(robotState.pose.x, robotState.pose.y);
      const robotSize = 8;

      // Robot body
      ctx.save();
      ctx.translate(robotPos.x, robotPos.y);
      ctx.rotate(-robotState.pose.rotation + Math.PI);

      // Triangle pointing in direction of travel
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.moveTo(0, -robotSize);
      ctx.lineTo(-robotSize * 0.7, robotSize * 0.6);
      ctx.lineTo(robotSize * 0.7, robotSize * 0.6);
      ctx.closePath();
      ctx.fill();

      // LED indicator
      ctx.fillStyle = `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Robot trail (last few positions could be shown)
    }

    // Draw border decoration
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

  }, [robotState, floorMap, width, height]);

  return (
    <div
      className={`absolute ${positionStyles[position]} bg-[#0d1117]/95 backdrop-blur-sm border border-[#30363d] rounded-lg shadow-xl overflow-hidden group transition-all duration-200 hover:border-[#58a6ff]/50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-[#58a6ff]" />
          <span className="text-[9px] text-[#8b949e] font-medium uppercase tracking-wider">Top View</span>
        </div>
        <Move className="w-3 h-3 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity cursor-move" />
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ imageRendering: 'auto' }}
      />

      {/* Position info */}
      {robotState && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-[#0d1117]/80 rounded text-[8px] text-[#8b949e] font-mono">
          ({robotState.pose.x.toFixed(1)}, {robotState.pose.y.toFixed(1)})
        </div>
      )}
    </div>
  );
}

export default function RobotWorldPanel({
  currentMap = 'standard5x5Empty',
  deviceId,
  onRobotClick,
  onArenaClick,
  agentActivity,
  robotAgentName,
}: RobotWorldPanelProps) {
  // Unified robot color
  const ROBOT_COLOR = '#58a6ff';
  const canvasRef = useRef<HTMLDivElement>(null);
  const simulatorRef = useRef<ReturnType<typeof createCubeRobotSimulator> | null>(null);
  const animationFrameRef = useRef<number>();

  const [mode, setMode] = useState<ExecutionMode>('simulation');
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('follow'); // Default to follow camera
  const [robotState, setRobotState] = useState<SimulatorState | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [floorMap, setFloorMap] = useState<FloorMap | null>(null);
  const [pipConfig, setPipConfig] = useState<PiPConfig>({
    enabled: true,
    position: 'top-right',
    size: 'medium',
  });

  // Initialize simulator OR sync with Device Manager
  useEffect(() => {
    // Load floor map regardless of mode
    const mapKey = currentMap as keyof typeof FLOOR_MAPS;
    const map = FLOOR_MAPS[mapKey] ? FLOOR_MAPS[mapKey]() : null;
    if (map) {
      setFloorMap(map);
    }

    // If we have a deviceId, sync with Device Manager instead of local simulator
    if (deviceId) {
      const manager = getDeviceManager();

      // Subscribe to telemetry events from the device
      const unsubscribeTelemetry = manager.on('device:telemetry', (telemetry: DeviceTelemetry) => {
        if (telemetry.deviceId === deviceId) {
          setRobotState(telemetry.robotState);
        }
      });

      // Get initial state from device
      const deviceState = manager.getDeviceState(deviceId);
      if (deviceState) {
        setRobotState(deviceState.robot);
        // Device is already running if status is running
        const deviceInfo = manager.getDevice(deviceId);
        if (deviceInfo?.status === 'running') {
          setIsRunning(true);
        }
      }

      // Update map on the device if needed
      if (map) {
        manager.sendCommand(deviceId, { type: 'set_map', payload: { map } });
      }

      return () => {
        unsubscribeTelemetry();
      };
    }

    // No deviceId - use local simulator (original behavior)
    const simulator = createCubeRobotSimulator({
      onStateChange: (state) => {
        setRobotState(state);
      },
    });
    simulatorRef.current = simulator;

    // Load current map
    if (map) {
      simulator.setMap(map);
    }

    // Get initial state
    setRobotState(simulator.getState());

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      simulator.dispose();
    };
  }, [currentMap, deviceId]);

  // Simulation loop - handle both local simulator and Device Manager modes
  useEffect(() => {
    // If using Device Manager, the device is controlled externally (e.g., by RobotAgentPanel)
    // We only send start/stop commands when the user explicitly clicks play/pause in THIS panel
    // The device may already be running from the agent, so we don't stop it on mount
    if (deviceId) {
      // Don't send any commands here - the device is controlled by RobotAgentPanel
      // This panel just passively receives telemetry updates
      return;
    }

    // Local simulator mode (original behavior)
    const simulator = simulatorRef.current;
    if (!simulator) return;

    if (isRunning && mode === 'simulation') {
      // Start simulator (it has its own internal physics loop)
      simulator.start();
    } else {
      // Stop simulator
      simulator.stop();
    }

    return () => {
      simulator.stop();
    };
  }, [isRunning, mode, deviceId]);

  // Control functions
  const handlePlayPause = useCallback(() => {
    setIsRunning(!isRunning);
  }, [isRunning]);

  const handleReset = useCallback(() => {
    if (deviceId) {
      // Reset via Device Manager
      const manager = getDeviceManager();
      manager.sendCommand(deviceId, { type: 'reset' });
    } else {
      // Reset local simulator
      simulatorRef.current?.reset();
    }
    setIsRunning(false);
    setRobotState(null);
  }, [deviceId]);

  const handleModeToggle = useCallback(() => {
    const modes: ExecutionMode[] = ['simulation', 'real-robot', 'replay'];
    const currentIndex = modes.indexOf(mode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setMode(nextMode);
    setIsRunning(false); // Stop when switching modes
  }, [mode]);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    // Camera transformation will be handled by Three.js component
  }, []);

  const handleArenaClick = useCallback((x: number, y: number) => {
    // Forward to parent if provided
    if (onArenaClick) {
      onArenaClick(x, y);
    }
  }, [onArenaClick]);

  // Mode display configuration
  const modeConfig = {
    simulation: {
      icon: <Play className="w-4 h-4" />,
      label: 'Simulation',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      border: 'border-blue-500/50',
    },
    'real-robot': {
      icon: <Radio className="w-4 h-4" />,
      label: 'Real Robot',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      border: 'border-green-500/50',
    },
    replay: {
      icon: <Camera className="w-4 h-4" />,
      label: 'Replay',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      border: 'border-purple-500/50',
    },
  };

  const currentModeConfig = modeConfig[mode];

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        {/* Left: Mode Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleModeToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 ${currentModeConfig.bg} ${currentModeConfig.border}`}
            title="Toggle execution mode"
          >
            {currentModeConfig.icon}
            <span className={`text-xs font-semibold ${currentModeConfig.color}`}>
              {currentModeConfig.label}
            </span>
          </button>

          {/* Connection Status */}
          {mode === 'real-robot' && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#21262d]">
              <Wifi className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-green-400">Connected</span>
            </div>
          )}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isRunning
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
            }`}
            title={isRunning ? 'Pause' : 'Play'}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] flex items-center justify-center transition-colors"
            title="Reset simulation"
          >
            <RotateCcw className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
          </button>

          <div className="w-px h-6 bg-[#30363d] mx-1" />

          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isRecording
                ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                : 'bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:border-[#58a6ff]'
            }`}
            title={isRecording ? 'Stop recording' : 'Record telemetry'}
          >
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-[#8b949e]'}`} />
          </button>
        </div>

        {/* Right: View Controls & Settings */}
        <div className="flex items-center gap-2">
          {/* Follow Camera indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#58a6ff]/20 border border-[#58a6ff]/50">
            <Camera className="w-3 h-3 text-[#58a6ff]" />
            <span className="text-[10px] text-[#58a6ff] font-medium">Follow Cam</span>
          </div>

          {/* PiP Top View Toggle */}
          <button
            onClick={() => setPipConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
              pipConfig.enabled
                ? 'bg-[#3fb950]/20 border-[#3fb950]/50 text-[#3fb950]'
                : 'bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]'
            }`}
            title={pipConfig.enabled ? 'Hide top-down mini view' : 'Show top-down mini view'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium">PiP</span>
          </button>

          {/* Stats Toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
              showStats
                ? 'bg-[#58a6ff]/20 border-[#58a6ff]/50'
                : 'bg-[#21262d] border-[#30363d] hover:border-[#58a6ff]'
            }`}
            title="Toggle statistics"
          >
            <Settings className={`w-4 h-4 ${showStats ? 'text-[#58a6ff]' : 'text-[#8b949e] hover:text-[#58a6ff]'}`} />
          </button>

          <button
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] flex items-center justify-center transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
          </button>
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div className="flex-1 relative bg-gradient-to-b from-[#0d1117] to-[#161b22]">
        <div ref={canvasRef} className="w-full h-full relative">
          {/* Three.js 3D Rendering */}
          {floorMap ? (
            <RobotCanvas3D
              robotState={robotState}
              floorMap={floorMap}
              cameraPreset={cameraPreset}
              onArenaClick={handleArenaClick}
              agentActivity={agentActivity}
              collectedIds={robotState?.collectibles?.collected || []}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-[#58a6ff] rounded-lg shadow-lg shadow-[#58a6ff]/50 flex items-center justify-center text-2xl animate-pulse">
                  🤖
                </div>
                <p className="text-sm text-[#8b949e]">Loading arena...</p>
              </div>
            </div>
          )}
        </div>

        {/* Robot Agent Name Overlay */}
        {robotAgentName && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#0d1117]/90 backdrop-blur-sm border rounded-lg px-4 py-2 shadow-xl flex items-center gap-2"
            style={{ borderColor: `${ROBOT_COLOR}50` }}
          >
            <Cpu className="w-4 h-4" style={{ color: ROBOT_COLOR }} />
            <span className="text-sm font-semibold" style={{ color: ROBOT_COLOR }}>
              {robotAgentName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30">
              Active
            </span>
          </div>
        )}

        {/* Collectibles Score Overlay - shows when map has collectibles */}
        {robotState?.collectibles && robotState.collectibles.totalCount > 0 && (
          <div className="absolute top-4 right-4 bg-[#0d1117]/90 backdrop-blur-sm border border-[#FFD700]/30 rounded-lg p-3 shadow-xl min-w-[140px]">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-[#FFD700]" />
              <span className="text-[10px] uppercase tracking-wider text-[#FFD700] font-medium">Collectibles</span>
            </div>
            <div className="space-y-2">
              {/* Score */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Score:</span>
                <span className="text-lg font-bold text-[#FFD700]">
                  {robotState.collectibles.totalPoints}
                </span>
              </div>
              {/* Items collected */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Collected:</span>
                <span className="text-sm font-medium text-[#e6edf3]">
                  {robotState.collectibles.collected.length} / {robotState.collectibles.totalCount}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] transition-all duration-300"
                  style={{
                    width: `${(robotState.collectibles.collected.length / robotState.collectibles.totalCount) * 100}%`
                  }}
                />
              </div>
              {/* Completion badge */}
              {robotState.collectibles.collected.length === robotState.collectibles.totalCount && (
                <div className="flex items-center justify-center gap-1 pt-1">
                  <Trophy className="w-3 h-3 text-[#FFD700]" />
                  <span className="text-[10px] text-[#FFD700] font-semibold uppercase">Goal Complete!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statistics Overlay */}
        {showStats && robotState && (
          <div className="absolute top-4 left-4 bg-[#0d1117]/90 backdrop-blur-sm border border-[#30363d] rounded-lg p-3 shadow-xl">
            <div className="text-[10px] uppercase tracking-wider text-[#8b949e] mb-2">Robot State</div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Position:</span>
                <span className="text-[#58a6ff]">
                  ({robotState.pose.x.toFixed(2)}, {robotState.pose.y.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Rotation:</span>
                <span className="text-[#a371f7]">{(robotState.pose.rotation * 180 / Math.PI).toFixed(1)}°</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Velocity:</span>
                <span className="text-[#3fb950]">
                  {robotState.velocity.linear.toFixed(2)} m/s
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">LED:</span>
                <div
                  className="w-4 h-4 rounded border border-[#30363d]"
                  style={{
                    backgroundColor: `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* PiP Top-Down View */}
        {pipConfig.enabled && floorMap && (
          <PiPTopView
            robotState={robotState}
            floorMap={floorMap}
            position={pipConfig.position}
            size={pipConfig.size}
            onDrag={(pos) => setPipConfig(prev => ({ ...prev, position: pos }))}
          />
        )}

        {/* Mode Badge */}
        <div className="absolute bottom-4 right-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${currentModeConfig.bg} ${currentModeConfig.border} backdrop-blur-sm`}>
            {currentModeConfig.icon}
            <span className={`text-xs font-semibold ${currentModeConfig.color}`}>
              {currentModeConfig.label}
            </span>
            {isRunning && mode === 'simulation' && (
              <div className="ml-2 flex gap-1">
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-t border-[#30363d] text-xs">
        <div className="flex items-center gap-4">
          {robotAgentName && (
            <span className="flex items-center gap-1.5" style={{ color: ROBOT_COLOR }}>
              <Cpu className="w-3 h-3" />
              <span className="font-medium">{robotAgentName}</span>
            </span>
          )}
          <span className="text-[#8b949e]">
            Map: <span className="text-[#e6edf3] font-medium">{currentMap}</span>
          </span>
          <span className="text-[#8b949e] flex items-center gap-1">
            <Camera className="w-3 h-3" />
            <span className="text-[#58a6ff] font-medium">Follow</span>
            {pipConfig.enabled && (
              <>
                <span className="text-[#6e7681]">+</span>
                <Layers className="w-3 h-3 text-[#3fb950]" />
                <span className="text-[#3fb950]">PiP</span>
              </>
            )}
          </span>
        </div>
        <div className="text-[#6e7681]">
          {isRecording && (
            <span className="text-red-400 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              Recording telemetry...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
