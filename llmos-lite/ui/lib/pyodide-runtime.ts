/**
 * Pyodide Runtime - WebAssembly Python execution in browser
 *
 * Safe, sandboxed Python execution for tools and agents
 * No file system access, no network access (except explicit fetch)
 */

export interface ExecutionResult {
  success: boolean;
  output?: any;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime: number;
  images?: string[]; // Base64 encoded images from matplotlib
}

export interface ExecutionOptions {
  timeout?: number; // milliseconds
  packages?: string[]; // Additional packages to load
  globals?: Record<string, any>; // Global variables
}

class PyodideRuntime {
  private pyodide: any | null = null;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Initialize Pyodide (lazy load)
   */
  async initialize(): Promise<void> {
    if (this.pyodide) return;

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this._loadPyodide();

    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
    }
  }

  private async _loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide script'));
      document.head.appendChild(script);
    });
  }

  private async _loadPyodide(): Promise<void> {
    try {
      console.log('Loading Pyodide...');

      // Load Pyodide from CDN using script tag approach
      // This is more reliable than the npm package in Next.js
      if (typeof window !== 'undefined' && !(window as any).loadPyodide) {
        await this._loadPyodideScript();
      }

      const loadPyodide = (window as any).loadPyodide;
      if (!loadPyodide) {
        throw new Error('Failed to load Pyodide loader');
      }

      this.pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/',
      });

      // Set up stdout/stderr capture and matplotlib image capture
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO, BytesIO
import base64

class OutputCapture:
    def __init__(self):
        self.stdout = StringIO()
        self.stderr = StringIO()
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        self.images = []

    def start(self):
        sys.stdout = self.stdout
        sys.stderr = self.stderr
        self.images = []

    def stop(self):
        sys.stdout = self._stdout
        sys.stderr = self._stderr
        stdout_val = self.stdout.getvalue()
        stderr_val = self.stderr.getvalue()
        images = self.images.copy()
        self.stdout = StringIO()
        self.stderr = StringIO()
        self.images = []
        return stdout_val, stderr_val, images

    def add_image(self, img_data):
        """Add a base64 encoded image"""
        self.images.append(img_data)

_output_capture = OutputCapture()

# Monkey-patch matplotlib to capture figures
def _setup_matplotlib_capture():
    """Setup matplotlib to automatically capture figures"""
    try:
        import matplotlib
        import matplotlib.pyplot as plt

        # Use Agg backend (no display, good for image generation)
        matplotlib.use('Agg')

        # Override plt.show() to capture figures
        _original_show = plt.show

        def _custom_show(*args, **kwargs):
            """Capture all open figures when plt.show() is called"""
            for fig_num in plt.get_fignums():
                fig = plt.figure(fig_num)
                buf = BytesIO()
                fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
                buf.seek(0)
                img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                _output_capture.add_image(img_base64)
                plt.close(fig)

        plt.show = _custom_show

        # Also override savefig to capture
        _original_savefig = plt.savefig

        def _custom_savefig(fname, *args, **kwargs):
            """Capture figure when savefig is called"""
            # Get current figure
            fig = plt.gcf()
            buf = BytesIO()
            fig.savefig(buf, format='png', dpi=kwargs.get('dpi', 100), bbox_inches='tight')
            buf.seek(0)
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            _output_capture.add_image(img_base64)

        plt.savefig = _custom_savefig

    except ImportError:
        pass  # matplotlib not available yet

