'use client';

/**
 * MediaViewer - Stub (original removed during cleanup)
 */

interface MediaViewerProps {
  filePath: string;
  volume: string;
}

export default function MediaViewer({ filePath, volume }: MediaViewerProps) {
  return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <p className="font-mono text-xs text-gray-600 mb-1">{volume}/{filePath}</p>
        <p>Media viewer not available</p>
      </div>
    </div>
  );
}
