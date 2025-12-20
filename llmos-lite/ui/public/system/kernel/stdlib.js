/**
 * LLMos Standard Library v0.1.0
 *
 * Provides safe, sandboxed APIs for artifacts to interact with the system.
 * This library is loaded during kernel boot and injected into artifact execution contexts.
 */

(function(global) {
  'use strict';

  /**
   * LLMos Standard Library
   */
  const LLMOS = {
    version: '0.1.0',

    /**
     * DOM Utilities (Safe, sandboxed DOM operations)
     */
    dom: {
      /**
       * Create an element with safe defaults
       */
      createElement(tag, props = {}) {
        const allowedTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'canvas', 'svg', 'button', 'input'];

        if (!allowedTags.includes(tag)) {
          throw new Error(`Tag '${tag}' is not allowed. Allowed tags: ${allowedTags.join(', ')}`);
        }

        const element = document.createElement(tag);

        // Apply safe properties
        const safeProps = ['id', 'className', 'textContent', 'width', 'height', 'style'];
        for (const [key, value] of Object.entries(props)) {
          if (safeProps.includes(key) || key.startsWith('data-')) {
            if (key === 'className') {
              element.className = value;
            } else if (key === 'style' && typeof value === 'object') {
              Object.assign(element.style, value);
            } else {
              element[key] = value;
            }
          }
        }

        return element;
      },

      /**
       * Query selector (scoped to artifact container)
       */
      querySelector(selector) {
        // This will be enhanced to scope to artifact container
        // For now, allow basic queries
        return document.querySelector(selector);
      },

      /**
       * Add event listener with automatic cleanup
       */
      on(element, event, handler) {
        element.addEventListener(event, handler);
        return () => element.removeEventListener(event, handler);
      }
    },

    /**
     * Visualization Utilities
     */
    viz: {
      /**
       * Create a canvas for drawing
       */
      createCanvas(width = 800, height = 600) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(width, 2000); // Safety limit
        canvas.height = Math.min(height, 2000);
        return canvas;
      },

      /**
       * Simple plotting helper (wraps external library)
       */
      plot(data, options = {}) {
        console.log('[LLMOS.viz] Plotting data:', data);
        // Future: Integrate with Chart.js or similar
        return {
          data,
          options,
          render: (container) => {
            container.textContent = 'Plotting support coming soon';
          }
        };
      },

      /**
       * Render quantum circuit (integration point)
       */
      renderQuantumCircuit(circuitData) {
        console.log('[LLMOS.viz] Rendering quantum circuit:', circuitData);
        // Future: Call existing CircuitRenderer
        return {
          circuitData,
          render: (container) => {
            container.textContent = 'Quantum circuit rendering coming soon';
          }
        };
      }
    },

    /**
     * Storage Utilities (Scoped to artifact)
     */
    storage: {
      _prefix: 'llmos:artifact:',

      /**
       * Get item from storage
       */
      async get(key) {
        const fullKey = this._prefix + key;
        const value = localStorage.getItem(fullKey);
        return value ? JSON.parse(value) : null;
      },

      /**
       * Set item in storage
       */
      async set(key, value) {
        const fullKey = this._prefix + key;
        localStorage.setItem(fullKey, JSON.stringify(value));
      },

      /**
       * Remove item from storage
       */
      async remove(key) {
        const fullKey = this._prefix + key;
        localStorage.removeItem(fullKey);
      },

      /**
       * Clear all artifact storage
       */
      async clear() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(this._prefix));
        keys.forEach(k => localStorage.removeItem(k));
      }
    },

    /**
     * Logging Utilities
     */
    log: {
      info(message, ...args) {
        console.log('[Artifact]', message, ...args);
      },

      warn(message, ...args) {
        console.warn('[Artifact]', message, ...args);
      },

      error(message, ...args) {
        console.error('[Artifact]', message, ...args);
      },

      debug(message, ...args) {
        console.debug('[Artifact]', message, ...args);
      }
    },

    /**
     * Quantum Computing Utilities
     */
    quantum: {
      /**
       * Create a quantum circuit structure
       */
      createCircuit(numQubits) {
        return {
          numQubits,
          gates: [],
          measurements: [],

          // Add gate to circuit
          addGate(type, target, control, params) {
            this.gates.push({
              type,
              target,
              control,
              params: params || [],
              time: this.gates.length
            });
            return this;
          },

          // Add measurement
          measure(qubit) {
            this.measurements.push(qubit);
            return this;
          },

          // Export for visualization
          toJSON() {
            return {
              numQubits: this.numQubits,
              gates: this.gates,
              measurements: this.measurements
            };
          }
        };
      },

      /**
       * Common quantum gates
       */
      gates: {
        H: 'hadamard',
        X: 'pauli-x',
        Y: 'pauli-y',
        Z: 'pauli-z',
        CNOT: 'cnot',
        RX: 'rotation-x',
        RY: 'rotation-y',
        RZ: 'rotation-z'
      }
    },

    /**
     * Utility Functions
     */
    utils: {
      /**
       * Sleep for specified milliseconds
       */
      sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      },

      /**
       * Generate unique ID
       */
      uid() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      },

      /**
       * Clamp value between min and max
       */
      clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
      },

      /**
       * Linear interpolation
       */
      lerp(start, end, t) {
        return start + (end - start) * t;
      }
    }
  };

  // Export to global scope
  global.LLMOS = LLMOS;

  // Also export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LLMOS;
  }

  console.log('[LLMOS] Standard library v0.1.0 loaded');

})(typeof window !== 'undefined' ? window : global);
