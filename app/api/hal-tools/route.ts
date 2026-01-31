/**
 * HAL Tools API
 *
 * Serves HAL tool definitions from markdown files.
 * Enables runtime loading and evolution of tool definitions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getHALToolsBundle, loadHALToolsFromFilesystem } from '@/lib/hal/hal-tools-server';
import { getHALToolRegistry } from '@/lib/hal/hal-tool-loader';

// Initialize tools on first request
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await loadHALToolsFromFilesystem();
    initialized = true;
  }
}

/**
 * GET /api/hal-tools
 *
 * Returns HAL tool definitions.
 *
 * Query params:
 * - format: 'bundle' | 'definitions' | 'openai' | 'gemini'
 *   - bundle: Raw markdown contents
 *   - definitions: Parsed tool definitions with metadata
 *   - openai: OpenAI function calling format
 *   - gemini: Gemini function calling format
 */
export async function GET(request: NextRequest) {
  await ensureInitialized();

  const format = request.nextUrl.searchParams.get('format') || 'definitions';
  const registry = getHALToolRegistry();

  switch (format) {
    case 'bundle':
      const bundle = await getHALToolsBundle();
      return NextResponse.json({ tools: bundle });

    case 'definitions':
      return NextResponse.json({
        tools: registry.getAll().map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          metadata: tool.metadata,
          examples: tool.examples,
          evolutionHistory: tool.evolutionHistory,
        })),
      });

    case 'openai':
      return NextResponse.json({
        tools: registry.getOpenAIDefinitions(),
      });

    case 'gemini':
      return NextResponse.json(registry.getGeminiDefinitions());

    default:
      return NextResponse.json(
        { error: `Unknown format: ${format}` },
        { status: 400 }
      );
  }
}

/**
 * POST /api/hal-tools/reload
 *
 * Reloads HAL tools from filesystem.
 * Useful after editing markdown files.
 */
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'reload') {
    await loadHALToolsFromFilesystem();
    initialized = true;
    const registry = getHALToolRegistry();
    return NextResponse.json({
      success: true,
      toolCount: registry.getAll().length,
    });
  }

  return NextResponse.json(
    { error: 'Unknown action' },
    { status: 400 }
  );
}
