# Browser-Based WASM Compilation

## Overview

LLMos compiles C code to WebAssembly **entirely in the browser** using Wasmer SDK and clang.wasm. This aligns with the "OS in the Browser" philosophy - no backend compilation server needed.

## Architecture

```
User writes C code
     ↓
Browser loads Clang (WASM)
     ↓
Compile C → WASM (in browser)
     ↓
Deploy to ESP32 via TCP
```

**Key Benefit**: Zero backend infrastructure. Everything runs client-side.

## Implementation

### 1. WasmCompiler Service

Located: `llmos-lite/ui/lib/runtime/wasm-compiler.ts`

**Features**:
- Singleton pattern (loads Clang once per session)
- Lazy loading (~30MB download on first use)
- Caches compiler between compilations
- Includes ESP32 SDK headers automatically

**Usage**:
```typescript
import { compileWasm } from '@/lib/runtime/wasm-compiler';

const result = await compileWasm({
  source: cSourceCode,
  name: 'myapp',
  optimizationLevel: '3'
});

if (result.success) {
  const wasmBinary = result.wasmBinary; // Uint8Array
  // Deploy to ESP32...
}
```

### 2. SDK Headers

Located: `llmos-lite/public/sdk/wasi-headers/`

**Provided Headers**:
- `wm_ext_wasm_native.h` - GPIO, WiFi, HTTP
- `wm_ext_wasm_native_mqtt.h` - MQTT client API
- `wm_ext_wasm_native_rainmaker.h` - ESP RainMaker cloud

These headers are loaded into the compiler's virtual filesystem automatically.

### 3. Integration with Deploy Tool

The `deploy-wasm-app` system tool uses the browser compiler:

```typescript
// OLD (server-based):
const response = await fetch('/api/compile-wasm', { ... });

// NEW (browser-based):
const { compileWasm } = await import('./runtime/wasm-compiler');
const result = await compileWasm({ ... });
```

## Performance

### First Compilation
- **Initial Load**: ~30MB download (Clang + LLVM toolchain)
- **Cache**: Stored in browser, only downloads once
- **Compile Time**: ~2-5 seconds for simple programs

### Subsequent Compilations
- **Load Time**: Instant (cached)
- **Compile Time**: ~1-3 seconds

## Comparison: Browser vs Server

| Feature | Browser-Based ✅ | Server-Based ❌ |
|---------|-----------------|----------------|
| **Privacy** | High (code never leaves browser) | Low (code sent to server) |
| **Cost** | Zero (uses user's CPU) | High (Vercel/AWS costs) |
| **Setup** | None (just npm install) | Docker, wasi-sdk, backend |
| **Vercel Deploy** | Works perfectly | Fails (no Docker on Vercel) |
| **Philosophy** | "OS in Browser" ✅ | Breaks philosophy ❌ |
| **Initial Load** | 30MB (~10sec on 3G) | Zero |
| **Compile Speed** | 2-5 seconds | 1-2 seconds |

## Why This Approach?

### Problem: Backend Compilation Doesn't Work
- ❌ Vercel doesn't support Docker
- ❌ Requires backend server infrastructure
- ❌ Goes against "everything in browser" philosophy
- ❌ Code leaves user's machine (privacy concern)

### Solution: Browser Compilation
- ✅ Works on Vercel (no Docker needed)
- ✅ No backend required
- ✅ Fully client-side (privacy++)
- ✅ Aligns with LLMos philosophy
- ✅ Truly magical experience

## How It Works

### Step 1: Wasmer SDK
```typescript
import { init, Wasmer } from '@wasmer/sdk';

await init();
const clang = await Wasmer.fromRegistry('clang/clang');
```

### Step 2: Virtual Filesystem
```typescript
import { Directory } from '@wasmer/sdk';

const projectDir = new Directory();
await projectDir.writeFile('main.c', sourceCode);
await projectDir.writeFile('wm_ext_wasm_native.h', headerContent);
```

### Step 3: Compilation
```typescript
const instance = await clang.entrypoint.run({
  args: [
    '/project/main.c',
    '-o', '/project/main.wasm',
    '--target=wasm32-wasi',
    '-O3',
    '-I/project'  // Include SDK headers
  ],
  mount: { '/project': projectDir }
});
```

### Step 4: Extract Binary
```typescript
const wasmBinary = await projectDir.readFile('main.wasm');
// Now deploy to ESP32 via TCP
```

## User Experience

### First-Time User
1. User writes C code
2. Clicks "Deploy"
3. **Browser downloads Clang (30MB, ~10sec)**
4. Progress indicator: "Downloading compiler..."
5. Compilation happens (~3sec)
6. App deploys to ESP32

### Returning User
1. User writes C code
2. Clicks "Deploy"
3. **Clang already cached** ✅
4. Instant compilation (~2sec)
5. App deploys to ESP32

## Optimization Strategies

### 1. Preloading (Optional)
```typescript
// In app initialization:
import { getWasmCompiler } from '@/lib/runtime/wasm-compiler';

// Preload compiler in background
getWasmCompiler().preload();
```

### 2. Web Worker (Future)
Move compilation to Web Worker to avoid blocking UI:
```typescript
const worker = new Worker('/workers/wasm-compiler.js');
worker.postMessage({ source: code });
worker.onmessage = (result) => { /* handle */ };
```

### 3. Progressive Enhancement
- Show progress bar during first download
- Cache compiler aggressively
- Provide offline mode once cached

## Testing

### Manual Test
```typescript
// In browser console:
const { compileWasm } = await import('./lib/runtime/wasm-compiler');

const result = await compileWasm({
  source: `
    #include <stdio.h>
    int main() {
      printf("Hello from browser-compiled WASM!\\n");
      return 0;
    }
  `,
  name: 'test',
  optimizationLevel: '3'
});

console.log(result);
// Should show: { success: true, size: ~1234, wasmBinary: Uint8Array(...) }
```

### Integration Test
Use `deploy-wasm-app` tool with real ESP32 device.

## Troubleshooting

### Issue: "Failed to load Wasmer SDK"
**Cause**: Network error or CDN down
**Solution**: Check internet connection, retry

### Issue: "Compiler download taking forever"
**Cause**: Slow network
**Solution**: First load is 30MB, be patient. Subsequent loads instant.

### Issue: "Compilation failed with unknown error"
**Cause**: Invalid C syntax
**Solution**: Check error details, common issues:
- Missing semicolons
- Undefined functions
- Type mismatches

### Issue: "Out of memory"
**Cause**: Browser tab memory limit
**Solution**: Close other tabs, restart browser

## Dependencies

**Package**: `@wasmer/sdk` (v0.8.0+)

**Installation**:
```bash
npm install @wasmer/sdk
```

**No other dependencies needed!** 🎉

## Future Enhancements

1. **Incremental Compilation**: Cache intermediate objects
2. **Multi-file Projects**: Support multiple .c/.h files
3. **Code Splitting**: Load compiler components on-demand
4. **Offline Mode**: Service Worker caching
5. **Debug Symbols**: Optional DWARF info for debugging

## Conclusion

Browser-based compilation is the **perfect fit** for LLMos:
- ✅ No backend infrastructure
- ✅ Works on Vercel
- ✅ Privacy-first
- ✅ "OS in Browser" philosophy

**Result**: A truly self-contained, autonomous AI operating system that compiles code locally and deploys to hardware - all from the browser tab. 🚀

---

**Generated**: 2026-01-02
**Author**: Claude Code (Sonnet 4.5)
**Status**: Implemented ✅
