/**
 * Kernel Boot Loader
 *
 * Orchestrates the OS-like boot sequence:
 * 1. Initialize system
 * 2. Mount volumes
 * 3. Load kernel runtime
 * 4. Initialize Python environment
 * 5. Load standard library
 */

import { logger } from '@/lib/debug/logger';

export interface BootStage {
  name: string;
  description: string;
  duration: number; // Estimated duration in ms
  critical: boolean; // If true, failure stops boot
}

export interface BootProgress {
  stage: BootStage;
  percent: number;
  message: string;
  error?: string;
}

export type BootProgressCallback = (progress: BootProgress) => void;

export interface KernelConfig {
  loadStdLib: boolean;
  systemVolumeUrl?: string;
}

export class KernelBootLoader {
  private stages: BootStage[] = [
    {
      name: 'init',
      description: 'Initializing system',
      duration: 500,
      critical: true,
    },
    {
      name: 'volumes',
      description: 'Mounting volumes',
      duration: 800,
      critical: true,
    },
    // WASM and Python stages removed (cleanup)
    {
      name: 'stdlib',
      description: 'Loading standard library',
      duration: 600,
      critical: false,
    },
    {
      name: 'ready',
      description: 'System ready',
      duration: 300,
      critical: true,
    },
  ];

  private config: KernelConfig;
  private isBooted = false;
  private bootStartTime = 0;

  constructor(config: Partial<KernelConfig> = {}) {
    this.config = {
      loadStdLib: config.loadStdLib ?? true,
      systemVolumeUrl: config.systemVolumeUrl ?? '/system',
    };
  }

  /**
   * Execute the boot sequence
   */
  async boot(onProgress: BootProgressCallback): Promise<void> {
    if (this.isBooted) {
      logger.warn('system', 'Kernel already booted');
      return;
    }

    this.bootStartTime = Date.now();
    logger.boot('Boot sequence', 'start', 'Initializing LLMos kernel');

    let totalTime = 0;
    const allTime = this.stages.reduce((sum, stage) => sum + stage.duration, 0);

    for (const stage of this.stages) {
      const startTime = Date.now();

      // Report progress at start of stage
      onProgress({
        stage,
        percent: (totalTime / allTime) * 100,
        message: `${stage.description}...`,
      });

      try {
        // Execute stage
        await this.executeStage(stage);

        const elapsed = Date.now() - startTime;
        logger.boot(stage.name, 'complete', `${elapsed}ms`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.boot(stage.name, 'error', errorMessage);

        // Report error
        onProgress({
          stage,
          percent: (totalTime / allTime) * 100,
          message: `${stage.description} failed`,
          error: errorMessage,
        });

        // Stop boot if critical stage failed
        if (stage.critical) {
          throw new Error(`Boot failed at critical stage: ${stage.name}`);
        } else {
          logger.warn('system', `Non-critical stage ${stage.name} failed, continuing...`);
        }
      }

      totalTime += stage.duration;
    }

    // Boot complete
    const bootTime = Date.now() - this.bootStartTime;
    logger.success('system', `Boot sequence completed in ${bootTime}ms`);

    onProgress({
      stage: this.stages[this.stages.length - 1],
      percent: 100,
      message: 'System ready',
    });

    this.isBooted = true;
  }

  /**
   * Execute a specific boot stage
   */
  private async executeStage(stage: BootStage): Promise<void> {
    switch (stage.name) {
      case 'init':
        await this.initializeSystem();
        break;

      case 'volumes':
        await this.mountVolumes();
        break;

      case 'stdlib':
        if (this.config.loadStdLib) {
          await this.loadStandardLibrary();
        }
        break;

      case 'ready':
        await this.finalizeSystem();
        break;

      default:
        logger.warn('system', `Unknown boot stage: ${stage.name}`);
    }
  }

  /**
   * Stage 1: Initialize system
   */
  private async initializeSystem(): Promise<void> {
    // Clear any previous kernel state
    if (typeof window !== 'undefined') {
      (window as any).__LLMOS_KERNEL__ = {
        version: '0.1.0',
        bootTime: this.bootStartTime,
        modules: {},
      };
    }

    // Initialize localStorage namespace
    try {
      localStorage.setItem('llmos:kernel:version', '0.1.0');
    } catch (e) {
      logger.warn('system', 'localStorage not available');
    }

    // Simulate initialization work
    await this.sleep(100);
  }

  /**
   * Stage 2: Mount volumes
   */
  private async mountVolumes(): Promise<void> {
    // In a real implementation, this would:
    // 1. Check for configured volume repositories
    // 2. Validate access credentials
    // 3. Mount system, team, and user volumes

    logger.boot('Volumes', 'start', 'Mounting system, team, user');

    // For now, just verify localStorage access
    try {
      localStorage.setItem('llmos:volumes:system', 'mounted');
      localStorage.setItem('llmos:volumes:team', 'mounted');
      localStorage.setItem('llmos:volumes:user', 'mounted');
    } catch (e) {
      throw new Error('Failed to mount volumes: localStorage unavailable');
    }

    await this.sleep(200);
  }

  /**
   * Stage 3: Load standard library
   */
  private async loadStandardLibrary(): Promise<void> {
    logger.boot('StdLib', 'start', 'Loading kernel APIs');

    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Load init.js first (sets up kernel infrastructure)
      await this.loadScript('/system/kernel/init.js');
      logger.debug('system', 'init.js loaded');

      // Load stdlib.js (provides APIs for artifacts)
      await this.loadScript('/system/kernel/stdlib.js');
      logger.debug('system', 'stdlib.js loaded');

      (window as any).__LLMOS_KERNEL__.modules.stdlib = {
        status: 'ready',
        apis: ['dom', 'viz', 'storage', 'quantum', 'utils'],
        loaded: true,
      };
    } catch (error) {
      logger.error('system', 'Failed to load standard library', { error });
      (window as any).__LLMOS_KERNEL__.modules.stdlib = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  /**
   * Load a script from URL
   */
  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = false; // Preserve execution order
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Stage 6: Finalize system
   */
  private async finalizeSystem(): Promise<void> {
    if (typeof window !== 'undefined') {
      const kernel = (window as any).__LLMOS_KERNEL__;
      kernel.status = 'ready';
      kernel.bootComplete = Date.now();
      kernel.bootDuration = kernel.bootComplete - this.bootStartTime;

      logger.success('system', 'Kernel ready', {
        bootDuration: kernel.bootDuration,
        modules: Object.keys(kernel.modules),
      });
    }

    await this.sleep(100);
  }

  /**
   * Check if kernel is booted
   */
  isReady(): boolean {
    return this.isBooted;
  }

  /**
   * Get kernel information
   */
  getInfo(): any {
    if (typeof window === 'undefined') {
      return null;
    }
    return (window as any).__LLMOS_KERNEL__ || null;
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let kernelInstance: KernelBootLoader | null = null;

/**
 * Get or create the global kernel instance
 */
export function getKernel(config?: Partial<KernelConfig>): KernelBootLoader {
  if (!kernelInstance) {
    kernelInstance = new KernelBootLoader(config);
  }
  return kernelInstance;
}

/**
 * Boot the kernel (convenience function)
 */
export async function bootKernel(
  onProgress: BootProgressCallback,
  config?: Partial<KernelConfig>
): Promise<void> {
  const kernel = getKernel(config);
  await kernel.boot(onProgress);
}
