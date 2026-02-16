/**
 * Desktop-Only Platform APIs
 *
 * Simplified platform layer for LLMos Desktop (Electron).
 * No browser fallbacks - requires Electron environment.
 *
 * This is used in Phase 1 (Desktop-first approach).
 * Browser support can be re-added in Phase 2 if needed.
 */

// Types defined locally (no longer imported from deleted asc-types)
interface FileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
}

interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

interface SerialPortOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

/**
 * Check if running in Electron
 * This should always be true in desktop builds
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronSystem !== undefined;
}

/**
 * Assert Electron environment
 * Throws error if not in Electron (desktop-only build)
 */
function assertElectron(feature: string): void {
  if (!isElectron()) {
    throw new Error(
      `${feature} requires LLMos Desktop. ` +
      `Please download the desktop app from llmos.dev/download`
    );
  }
}

/**
 * Desktop File System API
 * Direct access to Electron native file system
 */
export const DesktopFS = {
  async read(volumeType: string, filePath: string): Promise<string> {
    assertElectron('File system');
    return window.electronFS!.read(volumeType, filePath);
  },

  async write(volumeType: string, filePath: string, content: string): Promise<void> {
    assertElectron('File system');
    return window.electronFS!.write(volumeType, filePath, content);
  },

  async delete(volumeType: string, filePath: string): Promise<void> {
    assertElectron('File system');
    return window.electronFS!.delete(volumeType, filePath);
  },

  async list(volumeType: string, directory?: string): Promise<FileInfo[]> {
    assertElectron('File system');
    return window.electronFS!.list(volumeType, directory);
  },

  async exists(volumeType: string, filePath: string): Promise<boolean> {
    assertElectron('File system');
    return window.electronFS!.exists(volumeType, filePath);
  },

  async openFileDialog(options?: any): Promise<{ canceled: boolean; filePaths: string[] }> {
    assertElectron('File dialogs');
    return window.electronFS!.openFileDialog(options);
  },
};

/**
 * Desktop Serial Port API
 * Full native serial port access (no Web Serial limitations)
 */
export const DesktopSerial = {
  async list(): Promise<SerialPortInfo[]> {
    assertElectron('Serial ports');
    return window.electronSerial!.list();
  },

  async connect(portPath: string, options?: SerialPortOptions): Promise<boolean> {
    assertElectron('Serial ports');
    return window.electronSerial!.connect(portPath, options);
  },

  async disconnect(portPath: string): Promise<void> {
    assertElectron('Serial ports');
    return window.electronSerial!.disconnect(portPath);
  },

  async write(portPath: string, data: ArrayBuffer | string): Promise<void> {
    assertElectron('Serial ports');
    return window.electronSerial!.write(portPath, data);
  },

  async isConnected(portPath: string): Promise<boolean> {
    assertElectron('Serial ports');
    return window.electronSerial!.isConnected(portPath);
  },

  onData(callback: (portPath: string, data: Uint8Array) => void): () => void {
    assertElectron('Serial ports');
    return window.electronSerial!.onData(callback);
  },

  isAvailable(): boolean {
    return isElectron() && window.electronSerial !== undefined;
  },
};

/**
 * Desktop System API
 * Native system integration
 */
export const DesktopSystem = {
  async getPlatform(): Promise<string> {
    assertElectron('System info');
    return window.electronSystem!.platform();
  },

  async isDesktop(): Promise<boolean> {
    // Always true in desktop builds
    return true;
  },

  async openExternal(url: string): Promise<void> {
    assertElectron('External links');
    return window.electronSystem!.openExternal(url);
  },

  onMenuEvent(event: string, callback: (...args: any[]) => void): () => void {
    if (!isElectron() || !window.electronSystem) {
      return () => {};
    }

    switch (event) {
      case 'openProject':
        return window.electronSystem.onMenuOpenProject(callback);
      case 'connectHardware':
        return window.electronSystem.onMenuConnectHardware(callback);
      case 'serialMonitor':
        return window.electronSystem.onMenuSerialMonitor(callback);
      default:
        return () => {};
    }
  },
};

/**
 * Desktop platform capabilities
 * All features enabled in desktop mode
 */
export interface DesktopCapabilities {
  nativeFileSystem: boolean;
  serialPorts: boolean;
  fullSerialPorts: boolean;
  nativeMenus: boolean;
  systemDialogs: boolean;
  offlineMode: boolean;
  hardwareDeployment: boolean;
}

export function getDesktopCapabilities(): DesktopCapabilities {
  return {
    nativeFileSystem: true,
    serialPorts: true,
    fullSerialPorts: true,
    nativeMenus: true,
    systemDialogs: true,
    offlineMode: true,
    hardwareDeployment: true,
  };
}

/**
 * Desktop platform info
 */
export function getDesktopInfo(): {
  type: 'electron';
  displayName: string;
  version: string;
  features: string[];
} {
  return {
    type: 'electron',
    displayName: 'LLMos Desktop',
    version: '1.0.0',
    features: [
      'Native file system access',
      'Full serial port communication',
      'Hardware deployment (ESP32)',
      'Offline operation',
      'System menus',
      'Native dialogs',
      'Hardware auto-detection',
    ],
  };
}
