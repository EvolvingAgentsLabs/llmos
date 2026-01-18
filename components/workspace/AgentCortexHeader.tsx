'use client';

import { useEffect, useState, useCallback } from 'react';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';
import { Pause, Play, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AVAILABLE_MODELS, LLMStorage } from '@/lib/llm-client';

// ============================================================================
// AGENT CORTEX HEADER - The "HAL 9000 Eye" status indicator with controls
// ============================================================================

const stateLabels: Record<AgentState, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  executing: 'Executing...',
  success: 'Complete',
  error: 'Error',
};

const stateColors: Record<AgentState, { bg: string; glow: string; text: string }> = {
  idle: {
    bg: 'bg-indigo-500',
    glow: 'shadow-indigo-500/30',
    text: 'text-indigo-400',
  },
  thinking: {
    bg: 'bg-blue-500',
    glow: 'shadow-blue-500/50',
    text: 'text-blue-400',
  },
  executing: {
    bg: 'bg-amber-500',
    glow: 'shadow-amber-500/50',
    text: 'text-amber-400',
  },
  success: {
    bg: 'bg-green-500',
    glow: 'shadow-green-500/50',
    text: 'text-green-400',
  },
  error: {
    bg: 'bg-red-500',
    glow: 'shadow-red-500/50',
    text: 'text-red-400',
  },
};

// Event for pause/resume - can be listened to by orchestrator
export const ORCHESTRATOR_PAUSE_EVENT = 'orchestrator:pause';
export const ORCHESTRATOR_RESUME_EVENT = 'orchestrator:resume';

