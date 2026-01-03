/**
 * VSCode File Tree Icons
 *
 * Reusable icon components for the file tree and related UI
 */

import React from 'react';

// ============================================================================
// CHEVRON ICONS
// ============================================================================

export const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 4l4 4-4 4V4z"/>
  </svg>
);

export const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 6l4 4 4-4H4z"/>
  </svg>
);

// ============================================================================
// FILE & FOLDER ICONS
// ============================================================================

export const FolderIcon = ({ open }: { open?: boolean }) => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    {open ? (
      <path d="M7.5 2L6.79 3H2v9h12V2H7.5zm6.31 1L14 11H2V4h4.5l.71-1h6.6z" fill="#dcb67a"/>
    ) : (
      <path d="M14.5 3H7.71l-.85-1h-5v11h13V3h-.36zm-.51 1l.01 7.5h-11L3 4h7.29l.86 1h2.84z" fill="#c09553"/>
    )}
  </svg>
);

export const FileIcon = ({ ext }: { ext: string }) => {
  const colors: Record<string, string> = {
    ts: '#3178c6',
    js: '#f1e05a',
    tsx: '#61dafb',
    jsx: '#61dafb',
    py: '#3572A5',
    md: '#083fa1',
    json: '#cbcb41',
    yaml: '#cb171e',
    yml: '#cb171e',
  };

  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.5 2h-11L2 2.5v11l.5.5h11l.5-.5v-11L13.5 2zM13 13H3V3h10v10z" fill={colors[ext] || '#858585'}/>
      <text x="8" y="11" fontSize="6" textAnchor="middle" fill={colors[ext] || '#858585'} fontWeight="bold">
        {ext.substring(0, 2).toUpperCase()}
      </text>
    </svg>
  );
};

// ============================================================================
// DRIVE & VOLUME ICONS
// ============================================================================

export const DriveIcon = ({ type }: { type: 'system' | 'team' | 'user' }) => {
  const icons = {
    system: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 1a6 6 0 100 12A6 6 0 008 2z" fill="#6e7681"/>
        <path d="M8 4a1 1 0 011 1v3h3a1 1 0 110 2H9v3a1 1 0 11-2 0v-3H4a1 1 0 110-2h3V5a1 1 0 011-1z" fill="#6e7681"/>
      </svg>
    ),
    team: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5.5 3.5A2.5 2.5 0 018 1a2.5 2.5 0 012.5 2.5A2.5 2.5 0 018 6a2.5 2.5 0 01-2.5-2.5zM2 13c0-2.5 2-4 6-4s6 1.5 6 4v1H2v-1z" fill="#58a6ff"/>
      </svg>
    ),
    user: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="5" r="3" fill="#8b949e"/>
        <path d="M12 14s1-2 1-3.5C13 8.5 11 7 8 7s-5 1.5-5 3.5S4 14 4 14h8z" fill="#8b949e"/>
      </svg>
    ),
  };

  return icons[type];
};

// ============================================================================
// SPECIAL ITEM ICONS
// ============================================================================

export const SpecialIcon = ({ type }: { type: string }) => {
  const icons: Record<string, JSX.Element> = {
    agent: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2a1 1 0 011 1v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V6H6a1 1 0 110-2h1V3a1 1 0 011-1z" fill="#f97316"/>
        <rect x="3" y="8" width="10" height="5" rx="1" fill="#f97316" opacity="0.7"/>
      </svg>
    ),
    tool: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.5 2a2.5 2.5 0 00-2.45 3.01L4.5 9.56a2.5 2.5 0 102.95 2.95l4.55-4.55A2.5 2.5 0 1011.5 2z" fill="#8b5cf6"/>
      </svg>
    ),
    skill: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z" fill="#eab308"/>
      </svg>
    ),
    runtime: (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 2a5 5 0 100 10A5 5 0 008 3z" fill="#10b981"/>
        <circle cx="8" cy="8" r="2" fill="#10b981"/>
      </svg>
    ),
  };

  return icons[type] || <FileIcon ext={type} />;
};

