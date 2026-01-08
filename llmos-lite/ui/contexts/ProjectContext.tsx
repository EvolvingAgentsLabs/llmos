'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ArtifactReference } from '@/lib/artifacts/types';

// Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  traces?: number[];

  // Artifact integration
  references?: ArtifactReference[]; // Artifacts referenced in this message (@artifact)
  generatedArtifacts?: string[]; // IDs of artifacts created by this message

  // Legacy (kept for backward compatibility)
  artifact?: string;
  pattern?: {
    name: string;
    confidence: number;
  };
}

export type ProjectType = 'user' | 'team';
export type ProjectStatus = 'temporal' | 'saved';

// Memory types for projects
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
  importance: number; // 0-1 scale
  tags?: string[];
}

export interface Project {
  id: string;
  name: string;

  // Project properties
  type: ProjectType; // User or Team project
  status: ProjectStatus; // Temporal (unsaved) or Saved (committed to repo)

  traces: number;
  timeAgo: string;
  patterns?: number;
  commitHash?: string;
  goal?: string;
  volume: 'system' | 'team' | 'user';
  messages: Message[];

  // Artifact tracking
  artifactIds?: string[]; // IDs of all artifacts in this project

  // Memory system
  shortTermMemory?: ShortTermMemory[];
  longTermMemory?: LongTermMemory[];

  // Activity log file path within project
  activityLogPath?: string;

  // Legacy (kept for backward compatibility)
  artifacts?: Array<{
    type: 'skill' | 'code' | 'workflow';
    name: string;
  }>;
  evolution?: {
    patternsDetected: number;
    patternName: string;
    occurrence: number;
    confidence: number;
  };
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

interface ProjectContextType {
  projects: Project[];
  activeProjects: Record<'user' | 'team' | 'system', Project[]>;
  cronJobs: CronJob[];
  activeProject: string | null;
  setActiveProject: (id: string | null) => void;
  addProject: (project: Omit<Project, 'id' | 'traces' | 'timeAgo' | 'messages' | 'artifactIds' | 'shortTermMemory' | 'longTermMemory'>) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  deleteAllProjects: () => void;
  clearProjectMessages: (projectId: string) => void;
  addMessage: (projectId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateCronJob: (id: string, updates: Partial<CronJob>) => void;

  // Artifact management
  addArtifactToProject: (projectId: string, artifactId: string) => void;
  removeArtifactFromProject: (projectId: string, artifactId: string) => void;
  getProjectArtifacts: (projectId: string) => string[];

  // Memory management
  addShortTermMemory: (projectId: string, memory: Omit<ShortTermMemory, 'id' | 'timestamp'>) => void;
  addLongTermMemory: (projectId: string, memory: Omit<LongTermMemory, 'id' | 'createdAt' | 'updatedAt'>) => void;
  getProjectMemories: (projectId: string) => { shortTerm: ShortTermMemory[]; longTerm: LongTermMemory[] };

  // Backward compatibility aliases
  sessions: Project[];
  activeSessions: Record<'user' | 'team' | 'system', Project[]>;
  activeSession: string | null;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Omit<Project, 'id' | 'traces' | 'timeAgo' | 'messages' | 'artifactIds' | 'shortTermMemory' | 'longTermMemory'>) => Project;
  updateSession: (id: string, updates: Partial<Project>) => void;
  deleteSession: (id: string) => void;
  addArtifactToSession: (sessionId: string, artifactId: string) => void;
  removeArtifactFromSession: (sessionId: string, artifactId: string) => void;
  getSessionArtifacts: (sessionId: string) => string[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Local storage keys
const PROJECTS_KEY = 'llmos_projects';
const CRON_JOBS_KEY = 'llmos_cron_jobs';
const ACTIVE_PROJECT_KEY = 'llmos_active_project';

// Legacy key for migration
const LEGACY_SESSIONS_KEY = 'llmos_sessions';
const LEGACY_ACTIVE_SESSION_KEY = 'llmos_active_session';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [activeProject, setActiveProjectState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount (with migration from sessions)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Try to load projects first, then fall back to legacy sessions
    let savedProjects = localStorage.getItem(PROJECTS_KEY);

    // Migration: Check for legacy sessions if no projects exist
    if (!savedProjects) {
      const legacySessions = localStorage.getItem(LEGACY_SESSIONS_KEY);
      if (legacySessions) {
        console.log('[ProjectContext] Migrating legacy sessions to projects...');
        savedProjects = legacySessions;
        // Clear legacy data after migration
        localStorage.removeItem(LEGACY_SESSIONS_KEY);
        localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY);
      }
    }

    const savedCronJobs = localStorage.getItem(CRON_JOBS_KEY);
    let savedActiveProject = localStorage.getItem(ACTIVE_PROJECT_KEY);

    // Migration for active project
    if (!savedActiveProject) {
      savedActiveProject = localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY);
    }

    if (savedProjects) {
      try {
        setProjects(JSON.parse(savedProjects));
      } catch (e) {
        console.error('Failed to load projects:', e);
      }
    }

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

    if (savedActiveProject) {
      setActiveProjectState(savedActiveProject);
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

  // Save to localStorage whenever projects change
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects, isInitialized]);

