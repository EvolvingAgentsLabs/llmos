/**
 * Applet Store - State Management for the Infinite App Store
 *
 * This module manages:
 * - Active applets currently displayed
 * - Applet state persistence
 * - Applet lifecycle events
 * - Session applet history
 */

import {
  AppletMetadata,
  AppletState,
  AppletFile,
  AppletRuntime,
} from '../runtime/applet-runtime';
import { VolumeType } from '../volumes/file-operations';

export interface ActiveApplet {
  id: string;
  code: string;
  metadata: AppletMetadata;
  state: AppletState;
  filePath?: string;
  volume?: VolumeType;
  createdAt: string;
  isMinimized: boolean;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface AppletSubmission {
  appletId: string;
  data: unknown;
  timestamp: string;
}

export interface AppletStoreState {
  activeApplets: Map<string, ActiveApplet>;
  recentApplets: AppletMetadata[];
  submissions: AppletSubmission[];
}

type AppletEventType =
  | 'applet:created'
  | 'applet:closed'
  | 'applet:minimized'
  | 'applet:maximized'
  | 'applet:submitted'
  | 'applet:state-updated'
  | 'applet:code-updated'
  | 'applet:saved';

type AppletEventCallback = (applet: ActiveApplet, data?: unknown) => void;

/**
 * AppletStore - Singleton store for managing applets
 */
class AppletStoreClass {
  private state: AppletStoreState = {
    activeApplets: new Map(),
    recentApplets: [],
    submissions: [],
  };

  private listeners: Map<AppletEventType, Set<AppletEventCallback>> = new Map();
  private maxRecentApplets = 10;
  private storageKey = 'llmos-applet-store';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load persisted state from localStorage
   */
  private loadFromStorage() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.state.recentApplets = data.recentApplets || [];
        // Don't restore active applets - they should be re-opened
      }
    } catch (error) {
      console.warn('Failed to load applet store from storage:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  private saveToStorage() {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          recentApplets: this.state.recentApplets,
        })
      );
    } catch (error) {
      console.warn('Failed to save applet store to storage:', error);
    }
  }

  /**
   * Add an event listener
   */
  on(event: AppletEventType, callback: AppletEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: AppletEventType, applet: ActiveApplet, data?: unknown) {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(applet, data);
      } catch (error) {
        console.error(`Error in applet event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Create a new active applet
   */
  createApplet(params: {
    id?: string;
    code: string;
    metadata: AppletMetadata;
    filePath?: string;
    volume?: VolumeType;
    initialState?: AppletState;
  }): ActiveApplet {
    const applet: ActiveApplet = {
      id: params.id || params.metadata.id,
      code: params.code,
      metadata: params.metadata,
      state: params.initialState || {},
      filePath: params.filePath,
      volume: params.volume,
      createdAt: new Date().toISOString(),
      isMinimized: false,
    };

    console.log('[AppletStore] Creating applet:', applet.id, applet.metadata.name);
    this.state.activeApplets.set(applet.id, applet);
    console.log('[AppletStore] Active applets count:', this.state.activeApplets.size);
    this.addToRecent(applet.metadata);

    const listenerCount = this.listeners.get('applet:created')?.size || 0;
    console.log('[AppletStore] Emitting applet:created event, listeners:', listenerCount);
    this.emit('applet:created', applet);

    return applet;
  }

  /**
   * Get an active applet by ID
   */
  getApplet(id: string): ActiveApplet | undefined {
    return this.state.activeApplets.get(id);
  }

  /**
   * Get all active applets
   */
  getActiveApplets(): ActiveApplet[] {
    return Array.from(this.state.activeApplets.values());
  }

  /**
   * Close an applet
   */
  closeApplet(id: string): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      this.state.activeApplets.delete(id);
      this.emit('applet:closed', applet);
    }
  }

  /**
   * Minimize/restore an applet
   */
  toggleMinimize(id: string): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      applet.isMinimized = !applet.isMinimized;
      this.emit(applet.isMinimized ? 'applet:minimized' : 'applet:maximized', applet);
    }
  }

  /**
   * Update applet state
   */
  updateAppletState(id: string, state: AppletState): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      applet.state = { ...applet.state, ...state };
      this.emit('applet:state-updated', applet, state);
    }
  }

  /**
   * Update applet code
   */
  updateAppletCode(id: string, code: string): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      console.log('[AppletStore] Updating applet code:', id);
      applet.code = code;
      applet.metadata.updatedAt = new Date().toISOString();
      this.emit('applet:code-updated', applet, code);
    }
  }

  /**
   * Record an applet submission
   */
  recordSubmission(appletId: string, data: unknown): void {
    const applet = this.state.activeApplets.get(appletId);
    if (!applet) return;

    const submission: AppletSubmission = {
      appletId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.state.submissions.push(submission);
    this.emit('applet:submitted', applet, data);

    // Keep only last 100 submissions
    if (this.state.submissions.length > 100) {
      this.state.submissions = this.state.submissions.slice(-100);
    }
  }

  /**
   * Get submissions for an applet
   */
  getSubmissions(appletId: string): AppletSubmission[] {
    return this.state.submissions.filter((s) => s.appletId === appletId);
  }

  /**
   * Add to recent applets list
   */
  private addToRecent(metadata: AppletMetadata): void {
    // Remove if already exists
    this.state.recentApplets = this.state.recentApplets.filter((a) => a.id !== metadata.id);

    // Add to front
    this.state.recentApplets.unshift(metadata);

    // Trim to max
    if (this.state.recentApplets.length > this.maxRecentApplets) {
      this.state.recentApplets = this.state.recentApplets.slice(0, this.maxRecentApplets);
    }

    this.saveToStorage();
  }

  /**
   * Get recent applets
   */
  getRecentApplets(): AppletMetadata[] {
    return [...this.state.recentApplets];
  }

  /**
   * Clear all active applets
   */
  clearActiveApplets(): void {
    const applets = Array.from(this.state.activeApplets.values());
    this.state.activeApplets.clear();
    applets.forEach((applet) => this.emit('applet:closed', applet));
  }

  /**
   * Check if an applet is active
   */
  isAppletActive(id: string): boolean {
    return this.state.activeApplets.has(id);
  }

  /**
   * Get applet count
   */
  getActiveCount(): number {
    return this.state.activeApplets.size;
  }

  /**
   * Update applet position (for window management)
   */
  updatePosition(id: string, position: { x: number; y: number }): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      applet.position = position;
    }
  }

  /**
   * Update applet size (for window management)
   */
  updateSize(id: string, size: { width: number; height: number }): void {
    const applet = this.state.activeApplets.get(id);
    if (applet) {
      applet.size = size;
    }
  }
}

// Singleton instance
export const AppletStore = new AppletStoreClass();

// React hook for using the applet store
export function useAppletStore() {
  return AppletStore;
}

export default AppletStore;
