/**
 * Desktop Applet Manager
 *
 * Manages which applets are visible on the desktop, organized by regions:
 * - System: Built-in system applets
 * - Team: Shared team applets
 * - Personal: User's personal applets (from projects)
 */

import { VolumeType } from '../volumes/file-operations';

export interface DesktopApplet {
  id: string;
  name: string;
  description?: string;
  filePath: string;
  volume: VolumeType;
  icon?: string;
  createdAt: string;
  isActive?: boolean;
}

export interface DesktopRegions {
  system: DesktopApplet[];
  team: DesktopApplet[];
  personal: DesktopApplet[];
}

type DesktopEventType =
  | 'applet:added'
  | 'applet:removed'
  | 'applet:updated'
  | 'regions:changed';

type DesktopEventCallback = (applet?: DesktopApplet, region?: VolumeType) => void;

const STORAGE_KEY = 'llmos-desktop-applets';

/**
 * DesktopAppletManager - Singleton for managing desktop applets
 */
class DesktopAppletManagerClass {
  private regions: DesktopRegions = {
    system: [],
    team: [],
    personal: [],
  };

  private listeners: Map<DesktopEventType, Set<DesktopEventCallback>> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load persisted state from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.regions = {
          system: data.system || [],
          team: data.team || [],
          personal: data.personal || [],
        };
      }
    } catch (error) {
      console.warn('Failed to load desktop applets from storage:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.regions));
    } catch (error) {
      console.warn('Failed to save desktop applets to storage:', error);
    }
  }

  /**
   * Add an event listener
   */
  on(event: DesktopEventType, callback: DesktopEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: DesktopEventType, applet?: DesktopApplet, region?: VolumeType): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(applet, region);
      } catch (error) {
        console.error(`Error in desktop event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Map volume type to region key
   */
  private volumeToRegion(volume: VolumeType): keyof DesktopRegions {
    switch (volume) {
      case 'system':
        return 'system';
      case 'team':
        return 'team';
      case 'user':
      default:
        return 'personal';
    }
  }

  /**
   * Add an applet to the desktop
   */
  addApplet(applet: DesktopApplet): void {
    const region = this.volumeToRegion(applet.volume);

    // Check if applet already exists
    const existingIndex = this.regions[region].findIndex(a => a.id === applet.id);
    if (existingIndex >= 0) {
      // Update existing
      this.regions[region][existingIndex] = { ...applet };
      this.emit('applet:updated', applet, applet.volume);
    } else {
      // Add new
      this.regions[region].push(applet);
      this.emit('applet:added', applet, applet.volume);
    }

    this.saveToStorage();
    this.emit('regions:changed');
  }

  /**
   * Remove an applet from the desktop
   */
  removeApplet(appletId: string, volume?: VolumeType): void {
    let removed = false;
    let removedApplet: DesktopApplet | undefined;

    if (volume) {
      const region = this.volumeToRegion(volume);
      const index = this.regions[region].findIndex(a => a.id === appletId);
      if (index >= 0) {
        removedApplet = this.regions[region][index];
        this.regions[region].splice(index, 1);
        removed = true;
      }
    } else {
      // Search all regions
      for (const regionKey of ['system', 'team', 'personal'] as const) {
        const index = this.regions[regionKey].findIndex(a => a.id === appletId);
        if (index >= 0) {
          removedApplet = this.regions[regionKey][index];
          this.regions[regionKey].splice(index, 1);
          removed = true;
          break;
        }
      }
    }

    if (removed && removedApplet) {
      this.saveToStorage();
      this.emit('applet:removed', removedApplet, volume);
      this.emit('regions:changed');
    }
  }

  /**
   * Remove applet by file path
   */
  removeAppletByPath(filePath: string): void {
    let removed = false;

    for (const regionKey of ['system', 'team', 'personal'] as const) {
      const index = this.regions[regionKey].findIndex(a => a.filePath === filePath);
      if (index >= 0) {
        const removedApplet = this.regions[regionKey][index];
        this.regions[regionKey].splice(index, 1);
        removed = true;
        this.emit('applet:removed', removedApplet);
        break;
      }
    }

    if (removed) {
      this.saveToStorage();
      this.emit('regions:changed');
    }
  }

  /**
   * Get all applets in a specific region
   */
  getAppletsByRegion(region: keyof DesktopRegions): DesktopApplet[] {
    return [...this.regions[region]];
  }

  /**
   * Get all regions
   */
  getAllRegions(): DesktopRegions {
    return {
      system: [...this.regions.system],
      team: [...this.regions.team],
      personal: [...this.regions.personal],
    };
  }

  /**
   * Check if an applet is on the desktop
   */
  hasApplet(appletId: string): boolean {
    return (
      this.regions.system.some(a => a.id === appletId) ||
      this.regions.team.some(a => a.id === appletId) ||
      this.regions.personal.some(a => a.id === appletId)
    );
  }

  /**
   * Find applet by file path
   */
  findAppletByPath(filePath: string): DesktopApplet | undefined {
    for (const regionKey of ['system', 'team', 'personal'] as const) {
      const applet = this.regions[regionKey].find(a => a.filePath === filePath);
      if (applet) return applet;
    }
    return undefined;
  }

  /**
   * Clear all applets from a region
   */
  clearRegion(region: keyof DesktopRegions): void {
    this.regions[region] = [];
    this.saveToStorage();
    this.emit('regions:changed');
  }

  /**
   * Clear all applets
   */
  clearAll(): void {
    this.regions = {
      system: [],
      team: [],
      personal: [],
    };
    this.saveToStorage();
    this.emit('regions:changed');
  }

  /**
   * Get total count of desktop applets
   */
  getTotalCount(): number {
    return (
      this.regions.system.length +
      this.regions.team.length +
      this.regions.personal.length
    );
  }

  /**
   * Mark applet as active (currently running)
   */
  setAppletActive(appletId: string, isActive: boolean): void {
    for (const regionKey of ['system', 'team', 'personal'] as const) {
      const applet = this.regions[regionKey].find(a => a.id === appletId);
      if (applet) {
        applet.isActive = isActive;
        this.emit('applet:updated', applet);
        break;
      }
    }
  }
}

// Singleton instance
export const DesktopAppletManager = new DesktopAppletManagerClass();

export default DesktopAppletManager;
