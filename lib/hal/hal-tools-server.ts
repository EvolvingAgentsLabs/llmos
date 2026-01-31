/**
 * HAL Tools Server Loader
 *
 * Server-side utility to load HAL tool definitions from markdown files.
 * This runs on the server and initializes the tool registry.
 */

import fs from 'fs';
import path from 'path';
import { getHALToolRegistry, initializeHALTools } from './hal-tool-loader';
import { logger } from '@/lib/debug/logger';

const HAL_TOOLS_DIR = 'volumes/system/hal-tools';

/**
 * Load all HAL tool definitions from the filesystem
 */
export async function loadHALToolsFromFilesystem(): Promise<void> {
  const toolsPath = path.join(process.cwd(), HAL_TOOLS_DIR);

  if (!fs.existsSync(toolsPath)) {
    logger.warn('hal', `HAL tools directory not found: ${toolsPath}`);
    return;
  }

  const files = fs.readdirSync(toolsPath).filter(f => f.endsWith('.md'));
  const tools: Record<string, string> = {};

  for (const file of files) {
    const filePath = path.join(toolsPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      tools[file] = content;
    } catch (error) {
      logger.error('hal', `Failed to read ${file}`, { error });
    }
  }

  initializeHALTools(tools);
  logger.info('hal', `Loaded ${Object.keys(tools).length} HAL tools from ${HAL_TOOLS_DIR}`);
}

/**
 * Save updated HAL tool back to filesystem
 * Used by the Dreaming Engine to persist learned improvements
 */
export async function saveHALTool(name: string): Promise<boolean> {
  const registry = getHALToolRegistry();
  const markdown = registry.exportToMarkdown(name);

  if (!markdown) {
    logger.warn('hal', `Tool not found: ${name}`);
    return false;
  }

  const toolsPath = path.join(process.cwd(), HAL_TOOLS_DIR);
  const filePath = path.join(toolsPath, `${name}.md`);

  try {
    fs.writeFileSync(filePath, markdown, 'utf-8');
    logger.info('hal', `Saved HAL tool: ${name}`);
    return true;
  } catch (error) {
    logger.error('hal', `Failed to save ${name}`, { error });
    return false;
  }
}

/**
 * Get HAL tools as a bundle for client-side use
 * Returns all tool markdown contents as a single object
 */
export async function getHALToolsBundle(): Promise<Record<string, string>> {
  const toolsPath = path.join(process.cwd(), HAL_TOOLS_DIR);

  if (!fs.existsSync(toolsPath)) {
    return {};
  }

  const files = fs.readdirSync(toolsPath).filter(f => f.endsWith('.md'));
  const tools: Record<string, string> = {};

  for (const file of files) {
    const filePath = path.join(toolsPath, file);
    try {
      tools[file] = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // Skip files that can't be read
    }
  }

  return tools;
}

/**
 * Watch HAL tools directory for changes (development mode)
 */
export function watchHALTools(onChange: () => void): () => void {
  const toolsPath = path.join(process.cwd(), HAL_TOOLS_DIR);

  if (!fs.existsSync(toolsPath)) {
    return () => {};
  }

  const watcher = fs.watch(toolsPath, (eventType, filename) => {
    if (filename?.endsWith('.md')) {
      logger.info('hal', `HAL tool changed: ${filename}`);
      loadHALToolsFromFilesystem().then(onChange);
    }
  });

  return () => watcher.close();
}
