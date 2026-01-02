/**
 * System Tools for LLMunix SystemAgent
 *
 * Provides file system, Python execution, sub-agent delegation, and orchestration tools
 */

import { getVFS } from './virtual-fs';
import { executePython } from './pyodide-runtime';
import { getSubAgentExecutor } from './subagents/subagent-executor';
import { getSubAgentUsage, SubAgentUsageRecord } from './subagents/usage-tracker';
import type { VolumeType } from './volumes/file-operations';
import {
  validateProjectAgents,
  formatValidationForLLM,
  suggestAgentsForProject,
  MIN_AGENTS_REQUIRED,
} from './agents/multi-agent-validator';

// Dynamic import for applet runtime to avoid SSR issues
let compileAppletFn: ((code: string) => Promise<any>) | null = null;
let fixAppletErrorFn: ((originalCode: string, errorMessage: string, appletName?: string, attemptNumber?: number) => Promise<any>) | null = null;
let isCodeErrorFn: ((errorMessage: string) => boolean) | null = null;

async function getCompileApplet() {
  if (!compileAppletFn) {
    const { compileApplet } = await import('./runtime/applet-runtime');
    compileAppletFn = compileApplet;
  }
  return compileAppletFn;
}

async function getErrorFixer() {
  if (!fixAppletErrorFn || !isCodeErrorFn) {
    const { fixAppletError, isCodeError } = await import('./applets/applet-error-fixer');
    fixAppletErrorFn = fixAppletError;
    isCodeErrorFn = isCodeError;
  }
  return { fixAppletError: fixAppletErrorFn, isCodeError: isCodeErrorFn };
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  inputs: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  execute: (inputs: Record<string, any>) => Promise<any>;
}

// Event emitter for applet generation
export interface GeneratedApplet {
  id: string;
  name: string;
  description: string;
  code: string;
}

type AppletGeneratedCallback = (applet: GeneratedApplet) => void;

let appletGeneratedCallback: AppletGeneratedCallback | null = null;

// Queue for applets generated before callback is registered
const pendingApplets: GeneratedApplet[] = [];

export function setAppletGeneratedCallback(callback: AppletGeneratedCallback | null) {
  appletGeneratedCallback = callback;

  // If callback is being set and we have pending applets, flush them
  if (callback && pendingApplets.length > 0) {
    console.log(`[AppletTool] Flushing ${pendingApplets.length} pending applet(s)`);
    const toFlush = [...pendingApplets];
    pendingApplets.length = 0; // Clear the queue
    toFlush.forEach(applet => {
      try {
        callback(applet);
      } catch (err) {
        console.error('[AppletTool] Error flushing pending applet:', err);
      }
    });
  }
}

// Get pending applets (for debugging)
export function getPendingApplets(): GeneratedApplet[] {
  return [...pendingApplets];
}

/**
 * Generate Applet Tool - Creates interactive React applets
 */
