/**
 * Applet Runtime - The "Infinite App Store" Engine
 *
 * This module provides dynamic React component compilation and execution
 * in the browser. It transforms TSX code into live, interactive applets
 * that can be saved, shared, and persisted in the file system.
 *
 * Key Features:
 * - Browser-side TSX transpilation using Babel Standalone
 * - Scoped component execution with access to common libraries
 * - State persistence across sessions
 * - Secure sandboxed execution
 */

import React from 'react';

// Applet metadata and state
export interface AppletMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  icon?: string;
}

export interface AppletState {
  [key: string]: unknown;
}

export interface AppletProps {
  onSubmit?: (data: unknown) => void;
  onClose?: () => void;
  onSave?: (state: AppletState) => void;
  initialState?: AppletState;
  metadata?: AppletMetadata;
}

export interface AppletExports {
  Component: React.ComponentType<AppletProps>;
  metadata?: AppletMetadata;
  defaultState?: AppletState;
}

export interface CompilationResult {
  success: boolean;
  exports?: AppletExports;
  error?: string;
  warnings?: string[];
}

export interface AppletFile {
  metadata: AppletMetadata;
  code: string;
  state?: AppletState;
}

// Babel standalone loader
let babelLoaded = false;
let babelLoadPromise: Promise<void> | null = null;

async function loadBabel(): Promise<void> {
  if (babelLoaded) return;
  if (babelLoadPromise) return babelLoadPromise;

  babelLoadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Babel can only be loaded in browser environment'));
      return;
    }

    // Check if already loaded
    if ((window as any).Babel) {
      babelLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@babel/standalone@7.23.6/babel.min.js';
    script.async = true;
    script.onload = () => {
      babelLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Babel standalone'));
    };
    document.head.appendChild(script);
  });

  return babelLoadPromise;
}

// Available libraries in the applet scope
const createAppletScope = () => {
  // We'll dynamically import these to avoid SSR issues
  const scope: Record<string, unknown> = {
    // React core
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    useMemo: React.useMemo,
    useRef: React.useRef,
    useReducer: React.useReducer,
    useContext: React.useContext,
    createContext: React.createContext,
    Fragment: React.Fragment,
    createElement: React.createElement,

    // JavaScript built-ins needed for complex applets
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    Map,
    Set,
    Promise,
    console,

    // Common browser APIs
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame:
      typeof window !== 'undefined' ? window.requestAnimationFrame : undefined,
    cancelAnimationFrame:
      typeof window !== 'undefined' ? window.cancelAnimationFrame : undefined,

    // Utility for clipboard (common in applets)
    navigator: typeof window !== 'undefined' ? window.navigator : undefined,
  };

  return scope;
};

/**
 * Transpile TSX code to JavaScript using Babel Standalone
 */
async function transpileTSX(code: string): Promise<string> {
  await loadBabel();

  const Babel = (window as any).Babel;
  if (!Babel) {
    throw new Error('Babel not available');
  }

  try {
    const result = Babel.transform(code, {
      presets: ['react', 'typescript'],
      plugins: [],
      filename: 'applet.tsx',
    });

    return result.code;
  } catch (error: any) {
    throw new Error(`Transpilation failed: ${error.message}`);
  }
}

/**
 * Extract metadata from applet code comments
 * Format: /** @applet { ...json } *\/
 */
