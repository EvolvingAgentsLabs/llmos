/**
 * Applet Error Fixer
 *
 * Uses the LLM to analyze compilation errors and fix applet code.
 * Supports up to 3 retry attempts with intelligent error analysis.
 */

import { createLLMClient } from '@/lib/llm-client';

export interface ErrorFixResult {
  success: boolean;
  fixedCode?: string;
  explanation?: string;
  error?: string;
}

/**
 * Ask the LLM to analyze and fix applet code based on an error
 */
export async function fixAppletError(
  originalCode: string,
  errorMessage: string,
  appletName?: string,
  attemptNumber = 1
): Promise<ErrorFixResult> {
  try {
    const client = createLLMClient();
    if (!client) {
      return {
        success: false,
        error: 'LLM client not available. Please configure your API key.',
      };
    }

    const systemPrompt = `You are an expert React/TypeScript developer specialized in fixing code errors.
Your task is to fix the provided applet code based on the error message.

IMPORTANT RULES:
1. The component MUST be named "Applet" (function Applet() {...})
2. Only React and its hooks are available (useState, useEffect, useCallback, useMemo, useRef)
3. Use Tailwind CSS classes for styling
4. Do NOT use any external imports or libraries
5. Return ONLY the fixed code, no explanations before or after
6. The code should be a complete, working React component

Available globals:
- React and all its hooks (useState, useEffect, etc.)
- Math, JSON, Array, Object, String, Number, Boolean, Date, Map, Set, Promise
- console, setTimeout, clearTimeout, setInterval, clearInterval
- navigator (for clipboard access)`;

    const userPrompt = `Fix this applet code that has a compilation error.

${appletName ? `Applet Name: ${appletName}` : ''}
Attempt: ${attemptNumber}/3

ERROR MESSAGE:
${errorMessage}

ORIGINAL CODE:
\`\`\`tsx
${originalCode}
\`\`\`

Return ONLY the fixed code (no markdown code blocks, no explanations). The component must be named "Applet".`;

    const response = await client.chatDirect([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    if (!response) {
      return {
        success: false,
        error: 'No response from LLM',
      };
    }

    // Extract code from response (handle cases where LLM wraps in markdown)
    let fixedCode = response.trim();

    // Remove markdown code blocks if present
    if (fixedCode.startsWith('```')) {
      const lines = fixedCode.split('\n');
      // Remove first line (```tsx or ```)
      lines.shift();
      // Remove last line (```)
      if (lines[lines.length - 1]?.trim() === '```') {
        lines.pop();
      }
      fixedCode = lines.join('\n');
    }

    // Basic validation - check if it looks like valid React code
    if (!fixedCode.includes('function Applet') && !fixedCode.includes('const Applet')) {
      // Try to find any component and rename it to Applet
      fixedCode = fixedCode
        .replace(/function\s+Component\s*\(/g, 'function Applet(')
        .replace(/function\s+App\s*\(/g, 'function Applet(')
        .replace(/const\s+Component\s*=/g, 'const Applet =')
        .replace(/const\s+App\s*=/g, 'const Applet =');
    }

    // Validate the code has a component
    if (!fixedCode.includes('function Applet') && !fixedCode.includes('const Applet')) {
      return {
        success: false,
        error: 'LLM response did not contain a valid Applet component',
      };
    }

    return {
      success: true,
      fixedCode,
      explanation: `Fixed on attempt ${attemptNumber}`,
    };
  } catch (error: any) {
    console.error('[AppletErrorFixer] Failed to fix error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get LLM fix',
    };
  }
}

/**
 * Check if an error is fixable by the LLM
 * Some errors (like Babel not loading) are infrastructure issues, not code issues
 */
export function isCodeError(errorMessage: string): boolean {
  const infrastructureErrors = [
    'babel not available',
    'babel not loaded',
    'failed to load babel',
    'network error',
    'fetch failed',
  ];

  const lowerError = errorMessage.toLowerCase();
  return !infrastructureErrors.some(ie => lowerError.includes(ie));
}

export default fixAppletError;
