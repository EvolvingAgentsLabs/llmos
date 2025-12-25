/**
 * Pyodide Runner for LLMos-Lite
 *
 * Manages WebAssembly-based Python execution in the browser.
 * Used for running Python skills (Quantum, Data Science, etc.) client-side.
 */

class PyodideRunner {
  private pyodide: any | null = null;
  private loading: boolean = false;
  private loadPromise: Promise<any> | null = null;

  /**
   * Initialize Pyodide (lazy loading)
   */
  async init(): Promise<any> {
    if (this.pyodide) {
      return this.pyodide;
    }

    if (this.loading && this.loadPromise) {
      return this.loadPromise;
    }

    this.loading = true;
    this.loadPromise = this.loadPyodide();

    return this.loadPromise;
  }

  private async loadPyodide(): Promise<any> {
    console.log('[Pyodide] Loading...');

    // Load Pyodide via script tag (more reliable in Next.js)
    if (typeof window !== 'undefined' && !(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }

    const loadPyodide = (window as any).loadPyodide;
    if (!loadPyodide) {
      throw new Error('Failed to load Pyodide loader');
    }

    // Load Pyodide from CDN
    const pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/',
    });

    // Install common packages
    console.log('[Pyodide] Installing packages...');
    await pyodide.loadPackage(['numpy', 'matplotlib']);

    this.pyodide = pyodide;
    this.loading = false;

    console.log('[Pyodide] Ready!');
    return pyodide;
  }

  /**
   * Execute Python code
   */
  async execute(code: string, inputs: Record<string, any> = {}): Promise<any> {
    const pyodide = await this.init();

    console.log('[Pyodide] Executing code...');
    console.log('[Pyodide] Inputs:', inputs);

    try {
      // Inject inputs into Python namespace
      pyodide.globals.set('inputs', pyodide.toPy(inputs));

      // Execute the code
      // The code should define an execute() function
      await pyodide.runPythonAsync(code);

      // Call the execute function
      const result = await pyodide.runPythonAsync('execute(inputs)');

      // Convert result back to JavaScript
      const jsResult = result.toJs({ dict_converter: Object.fromEntries });

      console.log('[Pyodide] Result:', jsResult);
      return jsResult;
    } catch (error) {
      console.error('[Pyodide] Execution error:', error);
      throw error;
    }
  }

  /**
   * Check if Pyodide is ready
   */
  isReady(): boolean {
    return this.pyodide !== null;
  }

  /**
   * Get Pyodide instance
   */
  async getInstance(): Promise<any> {
    return this.init();
  }
}

// Singleton instance
export const pyodideRunner = new PyodideRunner();

/**
 * Execute a Python skill node
 */
export async function executePythonSkill(
  code: string,
  inputs: Record<string, any>
): Promise<any> {
  return pyodideRunner.execute(code, inputs);
}

/**
 * Preload Pyodide (call this when the app starts)
 */
export async function preloadPyodide(): Promise<void> {
  await pyodideRunner.init();
}
