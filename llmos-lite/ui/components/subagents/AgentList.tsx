/**
 * Agent List Component
 *
 * Shows available sub-agents from volumes
 */

'use client';

import { useState, useEffect } from 'react';
import { getSubAgentExecutor, SubAgentDefinition } from '@/lib/subagents/subagent-executor';
import { VolumeType } from '@/lib/volumes/file-operations';

interface AgentListProps {
  onAgentSelect?: (agent: SubAgentDefinition) => void;
}

export default function AgentList({ onAgentSelect }: AgentListProps) {
  const [agents, setAgents] = useState<SubAgentDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVolume, setSelectedVolume] = useState<VolumeType>('system');

  const executor = getSubAgentExecutor();

  useEffect(() => {
    loadAgents();
  }, [selectedVolume]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const discovered = await executor.discoverAgents(selectedVolume);
      setAgents(discovered);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVolumeIcon = (volume: VolumeType) => {
    switch (volume) {
      case 'system': return '🔒';
      case 'team': return '👥';
      case 'user': return '👤';
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary/50 border-r border-border-primary/50">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-primary/30 bg-bg-secondary/30">
        <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide mb-2">
          Sub-Agents
        </div>

        {/* Volume Filter */}
        <div className="flex gap-1">
          {(['system', 'team', 'user'] as VolumeType[]).map((vol) => (
            <button
              key={vol}
              onClick={() => setSelectedVolume(vol)}
              className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
                selectedVolume === vol
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
              }`}
            >
              {getVolumeIcon(vol)}
            </button>
          ))}
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="p-4 text-center text-xs text-fg-tertiary">
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="p-4 text-center text-xs text-fg-tertiary">
            No agents in {selectedVolume} volume
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {agents.map((agent, idx) => (
              <div
                key={`${agent.volume}:${agent.path}:${idx}`}
                onClick={() => onAgentSelect?.(agent)}
                className="p-3 bg-bg-tertiary hover:bg-bg-elevated border border-border-primary/30 rounded cursor-pointer transition-all group"
              >
                {/* Agent Name */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🤖</span>
                  <span className="text-xs font-semibold text-fg-primary group-hover:text-accent-primary transition-colors">
                    @{agent.name}
                  </span>
                </div>

                {/* Description */}
                {agent.description && (
                  <p className="text-[10px] text-fg-secondary line-clamp-2 mb-2">
                    {agent.description}
                  </p>
                )}

                {/* Capabilities */}
                {agent.capabilities && agent.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities.slice(0, 3).map((cap, capIdx) => (
                      <span
                        key={capIdx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary"
                      >
                        {cap}
                      </span>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <span className="text-[9px] text-fg-tertiary">
                        +{agent.capabilities.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Path */}
                <div className="mt-2 text-[9px] font-mono text-fg-muted">
                  {agent.volume}-volume/{agent.path}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage Hint */}
      <div className="px-3 py-2 border-t border-border-primary/30 bg-bg-secondary/20 text-[9px] text-fg-tertiary">
        Use @agent-name in chat to invoke
      </div>
    </div>
  );
}
