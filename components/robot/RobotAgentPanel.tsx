'use client';

/**
 * Robot Agent Panel - Simplified
 *
 * Simple control panel for robot AI agents with 3 basic tools:
 * - take_picture
 * - left_wheel
 * - right_wheel
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ESP32AgentRuntime,
  ESP32AgentState,
  createESP32Agent,
  stopESP32Agent,
  DEFAULT_AGENT_PROMPTS,
} from '@/lib/runtime/esp32-agent-runtime';
import { getDeviceManager } from '@/lib/hardware/esp32-device-manager';
import { Cpu, ChevronDown, ChevronRight, MessageSquare, User, Bot } from 'lucide-react';

interface RobotAgentPanelProps {
  deviceId?: string;
  onDeviceCreated?: (deviceId: string) => void;
}

export default function RobotAgentPanel({
  deviceId: initialDeviceId,
  onDeviceCreated,
}: RobotAgentPanelProps) {
  const [deviceId, setDeviceId] = useState<string | null>(initialDeviceId || null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<ESP32AgentState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [agentGoal, setAgentGoal] = useState('');
  const [loopInterval, setLoopInterval] = useState(2000);
  const [showMessages, setShowMessages] = useState(true);

  const agentRef = useRef<ESP32AgentRuntime | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Unified robot color
  const ROBOT_COLOR = '#58a6ff';

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

  // Start the agent
  const startAgent = useCallback(async () => {
    if (!deviceId) {
      console.error('[RobotAgentPanel] No device selected. Create a virtual device first.');
      return;
    }

    const newAgentId = `robot-agent-${Date.now()}`;
    const prompt = DEFAULT_AGENT_PROMPTS.simple;

    console.log('[RobotAgentPanel] Starting simple robot agent...');
    if (agentGoal) {
      console.log('[RobotAgentPanel] Goal:', agentGoal);
    }

    try {
      const agent = createESP32Agent({
        id: newAgentId,
        name: 'SimpleRobot',
        deviceId,
        systemPrompt: prompt,
        goal: agentGoal || undefined,
        loopIntervalMs: loopInterval,
        maxIterations: 100,
        onStateChange: (state) => {
          setAgentState(state);

          // Log errors to console
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
    } catch (error: any) {
      console.error('[RobotAgentPanel] Failed to start agent:', error.message);
    }
  }, [deviceId, agentGoal, loopInterval]);

  // Stop the agent
  const stopAgent = useCallback(async () => {
    if (agentId) {
      stopESP32Agent(agentId);
      console.log('[RobotAgentPanel] Agent stopped');
      setIsRunning(false);
      setAgentId(null);
      agentRef.current = null;
    }
  }, [agentId]);

  return (
    <div className="flex flex-col h-full bg-bg-primary text-fg-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-primary bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5" style={{ color: ROBOT_COLOR }} />
          <h2 className="font-semibold text-sm">Simple Robot Agent</h2>
          {isRunning && (
            <span className="px-2 py-0.5 text-xs bg-green-600 rounded-full animate-pulse">
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {agentState && (
            <span className="text-xs text-fg-secondary">
              Cycle: {agentState.iteration} | Tools: {agentState.stats.totalToolCalls}
            </span>
          )}
        </div>
      </div>

      {/* Controls Panel */}
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

        {/* Goal input */}
        <div className="flex items-start gap-2">
          <span className="text-xs text-fg-secondary w-16 pt-1">Goal:</span>
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={agentGoal}
              onChange={(e) => setAgentGoal(e.target.value)}
              disabled={isRunning}
              placeholder="e.g., Explore the room, Find the red box"
              className="w-full text-xs bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 placeholder:text-fg-secondary/50 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[10px] text-fg-secondary/70">
              Optional: Set a goal for the robot to consider when planning
            </p>
          </div>
        </div>

        {/* Loop interval */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-secondary w-16">Interval:</span>
          <input
            type="range"
            min="500"
            max="5000"
            step="500"
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
              <span>Start Agent</span>
            </button>
          ) : (
            <button
              onClick={stopAgent}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded flex items-center gap-1 font-medium"
            >
              <span>Stop Agent</span>
            </button>
          )}
        </div>

        {/* Info about the simple robot */}
        <div className="mt-4 p-3 rounded-lg bg-[#161b22] border border-[#30363d]">
          <p className="text-xs text-[#8b949e]">
            <span className="text-[#58a6ff] font-medium">Simple Robot Agent</span>
          </p>
          <ul className="mt-2 text-xs text-[#8b949e] space-y-1 ml-4">
            <li>
              <span className="text-[#3fb950]">take_picture</span> - See the environment
            </li>
            <li>
              <span className="text-[#3fb950]">left_wheel</span> - forward / backward / stop
            </li>
            <li>
              <span className="text-[#3fb950]">right_wheel</span> - forward / backward / stop
            </li>
          </ul>
          <p className="mt-2 text-[10px] text-[#8b949e]">
            Cycle: LOOK (take_picture) - THINK - ORIENT - MOVE - STOP - repeat
          </p>
        </div>

        {/* Last observation display */}
        {agentState?.lastPicture && isRunning && (
          <div className="p-3 rounded-lg bg-[#161b22] border border-[#30363d]">
            <p className="text-xs text-[#8b949e] mb-1">
              <span className="text-[#58a6ff] font-medium">Last Picture:</span>
            </p>
            <p className="text-xs text-[#e6edf3]">{agentState.lastPicture.scene}</p>
            <p className="text-[10px] text-[#3fb950] mt-1">
              {agentState.lastPicture.recommendation}
            </p>
          </div>
        )}

        {/* Session Messages - Full Conversation History */}
        {agentState && (
          <div className="rounded-lg bg-[#161b22] border border-[#30363d] overflow-hidden">
            {/* Messages Header - Collapsible */}
            <button
              onClick={() => setShowMessages(!showMessages)}
              className="w-full px-3 py-2 flex items-center justify-between bg-[#21262d] hover:bg-[#30363d] transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#a371f7]" />
                <span className="text-xs font-medium text-[#e6edf3]">
                  Session Messages ({agentState.conversationHistory.length})
                </span>
              </div>
              {showMessages ? (
                <ChevronDown className="w-4 h-4 text-[#8b949e]" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#8b949e]" />
              )}
            </button>

            {/* Messages List */}
            {showMessages && (
              <div className="max-h-96 overflow-y-auto">
                {agentState.conversationHistory.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[#8b949e]">
                    No messages yet. Start the agent to see conversation history.
                  </div>
                ) : (
                  <div className="divide-y divide-[#30363d]">
                    {agentState.conversationHistory.map((message, index) => (
                      <div
                        key={index}
                        className={`px-3 py-2 ${
                          message.role === 'assistant'
                            ? 'bg-[#161b22]'
                            : message.role === 'user'
                            ? 'bg-[#0d1117]'
                            : 'bg-[#1c2128]'
                        }`}
                      >
                        {/* Message Header */}
                        <div className="flex items-center gap-2 mb-1">
                          {message.role === 'assistant' ? (
                            <Bot className="w-3 h-3 text-[#58a6ff]" />
                          ) : message.role === 'user' ? (
                            <User className="w-3 h-3 text-[#3fb950]" />
                          ) : (
                            <Cpu className="w-3 h-3 text-[#f0883e]" />
                          )}
                          <span
                            className={`text-[10px] font-medium uppercase ${
                              message.role === 'assistant'
                                ? 'text-[#58a6ff]'
                                : message.role === 'user'
                                ? 'text-[#3fb950]'
                                : 'text-[#f0883e]'
                            }`}
                          >
                            {message.role === 'assistant'
                              ? 'Robot AI'
                              : message.role === 'user'
                              ? 'Sensor Input'
                              : 'System'}
                          </span>
                          <span className="text-[9px] text-[#6e7681]">#{index + 1}</span>
                        </div>

                        {/* Message Content */}
                        <div className="text-xs text-[#e6edf3] whitespace-pre-wrap break-words font-mono overflow-x-auto">
                          {message.content.length > 2000 ? (
                            <details>
                              <summary className="cursor-pointer text-[#8b949e] hover:text-[#e6edf3]">
                                Show full message ({message.content.length} chars)
                              </summary>
                              <pre className="mt-2 p-2 bg-[#0d1117] rounded overflow-x-auto text-[10px]">
                                {message.content}
                              </pre>
                            </details>
                          ) : (
                            <pre className="overflow-x-auto text-[10px]">{message.content}</pre>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
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
