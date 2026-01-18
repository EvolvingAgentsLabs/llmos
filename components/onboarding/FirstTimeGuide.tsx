'use client';

import { useState, useEffect } from 'react';

interface FirstTimeGuideProps {
  onDismiss: () => void;
  onSendPrompt?: (prompt: string) => void;
}

export default function FirstTimeGuide({ onDismiss, onSendPrompt }: FirstTimeGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to LLMos Desktop!',
      description: 'Let\'s take a quick tour of the interface and see what you can build with AI-powered robotics.',
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
      description: 'Generate data visualizations, 3D animations, and scientific plots using numpy, scipy, matplotlib, and more.',
      highlight: 'artifacts',
      samplePrompts: [
        {
          icon: '📊',
          title: 'Data Analysis',
          prompt: 'Create a sine wave signal, add noise, then apply FFT to show frequency spectrum. Plot both time and frequency domains.',
          color: 'accent-green',
        },
        {
          icon: '🎨',
          title: '3D Surface Plot',
          prompt: 'Create a 3D surface plot of the function z = sin(sqrt(x^2 + y^2)) using matplotlib with a colorful gradient.',
          color: 'accent-blue',
        },
        {
          icon: '🤖',
          title: 'Robot Kinematics',
          prompt: 'Simulate a 2-link robot arm trajectory from (0,2) to (2,0) and animate it with matplotlib.',
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

  const handleSendPrompt = (prompt: string) => {
    if (onSendPrompt) {
      onSendPrompt(prompt);
      onDismiss(); // Close the guide after sending
    } else {
      // Fallback to copy if no send handler
      handleCopyPrompt(prompt);
    }
  };

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="card-elevated max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-3">{step.title}</h2>
            <span className="text-xs text-fg-tertiary">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <p className="text-fg-secondary text-sm">{step.description}</p>
        </div>

        {/* Sample Prompts */}
        {step.samplePrompts && (
          <div className="mb-6 space-y-3">
            <h3 className="text-xs font-medium text-fg-primary mb-2">
              Try these examples:
            </h3>
            {step.samplePrompts.map((sample, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border border-border-primary bg-bg-secondary hover:border-accent-success transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{sample.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-sm font-medium text-${sample.color}`}>
                        {sample.title}
                      </h4>
                    </div>
                    <p className="text-xs text-fg-secondary leading-relaxed mb-2">
                      {sample.prompt}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSendPrompt(sample.prompt)}
                        className="btn-primary text-xs py-1 px-3"
                      >
                        Try Now
                      </button>
                      <button
                        onClick={() => handleCopyPrompt(sample.prompt)}
                        className="btn-secondary text-xs py-1 px-3"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-fg-tertiary text-center mt-2">
              💡 Click "Try Now" to send the prompt directly, or "Copy" to use it later
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleSkip} className="btn-secondary flex-1 py-2">
            Skip Tour
          </button>
          <button onClick={handleNext} className="btn-primary flex-1 py-2">
            {currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>

        <div className="mt-4 flex gap-1 justify-center">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-1 w-8 rounded-full transition-colors ${
                index === currentStep
                  ? 'bg-accent-success'
                  : 'bg-border-primary'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
