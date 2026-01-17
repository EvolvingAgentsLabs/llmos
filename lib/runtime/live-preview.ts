/**
 * Live Runtime Preview
 *
 * Provides live execution preview of Python files from volumes
 * Similar to Jupyter but file-based with auto-execution
 */

import { logger } from '@/lib/debug/logger';

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  returnValue?: any;
  images?: string[];  // Base64 encoded images (matplotlib plots)
  error?: string;
  executionTime: number;
}

export interface RuntimeOptions {
  autoExecute?: boolean;
  captureOutput?: boolean;
  capturePlots?: boolean;
}

/**
 * LivePreview - Execute Python code with live output
 *
 * Features:
 * - Auto-execute on file save
 * - Capture stdout/stderr
 * - Capture matplotlib plots as base64 images
 * - Support for quantum libraries (qiskit, numpy, scipy)
 */
export class LivePreview {
  private pyodide: any | null = null;
  private initialized: boolean = false;
  private currentFile: string | null = null;
  private watchCallbacks: Map<string, (result: ExecutionResult) => void> = new Map();

  /**
   * Initialize Pyodide runtime
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

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

    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/'
    });

    // Set up output capture
    await this.setupOutputCapture();

    // Install commonly used packages
    await this.installBasePackages();

    this.initialized = true;
  }

  /**
   * Execute Python code from a file
   */
  async executeFile(
    filePath: string,
    code: string,
    options: RuntimeOptions = {}
  ): Promise<ExecutionResult> {
    if (!this.pyodide) {
      await this.initialize();
    }

    logger.time(`python-exec-${filePath}`, 'python', `Executing ${filePath}`);

    const startTime = Date.now();
    const result: ExecutionResult = {
      success: false,
      stdout: '',
      stderr: '',
      images: [],
      executionTime: 0
    };

    try {
      // Clear previous output
      await this.clearOutput();

      // Capture matplotlib figures
      if (options.capturePlots !== false) {
        await this.setupMatplotlibCapture();
      }

      // Execute the code
      const returnValue = await this.pyodide!.runPythonAsync(code);

      // Get captured output
      const output = await this.getOutput();
      result.stdout = output.stdout;
      result.stderr = output.stderr;

      // Get captured plots
      if (options.capturePlots !== false) {
        result.images = await this.getPlots();
      }

      result.returnValue = returnValue;
      result.success = true;

    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
      result.stderr = result.error;
      logger.error('python', `Execution failed: ${filePath}`, { error: result.error });
    }

    result.executionTime = Date.now() - startTime;

    if (result.success) {
      logger.timeEnd(`python-exec-${filePath}`, true, {
        hasOutput: !!result.stdout,
        plotCount: result.images?.length || 0,
      });
    }

    // Notify watchers
    const callback = this.watchCallbacks.get(filePath);
    if (callback) {
      callback(result);
    }

    return result;
  }

  /**
   * Watch a file for changes and auto-execute
   */
  watchFile(
    filePath: string,
    callback: (result: ExecutionResult) => void
  ): () => void {
    this.watchCallbacks.set(filePath, callback);
    this.currentFile = filePath;

    // Return unwatch function
    return () => {
      this.watchCallbacks.delete(filePath);
      if (this.currentFile === filePath) {
        this.currentFile = null;
      }
    };
  }

  /**
   * Stop watching all files
   */
  unwatchAll(): void {
    this.watchCallbacks.clear();
    this.currentFile = null;
  }

