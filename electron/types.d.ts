/**
 * Type declarations for Electron APIs exposed via preload
 *
 * These types are available in the renderer process via window.electron*
 */

export interface FileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
}

export interface ElectronFSAPI {
  read(volumeType: string, filePath: string): Promise<string>;
  write(volumeType: string, filePath: string, content: string): Promise<void>;
  delete(volumeType: string, filePath: string): Promise<void>;
  list(volumeType: string, directory?: string): Promise<FileInfo[]>;
  exists(volumeType: string, filePath: string): Promise<boolean>;
  mkdir(volumeType: string, dirPath: string): Promise<void>;

  openFileDialog(options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    defaultPath?: string;
    properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;

  saveFileDialog(options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    defaultPath?: string;
  }): Promise<{ canceled: boolean; filePath?: string }>;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface SerialPortOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

export interface ElectronSerialAPI {
  list(): Promise<SerialPortInfo[]>;
  connect(portPath: string, options?: SerialPortOptions): Promise<boolean>;
  disconnect(portPath: string): Promise<void>;
  write(portPath: string, data: ArrayBuffer | string): Promise<void>;
  isConnected(portPath: string): Promise<boolean>;

  onData(callback: (portPath: string, data: Uint8Array) => void): () => void;
  onError(callback: (portPath: string, error: string) => void): () => void;
  onClose(callback: (portPath: string) => void): () => void;
}

export interface SystemPaths {
  userData: string;
  documents: string;
  temp: string;
  home: string;
}

export interface ElectronSystemAPI {
  platform(): Promise<NodeJS.Platform>;
  isDesktop(): Promise<boolean>;
  paths(): Promise<SystemPaths>;
  openExternal(url: string): Promise<void>;

  onMenuOpenProject(callback: (path: string) => void): () => void;
  onMenuExportWasm(callback: () => void): () => void;
  onMenuConnectHardware(callback: () => void): () => void;
  onMenuDeployWasm(callback: () => void): () => void;
  onMenuSerialMonitor(callback: () => void): () => void;
}

// Extend Window interface
declare global {
  interface Window {
    electronFS?: ElectronFSAPI;
    electronSerial?: ElectronSerialAPI;
    electronSystem?: ElectronSystemAPI;
  }
}

export {};
