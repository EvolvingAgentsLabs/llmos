'use client';

import { useEffect, useState } from 'react';
import { BootProgress } from '@/lib/kernel/boot';

interface BootScreenProps {
  progress: BootProgress;
  onComplete?: () => void;
}

// JARVIS Boot Avatar - Simple CSS animated orb
function JarvisBootOrb({ progress }: { progress: number }) {
  const isActive = progress < 100;

  return (
    <div className="relative w-32 h-32 mx-auto mb-8">
      {/* Outer glow ring */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 opacity-20 blur-xl ${isActive ? 'animate-pulse' : ''}`}
        style={{ animationDuration: '2s' }}
      />

      {/* Orbital ring 1 */}
      <div
        className="absolute inset-2 rounded-full border-2 border-blue-400/30"
        style={{
          animation: isActive ? 'spin 8s linear infinite' : 'none',
        }}
      />

      {/* Orbital ring 2 */}
      <div
        className="absolute inset-4 rounded-full border border-blue-300/20"
        style={{
          animation: isActive ? 'spin 12s linear infinite reverse' : 'none',
        }}
      />

      {/* Core orb */}
      <div className="absolute inset-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-500/50">
        {/* Progress fill */}
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-t from-blue-300 to-transparent transition-all duration-500"
          style={{
            clipPath: `inset(${100 - progress}% 0 0 0)`,
          }}
        />
        {/* Highlight */}
        <div className="absolute inset-2 rounded-full bg-white/20" />
      </div>

      {/* Progress percentage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white/80 text-sm font-mono font-bold">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}

export default function BootScreen({ progress, onComplete }: BootScreenProps) {
  const [dots, setDots] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Animated dots for loading messages
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Check for completion
  useEffect(() => {
    if (progress.percent === 100 && progress.stage.name === 'ready') {
      setIsComplete(true);
      // Fade out after a brief delay
      const timeout = setTimeout(() => {
        onComplete?.();
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [progress, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-bg-primary transition-opacity duration-500 ${
        isComplete ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="w-full max-w-2xl px-8">
        {/* JARVIS Avatar - Boot animation */}
        <JarvisBootOrb progress={progress.percent} />

        {/* Logo/Title */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-4xl font-bold mb-2 text-accent-primary">
            J.A.R.V.I.S.
          </div>
          <div className="text-lg text-fg-secondary font-light tracking-wider">
            LLMos Autonomous Runtime
          </div>
          <div className="text-xs text-fg-tertiary mt-1">v0.1.0</div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden shadow-sm">
            <div
              className="h-full bg-accent-primary transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            >
              <div className="h-full w-full animate-pulse-glow" />
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-fg-tertiary">
            <span>{progress.percent.toFixed(0)}%</span>
            <span>{progress.stage.description}</span>
          </div>
        </div>

        {/* Current Stage Message */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-bg-secondary border border-border-primary shadow-sm">
            {/* Spinner */}
            {!progress.error && (
              <div className="relative">
                <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              </div>
            )}

            {/* Error indicator */}
            {progress.error && (
              <div className="w-5 h-5 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-accent-warning"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            )}

            {/* Message */}
            <span
              className={`text-sm font-mono ${
                progress.error ? 'text-accent-warning' : 'text-fg-primary'
              }`}
            >
              {progress.message}
              {!progress.error && <span className="ml-1 w-4 inline-block text-left">{dots}</span>}
            </span>
          </div>

          {/* Error message */}
          {progress.error && (
            <div className="mt-4 p-4 rounded-lg bg-accent-warning/10 border border-accent-warning/30 text-accent-warning text-sm animate-fade-in">
              <div className="font-semibold mb-1">Non-critical error (continuing boot):</div>
              <div className="font-mono text-xs opacity-80">{progress.error}</div>
            </div>
          )}
        </div>

        {/* Boot Stages Timeline */}
        <div className="grid grid-cols-6 gap-2">
          {['init', 'volumes', 'wasm', 'python', 'stdlib', 'ready'].map((stageName, index) => {
            const isCurrent = progress.stage.name === stageName;
            const isPast = getStageIndex(progress.stage.name) > index;
            const hasFailed = progress.error && isCurrent;

            return (
              <div
                key={stageName}
                className={`
                  relative h-1 rounded-full transition-all duration-300
                  ${
                    isPast
                      ? 'bg-accent-primary'
                      : isCurrent && !hasFailed
                      ? 'bg-accent-primary animate-pulse'
                      : hasFailed
                      ? 'bg-accent-warning'
                      : 'bg-bg-tertiary'
                  }
                `}
                title={stageName}
              >
                {/* Stage label */}
                <div
                  className={`
                    absolute -bottom-6 left-0 right-0 text-center text-xs transition-opacity duration-300
                    ${
                      isCurrent
                        ? 'text-accent-primary opacity-100'
                        : isPast
                        ? 'text-fg-tertiary opacity-70'
                        : 'text-fg-muted opacity-50'
                    }
                  `}
                >
                  {stageName}
                </div>
              </div>
            );
          })}
        </div>

        {/* Additional info */}
        <div className="mt-16 text-center text-xs text-fg-tertiary space-y-1">
          <div>Loading kernel from system volume...</div>
          <div className="font-mono">/system/kernel/</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/**
 * Get stage index for comparison
 */
function getStageIndex(stageName: string): number {
  const stages = ['init', 'volumes', 'wasm', 'python', 'stdlib', 'ready'];
  return stages.indexOf(stageName);
}
