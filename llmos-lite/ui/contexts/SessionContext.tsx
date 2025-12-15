'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  traces?: number[];
  artifact?: string;
  pattern?: {
    name: string;
    confidence: number;
  };
}

export interface Session {
  id: string;
  name: string;
  status: 'uncommitted' | 'committed';
  traces: number;
  timeAgo: string;
  patterns?: number;
  commitHash?: string;
  goal?: string;
  volume: 'system' | 'team' | 'user';
  messages: Message[];
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

interface SessionContextType {
  sessions: Session[];
  activeSessions: Record<'user' | 'team' | 'system', Session[]>;
  cronJobs: CronJob[];
  activeSession: string | null;
  setActiveSession: (id: string | null) => void;
  addSession: (session: Omit<Session, 'id' | 'traces' | 'timeAgo' | 'messages'>) => Session;
  updateSession: (id: string, updates: Partial<Session>) => void;
  deleteSession: (id: string) => void;
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateCronJob: (id: string, updates: Partial<CronJob>) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Local storage keys
const SESSIONS_KEY = 'llmos_sessions';
const CRON_JOBS_KEY = 'llmos_cron_jobs';
const ACTIVE_SESSION_KEY = 'llmos_active_session';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [activeSession, setActiveSessionState] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedSessions = localStorage.getItem(SESSIONS_KEY);
    const savedCronJobs = localStorage.getItem(CRON_JOBS_KEY);
    const savedActiveSession = localStorage.getItem(ACTIVE_SESSION_KEY);

    if (savedSessions) {
      try {
        setSessions(JSON.parse(savedSessions));
      } catch (e) {
        console.error('Failed to load sessions:', e);
      }
    }

    if (savedCronJobs) {
      try {
        setCronJobs(JSON.parse(savedCronJobs));
      } catch (e) {
        console.error('Failed to load cron jobs:', e);
        // Initialize with default cron jobs
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
      }
    } else {
      // Initialize with default cron jobs
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
    }

    if (savedActiveSession) {
      setActiveSessionState(savedActiveSession);
    }

    setIsInitialized(true);
  }, []);

  // Save to localStorage whenever sessions change
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }, [sessions, isInitialized]);

  // Save cron jobs to localStorage
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    localStorage.setItem(CRON_JOBS_KEY, JSON.stringify(cronJobs));
  }, [cronJobs, isInitialized]);

  // Save active session to localStorage
  useEffect(() => {
    if (!isInitialized || typeof window === 'undefined') return;
    if (activeSession) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSession);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  }, [activeSession, isInitialized]);

  const setActiveSession = (id: string | null) => {
    setActiveSessionState(id);
  };

  const addSession = (
    sessionData: Omit<Session, 'id' | 'traces' | 'timeAgo' | 'messages'>
  ): Session => {
    const newSession: Session = {
      ...sessionData,
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      traces: 0,
      timeAgo: 'just now',
      messages: [],
    };

    setSessions((prev) => [...prev, newSession]);
    return newSession;
  };

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, ...updates } : session
      )
    );
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== id));
    if (activeSession === id) {
      setActiveSessionState(null);
    }
  };

  const addMessage = (sessionId: string, messageData: Omit<Message, 'id' | 'timestamp'>) => {
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

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === sessionId) {
          return {
            ...session,
            messages: [...session.messages, newMessage],
            traces: session.traces + (newMessage.traces?.length || 0),
            timeAgo: 'just now',
          };
        }
        return session;
      })
    );
  };

  const updateCronJob = (id: string, updates: Partial<CronJob>) => {
    setCronJobs((prev) =>
      prev.map((cron) => (cron.id === id ? { ...cron, ...updates } : cron))
    );
  };

  // Group sessions by volume
  const activeSessions = sessions.reduce(
    (acc, session) => {
      acc[session.volume].push(session);
      return acc;
    },
    { user: [], team: [], system: [] } as Record<'user' | 'team' | 'system', Session[]>
  );

  const value: SessionContextType = {
    sessions,
    activeSessions,
    cronJobs,
    activeSession,
    setActiveSession,
    addSession,
    updateSession,
    deleteSession,
    addMessage,
    updateCronJob,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return context;
}
