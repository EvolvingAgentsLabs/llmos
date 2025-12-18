/**
 * Pyodide Preloader - Load Pyodide and common packages on app startup
 *
 * This module preloads Pyodide and commonly used packages to improve
 * the first execution time. Instead of waiting 5-10s on first run,
 * we load everything during app initialization.
 */

import { getPyodideRuntime } from './pyodide-runtime';

export interface PreloadProgress {
  stage: 'idle' | 'loading-pyodide' | 'loading-packages' | 'complete' | 'error';
  progress: number; // 0-100
  currentPackage?: string;
  message: string;
  error?: string;
}

export type PreloadProgressCallback = (progress: PreloadProgress) => void;

/**
 * Common packages to preload for tools and agents
 */
const COMMON_PACKAGES = [
  // Scientific computing
  'numpy',
  'pandas',

  // Visualization
  'matplotlib',
  'plotly',

  // Quantum computing
  'qiskit',

  // Machine learning (lightweight)
  'scikit-learn',
];

/**
 * Preloader class - manages background loading of Pyodide
 */
class PyodidePreloader {
  private isPreloading = false;
  private isPreloaded = false;
  private preloadError: Error | null = null;
  private progressCallbacks: Set<PreloadProgressCallback> = new Set();

  /**
   * Start preloading Pyodide and common packages
   */
  async preload(options: {
    packages?: string[];
    onProgress?: PreloadProgressCallback;
  } = {}): Promise<void> {
    if (this.isPreloaded) {
      console.log('✓ Pyodide already preloaded');
      return;
    }

    if (this.isPreloading) {
      console.log('⏳ Pyodide preload already in progress');
      return;
    }

    this.isPreloading = true;

    const { packages = COMMON_PACKAGES, onProgress } = options;

    if (onProgress) {
      this.progressCallbacks.add(onProgress);
    }

    try {
      // Stage 1: Load Pyodide runtime
      this.notifyProgress({
        stage: 'loading-pyodide',
        progress: 10,
        message: 'Loading Pyodide runtime...',
      });

      const runtime = getPyodideRuntime();
      await runtime.initialize();

      this.notifyProgress({
        stage: 'loading-pyodide',
        progress: 30,
        message: 'Pyodide runtime ready',
      });

      // Stage 2: Load common packages
      this.notifyProgress({
        stage: 'loading-packages',
        progress: 40,
        message: 'Loading common packages...',
      });

      const packagesToLoad = packages.filter(pkg => {
        // Filter out packages that might not be available in Pyodide
        return true; // For now, try all
      });

      const progressPerPackage = 60 / packagesToLoad.length;
      let currentProgress = 40;

      for (let i = 0; i < packagesToLoad.length; i++) {
        const pkg = packagesToLoad[i];

        this.notifyProgress({
          stage: 'loading-packages',
          progress: currentProgress,
          currentPackage: pkg,
          message: `Loading package: ${pkg}...`,
        });

        try {
          await runtime.loadPackage(pkg);
          console.log(`✓ Preloaded package: ${pkg}`);
        } catch (error) {
          // Some packages might not be available - that's okay
          console.warn(`⚠ Could not preload package: ${pkg}`, error);
        }

        currentProgress += progressPerPackage;
      }

      // Stage 3: Complete
      this.notifyProgress({
        stage: 'complete',
        progress: 100,
        message: 'Pyodide preloaded successfully',
      });

      this.isPreloaded = true;
      this.isPreloading = false;

      console.log('✓ Pyodide preload complete');
    } catch (error: any) {
      this.preloadError = error;
      this.isPreloading = false;

      this.notifyProgress({
        stage: 'error',
        progress: 0,
        message: 'Failed to preload Pyodide',
        error: error.message || String(error),
      });

      console.error('✗ Pyodide preload failed:', error);
      throw error;
    } finally {
      // Clear progress callbacks after completion
      if (onProgress) {
        this.progressCallbacks.delete(onProgress);
      }
    }
  }

  /**
   * Subscribe to preload progress updates
   */
  onProgress(callback: PreloadProgressCallback): () => void {
    this.progressCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.progressCallbacks.delete(callback);
    };
  }

  /**
   * Get current preload status
   */
  getStatus(): {
    isPreloading: boolean;
    isPreloaded: boolean;
    error: Error | null;
  } {
    return {
      isPreloading: this.isPreloading,
      isPreloaded: this.isPreloaded,
      error: this.preloadError,
    };
  }

  /**
   * Reset preloader (useful for testing or manual reloads)
   */
  reset(): void {
    this.isPreloading = false;
    this.isPreloaded = false;
    this.preloadError = null;
    this.progressCallbacks.clear();
  }

  private notifyProgress(progress: PreloadProgress): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in preload progress callback:', error);
      }
    });
  }
}

/**
 * Global preloader instance
 */
let preloaderInstance: PyodidePreloader | null = null;

export function getPyodidePreloader(): PyodidePreloader {
  if (!preloaderInstance) {
    preloaderInstance = new PyodidePreloader();
  }
  return preloaderInstance;
}

/**
 * Convenience function to start preloading
 */
export async function startPyodidePreload(
  options?: {
    packages?: string[];
    onProgress?: PreloadProgressCallback;
  }
): Promise<void> {
  const preloader = getPyodidePreloader();
  return preloader.preload(options);
}

/**
 * Hook-friendly preload status
 */
export function usePyodidePreloadStatus(): {
  isPreloading: boolean;
  isPreloaded: boolean;
  error: Error | null;
} {
  const preloader = getPyodidePreloader();
  return preloader.getStatus();
}

/**
 * Check if Pyodide is ready (preloaded or can be loaded quickly)
 */
export function isPyodideReady(): boolean {
  const preloader = getPyodidePreloader();
  const status = preloader.getStatus();
  return status.isPreloaded && !status.error;
}