export const DesktopIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3z" fill="#3B82F6" opacity="0.8"/>
    <path d="M5 13h6v1H5v-1z" fill="#60A5FA"/>
    <rect x="4" y="4" width="2" height="2" rx="0.5" fill="#60A5FA"/>
    <rect x="7" y="4" width="2" height="2" rx="0.5" fill="#60A5FA"/>
    <rect x="10" y="4" width="2" height="2" rx="0.5" fill="#60A5FA"/>
    <rect x="4" y="7" width="2" height="2" rx="0.5" fill="#60A5FA"/>
  </svg>
);

// ============================================================================
// ACTION ICONS (for context menus)
// ============================================================================

export const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

export const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

export const FolderPlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </svg>
);

export const FilePlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// ============================================================================
// PROJECT ICONS
// ============================================================================

/**
 * Projects Folder Icon - A folder with a grid pattern inside
 * Used for the "projects" folder under Team and User volumes
 */
export const ProjectsFolderIcon = ({ open }: { open?: boolean }) => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    {open ? (
      <>
        {/* Open folder base */}
        <path d="M7.5 2L6.79 3H2v9h12V2H7.5zm6.31 1L14 11H2V4h4.5l.71-1h6.6z" fill="#22c55e"/>
        {/* Grid dots inside */}
        <circle cx="5" cy="7" r="0.8" fill="#86efac"/>
        <circle cx="8" cy="7" r="0.8" fill="#86efac"/>
        <circle cx="11" cy="7" r="0.8" fill="#86efac"/>
        <circle cx="5" cy="9.5" r="0.8" fill="#86efac"/>
        <circle cx="8" cy="9.5" r="0.8" fill="#86efac"/>
        <circle cx="11" cy="9.5" r="0.8" fill="#86efac"/>
      </>
    ) : (
      <>
        {/* Closed folder base */}
        <path d="M14.5 3H7.71l-.85-1h-5v11h13V3h-.36zm-.51 1l.01 7.5h-11L3 4h7.29l.86 1h2.84z" fill="#16a34a"/>
        {/* Grid dots inside */}
        <circle cx="5" cy="7" r="0.8" fill="#4ade80"/>
        <circle cx="8" cy="7" r="0.8" fill="#4ade80"/>
        <circle cx="11" cy="7" r="0.8" fill="#4ade80"/>
        <circle cx="5" cy="9.5" r="0.8" fill="#4ade80"/>
        <circle cx="8" cy="9.5" r="0.8" fill="#4ade80"/>
        <circle cx="11" cy="9.5" r="0.8" fill="#4ade80"/>
      </>
    )}
  </svg>
);

/**
 * Project Icon - A box/cube representing a project workspace
 * Used for each project folder inside the projects folder
 */
export const ProjectIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    {/* 3D box/cube shape representing a project */}
    <path d="M8 1L2 4v8l6 3 6-3V4L8 1z" fill="#a855f7" opacity="0.3"/>
    <path d="M8 1L2 4l6 3 6-3-6-3z" fill="#a855f7"/>
    <path d="M8 7v8l6-3V4l-6 3z" fill="#c084fc"/>
    <path d="M8 7L2 4v8l6 3V7z" fill="#9333ea"/>
    {/* Center dot */}
    <circle cx="8" cy="7" r="1" fill="white" opacity="0.8"/>
  </svg>
);

/**
 * New Project Icon - Plus sign for creating new projects
 */
export const NewProjectIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
    {/* Cube base */}
    <path d="M8 1L2 4v8l6 3 6-3V4L8 1z" fill="#22c55e" opacity="0.3"/>
    <path d="M8 1L2 4l6 3 6-3-6-3z" fill="#22c55e"/>
    <path d="M8 7v8l6-3V4l-6 3z" fill="#4ade80"/>
    <path d="M8 7L2 4v8l6 3V7z" fill="#16a34a"/>
    {/* Plus sign in center */}
    <path d="M8 5v4M6 7h4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);
