'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Radio, Wifi, Camera, Maximize2, Settings } from 'lucide-react';
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
}

export default function RobotWorldPanel({
  currentMap = 'standard5x5Empty',
  deviceId,
  onRobotClick,
  onArenaClick,
  agentActivity,
}: RobotWorldPanelProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const simulatorRef = useRef<ReturnType<typeof createCubeRobotSimulator> | null>(null);
  const animationFrameRef = useRef<number>();

  const [mode, setMode] = useState<ExecutionMode>('simulation');
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [robotState, setRobotState] = useState<SimulatorState | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [floorMap, setFloorMap] = useState<FloorMap | null>(null);

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

        {/* Right: Camera & Settings */}
        <div className="flex items-center gap-2">
          {/* Camera Presets - Click to reset camera to preset view */}
          <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-0.5">
            {(['top-down', 'isometric', 'follow', 'side'] as CameraPreset[]).map((preset) => {
              const labels: Record<CameraPreset, string> = {
                'top-down': 'Top',
                'isometric': 'Iso',
                'follow': 'Follow',
                'side': 'Side',
              };
              return (
                <button
                  key={preset}
                  onClick={() => handleCameraPreset(preset)}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    cameraPreset === preset
                      ? 'bg-[#58a6ff] text-white'
                      : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d]'
                  }`}
                  title={`Reset camera to ${preset} view (use mouse to orbit/pan/zoom)`}
                >
                  {labels[preset]}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowStats(!showStats)}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] flex items-center justify-center transition-colors"
            title="Toggle statistics"
          >
            <Settings className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
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
          <span className="text-[#8b949e]">
            Map: <span className="text-[#e6edf3] font-medium">{currentMap}</span>
          </span>
          <span className="text-[#8b949e]">
            Camera: <span className="text-[#e6edf3] font-medium">{cameraPreset}</span>
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
