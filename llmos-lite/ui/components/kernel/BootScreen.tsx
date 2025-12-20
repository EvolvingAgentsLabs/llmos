'use client';

import { useEffect, useState } from 'react';
import { BootProgress } from '@/lib/kernel/boot';

interface BootScreenProps {
  progress: BootProgress;
  onComplete?: () => void;
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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 transition-opacity duration-500 ${
        isComplete ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="w-full max-w-2xl px-8">
        {/* Logo/Title */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            LLMos
          </div>
          <div className="text-xl text-gray-400 font-light tracking-wider">
            Autonomous Runtime Environment
          </div>
          <div className="text-sm text-gray-600 mt-2">v0.1.0</div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out"
              style={{ width: `${progress.percent}%` }}
            >
              <div className="h-full w-full animate-pulse-glow" />
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{progress.percent.toFixed(0)}%</span>
            <span>{progress.stage.description}</span>
          </div>
        </div>

        {/* Current Stage Message */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-lg bg-gray-800/50 border border-gray-700/50 backdrop-blur-sm">
            {/* Spinner */}
            {!progress.error && (
              <div className="relative">
                <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Error indicator */}
            {progress.error && (
              <div className="w-5 h-5 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-yellow-500"
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
                progress.error ? 'text-yellow-400' : 'text-gray-300'
              }`}
            >
              {progress.message}
              {!progress.error && <span className="ml-1 w-4 inline-block text-left">{dots}</span>}
            </span>
          </div>

          {/* Error message */}
          {progress.error && (
            <div className="mt-4 p-4 rounded-lg bg-yellow-900/20 border border-yellow-700/50 text-yellow-400 text-sm animate-fade-in">
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
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                      : isCurrent && !hasFailed
                      ? 'bg-blue-500 animate-pulse'
                      : hasFailed
                      ? 'bg-yellow-500'
                      : 'bg-gray-700'
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
                        ? 'text-blue-400 opacity-100'
                        : isPast
                        ? 'text-gray-500 opacity-70'
                        : 'text-gray-600 opacity-50'
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
        <div className="mt-16 text-center text-xs text-gray-600 space-y-1">
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
