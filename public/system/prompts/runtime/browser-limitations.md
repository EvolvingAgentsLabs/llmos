---
name: BrowserRuntimeLimitations
type: runtime
version: "1.0"
description: General browser runtime limitations for all code execution
variables: []
evolved_from: null
origin: created
---

# Browser Runtime Limitations

LLMos runs entirely in the browser. All code execution happens client-side via WebAssembly runtimes. This document describes the fundamental limitations.

## Execution Environment

### JavaScript/TypeScript
- Full ES2020+ support
- React 18 available for applets
- No Node.js APIs (fs, path, http, etc.)
- No native modules

### Python (via Pyodide)
- Python 3.11 runtime
- WebAssembly-compiled packages only
- No C extensions that aren't pre-compiled
- See `python-constraints.md` for details

### WebAssembly
- Full WASM support
- WASI preview1 support
- Memory limit: ~4GB theoretical, ~256MB practical

## Network Restrictions

### No Direct Network Access
- Cannot make HTTP requests from Python
- Cannot open sockets
- Cannot access external APIs directly

### Workarounds
- Use tool calls to fetch external data
- System provides curated data through tools
- Agent can request specific URLs to be fetched

## File System

### Virtual File System (VFS)
- All file operations use the VFS
- Three volumes: `user/`, `team/`, `system/`
- System volume is read-only
- Files persist in browser IndexedDB

### No Real Filesystem
```python
# WRONG - won't work
with open('/tmp/data.txt', 'w') as f:
    f.write('data')

# RIGHT - use tool call
# The agent should use write-file tool instead
```

## Memory Management

### Limits
- Python heap: ~256MB
- JavaScript heap: ~1GB
- Large arrays/dataframes may cause issues

### Best Practices
- Process data in chunks
- Clear large variables when done
- Avoid loading entire datasets in memory

## Execution Time

### Timeouts
- Python execution: 30 second default
- Applet compilation: 10 seconds
- Tool execution: 60 seconds

### Long-Running Tasks
- Break into smaller chunks
- Use progress indicators
- Consider async patterns

## Security

### Sandboxed Environment
- Code runs in isolated context
- No access to browser APIs (localStorage, cookies)
- No DOM manipulation outside applets
- CSP restrictions apply

### Safe Operations
- Mathematical computations
- Data transformations
- Visualization generation
- Algorithm execution

### Blocked Operations
- Arbitrary code execution outside sandbox
- System calls
- Native binary execution
- Browser extension access

## Hardware Access

### Available (via tools)
- ESP32 via Web Serial API
- Camera via MediaDevices API (through applets)
- Microphone via MediaDevices API (through applets)

### Not Available
- Direct USB access
- Bluetooth (limited via Web Bluetooth)
- Local file system
- Native GPU compute (WebGPU in progress)

## Concurrency

### Web Workers
- Python runs in a Web Worker
- Non-blocking execution
- Message passing for results

### Limitations
- No true parallelism in Python
- SharedArrayBuffer restrictions
- One Python instance at a time

## Recommended Patterns

### For Data Processing
```python
# Process in chunks
chunk_size = 1000
results = []
for i in range(0, len(data), chunk_size):
    chunk = data[i:i+chunk_size]
    results.append(process(chunk))
final = combine(results)
```

### For Visualization
```python
# Always use matplotlib
import matplotlib.pyplot as plt

# Create figure with reasonable size
fig, ax = plt.subplots(figsize=(10, 6))
# ... plotting code ...
plt.tight_layout()
plt.show()  # Returns base64 image
```

### For Large Computations
```python
# Use efficient libraries
import numpy as np
from scipy import signal

# Vectorized operations are fast
result = np.fft.fft(signal_data)

# Avoid Python loops for numerical work
# BAD: [x**2 for x in range(1000000)]
# GOOD: np.arange(1000000)**2
```