  // Save cron jobs to localStorage
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(CRON_JOBS_KEY, JSON.stringify(cronJobs));
  }, [cronJobs, isInitialized]);

  // Save active project to localStorage
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    if (activeProject) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  }, [activeProject, isInitialized]);

  const setActiveProject = (id: string | null) => {
    setActiveProjectState(id);
  };

  const addProject = (
    projectData: Omit<Project, 'id' | 'traces' | 'timeAgo' | 'messages' | 'artifactIds' | 'shortTermMemory' | 'longTermMemory'>
  ): Project => {
    const projectId = `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newProject: Project = {
      ...projectData,
      id: projectId,
      traces: 0,
      timeAgo: 'just now',
      messages: [],
      artifactIds: [],
      shortTermMemory: [],
      longTermMemory: [],
      // Set activity log path within project folder
      activityLogPath: `projects/${projectId}/activity.md`,
      // Default to temporal status if not specified
      status: projectData.status || 'temporal',
      // Default to user type if not specified
      type: projectData.type || 'user',
    };

    setProjects((prev) => [...prev, newProject]);
    return newProject;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === id ? { ...project, ...updates } : project
      )
    );
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== id));
    if (activeProject === id) {
      setActiveProjectState(null);
    }
  };

  const deleteAllProjects = () => {
    console.log('[ProjectContext] Deleting all projects');
    setProjects([]);
    setActiveProjectState(null);
    // Also clear from localStorage immediately
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PROJECTS_KEY);
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  };

  const clearProjectMessages = (projectId: string) => {
    console.log('[ProjectContext] Clearing messages for project:', projectId);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, messages: [], traces: 0, timeAgo: 'just now' }
          : project
      )
    );
  };

  const addMessage = (projectId: string, messageData: Omit<Message, 'id' | 'timestamp'>) => {
    console.log('[ProjectContext] addMessage called:', {
      projectId,
      role: messageData.role,
      contentLength: messageData.content?.length || 0,
      contentPreview: messageData.content?.substring(0, 100)
    });

    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const newMessage: Message = {
      ...messageData,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
    };

    console.log('[ProjectContext] Created message:', newMessage.id);

    setProjects((prev) => {
      const updated = prev.map((project) => {
        if (project.id === projectId) {
          const updatedProject = {
            ...project,
            messages: [...project.messages, newMessage],
            traces: project.traces + (newMessage.traces?.length || 0),
            timeAgo: 'just now',
          };
          console.log('[ProjectContext] Updated project, new message count:', updatedProject.messages.length);
          return updatedProject;
        }
        return project;
      });
      console.log('[ProjectContext] Total projects:', updated.length);
      return updated;
    });
  };

  const updateCronJob = (id: string, updates: Partial<CronJob>) => {
    setCronJobs((prev) =>
      prev.map((cron) => (cron.id === id ? { ...cron, ...updates } : cron))
    );
  };

  // Artifact management functions
  const addArtifactToProject = (projectId: string, artifactId: string) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id === projectId) {
          const artifactIds = project.artifactIds || [];
          if (!artifactIds.includes(artifactId)) {
            return {
              ...project,
              artifactIds: [...artifactIds, artifactId],
            };
          }
        }
        return project;
      })
    );
  };

  const removeArtifactFromProject = (projectId: string, artifactId: string) => {
    setProjects((prev) =>
      prev.map((project) => {
        if (project.id === projectId) {
          return {
            ...project,
            artifactIds: (project.artifactIds || []).filter((id) => id !== artifactId),
          };
        }
        return project;
      })
    );
  };

  const getProjectArtifacts = (projectId: string): string[] => {
    const project = projects.find((p) => p.id === projectId);
    return project?.artifactIds || [];
  };

  // Memory management functions
  const addShortTermMemory = (projectId: string, memoryData: Omit<ShortTermMemory, 'id' | 'timestamp'>) => {
    const now = new Date();
    const newMemory: ShortTermMemory = {
      ...memoryData,
      id: `stm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now.toISOString(),
    };

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id === projectId) {
          return {
            ...project,
            shortTermMemory: [...(project.shortTermMemory || []), newMemory],
          };
        }
        return project;
      })
    );
  };

  const addLongTermMemory = (projectId: string, memoryData: Omit<LongTermMemory, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newMemory: LongTermMemory = {
      ...memoryData,
      id: `ltm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };

    setProjects((prev) =>
      prev.map((project) => {
        if (project.id === projectId) {
          return {
            ...project,
            longTermMemory: [...(project.longTermMemory || []), newMemory],
          };
        }
        return project;
      })
    );
  };

  const getProjectMemories = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return {
      shortTerm: project?.shortTermMemory || [],
      longTerm: project?.longTermMemory || [],
    };
  };

  // Group projects by volume
  const activeProjects = projects.reduce(
    (acc, project) => {
      acc[project.volume].push(project);
      return acc;
    },
    { user: [], team: [], system: [] } as Record<'user' | 'team' | 'system', Project[]>
  );

  const value: ProjectContextType = {
    projects,
    activeProjects,
    cronJobs,
    activeProject,
    setActiveProject,
    addProject,
    updateProject,
    deleteProject,
    deleteAllProjects,
    clearProjectMessages,
    addMessage,
    updateCronJob,
    addArtifactToProject,
    removeArtifactFromProject,
    getProjectArtifacts,
    addShortTermMemory,
    addLongTermMemory,
    getProjectMemories,

    // Backward compatibility aliases
    sessions: projects,
    activeSessions: activeProjects,
    activeSession: activeProject,
    setActiveSession: setActiveProject,
    addSession: addProject,
    updateSession: updateProject,
    deleteSession: deleteProject,
    addArtifactToSession: addArtifactToProject,
    removeArtifactFromSession: removeArtifactFromProject,
    getSessionArtifacts: getProjectArtifacts,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within ProjectProvider');
  }
  return context;
}

// Backward compatibility alias
export function useSessionContext() {
  return useProjectContext();
}

// Re-export types with backward compatibility aliases
export type SessionType = ProjectType;
export type SessionStatus = ProjectStatus;
export type Session = Project;
export const SessionProvider = ProjectProvider;
