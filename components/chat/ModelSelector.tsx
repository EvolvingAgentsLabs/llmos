'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AVAILABLE_MODELS, LLMStorage } from '@/lib/llm-client';

interface ModelSelectorProps {
  onModelChange?: (modelId: string) => void;
  dropdownPosition?: 'bottom' | 'top';
}

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
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
    // Load previously saved custom model for the input field
    const savedCustomModel = LLMStorage.getCustomModel();
    if (savedCustomModel && !customModel) {
      setCustomModel(savedCustomModel);
    }

    // Listen for model changes from other components
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

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    LLMStorage.saveModel(modelId);
    setIsOpen(false);
    setIsCustomMode(false);
    onModelChange?.(modelId);
  };

  const handleCustomModelSubmit = () => {
    if (!customModel.trim()) return;

    const customModelId = customModel.trim();
    setSelectedModel(customModelId);
    LLMStorage.saveModel(customModelId);
    LLMStorage.saveCustomModel(customModelId);
    setIsOpen(false);
    setIsCustomMode(true);
    onModelChange?.(customModelId);
  };

  const currentModelInfo = selectedModel ? AVAILABLE_MODELS[selectedModel] : null;
  const displayName = currentModelInfo?.name || (isCustomMode ? customModel.split('/').pop() : 'Select Model');

  // Get models as array
  const models = Object.entries(AVAILABLE_MODELS).map(([key, model]) => ({ key, ...model }));

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

      {/* Dropdown Menu - Centered Modal using Portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            style={{ zIndex: 9998 }}
            onClick={() => setIsOpen(false)}
          />

          {/* Menu - Centered in viewport */}
          <div
            className="fixed w-80 bg-bg-secondary border border-border-primary rounded-lg shadow-2xl"
            style={{
              zIndex: 9999,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
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
                  Custom Gemini Model
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
                  placeholder="e.g., gemini-2.5-pro-preview"
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
  );
}
