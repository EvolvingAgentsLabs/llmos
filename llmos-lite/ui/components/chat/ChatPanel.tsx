'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import { hasExistingProjectFiles, getProjectSummary } from '@/lib/project-context-resolver';
import MarkdownRenderer from './MarkdownRenderer';
import AgentActivityDisplay, { type AgentActivity } from './AgentActivityDisplay';
import ModelSelector from './ModelSelector';
import CanvasModal from './CanvasModal';
import type { Message } from '@/contexts/ProjectContext';

interface ChatPanelProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
  onSessionCreated: (sessionId: string) => void;
  pendingPrompt?: string | null;
  onPromptProcessed?: () => void;
}

export default function ChatPanel({
  activeSession,
  activeVolume,
  onSessionCreated,
  pendingPrompt,
  onPromptProcessed,
}: ChatPanelProps) {
  const { projects, addProject, addMessage } = useProjectContext();

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

  const currentProject = projects.find((p) => p.id === activeSession);
  const messages = currentProject?.messages || [];

  // Check if this project has existing VFS files (for continuation mode indicator)
  const projectStatus = useMemo((): {
    isExisting: boolean;
    hasAgents?: boolean;
    hasApplets?: boolean;
    hasCode?: boolean;
    agentCount?: number;
    appletCount?: number;
    codeFileCount?: number;
  } | null => {
    if (!currentProject?.name) return null;
    try {
      const hasFiles = hasExistingProjectFiles(currentProject.name, activeVolume);
      if (hasFiles) {
        const summary = getProjectSummary(`projects/${currentProject.name.toLowerCase().replace(/\s+/g, '_')}`);
        return {
          isExisting: true,
          ...summary
        };
      }
    } catch (e) {
      // Ignore errors - just means we can't determine status
    }
    return { isExisting: false };
  }, [currentProject?.name, activeVolume]);

  // Debug logging
  useEffect(() => {
    console.log('[ChatPanel] Render - Message count:', messages.length);
    console.log('[ChatPanel] Render - Messages:', messages.map(m => ({ id: m.id, role: m.role, contentLength: m.content.length })));
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

    // Auto-create session if none exists
    let sessionId = activeSession;

    try {
      if (!sessionId) {
        setLoadingStatus('Creating new project...');
        const newProject = addProject({
          name: `Project ${new Date().toLocaleTimeString()}`,
          type: 'user',
          status: 'temporal',
          volume: activeVolume,
        });
        sessionId = newProject.id;
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
      console.log('[ChatPanel] Creating LLM client...');
      const client = createLLMClient();
      if (!client) {
        console.error('[ChatPanel] LLM client not configured');

        // Provide specific error message
        const { LLMStorage } = await import('@/lib/llm-client');
        const apiKey = LLMStorage.getApiKey();
        const model = LLMStorage.getModel();

        console.error('[ChatPanel] Storage check - API Key:', apiKey ? 'present' : 'missing');
        console.error('[ChatPanel] Storage check - Model:', model);

        let errorMsg = 'Error: LLM client not configured. ';
        if (!apiKey) {
          errorMsg += 'Missing API key. ';
        }
        if (!model) {
          errorMsg += 'Missing model selection. ';
        }
        if (apiKey && model) {
          errorMsg += 'Invalid model configuration. ';
        }
        errorMsg += 'Please complete the setup process.';

        addMessage(sessionId, {
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
      const { resolveProjectContext } = await import('@/lib/project-context-resolver');
      const { getVFS } = await import('@/lib/virtual-fs');

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

      // Resolve project context for continuation if we have an active project
      if (currentProject && currentProject.name) {
        setLoadingStatus('Loading project context...');
        console.log('[ChatPanel] Resolving project context for:', currentProject.name);

        try {
          const projectContext = await resolveProjectContext(currentProject, activeVolume);
          if (projectContext) {
            orchestrator.setProjectContext(projectContext);
            console.log('[ChatPanel] Project context set - continuing work on existing project');
          } else {
            console.log('[ChatPanel] No existing VFS project found - will create new if needed');
          }
        } catch (e) {
          console.warn('[ChatPanel] Failed to resolve project context:', e);
        }
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

      // Build response with project info and file paths
      let assistantResponse = result.response || '';

      // Extract and embed images from Python execution tool calls
      console.log('[ChatPanel] Checking for Python tool calls...', { toolCallsCount: result.toolCalls?.length || 0 });
      const pythonToolCalls = result.toolCalls.filter(tc => tc.toolId === 'execute-python' && tc.success);
      console.log('[ChatPanel] Found Python tool calls:', pythonToolCalls.length);

      for (const toolCall of pythonToolCalls) {
        console.log('[ChatPanel] Python tool call output:', {
          hasImages: !!toolCall.output?.images,
          imageCount: toolCall.output?.images?.length || 0,
        });

        if (toolCall.output?.images && Array.isArray(toolCall.output.images) && toolCall.output.images.length > 0) {
          console.log('[ChatPanel] Embedding images in markdown...');
          assistantResponse += '\n\n';
          toolCall.output.images.forEach((base64Image: string, idx: number) => {
            const imagePreview = base64Image.substring(0, 50);
            console.log(`[ChatPanel] Adding image ${idx + 1}, base64 preview:`, imagePreview);
            assistantResponse += `![Plot ${idx + 1}](data:image/png;base64,${base64Image})\n\n`;
          });
        }
      }

      if (result.success && result.projectPath) {
        assistantResponse += `\n\n---\n\n**Project Created:** \`${result.projectPath}\`\n`;
        assistantResponse += `**Files Created:** ${result.filesCreated.length}\n\n`;

        // List files created
        if (result.filesCreated.length > 0) {
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
            // If images were created, switch to canvas view
            if (firstFile.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
              setContextViewMode?.('canvas');
              setActiveFile?.(firstFile);
            }
            // If code files were created, switch to split view
            else if (firstFile.match(/\.(py|js|ts|tsx|jsx)$/i)) {
              setContextViewMode?.('split-view');
              setActiveFile?.(firstFile);
            }
            // If artifacts panel content
            else {
              setContextViewMode?.('artifacts');
            }
          }
        }

        // Show how to view files
        assistantResponse += `\n💡 Check the **User** volume in the left panel to browse your project files.`;

        // Wire: Agent succeeded
        setAgentState?.('success');
      }

      if (!result.success && result.error) {
        assistantResponse = `Error executing SystemAgent: ${result.error}`;
        // Wire: Agent failed
        setAgentState?.('error');
      }

      console.log('[ChatPanel] Adding assistant message to session:', sessionId);
      console.log('[ChatPanel] Assistant response content preview:', assistantResponse.substring(0, 500));
      console.log('[ChatPanel] Assistant response contains image markdown:', assistantResponse.includes('![Plot'));

      addMessage(sessionId, {
        role: 'assistant',
        content: assistantResponse,
      });
      console.log('[ChatPanel] Message added successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      setLoadingStatus('Error occurred');
      // Wire: Agent failed
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
      // Wire: Reset agent state after a delay (show success/error briefly)
      setTimeout(() => {
        setAgentState?.('idle');
        setTaskType?.('idle');
      }, 2000);
    }
  };

  // Welcome state when no project
  if (!activeSession || !currentProject) {
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

            {/* Instructions */}
            <div className="glass-panel p-4 text-left space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-primary text-sm">1</span>
                </div>
                <div>
                  <p className="text-sm text-fg-primary font-medium">Start a conversation</p>
                  <p className="text-xs text-fg-tertiary mt-0.5">Type a message below to begin</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-primary text-sm">2</span>
                </div>
                <div>
                  <p className="text-sm text-fg-primary font-medium">Try a sample prompt</p>
                  <p className="text-xs text-fg-tertiary mt-0.5">Click any suggestion below to get started</p>
                </div>
              </div>
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
          {/* Model Selector */}
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

  // Active project view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Project Header - VSCode Style */}
      <div className="px-3 py-2 border-b border-border-primary/50 bg-bg-secondary/50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-fg-primary">{currentProject.name}</span>
            <span className="text-[10px] text-fg-tertiary">•</span>
            <span className="text-[10px] text-fg-tertiary">{messages.length} msg</span>
            <span className="text-[10px] text-fg-tertiary">•</span>
            <span className="text-[10px] text-fg-tertiary">{currentProject.timeAgo}</span>
            {/* Continuation mode indicator */}
            {projectStatus?.isExisting && (
              <>
                <span className="text-[10px] text-fg-tertiary">•</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 flex items-center gap-1" title="This project has existing files. New messages will continue work on this project.">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Continue
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ModelSelector onModelChange={(modelId) => {
              console.log('[ChatPanel] Model changed to:', modelId);
            }} />
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${currentProject.status === 'temporal' ? 'bg-accent-warning/20 text-accent-warning' : 'bg-accent-success/20 text-accent-success'}`}>
              {currentProject.status === 'temporal' ? 'Unsaved' : 'Saved'}
            </span>
          </div>
        </div>
        {/* Project summary for existing projects */}
        {projectStatus?.isExisting && ((projectStatus.agentCount ?? 0) > 0 || (projectStatus.appletCount ?? 0) > 0 || (projectStatus.codeFileCount ?? 0) > 0) && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-muted">
            {(projectStatus.agentCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {projectStatus.agentCount} agent{projectStatus.agentCount !== 1 ? 's' : ''}
              </span>
            )}
            {(projectStatus.appletCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                {projectStatus.appletCount} applet{projectStatus.appletCount !== 1 ? 's' : ''}
              </span>
            )}
            {(projectStatus.codeFileCount ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                {projectStatus.codeFileCount} code file{projectStatus.codeFileCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages - Compact VSCode Style */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-fg-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-xs text-fg-tertiary">No messages yet</p>
              <p className="text-[10px] text-fg-muted mt-1">Start the conversation below</p>
            </div>
          </div>
        ) : (
          messages.map((message, idx) => (
            <div key={message.id} className="animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
              {/* Message header - Compact */}
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

              {/* Message content - Compact */}
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

              {/* Metadata - Compact */}
              {(message.traces || message.artifact || message.pattern) && (
                <div className="ml-6 mt-1 flex flex-wrap gap-1">
                  {message.traces && message.traces.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-success/20 text-accent-success">
                      Trace #{message.traces[0]}-{message.traces[message.traces.length - 1]}
                    </span>
                  )}
                  {message.artifact && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-info/20 text-accent-info">
                      {message.artifact}
                    </span>
                  )}
                  {message.pattern && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-warning/20 text-accent-warning">
                      {message.pattern.name} ({(message.pattern.confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Agent Activity Display - Matrix Style */}
        {(isLoading || agentActivities.length > 0) && (
          <AgentActivityDisplay
            activities={agentActivities}
            isActive={isLoading}
          />
        )}

        {/* Loading indicator - Compact */}
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

        {/* Code execution indicator - Compact */}
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

      {/* Input - Compact VSCode Style */}
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
