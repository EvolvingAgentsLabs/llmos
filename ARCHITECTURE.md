# LLMos-Lite UI - Technical Architecture

Complete technical documentation for developers implementing and extending the Claude Code-style experience in LLMos-Lite.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Architecture](#core-architecture)
3. [Volume File System](#volume-file-system)
4. [LLM Tool System](#llm-tool-system)
5. [Live Runtime](#live-runtime)
6. [Git Operations](#git-operations)
7. [Sub-Agent System](#sub-agent-system)
8. [UI Components](#ui-components)
9. [Data Flow](#data-flow)
10. [API Integration](#api-integration)
11. [State Management](#state-management)
12. [Performance & Optimization](#performance--optimization)

---

## System Overview

### Design Philosophy

LLMos-Lite implements a **Claude Code-style file-first architecture** where:
- Files in Git-backed volumes are the source of truth (not chat artifacts)
- LLM interacts with files through explicit tools (Read/Write/Edit/Delete)
- All code executes in a browser-based Python runtime (Pyodide)
- Git operations integrate seamlessly into the chat workflow

### Key Differentiators

```
Traditional Chat UI              Claude Code Style (LLMos-Lite)
─────────────────                ───────────────────────────────
LLM → Markdown → Display         LLM → File Tools → Git Volume
User → Copy/Paste → IDE          User → Chat → Live File Edit
Code → Static Display            Code → Live Execution
No Persistence                   Git-Backed Persistence
```

---

## Core Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  - React Components (Next.js 14)                            │
│  - VSCode-inspired 3-panel layout                           │
│  - Real-time UI updates                                      │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  - Volume File System (file-operations.ts)                  │
│  - LLM Client with Tool Support (llm-client-enhanced.ts)    │
│  - Live Runtime (Pyodide) (live-preview.ts)                 │
│  - Sub-Agent Executor (subagent-executor.ts)                │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                         │
│  - GitHub API (Git operations)                              │
│  - Browser LocalStorage (cache)                             │
│  - Pyodide MEMFS (runtime files)                            │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
ui/
├── lib/                          # Core library code
│   ├── volumes/                  # Volume & Git management
│   │   ├── file-operations.ts    # VolumeFileSystem class
│   │   └── git-operations.ts     # GitOperations class
│   ├── llm-tools/                # LLM tool definitions
│   │   └── file-tools.ts         # FileTools class (6 tools)
│   ├── llm-client-enhanced.ts    # LLM client with tools
│   ├── runtime/                  # Code execution
│   │   └── live-preview.ts       # LivePreview (Pyodide)
│   └── subagents/                # Sub-agent system
│       └── subagent-executor.ts  # SubAgentExecutor class
├── components/                   # React components
│   ├── canvas/                   # Canvas views
│   │   ├── CanvasView.tsx        # Main canvas router
│   │   └── SplitViewCanvas.tsx   # Code | Preview split
│   ├── chat/                     # Chat interface
│   │   ├── ChatPanel.tsx         # Main chat UI
│   │   └── ToolUseDisplay.tsx    # Tool visualization
│   ├── explorer/                 # File explorer
│   │   └── VolumeExplorer.tsx    # VSCode-style tree
│   ├── git/                      # Git UI
│   │   └── GitStatusWidget.tsx   # Git status display
│   └── subagents/                # Agent UI
│       └── AgentList.tsx         # Available agents
└── app/                          # Next.js app
    └── page.tsx                  # Main application
```

---

## Volume File System

### Design: Git-Backed Volumes

Each volume is a GitHub repository:

```typescript
// lib/volumes/file-operations.ts

export type VolumeType = 'system' | 'team' | 'user';

interface VolumeConfig {
  name: VolumeType;
  repoOwner: string;
  repoName: string;
  branch: string;
  readonly: boolean;
  githubToken?: string;
}

// Example configurations
const VOLUMES: Record<VolumeType, VolumeConfig> = {
  system: {
    name: 'system',
    repoOwner: 'llmunix',
    repoName: 'system-volume',
    branch: 'main',
    readonly: true  // Users cannot modify
  },
  team: {
    name: 'team',
    repoOwner: 'your-org',
    repoName: 'team-volume',
    branch: 'main',
    readonly: false
  },
  user: {
    name: 'user',
    repoOwner: 'current-user',
    repoName: 'llmos-workspace',
    branch: 'main',
    readonly: false
  }
};
```

### VolumeFileSystem Implementation

```typescript
// lib/volumes/file-operations.ts

export class VolumeFileSystem {
  private cache = new Map<string, CachedFile>();
  private config: Record<VolumeType, VolumeConfig>;

  /**
   * Read file from volume
   * Uses GitHub API for remote files
   */
  async readFile(volume: VolumeType, path: string): Promise<string> {
    const cacheKey = `${volume}:${path}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.content;
      }
    }

    // Fetch from GitHub
    const config = this.config[volume];
    const response = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${path}`,
      {
        headers: {
          'Authorization': `Bearer ${config.githubToken}`,
          'Accept': 'application/vnd.github.v3.raw'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to read ${path}: ${response.statusText}`);
    }

    const content = await response.text();

    // Cache result
    this.cache.set(cacheKey, {
      content,
      timestamp: Date.now(),
      sha: response.headers.get('x-github-sha') || ''
    });

    return content;
  }

  /**
   * Write file to volume
   * Creates or updates file via GitHub API
   */
  async writeFile(
    volume: VolumeType,
    path: string,
    content: string
  ): Promise<void> {
    const config = this.config[volume];

    if (config.readonly) {
      throw new Error(`Cannot write to read-only ${volume} volume`);
    }

    // Check if file exists (get current SHA)
    let sha: string | undefined;
    try {
      const existing = await this.getFileMeta(volume, path);
      sha = existing.sha;
    } catch {
      // File doesn't exist, that's fine
    }

    // Create/update via GitHub API
    const response = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${path}`,
          content: btoa(content),  // Base64 encode
          sha,  // Required for updates
          branch: config.branch
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to write ${path}: ${response.statusText}`);
    }

    // Update cache
    const result = await response.json();
    this.cache.set(`${volume}:${path}`, {
      content,
      timestamp: Date.now(),
      sha: result.content.sha
    });
  }

  /**
   * Edit file (find & replace)
   * More efficient than full rewrites
   */
  async editFile(
    volume: VolumeType,
    path: string,
    oldContent: string,
    newContent: string
  ): Promise<FileChange> {
    // Read current content
    const current = await this.readFile(volume, path);

    // Find old content
    if (!current.includes(oldContent)) {
      throw new Error(`Old content not found in ${path}`);
    }

    // Replace
    const updated = current.replace(oldContent, newContent);

    // Write back
    await this.writeFile(volume, path, updated);

    // Generate diff for UI
    const diff = this.generateDiff(current, updated);

    return {
      path,
      operation: 'edit',
      diff,
      linesChanged: diff.filter(l => l.startsWith('+') || l.startsWith('-')).length
    };
  }

  /**
   * List files in directory
   */
  async listFiles(
    volume: VolumeType,
    directory: string = ''
  ): Promise<FileEntry[]> {
    const config = this.config[volume];

    const response = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${directory}`,
      {
        headers: {
          'Authorization': `Bearer ${config.githubToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list ${directory}: ${response.statusText}`);
    }

    const items = await response.json();

    return items.map((item: any) => ({
      name: item.name,
      path: item.path,
      type: item.type,  // 'file' | 'dir'
      size: item.size,
      sha: item.sha
    }));
  }

  /**
   * Generate unified diff for UI display
   */
  private generateDiff(oldContent: string, newContent: string): string[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff: string[] = [];

    // Simple line-by-line diff
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        diff.push(` ${oldLine || ''}`);
      } else {
        if (oldLine !== undefined) {
          diff.push(`-${oldLine}`);
        }
        if (newLine !== undefined) {
          diff.push(`+${newLine}`);
        }
      }
    }

    return diff;
  }
}

// Singleton instance
let fileSystem: VolumeFileSystem | null = null;

export function getVolumeFileSystem(): VolumeFileSystem {
  if (!fileSystem) {
    fileSystem = new VolumeFileSystem();
  }
  return fileSystem;
}
```

### File Caching Strategy

```typescript
interface CachedFile {
  content: string;
  timestamp: number;
  sha: string;  // GitHub file SHA for updates
  gitStatus?: 'modified' | 'added' | 'deleted';
}

// Cache invalidation rules:
// 1. TTL: 5 minutes for read operations
// 2. Immediate invalidation on write
// 3. Git status changes trigger refresh
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
```

---

## LLM Tool System

### FileTools: Six Core Tools

```typescript
// lib/llm-tools/file-tools.ts

export class FileTools {
  private fs = getVolumeFileSystem();

  /**
   * Get tool definitions for LLM
   * Formatted as OpenAI-compatible function definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'read_file',
        description: 'Read a file from a volume. Use this to view file contents before editing.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to read from'
            },
            path: {
              type: 'string',
              description: 'Path to file (e.g., "agents/quantum-researcher.py")'
            }
          },
          required: ['volume', 'path']
        }
      },
      {
        name: 'write_file',
        description: 'Create a new file or overwrite existing file in a volume.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to write to (system is read-only)'
            },
            path: {
              type: 'string',
              description: 'Path for the file'
            },
            content: {
              type: 'string',
              description: 'Full content of the file'
            }
          },
          required: ['volume', 'path', 'content']
        }
      },
      {
        name: 'edit_file',
        description: 'Edit an existing file by replacing old content with new content.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user']
            },
            path: {
              type: 'string',
              description: 'Path to file to edit'
            },
            old_content: {
              type: 'string',
              description: 'Exact content to find and replace'
            },
            new_content: {
              type: 'string',
              description: 'New content to replace with'
            }
          },
          required: ['volume', 'path', 'old_content', 'new_content']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file from a volume.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user']
            },
            path: {
              type: 'string',
              description: 'Path to file to delete'
            }
          },
          required: ['volume', 'path']
        }
      },
      {
        name: 'list_files',
        description: 'List files in a directory.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user']
            },
            directory: {
              type: 'string',
              description: 'Directory path (optional, defaults to root)'
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_commit',
        description: 'Commit changes to Git and push to remote.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user']
            },
            message: {
              type: 'string',
              description: 'Commit message'
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Files to commit (optional, commits all if omitted)'
            }
          },
          required: ['volume', 'message']
        }
      }
    ];
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string,
    parameters: any
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(parameters);
        case 'write_file':
          return await this.writeFile(parameters);
        case 'edit_file':
          return await this.editFile(parameters);
        case 'delete_file':
          return await this.deleteFile(parameters);
        case 'list_files':
          return await this.listFiles(parameters);
        case 'git_commit':
          return await this.gitCommit(parameters);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async readFile(params: any): Promise<ToolResult> {
    const content = await this.fs.readFile(params.volume, params.path);
    return {
      success: true,
      output: `Read ${params.path} (${content.length} bytes)`,
      fileContent: content
    };
  }

  private async writeFile(params: any): Promise<ToolResult> {
    await this.fs.writeFile(params.volume, params.path, params.content);

    // Generate diff for new files
    const diff = params.content.split('\n').map(line => `+${line}`);

    return {
      success: true,
      output: `Created ${params.path}`,
      fileChanges: [{
        path: params.path,
        operation: 'write',
        diff
      }]
    };
  }

  private async editFile(params: any): Promise<ToolResult> {
    const change = await this.fs.editFile(
      params.volume,
      params.path,
      params.old_content,
      params.new_content
    );

    return {
      success: true,
      output: `Edited ${params.path} (${change.linesChanged} lines)`,
      fileChanges: [change]
    };
  }

  private async gitCommit(params: any): Promise<ToolResult> {
    const git = getGitOperations();
    await git.commit(params.volume, params.message, params.files);

    return {
      success: true,
      output: `Committed to ${params.volume} volume: "${params.message}"`
    };
  }
}
```

### Enhanced LLM Client

```typescript
// lib/llm-client-enhanced.ts

export class EnhancedLLMClient {
  private fileTools = getFileTools();
  private apiKey: string;
  private model: string;

  /**
   * Send message with automatic tool handling
   */
  async sendMessage(
    messages: Message[],
    options?: ChatOptions
  ): Promise<Message> {
    const tools = this.fileTools.getToolDefinitions();

    // Call LLM with tool definitions
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(messages),
        tools: tools.map(t => ({
          type: 'function',
          function: t
        })),
        tool_choice: 'auto',
        temperature: options?.temperature ?? 0.7
      })
    });

    const data = await response.json();
    const message = data.choices[0].message;

    // Check if LLM wants to use tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      return await this.handleToolCalls(messages, message.tool_calls);
    }

    return {
      role: 'assistant',
      content: message.content || ''
    };
  }

  /**
   * Handle tool execution automatically
   */
  private async handleToolCalls(
    previousMessages: Message[],
    toolCalls: any[]
  ): Promise<Message> {
    const toolResults: ToolResult[] = [];

    // Execute each tool
    for (const toolCall of toolCalls) {
      const result = await this.fileTools.executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );
      toolResults.push(result);
    }

    // Add tool results to conversation
    const messagesWithTools = [
      ...previousMessages,
      {
        role: 'assistant' as const,
        content: '',
        toolCalls: toolCalls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments)
        }))
      },
      ...toolResults.map((result, idx) => ({
        role: 'tool' as const,
        tool_call_id: toolCalls[idx].id,
        content: result.output || result.error || ''
      }))
    ];

    // Get LLM's response after tool execution
    const finalResponse = await this.sendMessage(messagesWithTools);

    // Return with tool context
    return {
      ...finalResponse,
      toolCalls: toolCalls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        parameters: JSON.parse(tc.function.arguments)
      })),
      toolResults
    };
  }

  /**
   * Streaming version with tool support
   */
  async *streamMessage(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    // Similar to sendMessage but yields chunks
    // Handles tool calls when detected in stream
    // See full implementation in lib/llm-client-enhanced.ts
  }
}
```

---

## Live Runtime

### Pyodide Integration

```typescript
// lib/runtime/live-preview.ts

