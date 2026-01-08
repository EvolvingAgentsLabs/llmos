'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectContext, type VolumeType } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import { getWorkspaceSummary } from '@/lib/project-context-resolver';
import MarkdownRenderer from './MarkdownRenderer';
import AgentActivityDisplay, { type AgentActivity } from './AgentActivityDisplay';
import ModelSelector from './ModelSelector';
import CanvasModal from './CanvasModal';

interface ChatPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange?: (volume: VolumeType) => void;
  pendingPrompt?: string | null;
  onPromptProcessed?: () => void;
}

export default function ChatPanel({
  activeVolume,
  onVolumeChange,
  pendingPrompt,
  onPromptProcessed,
}: ChatPanelProps) {
  const {
    currentWorkspace,
    addMessage,
    setActiveVolume,
  } = useProjectContext();

  // Wire to Workspace Context for adaptive UI
  const workspaceContext = useWorkspace();
  const { setAgentState, setTaskType, setContextViewMode, setActiveFile } = workspaceContext || {};

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [isExecutingCode, setIsExecutingCode] = useState(false);
  const [codeExecutionStatus, setCodeExecutionStatus] = useState<string>('');
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [canvasModal, setCanvasModal] = useState<{ code: string; language: string; isOpen: boolean }>({
    code: '',
    language: '',
    isOpen: false,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get messages from current workspace (volume)
  const messages = currentWorkspace?.messages || [];

  // Get workspace summary for display
  const workspaceSummary = useMemo(() => {
    try {
      return getWorkspaceSummary(activeVolume);
    } catch (e) {
      return null;
    }
  }, [activeVolume]);

  // Sync active volume when prop changes
  useEffect(() => {
    if (activeVolume) {
      setActiveVolume(activeVolume);
    }
  }, [activeVolume, setActiveVolume]);

  // Debug logging
  useEffect(() => {
    console.log('[ChatPanel] Render - Message count:', messages.length);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle pending prompt from onboarding
  useEffect(() => {
    if (pendingPrompt && !isLoading) {
      setInputValue(pendingPrompt);
      onPromptProcessed?.();
      // Auto-send the prompt
      setTimeout(() => {
        handleSend();
      }, 100);
    }
  }, [pendingPrompt]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setLoadingStatus('Initializing...');
    setAgentActivities([]); // Clear previous activities

    // Wire: Update Workspace Context - Agent is now thinking
    setAgentState?.('thinking');
    setTaskType?.('chatting');

    try {
      // Add user message to workspace
      setLoadingStatus('Sending message...');
      addMessage({
        role: 'user',
        content: messageText,
      });

      // Get user and team from storage
      const user = UserStorage.getUser();
      const team = UserStorage.getTeam();

      if (!user || !team) {
        console.error('User or team not configured');
        addMessage({
          role: 'assistant',
          content: 'Error: User profile not configured. Please complete setup.',
        });
        return;
      }

      // Create LLM client
      setLoadingStatus('Configuring AI client...');
      console.log('[ChatPanel] Creating LLM client...');
      const client = createLLMClient();
      if (!client) {
        console.error('[ChatPanel] LLM client not configured');

        const { LLMStorage } = await import('@/lib/llm-client');
        const apiKey = LLMStorage.getApiKey();
        const model = LLMStorage.getModel();

        let errorMsg = 'Error: LLM client not configured. ';
        if (!apiKey) {
          errorMsg += 'Missing API key. ';
        }
        if (!model) {
          errorMsg += 'Missing model selection. ';
        }
        errorMsg += 'Please complete the setup process.';

        addMessage({
          role: 'assistant',
          content: errorMsg,
        });
        return;
      }
      console.log('[ChatPanel] LLM client created successfully');

      // Execute SystemAgent orchestrator
      setLoadingStatus('Initializing SystemAgent...');
      console.log('[ChatPanel] Executing SystemAgent for goal:', messageText);

      const { SystemAgentOrchestrator } = await import('@/lib/system-agent-orchestrator');
      const { resolveWorkspaceContext } = await import('@/lib/project-context-resolver');

      // Load SystemAgent definition
      const systemAgentMarkdown = await fetch('/system/agents/SystemAgent.md').then(r => r.text());
      const frontmatterMatch = systemAgentMarkdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const systemPrompt = frontmatterMatch ? frontmatterMatch[2].trim() : systemAgentMarkdown;

      // Create orchestrator with progress callback
      const orchestrator = new SystemAgentOrchestrator(systemPrompt, (event) => {
        setAgentActivities(prev => [...prev, event]);

        // Wire: Update Workspace Context based on activity type
        if (event.type === 'execution' || event.type === 'tool-call') {
          setAgentState?.('executing');
          setTaskType?.('coding');
        } else if (event.type === 'thinking') {
          setAgentState?.('thinking');
        }
      });

      // Resolve workspace context for the volume
      setLoadingStatus('Loading workspace context...');
      console.log('[ChatPanel] Resolving workspace context for volume:', activeVolume);

      try {
        const workspaceCtx = await resolveWorkspaceContext(activeVolume);
        if (workspaceCtx) {
          orchestrator.setWorkspaceContext(workspaceCtx);
          console.log('[ChatPanel] Workspace context set for volume:', activeVolume);
        }
      } catch (e) {
        console.warn('[ChatPanel] Failed to resolve workspace context:', e);
      }

      // Wire: Agent is now executing
      setAgentState?.('executing');

      // Execute
      const result = await orchestrator.execute(messageText);

      console.log('[ChatPanel] SystemAgent result:', {
        success: result.success,
        filesCreated: result.filesCreated.length,
        projectPath: result.projectPath,
        toolCallsCount: result.toolCalls?.length || 0,
      });

      setLoadingStatus('Processing response...');

      // Build response with file paths
      let assistantResponse = result.response || '';

      // Extract and embed images from Python execution tool calls
      const pythonToolCalls = result.toolCalls.filter(tc => tc.toolId === 'execute-python' && tc.success);

      for (const toolCall of pythonToolCalls) {
        if (toolCall.output?.images && Array.isArray(toolCall.output.images) && toolCall.output.images.length > 0) {
          assistantResponse += '\n\n';
          toolCall.output.images.forEach((base64Image: string, idx: number) => {
            assistantResponse += `![Plot ${idx + 1}](data:image/png;base64,${base64Image})\n\n`;
          });
        }
      }

      if (result.success && result.filesCreated.length > 0) {
        assistantResponse += `\n\n---\n\n**Files Created:** ${result.filesCreated.length}\n\n`;

        // List files created
        assistantResponse += '**Files:**\n';
        result.filesCreated.slice(0, 10).forEach(file => {
          assistantResponse += `- \`${file}\`\n`;
        });
        if (result.filesCreated.length > 10) {
          assistantResponse += `- ... and ${result.filesCreated.length - 10} more\n`;
        }

        // Wire: Auto-switch view based on created file types
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

        assistantResponse += `\n💡 Check the **Files** section in the left panel to browse your workspace.`;
        setAgentState?.('success');
      }

      if (!result.success && result.error) {
        assistantResponse = `Error executing SystemAgent: ${result.error}`;
        setAgentState?.('error');
      }

      addMessage({
        role: 'assistant',
        content: assistantResponse,
      });
      console.log('[ChatPanel] Message added successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      setLoadingStatus('Error occurred');
      setAgentState?.('error');
      addMessage({
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
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

  // Welcome state when no messages
  if (messages.length === 0) {
    const samplePrompts = getCurrentSamplePrompts();

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
          <div className="max-w-2xl space-y-6 animate-fade-in">
            {/* Welcome Message */}
            <div className="space-y-2">
              <h2 className="heading-1 text-gradient">Welcome to LLMos-Lite</h2>
              <p className="text-fg-secondary">
                Your AI-powered operating system for intelligent workflows
              </p>
            </div>

            {/* Workspace Info */}
            <div className="glass-panel p-4 text-left">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-accent-primary/10 flex items-center justify-center">
                  <span className="text-accent-primary text-sm capitalize">{activeVolume[0]}</span>
                </div>
                <span className="text-sm font-medium text-fg-primary capitalize">{activeVolume} Workspace</span>
              </div>
              <p className="text-xs text-fg-tertiary">
                The AI will work with your entire {activeVolume} volume and decide what context is relevant.
              </p>
              {workspaceSummary && (
                <div className="flex gap-2 mt-2 text-xs text-fg-muted">
                  {workspaceSummary.agentCount > 0 && (
                    <span>{workspaceSummary.agentCount} agents</span>
                  )}
                  {workspaceSummary.appletCount > 0 && (
                    <span>{workspaceSummary.appletCount} applets</span>
                  )}
                  {workspaceSummary.projectCount > 0 && (
                    <span>{workspaceSummary.projectCount} project folders</span>
                  )}
                </div>
              )}
            </div>

            {/* Sample Prompts */}
            <div className="w-full space-y-3">
              <h3 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">Try These</h3>
              <div className="space-y-2">
                {samplePrompts.slice(0, 3).map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInputValue(sample.prompt)}
                    className="w-full text-left p-3 rounded-lg bg-bg-tertiary border border-border-primary hover:border-accent-primary/50 hover:bg-bg-elevated transition-all duration-200 group"
                  >
                    <div className="text-sm font-medium text-fg-primary group-hover:text-accent-primary transition-colors">
                      {sample.title}
                    </div>
                    <div className="text-xs text-fg-tertiary mt-1">
                      {sample.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Input at bottom */}
        <div className="p-4 border-t border-border-primary/50 bg-bg-secondary/50 backdrop-blur-xl space-y-3">
          <div className="flex justify-center">
            <ModelSelector
              dropdownPosition="top"
              onModelChange={(modelId) => {
                console.log('[ChatPanel] Model changed to:', modelId);
              }}
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message to start..."
              className="input flex-1"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="btn-primary px-6"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>Send</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active conversation view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Workspace Header - Streamlined */}
      <div className="px-3 py-2 border-b border-border-primary/50 bg-bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Model Selector */}
          <ModelSelector onModelChange={(modelId) => {
            console.log('[ChatPanel] Model changed to:', modelId);
          }} />

          {/* Separator */}
          <div className="w-px h-4 bg-border-primary/50" />

          {/* Workspace indicator */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium text-fg-primary capitalize">{activeVolume} Workspace</span>
          </div>

          {/* Right side - message count */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-fg-tertiary">{messages.length} messages</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.map((message, idx) => (
          <div key={message.id} className="animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
            {/* Message header */}
            <div className="flex items-center gap-1.5 mb-1">
              {message.role === 'user' ? (
                <div className="w-5 h-5 rounded bg-accent-secondary/20 flex items-center justify-center">
                  <span className="text-[10px] text-accent-secondary font-semibold">U</span>
                </div>
              ) : (
                <div className="w-5 h-5 rounded bg-accent-primary/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              )}
              <span className="text-[10px] font-semibold text-fg-secondary">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <span className="text-[10px] text-fg-muted">{message.timestamp}</span>
            </div>

            {/* Message content */}
            <div
              className={`ml-6 p-2 rounded text-xs ${
                message.role === 'user'
                  ? 'bg-accent-primary/10 border border-accent-primary/30 text-fg-primary whitespace-pre-wrap'
                  : 'bg-bg-tertiary border border-border-primary text-fg-secondary'
              }`}
            >
              {message.role === 'assistant' ? (
                <MarkdownRenderer
                  content={message.content}
                  enableCodeExecution={true}
                  onExecutionStart={(status) => {
                    setIsExecutingCode(true);
                    setCodeExecutionStatus(status);
                  }}
                  onExecutionEnd={() => {
                    setIsExecutingCode(false);
                    setCodeExecutionStatus('');
                  }}
                  onExecutionStatusChange={(status) => {
                    setCodeExecutionStatus(status);
                  }}
                  onOpenInCanvas={(code, language) => {
                    setCanvasModal({ code, language, isOpen: true });
                  }}
                />
              ) : (
                message.content
              )}
            </div>

            {/* Canvas Modal */}
            <CanvasModal
              code={canvasModal.code}
              language={canvasModal.language}
              isOpen={canvasModal.isOpen}
              onClose={() => setCanvasModal({ ...canvasModal, isOpen: false })}
            />

            {/* Metadata */}
            {message.traces && message.traces.length > 0 && (
              <div className="ml-6 mt-1 flex flex-wrap gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-success/20 text-accent-success">
                  Trace #{message.traces[0]}-{message.traces[message.traces.length - 1]}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Agent Activity Display */}
        {(isLoading || agentActivities.length > 0) && (
          <AgentActivityDisplay
            activities={agentActivities}
            isActive={isLoading}
          />
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded bg-accent-primary/20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-[10px] font-semibold text-fg-secondary">Assistant</span>
            </div>
            <div className="ml-6 p-2 rounded text-xs bg-bg-tertiary border border-border-primary">
              <div className="flex items-center gap-2">
                <div className="flex space-x-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-fg-tertiary">{loadingStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Code execution indicator */}
        {!isLoading && isExecutingCode && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded bg-accent-success/20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 border-2 border-accent-success border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-[10px] font-semibold text-fg-secondary">Executing Code</span>
            </div>
            <div className="ml-6 p-2 rounded text-xs bg-accent-success/5 border border-accent-success/30">
              <div className="flex items-center gap-2">
                <div className="flex space-x-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] text-accent-success">{codeExecutionStatus || 'Processing...'}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
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
            placeholder="Type your message... (Shift+Enter for new line)"
            className="textarea flex-1 min-h-[36px] max-h-32 text-xs"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || isExecutingCode || !inputValue.trim()}
            className="btn-primary px-4 flex-shrink-0"
          >
            {isLoading || isExecutingCode ? (
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
