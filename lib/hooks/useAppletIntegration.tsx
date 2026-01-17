'use client';

/**
 * useAppletIntegration - Hook for integrating applets with the chat system
 *
 * This hook provides:
 * - Detection of applet-generating tool calls
 * - Automatic applet creation and display
 * - Communication between applets and chat
 */

import { useCallback, useEffect, useRef } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import { AppletToolResult, getAppletTools } from '@/lib/llm-tools/applet-tools';
import { AppletMetadata, generateAppletId } from '@/lib/runtime/applet-runtime';

interface AppletIntegrationOptions {
  onAppletCreated?: (applet: { id: string; name: string }) => void;
  onAppletSubmit?: (appletId: string, data: unknown) => void;
  autoOpenPanel?: boolean;
}

export function useAppletIntegration(options: AppletIntegrationOptions = {}) {
  const { createApplet, activeApplets, currentApplet, closeApplet, focusApplet } = useApplets();
  const appletToolsRef = useRef(getAppletTools());

  /**
   * Process a tool call result that might contain an applet
   */
  const processAppletToolResult = useCallback(
    (result: AppletToolResult) => {
      if (result.success && result.applet) {
        const { code, metadata, filePath, volume } = result.applet;

        // Create the applet in the store
        const activeApplet = createApplet({
          code,
          metadata,
          filePath,
          volume,
        });

        // Notify callback
        if (options.onAppletCreated) {
          options.onAppletCreated({
            id: activeApplet.id,
            name: metadata.name,
          });
        }

        return activeApplet;
      }
      return null;
    },
    [createApplet, options]
  );

  /**
   * Execute an applet tool and process the result
   */
  const executeAppletTool = useCallback(
    async (toolName: string, parameters: unknown) => {
      const result = await appletToolsRef.current.executeTool(toolName, parameters);
      return processAppletToolResult(result);
    },
    [processAppletToolResult]
  );

  /**
   * Generate an applet directly from code and metadata
   */
  const generateApplet = useCallback(
    (params: {
      name: string;
      description: string;
      code: string;
      tags?: string[];
      saveToVolume?: 'team' | 'user' | 'none';
      savePath?: string;
    }) => {
      const metadata: AppletMetadata = {
        id: generateAppletId(),
        name: params.name,
        description: params.description,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: params.tags,
      };

      const activeApplet = createApplet({
        code: params.code,
        metadata,
      });

      if (options.onAppletCreated) {
        options.onAppletCreated({
          id: activeApplet.id,
          name: metadata.name,
        });
      }

      return activeApplet;
    },
    [createApplet, options]
  );

  /**
   * Check if a message contains an applet
   */
  const detectAppletInMessage = useCallback((content: string): boolean => {
    // Look for applet code blocks or generation indicators
    return (
      content.includes('generate_applet') ||
      content.includes('```tsx') ||
      content.includes('```jsx') ||
      content.includes('function Component') ||
      content.includes('function Applet')
    );
  }, []);

  /**
   * Extract applet code from a message
   */
  const extractAppletCode = useCallback(
    (content: string): { name: string; description: string; code: string } | null => {
      // Try to find TSX/JSX code block
      const codeBlockMatch = content.match(/```(?:tsx|jsx)\n([\s\S]*?)```/);
      if (!codeBlockMatch) return null;

      const code = codeBlockMatch[1].trim();

      // Try to extract name from code or surrounding text
      const nameMatch =
        content.match(/(?:called|named|creating)\s+["']([^"']+)["']/i) ||
        content.match(/(?:##|###)\s+(.+?)(?:\n|$)/);

      const name = nameMatch ? nameMatch[1] : 'Generated Applet';

      // Try to extract description
      const descMatch = content.match(/(?:that|which|to)\s+([^.]+\.)/i);
      const description = descMatch ? descMatch[1] : 'An interactive applet';

      return { name, description, code };
    },
    []
  );

  /**
   * Get applet tool definitions for LLM
   */
  const getToolDefinitions = useCallback(() => {
    return appletToolsRef.current.getToolDefinitions();
  }, []);

  return {
    // State
    activeApplets,
    currentApplet,
    hasActiveApplets: activeApplets.length > 0,

    // Actions
    executeAppletTool,
    generateApplet,
    closeApplet,
    focusApplet,
    processAppletToolResult,

    // Detection
    detectAppletInMessage,
    extractAppletCode,

    // Tool definitions
    getToolDefinitions,
  };
}

/**
 * Detect if a tool call is an applet-related tool
 */
export function isAppletTool(toolName: string): boolean {
  return ['generate_applet', 'load_applet', 'list_applets', 'update_applet_state'].includes(
    toolName
  );
}

/**
 * Get the system prompt addition for applet-aware conversations
 */
export function getAppletSystemPrompt(): string {
  return `
## Interactive Applet Generation

You have the ability to generate interactive React applets instead of just text responses.

When a user asks for something that would benefit from an interactive interface (forms, dashboards, calculators, wizards, etc.), use the \`generate_applet\` tool to create a React component.

### When to Generate an Applet

Generate an applet when the user needs:
- A form to collect structured data (contracts, applications, surveys)
- A calculator or converter (budget, units, currencies)
- A multi-step wizard (onboarding, configuration)
- A dashboard or data display
- An interactive generator (passwords, IDs, content)
- A configuration or settings tool

### Applet Code Requirements

1. The component MUST be named "Component", "Applet", or "App"
2. Use Tailwind CSS with dark theme (bg-gray-800, text-gray-200, etc.)
3. Accept { onSubmit, initialState, metadata } props
4. Use React hooks: useState, useEffect, useCallback, useMemo, useRef

### Example Applet Code

\`\`\`tsx
function Component({ onSubmit }) {
  const [value, setValue] = useState('');

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold text-gray-200">My Tool</h2>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
        placeholder="Enter value..."
      />
      <button
        onClick={() => onSubmit({ value })}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
      >
        Submit
      </button>
    </div>
  );
}
\`\`\`

Remember: The goal is to transform text-based interactions into visual, interactive experiences.
`;
}

export default useAppletIntegration;
