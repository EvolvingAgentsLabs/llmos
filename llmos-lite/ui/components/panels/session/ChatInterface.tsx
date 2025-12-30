'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { UserStorage } from '@/lib/user-storage';
import { createLLMClient } from '@/lib/llm-client';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  traces?: number[];
  artifact?: string;
  pattern?: {
    name: string;
    confidence: number;
  };
}

interface ChatInterfaceProps {
  messages: Message[];
  activeSession: string | null;
}

export default function ChatInterface({ messages, activeSession }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Memoize conversation history to avoid recreating on each render
  const conversationHistory = useMemo(() =>
    messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    [messages]
  );

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    try {
      // Get user and team from storage
      const user = UserStorage.getUser();
      const team = UserStorage.getTeam();

      if (!user || !team) {
        console.error('User or team not configured');
        alert('Please complete your profile setup');
        return;
      }

      // Create LLM client
      const client = createLLMClient();
      if (!client) {
        console.error('LLM client not configured');
        alert('Please configure your API key');
        return;
      }

      // Send message directly to OpenRouter (client-side only)
      // API key goes: Browser → OpenRouter (never touches our server)
      const history = [...conversationHistory];

      // Add current user message to history
      history.push({
        role: 'user' as const,
        content: messageText,
      });

      const assistantResponse = await client.chatDirect(history);

      console.log('Response:', assistantResponse);

      // TODO: Add message to messages array
      // This would require lifting state up or using a context provider

    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, conversationHistory]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="space-y-1">
            {/* Message header */}
            <div className="text-xs text-terminal-fg-tertiary">
              [{message.timestamp}] {message.role === 'user' ? 'You' : 'Assistant'}:
            </div>

            {/* Message content */}
            <div className={`
              p-3 rounded
              ${message.role === 'user'
                ? 'bg-terminal-bg-tertiary text-terminal-fg-primary whitespace-pre-wrap'
                : 'bg-terminal-bg-primary text-terminal-fg-secondary border border-terminal-border'
              }
            `}>
              {message.role === 'assistant' ? (
                <MarkdownRenderer content={message.content} enableCodeExecution={true} />
              ) : (
                message.content
              )}
            </div>

            {/* Metadata */}
            {message.traces && (
              <div className="text-xs text-terminal-fg-tertiary ml-3">
                ✓ Trace #{message.traces[0]}-{message.traces[message.traces.length - 1]} executed
              </div>
            )}
            {message.artifact && (
              <div className="text-xs text-terminal-accent-blue ml-3">
                ✓ Artifact {message.traces && message.traces.length > 0 ? 'created' : 'updated'}: {message.artifact}
              </div>
            )}
            {message.pattern && (
              <div className="text-xs text-terminal-accent-yellow ml-3">
                ✓ Pattern: {message.pattern.name} ({(message.pattern.confidence * 100).toFixed(0)}%)
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-terminal-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
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
        <div className="flex gap-2 mt-2">
          <button className="btn-touch-secondary md:btn-terminal-secondary text-xs flex-1 md:flex-none">
            Attach Workflow
          </button>
          <button className="btn-touch-secondary md:btn-terminal-secondary text-xs flex-1 md:flex-none">
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