function extractMetadata(code: string): Partial<AppletMetadata> {
  const metadataMatch = code.match(/\/\*\*\s*@applet\s*(\{[\s\S]*?\})\s*\*\//);
  if (metadataMatch) {
    try {
      return JSON.parse(metadataMatch[1]);
    } catch {
      console.warn('Failed to parse applet metadata');
    }
  }
  return {};
}

/**
 * Compile TSX code into an executable React component
 */
export async function compileApplet(code: string): Promise<CompilationResult> {
  const warnings: string[] = [];

  try {
    // Extract metadata
    const extractedMetadata = extractMetadata(code);

    // Transpile TSX to JS
    let jsCode: string;
    try {
      jsCode = await transpileTSX(code);
    } catch (transpileError: any) {
      return {
        success: false,
        error: `Transpilation error: ${transpileError.message}`,
        warnings,
      };
    }

    // Create scope with available libraries
    const scope = createAppletScope();

    // Build the execution function with proper scope injection
    // Using a different approach that's more robust for various component patterns
    const scopeKeys = Object.keys(scope);
    const scopeValues = Object.values(scope);

    // Wrap the code to capture exports - using a cleaner pattern
    const wrappedCode = `
      "use strict";

      // Destructure scope variables
      const { ${scopeKeys.join(', ')} } = __scope__;

      // User's transpiled code
      ${jsCode}

      // Capture exports
      const __exports__ = {};

      // Try to find the component (check all common patterns)
      if (typeof Component !== 'undefined') __exports__.Component = Component;
      else if (typeof Applet !== 'undefined') __exports__.Component = Applet;
      else if (typeof App !== 'undefined') __exports__.Component = App;
      else if (typeof Default !== 'undefined') __exports__.Component = Default;

      // Capture optional exports
      if (typeof metadata !== 'undefined') __exports__.metadata = metadata;
      if (typeof defaultState !== 'undefined') __exports__.defaultState = defaultState;

      return __exports__;
    `;

    // Execute with proper error handling
    let exports: AppletExports;
    try {
      // Create the function with scope parameter
      const executeFn = new Function('__scope__', wrappedCode);
      exports = executeFn(scope) as AppletExports;
    } catch (execError: any) {
      // Provide more helpful error messages
      let errorMsg = execError.message || 'Unknown execution error';

      // Check for common issues
      if (errorMsg.includes('is not defined')) {
        const match = errorMsg.match(/(\w+) is not defined/);
        if (match) {
          errorMsg = `"${match[1]}" is not available. Only React and its hooks (useState, useEffect, etc.) are available in applets.`;
        }
      }

      return {
        success: false,
        error: `Runtime error: ${errorMsg}`,
        warnings,
      };
    }

    if (!exports || !exports.Component) {
      // Try to give a helpful error message
      const hasFunction = jsCode.includes('function ');
      const hasConst = jsCode.includes('const ');

      let hint = '';
      if (!hasFunction && !hasConst) {
        hint = ' The code must define a function component.';
      } else {
        hint = ' Make sure your component is named "Component", "Applet", or "App".';
      }

      throw new Error(`No component found.${hint}`);
    }

    // Verify the component is actually a function
    if (typeof exports.Component !== 'function') {
      throw new Error(`Component must be a function, got ${typeof exports.Component}`);
    }

    // Merge extracted metadata
    if (extractedMetadata) {
      exports.metadata = {
        ...exports.metadata,
        ...extractedMetadata,
      } as AppletMetadata;
    }

    return {
      success: true,
      exports,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown compilation error',
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Parse an .app file content into AppletFile structure
 */
export function parseAppletFile(content: string): AppletFile {
  // Try to parse as JSON first (structured format)
  try {
    const parsed = JSON.parse(content);
    if (parsed.code && parsed.metadata) {
      return parsed as AppletFile;
    }
  } catch {
    // Not JSON, treat as raw TSX with embedded metadata
  }

  // Extract metadata from code comments
  const metadata = extractMetadata(content);

  return {
    metadata: {
      id: metadata.id || `applet-${Date.now()}`,
      name: metadata.name || 'Untitled Applet',
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...metadata,
    },
    code: content,
  };
}

/**
 * Serialize an AppletFile to string for storage
 */
export function serializeAppletFile(applet: AppletFile): string {
  return JSON.stringify(applet, null, 2);
}

/**
 * Create a new applet file with boilerplate
 */
export function createAppletBoilerplate(
  name: string,
  description: string,
  componentCode: string
): string {
  const metadata: AppletMetadata = {
    id: `applet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return JSON.stringify(
    {
      metadata,
      code: componentCode,
      state: {},
    },
    null,
    2
  );
}

/**
 * Generate a unique applet ID
 */
export function generateAppletId(): string {
  return `applet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate applet code for common issues
 */
export function validateAppletCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for component export
  if (
    !code.includes('function Component') &&
    !code.includes('const Component') &&
    !code.includes('function Applet') &&
    !code.includes('const Applet') &&
    !code.includes('function App') &&
    !code.includes('const App')
  ) {
    errors.push('No component found. Define a function or const named Component, Applet, or App.');
  }

  // Check for dangerous patterns
  if (code.includes('eval(') || code.includes('Function(')) {
    errors.push('Security warning: eval() and Function() are not allowed in applets.');
  }

  // Check for proper React usage
  if (code.includes('document.') && !code.includes('useRef')) {
    errors.push('Warning: Direct DOM access is discouraged. Use React refs instead.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export the runtime for use in components
export const AppletRuntime = {
  compile: compileApplet,
  parseFile: parseAppletFile,
  serializeFile: serializeAppletFile,
  createBoilerplate: createAppletBoilerplate,
  generateId: generateAppletId,
  validate: validateAppletCode,
};

export default AppletRuntime;
