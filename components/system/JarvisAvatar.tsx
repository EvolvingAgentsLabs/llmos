'use client';

/**
 * JarvisAvatar - Stub (original 3D avatar removed during cleanup)
 * Placeholder for AI avatar display.
 */

interface JarvisAvatarProps {
  showLabel?: boolean;
}

export default function JarvisAvatar({ showLabel = true }: JarvisAvatarProps) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500/20 to-cyan-500/20 border border-green-500/30 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-green-500/40 animate-pulse" />
        </div>
        {showLabel && (
          <span className="text-xs text-gray-500">LLMos</span>
        )}
      </div>
    </div>
  );
}
