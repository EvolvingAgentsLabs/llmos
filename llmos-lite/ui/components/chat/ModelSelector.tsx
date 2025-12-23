'use client';

import { useState, useEffect } from 'react';
import { AVAILABLE_MODELS, LLMStorage, type ModelId } from '@/lib/llm-client';

interface ModelSelectorProps {
  onModelChange?: (modelId: ModelId) => void;
  dropdownPosition?: 'bottom' | 'top';
}

export default function ModelSelector({ onModelChange, dropdownPosition = 'bottom' }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<ModelId | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  useEffect(() => {
    const currentModel = LLMStorage.getModel();
    if (currentModel) {
      setSelectedModel(currentModel);
      // Check if it's a custom model (not in AVAILABLE_MODELS)
      if (!AVAILABLE_MODELS[currentModel]) {
        setIsCustomMode(true);
        setCustomModel(currentModel);
      }
    }
  }, []);

  const handleModelSelect = (modelId: ModelId) => {
    setSelectedModel(modelId);
    LLMStorage.saveModel(modelId);
    setIsOpen(false);
    setIsCustomMode(false);
    onModelChange?.(modelId);
  };

  const handleCustomModelSubmit = () => {
    if (!customModel.trim()) return;

    const customModelId = customModel.trim() as ModelId;
    setSelectedModel(customModelId);
    LLMStorage.saveModel(customModelId);
    setIsOpen(false);
    setIsCustomMode(true);
    onModelChange?.(customModelId);
  };

  const currentModelInfo = selectedModel ? AVAILABLE_MODELS[selectedModel] : null;
  const displayName = currentModelInfo?.name || (isCustomMode ? customModel : 'Select Model');

  // Group models by provider
  const modelsByProvider = Object.entries(AVAILABLE_MODELS).reduce((acc, [key, model]) => {
    const provider = model.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push({ key: key as ModelId, ...model });
    return acc;
  }, {} as Record<string, Array<{ key: ModelId; id: string; name: string; provider: string; inputCost: string; outputCost: string; contextWindow: string }>>);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border-primary hover:border-accent-primary/50 transition-all duration-200 text-xs group"
      >
        <svg className="w-3.5 h-3.5 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-fg-tertiary">Model</span>
          <span className="text-xs font-medium text-fg-primary group-hover:text-accent-primary transition-colors truncate max-w-[200px]">
            {displayName}
          </span>
        </div>
        <svg className={`w-3 h-3 text-fg-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className={`absolute right-0 w-96 bg-bg-secondary border border-border-primary rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto ${dropdownPosition === 'top' ? 'bottom-full mb-2' : 'mt-2'}`}>
            <div className="p-3 border-b border-border-primary bg-bg-tertiary">
              <h3 className="text-xs font-semibold text-fg-primary">Select AI Model</h3>
              <p className="text-[10px] text-fg-tertiary mt-0.5">Choose the model for your conversations</p>
            </div>

            <div className="p-2 space-y-3">
              {/* Custom Model Input */}
              <div className="space-y-2 pb-3 border-b border-border-primary">
                <div className="px-2 py-1">
                  <h4 className="text-[10px] font-semibold text-fg-secondary uppercase tracking-wider">Custom Model</h4>
                </div>
                <div className="px-2 space-y-2">
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCustomModelSubmit();
                      }
                    }}
                    placeholder="e.g., deepseek/deepseek-r1-0528:free"
                    className="w-full px-3 py-2 text-xs bg-bg-tertiary border border-border-primary rounded-lg focus:outline-none focus:border-accent-primary transition-colors"
                  />
                  <button
                    onClick={handleCustomModelSubmit}
                    disabled={!customModel.trim()}
                    className="w-full px-3 py-2 text-xs font-medium bg-accent-primary/20 text-accent-primary border border-accent-primary/50 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Use Custom Model
                  </button>
                  <p className="text-[10px] text-fg-tertiary">
                    Enter any OpenRouter model ID
                  </p>
                </div>
              </div>

              {/* Preset Models */}
              {Object.entries(modelsByProvider).map(([provider, models]) => (
                <div key={provider} className="space-y-1">
                  <div className="px-2 py-1">
                    <h4 className="text-[10px] font-semibold text-fg-secondary uppercase tracking-wider">{provider}</h4>
                  </div>
                  {models.map((model) => (
                    <button
                      key={model.key}
                      onClick={() => handleModelSelect(model.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 ${
                        selectedModel === model.key && !isCustomMode
                          ? 'bg-accent-primary/20 border border-accent-primary/50'
                          : 'bg-bg-tertiary border border-transparent hover:border-border-primary hover:bg-bg-elevated'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${selectedModel === model.key && !isCustomMode ? 'text-accent-primary' : 'text-fg-primary'}`}>
                              {model.name}
                            </span>
                            {selectedModel === model.key && !isCustomMode && (
                              <svg className="w-3.5 h-3.5 text-accent-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] text-fg-tertiary">
                              Context: {model.contextWindow}
                            </span>
                            <span className="text-[10px] text-fg-tertiary">•</span>
                            <span className="text-[10px] text-fg-tertiary">
                              {model.inputCost} in / {model.outputCost} out
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-border-primary bg-bg-tertiary">
              <p className="text-[10px] text-fg-tertiary">
                💡 Model changes take effect on the next message
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
