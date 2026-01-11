'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { Bot, User, Cpu, GitBranch, Vote, FileCode, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

// Agent and participant colors - vibrant on dark
const PARTICIPANT_COLORS = {
  user: '#58a6ff',      // Blue for user
  system: '#a371f7',    // Purple for system agent
  planner: '#3fb950',   // Green for planning agent
  coder: '#ffa657',     // Orange for coding agent
  reviewer: '#f778ba',  // Pink for review agent
  executor: '#79c0ff',  // Light blue for executor
  default: '#8b949e',   // Gray fallback
};

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
type ParticipantType = 'user' | 'assistant' | 'agent' | 'system-agent' | 'sub-agent';

interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
  color: string;
  avatar?: string;
  role?: string; // 'planner' | 'coder' | 'reviewer' | 'executor'
}

interface FileReference {
  path: string;
  name: string;
  type: 'code' | 'plan' | 'output' | 'agent';
}

interface AgentCall {
  agentId: string;
  agentName: string;
  purpose: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
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
  agentCalls?: AgentCall[];
  fileReferences?: FileReference[];
  isSystemMessage?: boolean;
}

interface Alternative {
  id: string;
  content: string;
  proposer: string;
  proposerType?: ParticipantType;
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
  onFileClick?: (file: FileReference) => void;
  isLoading?: boolean;
  loadingStatus?: string;
}

// File link component that opens in main panel
function FileLink({ file, onClick }: { file: FileReference; onClick?: () => void }) {
  const getIcon = () => {
    switch (file.type) {
      case 'code': return <FileCode className="w-3 h-3" />;
      case 'plan': return <GitBranch className="w-3 h-3" />;
      default: return <ExternalLink className="w-3 h-3" />;
    }
  };

  const getTypeColor = () => {
    switch (file.type) {
      case 'code': return 'bg-[#3fb950]/20 text-[#3fb950] border-[#3fb950]/30';
      case 'plan': return 'bg-[#a371f7]/20 text-[#a371f7] border-[#a371f7]/30';
      default: return 'bg-[#58a6ff]/20 text-[#58a6ff] border-[#58a6ff]/30';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getTypeColor()} hover:opacity-80 transition-opacity`}
    >
      {getIcon()}
      <span className="truncate max-w-[150px]">{file.name}</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </button>
  );
}

// Agent call visualization
function AgentCallDisplay({ call }: { call: AgentCall }) {
  const statusColors = {
    pending: 'text-[#8b949e]',
    running: 'text-[#d29922]',
    completed: 'text-[#3fb950]',
    failed: 'text-[#f85149]',
  };

  const statusIcons = {
    pending: '○',
    running: '◐',
    completed: '●',
    failed: '✕',
  };

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-[#21262d] border border-[#30363d]">
      <Cpu className={`w-3.5 h-3.5 mt-0.5 ${statusColors[call.status]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#c9d1d9]">{call.agentName}</span>
          <span className={`text-[10px] ${statusColors[call.status]}`}>
            {statusIcons[call.status]} {call.status}
          </span>
        </div>
        <p className="text-[11px] text-[#8b949e] mt-0.5">{call.purpose}</p>
        {call.result && (
          <p className="text-[11px] text-[#3fb950] mt-1 truncate">{call.result}</p>
        )}
      </div>
    </div>
  );
}

// Participant badge
function ParticipantBadge({ participant }: { participant: Participant }) {
  const getIcon = () => {
    switch (participant.type) {
      case 'user': return <User className="w-3 h-3" />;
      case 'system-agent': return <Bot className="w-3 h-3" />;
      case 'sub-agent': return <Cpu className="w-3 h-3" />;
      default: return <Bot className="w-3 h-3" />;
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: participant.color + '20', color: participant.color }}
    >
      {getIcon()}
      <span>{participant.name}</span>
      {participant.role && (
        <span className="opacity-70">({participant.role})</span>
      )}
    </div>
  );
}

