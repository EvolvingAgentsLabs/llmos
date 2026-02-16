/**
 * Kernel API
 *
 * Provides safe, sandboxed APIs for artifacts running in the WASM environment.
 * These APIs are injected into the QuickJS context.
 */

// WASM runtime removed — stub type for compatibility
type WASMRuntime = any;

export interface KernelAPI {
  version: string;
  dom: DOMAdapter;
  viz: VisualizationAPI;
  storage: StorageAPI;
  log: LogAPI;
  quantum: QuantumAPI;
  utils: UtilsAPI;
}

/**
 * Inject the Kernel API into a WASM runtime
 */
export async function injectKernelAPI(
  runtime: WASMRuntime,
  artifactId: string
): Promise<void> {
  console.log(`[KernelAPI] Injecting API for artifact ${artifactId}`);

  // Create scoped API instances
  const domAdapter = new DOMAdapter(artifactId);
  const vizAPI = new VisualizationAPI(artifactId);
  const storageAPI = new StorageAPI(artifactId);
  const logAPI = new LogAPI(artifactId);
  const quantumAPI = new QuantumAPI();
  const utilsAPI = new UtilsAPI();

  // Inject DOM API
  runtime.injectFunction('__dom_createElement', domAdapter.createElement.bind(domAdapter));
  runtime.injectFunction('__dom_querySelector', domAdapter.querySelector.bind(domAdapter));
  runtime.injectFunction('__dom_setInnerHTML', domAdapter.setInnerHTML.bind(domAdapter));

  // Inject Visualization API
  runtime.injectFunction('__viz_createCanvas', vizAPI.createCanvas.bind(vizAPI));
  runtime.injectFunction('__viz_plot', vizAPI.plot.bind(vizAPI));

  // Inject Storage API
  runtime.injectFunction('__storage_get', storageAPI.get.bind(storageAPI));
  runtime.injectFunction('__storage_set', storageAPI.set.bind(storageAPI));
  runtime.injectFunction('__storage_remove', storageAPI.remove.bind(storageAPI));

  // Inject Log API
  runtime.injectFunction('__log_info', logAPI.info.bind(logAPI));
  runtime.injectFunction('__log_warn', logAPI.warn.bind(logAPI));
  runtime.injectFunction('__log_error', logAPI.error.bind(logAPI));

  // Inject Quantum API
  runtime.injectFunction('__quantum_createCircuit', quantumAPI.createCircuit.bind(quantumAPI));

  // Inject Utils API
  runtime.injectFunction('__utils_sleep', utilsAPI.sleep.bind(utilsAPI));
  runtime.injectFunction('__utils_uid', utilsAPI.uid.bind(utilsAPI));

  // Create the LLMOS global object in the sandbox
  await runtime.execute(`
    const LLMOS = {
      version: '0.1.0',

      dom: {
        createElement: (tag, props) => __dom_createElement(tag, JSON.stringify(props || {})),
        querySelector: (selector) => __dom_querySelector(selector),
        setInnerHTML: (selector, html) => __dom_setInnerHTML(selector, html)
      },

      viz: {
        createCanvas: (width, height) => __viz_createCanvas(width, height),
        plot: (data, options) => __viz_plot(JSON.stringify(data), JSON.stringify(options || {}))
      },

      storage: {
        get: async (key) => __storage_get(key),
        set: async (key, value) => __storage_set(key, JSON.stringify(value)),
        remove: async (key) => __storage_remove(key)
      },

      log: {
        info: (...args) => __log_info(args.map(String).join(' ')),
        warn: (...args) => __log_warn(args.map(String).join(' ')),
        error: (...args) => __log_error(args.map(String).join(' '))
      },

      quantum: {
        createCircuit: (numQubits) => __quantum_createCircuit(numQubits)
      },

      utils: {
        sleep: (ms) => __utils_sleep(ms),
        uid: () => __utils_uid(),
        clamp: (value, min, max) => Math.min(Math.max(value, min), max),
        lerp: (start, end, t) => start + (end - start) * t
      }
    };

    // Also inject as global for backward compatibility
    globalThis.LLMOS = LLMOS;
  `);

  console.log(`[KernelAPI] API injection complete for artifact ${artifactId}`);
}

