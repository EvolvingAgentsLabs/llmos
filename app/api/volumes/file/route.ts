import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/volumes/file?path=/volumes/system/agents/HardwareControlAgent.md
 * Read a file from the volumes directory
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    // Validate path starts with /volumes/
    if (!filePath.startsWith('/volumes/')) {
      return NextResponse.json(
        { success: false, error: 'Invalid path - must start with /volumes/' },
        { status: 400 }
      );
    }

    // Remove /volumes/ prefix and resolve to actual path
    const relativePath = filePath.replace(/^\/volumes\//, '');
    const volumesDir = path.join(process.cwd(), 'volumes');
    const absolutePath = path.join(volumesDir, relativePath);

    // Security check - prevent path traversal
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(volumesDir)) {
      return NextResponse.json(
        { success: false, error: 'Invalid path - path traversal detected' },
        { status: 400 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Check if it's a file
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return NextResponse.json(
        { success: false, error: 'Path is not a file' },
        { status: 400 }
      );
    }

    // Read file content
    const content = fs.readFileSync(absolutePath, 'utf-8');

    // Determine MIME type
    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'text/plain';
    if (ext === '.md') contentType = 'text/markdown';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.yaml' || ext === '.yml') contentType = 'text/yaml';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.ts' || ext === '.tsx') contentType = 'application/typescript';

    return NextResponse.json({
      success: true,
      path: filePath,
      content,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      contentType,
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
