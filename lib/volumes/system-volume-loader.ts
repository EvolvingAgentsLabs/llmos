/**
 * System Volume Loader - Client-side only
 *
 * Fetches system volume files from /public/volumes/system/ on first load
 * and caches them in the browser's VFS (localStorage).
 *
 * This enables:
 * - Full offline support after initial load
 * - Privacy - all files stay in the browser
 * - Scalability - no server storage needed
 */

import { getVFS } from '@/lib/virtual-fs';

interface ManifestFile {
  path: string;
  type: 'agent' | 'tool' | 'skill' | 'template';
  name: string;
  description: string;
}

interface SystemManifest {
  version: string;
  volume: string;
  description: string;
  readonly: boolean;
  files: ManifestFile[];
}

const SYSTEM_VOLUME_VERSION_KEY = 'llmos:system-volume-version';
const SYSTEM_VOLUME_LOADED_KEY = 'llmos:system-volume-loaded';

/**
 * Check if system volume needs to be loaded/updated
 */
export async function checkSystemVolumeStatus(): Promise<{
  needsLoad: boolean;
  currentVersion: string | null;
  remoteVersion: string | null;
}> {
  if (typeof window === 'undefined') {
    return { needsLoad: false, currentVersion: null, remoteVersion: null };
  }

  const currentVersion = localStorage.getItem(SYSTEM_VOLUME_VERSION_KEY);
  const isLoaded = localStorage.getItem(SYSTEM_VOLUME_LOADED_KEY) === 'true';

  try {
    const response = await fetch('/volumes/system/manifest.json');
    if (!response.ok) {
      console.warn('[SystemVolumeLoader] Failed to fetch manifest');
      return { needsLoad: !isLoaded, currentVersion, remoteVersion: null };
    }

    const manifest: SystemManifest = await response.json();
    const remoteVersion = manifest.version;

    // Need to load if never loaded or version changed
    const needsLoad = !isLoaded || currentVersion !== remoteVersion;

    return { needsLoad, currentVersion, remoteVersion };
  } catch (error) {
    console.error('[SystemVolumeLoader] Error checking status:', error);
    return { needsLoad: !isLoaded, currentVersion, remoteVersion: null };
  }
}

/**
 * Load system volume files into VFS
 */
export async function loadSystemVolume(
  onProgress?: (loaded: number, total: number, file: string) => void
): Promise<{ success: boolean; filesLoaded: number; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, filesLoaded: 0, error: 'Not in browser context' };
  }

  try {
    // Fetch manifest
    const manifestResponse = await fetch('/volumes/system/manifest.json');
    if (!manifestResponse.ok) {
      return { success: false, filesLoaded: 0, error: 'Failed to fetch manifest' };
    }

    const manifest: SystemManifest = await manifestResponse.json();
    const vfs = getVFS();
    let filesLoaded = 0;

    // Fetch and cache each file
    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const filePath = `system/${file.path}`;

      try {
        onProgress?.(i, manifest.files.length, file.path);

        const fileResponse = await fetch(`/volumes/system/${file.path}`);
        if (fileResponse.ok) {
          const content = await fileResponse.text();
          vfs.writeFile(filePath, content);
          filesLoaded++;
        } else {
          console.warn(`[SystemVolumeLoader] Failed to fetch: ${file.path}`);
        }
      } catch (fileError) {
        console.error(`[SystemVolumeLoader] Error loading ${file.path}:`, fileError);
      }
    }

    // Mark as loaded and save version
    localStorage.setItem(SYSTEM_VOLUME_VERSION_KEY, manifest.version);
    localStorage.setItem(SYSTEM_VOLUME_LOADED_KEY, 'true');

    onProgress?.(manifest.files.length, manifest.files.length, 'Complete');

    console.log(`[SystemVolumeLoader] Loaded ${filesLoaded}/${manifest.files.length} files`);
    return { success: true, filesLoaded };
  } catch (error) {
    console.error('[SystemVolumeLoader] Error loading system volume:', error);
    return {
      success: false,
      filesLoaded: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the system volume manifest (from cache or fetch)
 */
export async function getSystemManifest(): Promise<SystemManifest | null> {
  if (typeof window === 'undefined') return null;

  try {
    const response = await fetch('/volumes/system/manifest.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('[SystemVolumeLoader] Error fetching manifest:', error);
  }
  return null;
}

/**
 * Force reload the system volume (clear cache and reload)
 */
export async function forceReloadSystemVolume(
  onProgress?: (loaded: number, total: number, file: string) => void
): Promise<{ success: boolean; filesLoaded: number; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, filesLoaded: 0, error: 'Not in browser context' };
  }

  // Clear version markers to force reload
  localStorage.removeItem(SYSTEM_VOLUME_VERSION_KEY);
  localStorage.removeItem(SYSTEM_VOLUME_LOADED_KEY);

  // Clear existing system files from VFS
  const vfs = getVFS();
  const allFiles = vfs.getAllFiles();
  for (const file of allFiles) {
    if (file.path.startsWith('system/')) {
      vfs.deleteFile(file.path);
    }
  }

  return loadSystemVolume(onProgress);
}

/**
 * Initialize system volume on app start
 * Call this in a useEffect or app initialization
 */
export async function initializeSystemVolume(): Promise<void> {
  const status = await checkSystemVolumeStatus();

  if (status.needsLoad) {
    console.log('[SystemVolumeLoader] Loading system volume...');
    const result = await loadSystemVolume();
    if (result.success) {
      console.log(`[SystemVolumeLoader] System volume ready (${result.filesLoaded} files)`);
    } else {
      console.error('[SystemVolumeLoader] Failed to load system volume:', result.error);
    }
  } else {
    console.log('[SystemVolumeLoader] System volume already cached');
  }
}
