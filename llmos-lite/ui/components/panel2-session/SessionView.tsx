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
      <div className="h-full flex items-center justify-center text-terminal-fg-tertiary">
        Select a session to view
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
