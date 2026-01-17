'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProjectContext, type VolumeType } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import {
  getMultiAgentOrchestrator,
  resetMultiAgentOrchestrator,
  type ChatParticipant,
  type ChatMessage,
  type AgentCallInfo,
  type FileReference,
  type AgentProposal,
} from '@/lib/multi-agent-chat-orchestrator';
import UnifiedChat from './UnifiedChat';
import ModelSelector from './ModelSelector';
import LLMSettings from '../settings/LLMSettings';

// Re-export types for UnifiedChat compatibility
interface Participant {
  id: string;
  name: string;
  type: 'user' | 'assistant' | 'agent' | 'system-agent' | 'sub-agent';
  color: string;
  avatar?: string;
  role?: string;
}

interface Alternative {
  id: string;
  content: string;
  proposer: string;
  proposerType?: Participant['type'];
  confidence: number;
  votes: number;
  selected?: boolean;
}

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  participantId?: string;
  branchId?: number;
  isDecisionPoint?: boolean;
  alternatives?: Alternative[];
  agentCalls?: AgentCallInfo[];
  fileReferences?: FileReference[];
  isSystemMessage?: boolean;
}

interface ChatPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange?: (volume: VolumeType) => void;
  pendingPrompt?: string | null;
  onPromptProcessed?: () => void;
}

