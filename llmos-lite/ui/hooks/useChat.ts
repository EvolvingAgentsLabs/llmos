'use client';

/**
 * useChat - Custom hook for chat functionality
 *
 * Extracts business logic from ChatPanel for better separation of concerns
 */

import { useState, useCallback } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient, LLMStorage } from '@/lib/llm-client';
import type { AgentActivity } from '@/components/chat/AgentActivityDisplay';

interface UseChatOptions {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
  onSessionCreated: (sessionId: string) => void;
}

interface UseChatReturn {
  // State
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  loadingStatus: string;
  agentActivities: AgentActivity[];

  // Actions
  sendMessage: () => Promise<void>;
  clearActivities: () => void;
}

export function useChat({
  activeSession,
  activeVolume,
  onSessionCreated,
}: UseChatOptions): UseChatReturn {
  const { addSession, addMessage } = useSessionContext();
  const workspaceContext = useWorkspace();
  const { setAgentState, setTaskType, setContextViewMode, setActiveFile } = workspaceContext || {};

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);

  const clearActivities = useCallback(() => {
    setAgentActivities([]);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setLoadingStatus('Initializing...');
    setAgentActivities([]);

    setAgentState?.('thinking');
    setTaskType?.('chatting');

    let sessionId = activeSession;

    try {
      // Auto-create session if none exists
      if (!sessionId) {
        setLoadingStatus('Creating new session...');
        const newSession = addSession({
          name: `Session ${new Date().toLocaleTimeString()}`,
          type: 'user',
          status: 'temporal',
          volume: activeVolume,
        });
        sessionId = newSession.id;
        onSessionCreated(sessionId);
      }

      // Add user message
      setLoadingStatus('Sending message...');
      addMessage(sessionId, {
        role: 'user',
        content: messageText,
      });

      // Get user and team from storage
      const user = UserStorage.getUser();
      const team = UserStorage.getTeam();

      if (!user || !team) {
        console.error('User or team not configured');
        addMessage(sessionId, {
          role: 'assistant',
          content: 'Error: User profile not configured. Please complete setup.',
        });
        return;
      }

      // Create LLM client
      setLoadingStatus('Configuring AI client...');
      const client = createLLMClient();

      if (!client) {
        const apiKey = LLMStorage.getApiKey();
        const model = LLMStorage.getModel();

        let errorMsg = 'Error: LLM client not configured. ';
        if (!apiKey) errorMsg += 'Missing API key. ';
        if (!model) errorMsg += 'Missing model selection. ';
        if (apiKey && model) errorMsg += 'Invalid model configuration. ';
        errorMsg += 'Please complete the setup process.';

        addMessage(sessionId, {
          role: 'assistant',
          content: errorMsg,
        });
        return;
      }

      // Execute SystemAgent orchestrator
      setLoadingStatus('Initializing SystemAgent...');

      const { SystemAgentOrchestrator } = await import('@/lib/system-agent-orchestrator');

      // Load SystemAgent definition
      const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());
      const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

      // Create orchestrator with progress callback
      const orchestrator = new SystemAgentOrchestrator(systemPrompt, (event) => {
        setAgentActivities(prev => [...prev, event]);

        if (event.type === 'execution' || event.type === 'tool-call') {
          setAgentState?.('executing');
          setTaskType?.('coding');
        } else if (event.type === 'thinking') {
          setAgentState?.('thinking');
        }
      });

      setAgentState?.('executing');

      // Execute
      const result = await orchestrator.execute(messageText);

      setLoadingStatus('Processing response...');

      // Build response with project info and file paths
      let assistantResponse = result.response || '';

      // Extract and embed images from Python execution tool calls
      const pythonToolCalls = result.toolCalls.filter(
        (tc: any) => tc.toolId === 'execute-python' && tc.success
      );

      for (const toolCall of pythonToolCalls) {
        if (toolCall.output?.images?.length > 0) {
          assistantResponse += '\n\n';
          toolCall.output.images.forEach((base64Image: string, idx: number) => {
            assistantResponse += `![Plot ${idx + 1}](data:image/png;base64,${base64Image})\n\n`;
          });
        }
      }

      if (result.success && result.projectPath) {
        assistantResponse += `\n\n---\n\n**Project Created:** \`${result.projectPath}\`\n`;
        assistantResponse += `**Files Created:** ${result.filesCreated.length}\n\n`;

        if (result.filesCreated.length > 0) {
          assistantResponse += '**Files:**\n';
          result.filesCreated.slice(0, 10).forEach((file: string) => {
            assistantResponse += `- \`${file}\`\n`;
          });
          if (result.filesCreated.length > 10) {
            assistantResponse += `- ... and ${result.filesCreated.length - 10} more\n`;
          }

          // Auto-switch view based on created file types
          const firstFile = result.filesCreated[0];
          if (firstFile) {
            if (firstFile.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
              setContextViewMode?.('canvas');
              setActiveFile?.(firstFile);
            } else if (firstFile.match(/\.(py|js|ts|tsx|jsx)$/i)) {
              setContextViewMode?.('split-view');
              setActiveFile?.(firstFile);
            } else {
              setContextViewMode?.('artifacts');
            }
          }
        }

        assistantResponse += `\n💡 Check the **User** volume in the left panel to browse your project files.`;
        setAgentState?.('success');
      }

      if (!result.success && result.error) {
        assistantResponse = `Error executing SystemAgent: ${result.error}`;
        setAgentState?.('error');
      }

      addMessage(sessionId, {
        role: 'assistant',
        content: assistantResponse,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setLoadingStatus('Error occurred');
      setAgentState?.('error');

      if (sessionId) {
        addMessage(sessionId, {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        });
      }
    } finally {
      setIsLoading(false);
      setLoadingStatus('');

      setTimeout(() => {
        setAgentState?.('idle');
        setTaskType?.('idle');
      }, 2000);
    }
  }, [
    inputValue,
    isLoading,
    activeSession,
    activeVolume,
    addSession,
    addMessage,
    onSessionCreated,
    setAgentState,
    setTaskType,
    setContextViewMode,
    setActiveFile,
  ]);

  return {
    inputValue,
    setInputValue,
    isLoading,
    loadingStatus,
    agentActivities,
    sendMessage,
    clearActivities,
  };
}

export default useChat;
