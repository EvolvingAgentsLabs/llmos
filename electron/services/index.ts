/**
 * Electron Services Index
 *
 * Re-exports all services for convenient importing
 */

export { NativeFileSystem } from './native-fs';
export type { VolumeType, FileInfo, NativeFileSystemOptions } from './native-fs';

export { ElectronSerialManager } from './serial-manager';
export type { SerialPortOptions } from './serial-manager';