/**
 * DOM Adapter - Safe DOM operations
 */
class DOMAdapter {
  private artifactId: string;
  private allowedTags = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'canvas', 'svg', 'button'];

  constructor(artifactId: string) {
    this.artifactId = artifactId;
  }

  createElement(tag: string, propsJson: string): string {
    if (!this.allowedTags.includes(tag)) {
      throw new Error(`Tag '${tag}' is not allowed`);
    }

    try {
      const props = JSON.parse(propsJson);
      const element = document.createElement(tag);

      // Apply safe properties
      if (props.id) element.id = props.id;
      if (props.className) element.className = props.className;
      if (props.textContent) element.textContent = props.textContent;

      return `Created ${tag} element`;
    } catch (error) {
      throw new Error(`Failed to create element: ${error}`);
    }
  }

  querySelector(selector: string): string {
    // Scope to artifact container
    const container = document.querySelector(`#artifact-${this.artifactId}`);
    if (!container) {
      return 'Container not found';
    }

    const element = container.querySelector(selector);
    return element ? 'Element found' : 'Element not found';
  }

  setInnerHTML(selector: string, html: string): void {
    const container = document.querySelector(`#artifact-${this.artifactId}`);
    if (!container) {
      throw new Error('Container not found');
    }

    const element = container.querySelector(selector);
    if (element) {
      // Sanitize HTML (basic - should use DOMPurify in production)
      element.innerHTML = html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    }
  }
}

/**
 * Visualization API
 */
class VisualizationAPI {
  private artifactId: string;

  constructor(artifactId: string) {
    this.artifactId = artifactId;
  }

  createCanvas(width: number, height: number): string {
    const safeWidth = Math.min(width, 2000);
    const safeHeight = Math.min(height, 2000);

    return `Canvas ${safeWidth}x${safeHeight} created`;
  }

  plot(dataJson: string, optionsJson: string): string {
    try {
      const data = JSON.parse(dataJson);
      const options = JSON.parse(optionsJson);

      console.log('[VizAPI] Plot requested:', { data, options });

      return 'Plot created';
    } catch (error) {
      throw new Error(`Failed to create plot: ${error}`);
    }
  }
}

/**
 * Storage API - Scoped to artifact
 */
class StorageAPI {
  private prefix: string;

  constructor(artifactId: string) {
    this.prefix = `llmos:artifact:${artifactId}:`;
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = localStorage.getItem(this.prefix + key);
      return value;
    } catch (error) {
      console.error('[StorageAPI] Get failed:', error);
      return null;
    }
  }

  async set(key: string, valueJson: string): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, valueJson);
    } catch (error) {
      console.error('[StorageAPI] Set failed:', error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('[StorageAPI] Remove failed:', error);
    }
  }
}

/**
 * Log API
 */
class LogAPI {
  private artifactId: string;

  constructor(artifactId: string) {
    this.artifactId = artifactId;
  }

  info(message: string): void {
    console.log(`[Artifact ${this.artifactId}]`, message);
  }

  warn(message: string): void {
    console.warn(`[Artifact ${this.artifactId}]`, message);
  }

  error(message: string): void {
    console.error(`[Artifact ${this.artifactId}]`, message);
  }
}

/**
 * Quantum API
 */
class QuantumAPI {
  createCircuit(numQubits: number): string {
    if (numQubits < 1 || numQubits > 20) {
      throw new Error('Number of qubits must be between 1 and 20');
    }

    return JSON.stringify({
      numQubits,
      gates: [],
      measurements: [],
    });
  }
}

/**
 * Utils API
 */
class UtilsAPI {
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10000)));
  }

  uid(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
