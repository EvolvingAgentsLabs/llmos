'use client';

/**
 * Robot Agent Panel
 *
 * Shows real-time interaction between the robot AI agent and the LLM:
 * - Sensor readings sent to LLM
 * - LLM responses with reasoning
 * - Tool calls with parameters
 * - Execution results
 *
 * The panel displays the "conversation" as if the robot is chatting with the LLM.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ESP32AgentRuntime,
  ESP32AgentState,
  ESP32AgentConfig,
  createESP32Agent,
  stopESP32Agent,
  getESP32Agent,
  listActiveESP32Agents,
  DEFAULT_AGENT_PROMPTS,
  SensorReadings,
} from '@/lib/runtime/esp32-agent-runtime';
import { getDeviceManager } from '@/lib/hardware/esp32-device-manager';

interface AgentMessage {
  id: string;
  type: 'sensor' | 'llm-request' | 'llm-response' | 'tool-call' | 'tool-result' | 'system' | 'error';
  timestamp: number;
  content: string;
  data?: any;
}

interface RobotAgentPanelProps {
  deviceId?: string;
  onDeviceCreated?: (deviceId: string) => void;
}

export default function RobotAgentPanel({ deviceId: initialDeviceId, onDeviceCreated }: RobotAgentPanelProps) {
  const [deviceId, setDeviceId] = useState<string | null>(initialDeviceId || null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<ESP32AgentState | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<keyof typeof DEFAULT_AGENT_PROMPTS>('explorer');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loopInterval, setLoopInterval] = useState(1000);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<ESP32AgentRuntime | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add message to the conversation
  const addMessage = useCallback((type: AgentMessage['type'], content: string, data?: any) => {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      content,
      data,
    };
    setMessages((prev) => [...prev.slice(-100), message]); // Keep last 100 messages
  }, []);

  // Create virtual device
  const createDevice = useCallback(async () => {
    try {
      const manager = getDeviceManager();
      const newDeviceId = await manager.createVirtualDevice('AI Robot');
      setDeviceId(newDeviceId);
      addMessage('system', `Virtual device created: ${newDeviceId}`);
      onDeviceCreated?.(newDeviceId);

      // Start the simulation
      manager.startDevice(newDeviceId);
      addMessage('system', 'Device simulation started');
    } catch (error: any) {
      addMessage('error', `Failed to create device: ${error.message}`);
    }
  }, [addMessage, onDeviceCreated]);

  // Start the agent
  const startAgent = useCallback(async () => {
    if (!deviceId) {
      addMessage('error', 'No device selected. Create a virtual device first.');
      return;
    }

    const prompt = customPrompt || DEFAULT_AGENT_PROMPTS[selectedPrompt];
    const newAgentId = `robot-agent-${Date.now()}`;

    addMessage('system', `Starting robot agent with ${selectedPrompt} behavior...`);
    addMessage('system', `System prompt:\n${prompt.substring(0, 200)}...`);

    try {
      const agent = createESP32Agent({
        id: newAgentId,
        name: `Robot-${selectedPrompt}`,
        deviceId,
        systemPrompt: prompt,
        loopIntervalMs: loopInterval,
        maxIterations: 100,
        onStateChange: (state) => {
          setAgentState(state);

          // Log sensor readings
          if (state.lastSensorReading) {
            const sensors = state.lastSensorReading;
            addMessage(
              'sensor',
              `Sensors: Front=${sensors.distance.front.toFixed(0)}cm, L=${sensors.distance.left.toFixed(0)}cm, R=${sensors.distance.right.toFixed(0)}cm`,
              sensors
            );
          }

          // Log LLM response
          if (state.lastLLMResponse) {
            addMessage('llm-response', state.lastLLMResponse);
          }

          // Log tool calls
          for (const tc of state.lastToolCalls) {
            addMessage('tool-call', `Tool: ${tc.tool}`, tc.args);
            addMessage(
              'tool-result',
              tc.result.success ? `Success: ${JSON.stringify(tc.result.data)}` : `Error: ${tc.result.error}`,
              tc.result
            );
          }

          // Log errors
          if (state.errors.length > 0) {
            const lastError = state.errors[state.errors.length - 1];
            addMessage('error', lastError);
          }
        },
        onLog: (msg, level) => {
          if (level === 'error') {
            addMessage('error', msg);
          }
        },
      });

      agentRef.current = agent;
      agent.start();
      setAgentId(newAgentId);
      setIsRunning(true);
      addMessage('system', `Agent started (ID: ${newAgentId})`);
    } catch (error: any) {
      addMessage('error', `Failed to start agent: ${error.message}`);
    }
  }, [deviceId, selectedPrompt, customPrompt, loopInterval, addMessage]);

  // Stop the agent
  const stopAgent = useCallback(() => {
    if (agentId) {
      stopESP32Agent(agentId);
      addMessage('system', 'Agent stopped');
      setIsRunning(false);
      setAgentId(null);
      agentRef.current = null;
    }
  }, [agentId, addMessage]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Get message style based on type
  const getMessageStyle = (type: AgentMessage['type']) => {
    switch (type) {
      case 'sensor':
        return 'bg-blue-900/30 border-blue-500/50 text-blue-200';
      case 'llm-request':
        return 'bg-purple-900/30 border-purple-500/50 text-purple-200';
      case 'llm-response':
        return 'bg-green-900/30 border-green-500/50 text-green-200';
      case 'tool-call':
        return 'bg-orange-900/30 border-orange-500/50 text-orange-200';
      case 'tool-result':
        return 'bg-yellow-900/30 border-yellow-500/50 text-yellow-200';
      case 'system':
        return 'bg-gray-800/50 border-gray-500/50 text-gray-300';
      case 'error':
        return 'bg-red-900/30 border-red-500/50 text-red-200';
      default:
        return 'bg-gray-800/50 border-gray-500/50 text-gray-300';
    }
  };

  // Get message icon
  const getMessageIcon = (type: AgentMessage['type']) => {
    switch (type) {
      case 'sensor':
        return '📡';
      case 'llm-request':
        return '🧠';
      case 'llm-response':
        return '🤖';
      case 'tool-call':
        return '🔧';
      case 'tool-result':
        return '✅';
      case 'system':
        return 'ℹ️';
      case 'error':
        return '❌';
      default:
        return '💬';
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary text-fg-primary">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-primary bg-bg-secondary">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="font-semibold">Robot AI Agent</h2>
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

      {/* Controls */}
      <div className="p-3 border-b border-border-primary bg-bg-secondary/50 space-y-3">
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
            className="text-xs bg-bg-tertiary border border-border-primary rounded px-2 py-1"
          >
            <option value="explorer">Explorer (avoid obstacles)</option>
            <option value="wallFollower">Wall Follower (right-hand rule)</option>
            <option value="lineFollower">Line Follower</option>
            <option value="patroller">Patroller (rectangle pattern)</option>
          </select>
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
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={startAgent}
              disabled={!deviceId}
              className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded flex items-center gap-1"
            >
              <span>▶</span> Start Agent
            </button>
          ) : (
            <button
              onClick={stopAgent}
              className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 rounded flex items-center gap-1"
            >
              <span>⏹</span> Stop Agent
            </button>
          )}
          <button
            onClick={clearMessages}
            className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 rounded"
          >
            Clear Log
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {agentState && (
        <div className="flex items-center gap-4 px-3 py-2 bg-bg-tertiary/50 text-xs border-b border-border-primary">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-fg-secondary">
            <span className="text-4xl mb-4">🤖</span>
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-2">Create a device and start the agent to see the interaction</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-2 rounded border ${getMessageStyle(msg.type)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-sm">{getMessageIcon(msg.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase">{msg.type}</span>
                    <span className="text-xs opacity-60">{formatTime(msg.timestamp)}</span>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                    {msg.content}
                  </pre>
                  {msg.data && msg.type === 'tool-call' && (
                    <div className="mt-1 text-xs opacity-80">
                      Args: {JSON.stringify(msg.data)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Legend */}
      <div className="p-2 border-t border-border-primary bg-bg-secondary/50">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span>📡</span> Sensor
          </span>
          <span className="flex items-center gap-1">
            <span>🤖</span> LLM Response
          </span>
          <span className="flex items-center gap-1">
            <span>🔧</span> Tool Call
          </span>
          <span className="flex items-center gap-1">
            <span>✅</span> Result
          </span>
        </div>
      </div>
    </div>
  );
}