export default function UnifiedChat({
  messages,
  participants = [],
  onSend,
  onVote,
  onSelectBranch,
  onFileClick,
  isLoading = false,
  loadingStatus = '',
}: UnifiedChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [expandedDecisions, setExpandedDecisions] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Default participants including system agent and sub-agents
  const allParticipants = useMemo<Participant[]>(() => {
    if (participants.length > 0) return participants;
    return [
      { id: 'user', name: 'You', type: 'user', color: PARTICIPANT_COLORS.user },
      { id: 'system', name: 'System Agent', type: 'system-agent', color: PARTICIPANT_COLORS.system },
      { id: 'planner', name: 'Planner', type: 'sub-agent', color: PARTICIPANT_COLORS.planner, role: 'planner' },
      { id: 'coder', name: 'Coder', type: 'sub-agent', color: PARTICIPANT_COLORS.coder, role: 'coder' },
      { id: 'reviewer', name: 'Reviewer', type: 'sub-agent', color: PARTICIPANT_COLORS.reviewer, role: 'reviewer' },
    ];
  }, [participants]);

  // Build graph structure from messages
  const graphData = useMemo(() => {
    const branches = new Map<number, number[]>();
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
    if (msg.isSystemMessage) {
      return allParticipants.find(p => p.type === 'system-agent') || allParticipants[1];
    }
    return msg.role === 'user' ? allParticipants[0] : allParticipants[1];
  };

  const getBranchColor = (branchId: number): string => {
    return BRANCH_COLORS[branchId % BRANCH_COLORS.length];
  };

  // Auto-expand decisions that have alternatives
  useEffect(() => {
    const decisionsWithAlternatives = messages
      .filter(m => m.alternatives && m.alternatives.length > 0)
      .map(m => m.id);
    setExpandedDecisions(new Set(decisionsWithAlternatives));
  }, [messages]);

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Participants Bar - always visible */}
      <div className="px-3 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] text-[#8b949e] uppercase tracking-wider flex-shrink-0">Participants:</span>
        {allParticipants.map(p => (
          <ParticipantBadge key={p.id} participant={p} />
        ))}
      </div>

      {/* Messages with Graph Rail */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Graph Rail Background */}
          <div className="absolute left-0 top-0 bottom-0 w-14 bg-[#0d1117]" />

          {/* Messages */}
          {messages.map((message, idx) => {
            const participant = getParticipant(message);
            const branchId = message.branchId ?? 0;
            // Use participant color for graph elements - distinct colors per actor
            const actorColor = participant.color;
            const hasAlternatives = message.alternatives && message.alternatives.length > 0;
            const isExpanded = expandedDecisions.has(message.id);
            const hasAgentCalls = message.agentCalls && message.agentCalls.length > 0;
            const hasFiles = message.fileReferences && message.fileReferences.length > 0;

            // Calculate horizontal offset - user on left, agents shift right
            const actorOffset = participant.type === 'user' ? 0 :
                               participant.type === 'system-agent' ? 1 :
                               participant.type === 'sub-agent' ? 2 : 1;

            return (
              <div key={message.id} className="relative">
                {/* Graph Rail */}
                <div className="absolute left-0 top-0 bottom-0 w-14 flex justify-center">
                  {/* Vertical Line - colored by actor */}
                  <div
                    className="absolute w-0.5 top-0 bottom-0"
                    style={{
                      backgroundColor: actorColor,
                      left: 24 + actorOffset * 8,
                      opacity: 0.7,
                    }}
                  />
                  {/* Node - colored by actor */}
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full border-2 top-4"
                    style={{
                      backgroundColor: participant.type === 'user' ? '#0d1117' : actorColor,
                      borderColor: actorColor,
                      left: 21 + actorOffset * 8,
                      boxShadow: `0 0 8px ${actorColor}40`,
                    }}
                  />
                  {/* Branch indicator for decision points */}
                  {hasAlternatives && (
                    <div
                      className="absolute w-2.5 h-2.5 rounded-full top-4 animate-pulse"
                      style={{
                        backgroundColor: '#d29922',
                        left: 34 + actorOffset * 8,
                        boxShadow: '0 0 8px #d2992280',
                      }}
                    />
                  )}
                  {/* Connection line when actor changes */}
                  {idx > 0 && getParticipant(messages[idx - 1]).type !== participant.type && (
                    <div
                      className="absolute h-0.5 top-4"
                      style={{
                        backgroundColor: actorColor,
                        left: Math.min(24 + actorOffset * 8, 24 + (getParticipant(messages[idx - 1]).type === 'user' ? 0 : 1) * 8),
                        width: Math.abs(actorOffset - (getParticipant(messages[idx - 1]).type === 'user' ? 0 : 1)) * 8,
                        opacity: 0.5,
                      }}
                    />
                  )}
                </div>

                {/* Message Content */}
                <div className="ml-16 pr-4 py-3">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <ParticipantBadge participant={participant} />
                    {message.timestamp && (
                      <span className="text-[10px] text-[#6e7681]">{message.timestamp}</span>
                    )}
                    {hasAlternatives && (
                      <button
                        onClick={() => toggleDecision(message.id)}
                        className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#d29922]/20 text-[#d29922] hover:bg-[#d29922]/30 transition-colors"
                      >
                        <Vote className="w-3 h-3" />
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {message.alternatives!.length} options
                      </button>
                    )}
                  </div>

                  {/* Content - High contrast text */}
                  <div className="text-sm text-[#e6edf3]">
                    {message.role === 'assistant' ? (
                      <MarkdownRenderer content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>

                  {/* File References - Show as clickable links */}
                  {hasFiles && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-[10px] text-[#6e7681] uppercase tracking-wider self-center">Files:</span>
                      {message.fileReferences!.map((file, fileIdx) => (
                        <FileLink
                          key={fileIdx}
                          file={file}
                          onClick={() => onFileClick?.(file)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Agent Calls - Show sub-agent interactions */}
                  {hasAgentCalls && (
                    <div className="mt-3 space-y-2">
                      <span className="text-[10px] text-[#6e7681] uppercase tracking-wider flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> Sub-agent calls:
                      </span>
                      {message.agentCalls!.map((call, callIdx) => (
                        <AgentCallDisplay key={callIdx} call={call} />
                      ))}
                    </div>
                  )}

                  {/* Decision Alternatives - Voting UI - Always visible when present */}
                  {hasAlternatives && isExpanded && (
                    <div className="mt-4 space-y-2 p-3 rounded-lg bg-[#21262d]/50 border border-[#30363d]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#d29922] uppercase tracking-wider font-medium flex items-center gap-1.5">
                          <Vote className="w-3.5 h-3.5" />
                          Choose an approach
                        </span>
                        <span className="text-[10px] text-[#6e7681]">
                          Click to vote
                        </span>
                      </div>
                      <div className="space-y-2 mt-2">
                        {message.alternatives!.map((alt, altIdx) => {
                          const altColor = BRANCH_COLORS[(branchId + altIdx + 1) % BRANCH_COLORS.length];
                          const totalVotes = message.alternatives!.reduce((sum, a) => sum + a.votes, 0);
                          const votePercent = totalVotes > 0 ? (alt.votes / totalVotes) * 100 : 0;
                          const proposerParticipant = allParticipants.find(p =>
                            p.name.toLowerCase() === alt.proposer.toLowerCase() ||
                            p.role === alt.proposer.toLowerCase()
                          );

                          return (
                            <div
                              key={alt.id}
                              onClick={() => onVote?.(alt.id)}
                              className={`p-3 rounded-lg cursor-pointer transition-all border ${
                                alt.selected
                                  ? 'border-[#3fb950] bg-[#3fb950]/15 shadow-lg shadow-[#3fb950]/10'
                                  : 'border-[#30363d] hover:border-[#58a6ff] bg-[#161b22] hover:bg-[#1c2128]'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ backgroundColor: altColor }}
                                >
                                  {altIdx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    {proposerParticipant ? (
                                      <ParticipantBadge participant={proposerParticipant} />
                                    ) : (
                                      <span className="text-xs font-medium text-[#c9d1d9]">{alt.proposer}</span>
                                    )}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#58a6ff]/20 text-[#58a6ff]">
                                      {(alt.confidence * 100).toFixed(0)}% confidence
                                    </span>
                                  </div>
                                  <p className="text-sm text-[#c9d1d9] leading-relaxed">{alt.content}</p>
                                  {/* Vote bar */}
                                  <div className="mt-3 flex items-center gap-3">
                                    <div className="flex-1 h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{
                                          width: `${votePercent}%`,
                                          backgroundColor: alt.selected ? '#3fb950' : altColor,
                                        }}
                                      />
                                    </div>
                                    <span className="text-[11px] text-[#8b949e] min-w-[60px]">
                                      {alt.votes} vote{alt.votes !== 1 ? 's' : ''} ({votePercent.toFixed(0)}%)
                                    </span>
                                  </div>
                                </div>
                                {alt.selected && (
                                  <div className="text-[10px] px-2 py-1 rounded-full bg-[#3fb950] text-white font-medium">
                                    Selected
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-14 flex justify-center">
                <div
                  className="absolute w-0.5 top-0 bottom-0"
                  style={{ backgroundColor: BRANCH_COLORS[0], left: 24, opacity: 0.6 }}
                />
                <div
                  className="absolute w-3.5 h-3.5 rounded-full border-2 top-4 animate-pulse"
                  style={{
                    backgroundColor: BRANCH_COLORS[0],
                    borderColor: BRANCH_COLORS[0],
                    left: 21,
                  }}
                />
              </div>
              <div className="ml-16 pr-4 py-3">
                <div className="flex items-center gap-3">
                  <ParticipantBadge participant={allParticipants.find(p => p.type === 'system-agent') || allParticipants[1]} />
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#a371f7] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#a371f7] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[#a371f7] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {loadingStatus && (
                    <span className="text-xs text-[#8b949e]">{loadingStatus}</span>
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
            className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/50 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="px-5 py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#6e7681] text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
