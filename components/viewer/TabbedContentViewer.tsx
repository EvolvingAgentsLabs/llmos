'use client';

/**
 * TabbedContentViewer - Stub (original removed during cleanup)
 */

interface TabbedContentViewerProps {
  filePath: string;
  volume: string;
}

export default function TabbedContentViewer({ filePath, volume }: TabbedContentViewerProps) {
  return (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      <div className="text-center">
        <p className="font-mono text-xs text-gray-600 mb-1">{volume}/{filePath}</p>
        <p>Content viewer not available</p>
      </div>
    </div>
  );
}
