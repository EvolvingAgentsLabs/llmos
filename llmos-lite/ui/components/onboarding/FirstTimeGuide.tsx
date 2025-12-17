'use client';

import { useState, useEffect } from 'react';

interface FirstTimeGuideProps {
  onDismiss: () => void;
}

export default function FirstTimeGuide({ onDismiss }: FirstTimeGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to LLMos-Lite!',
      description: 'Let\'s take a quick tour of the interface.',
      highlight: null,
    },
    {
      title: 'Volumes',
      description: 'Your work is organized into volumes: System (read-only), Team (shared), and User (personal).',
      highlight: 'volumes',
    },
    {
      title: 'Chat Interface',
      description: 'Start chatting with the AI in the center panel. Your conversations are automatically saved as sessions.',
      highlight: 'chat',
    },
    {
      title: 'Artifacts & Workflows',
      description: 'Code, visualizations, and workflows appear in the right panel as you work.',
      highlight: 'artifacts',
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onDismiss();
    }
  };

  const handleSkip = () => {
    onDismiss();
  };

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="terminal-panel max-w-md w-full mx-4">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="terminal-heading text-lg">{step.title}</h2>
            <span className="text-xs text-terminal-fg-tertiary">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p className="text-terminal-fg-secondary text-sm">{step.description}</p>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSkip} className="btn-terminal-secondary flex-1 py-2">
            Skip Tour
          </button>
          <button onClick={handleNext} className="btn-terminal flex-1 py-2">
            {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>

        <div className="mt-4 flex gap-1 justify-center">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1 w-8 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-terminal-accent-green'
                  : 'bg-terminal-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
