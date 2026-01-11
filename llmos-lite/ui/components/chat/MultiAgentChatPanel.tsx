'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectContext, type VolumeType } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import MarkdownRenderer from './MarkdownRenderer';
import ModelSelector from './ModelSelector';
import VotingCard from './VotingCard';
import SolutionProposal from './SolutionProposal';
import ParticipantList from './ParticipantList';
import {
  MultiAgentChat,
  getMultiAgentChat,
} from '@/lib/chat/multi-agent-chat';
import {
  EnhancedMessage,
  VotingSession,
  ChatParticipant,
  ProposedSolution,
} from '@/lib/chat/types';

interface MultiAgentChatPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange?: (volume: VolumeType) => void;
}

type ViewMode = 'linear' | 'branches' | 'timeline';

export default function MultiAgentChatPanel({
  activeVolume,
  onVolumeChange,
}: MultiAgentChatPanelProps) {
  const { currentWorkspace, addMessage, setActiveVolume } = useProjectContext();
  const workspaceContext = useWorkspace();
  const { setAgentState, setTaskType } = workspaceContext || {};

  // Multi-agent chat state
  const [chat] = useState<MultiAgentChat>(() => {
    const instance = getMultiAgentChat(`session-${Date.now()}`, {
      enableVoting: true,
      enablePredictions: true,
      enableSpeculation: true,
    });

    // Add default agents
    instance.addAgent('analyst', 'Analyst Agent', ['analysis', 'research']);
    instance.addAgent('developer', 'Developer Agent', ['coding', 'architecture']);
    instance.addAgent('reviewer', 'Reviewer Agent', ['review', 'security']);

    return instance;
  });

  const [messages, setMessages] = useState<EnhancedMessage[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [activeVoting, setActiveVoting] = useState<VotingSession | null>(null);
  const [voteCounts, setVoteCounts] = useState<Map<string, number>>(new Map());
  const [winningProbs, setWinningProbs] = useState<Map<string, number>>(new Map());
  const [proposals, setProposals] = useState<ProposedSolution[]>([]);
  const [expandedProposals, setExpandedProposals] = useState<Set<string>>(new Set());

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('linear');
  const [showParticipants, setShowParticipants] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = useRef(`user-${Date.now()}`);

  // Initialize current user
  useEffect(() => {
    const user = UserStorage.getUser();
    if (user) {
      chat.addUser(user.id || 'current-user', user.name || 'User');
      currentUserId.current = `user-${user.id || 'current-user'}`;
    } else {
      chat.addUser('current-user', 'User');
    }
    updateState();
  }, [chat]);

  // Subscribe to chat events
  useEffect(() => {
    const unsubscribe = chat.onEvent((event) => {
      console.log('[MultiAgentChatPanel] Event:', event.type, event.data);
      updateState();
    });

    return unsubscribe;
  }, [chat]);

  // Sync active volume
  useEffect(() => {
    if (activeVolume) {
      setActiveVolume(activeVolume);
    }
  }, [activeVolume, setActiveVolume]);

  const updateState = useCallback(() => {
    setMessages(chat.getMessages());
    setParticipants(chat.getParticipants());

    const voting = chat.getActiveVotingSession();
    setActiveVoting(voting);

    if (voting) {
      setVoteCounts(chat.getVoteCounts(voting.id));
      setWinningProbs(chat.getWinningProbabilities(voting.id));
      setProposals(voting.solutions);
    } else {
      setProposals([]);
    }
  }, [chat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Polling for voting updates
  useEffect(() => {
    if (!activeVoting) return;

    const interval = setInterval(() => {
      setVoteCounts(chat.getVoteCounts(activeVoting.id));
      setWinningProbs(chat.getWinningProbabilities(activeVoting.id));

      // Check if voting completed
      const session = chat.getActiveVotingSession();
      if (!session || session.status !== 'active') {
        setActiveVoting(session);
        updateState();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [activeVoting, chat, updateState]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setAgentState?.('thinking');
    setTaskType?.('chatting');

    try {
      // Send user message
      await chat.sendMessage(currentUserId.current, messageText, {
        requestProposals: true,
        context: `Volume: ${activeVolume}`,
      });

      updateState();

      // Add to workspace messages for persistence
      addMessage({
        role: 'user',
        content: messageText,
      });
    } catch (error) {
      console.error('[MultiAgentChatPanel] Failed to send message:', error);
    } finally {
      setIsLoading(false);
      setAgentState?.('idle');
      setTaskType?.('idle');
    }
  };

  const handleVote = (solutionId: string, voteType: 'up' | 'down' = 'up') => {
    if (!activeVoting) return;
    chat.castVote(activeVoting.id, currentUserId.current, solutionId, voteType);
    updateState();
  };

  const toggleProposalExpand = (proposalId: string) => {
    setExpandedProposals((prev) => {
      const next = new Set(prev);
      if (next.has(proposalId)) {
        next.delete(proposalId);
      } else {
        next.add(proposalId);
      }
      return next;
    });
  };

  const renderMessage = (message: EnhancedMessage) => {
    const isUser = message.role === 'user';
    const isProposal = message.isProposal;

    if (isProposal && message.proposalId) {
      const proposal = proposals.find((p) => p.id === message.proposalId);
      if (proposal) {
        return (
          <SolutionProposal
            key={message.id}
            proposal={proposal}
            onVote={(voteType) => handleVote(proposal.id, voteType)}
            showVoteButtons={!!activeVoting}
            hasVoted={proposal.votes.some((v) => v.participantId === currentUserId.current)}
            expanded={expandedProposals.has(proposal.id)}
            onToggleExpand={() => toggleProposalExpand(proposal.id)}
            isWinner={activeVoting?.winner === proposal.id}
          />
        );
      }
    }

    return (
      <div key={message.id} className="animate-fade-in">
        {/* Message header */}
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-5 h-5 rounded flex items-center justify-center ${
            isUser
              ? 'bg-accent-secondary/20'
              : 'bg-accent-primary/20'
          }`}>
            {isUser ? (
              <span className="text-[10px] text-accent-secondary font-semibold">U</span>
            ) : (
              <svg className="w-3 h-3 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
          </div>
          <span className="text-[10px] font-semibold text-fg-secondary">
            {message.participantName}
          </span>
          <span className="text-[10px] text-fg-muted">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Message content */}
        <div
          className={`ml-6 p-2 rounded text-xs ${
            isUser
              ? 'bg-accent-primary/10 border border-accent-primary/30 text-fg-primary whitespace-pre-wrap'
              : 'bg-bg-tertiary border border-border-primary text-fg-secondary'
          }`}
        >
          {!isUser ? (
            <MarkdownRenderer content={message.content} enableCodeExecution={false} />
          ) : (
            message.content
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-primary/50 bg-bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Model Selector */}
          <ModelSelector
            onModelChange={(modelId) => {
              console.log('[MultiAgentChatPanel] Model changed to:', modelId);
            }}
          />

          {/* Separator */}
          <div className="w-px h-4 bg-border-primary/50" />

          {/* View mode toggle */}
          <div className="flex items-center bg-bg-tertiary rounded-lg p-0.5">
            {(['linear', 'branches', 'timeline'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  viewMode === mode
                    ? 'bg-accent-primary text-white'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {mode === 'linear' ? 'Chat' : mode === 'branches' ? 'Branches' : 'Timeline'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Participants toggle */}
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${
              showParticipants
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>{participants.length}</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="max-w-md space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-accent-primary/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-fg-primary">Multi-Agent Chat</h2>
                  <p className="text-sm text-fg-secondary mt-1">
                    Ask a question and multiple AI agents will propose solutions.
                    You can vote on the best approach.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <ParticipantList participants={participants} currentUserId={currentUserId.current} compact />
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}

              {/* Active voting card */}
              {activeVoting && activeVoting.status === 'active' && (
                <VotingCard
                  session={activeVoting}
                  currentUserId={currentUserId.current}
                  onVote={(solutionId, voteType) => handleVote(solutionId, voteType)}
                  voteCounts={voteCounts}
                  winningProbabilities={winningProbs}
                />
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="animate-fade-in">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded bg-accent-primary/20 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                    <span className="text-[10px] font-semibold text-fg-secondary">Agents thinking...</span>
                  </div>
                  <div className="ml-6 p-2 rounded text-xs bg-bg-tertiary border border-border-primary">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[10px] text-fg-tertiary">Generating proposals...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Participants sidebar */}
        {showParticipants && (
          <div className="w-56 border-l border-border-primary/50 bg-bg-secondary/30 p-3 overflow-y-auto">
            <ParticipantList
              participants={participants}
              currentUserId={currentUserId.current}
            />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border-primary/50 bg-bg-secondary/50 flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question for agents to propose solutions..."
            className="textarea flex-1 min-h-[36px] max-h-32 text-xs"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="btn-primary px-4 flex-shrink-0"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