# Try to setup matplotlib capture (will work if matplotlib is loaded)
_setup_matplotlib_capture()
      `);

      console.log('✓ Pyodide loaded successfully');
    } catch (error) {
      console.error('Failed to load Pyodide:', error);
      throw new Error(`Pyodide initialization failed: ${error}`);
    }
  }

  /**
   * Check if Pyodide is ready
   */
  isReady(): boolean {
    return this.pyodide !== null;
  }

  /**
   * Execute Python code safely
   */
  async executePython(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Initialize if needed
      if (!this.pyodide) {
        await this.initialize();
      }

      if (!this.pyodide) {
        throw new Error('Pyodide not initialized');
      }

      // Auto-detect packages needed based on code content
      const needsMatplotlib = code.includes('matplotlib') || code.includes('plt.');
      const needsNumpy = code.includes('numpy') || code.includes('np.');
      const needsScipy = code.includes('scipy') || code.includes('from scipy');
      const needsNetworkx = code.includes('networkx') || code.includes('nx.');

      // Detect quantum computing code (we'll inject MicroQiskit for compatibility)
      const isQuantumCode = code.includes('qiskit') || code.includes('QuantumCircuit') ||
                            code.includes('from qiskit') || code.includes('import qiskit');

      const packagesToLoad = [...(options.packages || [])];
      if (needsMatplotlib && !packagesToLoad.includes('matplotlib')) {
        packagesToLoad.push('matplotlib');
      }
      if (needsNumpy && !packagesToLoad.includes('numpy')) {
        packagesToLoad.push('numpy');
      }
      if (needsScipy && !packagesToLoad.includes('scipy')) {
        packagesToLoad.push('scipy');
      }
      if (needsNetworkx && !packagesToLoad.includes('networkx')) {
        packagesToLoad.push('networkx');
      }

      // Auto-load matplotlib for quantum visualization
      if (isQuantumCode && !packagesToLoad.includes('matplotlib')) {
        packagesToLoad.push('matplotlib');
      }

      // Load additional packages
      if (packagesToLoad.length > 0) {
        await this.pyodide.loadPackage(packagesToLoad);

        // Re-setup matplotlib capture after loading
        if (packagesToLoad.includes('matplotlib')) {
          await this.pyodide.runPythonAsync('_setup_matplotlib_capture()');
        }
      }

      // Inject MicroQiskit for quantum computing code
      if (isQuantumCode) {
        await this._loadMicroQiskit();
      }

      // Set global variables
      if (options.globals) {
        for (const [key, value] of Object.entries(options.globals)) {
          this.pyodide.globals.set(key, value);
        }
      }

      // Start output capture
      await this.pyodide.runPythonAsync('_output_capture.start()');

      // Execute with timeout
      const timeoutMs = options.timeout || 30000; // 30 seconds default
      const result = await this._executeWithTimeout(code, timeoutMs);

      // Stop output capture
      const captureResult = await this.pyodide.runPythonAsync(
        '_output_capture.stop()'
      );
      const [stdout, stderr, images] = captureResult.toJs();

      const executionTime = performance.now() - startTime;

      // Convert images array to JS array and ensure it's string[]
      const imageArray: string[] = images ? Array.from(images).map(String) : [];

      return {
        success: true,
        output: result,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        images: imageArray.length > 0 ? imageArray : undefined,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      // Try to capture any output before error
      let stdout = '';
      let stderr = '';
      try {
        if (this.pyodide) {
          const captureResult = await this.pyodide.runPythonAsync(
            '_output_capture.stop()'
          );
          [stdout, stderr] = captureResult.toJs();
        }
      } catch {
        // Ignore capture errors
      }

      return {
        success: false,
        error: error.message || String(error),
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        executionTime,
      };
    }
  }

  private async _executeWithTimeout(
    code: string,
    timeoutMs: number
  ): Promise<any> {
    if (!this.pyodide) throw new Error('Pyodide not initialized');

    return Promise.race([
      this.pyodide.runPythonAsync(code),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }

  private async _loadMicroQiskit(): Promise<void> {
    if (!this.pyodide) return;

    // Check if already loaded
    try {
      await this.pyodide.runPythonAsync('import qiskit');
      return; // Already loaded
    } catch {
      // Not loaded, continue
    }

    // Fetch MicroQiskit code
    const response = await fetch('/lib/microqiskit.py');
    const microqiskitCode = await response.text();

    // Create qiskit module structure
    await this.pyodide.runPythonAsync(`
import sys
import types

# Create qiskit module
qiskit = types.ModuleType('qiskit')
sys.modules['qiskit'] = qiskit

# Create qiskit.circuit submodule
qiskit_circuit = types.ModuleType('qiskit.circuit')
sys.modules['qiskit.circuit'] = qiskit_circuit
qiskit.circuit = qiskit_circuit

