'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ArtifactReference } from '@/lib/artifacts/types';

/**
 * Simplified Workspace Context
 *
 * The workspace is the entire volume (user/team). There's no concept of "projects" -
 * the AI decides what context is relevant from the entire workspace.
 *
 * Each volume has:
 * - Messages (chat history)
 * - Artifacts created during sessions
 * - Short-term and long-term memory
 */

// Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  traces?: number[];
  references?: ArtifactReference[];
  generatedArtifacts?: string[];
}

export type VolumeType = 'user' | 'team' | 'system';

// Memory types
export interface ShortTermMemory {
  id: string;
  content: string;
  timestamp: string;
  context?: string;
}

export interface LongTermMemory {
  id: string;
  content: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  importance: number;
  tags?: string[];
}

// Workspace state for each volume
export interface WorkspaceState {
  volume: VolumeType;
  messages: Message[];
  artifactIds: string[];
  shortTermMemory: ShortTermMemory[];
  longTermMemory: LongTermMemory[];
  lastActivity: string;
}

export interface CronJob {
  id: string;
  name: string;
  status: 'completed' | 'scheduled' | 'running';
  lastRun: string;
  patterns: number;
  skillsGenerated: number;
  nextRun: string;
  logs?: Array<{
    time: string;
    message: string;
    highlight?: boolean;
    indent?: boolean;
  }>;
}

interface WorkspaceContextType {
  // Workspace state per volume
  workspaces: Record<VolumeType, WorkspaceState>;

  // Active volume
  activeVolume: VolumeType;
  setActiveVolume: (volume: VolumeType) => void;

  // Get current workspace
  currentWorkspace: WorkspaceState;

  // Message management for current workspace
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;

  // Artifact management
  addArtifact: (artifactId: string) => void;
  removeArtifact: (artifactId: string) => void;
  getArtifacts: () => string[];

  // Memory management
  addShortTermMemory: (memory: Omit<ShortTermMemory, 'id' | 'timestamp'>) => void;
  addLongTermMemory: (memory: Omit<LongTermMemory, 'id' | 'createdAt' | 'updatedAt'>) => void;
  getMemories: () => { shortTerm: ShortTermMemory[]; longTerm: LongTermMemory[] };

  // Cron jobs (system-level)
  cronJobs: CronJob[];
  updateCronJob: (id: string, updates: Partial<CronJob>) => void;

