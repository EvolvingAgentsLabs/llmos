'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === activeSession);
  const messages = currentSession?.messages || [];

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

    // Auto-create session if none exists
    let sessionId = activeSession;

    try {
      if (!sessionId) {
        const newSession = addSession({
          name: `Session ${new Date().toLocaleTimeString()}`,
          status: 'uncommitted',
          volume: activeVolume,
        });
        sessionId = newSession.id;
        onSessionCreated(sessionId);
      }

      // Add user message
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
      const client = createLLMClient();
      if (!client) {
        console.error('LLM client not configured');

        // Provide specific error message
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

      // Send message directly to OpenRouter (client-side only)
      // API key goes: Browser → OpenRouter (never touches our server)
      // This is the recommended approach for hosted apps with user-owned keys
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

      // Add assistant response
      addMessage(sessionId, {
        role: 'assistant',
        content: assistantResponse || 'No response from assistant.',
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      if (sessionId) {
        addMessage(sessionId, {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Welcome state when no session
  if (!activeSession || !currentSession) {
    return (
      <div className="h-full flex flex-col bg-terminal-bg-secondary">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="terminal-heading text-lg">Welcome to LLMos-Lite!</h2>
            <div className="text-sm text-terminal-fg-secondary space-y-2">
              <p>Start a conversation by typing a message below.</p>
              <p className="text-xs">
                A new session will be created automatically when you send your first
                message.
              </p>
            </div>
            <div className="mt-6 p-4 bg-terminal-bg-tertiary border border-terminal-border rounded text-left">
              <div className="terminal-heading text-xs mb-2">💡 TRY THESE:</div>
              <ul className="text-xs text-terminal-fg-secondary space-y-1">
                <li>• "Help me create a Python script to analyze CSV data"</li>
                <li>• "Explain quantum computing basics"</li>
                <li>• "Build a REST API with FastAPI"</li>
                <li>• "Create a React component for a todo list"</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Input at bottom even when no session */}
        <div className="p-4 border-t border-terminal-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message to start..."
              className="flex-1 terminal-input min-h-[44px]"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="btn-touch md:btn-terminal px-4"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active session view
  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary">
      {/* Session Header */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-sm mb-1">{currentSession.name}</h2>
        <div className="text-xs text-terminal-fg-secondary">
          {messages.length} messages · {currentSession.timeAgo}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-terminal-fg-tertiary text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-1">
              {/* Message header */}
              <div className="text-xs text-terminal-fg-tertiary">
                [{message.timestamp}]{' '}
                {message.role === 'user' ? 'You' : 'Assistant'}:
              </div>

              {/* Message content */}
              <div
                className={`
                  p-3 rounded whitespace-pre-wrap
                  ${
                    message.role === 'user'
                      ? 'bg-terminal-bg-tertiary text-terminal-fg-primary'
                      : 'bg-terminal-bg-primary text-terminal-fg-secondary border border-terminal-border'
                  }
                `}
              >
                {message.content}
              </div>

              {/* Metadata */}
              {message.traces && message.traces.length > 0 && (
                <div className="text-xs text-terminal-fg-tertiary ml-3">
                  ✓ Trace #{message.traces[0]}-
                  {message.traces[message.traces.length - 1]} executed
                </div>
              )}
              {message.artifact && (
                <div className="text-xs text-terminal-accent-blue ml-3">
                  ✓ Artifact: {message.artifact}
                </div>
              )}
              {message.pattern && (
                <div className="text-xs text-terminal-accent-yellow ml-3">
                  ✓ Pattern: {message.pattern.name} (
                  {(message.pattern.confidence * 100).toFixed(0)}%)
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-terminal-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type your message..."
            className="flex-1 terminal-input min-h-[44px]"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="btn-touch md:btn-terminal px-4"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
