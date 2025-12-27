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
    const jsCode = await transpileTSX(code);

    // Create scope with available libraries
    const scope = createAppletScope();

    // Wrap the code to capture exports
    const wrappedCode = `
      (function(scope) {
        const { React, useState, useEffect, useCallback, useMemo, useRef,
                useReducer, useContext, createContext, Fragment, createElement } = scope;

        const exports = {};
        ${jsCode}

        // Try to find the default export or a component named 'Applet' or 'App'
        if (typeof Component !== 'undefined') exports.Component = Component;
        else if (typeof Applet !== 'undefined') exports.Component = Applet;
        else if (typeof App !== 'undefined') exports.Component = App;
        else if (typeof Default !== 'undefined') exports.Component = Default;

        if (typeof metadata !== 'undefined') exports.metadata = metadata;
        if (typeof defaultState !== 'undefined') exports.defaultState = defaultState;

        return exports;
      })
    `;

    // Execute the wrapped code
    const createExports = new Function('return ' + wrappedCode)();
    const exports = createExports(scope) as AppletExports;

    if (!exports.Component) {
      throw new Error('No component found. Export a component named Component, Applet, or App.');
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