  // Backward compatibility - deprecated, will be removed
  /** @deprecated Use workspaces instead */
  projects: never[];
  /** @deprecated Use activeVolume instead */
  activeProject: string | null;
  /** @deprecated Use setActiveVolume instead */
  setActiveProject: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Local storage keys
const WORKSPACES_KEY = 'llmos_workspaces';
const ACTIVE_VOLUME_KEY = 'llmos_active_volume';
const CRON_JOBS_KEY = 'llmos_cron_jobs';

// Initialize empty workspace
function createEmptyWorkspace(volume: VolumeType): WorkspaceState {
  return {
    volume,
    messages: [],
    artifactIds: [],
    shortTermMemory: [],
    longTermMemory: [],
    lastActivity: new Date().toISOString(),
  };
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Record<VolumeType, WorkspaceState>>({
    user: createEmptyWorkspace('user'),
    team: createEmptyWorkspace('team'),
    system: createEmptyWorkspace('system'),
  });
  const [activeVolume, setActiveVolumeState] = useState<VolumeType>('user');
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load workspaces
    const savedWorkspaces = localStorage.getItem(WORKSPACES_KEY);
    if (savedWorkspaces) {
      try {
        const parsed = JSON.parse(savedWorkspaces);
        // Ensure all volumes exist
        setWorkspaces({
          user: parsed.user || createEmptyWorkspace('user'),
          team: parsed.team || createEmptyWorkspace('team'),
          system: parsed.system || createEmptyWorkspace('system'),
        });
      } catch (e) {
        console.error('Failed to load workspaces:', e);
      }
    }

    // Migrate from old projects if they exist
    const oldProjects = localStorage.getItem('llmos_projects');
    if (oldProjects && !savedWorkspaces) {
      try {
        const projects = JSON.parse(oldProjects);
        console.log('[WorkspaceContext] Migrating from old projects format');

        // Combine all user project messages into user workspace
        const userMessages: Message[] = [];
        const teamMessages: Message[] = [];

        for (const project of projects) {
          if (project.messages?.length > 0) {
            if (project.volume === 'team') {
              teamMessages.push(...project.messages);
            } else {
              userMessages.push(...project.messages);
            }
          }
        }

        setWorkspaces({
          user: { ...createEmptyWorkspace('user'), messages: userMessages },
          team: { ...createEmptyWorkspace('team'), messages: teamMessages },
          system: createEmptyWorkspace('system'),
        });

        // Clear old data
        localStorage.removeItem('llmos_projects');
        localStorage.removeItem('llmos_active_project');
      } catch (e) {
        console.error('Failed to migrate from old projects:', e);
      }
    }

    // Load active volume
    const savedVolume = localStorage.getItem(ACTIVE_VOLUME_KEY);
    if (savedVolume && ['user', 'team', 'system'].includes(savedVolume)) {
      setActiveVolumeState(savedVolume as VolumeType);
    }

    // Load cron jobs
    const savedCronJobs = localStorage.getItem(CRON_JOBS_KEY);
    if (savedCronJobs) {
      try {
        setCronJobs(JSON.parse(savedCronJobs));
      } catch (e) {
        console.error('Failed to load cron jobs:', e);
        initializeDefaultCronJobs();
      }
    } else {
      initializeDefaultCronJobs();
    }

    setIsInitialized(true);
  }, []);

  const initializeDefaultCronJobs = () => {
    const defaultCronJobs: CronJob[] = [
      {
        id: 'evolution-user',
        name: 'Evolution (User)',
        status: 'completed',
        lastRun: '2h ago',
        patterns: 5,
        skillsGenerated: 2,
        nextRun: '22h',
      },
      {
        id: 'evolution-team',
        name: 'Evolution (Team)',
        status: 'scheduled',
        lastRun: '12h ago',
        patterns: 3,
        skillsGenerated: 0,
        nextRun: '12h',
      },
    ];
    setCronJobs(defaultCronJobs);
  };

  // Save workspaces to localStorage
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
  }, [workspaces, isInitialized]);

  // Save active volume
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(ACTIVE_VOLUME_KEY, activeVolume);
  }, [activeVolume, isInitialized]);

  // Save cron jobs
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(CRON_JOBS_KEY, JSON.stringify(cronJobs));
  }, [cronJobs, isInitialized]);

  // Set active volume
  const setActiveVolume = (volume: VolumeType) => {
    setActiveVolumeState(volume);
  };

  // Get current workspace
  const currentWorkspace = workspaces[activeVolume];

  // Add message to current workspace
  const addMessage = (messageData: Omit<Message, 'id' | 'timestamp'>) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newMessage: Message = {
      ...messageData,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
    };

    setWorkspaces((prev) => ({
      ...prev,
      [activeVolume]: {
        ...prev[activeVolume],
        messages: [...prev[activeVolume].messages, newMessage],
        lastActivity: new Date().toISOString(),
      },
    }));
  };

  // Clear messages in current workspace
  const clearMessages = () => {
    setWorkspaces((prev) => ({
      ...prev,
      [activeVolume]: {
        ...prev[activeVolume],
        messages: [],
        lastActivity: new Date().toISOString(),
      },
    }));
  };

  // Artifact management
  const addArtifact = (artifactId: string) => {
    setWorkspaces((prev) => {
      const workspace = prev[activeVolume];
      if (workspace.artifactIds.includes(artifactId)) return prev;
      return {
        ...prev,
        [activeVolume]: {
          ...workspace,
          artifactIds: [...workspace.artifactIds, artifactId],
        },
      };
    });
  };

  const removeArtifact = (artifactId: string) => {
    setWorkspaces((prev) => ({
      ...prev,
      [activeVolume]: {
        ...prev[activeVolume],
        artifactIds: prev[activeVolume].artifactIds.filter((id) => id !== artifactId),
      },
    }));
  };

  const getArtifacts = () => currentWorkspace.artifactIds;

  // Memory management
  const addShortTermMemory = (memoryData: Omit<ShortTermMemory, 'id' | 'timestamp'>) => {
    const newMemory: ShortTermMemory = {
      ...memoryData,
      id: `stm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    setWorkspaces((prev) => ({
      ...prev,
      [activeVolume]: {
        ...prev[activeVolume],
        shortTermMemory: [...prev[activeVolume].shortTermMemory, newMemory],
      },
    }));
  };

  const addLongTermMemory = (memoryData: Omit<LongTermMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newMemory: LongTermMemory = {
      ...memoryData,
      id: `ltm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    setWorkspaces((prev) => ({
      ...prev,
      [activeVolume]: {
        ...prev[activeVolume],
        longTermMemory: [...prev[activeVolume].longTermMemory, newMemory],
      },
    }));
  };

  const getMemories = () => ({
    shortTerm: currentWorkspace.shortTermMemory,
    longTerm: currentWorkspace.longTermMemory,
  });

  // Cron job management
  const updateCronJob = (id: string, updates: Partial<CronJob>) => {
    setCronJobs((prev) =>
      prev.map((cron) => (cron.id === id ? { ...cron, ...updates } : cron))
    );
  };

  const value: WorkspaceContextType = {
    workspaces,
    activeVolume,
    setActiveVolume,
    currentWorkspace,
    addMessage,
    clearMessages,
    addArtifact,
    removeArtifact,
    getArtifacts,
    addShortTermMemory,
    addLongTermMemory,
    getMemories,
    cronJobs,
    updateCronJob,

    // Backward compatibility (deprecated)
    projects: [] as never[],
    activeProject: activeVolume,
    setActiveProject: () => {},
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useProjectContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectProvider');
  }
  return context;
}

// Alias for clarity
export const useWorkspaceContext = useProjectContext;
export const WorkspaceProvider = ProjectProvider;

// Type exports for backward compatibility
export type ProjectType = 'user' | 'team';
export type ProjectStatus = 'temporal' | 'saved';
export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  traces: number;
  timeAgo: string;
  volume: 'system' | 'team' | 'user';
  messages: Message[];
}
