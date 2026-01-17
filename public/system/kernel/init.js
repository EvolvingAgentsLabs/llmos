/**
 * LLMos Kernel Initialization Script
 *
 * This script runs during kernel boot to set up the runtime environment.
 * It is loaded from the system volume and executed before user artifacts.
 */

(function() {
  'use strict';

  console.log('[Kernel] Running init.js...');

  /**
   * Initialize kernel globals
   */
  function initializeGlobals() {
    if (typeof window === 'undefined') {
      return;
    }

    // Ensure kernel object exists
    if (!window.__LLMOS_KERNEL__) {
      window.__LLMOS_KERNEL__ = {};
    }

    const kernel = window.__LLMOS_KERNEL__;

    // Set kernel metadata
    kernel.initialized = true;
    kernel.initTime = Date.now();
    kernel.version = '0.1.0';
    kernel.modules = kernel.modules || {};

    // Create artifact registry
    kernel.artifacts = kernel.artifacts || {
      active: new Map(),
      history: [],

      register(artifactId, metadata) {
        this.active.set(artifactId, {
          id: artifactId,
          ...metadata,
          registeredAt: Date.now(),
          status: 'registered'
        });
      },

      unregister(artifactId) {
        const artifact = this.active.get(artifactId);
        if (artifact) {
          this.history.push({
            ...artifact,
            unregisteredAt: Date.now()
          });
          this.active.delete(artifactId);
        }
      },

      get(artifactId) {
        return this.active.get(artifactId);
      },

      getAll() {
        return Array.from(this.active.values());
      }
    };

    console.log('[Kernel] Globals initialized');
  }

  /**
   * Set up error handling
   */
  function setupErrorHandling() {
    if (typeof window === 'undefined') {
      return;
    }

    const kernel = window.__LLMOS_KERNEL__;

    // Create error registry
    kernel.errors = kernel.errors || {
      list: [],

      capture(error, context = {}) {
        const errorEntry = {
          message: error.message || String(error),
          stack: error.stack || '',
          timestamp: Date.now(),
          context,
          id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        this.list.push(errorEntry);

        // Keep only last 100 errors
        if (this.list.length > 100) {
          this.list.shift();
        }

        return errorEntry;
      },

      get recent() {
        return this.list.slice(-10);
      },

      clear() {
        this.list = [];
      }
    };

    // Global error handler
    window.addEventListener('error', (event) => {
      kernel.errors.capture(event.error || new Error(event.message), {
        type: 'unhandled',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      kernel.errors.capture(
        new Error(event.reason || 'Unhandled promise rejection'),
        { type: 'unhandled-promise' }
      );
    });

    console.log('[Kernel] Error handling initialized');
  }

  /**
   * Set up performance monitoring
   */
  function setupPerformanceMonitoring() {
    if (typeof window === 'undefined' || !window.performance) {
      return;
    }

    const kernel = window.__LLMOS_KERNEL__;

    kernel.performance = kernel.performance || {
      marks: new Map(),
      measures: [],

      mark(name) {
        const time = performance.now();
        this.marks.set(name, time);
        performance.mark(name);
        return time;
      },

      measure(name, startMark, endMark) {
        if (!this.marks.has(startMark) || !this.marks.has(endMark)) {
          console.warn(`[Kernel] Cannot measure ${name}: missing marks`);
          return null;
        }

        const start = this.marks.get(startMark);
        const end = this.marks.get(endMark);
        const duration = end - start;

        const measureEntry = {
          name,
          start,
          end,
          duration,
          timestamp: Date.now()
        };

        this.measures.push(measureEntry);
        return measureEntry;
      },

      getMetrics() {
        return {
          marks: Array.from(this.marks.entries()),
          measures: this.measures,
          memory: performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
          } : null
        };
      }
    };

    // Mark kernel initialization
    kernel.performance.mark('kernel-init-start');

    console.log('[Kernel] Performance monitoring initialized');
  }

  /**
   * Set up API endpoints for kernel communication
   */
  function setupKernelAPI() {
    if (typeof window === 'undefined') {
      return;
    }

    const kernel = window.__LLMOS_KERNEL__;

    // Create kernel API
    kernel.api = kernel.api || {
      /**
       * Get kernel status
       */
      getStatus() {
        return {
          version: kernel.version,
          status: kernel.status,
          uptime: Date.now() - (kernel.bootTime || Date.now()),
          modules: Object.keys(kernel.modules),
          artifacts: kernel.artifacts.getAll().length
        };
      },

      /**
       * Get kernel info (detailed)
       */
      getInfo() {
        return {
          version: kernel.version,
          status: kernel.status,
          bootTime: kernel.bootTime,
          bootDuration: kernel.bootDuration,
          modules: kernel.modules,
          artifacts: kernel.artifacts.getAll(),
          errors: kernel.errors.recent,
          performance: kernel.performance.getMetrics()
        };
      },

      /**
       * Execute artifact (future implementation)
       */
      async executeArtifact(artifactId, code, options = {}) {
        console.log(`[Kernel] Executing artifact ${artifactId}...`);
        // This will be implemented in Milestone 2 (WASM integration)
        throw new Error('Artifact execution not yet implemented');
      },

      /**
       * Register event listener
       */
      on(event, handler) {
        kernel.events = kernel.events || new Map();
        if (!kernel.events.has(event)) {
          kernel.events.set(event, []);
        }
        kernel.events.get(event).push(handler);

        // Return unsubscribe function
        return () => {
          const handlers = kernel.events.get(event);
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        };
      },

      /**
       * Emit event
       */
      emit(event, data) {
        kernel.events = kernel.events || new Map();
        const handlers = kernel.events.get(event) || [];
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            console.error(`[Kernel] Error in event handler for '${event}':`, error);
          }
        });
      }
    };

    console.log('[Kernel] API initialized');
  }

  /**
   * Run initialization
   */
  function initialize() {
    try {
      initializeGlobals();
      setupErrorHandling();
      setupPerformanceMonitoring();
      setupKernelAPI();

      console.log('[Kernel] Initialization complete');

      // Emit ready event
      if (window.__LLMOS_KERNEL__?.api) {
        window.__LLMOS_KERNEL__.api.emit('kernel:initialized', {
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error('[Kernel] Initialization failed:', error);
      throw error;
    }
  }

  // Run initialization
  initialize();

})();
