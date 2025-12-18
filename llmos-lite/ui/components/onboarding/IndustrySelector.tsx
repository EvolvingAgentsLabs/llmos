'use client';

import { useState } from 'react';
import {
  Industry,
  industryNames,
  industryDescriptions,
  setIndustry as saveIndustry,
} from '@/lib/terminology-config';
import { getThemeForIndustry } from '@/lib/theme-config';

interface IndustrySelectorProps {
  onSelect: (industry: Industry) => void;
}

const industries: Industry[] = [
  'developer', // For quantum computing
  'robotics',
  'biology', // Will be repurposed for 3D animation
];

const industryIcons: Record<Industry, string> = {
  developer: '⚛️', // Quantum computing
  legal: '⚖️',
  financial: '📊',
  consulting: '📈',
  biology: '🎬', // 3D animation
  robotics: '🤖',
  audit: '🔍',
  general: '📋',
};

const industryLabels: Record<Industry, string> = {
  developer: 'Quantum Computing',
  legal: 'Legal',
  financial: 'Financial',
  consulting: 'Consulting',
  biology: '3D Animation',
  robotics: 'Robotic Simulation',
  audit: 'Audit',
  general: 'General',
};

const industryDetails: Record<Industry, string> = {
  developer: 'Build and simulate quantum circuits, explore quantum algorithms and visualize quantum states',
  legal: 'Legal research and documentation',
  financial: 'Financial analysis and reporting',
  consulting: 'Business consulting and strategy',
  biology: 'Create stunning 3D animations, model complex scenes, and render interactive experiences in the browser',
  robotics: 'Simulate robots, plan movements, and visualize 3D trajectories in real-time',
  audit: 'Audit and compliance workflows',
  general: 'General purpose workflows',
};

/**
 * Industry Selector Component
 *
 * Allows users to select their industry during onboarding.
 * This determines:
 * - UI theme (colors, typography)
 * - Terminology (workspaces, artifacts, etc.)
 * - Sample prompts and templates
 * - Recommended skills and agents
 */
export default function IndustrySelector({ onSelect }: IndustrySelectorProps) {
  const [selected, setSelected] = useState<Industry | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleSelect = (industry: Industry) => {
    setSelected(industry);
  };

  const handleContinue = () => {
    if (selected) {
      // Save to localStorage
      saveIndustry(selected);

      // Get recommended theme
      const themeName = getThemeForIndustry(selected);
      localStorage.setItem('theme-name', themeName);
      localStorage.setItem('theme-mode', 'light'); // Default to light for professional users

      // Notify parent
      onSelect(selected);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-semibold mb-3 text-terminal-fg-primary">
          Welcome to LLMos-Lite
        </h1>
        <p className="text-lg text-terminal-fg-secondary mb-2">
          Choose your domain
        </p>
        <p className="text-sm text-terminal-fg-tertiary">
          Create amazing visualizations and simulations powered by AI
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-4xl mx-auto">
        {industries.map((industry, index) => (
          <button
            key={industry}
            onClick={() => handleSelect(industry)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`
              p-6 rounded-lg border-2 transition-all duration-200 text-left
              ${
                selected === industry
                  ? 'border-terminal-accent-green bg-terminal-bg-secondary shadow-lg'
                  : hoveredIndex === index
                  ? 'border-terminal-accent-blue bg-terminal-bg-secondary'
                  : 'border-terminal-border bg-terminal-bg-primary hover:bg-terminal-bg-secondary'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{industryIcons[industry]}</span>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-terminal-fg-primary mb-1">
                  {industryLabels[industry]}
                </h3>
                <p className="text-sm text-terminal-fg-secondary">
                  {industryDetails[industry]}
                </p>
              </div>
            </div>

            {selected === industry && (
              <div className="mt-3 flex items-center gap-2 text-terminal-accent-green text-sm">
                <span>✓</span>
                <span>Selected</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="bg-terminal-bg-secondary border border-terminal-border rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-terminal-fg-primary mb-3">
            What you'll get for {industryLabels[selected]}:
          </h3>
          <ul className="space-y-2 text-terminal-fg-secondary">
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Interactive Visualizations:</strong> Real-time rendering in the browser
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Advanced Simulations:</strong> {getIndustryCapability(selected)}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Planning & Analysis:</strong> Step-by-step execution with 3D feedback
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>AI Assistants:</strong> Specialized agents for your domain
              </span>
            </li>
          </ul>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <button
          onClick={handleContinue}
          disabled={!selected}
          className={`
            px-8 py-3 rounded-lg font-medium transition-all duration-200
            ${
              selected
                ? 'bg-terminal-accent-green text-terminal-bg-primary hover:opacity-90 shadow-lg'
                : 'bg-terminal-bg-tertiary text-terminal-fg-tertiary cursor-not-allowed'
            }
          `}
        >
          Continue →
        </button>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-terminal-fg-tertiary">
          You can change your domain selection anytime in Settings
        </p>
      </div>
    </div>
  );
}

/**
 * Get industry-specific capability description
 */
function getIndustryCapability(industry: Industry): string {
  const capabilities: Record<Industry, string> = {
    developer: 'Quantum circuit simulation with state vector visualization',
    legal: 'Legal research and case analysis',
    financial: 'Financial modeling and forecasting',
    consulting: 'Strategic framework development',
    biology: '3D scene composition with physics and lighting',
    robotics: 'Robot kinematics, path planning, and collision detection',
    audit: 'Compliance testing and verification',
    general: 'General purpose automation',
  };

  return capabilities[industry];
}
