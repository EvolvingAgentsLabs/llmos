# LLMos Desktop

**Last Updated:** January 2026

LLMos Desktop is the native desktop application version of LLMos, built with Electron. It provides enhanced capabilities over the web version, including native file system access, AssemblyScript compilation, and direct serial port communication with ESP32 devices.

## Features

### Platform Comparison

| Feature | Web | Desktop |
|---------|-----|---------|
| C to WASM compilation | ✅ (via CDN) | ✅ (local) |
| AssemblyScript compilation | ✅ (browser CDN) | ✅ (native, faster) |
| Native file system | ❌ (virtual FS) | ✅ |
| Serial ports | Limited (Web Serial) | ✅ (full access) |
| Offline operation | ❌ | ✅ |
| System menus | ❌ | ✅ |
| File dialogs | Browser-based | Native |
| Compilation speed | ~3-5s | ~1-3s |

**New in v1.0**: AssemblyScript compilation is now available in both web and desktop modes! The web version uses a browser-based compiler loaded from CDN, while desktop uses native Node.js compilation for better performance.

### AssemblyScript Support

AssemblyScript is a TypeScript-like language that compiles to WebAssembly. It's ideal for:

- Web developers familiar with TypeScript syntax
- Type-safe robot behaviors
- Better error messages than C
- Smaller learning curve than Rust

```typescript
// Example Robot4 behavior in AssemblyScript
import { drive, distance, led } from "./robot4";

export function update(): void {
  const d = distance(0);
  if (d < 30) {
    drive(50, -50); // Turn
    led(255, 0, 0); // Red
  } else {
    drive(60, 60);  // Forward
    led(0, 255, 0); // Green
  }
}
```

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/EvolvingAgentsLabs/llmos.git
cd llmos

# Install dependencies
npm install

# Start development mode
npm run electron:dev
```

This will:
1. Start the Next.js development server
2. Launch Electron once the server is ready
3. Open the desktop app with hot-reload

### Building for Production

```bash
# Build for your current platform
npm run electron:build

# Platform-specific builds
npm run electron:build:win    # Windows (.exe)
npm run electron:build:mac    # macOS (.dmg)
npm run electron:build:linux  # Linux (.AppImage)
```

Built packages will be in `dist-electron/`.

## Architecture

```
┌────────────────────────────────────────────────┐
│              Electron Main Process              │
│  ┌──────────────────────────────────────────┐  │
│  │  Services                                 │  │
│  │  ├─ AssemblyScriptCompiler               │  │
│  │  ├─ NativeFileSystem                     │  │
│  │  └─ SerialManager                        │  │
│  └──────────────────────────────────────────┘  │
│                     ↓ IPC                       │
├────────────────────────────────────────────────┤
│              Renderer Process                   │
│  ┌──────────────────────────────────────────┐  │
│  │  Next.js / React App                      │  │
│  │  ├─ Platform abstraction layer           │  │
│  │  ├─ LLM Tools (file, asc, serial)        │  │
│  │  ├─ Robot4 Simulator                     │  │
│  │  └─ Monaco Editor                        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### File Locations

| Volume | Desktop Path | Purpose |
|--------|--------------|---------|
| user | ~/Documents/LLMos/user | User workspace |
| team | ~/Documents/LLMos/team | Shared workspace |
| system | {appData}/system | System templates |

### IPC Channels

The preload script exposes these APIs to the renderer:

- `window.electronFS` - File system operations
- `window.electronASC` - AssemblyScript compiler
- `window.electronSerial` - Serial port communication
- `window.electronSystem` - System utilities

## Platform Detection

### Runtime Mode Indicator

LLMos includes a platform indicator component that shows the current runtime mode (Desktop vs Web) and available capabilities:

```tsx
import { PlatformIndicator, PlatformBadge } from '@/components/system/PlatformIndicator';

// Full expandable indicator (bottom-right corner)
<PlatformIndicator />

// Compact badge (for headers/toolbars)
<PlatformBadge />
```

The platform indicator displays:
- Current runtime mode (Desktop or Web)
- Available capabilities (filesystem, compilation, serial ports, etc.)
- Feature comparison between modes
- Link to download desktop app (when in web mode)

### Platform Abstraction Layer

All platform-specific APIs are abstracted through `/lib/platform/index.ts`:

```tsx
import { PlatformFS, PlatformASC, PlatformSerial, getPlatformCapabilities } from '@/lib/platform';

// File operations work in both web and desktop
const content = await PlatformFS.read('user', 'myfile.txt');

// AssemblyScript compilation automatically uses best available compiler
const result = await PlatformASC.compile(source, { robot4Mode: true });

// Check capabilities at runtime
const caps = getPlatformCapabilities();
if (caps.nativeAssemblyScript) {
  console.log('Using native compiler for faster builds');
}
```

## Development

### Project Structure

```
electron/
├── main.ts              # Main process entry
├── preload.ts           # IPC bridge
├── tsconfig.json        # TypeScript config
├── types.d.ts           # Type declarations
└── services/
    ├── assemblyscript-compiler.ts  # Native ASC compiler
    ├── native-fs.ts                # Native filesystem
    ├── serial-manager.ts           # Serial port manager
    └── index.ts

lib/platform/
└── index.ts             # Platform abstraction layer

components/system/
└── PlatformIndicator.tsx  # Runtime mode indicator
```

### Adding New IPC Handlers

1. Add handler in `electron/main.ts`:
```typescript
ipcMain.handle('my:action', async (_, arg1, arg2) => {
  return myService.doSomething(arg1, arg2);
});
```

2. Expose in `electron/preload.ts`:
```typescript
const myAPI = {
  action: (arg1: string, arg2: number) =>
    ipcRenderer.invoke('my:action', arg1, arg2),
};
contextBridge.exposeInMainWorld('myAPI', myAPI);
```

3. Add types in `electron/types.d.ts`:
```typescript
interface MyAPI {
  action(arg1: string, arg2: number): Promise<string>;
}
declare global {
  interface Window {
    myAPI?: MyAPI;
  }
}
```

### Debugging

- **Main process**: Use VS Code debugger with Electron launch config
- **Renderer**: Use Chrome DevTools (View → Toggle Developer Tools)
- **IPC**: Log in both main and preload scripts

## Hardware Integration

### ESP32 Connection

1. Connect ESP32 via USB
2. Hardware menu → Connect ESP32
3. Select the serial port
4. Deploy WASM to device

### Supported Devices

- ESP32-S3 with WASMachine firmware
- Any ESP32 with compatible bootloader
- USB-Serial adapters

## Troubleshooting

### Common Issues

**AssemblyScript compilation fails**
- Ensure `assemblyscript` is installed: `npm install assemblyscript`
- Check Node.js version (requires 18+)

**Serial port not found**
- Check USB connection
- Install drivers if needed (CP2102/CH340)
- On Linux: add user to `dialout` group

**Build fails on macOS**
- Sign the app or disable gatekeeper
- Use `--mac --arm64` for Apple Silicon

## License

MIT License - see LICENSE file for details.
