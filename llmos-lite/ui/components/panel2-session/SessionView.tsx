'use client';

import { useState } from 'react';
import ChatInterface from './ChatInterface';

interface SessionViewProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

export default function SessionView({ activeSession, activeVolume }: SessionViewProps) {
  // Static session data
  const sessionData = {
    'quantum-research': {
      id: 'quantum-research',
      goal: 'Optimize VQE circuit for H2 molecule',
      traces: 48,
      timeAgo: '3h ago',
      messages: [
        {
          id: '1',
          role: 'user' as const,
          content: 'Help me optimize VQE circuit for H2 molecule',
          timestamp: '10:05',
        },
        {
          id: '2',
          role: 'assistant' as const,
          content: "I'll help optimize the VQE circuit. Let me start by analyzing the current implementation...",
          timestamp: '10:06',
          traces: [1, 2, 3, 4, 5],
          artifact: 'vqe-initial.py',
        },
        {
          id: '3',
          role: 'user' as const,
          content: 'Add support for different molecules',
          timestamp: '11:20',
        },
        {
          id: '4',
          role: 'assistant' as const,
          content: "I'll generalize the code to support different molecules...",
          timestamp: '11:21',
          traces: [16, 17, 18],
          artifact: 'vqe-optimized.py',
        },
        {
          id: '5',
          role: 'user' as const,
          content: 'Generate a reusable skill from this',
          timestamp: '13:00',
        },
        {
          id: '6',
          role: 'assistant' as const,
          content: "⭐ Pattern detected! This is the 3rd VQE optimization task. I've created a reusable skill: quantum-optimization.md",
          timestamp: '13:01',
          traces: [36, 37, 38],
          artifact: 'quantum-optimization.md',
          pattern: {
            name: 'VQE optimization',
            confidence: 0.95,
          },
        },
      ],
      artifacts: [
        { type: 'skill', name: 'quantum-optimization.md' },
        { type: 'code', name: 'vqe-optimized.py' },
        { type: 'workflow', name: 'h2-molecule.workflow' },
      ],
      evolution: {
        patternsDetected: 1,
        patternName: 'VQE optimization',
        occurrence: 3,
        confidence: 0.95,
      },
    },
  };

  const session = activeSession ? sessionData[activeSession as keyof typeof sessionData] : null;

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="terminal-heading text-lg">Welcome to LLMos-Lite!</h2>
          <div className="text-sm text-terminal-fg-secondary space-y-2">
            <p>Start your first conversation by typing a message below.</p>
            <p className="text-xs">A new session will be created automatically when you send your first message.</p>
          </div>
          <div className="mt-6 p-4 bg-terminal-bg-tertiary border border-terminal-border rounded text-left">
            <div className="terminal-heading text-xs mb-2">💡 TRY THESE EXAMPLES:</div>
            <ul className="text-xs text-terminal-fg-secondary space-y-1">
              <li>• "Help me create a Python script to analyze CSV data"</li>
              <li>• "Explain quantum computing basics"</li>
              <li>• "Build a REST API with FastAPI"</li>
              <li>• "Create a React component for a todo list"</li>
            </ul>
          </div>
          <div className="mt-4 p-3 bg-terminal-accent-green/10 border border-terminal-accent-green rounded text-left">
            <div className="text-xs text-terminal-accent-green">
              📚 <span className="font-semibold">New user?</span> Check out the{' '}
              <a
                href="https://github.com/EvolvingAgentsLabs/llmos/blob/main/llmos-lite/GETTING_STARTED.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-terminal-fg-primary"
              >
                Getting Started Guide
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Session Header */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-sm mb-2">
          SESSION: {session.id}
        </h2>
        <div className="text-xs text-terminal-fg-secondary space-y-1">
          <div>Goal: {session.goal}</div>
          <div>{session.traces} traces | {session.timeAgo}</div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 overflow-hidden">
        <ChatInterface messages={session.messages} activeSession={activeSession} />
      </div>

      {/* Session Artifacts */}
      <div className="p-4 border-t border-terminal-border">
        <h3 className="terminal-heading text-xs mb-2">SESSION ARTIFACTS</h3>
        <div className="space-y-2">
          {session.artifacts.map((artifact, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <span className="text-terminal-fg-secondary">
                {artifact.type === 'skill' && '📄'}
                {artifact.type === 'code' && '📄'}
                {artifact.type === 'workflow' && '🔀'}
              </span>
              <span className="text-terminal-accent-blue cursor-pointer hover:underline">
                {artifact.name}
              </span>
              <button className="btn-touch-secondary md:btn-terminal text-xs py-0 px-2 ml-auto md:py-0 md:px-1">
                View
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Evolution Status */}
      {session.evolution.patternsDetected > 0 && (
        <div className="p-4 border-t border-terminal-border bg-terminal-bg-tertiary">
          <h3 className="terminal-heading text-xs mb-2">🧬 EVOLUTION STATUS</h3>
          <div className="space-y-2">
            <div className="text-sm text-terminal-accent-green">
              {session.evolution.patternName}
            </div>
            <div className="text-xs text-terminal-fg-secondary space-y-1">
              <div>Occurrence: {session.evolution.occurrence}{session.evolution.occurrence === 1 ? 'st' : session.evolution.occurrence === 2 ? 'nd' : session.evolution.occurrence === 3 ? 'rd' : 'th'} time</div>
              <div>Confidence: {(session.evolution.confidence * 100).toFixed(0)}%</div>
              <div className="text-terminal-accent-yellow">
                Recommend: Promote to team
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="btn-touch md:btn-terminal text-xs flex-1">
                Promote to Team
              </button>
              <button className="btn-touch-secondary md:btn-terminal-secondary text-xs">
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
