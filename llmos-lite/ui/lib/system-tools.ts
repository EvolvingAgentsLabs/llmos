/**
 * System Tools for LLMunix SystemAgent
 *
 * Provides file system, Python execution, and agent creation tools
 */

import { getVFS } from './virtual-fs';
import { executePython } from './pyodide-runtime';

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
 * Get all system tools
 */
export function getSystemTools(): ToolDefinition[] {
  return [
    WriteFileTool,
    ReadFileTool,
    ListDirectoryTool,
    ExecutePythonTool,
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