export const GenerateAppletTool: ToolDefinition = {
  id: 'generate-applet',
  name: 'Generate Applet',
  description: `Generate an interactive React applet that the user can interact with.

Use this tool when the user needs:
- A form or wizard to collect information
- A dashboard or visualization tool
- A calculator, converter, or interactive tool
- Any UI that would be better than text responses

CRITICAL CODE REQUIREMENTS:
1. Use "function Applet() {}" or "function Component() {}" syntax
2. DO NOT use arrow functions for the component (const Applet = () => {} will FAIL)
3. DO NOT use import/export statements
4. DO NOT use TypeScript type annotations (: string, interface, type)
5. Available: useState, useEffect, useCallback, useMemo, useRef, Math, JSON, console
6. Use Tailwind CSS classes for styling (dark theme: bg-gray-800, text-white)`,
  inputs: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the applet (e.g., "Budget Calculator", "NDA Generator")',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: 'Brief description of what the applet does',
      required: true,
    },
    {
      name: 'code',
      type: 'string',
      description: `The React component code. MUST use function declaration syntax:

function Applet({ onSubmit }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);

  function handleCalculate() {
    setResult(Math.sqrt(Number(value)));
  }

  return (
    <div className="p-6 space-y-4 bg-gray-800 text-white">
      <h2 className="text-xl font-bold">Calculator</h2>
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full p-2 bg-gray-700 border border-gray-600 rounded"
        placeholder="Enter a number..."
      />
      <button
        onClick={handleCalculate}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
      >
        Calculate Square Root
      </button>
      {result !== null && (
        <div className="p-4 bg-gray-700 rounded">
          Result: {result.toFixed(4)}
        </div>
      )}
    </div>
  );
}`,
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { name, description, code } = inputs;
    const MAX_FIX_ATTEMPTS = 3;

    if (!name || typeof name !== 'string') {
      throw new Error('Invalid name parameter');
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Invalid code parameter');
    }

    // Validate the code has a component
    if (
      !code.includes('function Component') &&
      !code.includes('const Component') &&
      !code.includes('function Applet') &&
      !code.includes('const Applet') &&
      !code.includes('function App') &&
      !code.includes('const App')
    ) {
      return {
        success: false,
        error: 'COMPILATION_ERROR: Code must define a component named Component, Applet, or App using "function" syntax.',
        hint: 'Use "function Applet({ onSubmit }) { ... }" NOT "const Applet = () => { ... }"',
        code_received: code.substring(0, 500) + (code.length > 500 ? '...' : ''),
      };
    }

    // Try to compile the code with auto-fix loop
    let currentCode = code;
    let lastError = '';
    const fixAttempts: string[] = [];

    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      try {
        const compileApplet = await getCompileApplet();
        const result = await compileApplet(currentCode);

        if (result.success) {
          // Compilation succeeded!
          const appletId = `applet-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

          const generatedApplet: GeneratedApplet = {
            id: appletId,
            name,
            description: description || '',
            code: currentCode,
          };

          // Emit event for the UI to pick up (only after successful validation)
          if (appletGeneratedCallback) {
            console.log(`[AppletTool] Emitting applet: ${name}${attempt > 1 ? ` (fixed on attempt ${attempt})` : ''}`);
            try {
              appletGeneratedCallback(generatedApplet);
            } catch (err) {
              console.error('[AppletTool] Error in applet callback:', err);
              pendingApplets.push(generatedApplet);
            }
          } else {
            console.log(`[AppletTool] No callback registered, queuing applet: ${name}`);
            pendingApplets.push(generatedApplet);
          }

          return {
            success: true,
            appletId,
            name,
            description,
            message: attempt > 1
              ? `Applet "${name}" compiled successfully after ${attempt} attempt(s) and is now live in the Applets panel.`
              : `Applet "${name}" compiled successfully and is now live in the Applets panel.`,
            _isApplet: true,
            _queued: !appletGeneratedCallback,
            _fixAttempts: attempt > 1 ? fixAttempts : undefined,
          };
        }

        // Compilation failed - try to auto-fix
        lastError = result.error || 'Unknown compilation error';
        console.log(`[AppletTool] Compilation failed (attempt ${attempt}/${MAX_FIX_ATTEMPTS}): ${lastError}`);

        // Check if this is a code error that can be fixed (not infrastructure error)
        const { fixAppletError, isCodeError } = await getErrorFixer();

        if (!isCodeError(lastError)) {
          // Infrastructure error (like Babel not loading) - can't fix with LLM
          console.log('[AppletTool] Infrastructure error detected, cannot auto-fix');
          break;
        }

        // Try to fix with LLM
        if (attempt < MAX_FIX_ATTEMPTS) {
          console.log(`[AppletTool] Attempting AI fix (attempt ${attempt}/${MAX_FIX_ATTEMPTS})...`);
          const fixResult = await fixAppletError(currentCode, lastError, name, attempt);

          if (fixResult.success && fixResult.fixedCode) {
            fixAttempts.push(`Attempt ${attempt}: ${lastError.substring(0, 100)}... -> Fixed`);
            currentCode = fixResult.fixedCode;
            console.log(`[AppletTool] AI fix applied, retrying compilation...`);
            continue;
          } else {
            fixAttempts.push(`Attempt ${attempt}: ${lastError.substring(0, 100)}... -> Fix failed: ${fixResult.error}`);
            console.log(`[AppletTool] AI fix failed: ${fixResult.error}`);
          }
        }
      } catch (compileError: any) {
        lastError = compileError.message || 'Unknown error';
        console.log(`[AppletTool] Compilation exception (attempt ${attempt}/${MAX_FIX_ATTEMPTS}): ${lastError}`);

        // Check if we can fix this
        const { fixAppletError, isCodeError } = await getErrorFixer();

        if (!isCodeError(lastError)) {
          break;
        }

        if (attempt < MAX_FIX_ATTEMPTS) {
          const fixResult = await fixAppletError(currentCode, lastError, name, attempt);

          if (fixResult.success && fixResult.fixedCode) {
            fixAttempts.push(`Attempt ${attempt}: ${lastError.substring(0, 100)}... -> Fixed`);
            currentCode = fixResult.fixedCode;
            continue;
          } else {
            fixAttempts.push(`Attempt ${attempt}: ${lastError.substring(0, 100)}... -> Fix failed: ${fixResult.error}`);
          }
        }
      }
    }

    // All attempts failed - return error to LLM
    return {
      success: false,
      error: `COMPILATION_ERROR: ${lastError}`,
      hint: 'The code failed to compile after multiple auto-fix attempts. Please review and fix manually. Common issues: 1) Arrow functions instead of function declarations, 2) TypeScript types, 3) Import/export statements, 4) Unescaped special characters in template strings.',
      code_received: code.substring(0, 500) + (code.length > 500 ? '...' : ''),
      fixAttempts: fixAttempts.length > 0 ? fixAttempts : undefined,
    };
  },
};

/**
 * Write File Tool
 */
export const WriteFileTool: ToolDefinition = {
  id: 'write-file',
  name: 'Write File',
  description: 'Write content to a file in the virtual file system',
  inputs: [
    {
      name: 'path',
      type: 'string',
      description: 'File path (e.g., projects/my_project/output/code/analysis.py)',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'File content to write',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { path, content } = inputs;

    if (!path || typeof path !== 'string') {
      throw new Error('Invalid path parameter');
    }

    if (content === undefined || content === null) {
      throw new Error('Content parameter is required');
    }

    const vfs = getVFS();
    vfs.writeFile(path, String(content));

    return {
      success: true,
      path,
      size: content.length,
      message: `File written successfully: ${path}`,
    };
  },
};

/**
 * Read File Tool
 */
export const ReadFileTool: ToolDefinition = {
  id: 'read-file',
  name: 'Read File',
  description: 'Read content from a file in the virtual file system or system directory',
  inputs: [
    {
      name: 'path',
      type: 'string',
      description: 'File path to read (supports /system/* for system files and projects/* for VFS files)',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { path } = inputs;

    if (!path || typeof path !== 'string') {
      throw new Error('Invalid path parameter');
    }

    // Handle system files (from public/system/)
    if (path.startsWith('/system/') || path.startsWith('system/')) {
      const systemPath = path.replace(/^\//, ''); // Remove leading slash

      try {
        const response = await fetch(`/${systemPath}`);
        if (!response.ok) {
          throw new Error(`System file not found: ${path}`);
        }
        const content = await response.text();

        return {
          success: true,
          path,
          content,
          size: content.length,
          readonly: true,
          type: 'system',
        };
      } catch (error: any) {
        throw new Error(`Failed to read system file: ${error.message}`);
      }
    }

    // Handle VFS files (projects/*)
    const vfs = getVFS();
    const file = vfs.readFile(path);

    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    return {
      success: true,
      path: file.path,
      content: file.content,
      size: file.size,
      created: file.created,
      modified: file.modified,
      type: 'vfs',
    };
  },
};

/**
 * List Directory Tool
 */
export const ListDirectoryTool: ToolDefinition = {
  id: 'list-directory',
  name: 'List Directory',
  description: 'List files and subdirectories in a directory',
  inputs: [
    {
      name: 'path',
      type: 'string',
      description: 'Directory path to list',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { path } = inputs;

    const vfs = getVFS();
    const { files, directories } = vfs.listDirectory(path);

    return {
      success: true,
      path,
      files: files.map(f => ({ path: f.path, size: f.size, modified: f.modified })),
      directories,
    };
  },
};

/**
 * Execute Python Tool
 */
export const ExecutePythonTool: ToolDefinition = {
  id: 'execute-python',
  name: 'Execute Python',
  description: 'Execute Python code in the browser runtime (Pyodide)',
  inputs: [
    {
      name: 'code',
      type: 'string',
      description: 'Python code to execute',
      required: true,
    },
    {
      name: 'projectPath',
      type: 'string',
      description: 'Optional project path to save generated images (e.g., projects/my_project)',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { code, projectPath } = inputs;

    if (!code || typeof code !== 'string') {
      throw new Error('Invalid code parameter');
    }

    const result = await executePython(code);

    if (!result.success) {
      throw new Error(result.error || 'Python execution failed');
    }

    // Save images to VFS if project path provided
    const savedImagePaths: string[] = [];
    if (projectPath && result.images && result.images.length > 0) {
      const vfs = getVFS();
      const visualizationPath = `${projectPath}/output/visualizations`;

      for (let i = 0; i < result.images.length; i++) {
        const base64Image = result.images[i];
        const imageName = `plot_${Date.now()}_${i + 1}.png`;
        const imagePath = `${visualizationPath}/${imageName}`;

        // Save base64 image as a text file with metadata
        const imageData = {
          format: 'png',
          base64: base64Image,
          createdAt: new Date().toISOString(),
          index: i + 1,
        };

        try {
          vfs.writeFile(imagePath, JSON.stringify(imageData, null, 2));
          savedImagePaths.push(imagePath);
        } catch (error) {
          console.warn(`Failed to save image to VFS: ${imagePath}`, error);
        }
      }
    }

    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      images: result.images, // Base64 encoded matplotlib images
      savedImages: savedImagePaths.length > 0 ? savedImagePaths : undefined,
      executionTime: result.executionTime,
    };
  },
};

/**
 * Discover Sub-Agents Tool
 * Lists available markdown sub-agent definitions with usage statistics
 */
export const DiscoverSubAgentsTool: ToolDefinition = {
  id: 'discover-subagents',
  name: 'Discover Sub-Agents',
  description: 'Discover available markdown sub-agent definitions. Searches /system/agents/ for system agents and projects/*/components/agents/ for project-specific agents. Returns agent metadata and usage statistics to help decide which agent to use.',
  inputs: [
    {
      name: 'location',
      type: 'string',
      description: 'Where to search: "system" for /system/agents/, "projects" for all projects, or specific path like "projects/my_project/components/agents/"',
      required: false,
    },
    {
      name: 'capability',
      type: 'string',
      description: 'Optional capability filter (e.g., "signal processing", "FFT", "data analysis")',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { location, capability } = inputs;
    const vfs = getVFS();
    const usageStats = getSubAgentUsage();

    interface AgentInfo {
      name: string;
      path: string;
      location: string;
      type?: string;
      description?: string;
      capabilities: string[];
      libraries: string[];
      usageCount: number;
      successRate: number | null;
      lastUsed: string | null;
    }

    const agents: AgentInfo[] = [];

    // Helper to parse frontmatter from markdown
    const parseAgentFrontmatter = (content: string, filePath: string): Partial<AgentInfo> => {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const result: Partial<AgentInfo> = { capabilities: [], libraries: [] };

      if (!frontmatterMatch) return result;

      const frontmatter = frontmatterMatch[1];

      // Parse YAML-like frontmatter
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      result.name = nameMatch ? nameMatch[1].trim() : filePath.split('/').pop()?.replace('.md', '');

      const typeMatch = frontmatter.match(/type:\s*(.+)/);
      if (typeMatch) result.type = typeMatch[1].trim();

      // Try to get description from frontmatter or first paragraph
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      if (descMatch) {
        result.description = descMatch[1].trim();
      } else {
        // Try first heading after frontmatter
        const headingMatch = content.match(/^#\s+(.+)/m);
        if (headingMatch) result.description = headingMatch[1].trim();
      }

      // Parse capabilities array
      const capMatch = frontmatter.match(/capabilities:\n((?:\s+-\s+.+\n?)+)/);
      if (capMatch) {
        result.capabilities = capMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
      }

      // Parse libraries array
      const libMatch = frontmatter.match(/libraries:\n((?:\s+-\s+.+\n?)+)/);
      if (libMatch) {
        result.libraries = libMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
      }

      return result;
    };

    // Search system agents (via fetch since they're in public/)
    const searchSystem = !location || location === 'system';
    if (searchSystem) {
      // Known system agents (since we can't list directory contents via fetch)
      const knownSystemAgents = [
        'researcher.md',
        'artifact-refiner.md',
        'code-debugger.md',
        'MemoryAnalysisAgent.md',
        'MemoryConsolidationAgent.md',
        'AppletDebuggerAgent.md',
        'LensSelectorAgent.md',
        'MutationAgent.md',
        'PatternMatcherAgent.md',
        'PlanningAgent.md',
        'SystemAgent.md',
        'UXDesigner.md',
        'ProjectAgentPlanner.md',
        'HardwareControlAgent.md',
      ];

      for (const fileName of knownSystemAgents) {
        try {
          const response = await fetch(`/system/agents/${fileName}`);
          if (response.ok) {
            const content = await response.text();
            const agentPath = `/system/agents/${fileName}`;
            const parsed = parseAgentFrontmatter(content, agentPath);
            const usage = usageStats.find(u => u.agentPath === agentPath);

            agents.push({
              name: parsed.name || fileName.replace('.md', ''),
              path: agentPath,
              location: 'system',
              type: parsed.type,
              description: parsed.description,
              capabilities: parsed.capabilities || [],
              libraries: parsed.libraries || [],
              usageCount: usage?.executionCount || 0,
              successRate: usage
                ? Math.round((usage.successCount / Math.max(1, usage.executionCount)) * 100)
                : null,
              lastUsed: usage?.lastExecuted || null,
            });
          }
        } catch (e) {
          // Agent doesn't exist or can't be read
        }
      }
    }

    // Search project agents (via VFS)
    const searchProjects = !location || location === 'projects' || location?.startsWith('projects/');
    if (searchProjects) {
      const projectsToSearch: string[] = [];

      if (location?.startsWith('projects/') && location !== 'projects') {
        // Specific project path
        projectsToSearch.push(location.replace(/\/components\/agents\/?$/, ''));
      } else {
        // List all projects
        try {
          const { directories } = vfs.listDirectory('projects');
          projectsToSearch.push(...directories);
        } catch (e) {
          // No projects directory
        }
      }

      for (const projectPath of projectsToSearch) {
        const agentsDir = `${projectPath}/components/agents`;
        try {
          const { files } = vfs.listDirectory(agentsDir);
          for (const file of files) {
            if (!file.path.endsWith('.md')) continue;

            const content = vfs.readFileContent(file.path);
            if (!content) continue;

            const parsed = parseAgentFrontmatter(content, file.path);
            const usage = usageStats.find(u => u.agentPath === file.path);

            agents.push({
              name: parsed.name || file.path.split('/').pop()?.replace('.md', '') || 'Unknown',
              path: file.path,
              location: projectPath,
              type: parsed.type,
              description: parsed.description,
              capabilities: parsed.capabilities || [],
              libraries: parsed.libraries || [],
              usageCount: usage?.executionCount || 0,
              successRate: usage
                ? Math.round((usage.successCount / Math.max(1, usage.executionCount)) * 100)
                : null,
              lastUsed: usage?.lastExecuted || null,
            });
          }
        } catch (e) {
          // No agents directory in this project
        }
      }
    }

    // Apply capability filter
    let filteredAgents = agents;
    if (capability) {
      const searchTerm = capability.toLowerCase();
      filteredAgents = agents.filter(a =>
        a.capabilities.some(cap => cap.toLowerCase().includes(searchTerm)) ||
        a.description?.toLowerCase().includes(searchTerm) ||
        a.name.toLowerCase().includes(searchTerm) ||
        a.libraries.some(lib => lib.toLowerCase().includes(searchTerm))
      );
    }

    // Sort by usage (most used first), then by location (system first)
    filteredAgents.sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
      if (a.location === 'system' && b.location !== 'system') return -1;
      if (b.location === 'system' && a.location !== 'system') return 1;
      return 0;
    });

    return {
      success: true,
      totalAgents: filteredAgents.length,
      agents: filteredAgents,
      message: `Found ${filteredAgents.length} sub-agent definition(s)`,
      hint: 'To use an agent: 1) Read its definition with read-file, 2) Generate code following its instructions, 3) Execute with invoke-subagent to track usage.',
    };
  },
};

/**
 * Invoke Sub-Agent Tool
 * Executes Python code on behalf of a markdown sub-agent and tracks usage
 */
export const InvokeSubAgentTool: ToolDefinition = {
  id: 'invoke-subagent',
  name: 'Invoke Sub-Agent',
  description: 'Execute Python code on behalf of a markdown sub-agent. This tracks the agent\'s usage for evolution analysis. Use this instead of execute-python when running code generated from a sub-agent\'s instructions.',
  inputs: [
    {
      name: 'agentPath',
      type: 'string',
      description: 'Path to the markdown sub-agent definition (e.g., /system/agents/SignalProcessorAgent.md or projects/my_project/components/agents/MyAgent.md)',
      required: true,
    },
    {
      name: 'agentName',
      type: 'string',
      description: 'Name of the sub-agent being invoked',
      required: true,
    },
    {
      name: 'task',
      type: 'string',
      description: 'Brief description of the task being performed',
      required: true,
    },
    {
      name: 'code',
      type: 'string',
      description: 'Python code generated based on the agent\'s instructions',
      required: true,
    },
    {
      name: 'projectPath',
      type: 'string',
      description: 'Optional project path to save generated images',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { agentPath, agentName, task, code, projectPath } = inputs;
    const startTime = Date.now();

    if (!agentPath || typeof agentPath !== 'string') {
      throw new Error('Invalid agentPath parameter');
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Invalid code parameter');
    }

    console.log(`[InvokeSubAgent] Invoking ${agentName} from ${agentPath}`);
    console.log(`[InvokeSubAgent] Task: ${task?.substring(0, 100)}...`);

    // Execute the Python code
    const result = await executePython(code);

    const executionTime = Date.now() - startTime;

    // Determine volume from path for tracking
    let volume: VolumeType = 'user';
    if (agentPath.startsWith('/system/') || agentPath.startsWith('system/')) {
      volume = 'system';
    } else if (agentPath.includes('team/')) {
      volume = 'team';
    }

    // Track usage for evolution analysis
    const { recordSubAgentExecution } = await import('./subagents/usage-tracker');
    recordSubAgentExecution(
      agentPath,
      agentName || agentPath.split('/').pop()?.replace('.md', '') || 'unknown',
      volume,
      task || 'Unknown task',
      result.success,
      executionTime
    );

    // Save images to VFS if project path provided
    const savedImagePaths: string[] = [];
    if (projectPath && result.images && result.images.length > 0) {
      const visualizationPath = `${projectPath}/output/visualizations`;

      for (let i = 0; i < result.images.length; i++) {
        const base64Image = result.images[i];
        const imageName = `plot_${Date.now()}_${i + 1}.png`;
        const imagePath = `${visualizationPath}/${imageName}`;

        const imageData = {
          format: 'png',
          base64: base64Image,
          createdAt: new Date().toISOString(),
          index: i + 1,
          agent: agentName,
        };

        try {
          const vfs = getVFS();
          vfs.writeFile(imagePath, JSON.stringify(imageData, null, 2));
          savedImagePaths.push(imagePath);
        } catch (error) {
          console.warn(`Failed to save image to VFS: ${imagePath}`, error);
        }
      }
    }

    if (!result.success) {
      return {
        success: false,
        agentPath,
        agentName,
        task,
        error: result.error || 'Execution failed',
        executionTime,
        message: `Sub-agent ${agentName} failed: ${result.error}`,
      };
    }

    return {
      success: true,
      agentPath,
      agentName,
      task,
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      images: result.images,
      savedImages: savedImagePaths.length > 0 ? savedImagePaths : undefined,
      executionTime,
      message: `Sub-agent ${agentName} completed successfully in ${executionTime}ms`,
    };
  },
};

/**
 * Validate Project Agents Tool
 * Validates that a project meets the 3-agent minimum requirement
 */
export const ValidateProjectAgentsTool: ToolDefinition = {
  id: 'validate-project-agents',
  name: 'Validate Project Agents',
  description: `Validates that a project meets the multi-agent requirement (minimum ${MIN_AGENTS_REQUIRED} agents).

Use this tool to:
- Check if a project has enough agents before completion
- Get recommendations for additional agents if needed
- See breakdown of agents by origin (copied, evolved, created)

Returns validation status, agent inventory, and recommendations for missing agents.`,
  inputs: [
    {
      name: 'projectPath',
      type: 'string',
      description: 'Path to the project (e.g., "projects/my_project")',
      required: true,
    },
    {
      name: 'userGoal',
      type: 'string',
      description: 'Optional user goal to provide context-aware recommendations for missing agents',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { projectPath, userGoal } = inputs;

    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Invalid projectPath parameter');
    }

    // Validate the project
    const validation = validateProjectAgents(projectPath);

    // Get context-aware suggestions if goal provided and validation failed
    let suggestions: any[] = [];
    if (!validation.isValid && userGoal) {
      suggestions = await suggestAgentsForProject(projectPath, userGoal);
    }

    return {
      success: true,
      isValid: validation.isValid,
      agentCount: validation.agentCount,
      minimumRequired: validation.minimumRequired,
      missingCount: validation.missingCount,
      agents: validation.agents.map(a => ({
        name: a.name,
        path: a.path,
        type: a.type,
        origin: a.origin,
        evolvedFrom: a.evolvedFrom,
        capabilities: a.capabilities,
      })),
      breakdown: {
        copied: validation.agentsByOrigin.copied.length,
        evolved: validation.agentsByOrigin.evolved.length,
        created: validation.agentsByOrigin.created.length,
      },
      recommendations: validation.isValid ? undefined : validation.recommendations,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      message: validation.message,
      formattedReport: formatValidationForLLM(validation),
    };
  },
};

/**
 * Connect Device Tool
 */
export const ConnectDeviceTool: ToolDefinition = {
  id: 'connect-device',
  name: 'Connect Device',
  description: 'Connect to ESP32-S3 device via Web Serial or virtual device for testing.',
  inputs: [
    {
      name: 'useVirtual',
      type: 'boolean',
      description: 'Use virtual device for testing without physical hardware (default: false)',
      required: false,
    },
    {
      name: 'deviceName',
      type: 'string',
      description: 'Optional name for virtual device (only used if useVirtual=true)',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { useVirtual = false, deviceName } = inputs;
    const { SerialManager } = await import('./hardware/serial-manager');

    let deviceId: string;
    let metadata: any;

    if (useVirtual) {
      // Connect to virtual device (no browser picker needed)
      deviceId = await SerialManager.connectVirtual(deviceName);
      const conn = SerialManager.getConnection(deviceId);
      metadata = conn?.metadata;

      return {
        success: true,
        deviceId,
        metadata,
        virtual: true,
        message: `Connected to virtual device ${deviceId}. Use send-device-command to interact.`,
      };
    } else {
      // Connect to physical device
      if (!SerialManager.isSupported()) {
        throw new Error('Web Serial API not supported. Use Chrome/Edge 89+ on HTTPS or localhost. Or use useVirtual=true for testing.');
      }

      deviceId = await SerialManager.connect();
      const conn = SerialManager.getConnection(deviceId);
      metadata = conn?.metadata;

      return {
        success: true,
        deviceId,
        metadata,
        virtual: false,
        message: `Connected to physical device ${deviceId}. Use send-device-command to interact.`,
      };
    }
  },
};

/**
 * Send Device Command Tool
 */
export const SendDeviceCommandTool: ToolDefinition = {
  id: 'send-device-command',
  name: 'Send Device Command',
  description: 'Send JSON command to connected device and wait for response.',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID from connect-device',
      required: true,
    },
    {
      name: 'command',
      type: 'object',
      description: 'JSON command object (e.g., {"action":"set_gpio","pin":4,"state":1})',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, command } = inputs;
    const { SerialManager } = await import('./hardware/serial-manager');

    if (!SerialManager.isConnected(deviceId)) {
      throw new Error(`Device ${deviceId} not connected. Use connect-device first.`);
    }

    const response = await SerialManager.sendCommand(deviceId, command);

    return {
      success: response.status === 'ok',
      response,
      message: response.status === 'ok'
        ? `Command ${command.action} executed successfully`
        : `Error: ${response.msg || 'Unknown error'}`,
    };
  },
};

/**
 * List Devices Tool
 */
export const ListDevicesTool: ToolDefinition = {
  id: 'list-devices',
  name: 'List Devices',
  description: 'List all currently connected devices',
  inputs: [],
  execute: async () => {
    const { SerialManager } = await import('./hardware/serial-manager');
    const connections = SerialManager.getAllConnections();

    return {
      success: true,
      devices: connections.map(conn => ({
        id: conn.id,
        name: conn.metadata.name,
        connected: conn.connected,
        connectedAt: conn.connectedAt,
        vendorId: conn.metadata.vendorId,
        productId: conn.metadata.productId,
      })),
      count: connections.length,
      message: `Found ${connections.length} connected device(s)`,
    };
  },
};

/**
 * Create Device Project Tool
 */
export const CreateDeviceProjectTool: ToolDefinition = {
  id: 'create-device-project',
  name: 'Create Device Project',
  description: 'Create a device monitoring project with cron polling and state management.',
  inputs: [
    {
      name: 'projectName',
      type: 'string',
      description: 'Project name (e.g., "esp32-bench-monitor")',
      required: true,
    },
    {
      name: 'deviceId',
      type: 'string',
      description: 'Connected device ID',
      required: true,
    },
    {
      name: 'pollInterval',
      type: 'number',
      description: 'Polling interval in milliseconds (default: 1000)',
      required: false,
    },
    {
      name: 'commands',
      type: 'array',
      description: 'Array of commands to execute on each poll (e.g., [{"action":"read_i2c","sensor":"ina219"}])',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { projectName, deviceId, pollInterval = 1000, commands = [] } = inputs;
    const vfs = getVFS();
    const { SerialManager } = await import('./hardware/serial-manager');

    if (!SerialManager.isConnected(deviceId)) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    const projectPath = `projects/${projectName}`;

    // Create project structure
    const deviceConfig = {
      deviceId,
      name: projectName,
      created: new Date().toISOString(),
      pollInterval,
    };

    vfs.writeFile(`${projectPath}/device.config.json`, JSON.stringify(deviceConfig, null, 2));
    vfs.writeFile(`${projectPath}/state/connection.json`, JSON.stringify({
      connected: true,
      deviceId,
      lastUpdate: new Date().toISOString()
    }, null, 2));
    vfs.writeFile(`${projectPath}/state/sensors.json`, JSON.stringify({}, null, 2));
    vfs.writeFile(`${projectPath}/state/gpio.json`, JSON.stringify({}, null, 2));

    // Create cron job for polling
    const cronConfig = {
      id: `device-poll-${deviceId}`,
      name: `Poll ${projectName}`,
      projectPath,
      deviceId,
      interval: pollInterval,
      enabled: true,
      commands: commands.length > 0 ? commands : [
        { action: 'get_info' },
      ],
    };

    vfs.writeFile(`${projectPath}/cron/poll-device.json`, JSON.stringify(cronConfig, null, 2));

    // Register cron with device handler
    const { registerDeviceCron } = await import('./hardware/device-cron-handler');
    await registerDeviceCron(cronConfig);

    return {
      success: true,
      projectPath,
      cronId: cronConfig.id,
      pollInterval,
      message: `Device project created at ${projectPath}. Polling every ${pollInterval}ms.`,
    };
  },
};

/**
 * Disconnect Device Tool
 */
export const DisconnectDeviceTool: ToolDefinition = {
  id: 'disconnect-device',
  name: 'Disconnect Device',
  description: 'Disconnect a device and stop its cron polling',
  inputs: [
    {
      name: 'deviceId',
      type: 'string',
      description: 'Device ID to disconnect',
      required: true,
    },
    {
      name: 'stopCron',
      type: 'boolean',
      description: 'Stop associated cron job (default: true)',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { deviceId, stopCron = true } = inputs;
    const { SerialManager } = await import('./hardware/serial-manager');

    if (stopCron) {
      const { unregisterDeviceCron } = await import('./hardware/device-cron-handler');
      unregisterDeviceCron(`device-poll-${deviceId}`);
    }

    await SerialManager.disconnect(deviceId);

    return {
      success: true,
      deviceId,
      message: `Device ${deviceId} disconnected${stopCron ? ' and cron stopped' : ''}`,
    };
  },
};

/**
 * Deploy WASM App Tool
 * Compiles C code to WebAssembly and deploys to ESP32 WASMachine
 */
export const DeployWasmAppTool: ToolDefinition = {
  id: 'deploy-wasm-app',
  name: 'Deploy WASM App',
  description: `Compile C source code to WebAssembly and deploy to ESP32 WASMachine device.

Use this tool when:
- User needs autonomous/offline operation
- Complex logic with state machines
- MQTT, HTTP, or cloud integration (RainMaker)
- Production deployment
- Battery-powered devices (sleep modes)

The C code will be compiled using wasi-sdk, then deployed via TCP to the ESP32's WAMR runtime.

Available native APIs (see esp32-wasm-native-api.md skill):
- MQTT: wasm_mqtt_init(), wasm_mqtt_publish(), wasm_mqtt_subscribe()
- RainMaker: rmaker_node_init(), rmaker_device_create(), rmaker_param_update()
- WiFi: wifi_connect(), wifi_get_status()
- HTTP: http_get(), http_post()
- LVGL: lv_label_create(), lv_label_set_text()

Hardware access via VFS (see esp32-wasm-development.md skill):
- GPIO: open("/dev/gpio", O_RDWR) + ioctl()
- I2C: open("/dev/i2c/0", O_RDWR) + ioctl()
- SPI: open("/dev/spi/0", O_RDWR) + ioctl()`,
  inputs: [
    {
      name: 'sourceCode',
      type: 'string',
      description: 'C source code to compile. Must include main() function.',
      required: true,
    },
    {
      name: 'appName',
      type: 'string',
      description: 'Application name (alphanumeric, no spaces)',
      required: true,
    },
    {
      name: 'deviceIp',
      type: 'string',
      description: 'ESP32 device IP address (e.g., "192.168.1.100")',
      required: true,
    },
    {
      name: 'heapSize',
      type: 'number',
      description: 'Heap size in bytes (default: 8192). Increase for MQTT/networking (16384-32768)',
      required: false,
    },
    {
      name: 'optimizationLevel',
      type: 'string',
      description: 'Compiler optimization level: 0, 1, 2, 3, s, z (default: "3")',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { sourceCode, appName, deviceIp, heapSize = 8192, optimizationLevel = '3' } = inputs;

    if (!sourceCode || typeof sourceCode !== 'string') {
      throw new Error('Invalid sourceCode parameter');
    }

    if (!appName || typeof appName !== 'string') {
      throw new Error('Invalid appName parameter');
    }

    if (!deviceIp || typeof deviceIp !== 'string') {
      throw new Error('Invalid deviceIp parameter');
    }

    console.log(`[DeployWasmApp] Compiling ${appName}...`);

    // Step 1: Compile C to WASM
    try {
      const compileResponse = await fetch('/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceCode,
          name: appName,
          optimizationLevel,
        }),
      });

      const compileResult = await compileResponse.json();

      if (!compileResult.success) {
        return {
          success: false,
          error: 'Compilation failed',
          details: compileResult.error || compileResult.details,
          hint: compileResult.hint,
        };
      }

      console.log(`[DeployWasmApp] Compilation successful: ${compileResult.size} bytes`);

      // Step 2: Deploy WASM binary to device
      const { installWasmApp } = await import('./hardware/wasm-deployer');

      const wasmBinary = Buffer.from(compileResult.wasmBase64, 'base64');

      const deployResult = await installWasmApp(
        { deviceIp },
        {
          appName,
          wasmBinary,
          heapSize,
        }
      );

      if (!deployResult.success) {
        return {
          success: false,
          error: 'Deployment failed',
          details: deployResult.error,
          compiledSize: compileResult.size,
        };
      }

      console.log(`[DeployWasmApp] Deployment successful: ${appName} on ${deviceIp}`);

      return {
        success: true,
        appName,
        deviceIp,
        heapSize,
        compiledSize: compileResult.size,
        message: `App "${appName}" compiled (${compileResult.size} bytes) and deployed to ${deviceIp}. Heap: ${heapSize} bytes.`,
      };

    } catch (error: any) {
      console.error('[DeployWasmApp] Error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  },
};

/**
 * Query WASM Apps Tool
 * Lists installed WebAssembly applications on ESP32 device
 */
export const QueryWasmAppsTool: ToolDefinition = {
  id: 'query-wasm-apps',
  name: 'Query WASM Apps',
  description: 'Query installed WebAssembly applications on ESP32 WASMachine device.',
  inputs: [
    {
      name: 'deviceIp',
      type: 'string',
      description: 'ESP32 device IP address',
      required: true,
    },
    {
      name: 'appName',
      type: 'string',
      description: 'Optional: Query specific app by name',
      required: false,
    },
  ],
  execute: async (inputs) => {
    const { deviceIp, appName } = inputs;

    if (!deviceIp || typeof deviceIp !== 'string') {
      throw new Error('Invalid deviceIp parameter');
    }

    try {
      const { queryWasmApps } = await import('./hardware/wasm-deployer');

      const result = await queryWasmApps({ deviceIp }, appName);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        deviceIp,
        apps: result.apps || [],
        count: result.apps?.length || 0,
        message: `Found ${result.apps?.length || 0} WASM app(s) on ${deviceIp}`,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  },
};

/**
 * Uninstall WASM App Tool
 * Removes a WebAssembly application from ESP32 device
 */
export const UninstallWasmAppTool: ToolDefinition = {
  id: 'uninstall-wasm-app',
  name: 'Uninstall WASM App',
  description: 'Uninstall a WebAssembly application from ESP32 WASMachine device.',
  inputs: [
    {
      name: 'deviceIp',
      type: 'string',
      description: 'ESP32 device IP address',
      required: true,
    },
    {
      name: 'appName',
      type: 'string',
      description: 'Application name to uninstall',
      required: true,
    },
  ],
  execute: async (inputs) => {
    const { deviceIp, appName } = inputs;

    if (!deviceIp || typeof deviceIp !== 'string') {
      throw new Error('Invalid deviceIp parameter');
    }

    if (!appName || typeof appName !== 'string') {
      throw new Error('Invalid appName parameter');
    }

    try {
      const { uninstallWasmApp } = await import('./hardware/wasm-deployer');

      const result = await uninstallWasmApp({ deviceIp }, appName);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        deviceIp,
        appName,
        message: `App "${appName}" uninstalled from ${deviceIp}`,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  },
};

/**
 * Get all system tools
 */
export function getSystemTools(): ToolDefinition[] {
  return [
    WriteFileTool,
    ReadFileTool,
    ListDirectoryTool,
    ExecutePythonTool,
    DiscoverSubAgentsTool,
    InvokeSubAgentTool,
    GenerateAppletTool,
    ValidateProjectAgentsTool,
    ConnectDeviceTool,
    SendDeviceCommandTool,
    ListDevicesTool,
    CreateDeviceProjectTool,
    DisconnectDeviceTool,
    DeployWasmAppTool,
    QueryWasmAppsTool,
    UninstallWasmAppTool,
  ];
}

/**
 * Get tool by ID
 */
export function getToolById(id: string): ToolDefinition | undefined {
  return getSystemTools().find(tool => tool.id === id);
}

/**
 * Execute a tool
 */
export async function executeSystemTool(
  toolId: string,
  inputs: Record<string, any>
): Promise<any> {
  const tool = getToolById(toolId);

  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  // Validate required inputs
  for (const input of tool.inputs) {
    if (input.required && (inputs[input.name] === undefined || inputs[input.name] === null)) {
      throw new Error(`Required input missing: ${input.name}`);
    }
  }

  try {
    return await tool.execute(inputs);
  } catch (error: any) {
    throw new Error(`Tool execution failed: ${error.message || error}`);
  }
}
