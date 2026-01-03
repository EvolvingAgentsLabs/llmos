'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getVFS } from '@/lib/virtual-fs';
import { Download, ZoomIn, ZoomOut, RotateCw, X, Maximize2, Image as ImageIcon, Video } from 'lucide-react';

interface MediaViewerProps {
  filePath: string;
  volume: 'system' | 'team' | 'user';
}

// JARVIS-style header for media viewer
function MediaViewerHeader({ fileName, fileType, onClose }: { fileName: string; fileType: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary/80 backdrop-blur border-b border-border-primary">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20
                       flex items-center justify-center border border-white/10">
          <ImageIcon className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-fg-primary">{fileName}</h3>
          <p className="text-[10px] text-fg-tertiary">{fileType}</p>
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
  const { setContextViewMode, setActiveFile, logActivity } = useWorkspace();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);

  const fileName = filePath.split('/').pop() || 'Unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);

  // Get MIME type for data URL
  const mimeType = useMemo(() => {
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'ico': 'image/x-icon',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }, [ext]);

  // Load media from VFS
  useEffect(() => {
    const loadMedia = async () => {
      setImageError(false);
      setImageLoaded(false);
      setMediaDataUrl(null);
      logActivity?.('action', 'Loading media', fileName);

      try {
        const vfs = getVFS();
        const file = vfs.readFile(filePath);

        if (!file) {
          setImageError(true);
          logActivity?.('error', 'File not found', filePath);
          return;
        }

        // Check if it's binary content (base64) or text (SVG)
        if (file.content) {
          setFileSize(file.content.length);

          if (ext === 'svg') {
            // SVG is text-based
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(file.content)}`;
            setMediaDataUrl(dataUrl);
            setImageLoaded(true);
            logActivity?.('success', 'SVG loaded', `${file.content.length} bytes`);
          } else if (file.content.startsWith('data:')) {
            // Already a data URL
            setMediaDataUrl(file.content);
            setImageLoaded(true);
            logActivity?.('success', 'Media loaded', fileName);
          } else {
            // Assume base64 encoded binary
            const dataUrl = `data:${mimeType};base64,${file.content}`;
            setMediaDataUrl(dataUrl);
            setImageLoaded(true);
            logActivity?.('success', 'Media loaded', `${file.content.length} bytes`);
          }
        } else {
          setImageError(true);
          logActivity?.('error', 'Empty file', filePath);
        }
      } catch (err) {
        console.error('[MediaViewer] Failed to load media:', err);
        setImageError(true);
        logActivity?.('error', 'Failed to load media', err instanceof Error ? err.message : 'Unknown error');
      }
    };

    loadMedia();
  }, [filePath, ext, mimeType, fileName, logActivity]);

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

  // Reset view state when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [filePath]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileType = isImage ? `${ext.toUpperCase()} Image` : isVideo ? `${ext.toUpperCase()} Video` : 'Media File';

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <MediaViewerHeader fileName={fileName} fileType={fileType} onClose={handleClose} />

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
        {/* Loading state */}
        {!imageLoaded && !imageError && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
            <p className="text-sm text-fg-muted">Loading {fileName}...</p>
          </div>
        )}

        {/* Image display */}
        {isImage && imageLoaded && mediaDataUrl && (
          <div
            className="relative transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            <div className="max-w-full max-h-[70vh] rounded-lg overflow-hidden shadow-2xl border border-white/10">
              <img
                src={mediaDataUrl}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </div>
        )}

        {/* Video display */}
        {isVideo && imageLoaded && mediaDataUrl && (
          <div className="max-w-full rounded-lg overflow-hidden shadow-2xl border border-white/10">
            <video
              src={mediaDataUrl}
              controls
              className="max-w-full max-h-[70vh]"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {/* Error state */}
        {imageError && (
          <div className="text-center p-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20
                           flex items-center justify-center border border-red-500/20">
              {isVideo ? <Video className="w-10 h-10 text-red-400" /> : <ImageIcon className="w-10 h-10 text-red-400" />}
            </div>
            <p className="text-lg font-medium text-fg-primary mb-1">{fileName}</p>
            <p className="text-sm text-red-400 mb-4">Failed to load {isVideo ? 'video' : 'image'}</p>
            <p className="text-xs text-fg-muted">
              The file may not exist in the Virtual File System or may be corrupted.
            </p>
            <button
              onClick={handleClose}
              className="mt-4 px-4 py-2 bg-bg-elevated hover:bg-bg-tertiary border border-border-primary rounded-lg text-sm transition-colors"
            >
              Return to Desktop
            </button>
          </div>
        )}

        {/* Unsupported type */}
        {!isImage && !isVideo && !imageError && (
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
      <div className="px-4 py-2 bg-bg-secondary/50 border-t border-border-primary/50 flex items-center justify-between">
        <p className="text-[10px] text-fg-muted font-mono">
          {volume}/{filePath}
        </p>
        <p className="text-[10px] text-fg-tertiary">
          {fileSize > 0 && formatSize(fileSize)}
        </p>
      </div>
    </div>
  );
}
