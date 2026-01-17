'use client';

import { Artifact } from '@/lib/artifacts';

interface ArtifactReferenceCardProps {
  artifact: Artifact;
  onOpen?: () => void;
  inline?: boolean;
}

export default function ArtifactReferenceCard({
  artifact,
  onOpen,
  inline = false,
}: ArtifactReferenceCardProps) {
  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'agent': return '🤖';
      case 'tool': return '🔧';
      case 'skill': return '📘';
      case 'workflow': return '🔗';
      case 'code': return '⚛️';
      default: return '📦';
    }
  };

  const getVolumeColor = (volume: string) => {
    switch (volume) {
      case 'system': return 'bg-gray-500/20 text-gray-300';
      case 'team': return 'bg-purple-500/20 text-purple-400';
      case 'user': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-bg-tertiary text-fg-tertiary';
    }
  };

  if (inline) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-primary/10 hover:bg-accent-primary/20 border border-accent-primary/30 transition-colors"
        title={artifact.description || artifact.name}
      >
        <span className="text-sm">{getArtifactIcon(artifact.type)}</span>
        <span className="text-sm font-medium text-accent-primary">
          @{artifact.name}
        </span>
      </button>
    );
  }

  return (
    <div className="glass-panel p-4 hover:border-accent-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-2xl flex-shrink-0">
          {getArtifactIcon(artifact.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="font-medium text-fg-primary truncate">
              {artifact.name}
            </h4>
            <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-fg-tertiary flex-shrink-0">
              {artifact.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${getVolumeColor(artifact.volume)}`}>
              {artifact.volume}
            </span>
          </div>

          {artifact.description && (
            <p className="text-sm text-fg-secondary mb-2 line-clamp-2">
              {artifact.description}
            </p>
          )}

          {artifact.tags && artifact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {artifact.tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full bg-bg-elevated text-fg-tertiary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Preview snippet */}
          {artifact.codeView && (
            <div className="bg-bg-tertiary rounded p-2 mb-3">
              <pre className="text-xs text-fg-secondary font-mono overflow-hidden">
                <code className="line-clamp-3">
                  {artifact.codeView.substring(0, 200)}
                  {artifact.codeView.length > 200 && '...'}
                </code>
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {onOpen && (
              <button
                onClick={onOpen}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                👁️ Open
              </button>
            )}
            <span className="text-xs text-fg-tertiary">
              {artifact.status === 'temporal' ? '⚠️ Temporal' : '✓ Committed'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
