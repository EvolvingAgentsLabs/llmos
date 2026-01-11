'use client';

import { useState, useEffect, useMemo } from 'react';
import { useProjectContext, type VolumeType } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import UnifiedChat from './UnifiedChat';
import ModelSelector from './ModelSelector';

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

  const handleSend = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingStatus('Sending...');
    setAgentState?.('thinking');
    setTaskType?.('chatting');

    try {
      // Add user message
      addMessage({ role: 'user', content: messageText });

      const user = UserStorage.getUser();
      const team = UserStorage.getTeam();

      if (!user || !team) {
        addMessage({
          role: 'assistant',
          content: 'Error: User profile not configured. Please complete setup.',
        });
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

        addMessage({ role: 'assistant', content: errorMsg });
        return;
      }

      // Execute SystemAgent
      setLoadingStatus('Processing...');
      const { SystemAgentOrchestrator } = await import('@/lib/system-agent-orchestrator');
      const { resolveWorkspaceContext } = await import('@/lib/project-context-resolver');

      const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());
      const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

      const orchestrator = new SystemAgentOrchestrator(systemPrompt, (event) => {
        if (event.type === 'execution' || event.type === 'tool-call') {
          setAgentState?.('executing');
          setTaskType?.('coding');
          setLoadingStatus('Executing...');
        } else if (event.type === 'thinking') {
          setAgentState?.('thinking');
          setLoadingStatus('Thinking...');
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

      let response = result.response || '';

      // Handle images from Python execution
      const pythonCalls = result.toolCalls.filter(tc => tc.toolId === 'execute-python' && tc.success);
      for (const tc of pythonCalls) {
        if (tc.output?.images?.length > 0) {
          response += '\n\n';
          tc.output.images.forEach((img: string, i: number) => {
            response += `![Output ${i + 1}](data:image/png;base64,${img})\n`;
          });
        }
      }

      // Handle created files
      if (result.success && result.filesCreated.length > 0) {
        response += `\n\n**Created ${result.filesCreated.length} file(s):**\n`;
        result.filesCreated.slice(0, 5).forEach(f => {
          response += `- \`${f}\`\n`;
        });
        if (result.filesCreated.length > 5) {
          response += `- ...and ${result.filesCreated.length - 5} more\n`;
        }

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

      addMessage({ role: 'assistant', content: response });

    } catch (error) {
      setAgentState?.('error');
      addMessage({
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process'}`,
      });
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
      setTimeout(() => {
        setAgentState?.('idle');
        setTaskType?.('idle');
      }, 2000);
    }
  };

  // Convert messages to UnifiedChat format
  const unifiedMessages = useMemo(() => {
    return messages.map((msg, idx) => ({
      id: msg.id || `msg-${idx}`,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  }, [messages]);

  // Welcome screen when no messages
  if (messages.length === 0) {
    const samplePrompts = getCurrentSamplePrompts();

    return (
      <div className="h-full flex flex-col bg-[#0d1117]">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="max-w-lg space-y-6 text-center">
            <div>
              <h2 className="text-xl font-semibold text-[#c9d1d9] mb-2">LLMos Chat</h2>
              <p className="text-sm text-[#8b949e]">
                A new way to interact with AI
              </p>
            </div>

            <div className="space-y-2">
              {samplePrompts.slice(0, 3).map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(sample.prompt)}
                  className="w-full text-left p-3 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff] transition-colors"
                >
                  <div className="text-sm font-medium text-[#c9d1d9]">{sample.title}</div>
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
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#c9d1d9] placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
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
              className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-medium rounded-lg transition-colors"
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
      onSend={handleSend}
      isLoading={isLoading}
      loadingStatus={loadingStatus}
    />
  );
}
