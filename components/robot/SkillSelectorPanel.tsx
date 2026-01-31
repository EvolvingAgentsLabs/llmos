/**
 * Skill Selector Panel
 *
 * UI component for browsing, selecting, and loading physical skill cartridges.
 * This is the "App Store" interface for robot skills.
 *
 * Features:
 * - Browse available skills (system, user, project)
 * - View skill details (Visual Cortex, Motor Cortex, Evolution History)
 * - Load/unload skills to active robot
 * - Context-based skill suggestions
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  getPhysicalSkillLoader,
  PhysicalSkill,
  ContextDetection,
} from '@/lib/skills/physical-skill-loader';

interface SkillSelectorPanelProps {
  deviceId: string;
  onSkillSelected: (skill: PhysicalSkill | null) => void;
  currentSkill?: PhysicalSkill | null;
  contextHint?: string; // For context-based suggestions
}

interface SkillCardProps {
  skill: PhysicalSkill;
  isActive: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
}

/**
 * Individual skill card component
 */
function SkillCard({ skill, isActive, onSelect, onViewDetails }: SkillCardProps) {
  const fm = skill.frontmatter;

  return (
    <div
      className={`
        p-3 rounded-lg border cursor-pointer transition-all
        ${isActive
          ? 'border-green-500 bg-green-500/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-500'
        }
      `}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-sm text-zinc-100">{fm.name}</h4>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
            {skill.objective || skill.role.slice(0, 100)}
          </p>
        </div>
        {fm.agentic_vision && (
          <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
            Vision
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-zinc-500">v{fm.version}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Details
        </button>
      </div>
    </div>
  );
}

/**
 * Skill details modal
 */
function SkillDetailsModal({
  skill,
  onClose,
  onLoad,
}: {
  skill: PhysicalSkill;
  onClose: () => void;
  onLoad: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'visual' | 'motor' | 'safety' | 'history'>('visual');
  const fm = skill.frontmatter;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden border border-zinc-700">
        {/* Header */}
        <div className="p-4 border-b border-zinc-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{fm.name}</h2>
              <p className="text-sm text-zinc-400">v{fm.version} | {fm.base_model}</p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            {(['visual', 'motor', 'safety', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-3 py-1 text-xs rounded-full transition-colors
                  ${activeTab === tab
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }
                `}
              >
                {tab === 'visual' && 'Visual Cortex'}
                {tab === 'motor' && 'Motor Cortex'}
                {tab === 'safety' && 'Safety'}
                {tab === 'history' && 'Evolution'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {activeTab === 'visual' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Primary Targets</h3>
                <ul className="space-y-1">
                  {skill.visualCortex.primaryTargets.map((target, i) => (
                    <li key={i} className="text-xs text-zinc-400">
                      <span className="text-green-400 font-mono">{target.name}</span>
                      {' - '}{target.description}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Investigation Triggers</h3>
                <ul className="space-y-1">
                  {skill.visualCortex.investigationTriggers.map((trigger, i) => (
                    <li key={i} className="text-xs text-zinc-400">
                      <span className="text-yellow-400">{trigger.condition}</span>
                      {' → '}{trigger.action}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Alert Conditions</h3>
                <ul className="space-y-1">
                  {skill.visualCortex.alertConditions.map((alert, i) => (
                    <li key={i} className="text-xs text-zinc-400">
                      <span className="text-red-400">{alert.condition}</span>
                      {' → '}{alert.action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'motor' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Available Tools</h3>
                <div className="flex flex-wrap gap-1">
                  {skill.motorCortex.availableTools.map((tool, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded font-mono"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Protocols</h3>
                <ul className="space-y-2">
                  {skill.motorCortex.protocols.map((protocol, i) => (
                    <li key={i} className="text-xs">
                      <span className="text-blue-400 font-medium">{protocol.name}</span>
                      <p className="text-zinc-400 mt-0.5">{protocol.description}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {skill.motorCortex.safetyLimits && (
                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-2">Safety Limits</h3>
                  <div className="text-xs text-zinc-400 space-y-1">
                    {skill.motorCortex.safetyLimits.maxSpeed !== undefined && (
                      <p>Max Speed: {skill.motorCortex.safetyLimits.maxSpeed}%</p>
                    )}
                    {skill.motorCortex.safetyLimits.minConfidence !== undefined && (
                      <p>Min Confidence: {(skill.motorCortex.safetyLimits.minConfidence * 100).toFixed(0)}%</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'safety' && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Safety Protocols</h3>
              <ul className="space-y-1">
                {skill.safetyProtocols.map((protocol, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex items-start gap-2">
                    <span className="text-red-400">!</span>
                    {protocol}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Evolution History</h3>
              <ul className="space-y-2">
                {skill.evolutionHistory.map((entry, i) => (
                  <li key={i} className="text-xs border-l-2 border-zinc-700 pl-3">
                    <span className="text-blue-400 font-mono">v{entry.version}</span>
                    {entry.source && (
                      <span className="ml-2 text-zinc-500">({entry.source})</span>
                    )}
                    <p className="text-zinc-400 mt-0.5">{entry.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={onLoad}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded"
          >
            Load Skill
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Skill Selector Panel
 */
export function SkillSelectorPanel({
  deviceId,
  onSkillSelected,
  currentSkill,
  contextHint,
}: SkillSelectorPanelProps) {
  const [skills, setSkills] = useState<PhysicalSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<PhysicalSkill | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [contextSuggestion, setContextSuggestion] = useState<ContextDetection | null>(null);

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, []);

  // Update context suggestions when hint changes
  useEffect(() => {
    if (contextHint) {
      const loader = getPhysicalSkillLoader();
      const detection = loader.detectContext(contextHint);
      setContextSuggestion(detection);
    } else {
      setContextSuggestion(null);
    }
  }, [contextHint]);

  const loadSkills = async () => {
    setLoading(true);
    setError(null);

    try {
      const loader = getPhysicalSkillLoader();
      const result = await loader.loadSkillsFromDirectory();

      if (result.ok) {
        setSkills(result.value);
      } else {
        setError('Failed to load skills');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSkill = useCallback((skill: PhysicalSkill) => {
    setSelectedSkill(skill);
    onSkillSelected(skill);
  }, [onSkillSelected]);

  const handleUnloadSkill = useCallback(() => {
    setSelectedSkill(null);
    onSkillSelected(null);
  }, [onSkillSelected]);

  const filteredSkills = skills.filter((skill) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      skill.frontmatter.name.toLowerCase().includes(query) ||
      skill.role.toLowerCase().includes(query) ||
      skill.objective.toLowerCase().includes(query)
    );
  });

  return (
    <div className="h-full flex flex-col bg-zinc-900 rounded-lg border border-zinc-700">
      {/* Header */}
      <div className="p-3 border-b border-zinc-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-200">Skill Cartridges</h3>
          <button
            onClick={loadSkills}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            Refresh
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full mt-2 px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Current Skill */}
      {currentSkill && (
        <div className="p-3 border-b border-zinc-700 bg-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Active Skill</p>
              <p className="text-sm font-medium text-green-400">
                {currentSkill.frontmatter.name}
              </p>
            </div>
            <button
              onClick={handleUnloadSkill}
              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
            >
              Unload
            </button>
          </div>
        </div>
      )}

      {/* Context Suggestion */}
      {contextSuggestion && contextSuggestion.suggestedSkills.length > 0 && (
        <div className="p-3 border-b border-zinc-700 bg-blue-500/5">
          <p className="text-xs text-blue-400 mb-2">
            Suggested for "{contextSuggestion.detectedIntent}"
          </p>
          <div className="space-y-1">
            {contextSuggestion.suggestedSkills.slice(0, 2).map((suggestion) => (
              <button
                key={suggestion.path}
                onClick={() => {
                  const skill = skills.find((s) => s.path === suggestion.path);
                  if (skill) handleSelectSkill(skill);
                }}
                className="w-full text-left px-2 py-1 text-xs bg-blue-500/10 text-blue-300 rounded hover:bg-blue-500/20"
              >
                {suggestion.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skill List */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="text-center text-zinc-500 text-sm py-4">
            Loading skills...
          </div>
        )}

        {error && (
          <div className="text-center text-red-400 text-sm py-4">
            {error}
          </div>
        )}

        {!loading && !error && filteredSkills.length === 0 && (
          <div className="text-center text-zinc-500 text-sm py-4">
            No skills found
          </div>
        )}

        <div className="space-y-2">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.path}
              skill={skill}
              isActive={currentSkill?.path === skill.path}
              onSelect={() => handleSelectSkill(skill)}
              onViewDetails={() => {
                setSelectedSkill(skill);
                setShowDetails(true);
              }}
            />
          ))}
        </div>
      </div>

      {/* Details Modal */}
      {showDetails && selectedSkill && (
        <SkillDetailsModal
          skill={selectedSkill}
          onClose={() => setShowDetails(false)}
          onLoad={() => {
            handleSelectSkill(selectedSkill);
            setShowDetails(false);
          }}
        />
      )}
    </div>
  );
}

export default SkillSelectorPanel;