export class LivePreview {
  private pyodide: any = null;
  private initialized = false;

  /**
   * Initialize Pyodide runtime
   * Lazy loads on first use
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load Pyodide from CDN
    const pyodideScript = document.createElement('script');
    pyodideScript.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
    document.head.appendChild(pyodideScript);

    await new Promise((resolve) => {
      pyodideScript.onload = resolve;
    });

    // @ts-ignore
    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
    });

    // Pre-install common packages
    await this.pyodide.loadPackage(['numpy', 'matplotlib', 'scipy']);

    this.initialized = true;
  }

  /**
   * Execute Python code
   * Captures stdout, stderr, and matplotlib plots
   */
  async executeFile(
    filePath: string,
    code: string,
    options: RuntimeOptions = {}
  ): Promise<ExecutionResult> {
    await this.initialize();

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let plots: string[] = [];

    try {
      // Setup output capture
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO

# Capture stdout
_stdout = StringIO()
sys.stdout = _stdout

# Capture stderr
_stderr = StringIO()
sys.stderr = _stderr
`);

      // Setup matplotlib to capture plots
      if (options.capturePlots) {
        await this.setupMatplotlib();
      }

      // Auto-detect and install packages
      if (options.autoInstall !== false) {
        await this.autoInstallPackages(code);
      }

      // Execute code
      await this.pyodide.runPythonAsync(code);

      // Capture outputs
      stdout = await this.pyodide.runPythonAsync('_stdout.getvalue()');
      stderr = await this.pyodide.runPythonAsync('_stderr.getvalue()');

      // Capture plots
      if (options.capturePlots) {
        plots = await this.capturePlots();
      }

      return {
        success: true,
        stdout,
        stderr,
        plots,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      stderr = await this.pyodide.runPythonAsync('_stderr.getvalue()');

      return {
        success: false,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Setup matplotlib for plot capture
   */
  private async setupMatplotlib(): Promise<void> {
    await this.pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend

import matplotlib.pyplot as plt
from io import BytesIO
import base64

# Store plots globally
_plots = []

# Override plt.show() to capture instead of display
_original_show = plt.show

def _capture_show(*args, **kwargs):
    global _plots
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    _plots.append(img_base64)
    plt.clf()  # Clear figure for next plot

plt.show = _capture_show
`);
  }

