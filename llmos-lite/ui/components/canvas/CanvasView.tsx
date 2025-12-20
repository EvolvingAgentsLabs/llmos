'use client';

import { useArtifactStore } from '@/lib/artifacts/store';

interface CanvasViewProps {
  volume: 'system' | 'team' | 'user';
  selectedArtifact: string | null;
}

export default function CanvasView({ volume, selectedArtifact }: CanvasViewProps) {
  const { artifacts } = useArtifactStore();

  const artifact = selectedArtifact
    ? artifacts.find((a) => a.id === selectedArtifact)
    : null;

  if (!artifact) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md px-8">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-lg font-semibold text-fg-primary mb-2">Canvas View</h3>
          <p className="text-sm text-fg-secondary">
            Select an artifact from the file tree to view and edit it here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Artifact header */}
      <div className="px-6 py-4 border-b border-border-primary/50 bg-bg-secondary/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {artifact.type === 'agent' && '🤖'}
            {artifact.type === 'tool' && '🔧'}
            {artifact.type === 'skill' && '⚡'}
            {artifact.type === 'code' && '📄'}
            {artifact.type === 'workflow' && '🔄'}
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-fg-primary">{artifact.name}</h2>
            <p className="text-sm text-fg-secondary">
              {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} • {artifact.volume} volume
            </p>
          </div>
          <span className={`
            px-3 py-1 rounded-full text-xs font-medium
            ${artifact.status === 'committed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
          `}>
            {artifact.status}
          </span>
        </div>
      </div>

      {/* Artifact content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Metadata section */}
          <div className="mb-6 p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <h3 className="text-sm font-semibold text-fg-primary mb-3">Metadata</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-fg-tertiary">ID</dt>
                <dd className="text-fg-secondary font-mono text-xs">{artifact.id}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Type</dt>
                <dd className="text-fg-secondary">{artifact.type}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Volume</dt>
                <dd className="text-fg-secondary">{artifact.volume}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Status</dt>
                <dd className="text-fg-secondary">{artifact.status}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Created</dt>
                <dd className="text-fg-secondary">{new Date(artifact.createdAt).toLocaleString()}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Updated</dt>
                <dd className="text-fg-secondary">{new Date(artifact.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {/* Code View section */}
          {artifact.codeView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Code</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {artifact.codeView}
                </pre>
              </div>
            </div>
          )}

          {/* Render View section */}
          {artifact.renderView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Render Data</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {JSON.stringify(artifact.renderView, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {artifact.dependencies && artifact.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Dependencies</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <ul className="space-y-2">
                  {artifact.dependencies.map((dep, idx) => (
                    <li key={idx} className="text-sm text-fg-secondary flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                      {dep}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tags */}
          {artifact.tags && artifact.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {artifact.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-accent-primary/20 text-accent-primary rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
