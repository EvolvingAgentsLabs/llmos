# WASI-SDK Compilation Container

This Docker container provides a consistent WebAssembly compilation environment for LLMos ESP32 WASM deployments.

## Purpose

The `/api/compile-wasm` endpoint uses this container to:
1. Compile C source code to `.wasm` binaries
2. Apply optimizations (`-O3`, `--strip-all`)
3. Export required symbols for ESP32 WAMR runtime

## Usage

The API endpoint automatically uses this container via Docker. No manual setup required.

### Manual Compilation (for testing)

```bash
# Build the container (optional - API uses official image)
docker build -t llmos-wasi-sdk ./docker/wasi-sdk

# Compile a C file manually
docker run --rm \
  -v $(pwd):/work \
  ghcr.io/webassembly/wasi-sdk:latest \
  /opt/wasi-sdk/bin/clang \
  -O3 \
  -o /work/output.wasm \
  /work/source.c \
  -Wl,--export=main \
  -Wl,--export=__heap_base \
  -Wl,--export=__data_end \
  -Wl,--no-entry \
  -Wl,--allow-undefined \
  -Wl,--strip-all
```

## Compiler Flags Explained

- **-O3**: Maximum optimization (important for ESP32's limited CPU)
- **--export=main**: Make main() visible to WAMR
- **--export=__heap_base**: Export heap base address
- **--export=__data_end**: Export data section end
- **--no-entry**: No WASI `_start` wrapper (we call main() directly)
- **--allow-undefined**: Native functions resolved at runtime by WASMachine firmware
- **--strip-all**: Remove debug symbols to reduce binary size

## Fallback

If Docker is not available, the API automatically falls back to local `/opt/wasi-sdk` installation (if present).

## Testing

Check if compiler is accessible:

```bash
# Test Docker container
docker run --rm ghcr.io/webassembly/wasi-sdk:latest /opt/wasi-sdk/bin/clang --version

# Test local installation
/opt/wasi-sdk/bin/clang --version
```

## Resources

- WASI-SDK: https://github.com/WebAssembly/wasi-sdk
- ESP32 WASMachine: https://github.com/espressif/esp-wasmachine
- WAMR (Runtime): https://github.com/bytecodealliance/wasm-micro-runtime