export default function ChatPanel({
  activeVolume,
  pendingPrompt,
  onPromptProcessed,
}: ChatPanelProps) {
  const { addMessage, setActiveVolume } = useProjectContext();
  const workspaceContext = useWorkspace();
  const { setAgentState, setTaskType, setContextViewMode, setActiveFile } = workspaceContext || {};

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>('idle');
  const [showLLMSettings, setShowLLMSettings] = useState(false);

  // Reference to orchestrator
  const orchestratorRef = useRef<ReturnType<typeof getMultiAgentOrchestrator> | null>(null);

  // Initialize orchestrator and set up event listeners
  useEffect(() => {
    const orchestrator = getMultiAgentOrchestrator();
    orchestratorRef.current = orchestrator;

    // Set initial participants
    setParticipants(orchestrator.getParticipants().map(p => ({
      id: p.id,
      name: p.name,
      type: p.type as Participant['type'],
      color: p.color,
      role: p.role,
    })));

    // Event handlers
    const handleParticipantAdded = (participant: ChatParticipant) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === participant.id)) return prev;
        return [...prev, {
          id: participant.id,
          name: participant.name,
          type: participant.type as Participant['type'],
          color: participant.color,
          role: participant.role,
        }];
      });
    };

    const handleParticipantStatus = ({ participantId, status }: { participantId: string; status: string }) => {
      // Update loading status and agent state based on agent activity
      const p = orchestrator.getParticipants().find(p => p.id === participantId);

      if (status === 'thinking') {
        setLoadingStatus(`${p?.name || participantId} is thinking...`);
        setAgentState?.('thinking');
        setIsLoading(true);
      } else if (status === 'executing') {
        setLoadingStatus(`${p?.name || participantId} is executing...`);
        setAgentState?.('executing');
        setIsLoading(true);
      } else if (status === 'idle' && currentPhase !== 'completed') {
        // Don't reset to idle unless the entire process is completed
        // Keep showing the phase-appropriate state
      }
    };

    const handleMessageAdded = (message: ChatMessage) => {
      const enhanced: EnhancedMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        participantId: message.participantId,
        branchId: message.branchId,
        isDecisionPoint: message.isDecisionPoint,
        alternatives: message.alternatives?.map(alt => ({
          id: alt.id,
          content: alt.content,
          proposer: alt.agentName,
          confidence: alt.confidence,
          votes: alt.votes,
          selected: alt.selected,
        })),
        agentCalls: message.agentCalls,
        fileReferences: message.fileReferences,
        isSystemMessage: message.isSystemMessage,
      };
      setMessages(prev => [...prev, enhanced]);
    };

    const handleMessageUpdated = (message: ChatMessage) => {
      setMessages(prev => prev.map(m => {
        if (m.id === message.id) {
          return {
            ...m,
            content: message.content,
            alternatives: message.alternatives?.map(alt => ({
              id: alt.id,
              content: alt.content,
              proposer: alt.agentName,
              confidence: alt.confidence,
              votes: alt.votes,
              selected: alt.selected,
            })),
            agentCalls: message.agentCalls,
            fileReferences: message.fileReferences,
          };
        }
        return m;
      }));
    };

    const handlePhaseChanged = ({ phase }: { phase: string }) => {
      setCurrentPhase(phase);

      // Update agent state based on current phase
      if (phase === 'completed') {
        setIsLoading(false);
        setLoadingStatus('');
        setAgentState?.('success');
        setTimeout(() => setAgentState?.('idle'), 2000);
      } else if (phase === 'executing' || phase === 'sub-agent-execution') {
        setIsLoading(true);
        setAgentState?.('executing');
      } else if (phase === 'planning' || phase === 'analyzing' || phase === 'voting') {
        setIsLoading(true);
        setAgentState?.('thinking');
      }
    };

    // Subscribe to events
    orchestrator.on('participant:added', handleParticipantAdded);
    orchestrator.on('participant:status', handleParticipantStatus);
    orchestrator.on('message:added', handleMessageAdded);
    orchestrator.on('message:updated', handleMessageUpdated);
    orchestrator.on('phase:changed', handlePhaseChanged);

    // Cleanup
    return () => {
      orchestrator.off('participant:added', handleParticipantAdded);
      orchestrator.off('participant:status', handleParticipantStatus);
      orchestrator.off('message:added', handleMessageAdded);
      orchestrator.off('message:updated', handleMessageUpdated);
      orchestrator.off('phase:changed', handlePhaseChanged);
    };
  }, [setAgentState]);

  // Sync active volume
  useEffect(() => {
    if (activeVolume) {
      setActiveVolume(activeVolume);
    }
  }, [activeVolume, setActiveVolume]);

  // Handle pending prompt from onboarding
  useEffect(() => {
    if (pendingPrompt && !isLoading) {
      onPromptProcessed?.();
      handleSend(pendingPrompt);
    }
  }, [pendingPrompt, isLoading, onPromptProcessed]);

  // Handle file click - open in main panel
  const handleFileClick = useCallback((file: FileReference) => {
    console.log('[ChatPanel] Opening file:', file.path);
    setActiveFile?.(file.path);
    if (file.type === 'code') {
      setContextViewMode?.('split-view');
    } else {
      setContextViewMode?.('canvas');
    }
  }, [setActiveFile, setContextViewMode]);

  // Handle vote selection
  const handleVote = useCallback((alternativeId: string) => {
    console.log('[ChatPanel] Vote cast for:', alternativeId);
    orchestratorRef.current?.voteForProposal(alternativeId, 'user');
  }, []);

  // Handle send - process with multi-agent orchestrator
  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingStatus('Initializing agents...');
    setAgentState?.('thinking');
    setTaskType?.('chatting');

    try {
      // Process goal with multi-agent orchestrator
      await orchestratorRef.current?.processUserGoal(messageText);

      // Add to project context for persistence
      addMessage({ role: 'user', content: messageText });

    } catch (error) {
      console.error('[ChatPanel] Error processing goal:', error);
      setAgentState?.('error');

      // Add error message
      const errorMsg = error instanceof Error ? error.message : 'Failed to process goal';
      setMessages(prev => [...prev, {
        id: `msg-error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        participantId: 'system-agent',
        isSystemMessage: true,
      }]);

    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  // Reset chat and orchestrator
  const handleReset = useCallback(() => {
    resetMultiAgentOrchestrator();
    setMessages([]);
    setParticipants([{
      id: 'system-agent',
      name: 'System Agent',
      type: 'system-agent',
      color: '#a371f7',
    }]);
    setCurrentPhase('idle');
    orchestratorRef.current = getMultiAgentOrchestrator();
  }, []);

  // Welcome screen when no messages
  if (messages.length === 0) {
    const samplePrompts = getCurrentSamplePrompts();

    return (
      <div className="h-full flex flex-col bg-[#0d1117]">
        <div className="flex-1 overflow-y-auto flex flex-col items-center p-6 pt-8">
          <div className="max-w-lg space-y-6 text-center">
            <div>
              <h2 className="text-xl font-semibold text-[#e6edf3] mb-2">LLMos Multi-Agent System</h2>
              <p className="text-sm text-[#8b949e]">
                Real agents collaborate to achieve your goals
              </p>
            </div>

            {/* Participant preview */}
            <div className="flex justify-center gap-2 flex-wrap">
              {participants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: p.color + '20', color: p.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </div>
              ))}
            </div>

            {/* Info about multi-agent */}
            <div className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] text-left">
              <div className="text-sm font-medium text-[#e6edf3] mb-2">How it works:</div>
              <ul className="text-xs text-[#8b949e] space-y-1">
                <li>1. System Agent analyzes your goal</li>
                <li>2. Creates 3+ specialized sub-agents</li>
                <li>3. Agents propose different approaches</li>
                <li>4. You can vote on proposals</li>
                <li>5. Selected approach is executed</li>
              </ul>
            </div>

            <div className="space-y-2">
              {samplePrompts.slice(0, 3).map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sample.prompt)}
                  className="w-full text-left p-3 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] transition-colors"
                >
                  <div className="text-sm font-medium text-[#e6edf3]">{sample.title}</div>
                  <div className="text-xs text-[#8b949e] mt-1">{sample.description}</div>
                </button>
              ))}
            </div>

            <div className="pt-4 flex items-center justify-center gap-2">
              <ModelSelector onModelChange={(id) => console.log('Model:', id)} />
              <button
                onClick={() => setShowLLMSettings(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 transition-all duration-200 text-xs flex items-center gap-1.5"
                title="LLM Settings - Change API Key & Model"
              >
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-blue-400 font-medium">Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-[#30363d] p-3 bg-[#161b22]">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Describe your goal..."
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/50"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSend((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            <button
              onClick={(e) => {
                const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                if (input?.value) {
                  handleSend(input.value);
                  input.value = '';
                }
              }}
              className="px-5 py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-lg transition-colors"
            >
              Start
            </button>
          </div>
        </div>

        {/* LLM Settings Modal */}
        {showLLMSettings && (
          <LLMSettings onClose={() => setShowLLMSettings(false)} />
        )}
      </div>
    );
  }

  // Active conversation with multi-agent chat
  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Phase indicator */}
      {currentPhase !== 'idle' && currentPhase !== 'completed' && (
        <div className="px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#d29922] animate-pulse" />
          <span className="text-xs text-[#d29922] uppercase tracking-wider font-medium">
            Phase: {currentPhase}
          </span>
          {loadingStatus && (
            <span className="text-xs text-[#8b949e] ml-auto">{loadingStatus}</span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <UnifiedChat
          messages={messages}
          participants={participants}
          onSend={handleSend}
          onVote={handleVote}
          onFileClick={handleFileClick}
          isLoading={isLoading}
          loadingStatus={loadingStatus}
        />
      </div>

      {/* Reset button when completed */}
      {currentPhase === 'completed' && (
        <div className="px-3 py-2 bg-[#161b22] border-t border-[#30363d] flex justify-center">
          <button
            onClick={handleReset}
            className="text-xs text-[#8b949e] hover:text-[#e6edf3] px-4 py-1.5 rounded-md hover:bg-[#21262d] transition-colors"
          >
            Start New Goal
          </button>
        </div>
      )}

      {/* LLM Settings Modal */}
      {showLLMSettings && (
        <LLMSettings onClose={() => setShowLLMSettings(false)} />
      )}
    </div>
  );
}