export default function AgentCortexHeader() {
  const { state } = useWorkspace();
  const [pulsePhase, setPulsePhase] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const isActive = state.agentState !== 'idle' && state.agentState !== 'success';
  const colors = stateColors[state.agentState];

  // Load saved model and listen for changes
  useEffect(() => {
    const currentModel = LLMStorage.getModel();
    if (currentModel) {
      setSelectedModel(currentModel);
      if (!AVAILABLE_MODELS[currentModel]) {
        setIsCustomMode(true);
        setCustomModel(currentModel);
      }
    }
    const savedCustomModel = LLMStorage.getCustomModel();
    if (savedCustomModel && !customModel) {
      setCustomModel(savedCustomModel);
    }

    // Listen for model changes from other components (e.g., chat panel model selector)
    const handleModelChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ modelId: string }>;
      const newModelId = customEvent.detail.modelId;
      setSelectedModel(newModelId);
      // Check if it's a custom model
      if (!AVAILABLE_MODELS[newModelId]) {
        setIsCustomMode(true);
        setCustomModel(newModelId);
      } else {
        setIsCustomMode(false);
      }
    };

    window.addEventListener('llmos:model-changed', handleModelChange);
    return () => {
      window.removeEventListener('llmos:model-changed', handleModelChange);
    };
  }, []);

  // Pulse animation for active states
  useEffect(() => {
    if (!isActive || isPaused) return;

    const interval = setInterval(() => {
      setPulsePhase((prev) => (prev + 1) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  // Handle pause/resume
  const togglePause = useCallback(() => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);

    // Dispatch custom event for orchestrator to listen
    window.dispatchEvent(new CustomEvent(
      newPausedState ? ORCHESTRATOR_PAUSE_EVENT : ORCHESTRATOR_RESUME_EVENT
    ));
  }, [isPaused]);

  // Handle model selection
  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    LLMStorage.saveModel(modelId);
    setIsModelMenuOpen(false);
    setIsCustomMode(false);
  }, []);

  // Handle custom model
  const handleCustomModelSubmit = useCallback(() => {
    if (!customModel.trim()) return;
    const customModelId = customModel.trim();
    setSelectedModel(customModelId);
    LLMStorage.saveModel(customModelId);
    LLMStorage.saveCustomModel(customModelId);
    setIsModelMenuOpen(false);
    setIsCustomMode(true);
  }, [customModel]);

  // Calculate dynamic scale based on pulse
  const pulseScale = isActive && !isPaused ? 1 + Math.sin(pulsePhase * 0.15) * 0.15 : 1;
  const glowOpacity = isActive && !isPaused ? 0.4 + Math.sin(pulsePhase * 0.1) * 0.3 : 0;

  // Get current model display name
  const currentModelInfo = selectedModel ? AVAILABLE_MODELS[selectedModel] : null;
  const modelDisplayName = currentModelInfo?.name || (isCustomMode ? selectedModel?.split('/').pop() : 'Select Model');

  // Get models as array
  const models = Object.entries(AVAILABLE_MODELS).map(([key, model]) => ({ key, ...model }));

  return (
    <div className="flex items-center gap-4">
      {/* Pause/Play Button */}
      <button
        onClick={togglePause}
        disabled={!isActive && !isPaused}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
          ${isActive || isPaused
            ? isPaused
              ? 'bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-400'
              : 'bg-blue-500/20 border border-blue-500/50 hover:bg-blue-500/30 text-blue-400'
            : 'bg-bg-tertiary border border-border-primary text-fg-tertiary opacity-50 cursor-not-allowed'
          }`}
        title={isPaused ? 'Resume execution' : 'Pause execution'}
      >
        {isPaused ? (
          <Play className="w-4 h-4" />
        ) : (
          <Pause className="w-4 h-4" />
        )}
      </button>

      {/* The Orb - HAL 9000 inspired */}
      <div className="relative flex items-center justify-center w-8 h-8">
        {/* Outer glow ring */}
        <div
          className={`absolute inset-0 rounded-full ${isPaused ? 'bg-amber-500' : colors.bg} blur-md transition-all duration-300`}
          style={{
            opacity: isPaused ? 0.3 : glowOpacity,
            transform: `scale(${pulseScale * 1.2})`,
          }}
        />

        {/* Middle ring */}
        <div
          className={`absolute rounded-full border-2 ${isPaused ? 'border-amber-500' : colors.bg.replace('bg-', 'border-')} transition-all duration-300`}
          style={{
            width: 24,
            height: 24,
            opacity: isActive ? 0.6 : 0.3,
            transform: `scale(${pulseScale})`,
          }}
        />

        {/* Core orb */}
        <div
          className={`relative rounded-full ${isPaused ? 'bg-amber-500' : colors.bg} transition-all duration-300 ${isActive && !isPaused ? `shadow-lg ${colors.glow}` : ''}`}
          style={{
            width: 12,
            height: 12,
            transform: `scale(${isActive && !isPaused ? pulseScale : 1})`,
          }}
        />

        {/* Orbiting particle (when active and not paused) */}
        {isActive && !isPaused && (
          <div
            className={`absolute w-1.5 h-1.5 rounded-full ${colors.bg}`}
            style={{
              animation: 'orbit 2s linear infinite',
            }}
          />
        )}

        <style jsx>{`
          @keyframes orbit {
            from { transform: rotate(0deg) translateX(14px) rotate(0deg); }
            to { transform: rotate(360deg) translateX(14px) rotate(-360deg); }
          }
        `}</style>
      </div>

      {/* Status text */}
      <div className="flex flex-col min-w-[80px]">
        <span className={`text-xs font-medium ${isPaused ? 'text-amber-400' : colors.text} transition-colors duration-300`}>
          {isPaused ? 'Paused' : stateLabels[state.agentState]}
        </span>
        {state.taskType !== 'idle' && isActive && (
          <span className="text-[10px] text-fg-muted capitalize">
            {state.taskType}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border-primary/50" />

      {/* Model Selector - Compact */}
      <div className="relative">
        <button
          onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary/50 border border-border-primary hover:border-accent-primary/50 transition-all duration-200 text-xs group"
        >
          <div className="w-2 h-2 rounded-full bg-accent-primary" />
          <span className="text-xs font-medium text-fg-primary group-hover:text-accent-primary transition-colors truncate max-w-[120px]">
            {modelDisplayName}
          </span>
          <ChevronDown className={`w-3 h-3 text-fg-tertiary transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Model Dropdown */}
        {isModelMenuOpen && typeof document !== 'undefined' && createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/20"
              style={{ zIndex: 9998 }}
              onClick={() => setIsModelMenuOpen(false)}
            />

            {/* Menu */}
            <div
              className="fixed w-80 bg-bg-secondary border border-border-primary rounded-lg shadow-2xl"
              style={{
                zIndex: 9999,
                top: '60px',
                left: '50%',
                transform: 'translateX(-50%)'
              }}
            >
              <div className="p-3 border-b border-border-primary bg-bg-tertiary">
                <h3 className="text-xs font-semibold text-fg-primary">Select AI Model</h3>
              </div>

              <div className="p-3 space-y-2">
                {/* Preset Models */}
                {models.map((model) => (
                  <button
                    key={model.key}
                    onClick={() => handleModelSelect(model.key)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      selectedModel === model.key && !isCustomMode
                        ? 'bg-accent-primary/20 border border-accent-primary/50'
                        : 'bg-bg-tertiary border border-transparent hover:border-border-primary hover:bg-bg-elevated'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm font-medium ${selectedModel === model.key && !isCustomMode ? 'text-accent-primary' : 'text-fg-primary'}`}>
                          {model.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-fg-tertiary">
                            {model.contextWindow}
                          </span>
                          <span className="text-[10px] text-fg-tertiary">•</span>
                          <span className="text-[10px] text-fg-tertiary">
                            {model.inputCost} in / {model.outputCost} out
                          </span>
                        </div>
                      </div>
                      {selectedModel === model.key && !isCustomMode && (
                        <svg className="w-4 h-4 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}

                {/* Divider */}
                <div className="border-t border-border-primary my-2" />

                {/* Custom Model Input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-medium text-fg-secondary uppercase tracking-wider">
                    Custom OpenRouter Model
                  </label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCustomModelSubmit();
                      }
                    }}
                    placeholder="e.g., deepseek/deepseek-r1:free"
                    className={`w-full px-3 py-2 text-xs bg-bg-tertiary border rounded-lg focus:outline-none focus:border-accent-primary transition-colors ${
                      isCustomMode ? 'border-accent-primary/50' : 'border-border-primary'
                    }`}
                  />
                  <button
                    onClick={handleCustomModelSubmit}
                    disabled={!customModel.trim()}
                    className="w-full px-3 py-2 text-xs font-medium bg-bg-tertiary text-fg-primary border border-border-primary rounded-lg hover:bg-bg-elevated hover:border-accent-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Use Custom Model
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
}
