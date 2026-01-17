/**
 * Electron Services Index
 *
 * Re-exports all services for convenient importing
 */

export { AssemblyScriptCompiler } from './assemblyscript-compiler';
export type { ASCCompileOptions, ASCCompileResult } from './assemblyscript-compiler';

export { NativeFileSystem } from './native-fs';
export type { VolumeType, FileInfo, NativeFileSystemOptions } from './native-fs';

export { ElectronSerialManager } from './serial-manager';
export type { SerialPortOptions } from './serial-manager';
