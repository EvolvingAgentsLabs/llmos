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
  'developer',
  'legal',
  'financial',
  'consulting',
  'political',
  'audit',
  'general',
];

const industryIcons: Record<Industry, string> = {
  developer: '💻',
  legal: '⚖️',
  financial: '📊',
  consulting: '📈',
  political: '🗳️',
  audit: '🔍',
  general: '📋',
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
          Select your industry to customize your experience
        </p>
        <p className="text-sm text-terminal-fg-tertiary">
          We'll adapt the interface, terminology, and templates to match your workflow
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
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
                  {industryNames[industry]}
                </h3>
                <p className="text-sm text-terminal-fg-secondary">
                  {industryDescriptions[industry]}
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
            What you'll get for {industryNames[selected]}:
          </h3>
          <ul className="space-y-2 text-terminal-fg-secondary">
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Customized UI:</strong> Professional theme optimized for your industry
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Industry Terminology:</strong> {getIndustryTermExample(selected)}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>Sample Templates:</strong> Industry-specific workflows and methodologies
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-terminal-accent-green mt-1">✓</span>
              <span>
                <strong>AI Specialists:</strong> Pre-configured assistants for your domain
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
          You can change your industry selection anytime in Settings
        </p>
      </div>
    </div>
  );
}

/**
 * Get example of industry-specific terminology
 */
function getIndustryTermExample(industry: Industry): string {
  const examples: Record<Industry, string> = {
    developer: 'Volumes, Skills, Agents, Tools',
    legal: 'Matters, Procedures, Legal Assistants, Research Tools',
    financial: 'Portfolios, Methodologies, Analysts, Analytical Tools',
    consulting: 'Engagements, Frameworks, Consultants, Analysis Tools',
    political: 'Campaigns, Playbooks, Strategists, Research Tools',
    audit: 'Audits, Procedures, Auditors, Test Tools',
    general: 'Workspaces, Playbooks, Assistants, Tools',
  };

  return examples[industry];
}
