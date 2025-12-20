'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import { getCurrentSamplePrompts } from '@/lib/sample-prompts';
import MarkdownRenderer from './MarkdownRenderer';
import type { Message } from '@/contexts/SessionContext';

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
  const { sessions, addSession, addMessage } = useSessionContext();
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [isExecutingCode, setIsExecutingCode] = useState(false);
  const [codeExecutionStatus, setCodeExecutionStatus] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === activeSession);
  const messages = currentSession?.messages || [];

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

    // Auto-create session if none exists
    let sessionId = activeSession;

    try {
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

      // Send message directly to OpenRouter (client-side only)
      setLoadingStatus('Generating AI response...');
      const conversationHistory = messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      // Add current user message to history
      conversationHistory.push({
        role: 'user' as const,
        content: messageText,
      });

      const assistantResponse = await client.chatDirect(conversationHistory);

      console.log('[ChatPanel] Received response:', assistantResponse ? `${assistantResponse.substring(0, 200)}...` : 'EMPTY');
      console.log('[ChatPanel] Response length:', assistantResponse?.length || 0);

      setLoadingStatus('Processing response...');
      // Add assistant response
      console.log('[ChatPanel] Adding assistant message to session:', sessionId);
      addMessage(sessionId, {
        role: 'assistant',
        content: assistantResponse || 'No response from assistant.',
      });
      console.log('[ChatPanel] Message added successfully');
    } catch (error) {
      console.error('Failed to send message:', error);
      setLoadingStatus('Error occurred');
      if (sessionId) {
        addMessage(sessionId, {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        });
      }
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  // Welcome state when no session
  if (!activeSession || !currentSession) {
    const samplePrompts = getCurrentSamplePrompts();

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
          <div className="max-w-2xl space-y-6 animate-fade-in">
            {/* Welcome Icon */}
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center shadow-glow-lg">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>

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
        <div className="p-4 border-t border-border-primary/50 bg-bg-secondary/50 backdrop-blur-xl">
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

  // Active session view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Session Header */}
      <div className="px-4 py-3 border-b border-border-primary/50 bg-bg-secondary/50 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg-primary">{currentSession.name}</h2>
            <div className="flex items-center gap-2 text-xs text-fg-tertiary mt-0.5">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                {messages.length} messages
              </span>
              <span>·</span>
              <span>{currentSession.timeAgo}</span>
            </div>
          </div>
          <div className={currentSession.status === 'temporal' ? 'badge-warning' : 'badge-success'}>
            {currentSession.status === 'temporal' ? 'Temporal' : 'Saved'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="empty-state h-full">
            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <h3 className="empty-state-title">No messages yet</h3>
            <p className="empty-state-description">
              Start the conversation with a message below
            </p>
          </div>
        ) : (
          messages.map((message, idx) => (
            <div key={message.id} className="animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
              {/* Message header */}
              <div className="flex items-center gap-2 mb-2">
                {message.role === 'user' ? (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-secondary to-accent-info flex items-center justify-center text-white text-xs font-semibold">
                    U
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                )}
                <span className="text-xs font-medium text-fg-secondary">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <span className="text-xs text-fg-muted">{message.timestamp}</span>
              </div>

              {/* Message content */}
              <div
                className={`ml-8 p-3 rounded-lg ${
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
                  />
                ) : (
                  message.content
                )}
              </div>

              {/* Metadata */}
              {(message.traces || message.artifact || message.pattern) && (
                <div className="ml-8 mt-2 space-y-1">
                  {message.traces && message.traces.length > 0 && (
                    <div className="badge badge-success text-xs">
                      Trace #{message.traces[0]}-{message.traces[message.traces.length - 1]} executed
                    </div>
                  )}
                  {message.artifact && (
                    <div className="badge badge-info text-xs">
                      Artifact: {message.artifact}
                    </div>
                  )}
                  {message.pattern && (
                    <div className="badge badge-warning text-xs">
                      Pattern: {message.pattern.name} ({(message.pattern.confidence * 100).toFixed(0)}%)
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading indicator with status */}
        {isLoading && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-xs font-medium text-fg-secondary">Assistant</span>
            </div>
            <div className="ml-8 p-3 rounded-lg bg-bg-tertiary border border-border-primary">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-fg-tertiary">{loadingStatus}</span>
              </div>
            </div>
          </div>
        )}

        {/* Code execution indicator (shown after message is received) */}
        {!isLoading && isExecutingCode && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-success to-accent-info flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-xs font-medium text-fg-secondary">Executing Code</span>
            </div>
            <div className="ml-8 p-3 rounded-lg bg-accent-success/5 border border-accent-success/30">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-accent-success animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-accent-success">{codeExecutionStatus || 'Processing...'}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border-primary/50 bg-bg-secondary/50 backdrop-blur-xl flex-shrink-0">
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
            className="textarea flex-1 min-h-[44px] max-h-32"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || isExecutingCode || !inputValue.trim()}
            className="btn-primary px-6 flex-shrink-0"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : isExecutingCode ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
