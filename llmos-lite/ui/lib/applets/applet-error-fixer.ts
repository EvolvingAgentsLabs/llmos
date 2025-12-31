/**
 * Applet Error Fixer
 *
 * Uses the LLM and markdown-defined AppletDebuggerAgent to analyze
 * compilation errors and fix applet code.
 *
 * The behavior is defined in /system/agents/AppletDebuggerAgent.md
 * allowing the fixing strategy to evolve without code changes.
 */

import { createLLMClient } from '@/lib/llm-client';

export interface ErrorFixResult {
  success: boolean;
  fixedCode?: string;
  explanation?: string;
  error?: string;
  agentUsed?: string;
}

// Cache for agent definition
let agentDefinitionCache: string | null = null;
let agentCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load the AppletDebuggerAgent markdown definition
 * This allows the fixing behavior to evolve by editing the markdown file
 */
async function loadAgentDefinition(): Promise<string | null> {
  // Check cache
  if (agentDefinitionCache && Date.now() - agentCacheTime < CACHE_TTL) {
    return agentDefinitionCache;
  }

  try {
    const response = await fetch('/system/agents/AppletDebuggerAgent.md');
    if (!response.ok) {
      console.warn('[AppletErrorFixer] Could not load AppletDebuggerAgent.md, using fallback');
      return null;
    }

    const content = await response.text();
    agentDefinitionCache = content;
    agentCacheTime = Date.now();

    return content;
  } catch (error) {
    console.warn('[AppletErrorFixer] Error loading agent definition:', error);
    return null;
  }
}

/**
 * Extract the agent instructions from markdown content
 * Skips the YAML frontmatter and returns the markdown body
 */
function extractAgentInstructions(markdown: string): string {
  // Remove YAML frontmatter (between --- markers)
  const frontmatterMatch = markdown.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    return frontmatterMatch[1].trim();
  }
  return markdown;
}

/**
 * Fallback system prompt if agent definition can't be loaded
 */
const FALLBACK_SYSTEM_PROMPT = `You are an expert React/TypeScript developer specialized in fixing code errors.
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

/**
 * Ask the LLM to analyze and fix applet code based on an error
 * Uses the markdown-defined AppletDebuggerAgent for instructions
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

    // Load agent definition from markdown (evolvable)
    const agentMarkdown = await loadAgentDefinition();
    let systemPrompt: string;
    let agentUsed: string;

    if (agentMarkdown) {
      systemPrompt = extractAgentInstructions(agentMarkdown);
      agentUsed = 'AppletDebuggerAgent.md';
      console.log('[AppletErrorFixer] Using markdown-defined AppletDebuggerAgent');
    } else {
      systemPrompt = FALLBACK_SYSTEM_PROMPT;
      agentUsed = 'fallback';
      console.log('[AppletErrorFixer] Using fallback system prompt');
    }

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
        agentUsed,
      };
    }

    return {
      success: true,
      fixedCode,
      explanation: `Fixed on attempt ${attemptNumber}`,
      agentUsed,
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
 *
 * This list could also be loaded from the markdown tool definition in the future
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

/**
 * Clear the agent definition cache
 * Call this when you want to force reload of the markdown definition
 */
export function clearAgentCache(): void {
  agentDefinitionCache = null;
  agentCacheTime = 0;
}

export default fixAppletError;