  /**
   * Capture all matplotlib plots as base64 images
   */
  private async capturePlots(): Promise<string[]> {
    const plotsJson = await this.pyodide.runPythonAsync(`
import json
json.dumps(_plots)
`);

    return JSON.parse(plotsJson);
  }

  /**
   * Auto-detect imports and install packages
   */
  private async autoInstallPackages(code: string): Promise<void> {
    // Extract imports
    const importRegex = /^(?:import|from)\s+(\w+)/gm;
    const imports = new Set<string>();

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      imports.add(match[1]);
    }

    // Package mapping (PyPI name → Pyodide package)
    const packageMap: Record<string, string> = {
      'qiskit': 'qiskit',
      'networkx': 'networkx',
      'sympy': 'sympy',
      'pandas': 'pandas'
    };

    // Install packages
    for (const pkg of imports) {
      if (packageMap[pkg]) {
        try {
          await this.pyodide.runPythonAsync(`
import micropip
await micropip.install('${packageMap[pkg]}')
`);
        } catch (error) {
          console.warn(`Failed to auto-install ${pkg}:`, error);
        }
      }
    }
  }

  /**
   * Watch file for changes and re-execute
   */
  watchFile(
    filePath: string,
    callback: (result: ExecutionResult) => void
  ): () => void {
    const fs = getVolumeFileSystem();
    let lastContent = '';

    const interval = setInterval(async () => {
      try {
        // Parse volume:path
        const [volume, path] = filePath.split(':');
        const content = await fs.readFile(volume as VolumeType, path);

        if (content !== lastContent) {
          lastContent = content;
          const result = await this.executeFile(filePath, content, {
            capturePlots: true,
            autoInstall: true
          });
          callback(result);
        }
      } catch (error) {
        console.error('Watch error:', error);
      }
    }, 1000);  // Check every second

    // Return unwatch function
    return () => clearInterval(interval);
  }
}

// Singleton
let livePreview: LivePreview | null = null;

export function getLivePreview(): LivePreview {
  if (!livePreview) {
    livePreview = new LivePreview();
  }
  return livePreview;
}
```

---

## Git Operations

### GitHub API Integration

```typescript
// lib/volumes/git-operations.ts

export class GitOperations {
  private config: Record<VolumeType, VolumeConfig>;

  /**
   * Get Git status for volume
   */
  async getStatus(volume: VolumeType): Promise<GitStatus> {
    const fs = getVolumeFileSystem();
    const config = this.config[volume];

    // Compare local cache with remote
    const localFiles = Array.from(fs.getCachedFiles(volume));
    const modifiedFiles: FileStatus[] = [];

    for (const [path, cached] of localFiles) {
      // Check if modified (compare SHA)
      try {
        const remoteMeta = await this.getRemoteFileMeta(volume, path);

        if (cached.sha !== remoteMeta.sha) {
          modifiedFiles.push({
            path,
            status: 'modified',
            additions: 0,  // Calculate from diff
            deletions: 0
          });
        }
      } catch {
        // File doesn't exist remotely
        modifiedFiles.push({
          path,
          status: 'added',
          additions: cached.content.split('\n').length,
          deletions: 0
        });
      }
    }

    return {
      volume,
      branch: config.branch,
      modifiedFiles,
      hasChanges: modifiedFiles.length > 0
    };
  }

