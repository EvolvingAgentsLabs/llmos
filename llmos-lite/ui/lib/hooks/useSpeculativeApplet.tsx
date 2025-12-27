'use client';

/**
 * useSpeculativeApplet - Hook for instant applet perception
 *
 * This hook implements "Multi-Token Prediction" at the UI level:
 * 1. Detects user intent immediately
 * 2. Renders a skeleton applet instantly
 * 3. Updates with real content as LLM responds
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import {
  SpeculativeAppletEngine,
  AppletTemplate,
} from '@/lib/runtime/speculative-applet';
import { ActiveApplet } from '@/lib/applets/applet-store';

interface UseSpeculativeAppletOptions {
  enabled?: boolean;
  autoDisplay?: boolean;
  onSpeculativeGenerated?: (applet: ActiveApplet) => void;
  onRealAppletReady?: (applet: ActiveApplet) => void;
}

interface SpeculativeState {
  isSpeculating: boolean;
  speculativeApplet: ActiveApplet | null;
  matchedTemplate: AppletTemplate | null;
  confidence: number;
}

export function useSpeculativeApplet(options: UseSpeculativeAppletOptions = {}) {
  const { enabled = true, autoDisplay = true, onSpeculativeGenerated, onRealAppletReady } = options;

  const { createApplet, closeApplet } = useApplets();
  const [state, setState] = useState<SpeculativeState>({
    isSpeculating: false,
    speculativeApplet: null,
    matchedTemplate: null,
    confidence: 0,
  });

  const speculativeAppletIdRef = useRef<string | null>(null);

  /**
   * Analyze message and potentially generate speculative applet
   */
  const analyzeAndSpeculate = useCallback(
    (message: string): ActiveApplet | null => {
      if (!enabled) return null;

      // Check if we should speculate
      if (!SpeculativeAppletEngine.shouldSpeculate(message)) {
        return null;
      }

      // Detect intent
      const template = SpeculativeAppletEngine.detectIntent(message);
      if (!template) {
        return null;
      }

      // Infer values from message
      const inferredValues = SpeculativeAppletEngine.inferValues(message, template);

      // Generate speculative applet
      const { code, metadata } = SpeculativeAppletEngine.generateSpeculative(
        template,
        inferredValues
      );

      // Mark as speculative
      metadata.tags = [...(metadata.tags || []), 'speculative'];

      // Create the applet
      if (autoDisplay) {
        const applet = createApplet({
          code,
          metadata,
        });

        speculativeAppletIdRef.current = applet.id;

        setState({
          isSpeculating: true,
          speculativeApplet: applet,
          matchedTemplate: template,
          confidence: 0.7, // Initial confidence
        });

        if (onSpeculativeGenerated) {
          onSpeculativeGenerated(applet);
        }

        return applet;
      }

      return null;
    },
    [enabled, autoDisplay, createApplet, onSpeculativeGenerated]
  );

  /**
   * Replace speculative applet with real LLM-generated applet
   */
  const replaceWithReal = useCallback(
    (realCode: string, realMetadata: { name: string; description: string }) => {
      // Close speculative applet
      if (speculativeAppletIdRef.current) {
        closeApplet(speculativeAppletIdRef.current);
        speculativeAppletIdRef.current = null;
      }

      // Create real applet
      const applet = createApplet({
        code: realCode,
        metadata: {
          id: `applet-${Date.now()}`,
          name: realMetadata.name,
          description: realMetadata.description,
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      setState({
        isSpeculating: false,
        speculativeApplet: null,
        matchedTemplate: null,
        confidence: 1,
      });

      if (onRealAppletReady) {
        onRealAppletReady(applet);
      }

      return applet;
    },
    [closeApplet, createApplet, onRealAppletReady]
  );

  /**
   * Cancel speculation and remove speculative applet
   */
  const cancelSpeculation = useCallback(() => {
    if (speculativeAppletIdRef.current) {
      closeApplet(speculativeAppletIdRef.current);
      speculativeAppletIdRef.current = null;
    }

    setState({
      isSpeculating: false,
      speculativeApplet: null,
      matchedTemplate: null,
      confidence: 0,
    });
  }, [closeApplet]);

  /**
   * Update speculative applet with partial LLM response
   * (For streaming scenarios)
   */
  const updateSpeculative = useCallback((partialCode: string) => {
    // This would be used for streaming updates
    // For now, we just track that an update is happening
    setState((prev) => ({
      ...prev,
      confidence: Math.min(prev.confidence + 0.1, 0.95),
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speculativeAppletIdRef.current) {
        closeApplet(speculativeAppletIdRef.current);
      }
    };
  }, [closeApplet]);

  return {
    ...state,
    analyzeAndSpeculate,
    replaceWithReal,
    cancelSpeculation,
    updateSpeculative,
    templates: SpeculativeAppletEngine.templates,
  };
}

/**
 * Hook for message preprocessing with speculation
 */
export function useMessageWithSpeculation() {
  const speculation = useSpeculativeApplet();

  const preprocessMessage = useCallback(
    (message: string) => {
      // Try to speculate
      const speculativeApplet = speculation.analyzeAndSpeculate(message);

      return {
        message,
        hasSpeculation: !!speculativeApplet,
        speculativeApplet,
      };
    },
    [speculation]
  );

  return {
    preprocessMessage,
    ...speculation,
  };
}

export default useSpeculativeApplet;
