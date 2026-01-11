'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import MarkdownRenderer from './MarkdownRenderer';

// Branch colors for visual distinction
const BRANCH_COLORS = [
  '#58a6ff', // blue - main
  '#3fb950', // green
  '#f85149', // red
  '#d29922', // orange
  '#a371f7', // purple
  '#f778ba', // pink
];

// Participant types
type ParticipantType = 'user' | 'assistant' | 'agent';

interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
  color: string;
  avatar?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  participantId?: string;
  branchId?: number;
  isDecisionPoint?: boolean;
  alternatives?: Alternative[];
  votes?: Vote[];
}

interface Alternative {
  id: string;
  content: string;
  proposer: string;
  confidence: number;
  votes: number;
  selected?: boolean;
}

interface Vote {
  participantId: string;
  alternativeId: string;
}

interface UnifiedChatProps {
  messages: Message[];
  participants?: Participant[];
  onSend: (message: string) => void;
  onVote?: (alternativeId: string) => void;
  onSelectBranch?: (branchId: number) => void;
  isLoading?: boolean;
  loadingStatus?: string;
}

export default function UnifiedChat({
  messages,
  participants = [],
  onSend,
  onVote,
  onSelectBranch,
  isLoading = false,
  loadingStatus = '',
}: UnifiedChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Default participants if none provided
  const allParticipants = useMemo<Participant[]>(() => {
    if (participants.length > 0) return participants;
    return [
      { id: 'user', name: 'You', type: 'user', color: BRANCH_COLORS[1] },
      { id: 'assistant', name: 'Claude', type: 'assistant', color: BRANCH_COLORS[0] },
    ];
  }, [participants]);

  // Build graph structure from messages
  const graphData = useMemo(() => {
    const branches = new Map<number, number[]>(); // branchId -> message indices
    let currentBranch = 0;

    messages.forEach((msg, idx) => {
      const branchId = msg.branchId ?? 0;
      if (!branches.has(branchId)) {
        branches.set(branchId, []);
      }
      branches.get(branchId)!.push(idx);
      currentBranch = Math.max(currentBranch, branchId);
    });

    return { branches, maxBranch: currentBranch };
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSend(inputValue.trim());
    setInputValue('');
  };

  const toggleDecision = (messageId: string) => {
    setExpandedDecisions(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const getParticipant = (msg: Message): Participant => {
    if (msg.participantId) {
      return allParticipants.find(p => p.id === msg.participantId) || allParticipants[0];
    }
    return msg.role === 'user' ? allParticipants[0] : allParticipants[1];
  };

  const getBranchColor = (branchId: number): string => {
    return BRANCH_COLORS[branchId % BRANCH_COLORS.length];
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Participants Bar - compact */}
      {allParticipants.length > 2 && (
        <div className="px-3 py-1.5 border-b border-[#30363d] flex items-center gap-2 overflow-x-auto">
          {allParticipants.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]"
              style={{ backgroundColor: p.color + '20', color: p.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </div>
          ))}
        </div>
      )}

      {/* Messages with Graph Rail */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Graph Rail Background */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-[#0d1117]" />

          {/* Messages */}
          {messages.map((message, idx) => {
            const participant = getParticipant(message);
            const branchId = message.branchId ?? 0;
            const branchColor = getBranchColor(branchId);
            const isLast = idx === messages.length - 1;
            const hasAlternatives = message.alternatives && message.alternatives.length > 0;
            const isExpanded = expandedDecisions.has(message.id);

            return (
              <div key={message.id} className="relative">
                {/* Graph Rail */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex justify-center">
                  {/* Vertical Line */}
                  <div
                    className="absolute w-0.5 top-0 bottom-0"
                    style={{
                      backgroundColor: branchColor,
                      left: 20 + branchId * 12,
                      opacity: 0.6,
                    }}
                  />
                  {/* Node */}
                  <div
                    className="absolute w-3 h-3 rounded-full border-2 top-4"
                    style={{
                      backgroundColor: message.role === 'user' ? '#0d1117' : branchColor,
                      borderColor: branchColor,
                      left: 17 + branchId * 12,
                    }}
                  />
                  {/* Branch indicator for decision points */}
                  {hasAlternatives && (
                    <div
                      className="absolute w-2 h-2 rounded-full top-4"
                      style={{
                        backgroundColor: '#d29922',
                        left: 30 + branchId * 12,
                      }}
                    />
                  )}
                </div>

                {/* Message Content */}
                <div className="ml-14 pr-4 py-2">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: participant.color }}
                    >
                      {participant.name}
                    </span>
                    {message.timestamp && (
                      <span className="text-[10px] text-[#8b949e]">{message.timestamp}</span>
                    )}
                    {hasAlternatives && (
                      <button
                        onClick={() => toggleDecision(message.id)}
                        className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/20 text-[#d29922] hover:bg-[#d29922]/30"
                      >
                        {isExpanded ? 'Hide' : 'Show'} {message.alternatives!.length} options
                      </button>
                    )}
                  </div>

                  {/* Content */}
                  <div className={`text-sm ${message.role === 'user' ? 'text-[#c9d1d9]' : 'text-[#8b949e]'}`}>
                    {message.role === 'assistant' ? (
                      <MarkdownRenderer content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>

                  {/* Decision Alternatives - Inline Voting */}
                  {hasAlternatives && isExpanded && (
                    <div className="mt-3 space-y-2 pl-2 border-l-2 border-[#30363d]">
                      <div className="text-[10px] text-[#8b949e] uppercase tracking-wider mb-2">
                        Choose an approach
                      </div>
                      {message.alternatives!.map((alt, altIdx) => {
                        const altColor = BRANCH_COLORS[(branchId + altIdx + 1) % BRANCH_COLORS.length];
                        const totalVotes = message.alternatives!.reduce((sum, a) => sum + a.votes, 0);
                        const votePercent = totalVotes > 0 ? (alt.votes / totalVotes) * 100 : 0;

                        return (
                          <div
                            key={alt.id}
                            onClick={() => onVote?.(alt.id)}
                            className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                              alt.selected
                                ? 'border-[#3fb950] bg-[#3fb950]/10'
                                : 'border-[#30363d] hover:border-[#8b949e] bg-[#161b22]'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[8px] font-bold text-white"
                                style={{ backgroundColor: altColor }}
                              >
                                {altIdx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-[#c9d1d9]">
                                    {alt.proposer}
                                  </span>
                                  <span className="text-[10px] text-[#8b949e]">
                                    {(alt.confidence * 100).toFixed(0)}% confidence
                                  </span>
                                </div>
                                <p className="text-xs text-[#8b949e]">{alt.content}</p>
                                {/* Vote bar */}
                                {totalVotes > 0 && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-[#30363d] rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${votePercent}%`,
                                          backgroundColor: alt.selected ? '#3fb950' : altColor,
                                        }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-[#8b949e]">
                                      {alt.votes} vote{alt.votes !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {alt.selected && (
                                <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950] text-white font-medium">
                                  Selected
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-12 flex justify-center">
                <div
                  className="absolute w-0.5 top-0 bottom-0"
                  style={{ backgroundColor: BRANCH_COLORS[0], left: 20, opacity: 0.6 }}
                />
                <div
                  className="absolute w-3 h-3 rounded-full border-2 top-4 animate-pulse"
                  style={{
                    backgroundColor: BRANCH_COLORS[0],
                    borderColor: BRANCH_COLORS[0],
                    left: 17,
                  }}
                />
              </div>
              <div className="ml-14 pr-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: BRANCH_COLORS[0] }}>
                    Claude
                  </span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {loadingStatus && (
                    <span className="text-[10px] text-[#8b949e]">{loadingStatus}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#30363d] p-3 bg-[#161b22]">
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
            placeholder="Message..."
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#c9d1d9] placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#8b949e] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