  /**
   * Commit and push changes
   */
  async commit(
    volume: VolumeType,
    message: string,
    files?: string[]
  ): Promise<void> {
    const config = this.config[volume];
    const fs = getVolumeFileSystem();

    // Get files to commit
    const toCommit = files || (await this.getStatus(volume)).modifiedFiles.map(f => f.path);

    // GitHub doesn't have a batch commit API
    // We need to create a tree and commit via Git Data API

    // 1. Get current commit SHA
    const refResponse = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/refs/heads/${config.branch}`,
      {
        headers: {
          'Authorization': `Bearer ${config.githubToken}`
        }
      }
    );
    const refData = await refResponse.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get current tree
    const commitResponse = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/commits/${currentCommitSha}`,
      {
        headers: {
          'Authorization': `Bearer ${config.githubToken}`
        }
      }
    );
    const commitData = await commitResponse.json();
    const currentTreeSha = commitData.tree.sha;

    // 3. Create new tree with changes
    const tree = await Promise.all(
      toCommit.map(async (path) => {
        const content = await fs.readFile(volume, path);
        return {
          path,
          mode: '100644',
          type: 'blob',
          content
        };
      })
    );

    const treeResponse = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/trees`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base_tree: currentTreeSha,
          tree
        })
      }
    );
    const treeData = await treeResponse.json();

    // 4. Create commit
    const newCommitResponse = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/commits`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          tree: treeData.sha,
          parents: [currentCommitSha]
        })
      }
    );
    const newCommitData = await newCommitResponse.json();

    // 5. Update reference (push)
    await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/refs/heads/${config.branch}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${config.githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false
        })
      }
    );
  }

  /**
   * Generate diff for files
   */
  async getDiff(volume: VolumeType, path: string): Promise<string> {
    const fs = getVolumeFileSystem();
    const localContent = await fs.readFile(volume, path);

    try {
      const config = this.config[volume];
      const response = await fetch(
        `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${path}`,
        {
          headers: {
            'Authorization': `Bearer ${config.githubToken}`,
            'Accept': 'application/vnd.github.v3.raw'
          }
        }
      );
      const remoteContent = await response.text();

      // Generate unified diff
      return this.generateUnifiedDiff(remoteContent, localContent, path);
    } catch {
      // File doesn't exist remotely (new file)
      return localContent.split('\n').map(line => `+${line}`).join('\n');
    }
  }
}
```

---

## Sub-Agent System

### Agent Discovery & Execution

```typescript
// lib/subagents/subagent-executor.ts

export class SubAgentExecutor {
  private fs = getVolumeFileSystem();
  private runtime = getLivePreview();

  /**
   * Discover agents in volume
   * Looks for .py files in agents/ directory
   */
  async discoverAgents(volume: VolumeType): Promise<SubAgentDefinition[]> {
    const agents: SubAgentDefinition[] = [];

    try {
      const files = await this.fs.listFiles(volume, 'agents');

      for (const file of files) {
        if (file.path.endsWith('.py')) {
          const agentDef = await this.parseAgentFile(volume, file.path);
          if (agentDef) {
            agents.push(agentDef);
          }
        }
      }
    } catch (error) {
      console.warn(`No agents in ${volume} volume`);
    }

    return agents;
  }

