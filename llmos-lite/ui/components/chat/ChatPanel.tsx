'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useProjectContext, type VolumeType } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import { getDemoMessages, getDemoParticipants, type DemoMessage } from '@/lib/chat/demo-messages';
import UnifiedChat from './UnifiedChat';
import ModelSelector from './ModelSelector';

// Participant type for multi-agent chat
type ParticipantType = 'user' | 'assistant' | 'agent' | 'system-agent' | 'sub-agent';

interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
  color: string;
  avatar?: string;
  role?: string;
}

interface FileReference {
  path: string;
  name: string;
  type: 'code' | 'plan' | 'output';
}

interface AgentCall {
  agentId: string;
  agentName: string;
  purpose: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
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

interface EnhancedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  participantId?: string;
  branchId?: number;
  isDecisionPoint?: boolean;
  alternatives?: Alternative[];
  agentCalls?: AgentCall[];
  fileReferences?: FileReference[];
  isSystemMessage?: boolean;
}

// Default participants for multi-agent chat
const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: 'user', name: 'You', type: 'user', color: '#58a6ff' },
  { id: 'system', name: 'System Agent', type: 'system-agent', color: '#a371f7' },
  { id: 'planner', name: 'Planner', type: 'sub-agent', color: '#3fb950', role: 'planner' },
  { id: 'coder', name: 'Coder', type: 'sub-agent', color: '#ffa657', role: 'coder' },
  { id: 'reviewer', name: 'Reviewer', type: 'sub-agent', color: '#f778ba', role: 'reviewer' },
];

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
  const { currentWorkspace, addMessage, setActiveVolume } = useProjectContext();
  const workspaceContext = useWorkspace();
  const { setAgentState, setTaskType, setContextViewMode, setActiveFile } = workspaceContext || {};

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [enhancedMessages, setEnhancedMessages] = useState<EnhancedMessage[]>([]);

  // Get messages from current workspace
  const messages = currentWorkspace?.messages || [];

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
  }, [pendingPrompt]);

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
    // Update the enhanced messages to reflect the vote
    setEnhancedMessages(prev => prev.map(msg => {
      if (msg.alternatives) {
        return {
          ...msg,
          alternatives: msg.alternatives.map(alt => ({
            ...alt,
            votes: alt.id === alternativeId ? alt.votes + 1 : alt.votes,
            selected: alt.id === alternativeId,
          })),
        };
      }
      return msg;
    }));
  }, []);

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingStatus('Sending...');
    setAgentState?.('thinking');
    setTaskType?.('chatting');

    const userMessageId = `msg-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
      // Add user message
      addMessage({ role: 'user', content: messageText });

      // Add to enhanced messages
      const userEnhanced: EnhancedMessage = {
        id: userMessageId,
        role: 'user',
        content: messageText,
        timestamp,
        participantId: 'user',
      };
      setEnhancedMessages(prev => [...prev, userEnhanced]);

      const user = UserStorage.getUser();
      const team = UserStorage.getTeam();

      if (!user || !team) {
        const errorMessage: EnhancedMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: 'Error: User profile not configured. Please complete setup.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          participantId: 'system',
          isSystemMessage: true,
        };
        addMessage({ role: 'assistant', content: errorMessage.content });
        setEnhancedMessages(prev => [...prev, errorMessage]);
        return;
      }

      setLoadingStatus('Connecting to AI...');
      const client = createLLMClient();

      if (!client) {
        const { LLMStorage } = await import('@/lib/llm-client');
        const apiKey = LLMStorage.getApiKey();
        const model = LLMStorage.getModel();

        let errorMsg = 'Error: LLM not configured. ';
        if (!apiKey) errorMsg += 'Missing API key. ';
        if (!model) errorMsg += 'Missing model. ';

        const errorMessage: EnhancedMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: errorMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          participantId: 'system',
          isSystemMessage: true,
        };
        addMessage({ role: 'assistant', content: errorMsg });
        setEnhancedMessages(prev => [...prev, errorMessage]);
        return;
      }

      // Execute SystemAgent with simulated multi-agent interaction
      setLoadingStatus('System Agent analyzing...');
      const { SystemAgentOrchestrator } = await import('@/lib/system-agent-orchestrator');
      const { resolveWorkspaceContext } = await import('@/lib/project-context-resolver');

      const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());
      const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

      // Track agent calls for visualization
      const agentCalls: AgentCall[] = [];
      let currentPhase = 'planning';

      const orchestrator = new SystemAgentOrchestrator(systemPrompt, (event) => {
        if (event.type === 'execution' || event.type === 'tool-call') {
          setAgentState?.('executing');
          setTaskType?.('coding');
          setLoadingStatus('Coder executing...');
          currentPhase = 'executing';

          // Add coder agent call
          if (agentCalls.length === 1) {
            agentCalls.push({
              agentId: 'coder',
              agentName: 'Coder Agent',
              purpose: 'Implementing the solution',
              status: 'running',
            });
          }
        } else if (event.type === 'thinking') {
          setAgentState?.('thinking');
          if (currentPhase === 'planning') {
            setLoadingStatus('Planner analyzing...');
            if (agentCalls.length === 0) {
              agentCalls.push({
                agentId: 'planner',
                agentName: 'Planner Agent',
                purpose: 'Breaking down the task',
                status: 'running',
              });
            }
          } else {
            setLoadingStatus('Reviewer checking...');
          }
        }
      });

      try {
        const workspaceCtx = await resolveWorkspaceContext(activeVolume);
        if (workspaceCtx) orchestrator.setWorkspaceContext(workspaceCtx);
      } catch (e) {
        console.warn('[ChatPanel] Failed to resolve workspace context:', e);
      }

      setAgentState?.('executing');
      const result = await orchestrator.execute(messageText);

      // Complete agent calls
      agentCalls.forEach(call => {
        call.status = 'completed';
      });

      let response = result.response || '';

      // Handle images from Python execution
      const pythonCalls = result.toolCalls.filter(tc => tc.toolId === 'execute-python' && tc.success);
      for (const tc of pythonCalls) {
        if (tc.output?.images?.length > 0) {
          tc.output.images.forEach((img: string, i: number) => {
            response += `\n\n![Output ${i + 1}](data:image/png;base64,${img})\n`;
          });
        }
      }

      // Collect file references
      const fileReferences: FileReference[] = [];

      // Handle created files - show as clickable links
      if (result.success && result.filesCreated.length > 0) {
        response += '\n\nCreated files - click to view:';
        result.filesCreated.forEach(f => {
          const ext = f.split('.').pop() || '';
          const isCode = ['py', 'js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'css', 'html'].includes(ext);
          fileReferences.push({
            path: f,
            name: f.split('/').pop() || f,
            type: isCode ? 'code' : 'output',
          });
        });

        const firstFile = result.filesCreated[0];
        if (firstFile?.match(/\.(png|jpg|svg|gif)$/i)) {
          setContextViewMode?.('canvas');
          setActiveFile?.(firstFile);
        } else if (firstFile?.match(/\.(py|js|ts|tsx)$/i)) {
          setContextViewMode?.('split-view');
          setActiveFile?.(firstFile);
        }
        setAgentState?.('success');
      }

      if (!result.success && result.error) {
        response = `Error: ${result.error}`;
        setAgentState?.('error');
      }

      // Create enhanced message with agent calls and file references
      const assistantMessage: EnhancedMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        participantId: 'system',
        isSystemMessage: true,
        agentCalls: agentCalls.length > 0 ? agentCalls : undefined,
        fileReferences: fileReferences.length > 0 ? fileReferences : undefined,
      };

      addMessage({ role: 'assistant', content: response });
      setEnhancedMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      setAgentState?.('error');
      const errorContent = `Error: ${error instanceof Error ? error.message : 'Failed to process'}`;
      const errorMessage: EnhancedMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        participantId: 'system',
        isSystemMessage: true,
      };
      addMessage({ role: 'assistant', content: errorContent });
      setEnhancedMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
      setTimeout(() => {
        setAgentState?.('idle');
        setTaskType?.('idle');
      }, 2000);
    }
  };

  // Convert messages to UnifiedChat format with enhanced data
  const unifiedMessages = useMemo(() => {
    // If we have enhanced messages, use those
    if (enhancedMessages.length > 0) {
      return enhancedMessages;
    }
    // Otherwise, convert basic messages
    return messages.map((msg, idx) => ({
      id: msg.id || `msg-${idx}`,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      participantId: msg.role === 'user' ? 'user' : 'system',
      isSystemMessage: msg.role === 'assistant',
    }));
  }, [messages, enhancedMessages]);

  // Load demo messages
  const loadDemoMessages = useCallback(() => {
    const demoMsgs = getDemoMessages() as EnhancedMessage[];
    setEnhancedMessages(demoMsgs);
  }, []);

  // Welcome screen when no messages
  if (messages.length === 0 && enhancedMessages.length === 0) {
    const samplePrompts = getCurrentSamplePrompts();

    return (
      <div className="h-full flex flex-col bg-[#0d1117]">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg space-y-6 text-center">
            <div>
              <h2 className="text-xl font-semibold text-[#e6edf3] mb-2">LLMos Multi-Agent Chat</h2>
              <p className="text-sm text-[#8b949e]">
                Collaborate with AI agents to solve problems
              </p>
            </div>

            {/* Participant preview */}
            <div className="flex justify-center gap-2 flex-wrap">
              {DEFAULT_PARTICIPANTS.map(p => (
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

            {/* Demo button */}
            <button
              onClick={loadDemoMessages}
              className="w-full p-4 rounded-lg bg-gradient-to-r from-[#a371f7]/20 to-[#58a6ff]/20 border border-[#a371f7]/40 hover:border-[#a371f7] transition-all"
            >
              <div className="text-sm font-semibold text-[#a371f7] mb-1">View Multi-Agent Demo</div>
              <div className="text-xs text-[#8b949e]">See how System Agent coordinates with sub-agents and voting</div>
            </button>

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

            <div className="pt-4">
              <ModelSelector onModelChange={(id) => console.log('Model:', id)} />
            </div>
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-[#30363d] p-3 bg-[#161b22]">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
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
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active conversation
  return (
    <UnifiedChat
      messages={unifiedMessages}
      participants={DEFAULT_PARTICIPANTS}
      onSend={handleSend}
      onVote={handleVote}
      onFileClick={handleFileClick}
      isLoading={isLoading}
      loadingStatus={loadingStatus}
    />
  );
}
