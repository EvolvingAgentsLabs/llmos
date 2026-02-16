'use client';

import { useEffect } from 'react';
import type { BootProgress } from '@/lib/kernel/boot';

interface BootScreenProps {
  progress: BootProgress;
  onComplete: () => void;
}

export default function BootScreen({ progress, onComplete }: BootScreenProps) {
  useEffect(() => {
    if (progress.percent >= 100) {
      const timer = setTimeout(onComplete, 300);
      return () => clearTimeout(timer);
    }
  }, [progress.percent, onComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white font-mono">
      <div className="mb-8 text-2xl font-bold text-green-400">LLMos</div>
      <div className="w-64 mb-4">
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
      <div className="text-sm text-gray-400">{progress.message}</div>
      {progress.error && (
        <div className="mt-2 text-sm text-red-400">{progress.error}</div>
      )}
    </div>
  );
}