  /**
   * Install a Python package
   */
  async installPackage(packageName: string): Promise<void> {
    if (!this.pyodide) {
      await this.initialize();
    }

    await this.pyodide!.loadPackage(packageName);
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
   * Set up output capture in Python
   */
  private async setupOutputCapture(): Promise<void> {
    await this.pyodide!.runPythonAsync(`
import sys
from io import StringIO

# Create string buffers for stdout and stderr
_stdout_buffer = StringIO()
_stderr_buffer = StringIO()
_original_stdout = sys.stdout
_original_stderr = sys.stderr

def _get_output():
    return {
        'stdout': _stdout_buffer.getvalue(),
        'stderr': _stderr_buffer.getvalue()
    }

def _clear_output():
    global _stdout_buffer, _stderr_buffer
    _stdout_buffer = StringIO()
    _stderr_buffer = StringIO()
    sys.stdout = _stdout_buffer
    sys.stderr = _stderr_buffer
`);
  }

  /**
   * Set up matplotlib to capture figures
   */
  private async setupMatplotlibCapture(): Promise<void> {
    await this.pyodide!.runPythonAsync(`
import matplotlib
import matplotlib.pyplot as plt
import base64
from io import BytesIO

# Use non-interactive backend
matplotlib.use('Agg')

_captured_figures = []

def _capture_figure():
    """Capture current matplotlib figure as base64 PNG"""
    global _captured_figures

    fig = plt.gcf()
    if fig.get_axes():  # Only capture if there's content
        buf = BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=150)
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        _captured_figures.append(img_base64)
        plt.close(fig)

def _get_captured_figures():
    global _captured_figures
    figs = _captured_figures.copy()
    _captured_figures = []
    return figs

# Monkey-patch plt.show() to capture instead of display
_original_show = plt.show
def _show_capture(*args, **kwargs):
    _capture_figure()
plt.show = _show_capture
`);
  }

  /**
   * Clear Python output buffers
   */
  private async clearOutput(): Promise<void> {
    await this.pyodide!.runPythonAsync('_clear_output()');
  }

  /**
   * Get captured output
   */
  private async getOutput(): Promise<{ stdout: string; stderr: string }> {
    const output = await this.pyodide!.runPythonAsync('_get_output()');
    return output.toJs() as { stdout: string; stderr: string };
  }

  /**
   * Get captured matplotlib plots
   */
  private async getPlots(): Promise<string[]> {
    const plots = await this.pyodide!.runPythonAsync('_get_captured_figures()');
    return plots.toJs() as string[];
  }

  /**
   * Install commonly used packages
   */
  private async installBasePackages(): Promise<void> {
    const packages = [
      'numpy',
      'matplotlib',
      'scipy'
    ];

    for (const pkg of packages) {
      try {
        await this.pyodide!.loadPackage(pkg);
        logger.debug('python', `Package loaded: ${pkg}`);
      } catch (error) {
        logger.warn('python', `Failed to load package ${pkg}`, { error });
      }
    }
  }

  /**
   * Detect and install required packages from code
   */
  async detectAndInstallPackages(code: string): Promise<string[]> {
    const installedPackages: string[] = [];

    // Common import patterns
    const importRegex = /(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const matches = code.matchAll(importRegex);

    const imports = new Set<string>();
    for (const match of matches) {
      imports.add(match[1]);
    }

    // Package mappings (import name -> package name)
    const packageMap: Record<string, string> = {
      'qiskit': 'qiskit',
      'sklearn': 'scikit-learn',
      'pd': 'pandas',
      'np': 'numpy',
      'plt': 'matplotlib',
      'scipy': 'scipy'
    };

    for (const imp of imports) {
      const packageName = packageMap[imp] || imp;

      // Check if already available
      const available = await this.isPackageAvailable(imp);
      if (available) continue;

      // Try to install
      try {
        await this.installPackage(packageName);
        installedPackages.push(packageName);
        logger.info('python', `Auto-installed package: ${packageName}`);
      } catch (error) {
        logger.warn('python', `Could not install ${packageName}`, { error });
      }
    }

    return installedPackages;
  }

  /**
   * Get runtime status
   */
  getStatus(): {
    initialized: boolean;
    currentFile: string | null;
    watchedFiles: string[];
  } {
    return {
      initialized: this.initialized,
      currentFile: this.currentFile,
      watchedFiles: Array.from(this.watchCallbacks.keys())
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.unwatchAll();
    this.pyodide = null;
    this.initialized = false;
  }
}

// Singleton instance
let livePreview: LivePreview | null = null;

export function getLivePreview(): LivePreview {
  if (!livePreview) {
    livePreview = new LivePreview();
  }
  return livePreview;
}
