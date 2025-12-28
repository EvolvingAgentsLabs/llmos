'use client';

/**
 * Log Filters Component
 *
 * Provides category and level filtering, plus search functionality
 */

import { useState, useRef, useEffect } from 'react';
import { useConsoleStore } from '@/lib/debug/console-store';
import {
  LogLevel,
  LogCategory,
  LOG_LEVEL_COLORS,
  LOG_CATEGORY_COLORS,
  LOG_CATEGORY_LABELS,
} from '@/lib/debug/log-types';
import { Search, Filter, ChevronDown, X } from 'lucide-react';

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error', 'success'];
const ALL_CATEGORIES: LogCategory[] = ['system', 'python', 'applet', 'llm', 'vfs', 'git', 'memory'];

export default function LogFilters() {
  const { filter, setFilter } = useConsoleStore();
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
      if (levelRef.current && !levelRef.current.contains(e.target as Node)) {
        setShowLevelDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCategory = (category: LogCategory) => {
    const current = filter.categories;
    if (current.includes(category)) {
      if (current.length > 1) {
        setFilter({ categories: current.filter((c) => c !== category) });
      }
    } else {
      setFilter({ categories: [...current, category] });
    }
  };

  const toggleLevel = (level: LogLevel) => {
    const current = filter.levels;
    if (current.includes(level)) {
      if (current.length > 1) {
        setFilter({ levels: current.filter((l) => l !== level) });
      }
    } else {
      setFilter({ levels: [...current, level] });
    }
  };

  const selectAllCategories = () => {
    setFilter({ categories: [...ALL_CATEGORIES] });
  };

  const selectAllLevels = () => {
    setFilter({ levels: [...ALL_LEVELS] });
  };

  const getCategoryLabel = () => {
    if (filter.categories.length === ALL_CATEGORIES.length) {
      return 'All Categories';
    }
    if (filter.categories.length === 1) {
      return LOG_CATEGORY_LABELS[filter.categories[0]];
    }
    return `${filter.categories.length} Categories`;
  };

  const getLevelLabel = () => {
    if (filter.levels.length === ALL_LEVELS.length) {
      return 'All Levels';
    }
    if (filter.levels.length === 1) {
      return filter.levels[0].charAt(0).toUpperCase() + filter.levels[0].slice(1);
    }
    return `${filter.levels.length} Levels`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary/50 border-b border-border-primary/30">
      {/* Category Filter */}
      <div className="relative" ref={categoryRef}>
        <button
          onClick={() => {
            setShowCategoryDropdown(!showCategoryDropdown);
            setShowLevelDropdown(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary hover:text-fg-primary transition-colors"
        >
          <Filter className="w-3 h-3" />
          {getCategoryLabel()}
          <ChevronDown className="w-3 h-3" />
        </button>

        {showCategoryDropdown && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-bg-elevated border border-border-primary rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={selectAllCategories}
              className="w-full px-3 py-1.5 text-xs text-left text-fg-secondary hover:bg-bg-tertiary transition-colors border-b border-border-primary/50"
            >
              Select All
            </button>
            {ALL_CATEGORIES.map((category) => (
              <label
                key={category}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg-tertiary cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={filter.categories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className="rounded"
                />
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${LOG_CATEGORY_COLORS[category]}`}>
                  {LOG_CATEGORY_LABELS[category]}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Level Filter */}
      <div className="relative" ref={levelRef}>
        <button
          onClick={() => {
            setShowLevelDropdown(!showLevelDropdown);
            setShowCategoryDropdown(false);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary hover:text-fg-primary transition-colors"
        >
          {getLevelLabel()}
          <ChevronDown className="w-3 h-3" />
        </button>

        {showLevelDropdown && (
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] bg-bg-elevated border border-border-primary rounded-lg shadow-lg overflow-hidden">
            <button
              onClick={selectAllLevels}
              className="w-full px-3 py-1.5 text-xs text-left text-fg-secondary hover:bg-bg-tertiary transition-colors border-b border-border-primary/50"
            >
              Select All
            </button>
            {ALL_LEVELS.map((level) => (
              <label
                key={level}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg-tertiary cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={filter.levels.includes(level)}
                  onChange={() => toggleLevel(level)}
                  className="rounded"
                />
                <span className={LOG_LEVEL_COLORS[level]}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-border-primary/50" />

      {/* Search Input */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-fg-muted" />
        <input
          type="text"
          placeholder="Search logs..."
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          className="w-full pl-7 pr-7 py-1 text-xs bg-bg-tertiary border border-border-primary/30 rounded focus:outline-none focus:border-accent-primary/50 text-fg-primary placeholder:text-fg-muted"
        />
        {filter.search && (
          <button
            onClick={() => setFilter({ search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-secondary"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
