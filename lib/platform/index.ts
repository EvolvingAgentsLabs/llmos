/**
 * Platform API - Hybrid (Desktop + Web)
 *
 * Supports both Electron desktop and browser/Vercel deployment.
 * Automatically detects platform and uses appropriate implementations.
 *
 * Desktop (Electron): Full native capabilities
 * Browser (Vercel): Virtual filesystem, CDN compilers, limited serial
 */

import type {
  FileInfo,
  ASCCompileResult,
  ASCCompileOptions,
  SerialPortInfo,
  SerialPortOptions,
} from '../types/asc-types';

// Platform type (browser or electron)
export type PlatformType = 'browser' | 'electron';

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronSystem !== undefined;
}

/**
 * Check if running in browser (Vercel/web)
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && !isElectron();
}

/**
 * Get current platform type
 */
export function getPlatformType(): PlatformType {
  return isElectron() ? 'electron' : 'browser';
}

/**
 * Platform capabilities
 */
export interface PlatformCapabilities {
  nativeFileSystem: boolean;
  virtualFileSystem: boolean;
  assemblyScript: boolean;
  nativeAssemblyScript: boolean;
  serialPorts: boolean;
  fullSerialPorts: boolean;
  webSerialAPI: boolean;
  nativeMenus: boolean;
  systemDialogs: boolean;
  offlineMode: boolean;
  hardwareDeployment: boolean;
}

/**
 * Get platform capabilities
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const isDesktop = isElectron();
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  return {
    nativeFileSystem: isDesktop,
    virtualFileSystem: true, // Always available via isomorphic-git/lightning-fs
    assemblyScript: true, // Available on both (native or CDN)
    nativeAssemblyScript: isDesktop,
    serialPorts: isDesktop || hasWebSerial,
    fullSerialPorts: isDesktop,
    webSerialAPI: hasWebSerial && !isDesktop,
    nativeMenus: isDesktop,
    systemDialogs: isDesktop,
    offlineMode: isDesktop,
    hardwareDeployment: isDesktop, // Only desktop can deploy to real hardware
  };
}

/**
 * Platform-agnostic File System API
 * Uses native FS in Electron, virtual FS in browser
 */
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

  async mkdir(volumeType: string, dirPath: string): Promise<void> {
    if (isElectron() && window.electronFS) {
      return window.electronFS.mkdir(volumeType, dirPath);
    }
    // Browser fallback: directories are created implicitly when files are written
    // in lightning-fs, so we just ensure the path is valid and do nothing
    // The directory will be created when a file is written to it
    console.debug(`[PlatformFS] mkdir called in browser mode for ${volumeType}:${dirPath} - directories are implicit`);
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

  /**
   * Check if using native or virtual file system
   */
  isNative(): boolean {
    return isElectron();
  },
};

/**
 * Platform-agnostic AssemblyScript Compiler API
 * Uses native compiler in Electron (faster), CDN in browser
 */
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
    return true; // Available on both platforms
  },

  isNative(): boolean {
    return isElectron() && window.electronASC !== undefined;
  },
};

/**
 * Platform-agnostic Serial Port API
 * Full access in Electron, limited Web Serial API in browser
 */
export const PlatformSerial = {
  async list(): Promise<SerialPortInfo[]> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.list();
    }
    // Browser: Web Serial API doesn't support listing without user gesture
    // Return empty array - user must use requestPort()
    return [];
  },

  async connect(portPath: string, options?: SerialPortOptions): Promise<boolean> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.connect(portPath, options);
    }
    // Browser: Would need Web Serial API implementation
    throw new Error(
      'Serial port access requires LLMos Desktop. ' +
      'Web Serial API support coming soon - use the desktop app for hardware programming.'
    );
  },

  async disconnect(portPath: string): Promise<void> {
    if (isElectron() && window.electronSerial) {
      return window.electronSerial.disconnect(portPath);
    }
    // No-op in browser
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

  /**
   * Check if serial ports are available
   */
  isAvailable(): boolean {
    if (isElectron()) {
      return window.electronSerial !== undefined;
    }
    // Check for Web Serial API
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  },

  /**
   * Check if full serial port functionality is available (Electron only)
   */
  hasFullAccess(): boolean {
    return isElectron() && window.electronSerial !== undefined;
  },
};

/**
 * Platform-agnostic System API
 */
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
    return isElectron();
  },

  async openExternal(url: string): Promise<void> {
    if (isElectron() && window.electronSystem) {
      return window.electronSystem.openExternal(url);
    }
    // Browser: open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  onMenuEvent(event: string, callback: (...args: any[]) => void): () => void {
    if (!isElectron() || !window.electronSystem) {
      // No menu events in browser
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

/**
 * Platform info for display
 */
export function getPlatformInfo(): {
  type: PlatformType;
  displayName: string;
  version: string;
  features: string[];
  limitations: string[];
} {
  const isDesktop = isElectron();

  if (isDesktop) {
    return {
      type: 'electron',
      displayName: 'LLMos Desktop',
      version: '1.0.0',
      features: [
        'Native file system access',
        'Native AssemblyScript compilation (faster)',
        'Full serial port communication',
        'Hardware deployment (ESP32)',
        'Offline operation',
        'System menus',
        'Native dialogs',
      ],
      limitations: [],
    };
  }

  return {
    type: 'browser',
    displayName: 'LLMos Web',
    version: '1.0.0',
    features: [
      'Browser-based virtual filesystem',
      'AssemblyScript compilation (CDN)',
      'C to WASM compilation (Wasmer)',
      'Python runtime (Pyodide)',
      '3D robot simulation',
      'AI agent system',
      'Code editor',
    ],
    limitations: [
      'No hardware deployment (use Desktop app)',
      'No native serial port access',
      'Files stored in browser (not persistent across browsers)',
      'Requires internet connection',
    ],
  };
}

// Re-export types
export type { FileInfo, ASCCompileResult, ASCCompileOptions, SerialPortInfo, SerialPortOptions };