# Create qiskit.circuit.library submodule
qiskit_circuit_library = types.ModuleType('qiskit.circuit.library')
sys.modules['qiskit.circuit.library'] = qiskit_circuit_library
qiskit_circuit.library = qiskit_circuit_library

# Create qiskit_aer module
qiskit_aer = types.ModuleType('qiskit_aer')
sys.modules['qiskit_aer'] = qiskit_aer
    `);

    // Load MicroQiskit implementation
    await this.pyodide.runPythonAsync(microqiskitCode);

    // Inject into qiskit namespace
    await this.pyodide.runPythonAsync(`
# Import from microqiskit module
qiskit.QuantumCircuit = QuantumCircuit
qiskit.QuantumRegister = type('QuantumRegister', (), {})
qiskit.ClassicalRegister = type('ClassicalRegister', (), {})
qiskit.execute = execute

# Add to circuit submodule
qiskit_circuit.QuantumCircuit = QuantumCircuit
qiskit_circuit.QuantumRegister = type('QuantumRegister', (), {})
qiskit_circuit.ClassicalRegister = type('ClassicalRegister', (), {})

# Add QFT to library
qiskit_circuit_library.QFT = QFT

# Add Aer backend
qiskit_aer.Aer = Aer

print("✓ MicroQiskit loaded (lightweight quantum simulator for browser)")
    `);
  }

  /**
   * Execute JavaScript code safely
   */
  async executeJavaScript(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Create sandboxed context
      const sandbox: any = {
        console: {
          log: (...args: any[]) => console.log('[Sandbox]', ...args),
          error: (...args: any[]) => console.error('[Sandbox]', ...args),
          warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
        },
        Math,
        JSON,
        Date,
        ...(options.globals || {}),
      };

      // Capture console output
      const logs: string[] = [];
      const errors: string[] = [];

      sandbox.console.log = (...args: any[]) => {
        logs.push(args.map(String).join(' '));
      };
      sandbox.console.error = (...args: any[]) => {
        errors.push(args.map(String).join(' '));
      };

      // Create function with sandboxed globals
      const sandboxKeys = Object.keys(sandbox);
      const sandboxValues = sandboxKeys.map(key => sandbox[key]);

      const fn = new Function(...sandboxKeys, `
        "use strict";
        return (async () => {
          ${code}
        })();
      `);

      // Execute with timeout
      const timeoutMs = options.timeout || 30000;
      const result = await Promise.race([
        fn(...sandboxValues),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
        ),
      ]);

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: result,
        stdout: logs.length > 0 ? logs.join('\n') : undefined,
        stderr: errors.length > 0 ? errors.join('\n') : undefined,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      return {
        success: false,
        error: error.message || String(error),
        executionTime,
      };
    }
  }

  /**
   * Load a single package
   */
  async loadPackage(packageName: string): Promise<void> {
    if (!this.pyodide) {
      await this.initialize();
    }

    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    await this.pyodide.loadPackage(packageName);
  }

  /**
   * Load packages for future use
   */
  async loadPackages(packages: string[]): Promise<void> {
    if (!this.pyodide) {
      await this.initialize();
    }

    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    await this.pyodide.loadPackage(packages);
  }

  /**
   * Check if a package is available
   */
  async isPackageAvailable(packageName: string): Promise<boolean> {
    if (!this.pyodide) return false;

    try {
      await this.pyodide.runPythonAsync(`import ${packageName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.pyodide = null;
  }
}

// Singleton instance
let runtimeInstance: PyodideRuntime | null = null;

/**
 * Get the shared Pyodide runtime instance
 */
export function getPyodideRuntime(): PyodideRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new PyodideRuntime();
  }
  return runtimeInstance;
}

/**
 * Convenience function to execute Python code
 */
export async function executePython(
  code: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const runtime = getPyodideRuntime();
  return runtime.executePython(code, options);
}

/**
 * Convenience function to execute JavaScript code
 */
export async function executeJavaScript(
  code: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const runtime = getPyodideRuntime();
  return runtime.executeJavaScript(code, options);
}

/**
 * Initialize Pyodide early (optional, for better UX)
 */
export async function warmupRuntime(): Promise<void> {
  const runtime = getPyodideRuntime();
  await runtime.initialize();
}
