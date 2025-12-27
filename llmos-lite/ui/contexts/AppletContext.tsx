'use client';

/**
 * AppletContext - React Context for the Infinite App Store
 *
 * Provides global access to:
 * - Active applets
 * - Applet creation/management functions
 * - Applet event subscriptions
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import {
  AppletStore,
  ActiveApplet,
  AppletSubmission,
} from '@/lib/applets/applet-store';
import { AppletMetadata, AppletState } from '@/lib/runtime/applet-runtime';
import { VolumeType } from '@/lib/volumes/file-operations';

interface AppletContextValue {
  // State
  activeApplets: ActiveApplet[];
  recentApplets: AppletMetadata[];
  currentApplet: ActiveApplet | null;

  // Actions
  createApplet: (params: {
    code: string;
    metadata: AppletMetadata;
    filePath?: string;
    volume?: VolumeType;
    initialState?: AppletState;
  }) => ActiveApplet;
  closeApplet: (id: string) => void;
  closeAllApplets: () => void;
  focusApplet: (id: string) => void;
  toggleMinimize: (id: string) => void;
  updateAppletState: (id: string, state: AppletState) => void;
  handleAppletSubmit: (appletId: string, data: unknown) => void;
  getSubmissions: (appletId: string) => AppletSubmission[];

  // Callbacks for integration
  onAppletSubmit?: (appletId: string, data: unknown) => void;
}

const AppletContext = createContext<AppletContextValue | undefined>(undefined);

interface AppletProviderProps {
  children: ReactNode;
  onAppletSubmit?: (appletId: string, data: unknown) => void;
}

export function AppletProvider({ children, onAppletSubmit }: AppletProviderProps) {
  const [activeApplets, setActiveApplets] = useState<ActiveApplet[]>([]);
  const [recentApplets, setRecentApplets] = useState<AppletMetadata[]>([]);
  const [currentApplet, setCurrentApplet] = useState<ActiveApplet | null>(null);

  // Sync state with store
  const syncState = useCallback(() => {
    setActiveApplets(AppletStore.getActiveApplets());
    setRecentApplets(AppletStore.getRecentApplets());
  }, []);

  // Subscribe to store events
  useEffect(() => {
    const unsubscribers = [
      AppletStore.on('applet:created', (applet) => {
        syncState();
        setCurrentApplet(applet);
      }),
      AppletStore.on('applet:closed', () => {
        syncState();
        // Clear current if it was closed
        setCurrentApplet((prev) => {
          if (prev && !AppletStore.isAppletActive(prev.id)) {
            return null;
          }
          return prev;
        });
      }),
      AppletStore.on('applet:minimized', syncState),
      AppletStore.on('applet:maximized', syncState),
      AppletStore.on('applet:state-updated', syncState),
    ];

    // Initial sync
    syncState();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [syncState]);

  // Create a new applet
  const createApplet = useCallback(
    (params: {
      code: string;
      metadata: AppletMetadata;
      filePath?: string;
      volume?: VolumeType;
      initialState?: AppletState;
    }) => {
      return AppletStore.createApplet(params);
    },
    []
  );

  // Close an applet
  const closeApplet = useCallback((id: string) => {
    AppletStore.closeApplet(id);
  }, []);

  // Close all applets
  const closeAllApplets = useCallback(() => {
    AppletStore.clearActiveApplets();
  }, []);

  // Focus an applet
  const focusApplet = useCallback((id: string) => {
    const applet = AppletStore.getApplet(id);
    if (applet) {
      // Restore if minimized
      if (applet.isMinimized) {
        AppletStore.toggleMinimize(id);
      }
      setCurrentApplet(applet);
    }
  }, []);

  // Toggle minimize
  const toggleMinimize = useCallback((id: string) => {
    AppletStore.toggleMinimize(id);
  }, []);

  // Update applet state
  const updateAppletState = useCallback((id: string, state: AppletState) => {
    AppletStore.updateAppletState(id, state);
  }, []);

  // Handle applet submission
  const handleAppletSubmit = useCallback(
    (appletId: string, data: unknown) => {
      AppletStore.recordSubmission(appletId, data);
      if (onAppletSubmit) {
        onAppletSubmit(appletId, data);
      }
    },
    [onAppletSubmit]
  );

  // Get submissions
  const getSubmissions = useCallback((appletId: string) => {
    return AppletStore.getSubmissions(appletId);
  }, []);

  const value: AppletContextValue = {
    activeApplets,
    recentApplets,
    currentApplet,
    createApplet,
    closeApplet,
    closeAllApplets,
    focusApplet,
    toggleMinimize,
    updateAppletState,
    handleAppletSubmit,
    getSubmissions,
    onAppletSubmit,
  };

  return (
    <AppletContext.Provider value={value}>
      {children}
    </AppletContext.Provider>
  );
}

export function useApplets() {
  const context = useContext(AppletContext);
  if (context === undefined) {
    throw new Error('useApplets must be used within an AppletProvider');
  }
  return context;
}

// Hook for checking if we have active applets
export function useHasActiveApplets() {
  const { activeApplets } = useApplets();
  return activeApplets.length > 0;
}

// Hook for getting the current applet
export function useCurrentApplet() {
  const { currentApplet, focusApplet, closeApplet } = useApplets();
  return { currentApplet, focusApplet, closeApplet };
}

export default AppletContext;
