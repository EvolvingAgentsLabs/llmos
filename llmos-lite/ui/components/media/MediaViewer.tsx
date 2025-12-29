'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Download, ZoomIn, ZoomOut, RotateCw, X, Maximize2, Image as ImageIcon } from 'lucide-react';

interface MediaViewerProps {
  filePath: string;
  volume: 'system' | 'team' | 'user';
}

// JARVIS-style header for media viewer
function MediaViewerHeader({ fileName, onClose }: { fileName: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary/80 backdrop-blur border-b border-border-primary">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20
                       flex items-center justify-center border border-white/10">
          <ImageIcon className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-fg-primary">{fileName}</h3>
          <p className="text-[10px] text-fg-tertiary">Media Viewer</p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-white/10 text-fg-tertiary hover:text-fg-primary transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function MediaViewer({ filePath, volume }: MediaViewerProps) {
  const { setContextViewMode, setActiveFile } = useWorkspace();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const fileName = filePath.split('/').pop() || 'Unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);

  // Build the image URL - for now use local path
  // In production this would fetch from the volume's GitHub repo
  const mediaUrl = `/api/volume/${volume}/${filePath}`;

  const handleClose = () => {
    setActiveFile(null);
    setContextViewMode('applets');
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25));
  const handleRotate = () => setRotation(r => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  // Reset state when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setImageError(false);
    setImageLoaded(false);
  }, [filePath]);

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <MediaViewerHeader fileName={fileName} onClose={handleClose} />

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-bg-secondary/50 border-b border-border-primary/50">
        <button
          onClick={handleZoomOut}
          className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-fg-tertiary w-16 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={handleZoomIn}
          className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-border-primary mx-2" />
        <button
          onClick={handleRotate}
          className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
          title="Rotate"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
          title="Reset view"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Media Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#0a0a0f]">
        {isImage && (
          <div
            className="relative transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
              </div>
            )}
            {/* For demo, show a placeholder with the file info */}
            <div className="max-w-full max-h-[70vh] rounded-lg overflow-hidden shadow-2xl border border-white/10">
              {/* Try to load actual image, fallback to placeholder */}
              <img
                src={mediaUrl}
                alt={fileName}
                className={`max-w-full max-h-[70vh] object-contain ${imageLoaded ? '' : 'hidden'}`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
              {(imageError || !imageLoaded) && (
                <div className="w-[400px] h-[300px] bg-gradient-to-br from-purple-900/30 to-blue-900/30
                               flex flex-col items-center justify-center gap-4 p-8">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20
                                 flex items-center justify-center border border-white/10">
                    <ImageIcon className="w-10 h-10 text-purple-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-fg-primary mb-1">{fileName}</p>
                    <p className="text-sm text-fg-tertiary">{ext.toUpperCase()} Image</p>
                    <p className="text-xs text-fg-muted mt-2">Volume: {volume}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isVideo && (
          <div className="max-w-full rounded-lg overflow-hidden shadow-2xl border border-white/10">
            <video
              src={mediaUrl}
              controls
              className="max-w-full max-h-[70vh]"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {!isImage && !isVideo && (
          <div className="text-center p-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-500/20 to-gray-600/20
                           flex items-center justify-center border border-white/10">
              <ImageIcon className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-fg-secondary mb-2">Unsupported media type</p>
            <p className="text-sm text-fg-tertiary">{fileName}</p>
          </div>
        )}
      </div>

      {/* File Info Footer */}
      <div className="px-4 py-2 bg-bg-secondary/50 border-t border-border-primary/50">
        <p className="text-[10px] text-fg-muted text-center">
          {volume}/{filePath}
        </p>
      </div>
    </div>
  );
}
