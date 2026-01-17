'use client';

import { useState, useEffect, useRef } from 'react';
import { artifactManager, Artifact } from '@/lib/artifacts';

interface ArtifactAutocompleteProps {
  input: string;
  cursorPosition: number;
  onSelect: (artifact: Artifact, startPos: number, endPos: number) => void;
  onClose: () => void;
}

export default function ArtifactAutocomplete({
  input,
  cursorPosition,
  onSelect,
  onClose,
}: ArtifactAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Artifact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  // Detect @ mention and extract search term
  useEffect(() => {
    // Find the last @ before cursor
    const beforeCursor = input.substring(0, cursorPosition);
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      onClose();
      return;
    }

    // Check if there's a space between @ and cursor (which would end the mention)
    const afterAt = beforeCursor.substring(lastAtIndex + 1);
    if (afterAt.includes(' ')) {
      onClose();
      return;
    }

    setMentionStart(lastAtIndex);
    setSearchTerm(afterAt);

    // Search artifacts
    const results = artifactManager.findByReference(afterAt);
    setSuggestions(results);
    setSelectedIndex(0);
  }, [input, cursorPosition]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
        case 'Tab':
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            handleSelect(suggestions[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (ref.current) {
      const selected = ref.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleSelect = (artifact: Artifact) => {
    const endPos = cursorPosition;
    onSelect(artifact, mentionStart, endPos);
  };

  if (suggestions.length === 0 || mentionStart === -1) {
    return null;
  }

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'agent':
        return '🤖';
      case 'tool':
        return '🔧';
      case 'skill':
        return '📘';
      case 'workflow':
        return '🔗';
      case 'code':
        return '⚛️';
      default:
        return '📦';
    }
  };

  const getVolumeColor = (volume: string) => {
    switch (volume) {
      case 'system':
        return 'text-gray-400';
      case 'team':
        return 'text-purple-400';
      case 'user':
        return 'text-blue-400';
      default:
        return 'text-fg-tertiary';
    }
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 mb-2 glass-panel max-h-64 overflow-y-auto z-50"
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-border-primary bg-bg-tertiary/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-secondary">
            Reference Artifact {searchTerm && `(${suggestions.length} matches)`}
          </span>
          <span className="text-xs text-fg-tertiary">
            ↑↓ Navigate · Enter to select · Esc to close
          </span>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="py-2">
        {suggestions.map((artifact, index) => (
          <button
            key={artifact.id}
            data-index={index}
            onClick={() => handleSelect(artifact)}
            className={`
              w-full px-4 py-2.5 text-left transition-colors
              ${index === selectedIndex
                ? 'bg-accent-primary/20 border-l-2 border-accent-primary'
                : 'hover:bg-bg-tertiary border-l-2 border-transparent'
              }
            `}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="text-xl flex-shrink-0 mt-0.5">
                {getArtifactIcon(artifact.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-fg-primary truncate">
                    {artifact.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-fg-tertiary flex-shrink-0">
                    {artifact.type}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-fg-tertiary">
                  <span className={getVolumeColor(artifact.volume)}>
                    {artifact.volume}/
                  </span>
                  {artifact.description && (
                    <>
                      <span>·</span>
                      <span className="truncate">{artifact.description}</span>
                    </>
                  )}
                </div>

                {artifact.tags && artifact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {artifact.tags.slice(0, 3).map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-fg-tertiary"
                      >
                        {tag}
                      </span>
                    ))}
                    {artifact.tags.length > 3 && (
                      <span className="text-xs text-fg-tertiary">
                        +{artifact.tags.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="flex-shrink-0">
                {artifact.status === 'temporal' ? (
                  <span className="text-xs text-yellow-400">⚠️</span>
                ) : (
                  <span className="text-xs text-green-400">✓</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border-primary bg-bg-tertiary/50 text-xs text-fg-tertiary">
        Searching across {artifactManager.getAll().length} artifacts
      </div>
    </div>
  );
}
