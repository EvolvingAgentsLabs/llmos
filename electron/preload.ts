/**
 * Electron Preload Script
 *
 * Provides a secure bridge between the renderer process (React/Next.js)
 * and the main process (Node.js). Uses contextBridge to expose safe APIs.
 *
 * Security: Only exposes specific methods, not raw IPC or Node.js access.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * File System API
 * Provides native file system access to the renderer
 */
const fileSystemAPI = {
  read: (volumeType: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read', volumeType, filePath),

  write: (volumeType: string, filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write', volumeType, filePath, content),

  delete: (volumeType: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:delete', volumeType, filePath),

  list: (volumeType: string, directory?: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:list', volumeType, directory || ''),

  exists: (volumeType: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', volumeType, filePath),

  mkdir: (volumeType: string, dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:mkdir', volumeType, dirPath),

  // Native dialogs
  openFileDialog: (options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    defaultPath?: string;
    properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
  }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:openFile', options),

  saveFileDialog: (options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    defaultPath?: string;
  }): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('dialog:saveFile', options),
};

/**
 * Serial Port API
 * Hardware communication for ESP32 and other devices
 */
const serialAPI = {
  list: (): Promise<
    Array<{
      path: string;
      manufacturer?: string;
      serialNumber?: string;
      vendorId?: string;
      productId?: string;
    }>
  > => ipcRenderer.invoke('serial:list'),

  connect: (
    portPath: string,
    options?: {
      baudRate?: number;
      dataBits?: 5 | 6 | 7 | 8;
      stopBits?: 1 | 1.5 | 2;
      parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
    }
  ): Promise<boolean> => ipcRenderer.invoke('serial:connect', portPath, options),

  disconnect: (portPath: string): Promise<void> =>
    ipcRenderer.invoke('serial:disconnect', portPath),

  write: (portPath: string, data: ArrayBuffer | string): Promise<void> =>
    ipcRenderer.invoke('serial:write', portPath, data),

  isConnected: (portPath: string): Promise<boolean> =>
    ipcRenderer.invoke('serial:isConnected', portPath),

  // Event listeners
  onData: (callback: (portPath: string, data: Uint8Array) => void): (() => void) => {
    const handler = (_: any, portPath: string, data: Buffer) => {
      callback(portPath, new Uint8Array(data));
    };
    ipcRenderer.on('serial:data', handler);
    return () => ipcRenderer.removeListener('serial:data', handler);
  },

  onError: (callback: (portPath: string, error: string) => void): (() => void) => {
    const handler = (_: any, portPath: string, error: string) => {
      callback(portPath, error);
    };
    ipcRenderer.on('serial:error', handler);
    return () => ipcRenderer.removeListener('serial:error', handler);
  },

  onClose: (callback: (portPath: string) => void): (() => void) => {
    const handler = (_: any, portPath: string) => {
      callback(portPath);
    };
    ipcRenderer.on('serial:close', handler);
    return () => ipcRenderer.removeListener('serial:close', handler);
  },
};

/**
 * System API
 * Platform information and system utilities
 */
const systemAPI = {
  platform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('system:platform'),

  isDesktop: (): Promise<boolean> => ipcRenderer.invoke('system:isDesktop'),

  paths: (): Promise<{
    userData: string;
    documents: string;
    temp: string;
    home: string;
  }> => ipcRenderer.invoke('system:paths'),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('system:openExternal', url),

  // Menu event listeners
  onMenuOpenProject: (callback: (path: string) => void): (() => void) => {
    const handler = (_: any, path: string) => callback(path);
    ipcRenderer.on('menu:openProject', handler);
    return () => ipcRenderer.removeListener('menu:openProject', handler);
  },

  onMenuExportWasm: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:exportWasm', handler);
    return () => ipcRenderer.removeListener('menu:exportWasm', handler);
  },

  onMenuConnectHardware: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:connectHardware', handler);
    return () => ipcRenderer.removeListener('menu:connectHardware', handler);
  },

  onMenuDeployWasm: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:deployWasm', handler);
    return () => ipcRenderer.removeListener('menu:deployWasm', handler);
  },

  onMenuSerialMonitor: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('menu:serialMonitor', handler);
    return () => ipcRenderer.removeListener('menu:serialMonitor', handler);
  },
};

// ============ Expose APIs to Renderer ============

contextBridge.exposeInMainWorld('electronFS', fileSystemAPI);
contextBridge.exposeInMainWorld('electronSerial', serialAPI);
contextBridge.exposeInMainWorld('electronSystem', systemAPI);

// Type declarations for TypeScript support in renderer
export type ElectronFSAPI = typeof fileSystemAPI;
export type ElectronSerialAPI = typeof serialAPI;
export type ElectronSystemAPI = typeof systemAPI;
