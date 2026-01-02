/**
 * WASM Compilation API Endpoint
 *
 * Compiles C source code to WebAssembly using wasi-sdk in Docker container.
 * Used by deploy-wasm-app tool to create .wasm binaries for ESP32 WASMachine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

// Temporary directory for compilation
const COMPILE_DIR = '/tmp/llmos-wasm-compile';

// Ensure compile directory exists
async function ensureCompileDir() {
  if (!existsSync(COMPILE_DIR)) {
    await mkdir(COMPILE_DIR, { recursive: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { source, name, optimizationLevel = '3' } = await request.json();

    if (!source || typeof source !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid source code' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid app name' },
        { status: 400 }
      );
    }

    await ensureCompileDir();

    // Generate unique ID for this compilation
    const compilationId = crypto.randomBytes(8).toString('hex');
    const sourceFile = path.join(COMPILE_DIR, `${compilationId}.c`);
    const wasmFile = path.join(COMPILE_DIR, `${compilationId}.wasm`);
    const outputName = `${name}.wasm`;

    console.log(`[WASM Compile] Starting compilation: ${name} (${compilationId})`);

    // Write source code to temporary file
    await writeFile(sourceFile, source, 'utf-8');

    // Compile command using wasi-sdk Docker container
    // If Docker is not available, this will fall back to local wasi-sdk if installed
    const compileCmd = `
      if command -v docker &> /dev/null; then
        # Use Docker container with wasi-sdk
        docker run --rm \
          -v ${COMPILE_DIR}:/work \
          ghcr.io/webassembly/wasi-sdk:latest \
          /opt/wasi-sdk/bin/clang \
          -O${optimizationLevel} \
          -o /work/${compilationId}.wasm \
          /work/${compilationId}.c \
          -Wl,--export=main \
          -Wl,--export=__heap_base \
          -Wl,--export=__data_end \
          -Wl,--no-entry \
          -Wl,--allow-undefined \
          -Wl,--strip-all
      else
        # Fallback to local wasi-sdk if available
        if [ -d /opt/wasi-sdk ]; then
          /opt/wasi-sdk/bin/clang \
            -O${optimizationLevel} \
            -o ${wasmFile} \
            ${sourceFile} \
            -Wl,--export=main \
            -Wl,--export=__heap_base \
            -Wl,--export=__data_end \
            -Wl,--no-entry \
            -Wl,--allow-undefined \
            -Wl,--strip-all
        else
          echo "ERROR: Neither Docker nor local wasi-sdk found" >&2
          exit 1
        fi
      fi
    `.trim();

    try {
      const { stdout, stderr } = await execAsync(compileCmd, {
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      if (stderr && stderr.includes('ERROR')) {
        throw new Error(stderr);
      }

      console.log(`[WASM Compile] Compilation successful: ${name}`);
      if (stdout) console.log(`[WASM Compile] Output: ${stdout}`);
      if (stderr && !stderr.includes('warning')) {
        console.log(`[WASM Compile] Stderr: ${stderr}`);
      }

    } catch (compileError: any) {
      console.error(`[WASM Compile] Compilation failed: ${compileError.message}`);

      // Clean up temporary files
      await unlink(sourceFile).catch(() => {});

      return NextResponse.json({
        success: false,
        error: 'Compilation failed',
        details: compileError.message,
        hint: 'Check C code syntax. Common issues: missing semicolons, undefined functions, type errors.'
      }, { status: 400 });
    }

    // Read compiled WASM binary
    let wasmBinary: Buffer;
    try {
      wasmBinary = await readFile(wasmFile);
    } catch (readError: any) {
      console.error(`[WASM Compile] Failed to read output: ${readError.message}`);

      // Clean up
      await unlink(sourceFile).catch(() => {});

      return NextResponse.json({
        success: false,
        error: 'Failed to read compiled binary',
        details: readError.message
      }, { status: 500 });
    }

    // Clean up temporary source file (keep .wasm for deployment)
    await unlink(sourceFile).catch(() => {});

    console.log(`[WASM Compile] Binary size: ${wasmBinary.length} bytes`);

    // Return binary as base64 for easy transport
    const wasmBase64 = wasmBinary.toString('base64');

    return NextResponse.json({
      success: true,
      name: outputName,
      size: wasmBinary.length,
      wasmBase64,
      compilationId,
      message: `Compiled successfully: ${wasmBinary.length} bytes`
    });

  } catch (error: any) {
    console.error('[WASM Compile] Unexpected error:', error);

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}

/**
 * GET endpoint - Check compilation service status
 */
export async function GET() {
  try {
    // Check if Docker is available
    let dockerAvailable = false;
    try {
      await execAsync('docker --version');
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }

    // Check if local wasi-sdk is available
    const wasiSdkAvailable = existsSync('/opt/wasi-sdk');

    return NextResponse.json({
      status: 'ok',
      compiler: {
        docker: dockerAvailable,
        localWasiSdk: wasiSdkAvailable,
        ready: dockerAvailable || wasiSdkAvailable
      },
      message: dockerAvailable
        ? 'Docker-based compilation ready'
        : wasiSdkAvailable
        ? 'Local wasi-sdk compilation ready'
        : 'No compiler available. Install Docker or wasi-sdk.'
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
}
