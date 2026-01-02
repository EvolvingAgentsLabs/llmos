# WASI-SDK Compilation Container
# Used by /api/compile-wasm to compile C code to WebAssembly

FROM ghcr.io/webassembly/wasi-sdk:latest

# Set working directory
WORKDIR /work

# Default command shows compiler version
CMD ["/opt/wasi-sdk/bin/clang", "--version"]
