'use client';

import { Artifact } from '@/lib/artifacts/types';
import CircuitRenderer from '../panels/artifacts/CircuitRenderer';
import ThreeRenderer from '../panels/artifacts/ThreeRenderer';
import PlotRenderer from '../panels/artifacts/PlotRenderer';

interface RenderViewProps {
  artifact: Artifact;
}

export default function RenderView({ artifact }: RenderViewProps) {
  if (!artifact.renderView) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">👁️</div>
          <p className="text-fg-secondary">
            No render view available for this artifact
          </p>
          <p className="text-sm text-fg-tertiary mt-2">
            Switch to Code View to see the source
          </p>
        </div>
      </div>
    );
  }

  const { type, data } = artifact.renderView;

  return (
    <div className="h-full overflow-auto p-6">
      {/* Render based on type */}
      {type === 'quantum-circuit' && (
        <div className="max-w-4xl mx-auto">
          <CircuitRenderer circuitData={data} />
        </div>
      )}

      {type === '3d-scene' && (
        <div className="h-full">
          <ThreeRenderer sceneData={data} />
        </div>
      )}

      {type === 'plot' && (
        <div className="max-w-4xl mx-auto">
          <PlotRenderer plotData={data} />
        </div>
      )}

      {type === 'agent-profile' && (
        <div className="max-w-3xl mx-auto">
          <div className="glass-panel p-6 space-y-6">
            <div>
              <h3 className="text-2xl font-bold text-fg-primary mb-2">
                {data.name}
              </h3>
              <p className="text-lg text-fg-secondary">{data.role}</p>
            </div>

            {data.capabilities && data.capabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3">
                  Capabilities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {data.capabilities.map((capability: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary text-sm"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.model && (
              <div>
                <h4 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-2">
                  Model
                </h4>
                <p className="text-fg-primary font-mono">{data.model}</p>
              </div>
            )}

            {data.systemPrompt && (
              <div>
                <h4 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-2">
                  System Prompt
                </h4>
                <div className="bg-bg-tertiary rounded-lg p-4">
                  <p className="text-fg-primary whitespace-pre-wrap font-mono text-sm">
                    {data.systemPrompt}
                  </p>
                </div>
              </div>
            )}

            {data.tools && data.tools.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3">
                  Tools Available
                </h4>
                <div className="space-y-2">
                  {data.tools.map((tool: string, idx: number) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded bg-bg-tertiary text-fg-primary text-sm"
                    >
                      {tool}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {type === 'workflow-graph' && (
        <div className="max-w-6xl mx-auto">
          <div className="glass-panel p-6">
            <div className="text-center text-fg-secondary">
              <p>Workflow visualization coming soon</p>
              <p className="text-sm text-fg-tertiary mt-2">
                {data.nodes?.length || 0} nodes, {data.edges?.length || 0} edges
              </p>
            </div>
          </div>
        </div>
      )}

      {type === 'markdown' && (
        <div className="max-w-4xl mx-auto">
          <div className="prose prose-invert max-w-none">
            {/* TODO: Add markdown renderer */}
            <div className="whitespace-pre-wrap text-fg-primary">
              {data.content}
            </div>
          </div>
        </div>
      )}

      {type === 'interactive' && (
        <div className="max-w-4xl mx-auto">
          <div className="glass-panel p-6 text-center text-fg-secondary">
            <p>Interactive view type not yet implemented</p>
          </div>
        </div>
      )}
    </div>
  );
}
