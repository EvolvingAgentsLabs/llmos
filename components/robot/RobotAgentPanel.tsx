'use client';

/**
 * Robot Agent Panel
 *
 * Simplified control panel for robot AI agents.
 * Visualization is now handled by PiP views in RobotWorldPanel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ESP32AgentRuntime,
  ESP32AgentState,
  createESP32Agent,
  stopESP32Agent,
  DEFAULT_AGENT_PROMPTS,
  BEHAVIOR_TO_MAP,
  BEHAVIOR_DESCRIPTIONS,
  getAgentPrompt,
} from '@/lib/runtime/esp32-agent-runtime';
import { VisionObservation } from '@/lib/runtime/camera-vision-model';
import { getDeviceManager } from '@/lib/hardware/esp32-device-manager';
import { Artifact, ArtifactVolume } from '@/lib/artifacts/types';
import { artifactManager } from '@/lib/artifacts/artifact-manager';
import { generateRobotConfig, robotIconToDataURL } from '@/lib/agents/robot-icon-generator';
import { WorldModel, getWorldModel, clearWorldModel } from '@/lib/runtime/world-model';
import { getBlackBoxRecorder } from '@/lib/evolution/black-box-recorder';
import { Cpu, ChevronDown, Plus } from 'lucide-react';

interface RobotAgentPanelProps {
  deviceId?: string;
  onDeviceCreated?: (deviceId: string) => void;
  selectedAgent?: Artifact | null;
  availableAgents?: Artifact[];
  onAgentSelect?: (agent: Artifact | null) => void;
  onBehaviorChange?: (behavior: string, recommendedMap: string) => void;
  activeVolume?: ArtifactVolume;
  onWorldModelUpdate?: (worldModel: WorldModel) => void;
}

export default function RobotAgentPanel({
  deviceId: initialDeviceId,
  onDeviceCreated,
  selectedAgent,
  availableAgents = [],
  onAgentSelect,
  onBehaviorChange,
  activeVolume = 'user',
  onWorldModelUpdate,
}: RobotAgentPanelProps) {
  const [deviceId, setDeviceId] = useState<string | null>(initialDeviceId || null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<ESP32AgentState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<keyof typeof DEFAULT_AGENT_PROMPTS>('explorer');
  const [customPrompt, setCustomPrompt] = useState('');
  const [agentGoal, setAgentGoal] = useState('');
  const [loopInterval, setLoopInterval] = useState(1000);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [visionEnabled, setVisionEnabled] = useState(false);
  const [lastVisionObservation, setLastVisionObservation] = useState<VisionObservation | null>(null);

  const agentRef = useRef<ESP32AgentRuntime | null>(null);
  const worldModelRef = useRef<WorldModel | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const recorderSessionRef = useRef<string | null>(null);

  // Unified robot color
  const ROBOT_COLOR = '#58a6ff';

  // Notify parent when behavior changes (for map synchronization)
  useEffect(() => {
    const recommendedMap = BEHAVIOR_TO_MAP[selectedPrompt];
    if (recommendedMap && onBehaviorChange) {
      onBehaviorChange(selectedPrompt, recommendedMap);
    }
    // Auto-enable vision for visionExplorer behavior
    if (selectedPrompt === 'visionExplorer') {
      setVisionEnabled(true);
    }
  }, [selectedPrompt, onBehaviorChange]);

  // Create virtual device
  const createDevice = useCallback(async () => {
    try {
      const manager = getDeviceManager();
      const newDeviceId = await manager.createVirtualDevice('AI Robot');
      setDeviceId(newDeviceId);
      console.log('[RobotAgentPanel] Virtual device created:', newDeviceId);
      onDeviceCreated?.(newDeviceId);

      // Start the simulation
      await manager.sendCommand(newDeviceId, { type: 'start' });
      console.log('[RobotAgentPanel] Device simulation started');
    } catch (error: any) {
      console.error('[RobotAgentPanel] Failed to create device:', error.message);
    }
  }, [onDeviceCreated]);

  // Register robot agent in user volume
  const registerAgentInVolume = useCallback(async (agentId: string, behavior: string, prompt: string, goal?: string) => {
    try {
      const behaviorInfo = BEHAVIOR_DESCRIPTIONS[behavior] || {
        name: behavior,
        description: 'Custom robot behavior',
        mapName: 'Unknown',
      };

      // Check if agent already exists with this name in user volume
      const existingAgents = artifactManager.filter({
        type: 'agent',
        volume: activeVolume
      });
      const agentName = selectedAgent?.name || `Robot-${behaviorInfo.name}`;
      const existingAgent = existingAgents.find(a => a.name === agentName);

      if (existingAgent) {
        // Update existing agent - just update the codeView with new run info
        const updatedDescription = `${behaviorInfo.description} (Last run: ${new Date().toLocaleString()})`;
        artifactManager.update(existingAgent.id, {
          description: updatedDescription,
          tags: ['robot', 'hardware', behavior],
        });
        console.log(`[RobotAgentPanel] Updated existing agent "${agentName}" in ${activeVolume} volume`);
        return existingAgent.id;
      }

      // Create new agent artifact in user volume
      const goalSection = goal ? `\n## Goal\n**${goal}**\n` : '';
      const goalYaml = goal ? `\ngoal: "${goal.replace(/"/g, '\\"')}"` : '';

      const codeView = `---
name: ${agentName}
type: specialist
category: hardware
description: ${behaviorInfo.description}
version: "1.0"
origin: created
model: anthropic/claude-sonnet-4.5
behavior: ${behavior}
recommendedMap: ${BEHAVIOR_TO_MAP[behavior] || 'standard5x5Empty'}
loopInterval: ${loopInterval}${goalYaml}
tools:
  - control_left_wheel
  - control_right_wheel
  - drive
  - stop
  - set_led
  - read_sensors
  - use_camera
tags:
  - robot
  - hardware
  - ${behavior}
---

# ${agentName}

Autonomous robot agent with **${behaviorInfo.name}** behavior.
${goalSection}
## Behavior
${behaviorInfo.description}

## Recommended Map
${behaviorInfo.mapName}

## System Prompt
\`\`\`
${prompt}
\`\`\`

## Configuration
- Loop Interval: ${loopInterval}ms
- Max Iterations: 100
- Created: ${new Date().toISOString()}
`;

      const newArtifact = artifactManager.create({
        name: agentName,
        type: 'agent',
        volume: activeVolume,
        createdBy: 'robot-agent-panel',
        description: behaviorInfo.description,
        codeView,
        tags: ['robot', 'hardware', behavior],
      });

      console.log(`[RobotAgentPanel] Registered agent "${agentName}" in ${activeVolume} volume`);
      return newArtifact?.id;
    } catch (error: any) {
      console.error('[RobotAgentPanel] Failed to register agent:', error.message);
      return null;
    }
  }, [activeVolume, selectedAgent, loopInterval]);

  // Start the agent
  const startAgent = useCallback(async () => {
    if (!deviceId) {
      console.error('[RobotAgentPanel] No device selected. Create a virtual device first.');
      return;
    }

    // Initialize/reset world model for this device
    clearWorldModel(deviceId);
    worldModelRef.current = getWorldModel(deviceId, {
      gridResolution: 10,  // 10cm per cell
      worldWidth: 500,     // 5m
      worldHeight: 500,    // 5m
    });

    // Notify parent of world model creation
    if (onWorldModelUpdate && worldModelRef.current) {
      onWorldModelUpdate(worldModelRef.current);
    }

    // Start BlackBox recording session
    const recorder = getBlackBoxRecorder();
    const sessionId = recorder.startSession({
      skillName: selectedAgent?.name || `Robot-${selectedPrompt}`,
      skillVersion: '1.0.0',
      deviceId,
      mode: 'simulation',
      cameraSampleRate: 3, // Sample every 3rd frame
    });
    recorderSessionRef.current = sessionId;
    console.log(`[RobotAgentPanel] BlackBox recording started: ${sessionId}`);

    // Use the behavior registry to get the prompt (connects to the modular behavior system)
    const prompt = customPrompt || getAgentPrompt(selectedPrompt);
    const newAgentId = `robot-agent-${Date.now()}`;

    console.log(`[RobotAgentPanel] Starting robot agent with ${selectedPrompt} behavior...`);
    if (agentGoal) {
      console.log(`[RobotAgentPanel] Goal: ${agentGoal}`);
    }

    try {
      const agent = createESP32Agent({
        id: newAgentId,
        name: `Robot-${selectedPrompt}`,
        deviceId,
        systemPrompt: prompt,
        goal: agentGoal || undefined,
        loopIntervalMs: loopInterval,
        maxIterations: 100,
        visionEnabled: visionEnabled,
        visionInterval: 3000, // Process vision every 3 seconds
        onVisionObservation: (observation) => {
          setLastVisionObservation(observation);
        },
        onStateChange: (state) => {
          // Throttle state updates to prevent UI freeze (max 2 updates per second)
          const now = Date.now();
          if (now - lastUpdateRef.current < 500) {
            return;
          }
          lastUpdateRef.current = now;

          setAgentState(state);

          // Record frame to BlackBox
          const recorder = getBlackBoxRecorder();
          if (recorder.isRecording() && state.lastSensorReading) {
            const sensors = state.lastSensorReading;
            // Convert sensor pose format to DeviceTelemetry pose format
            const telemetryPose = sensors.pose ? {
              x: sensors.pose.x,
              y: sensors.pose.y,
              z: 0,
              yaw: sensors.pose.rotation ?? 0,
            } : undefined;

            recorder.recordFrame({
              telemetry: {
                deviceId,
                timestamp: now,
                pose: telemetryPose,
                motors: sensors.motors,
                sensors: {
                  distance: sensors.distance,
                },
              },
              toolCalls: state.toolCallHistory?.slice(-5).map(tc => ({
                name: tc.name,
                args: tc.args || {},
              })) || [],
              toolResults: state.toolCallHistory?.slice(-5).map(tc => ({
                name: tc.name,
                success: !tc.error,
                data: tc.result,
                error: tc.error,
              })) || [],
              reasoning: state.lastLLMResponse?.slice(0, 500),
              confidence: state.lastVisionConfidence,
            });

            // Mark failures if detected
            if (state.errors.length > 0) {
              const lastError = state.errors[state.errors.length - 1];
              recorder.markFailure({
                type: lastError.includes('collision') ? 'collision' :
                      lastError.includes('timeout') ? 'timeout' :
                      lastError.includes('stop') ? 'safety_stop' : 'skill_error',
                description: lastError,
                severity: 'moderate',
                sensorSnapshot: {
                  pose: telemetryPose,
                  motors: sensors.motors,
                },
              });
            }
          }

          // Update world model with sensor data
          if (state.lastSensorReading && worldModelRef.current) {
            const sensors = state.lastSensorReading;
            worldModelRef.current.updateFromSensors(
              sensors.pose,
              sensors.distance,
              Date.now()
            );

            // Notify parent of world model update (throttled)
            if (onWorldModelUpdate && worldModelRef.current) {
              onWorldModelUpdate(worldModelRef.current);
            }
          }

          // Log errors to console only
          if (state.errors.length > 0) {
            const lastError = state.errors[state.errors.length - 1];
            console.error('[RobotAgentPanel] Agent error:', lastError);
          }
        },
        onLog: (msg, level) => {
          if (level === 'error') {
            console.error('[RobotAgentPanel]', msg);
          }
        },
      });

      agentRef.current = agent;
      agent.start();
      setAgentId(newAgentId);
      setIsRunning(true);
      console.log(`[RobotAgentPanel] Agent started (ID: ${newAgentId})`);

      // Register the agent in user volume
      await registerAgentInVolume(newAgentId, selectedPrompt, prompt, agentGoal || undefined);
    } catch (error: any) {
      console.error('[RobotAgentPanel] Failed to start agent:', error.message);
    }
  }, [deviceId, selectedPrompt, customPrompt, agentGoal, loopInterval, onWorldModelUpdate, registerAgentInVolume]);

  // Stop the agent
  const stopAgent = useCallback(async () => {
    if (agentId) {
      stopESP32Agent(agentId);
      console.log('[RobotAgentPanel] Agent stopped');

      // End BlackBox recording session
      if (recorderSessionRef.current) {
        const recorder = getBlackBoxRecorder();
        const session = await recorder.endSession();
        if (session) {
          console.log(`[RobotAgentPanel] BlackBox recording saved: ${session.id} (${session.metadata.totalFrames} frames, ${session.failures.length} failures)`);
        }
        recorderSessionRef.current = null;
      }

      setIsRunning(false);
      setAgentId(null);
      agentRef.current = null;
    }
  }, [agentId]);

  // Generate icon for selected agent
  const selectedAgentIcon = selectedAgent
    ? robotIconToDataURL(generateRobotConfig(selectedAgent.id), 24)
    : null;

  return (
    <div className="flex flex-col h-full bg-bg-primary text-fg-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-primary bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-2">
          {selectedAgentIcon ? (
            <img
              src={selectedAgentIcon}
              alt={selectedAgent?.name || 'Robot'}
              className="w-6 h-6"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <Cpu className="w-5 h-5" style={{ color: ROBOT_COLOR }} />
          )}
          <h2 className="font-semibold text-sm">
            {selectedAgent?.name || 'Robot AI Agent'}
          </h2>
          {isRunning && (
            <span className="px-2 py-0.5 text-xs bg-green-600 rounded-full animate-pulse">
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {agentState && (
            <span className="text-xs text-fg-secondary">
              Iter: {agentState.iteration} | Tools: {agentState.stats.totalToolCalls}
            </span>
          )}
        </div>
      </div>

      {/* Agent Selector */}
      <div className="p-3 border-b border-border-primary bg-bg-secondary/50 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowAgentSelector(!showAgentSelector)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all"
            style={{
              backgroundColor: selectedAgent ? `${ROBOT_COLOR}15` : '#21262d',
              borderColor: selectedAgent ? `${ROBOT_COLOR}50` : '#30363d'
            }}
          >
            <div className="flex items-center gap-2">
              {selectedAgent ? (
                <>
                  <img
                    src={selectedAgentIcon!}
                    alt={selectedAgent.name}
                    className="w-5 h-5"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span className="text-sm font-medium" style={{ color: ROBOT_COLOR }}>
                    {selectedAgent.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${ROBOT_COLOR}20`, color: ROBOT_COLOR }}>
                    Selected
                  </span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[#8b949e]" />
                  <span className="text-sm text-[#8b949e]">Select or Create Robot Agent</span>
                </>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-[#8b949e] transition-transform ${showAgentSelector ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {showAgentSelector && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              {/* Create new option */}
              <button
                onClick={() => {
                  onAgentSelect?.(null);
                  setShowAgentSelector(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] transition-colors border-b border-[#30363d]"
              >
                <Plus className="w-4 h-4" />
                Create New (Use Preset Behavior)
              </button>

              {/* Available agents */}
              {availableAgents.length > 0 ? (
                availableAgents.map((agent) => {
                  const agentIcon = robotIconToDataURL(generateRobotConfig(agent.id), 20);
                  const isSelected = selectedAgent?.id === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => {
                        onAgentSelect?.(agent);
                        setShowAgentSelector(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        isSelected
                          ? 'bg-[#58a6ff]/20 text-[#58a6ff]'
                          : 'text-[#e6edf3] hover:bg-[#21262d]'
                      }`}
                    >
                      <img
                        src={agentIcon}
                        alt={agent.name}
                        className="w-5 h-5"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      <span className="flex-1 text-left truncate">{agent.name}</span>
                      {isSelected && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58a6ff]/20">Active</span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-xs text-center text-[#8b949e]">
                  No robot agents available.
                  <br />
                  <span className="text-[10px]">Copy from system volume or create a new one.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls Panel - Scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Device controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">Device:</span>
          {deviceId ? (
            <span className="text-xs font-mono bg-bg-tertiary px-2 py-1 rounded">
              {deviceId.substring(0, 20)}...
            </span>
          ) : (
            <button
              onClick={createDevice}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
            >
              Create Virtual Device
            </button>
          )}
        </div>

        {/* Behavior selection */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">Behavior:</span>
          <select
            value={selectedPrompt}
            onChange={(e) => setSelectedPrompt(e.target.value as keyof typeof DEFAULT_AGENT_PROMPTS)}
            disabled={isRunning}
            className="text-xs bg-bg-tertiary border border-border-primary rounded px-2 py-1 flex-1"
          >
            <option value="explorer">Explorer (avoid obstacles)</option>
            <option value="visionExplorer">Vision Explorer (camera-based)</option>
            <option value="wallFollower">Wall Follower (right-hand rule)</option>
            <option value="lineFollower">Line Follower</option>
            <option value="patroller">Patroller (rectangle pattern)</option>
            <option value="collector">Coin Collector (collect all coins)</option>
            <option value="gemHunter">Gem Hunter (find valuable gems)</option>
          </select>
        </div>

        {/* Vision mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">Vision:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={visionEnabled}
              onChange={(e) => setVisionEnabled(e.target.checked)}
              disabled={isRunning}
              className="w-4 h-4 rounded border-border-primary bg-bg-tertiary"
            />
            <span className="text-xs">
              {visionEnabled ? (
                <span className="text-purple-400">Camera vision enabled</span>
              ) : (
                <span className="text-fg-secondary">Sensors only</span>
              )}
            </span>
          </label>
          {selectedPrompt === 'visionExplorer' && !visionEnabled && (
            <span className="text-[10px] text-yellow-500">(recommended for this behavior)</span>
          )}
        </div>

        {/* Goal input */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-fg-secondary w-16 pt-1">Goal:</span>
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={agentGoal}
              onChange={(e) => setAgentGoal(e.target.value)}
              disabled={isRunning}
              placeholder="e.g., Collect all coins in the map"
              className="w-full text-xs bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 placeholder:text-fg-secondary/50 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[10px] text-fg-secondary/70">
              Optional: Set a specific goal for the AI agent
            </p>
          </div>
        </div>

        {/* Map indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">3D World:</span>
          <span className="text-xs px-2 py-1 rounded bg-blue-900/30 border border-blue-500/30 text-blue-300">
            {BEHAVIOR_DESCRIPTIONS[selectedPrompt]?.mapName || 'Unknown'}
          </span>
          <span className="text-[10px] text-fg-secondary">(auto-synced)</span>
        </div>

        {/* Loop interval */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">Interval:</span>
          <input
            type="range"
            min="200"
            max="3000"
            step="100"
            value={loopInterval}
            onChange={(e) => setLoopInterval(Number(e.target.value))}
            disabled={isRunning}
            className="flex-1"
          />
          <span className="text-xs w-16">{loopInterval}ms</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2">
          {!isRunning ? (
            <button
              onClick={startAgent}
              disabled={!deviceId}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded flex items-center gap-1 font-medium"
            >
              <span>▶</span> Start Agent
            </button>
          ) : (
            <button
              onClick={stopAgent}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded flex items-center gap-1 font-medium"
            >
              <span>⏹</span> Stop Agent
            </button>
          )}
        </div>

        {/* Info message about features */}
        <div className="mt-4 p-3 rounded-lg bg-[#161b22] border border-[#30363d]">
          <p className="text-xs text-[#8b949e]">
            <span className="text-[#58a6ff] font-medium">Tips:</span>
          </p>
          <ul className="mt-2 text-xs text-[#8b949e] space-y-1 ml-4">
            <li>• <span className="text-[#a371f7]">Vision Explorer</span> - Uses camera to build world model</li>
            <li>• <span className="text-[#3fb950]">Vision Mode</span> - LLM analyzes camera images to understand environment</li>
            <li>• <span className="text-[#58a6ff]">World Model</span> - Updated from both sensors AND camera vision</li>
          </ul>
          {visionEnabled && (
            <p className="mt-2 text-[10px] text-purple-400">
              Vision mode processes camera every ~3 seconds to update world model
            </p>
          )}
        </div>
      </div>

      {/* Vision observation display */}
      {visionEnabled && lastVisionObservation && isRunning && (
        <div className="px-3 py-2 border-t border-border-primary bg-purple-900/20 flex-shrink-0">
          <div className="text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-purple-400 font-medium">Vision:</span>
              <span className="text-fg-secondary truncate">{lastVisionObservation.sceneDescription}</span>
            </div>
            <div className="flex gap-4 text-[10px]">
              <span>
                <span className="text-fg-secondary">L:</span>{' '}
                <span className={lastVisionObservation.fieldOfView.leftRegion.appearsUnexplored ? 'text-green-400' : ''}>
                  {lastVisionObservation.fieldOfView.leftRegion.content}
                </span>
              </span>
              <span>
                <span className="text-fg-secondary">C:</span>{' '}
                <span className={lastVisionObservation.fieldOfView.centerRegion.appearsUnexplored ? 'text-green-400' : ''}>
                  {lastVisionObservation.fieldOfView.centerRegion.content}
                </span>
              </span>
              <span>
                <span className="text-fg-secondary">R:</span>{' '}
                <span className={lastVisionObservation.fieldOfView.rightRegion.appearsUnexplored ? 'text-green-400' : ''}>
                  {lastVisionObservation.fieldOfView.rightRegion.content}
                </span>
              </span>
              <span className="text-purple-300">
                {lastVisionObservation.objects.length} objects
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar - Fixed at bottom */}
      {agentState && (
        <div className="flex items-center gap-4 px-3 py-2 bg-bg-tertiary/50 text-xs border-t border-border-primary flex-shrink-0 flex-wrap">
          <div>
            <span className="text-fg-secondary">Loop:</span>{' '}
            <span className="font-mono">{agentState.stats.avgLoopTimeMs.toFixed(0)}ms</span>
          </div>
          <div>
            <span className="text-fg-secondary">LLM:</span>{' '}
            <span className="font-mono">{agentState.stats.avgLLMLatencyMs.toFixed(0)}ms</span>
          </div>
          <div>
            <span className="text-fg-secondary">Calls:</span>{' '}
            <span className="font-mono">{agentState.stats.llmCallCount}</span>
          </div>
          {agentState.visionEnabled && (
            <div className="text-purple-400">
              <span className="text-fg-secondary">Vision:</span>{' '}
              <span className="font-mono">{agentState.stats.visionProcessCount}</span>
              {agentState.stats.avgVisionLatencyMs > 0 && (
                <span className="text-fg-secondary ml-1">({agentState.stats.avgVisionLatencyMs.toFixed(0)}ms)</span>
              )}
            </div>
          )}
          {agentState.errors.length > 0 && (
            <div className="text-red-400">
              <span className="text-fg-secondary">Errors:</span>{' '}
              <span className="font-mono">{agentState.errors.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
