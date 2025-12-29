/**
 * Tool Use Display - Claude Code Style
 *
 * Shows file operations (Read/Write/Edit) in chat messages
 */

'use client';

import { ToolCall, ToolResult } from '@/lib/llm-client-enhanced';

interface ToolUseDisplayProps {
  toolCall: ToolCall;
  toolResult?: ToolResult;
}

export default function ToolUseDisplay({ toolCall, toolResult }: ToolUseDisplayProps) {
  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'read_file':
        return '👁️';
      case 'write_file':
        return '📝';
      case 'edit_file':
        return '✏️';
      case 'delete_file':
        return '🗑️';
      case 'list_files':
        return '📂';
      case 'git_commit':
        return '🔧';
      default:
        return '🛠️';
    }
  };

  const getToolColor = (toolName: string) => {
    switch (toolName) {
      case 'write_file':
        return 'text-accent-success';
      case 'edit_file':
        return 'text-accent-warning';
      case 'delete_file':
        return 'text-accent-error';
      case 'git_commit':
        return 'text-accent-info';
      default:
        return 'text-accent-primary';
    }
  };

  const formatToolName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const renderFileOperation = () => {
    const params = toolCall.parameters as Record<string, string | undefined>;

    switch (toolCall.name) {
      case 'write_file':
        return (
          <div className="space-y-1">
            <div className="text-xs font-mono text-fg-secondary">
              {params.volume || 'unknown'}-volume/{params.path || ''}
            </div>
            {toolResult?.fileChanges && toolResult.fileChanges[0]?.diff && (
              <div className="mt-2 p-2 bg-bg-tertiary rounded text-[10px] font-mono max-h-32 overflow-y-auto scrollbar-thin">
                {toolResult.fileChanges[0].diff.slice(0, 10).map((line: string, idx: number) => (
                  <div
                    key={idx}
                    className={`${
                      line.startsWith('+')
                        ? 'text-accent-success'
                        : line.startsWith('-')
                        ? 'text-accent-error'
                        : 'text-fg-muted'
                    }`}
                  >
                    {line}
                  </div>
                ))}
                {toolResult.fileChanges[0].diff.length > 10 && (
                  <div className="text-fg-tertiary mt-1">
                    ... {toolResult.fileChanges[0].diff.length - 10} more lines
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'edit_file':
        return (
          <div className="space-y-1">
            <div className="text-xs font-mono text-fg-secondary">
              {params.volume || 'unknown'}-volume/{params.path || ''}
            </div>
            {toolResult?.fileChanges && toolResult.fileChanges[0]?.diff && (
              <div className="mt-2 p-2 bg-bg-tertiary rounded text-[10px] font-mono max-h-32 overflow-y-auto scrollbar-thin">
                {toolResult.fileChanges[0].diff.slice(0, 10).map((line: string, idx: number) => (
                  <div
                    key={idx}
                    className={`${
                      line.startsWith('+')
                        ? 'text-accent-success'
                        : line.startsWith('-')
                        ? 'text-accent-error'
                        : 'text-fg-muted'
                    }`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'read_file':
        return (
          <div className="text-xs font-mono text-fg-secondary">
            {params.volume || 'unknown'}-volume/{params.path || ''}
          </div>
        );

      case 'delete_file':
        return (
          <div className="text-xs font-mono text-fg-secondary">
            {params.volume || 'unknown'}-volume/{params.path || ''}
          </div>
        );

      case 'list_files':
        return (
          <div className="text-xs font-mono text-fg-secondary">
            {params.volume || 'unknown'}-volume/{params.directory || '/'}
          </div>
        );

      case 'git_commit': {
        const files = toolCall.parameters.files as string[] | undefined;
        return (
          <div className="space-y-1">
            <div className="text-xs text-fg-secondary">
              {params.volume || 'unknown'} volume
            </div>
            <div className="text-xs text-fg-primary italic">
              "{params.message || ''}"
            </div>
            {files && files.length > 0 && (
              <div className="text-[10px] text-fg-tertiary">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      }

      default:
        return (
          <div className="text-xs text-fg-secondary">
            {JSON.stringify(params, null, 2)}
          </div>
        );
    }
  };

  return (
    <div className="my-2 p-3 bg-bg-secondary/50 border-l-2 border-accent-primary rounded-r">
      {/* Tool Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{getToolIcon(toolCall.name)}</span>
        <span className={`text-xs font-semibold ${getToolColor(toolCall.name)}`}>
          {formatToolName(toolCall.name)}
        </span>
        {toolResult && (
          <span
            className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
              toolResult.success
                ? 'bg-accent-success/20 text-accent-success'
                : 'bg-accent-error/20 text-accent-error'
            }`}
          >
            {toolResult.success ? '✓' : '✗'}
          </span>
        )}
      </div>

      {/* Tool Details */}
      {renderFileOperation()}

      {/* Result Message */}
      {toolResult?.output && (
        <div className="mt-2 pt-2 border-t border-border-primary/30 text-xs text-fg-secondary">
          {toolResult.output}
        </div>
      )}

      {/* Error */}
      {toolResult?.error && (
        <div className="mt-2 p-2 bg-accent-error/10 border border-accent-error/30 rounded text-xs text-accent-error">
          {toolResult.error}
        </div>
      )}
    </div>
  );
}
