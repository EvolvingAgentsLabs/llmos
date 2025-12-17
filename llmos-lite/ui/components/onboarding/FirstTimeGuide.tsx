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
      description: 'Let\'s take a quick tour of the interface and see what you can build.',
      highlight: null,
      samplePrompts: null,
    },
    {
      title: 'Volumes',
      description: 'Your work is organized into volumes: System (read-only), Team (shared), and User (personal).',
      highlight: 'volumes',
      samplePrompts: null,
    },
    {
      title: 'Chat Interface',
      description: 'Start chatting with the AI. Your conversations are automatically saved as sessions.',
      highlight: 'chat',
      samplePrompts: null,
    },
    {
      title: 'Artifacts & Workflows',
      description: 'Generate quantum circuits, 3D visualizations, and data plots. View both graphical and code representations.',
      highlight: 'artifacts',
      samplePrompts: [
        {
          icon: '⚛️',
          title: 'Quantum Circuit',
          prompt: 'Create a Bell state quantum circuit with 2 qubits. Show me both the circuit diagram and the Qiskit code.',
          color: 'accent-green',
        },
        {
          icon: '🎨',
          title: '3D Molecule',
          prompt: 'Visualize an H2 molecule in 3D with two hydrogen atoms and a bond between them. Show me the Three.js code too.',
          color: 'accent-blue',
        },
        {
          icon: '📊',
          title: 'VQE Plot',
          prompt: 'Create a convergence plot for a VQE optimization showing energy decreasing over 50 iterations.',
          color: 'accent-orange',
        },
      ],
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

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
  };

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="terminal-panel max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="terminal-heading text-lg">{step.title}</h2>
            <span className="text-xs text-terminal-fg-tertiary">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p className="text-terminal-fg-secondary text-sm">{step.description}</p>
        </div>

        {/* Sample Prompts */}
        {step.samplePrompts && (
          <div className="mb-6 space-y-3">
            <h3 className="text-xs font-medium text-terminal-fg-primary mb-2">
              Try these examples:
            </h3>
            {step.samplePrompts.map((sample, index) => (
              <div
                key={index}
                className="p-3 rounded border border-terminal-border bg-terminal-bg-secondary hover:border-terminal-accent-green transition-colors cursor-pointer group"
                onClick={() => handleCopyPrompt(sample.prompt)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{sample.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-sm font-medium text-terminal-${sample.color}`}>
                        {sample.title}
                      </h4>
                      <span className="text-[10px] text-terminal-fg-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to copy
                      </span>
                    </div>
                    <p className="text-xs text-terminal-fg-secondary leading-relaxed">
                      {sample.prompt}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-terminal-fg-tertiary text-center mt-2">
              💡 Click any example to copy it to your clipboard
            </p>
          </div>
        )}

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
