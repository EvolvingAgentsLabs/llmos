/**
 * Platform API - Desktop-First (Phase 1)
 *
 * Simplified for desktop-only builds.
 * Browser support code is preserved below for Phase 2 if needed.
 *
 * For Phase 1: All exports point to desktop-only implementations.
 */

// Desktop-only exports (Phase 1)
export {
  isElectron,
  DesktopFS as PlatformFS,
  DesktopASC as PlatformASC,
  DesktopSerial as PlatformSerial,
  DesktopSystem as PlatformSystem,
  getDesktopCapabilities as getPlatformCapabilities,
  getDesktopInfo as getPlatformInfo,
} from './desktop';

// Re-export types for compatibility
export type { DesktopCapabilities as PlatformCapabilities } from './desktop';

/**
 * Platform type (always 'electron' in Phase 1)
 */
export type PlatformType = 'electron';

/**
 * Get current platform type
 * Always returns 'electron' in desktop builds
 */
export function getPlatformType(): PlatformType {
  return 'electron';
}

/* ============================================================================
 * BROWSER SUPPORT CODE (Phase 2)
 * ============================================================================
 *
 * The code below is preserved for potential Phase 2 browser support.
 * It is commented out for Phase 1 desktop-only builds.
 *
 * To re-enable browser support in Phase 2:
 * 1. Uncomment the code below
 * 2. Update exports above to check platform type
 * 3. Create lib/platform/browser.ts with browser implementations
 * 4. Update build configuration
 *
 * ============================================================================

import type {
  ElectronFSAPI,
  ElectronASCAPI,
  ElectronSerialAPI,
  ElectronSystemAPI,
  FileInfo,
  ASCCompileResult,
  ASCCompileOptions,
  SerialPortInfo,
  SerialPortOptions,
} from '../../electron/types';

// Platform type (browser or electron)
export type PlatformType = 'browser' | 'electron';

// Check if running in Electron
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronSystem !== undefined;
}

// Get current platform type
export function getPlatformType(): PlatformType {
  return isElectron() ? 'electron' : 'browser';
}

// Platform capabilities
export interface PlatformCapabilities {
  nativeFileSystem: boolean;
  assemblyScript: boolean;
  nativeAssemblyScript: boolean;
  serialPorts: boolean;
  fullSerialPorts: boolean;
  nativeMenus: boolean;
  systemDialogs: boolean;
  offlineMode: boolean;
}

// Get platform capabilities
export function getPlatformCapabilities(): PlatformCapabilities {
  const isDesktop = isElectron();

  return {
    nativeFileSystem: isDesktop,
    assemblyScript: true,
    nativeAssemblyScript: isDesktop,
    serialPorts: isDesktop || ('serial' in navigator),
    fullSerialPorts: isDesktop,
    nativeMenus: isDesktop,
    systemDialogs: isDesktop,
    offlineMode: isDesktop,
  };
}

// Platform-agnostic File System API
export const PlatformFS = {
  async read(volumeType: string, filePath: string): Promise<string> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.read(volumeType, filePath);
    }
    // Browser fallback: Virtual File System
    const { getVolumeFileSystem } = await import('../volumes/file-operations');
    const vfs = getVolumeFileSystem();
    return vfs.readFile(volumeType as any, filePath);
  },

  async write(volumeType: string, filePath: string, content: string): Promise<void> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.write(volumeType, filePath, content);
    }
    const { getVolumeFileSystem } = await import('../volumes/file-operations');
    const vfs = getVolumeFileSystem();
    return vfs.writeFile(volumeType as any, filePath, content);
  },

  async delete(volumeType: string, filePath: string): Promise<void> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.delete(volumeType, filePath);
    }
    const { getVolumeFileSystem } = await import('../volumes/file-operations');
    const vfs = getVolumeFileSystem();
    return vfs.deleteFile(volumeType as any, filePath);
  },

  async list(volumeType: string, directory?: string): Promise<FileInfo[] | any[]> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.list(volumeType, directory);
    }
    const { getVolumeFileSystem } = await import('../volumes/file-operations');
    const vfs = getVolumeFileSystem();
    return vfs.listFiles(volumeType as any, directory || '');
  },

  async exists(volumeType: string, filePath: string): Promise<boolean> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.exists(volumeType, filePath);
    }
    const { getVolumeFileSystem } = await import('../volumes/file-operations');
    const vfs = getVolumeFileSystem();
    try {
      await vfs.readFile(volumeType as any, filePath);
      return true;
    } catch {
      return false;
    }
  },

  async openFileDialog(options?: any): Promise<{ canceled: boolean; filePaths: string[] }> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.openFileDialog(options);
    }
    // Browser fallback using file input
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.properties?.includes('openDirectory')) {
        (input as any).webkitdirectory = true;
      }
      if (options?.properties?.includes('multiSelections')) {
        input.multiple = true;
      }
      input.onchange = () => {
        const files = Array.from(input.files || []).map((f) => f.name);
        resolve({ canceled: files.length === 0, filePaths: files });
      };
      input.oncancel = () => resolve({ canceled: true, filePaths: [] });
      input.click();
    });
  },
};

// Platform-agnostic AssemblyScript Compiler API
export const PlatformASC = {
  async compile(source: string, options?: ASCCompileOptions): Promise<ASCCompileResult> {
    // Prefer Electron native compiler (faster, more features)
    if (isElectron() && window.electronASC) {
      return window.electronASC.compile(source, options);
    }

    // Fallback to browser-based compiler
    try {
      const { getBrowserASCCompiler } = await import('../runtime/assemblyscript-compiler');
      const browserCompiler = getBrowserASCCompiler();
      return await browserCompiler.compile(source, options);
    } catch (error: any) {
      return {
        success: false,
        error: 'AssemblyScript compilation failed',
        stderr: error.message || 'Unknown error',
      };
    }
  },

  async getStatus(): Promise<{ ready: boolean; version: string; installed: boolean }> {
    if (isElectron() && window.electronASC) {
      return window.electronASC.getStatus();
    }

    try {
      const { getBrowserASCCompiler } = await import('../runtime/assemblyscript-compiler');
      const browserCompiler = getBrowserASCCompiler();
      return browserCompiler.getStatus();
    } catch {
      return {
        ready: false,
        version: 'N/A',
        installed: false,
      };
    }
  },

  async getVersion(): Promise<string> {
    if (isElectron() && window.electronASC) {
      return window.electronASC.getVersion();
    }

    try {
      const { getBrowserASCCompiler } = await import('../runtime/assemblyscript-compiler');
      const browserCompiler = getBrowserASCCompiler();
      return browserCompiler.getVersion();
    } catch {
      return 'N/A';
    }
  },

  isAvailable(): boolean {
    return true;
  },

  isNative(): boolean {
    return isElectron() && window.electronASC !== undefined;
  },
};

// Platform-agnostic Serial Port API
export const PlatformSerial = {
  async list(): Promise<SerialPortInfo[]> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.list();
    }
    // Browser: Web Serial API doesn't support listing without user gesture
    if ('serial' in navigator) {
      return [];
    }
    return [];
  },

  async connect(portPath: string, options?: SerialPortOptions): Promise<boolean> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.connect(portPath, options);
    }
    throw new Error('Serial port access requires LLMos Desktop or Web Serial API');
  },

  async disconnect(portPath: string): Promise<void> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.disconnect(portPath);
    }
  },

  async write(portPath: string, data: ArrayBuffer | string): Promise<void> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.write(portPath, data);
    }
    throw new Error('Serial port write requires LLMos Desktop');
  },

  async isConnected(portPath: string): Promise<boolean> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.isConnected(portPath);
    }
    return false;
  },

  onData(callback: (portPath: string, data: Uint8Array) => void): () => void {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.onData(callback);
    }
    return () => {};
  },

  isAvailable(): boolean {
    return isElectron() && window.electronSerial !== undefined;
  },
};

// Platform-agnostic System API
export const PlatformSystem = {
  async getPlatform(): Promise<string> {
    if (isElectron() && window.electronSystem) {
      return window.electronSystem.platform();
    }
    // Browser detection
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('win')) return 'win32';
    if (userAgent.includes('mac')) return 'darwin';
    if (userAgent.includes('linux')) return 'linux';
    return 'browser';
  },

  async isDesktop(): Promise<boolean> {
    if (isElectron() && window.electronSystem) {
      return window.electronSystem.isDesktop();
    }
    return false;
  },

  async openExternal(url: string): Promise<void> {
    if (isElectron() && window.electronSystem) {
      return window.electronSystem.openExternal(url);
    }
    window.open(url, '_blank');
  },

  onMenuEvent(event: string, callback: (...args: any[]) => void): () => void {
    if (!isElectron() || !window.electronSystem) {
      return () => {};
    }

    switch (event) {
      case 'openProject':
        return window.electronSystem.onMenuOpenProject(callback);
      case 'exportWasm':
        return window.electronSystem.onMenuExportWasm(callback);
      case 'connectHardware':
        return window.electronSystem.onMenuConnectHardware(callback);
      case 'deployWasm':
        return window.electronSystem.onMenuDeployWasm(callback);
      case 'serialMonitor':
        return window.electronSystem.onMenuSerialMonitor(callback);
      default:
        return () => {};
    }
  },
};

// Platform info for display
export function getPlatformInfo(): {
  type: PlatformType;
  displayName: string;
  version: string;
  features: string[];
} {
  const isDesktop = isElectron();

  return {
    type: isDesktop ? 'electron' : 'browser',
    displayName: isDesktop ? 'LLMos Desktop' : 'LLMos Web',
    version: '1.0.0',
    features: isDesktop
      ? [
          'Native file system access',
          'Native AssemblyScript compilation (faster)',
          'Full serial port communication',
          'Offline operation',
          'System menus',
          'Native dialogs',
        ]
      : [
          'Browser-based virtual filesystem',
          'AssemblyScript compilation (browser CDN)',
          'C to WASM compilation (browser)',
          'Web Serial API (with user gesture)',
          'Online operation',
        ],
  };
}

* ============================================================================
* END OF BROWSER SUPPORT CODE
* ============================================================================ */