  /**
   * Parse agent metadata from docstring
   */
  private async parseAgentFile(
    volume: VolumeType,
    path: string
  ): Promise<SubAgentDefinition | null> {
    const content = await this.fs.readFile(volume, path);

    // Extract docstring
    const docMatch = content.match(/"""([\s\S]*?)"""/);
    const description = docMatch ? docMatch[1].trim() : '';

    // Extract class name
    const classMatch = content.match(/class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'UnknownAgent';

    // Extract capabilities from docstring
    const capabilities = this.extractCapabilities(content);

    return {
      name: className,
      path,
      volume,
      description,
      capabilities
    };
  }

  /**
   * Execute agent with task
   */
  async executeAgent(
    volume: VolumeType,
    agentPath: string,
    task: string,
    context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      // Load agent code
      const agentCode = await this.fs.readFile(volume, agentPath);

      // Build execution wrapper
      const executionCode = this.buildExecutionCode(agentCode, task, context);

      // Execute in Pyodide
      const result = await this.runtime.executeFile(
        `${volume}:${agentPath}`,
        executionCode,
        { capturePlots: true }
      );

      return {
        success: result.success,
        output: result.stdout || result.stderr || '',
        error: result.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Build Python execution code
   */
  private buildExecutionCode(
    agentCode: string,
    task: string,
    context?: Record<string, any>
  ): string {
    const escapedTask = task.replace(/"/g, '\\"');

    return `
${agentCode}

# Execute agent
import json
import re

# Find agent class
class_match = re.search(r'class\\s+(\\w+)', """${agentCode.replace(/"/g, '\\"')}""")
if class_match:
    agent_class = class_match.group(1)
    AgentClass = globals()[agent_class]

    # Instantiate
    agent = AgentClass()

    # Execute task
    if hasattr(agent, 'execute'):
        result = agent.execute("${escapedTask}")
        print(json.dumps(result, indent=2))
    else:
        print(f"Error: Agent {agent_class} missing execute() method")
else:
    print("Error: No agent class found")
`;
  }

  /**
   * Get agent by @mention reference
   */
  async getAgentByReference(reference: string): Promise<SubAgentDefinition | null> {
    const name = reference.replace(/^@/, '');

    // Search all volumes
    for (const volume of ['system', 'team', 'user'] as VolumeType[]) {
      const agents = await this.discoverAgents(volume);
      const agent = agents.find(a =>
        a.name.toLowerCase().includes(name.toLowerCase()) ||
        a.path.toLowerCase().includes(name.toLowerCase())
      );

      if (agent) return agent;
    }

    return null;
  }
}
```

---

## UI Components

### ToolUseDisplay Component

```typescript
// components/chat/ToolUseDisplay.tsx

export default function ToolUseDisplay({
  toolCall,
  toolResult
}: ToolUseDisplayProps) {
  const getToolIcon = (name: string) => {
    const icons = {
      'read_file': '👁️',
      'write_file': '📝',
      'edit_file': '✏️',
      'delete_file': '🗑️',
      'list_files': '📂',
      'git_commit': '🔧'
    };
    return icons[name] || '🛠️';
  };

  const renderFileOperation = () => {
    const params = toolCall.parameters;

    if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
      // Show diff preview
      return (
        <div>
          <div className="text-xs font-mono">
            {params.volume}-volume/{params.path}
          </div>

          {toolResult?.fileChanges && (
            <div className="mt-2 p-2 bg-bg-tertiary rounded font-mono text-[10px]">
              {toolResult.fileChanges[0].diff.slice(0, 10).map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.startsWith('+') ? 'text-green-500' :
                    line.startsWith('-') ? 'text-red-500' :
                    'text-gray-400'
                  }
                >
                  {line}
                </div>
              ))}
              {toolResult.fileChanges[0].diff.length > 10 && (
                <div className="text-gray-500">
                  ... {toolResult.fileChanges[0].diff.length - 10} more lines
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Other tools...
  };

  return (
    <div className="my-2 p-3 bg-bg-secondary/50 border-l-2 border-accent-primary rounded-r">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{getToolIcon(toolCall.name)}</span>
        <span className="text-xs font-semibold">
          {toolCall.name.replace(/_/g, ' ').toUpperCase()}
        </span>
        {toolResult && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded ${
            toolResult.success
              ? 'bg-green-500/20 text-green-500'
              : 'bg-red-500/20 text-red-500'
          }`}>
            {toolResult.success ? '✓' : '✗'}
          </span>
        )}
      </div>

      {renderFileOperation()}

      {toolResult?.output && (
        <div className="mt-2 pt-2 border-t border-border-primary/30 text-xs text-fg-secondary">
          {toolResult.output}
        </div>
      )}

      {toolResult?.error && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500">
          {toolResult.error}
        </div>
      )}
    </div>
  );
}
```

### SplitViewCanvas Component

```typescript
// components/canvas/SplitViewCanvas.tsx

export default function SplitViewCanvas({ filePath }: { filePath: string }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [autoRun, setAutoRun] = useState(true);
  const [splitPercent, setSplitPercent] = useState(50);

  const runtime = getLivePreview();
  const fs = getVolumeFileSystem();

  // Load file
  useEffect(() => {
    const [volume, path] = filePath.split(':');
    fs.readFile(volume as VolumeType, path)
      .then(setCode)
      .catch(console.error);
  }, [filePath]);

  // Auto-run on code changes
  useEffect(() => {
    if (!autoRun) return;

    const timer = setTimeout(() => {
      handleRun();
    }, 500);  // Debounce

    return () => clearTimeout(timer);
  }, [code, autoRun]);

  const handleRun = async () => {
    const execResult = await runtime.executeFile(filePath, code, {
      capturePlots: true,
      autoInstall: true
    });
    setResult(execResult);
  };

  const handleSave = async () => {
    const [volume, path] = filePath.split(':');
    await fs.writeFile(volume as VolumeType, path, code);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="p-2 border-b border-border-primary/30 flex items-center gap-2">
        <button onClick={handleRun} className="px-3 py-1 bg-accent-primary text-white rounded text-xs">
          Run
        </button>
        <button onClick={handleSave} className="px-3 py-1 bg-bg-elevated rounded text-xs">
          Save
        </button>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
          />
          Auto-run
        </label>
        <div className="ml-auto text-xs text-fg-tertiary">
          {result && `${result.executionTime}ms`}
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Panel */}
        <div style={{ width: `${splitPercent}%` }} className="border-r border-border-primary/30">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-full p-4 bg-bg-tertiary font-mono text-xs resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 bg-border-primary/30 cursor-col-resize hover:bg-accent-primary"
          onMouseDown={(e) => {
            // Implement drag to resize
          }}
        />

        {/* Preview Panel */}
        <div style={{ width: `${100 - splitPercent}%` }} className="overflow-auto">
          {result ? (
            <div className="p-4">
              {/* Success/Error Badge */}
              <div className={`inline-block px-2 py-1 rounded text-xs mb-3 ${
                result.success
                  ? 'bg-green-500/20 text-green-500'
                  : 'bg-red-500/20 text-red-500'
              }`}>
                {result.success ? '✓ Success' : '✗ Error'} · {result.executionTime}ms
              </div>

              {/* Stdout */}
              {result.stdout && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-fg-secondary mb-1">Output:</div>
                  <pre className="p-2 bg-bg-tertiary rounded text-xs font-mono whitespace-pre-wrap">
                    {result.stdout}
                  </pre>
                </div>
              )}

              {/* Plots */}
              {result.plots && result.plots.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-fg-secondary mb-1">Plots:</div>
                  {result.plots.map((plot, idx) => (
                    <img
                      key={idx}
                      src={`data:image/png;base64,${plot}`}
                      alt={`Plot ${idx + 1}`}
                      className="mb-2 rounded border border-border-primary/30"
                    />
                  ))}
                </div>
              )}

              {/* Stderr */}
              {result.stderr && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-red-500 mb-1">Errors:</div>
                  <pre className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs font-mono text-red-500 whitespace-pre-wrap">
                    {result.stderr}
                  </pre>
                </div>
              )}

              {/* Error */}
              {result.error && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500">
                  {result.error}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-fg-tertiary">
              Click Run to execute code
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Data Flow

### Complete Request Cycle

```
┌──────────────────────────────────────────────────────────────┐
│                    USER INTERACTION                           │
└──────────────────────────────────────────────────────────────┘
                            ↓
        User: "Create a Bell state circuit file"
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    CHAT INTERFACE                             │
│  - ChatPanel.tsx receives message                            │
│  - Adds to messages array                                    │
│  - Calls EnhancedLLMClient.sendMessage()                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    LLM CLIENT                                 │
│  - Formats messages with tool definitions                    │
│  - Calls OpenRouter API                                      │
│  - Receives response with tool_calls                         │
└──────────────────────────────────────────────────────────────┘
                            ↓
        Tool Call: write_file({
          volume: 'user',
          path: 'circuits/bell-state.py',
          content: 'from qiskit import...'
        })
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTOR                              │
│  - FileTools.executeTool('write_file', params)               │
│  - Calls VolumeFileSystem.writeFile()                        │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    FILE SYSTEM                                │
│  - Creates/updates file via GitHub API                       │
│  - Updates local cache                                       │
│  - Generates diff for UI                                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
        GitHub API: PUT /repos/{owner}/{repo}/contents/{path}
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    TOOL RESULT                                │
│  - Returns success + diff                                    │
│  - Added to conversation context                             │
│  - LLM generates final message                               │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    UI UPDATE                                  │
│  - ChatPanel displays ToolUseDisplay component               │
│  - Shows: 📝 Write File + diff preview                       │
│  - Explorer refreshes to show new file                       │
│  - Git widget shows "M" badge                                │
└──────────────────────────────────────────────────────────────┘
                            ↓
        User clicks file in Explorer
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    CANVAS VIEW                                │
│  - Loads file content                                        │
│  - Displays SplitViewCanvas                                  │
│  - Code on left, Preview on right                            │
└──────────────────────────────────────────────────────────────┘
                            ↓
        Auto-run enabled → executes code
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    LIVE RUNTIME                               │
│  - LivePreview.executeFile()                                 │
│  - Initializes Pyodide if needed                             │
│  - Runs Python code                                          │
│  - Captures stdout, plots                                    │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    PREVIEW DISPLAY                            │
│  - Shows execution result                                    │
│  - Stdout text                                               │
│  - Matplotlib plots as base64 images                         │
│  - Execution time                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## API Integration

### OpenRouter Configuration

```typescript
// lib/llm-client-enhanced.ts

const OPENROUTER_CONFIG = {
  baseURL: 'https://openrouter.ai/api/v1',
  defaultModel: 'anthropic/claude-3.5-sonnet',
  headers: {
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
    'X-Title': 'LLMos-Lite'
  }
};

// Model-specific optimizations
const MODEL_CONFIGS = {
  'anthropic/claude-3.5-sonnet': {
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    streamingRecommended: true
  },
  'anthropic/claude-3-opus': {
    maxTokens: 4096,
    temperature: 0.7,
    supportsTools: true,
    streamingRecommended: true
  }
};
```

### GitHub API Usage

```typescript
// lib/volumes/file-operations.ts

// Rate limiting considerations
const GITHUB_API_LIMITS = {
  authenticated: 5000,  // requests per hour
  unauthenticated: 60
};

// API endpoints used:
// - GET /repos/{owner}/{repo}/contents/{path}  (read files)
// - PUT /repos/{owner}/{repo}/contents/{path}  (write files)
// - DELETE /repos/{owner}/{repo}/contents/{path}  (delete files)
// - GET /repos/{owner}/{repo}/git/trees/{sha}  (list directory)
// - POST /repos/{owner}/{repo}/git/trees  (create tree for commit)
// - POST /repos/{owner}/{repo}/git/commits  (create commit)
// - PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}  (push)

// Error handling
class GitHubAPIError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: any
  ) {
    super(message);
  }
}

// Retry logic for transient failures
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof GitHubAPIError && error.status < 500) {
        // Don't retry client errors
        throw error;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  throw lastError;
}
```

---

## State Management

### Current Approach: React Context + Local State

```typescript
// lib/context/AppContext.tsx

interface AppState {
  currentVolume: VolumeType;
  currentFile: string | null;
  gitStatus: Record<VolumeType, GitStatus>;
  agents: SubAgentDefinition[];
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    currentVolume: 'user',
    currentFile: null,
    gitStatus: {} as any,
    agents: []
  });

  // Load agents on mount
  useEffect(() => {
    const executor = getSubAgentExecutor();
    Promise.all([
      executor.discoverAgents('system'),
      executor.discoverAgents('team'),
      executor.discoverAgents('user')
    ]).then(results => {
      setState(s => ({ ...s, agents: results.flat() }));
    });
  }, []);

  // Refresh Git status periodically
  useEffect(() => {
    const git = getGitOperations();
    const interval = setInterval(async () => {
      const statuses = await Promise.all([
        git.getStatus('team'),
        git.getStatus('user')
      ]);

      setState(s => ({
        ...s,
        gitStatus: {
          system: { volume: 'system', branch: 'main', modifiedFiles: [], hasChanges: false },
          team: statuses[0],
          user: statuses[1]
        }
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <AppContext.Provider value={state}>
      {children}
    </AppContext.Provider>
  );
}
```

---

## Performance & Optimization

### File Caching Strategy

```typescript
// Cache with TTL and LRU eviction
class FileCache {
  private cache = new Map<string, CachedEntry>();
  private maxSize = 100;  // Max files in cache
  private ttl = 5 * 60 * 1000;  // 5 minutes

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access time (for LRU)
    entry.lastAccess = Date.now();
    return entry.content;
  }

  set(key: string, content: string, sha: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      content,
      sha,
      timestamp: Date.now(),
      lastAccess: Date.now()
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
```

### Pyodide Optimization

```typescript
// Lazy loading + package caching
class PyodideManager {
  private pyodide: any = null;
  private loadedPackages = new Set<string>();

  // Load Pyodide only when needed
  async ensureLoaded(): Promise<void> {
    if (this.pyodide) return;

    // Show loading indicator
    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
    });

    // Pre-load common packages in parallel
    await Promise.all([
      this.loadPackage('numpy'),
      this.loadPackage('matplotlib'),
      this.loadPackage('scipy')
    ]);
  }

  async loadPackage(name: string): Promise<void> {
    if (this.loadedPackages.has(name)) return;

    await this.pyodide.loadPackage(name);
    this.loadedPackages.add(name);
  }
}

// Worker-based execution (future optimization)
// Run Pyodide in Web Worker to avoid blocking main thread
class WorkerRuntime {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('/pyodide-worker.js');
  }

  async execute(code: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      this.worker.postMessage({ type: 'execute', code });
      this.worker.onmessage = (e) => {
        resolve(e.data.result);
      };
    });
  }
}
```

### Bundle Optimization

```javascript
// next.config.js

module.exports = {
  // Minimize client bundle
  experimental: {
    optimizeCss: true,
  },

  // Code splitting
  webpack: (config) => {
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        pyodide: {
          test: /pyodide/,
          priority: 10,
          reuseExistingChunk: true
        },
        vendor: {
          test: /node_modules/,
          priority: 5
        }
      }
    };
    return config;
  }
};
```

---

## Security Considerations

### GitHub Token Storage

```typescript
// Store tokens securely
class TokenManager {
  private static STORAGE_KEY = 'llmos_github_tokens';

  // Encrypt tokens before localStorage
  static async setToken(volume: VolumeType, token: string): Promise<void> {
    // Use Web Crypto API to encrypt
    const key = await this.getEncryptionKey();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: crypto.getRandomValues(new Uint8Array(12)) },
      key,
      new TextEncoder().encode(token)
    );

    localStorage.setItem(
      `${this.STORAGE_KEY}_${volume}`,
      btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    );
  }

  static async getToken(volume: VolumeType): Promise<string | null> {
    const encrypted = localStorage.getItem(`${this.STORAGE_KEY}_${volume}`);
    if (!encrypted) return null;

    const key = await this.getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: /* stored IV */ },
      key,
      Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
    );

    return new TextDecoder().decode(decrypted);
  }

  private static async getEncryptionKey(): Promise<CryptoKey> {
    // Derive key from user's session
    // In production, use proper key management
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}
```

### Code Execution Sandboxing

```typescript
// Pyodide runs in sandbox
// Additional security layers:

// 1. Disable network access from Pyodide
await pyodide.runPythonAsync(`
import sys
# Override urllib, requests, etc.
sys.modules['urllib'] = None
sys.modules['requests'] = None
`);

// 2. Limit execution time
const EXECUTION_TIMEOUT = 30000;  // 30 seconds

async function executeWithTimeout(code: string): Promise<ExecutionResult> {
  return Promise.race([
    pyodide.runPythonAsync(code),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout')), EXECUTION_TIMEOUT)
    )
  ]);
}

// 3. Monitor resource usage
// (Browser automatically limits memory/CPU for web workers)
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/lib/volumes/file-operations.test.ts

describe('VolumeFileSystem', () => {
  let fs: VolumeFileSystem;

  beforeEach(() => {
    fs = new VolumeFileSystem();
    // Mock GitHub API
    global.fetch = jest.fn();
  });

  test('readFile returns cached content', async () => {
    // Mock response
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('file content')
    });

    const content = await fs.readFile('user', 'test.py');
    expect(content).toBe('file content');

    // Second call should use cache
    const cached = await fs.readFile('user', 'test.py');
    expect(fetch).toHaveBeenCalledTimes(1);  // Not called again
  });

  test('writeFile throws on read-only volume', async () => {
    await expect(
      fs.writeFile('system', 'test.py', 'content')
    ).rejects.toThrow('read-only');
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/llm-tool-flow.test.ts

describe('LLM Tool Flow', () => {
  test('complete write_file flow', async () => {
    const client = new EnhancedLLMClient({ apiKey: 'test' });

    // Mock LLM response with tool call
    mockLLMResponse({
      tool_calls: [{
        id: '1',
        function: {
          name: 'write_file',
          arguments: JSON.stringify({
            volume: 'user',
            path: 'test.py',
            content: 'print("hello")'
          })
        }
      }]
    });

    // Mock GitHub API
    mockGitHubAPI();

    const response = await client.sendMessage([
      { role: 'user', content: 'Create a hello world script' }
    ]);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolResults[0].success).toBe(true);
  });
});
```

---

## Deployment

### Build Configuration

```json
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "jest",
    "type-check": "tsc --noEmit"
  }
}
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_OPENROUTER_API_KEY=your_key_here
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_client_id
NEXT_PUBLIC_DEFAULT_SYSTEM_REPO=llmunix/system-volume
NEXT_PUBLIC_DEFAULT_TEAM_REPO=your-org/team-volume
```

### Vercel Configuration

```json
// vercel.json
{
  "build": {
    "env": {
      "NEXT_PUBLIC_OPENROUTER_API_KEY": "@openrouter-key"
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        }
      ]
    }
  ]
}
```

---

## Future Enhancements

### Monaco Editor Integration

```typescript
// Replace textarea with Monaco
import Editor from '@monaco-editor/react';

<Editor
  height="100%"
  defaultLanguage="python"
  value={code}
  onChange={(value) => setCode(value || '')}
  theme="vs-dark"
  options={{
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true
  }}
/>
```

### Jupyter Notebook Support

```typescript
// lib/runtime/notebook-runtime.ts

interface NotebookCell {
  type: 'code' | 'markdown';
  content: string;
  outputs?: any[];
}

class NotebookRuntime {
  async executeNotebook(cells: NotebookCell[]): Promise<NotebookResult> {
    const results: CellResult[] = [];

    for (const cell of cells) {
      if (cell.type === 'code') {
        const result = await pyodide.runPythonAsync(cell.content);
        results.push({ cellIndex: i, output: result });
      }
    }

    return { cells: results };
  }
}
```

### Real-Time Collaboration

```typescript
// lib/collaboration/sync.ts

import { WebSocket } from 'ws';

class CollaborationSync {
  private ws: WebSocket;

  // Y.js for CRDT-based sync
  syncFile(filePath: string): void {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(
      'wss://sync.llmos.ai',
      filePath,
      ydoc
    );

    // Sync editor state
    const ytext = ydoc.getText('content');
    ytext.observe((event) => {
      // Update Monaco editor
    });
  }
}
```

---

## Conclusion

This architecture implements a Claude Code-style file-first development environment entirely in the browser, with:

- **Git-backed volumes** for persistence
- **LLM tool system** for file operations
- **Live Python runtime** with Pyodide
- **VSCode-inspired UI** for familiarity
- **Sub-agent system** for extensibility

All components are designed to be modular, testable, and performant while providing a seamless developer experience.

For user-facing documentation, see **README.md**.
For implementation status, see **IMPLEMENTATION-STATUS.md**.

---

## Current Architecture Assessment (December 2024)

### Updated Directory Structure

After the recent refactoring, the directory structure has been improved:

```
llmos-lite/ui/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Main entry with kernel boot
│   └── api/                     # API routes
│
├── components/
│   ├── workspace/               # Layout orchestration
│   │   ├── AdaptiveLayout.tsx   # Three-panel adaptive layout
│   │   ├── FluidLayout.tsx      # JARVIS/Holodeck layout
│   │   └── ViewManager.tsx      # Context view routing
│   ├── panels/                  # ← RENAMED from panel1-3
│   │   ├── artifacts/           # Artifact viewers/editors
│   │   ├── session/             # Session management
│   │   └── volumes/             # File tree (icons.tsx extracted)
│   ├── chat/                    # Chat interface
│   ├── applets/                 # Interactive applets (extracted)
│   │   ├── AppletGrid.tsx       # Main grid (reduced from 1369→405 lines)
│   │   ├── AppletIconCard.tsx   # Extracted icon component
│   │   ├── FullAppletView.tsx   # Extracted full view
│   │   └── system-applets.ts    # Extracted applet definitions
│   ├── common/                  # Shared UI components
│   │   ├── LoadingSpinner.tsx
│   │   └── CollapsibleSection.tsx
│   └── layout/                  # Layout primitives
│
├── contexts/                    # React Context providers
│   ├── WorkspaceContext.tsx     # Layout & agent state
│   ├── SessionContext.tsx       # Chat sessions
│   └── AppletContext.tsx        # Applet lifecycle
│
├── hooks/                       # Custom React hooks
│   ├── useChat.ts              # ← NEW: Chat business logic
│   ├── useCodeExecution.ts     # ← NEW: Code execution
│   ├── useOrchestrator.ts      # State coordination
│   └── useWorkflowExecution.ts # Workflow orchestration
│
├── lib/
│   ├── llm/                     # ← CONSOLIDATED LLM module
│   │   ├── client.ts           # OpenRouter client
│   │   ├── storage.ts          # Config persistence
│   │   ├── types.ts            # Shared types
│   │   └── index.ts            # Public API
│   ├── artifacts/               # Artifact management
│   ├── kernel/                  # WASM runtime
│   │   ├── error-supervisor.ts  # ← STUB: Error handling
│   │   └── refinement-service.ts # ← STUB: Refinement
│   ├── llm-tools/               # LLM tool implementations
│   │   ├── file-tools.ts       # Updated with 'tool' property
│   │   ├── applet-tools.ts     # Updated with 'tool' property
│   │   └── git-tools-enhanced.ts
│   └── [services]/
│
└── styles/
```

### State Management Summary

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **Contexts** | React Context | UI state, sessions, applets |
| **Stores** | Zustand | Artifacts, console logs |
| **Singletons** | Module instances | VFS, AppletStore, LLMClient |
| **Hooks** | Custom hooks | Business logic encapsulation |

### Current Architecture Strengths

1. **Modular Context System** - Clear separation of workspace, session, applet concerns
2. **Event-Driven Applets** - Decoupled lifecycle with EventEmitter pattern
3. **Lazy Loading** - Heavy 3D components load on-demand
4. **Dual Views** - Artifacts support code + visual representation
5. **Orchestration Layer** - `useOrchestrator` unifies state coordination
6. **Token-Aware Context** - Intelligent context summarization
7. **Sandboxed Execution** - QuickJS WASM, Pyodide, Babel scope isolation
8. **Browser-Native** - No backend required, direct OpenRouter calls
9. **Persistent Workspace** - All state survives page refresh
10. **Adaptive Layout** - Auto-adjusts based on task type

---

## Architecture Improvement Roadmap

### Priority 1: Data Access Layer

**Problem**: Direct localStorage access scattered across services

**Solution**: Implement Repository Pattern with Storage Adapters

```typescript
// Proposed: lib/repositories/base.ts
interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
  query(predicate: (item: T) => boolean): Promise<T[]>;
}

interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
}

// Implementations
class LocalStorageAdapter implements StorageAdapter { ... }
class IndexedDBAdapter implements StorageAdapter { ... }  // For large data
class MemoryAdapter implements StorageAdapter { ... }     // For testing
```

**Benefits**:
- Testability - Easy to mock storage
- Flexibility - Swap localStorage for IndexedDB when needed
- Consistency - Unified data access patterns

### Priority 2: Error Handling Strategy

**Problem**: Inconsistent error handling, some errors silently caught

**Solution**: Implement Result Pattern

```typescript
// Proposed: lib/core/result.ts
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Usage
async function executeCode(code: string): Promise<Result<ExecutionOutput, ExecutionError>> {
  try {
    const output = await runtime.execute(code);
    return { success: true, data: output };
  } catch (e) {
    return {
      success: false,
      error: { type: 'EXECUTION_ERROR', message: e.message, code }
    };
  }
}
```

### Priority 3: Performance Optimizations

**Problem**: localStorage limits (5-10MB), WASM init blocks UI

**Solutions**:

1. **IndexedDB for Large Artifacts**
```typescript
import { openDB } from 'idb';

const db = await openDB('llmos', 1, {
  upgrade(db) {
    db.createObjectStore('artifacts', { keyPath: 'id' });
  }
});
```

2. **Web Worker for WASM**
```typescript
// worker.ts
importScripts('pyodide.js');
const pyodide = await loadPyodide();
self.postMessage({ type: 'ready' });
```

3. **Virtualization for Long Lists**
```typescript
import { FixedSizeList } from 'react-window';

function SessionList({ sessions }) {
  return (
    <FixedSizeList height={400} itemCount={sessions.length} itemSize={60}>
      {({ index, style }) => (
        <SessionItem session={sessions[index]} style={style} />
      )}
    </FixedSizeList>
  );
}
```

### Priority 4: Testing Infrastructure

**Problem**: No visible test files, tight coupling

**Solution**: Add testing layers

```
test/
├── unit/
│   └── hooks/useChat.test.ts
├── integration/
│   └── artifact-manager.test.ts
└── e2e/
    └── chat-flow.spec.ts
```

### Priority 5: API Resilience

**Problem**: No retry logic, limited offline support

**Solution**: Service Layer with resilience patterns

```typescript
class LLMService {
  private retryPolicy: RetryPolicy;
  private circuitBreaker: CircuitBreaker;

  async chat(messages: Message[]): Promise<Result<ChatResponse>> {
    if (!navigator.onLine) {
      return this.handleOffline(messages);
    }

    return this.circuitBreaker.execute(() =>
      this.retryPolicy.execute(() =>
        this.client.chatDirect(messages)
      )
    );
  }
}
```

### Priority 6: Security Hardening

**Current Issues**:
- API key in localStorage (accessible via devtools)
- No CSP headers configured

**Solutions**:
1. Basic API key encryption using Web Crypto API
2. Configure CSP headers in `next.config.js`
3. Stricter Babel compilation whitelist

---

## Quick Wins (Immediate Actions)

| Action | Impact | Effort |
|--------|--------|--------|
| Add `Result<T>` type for consistent errors | High | Low |
| Add `useCallback`/`useMemo` where missing | Medium | Low |
| Add error boundaries around major panels | High | Low |
| Create `StorageAdapter` interface | Medium | Low |
| Add basic unit tests for critical hooks | High | Medium |

---

## Implementation Priority Matrix

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Repository Pattern | High | Medium | P1 |
| Error Handling (Result) | High | Low | P1 |
| IndexedDB Migration | High | Medium | P1 |
| Testing Infrastructure | High | High | P2 |
| State Consolidation | Medium | High | P2 |
| Component Composition | Medium | Medium | P2 |
| API Resilience | Medium | Medium | P3 |
| Security Hardening | Medium | Medium | P3 |

---

*Last Updated: 2024-12-29*
*Assessment Version: 2.0*
