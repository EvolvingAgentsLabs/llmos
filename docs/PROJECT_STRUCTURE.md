# LLMos Project Structure

## Overview
This is a clean, developer-friendly Electron + Next.js application with a well-organized directory structure following industry best practices.

## Directory Structure

```
llmos/
├── .claude/                   # Claude Code configuration
│   ├── commands/              # Custom slash commands
│   └── settings.local.json    # Local Claude settings
│
├── electron/                  # Electron main process
│   ├── main.ts               # Main process entry point
│   ├── preload.ts            # IPC bridge (preload script)
│   ├── services/             # Native services
│   │   ├── assemblyscript-compiler.ts
│   │   ├── native-fs.ts
│   │   └── serial-manager.ts
│   ├── types.d.ts            # TypeScript definitions
│   └── tsconfig.json         # Electron TypeScript config
│
├── app/                       # Next.js App Router
│   ├── page.tsx              # Home page
│   ├── layout.tsx            # Root layout
│   └── api/                  # API routes
│
├── components/                # React components
├── lib/                       # Utilities & libraries
│   ├── platform/             # Platform abstraction layer
│   ├── volumes/              # Virtual file system
│   ├── llm-tools/            # LLM tool implementations
│   └── ...
│
├── hooks/                     # React hooks
├── contexts/                  # React contexts
├── styles/                    # CSS & Tailwind styles
│
├── public/                    # Static assets
│   ├── sdk/                  # WASM SDK files
│   ├── lib/                  # Public libraries
│   └── system/               # System files
│
├── __tests__/                 # All tests (consolidated)
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── lib/                  # Library tests
│
├── backend/                   # Python backend services
│   ├── chat.py               # Chat API
│   ├── collaboration-server.py
│   ├── webhooks/             # Webhook handlers
│   └── cron/                 # Scheduled jobs
│
├── docs/                      # Documentation (consolidated)
│   ├── architecture/         # Architecture docs (11 files)
│   ├── guides/               # User guides (3 files)
│   ├── hardware/             # Hardware integration (3 files)
│   └── ui/                   # UI-specific docs (2 files)
│
├── firmware/                  # Hardware firmware
│   └── esp32-flight-controller/
│
├── volumes/                   # Storage volumes (consolidated)
│   ├── user/                 # User workspace
│   └── system/               # System files
│
├── workspace/                 # User workspace
│   └── agents/
│
├── scripts/                   # Build and utility scripts
│   └── build.sh
│
├── assets/                    # Project assets
│
├── .env.example              # Environment template (merged)
├── .gitignore                # Git ignore (merged)
├── .vercelignore             # Vercel ignore
├── package.json              # NPM dependencies & scripts
├── package-lock.json         # NPM lock file
├── tsconfig.json             # TypeScript config
├── next.config.js            # Next.js config
├── tailwind.config.js        # Tailwind CSS config
├── postcss.config.js         # PostCSS config
├── jest.config.js            # Jest test config
├── jest.setup.js             # Jest setup
├── vercel.json               # Vercel config
├── requirements.txt          # Python dependencies (merged)
├── README.md                 # Main documentation
├── LICENSE                   # Apache 2.0 License
└── REFACTORING_ANALYSIS.md   # Refactoring documentation
```

## Key Improvements from Previous Structure

### ✅ Consolidated Directories

**Before:**
- 3 test directories: `__tests__`, `tests`, `tests-llmos-lite`
- 3 docs directories: `docs`, `docs-ui`, `docs-llmos-lite`
- 2 API directories: `api`, `api-backend`
- 2 volumes directories: `volumes`, `volumes-llmos-lite`
- 2 Claude configs: `.claude`, `.claude-ui`

**After:**
- Single `__tests__/` with organized subdirectories
- Single `docs/` with logical categorization
- Single `backend/` for all Python services
- Single `volumes/` with both user and system
- Single `.claude/` configuration

### ✅ Cleaner Root Directory

**Removed duplicates:**
- `.gitignore.ui` → merged into `.gitignore`
- `.requirements.txt` → merged into `requirements.txt`
- `.env.local.example` → merged into `.env.example`

**Organized files:**
- Build scripts moved to `scripts/`
- Hardware docs moved to `docs/hardware/`
- Architecture docs moved to `docs/architecture/`

### ✅ Total Files Consolidated

- **Test directories**: 3 → 1
- **Docs directories**: 3 → 1
- **API directories**: 2 → 1
- **Volumes directories**: 2 → 1
- **Claude configs**: 2 → 1
- **Config files**: Reduced by 3

## Running the Application

### Install Dependencies
```bash
npm install
```

### Development Mode

**Browser Mode (Next.js only):**
```bash
npm run dev
```
Opens at http://localhost:3000

**Desktop Mode (Electron + Next.js):**
```bash
npm run electron:dev
```
Launches the Electron window with full native capabilities

### Production Build

```bash
# Build for desktop
npm run electron:build

# Platform-specific builds
npm run electron:build:win     # Windows
npm run electron:build:mac     # macOS
npm run electron:build:linux   # Linux
```

Output directory: `dist-electron/`

### Testing

```bash
# Run all tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

## Key Features by Mode

| Feature | Browser | Desktop |
|---------|---------|---------|
| C to WASM compilation | ✅ (CDN) | ✅ (local) |
| AssemblyScript compilation | ❌ | ✅ |
| Native file system | ❌ | ✅ |
| Serial ports | Limited | ✅ Full |
| Offline operation | Limited | ✅ |
| System menus | ❌ | ✅ |

## Important Configuration

### Path Aliases
- `@/*` → root directory (configured in `tsconfig.json`)

### Entry Points
- **Main process**: `electron/dist/main.js` (compiled from `electron/main.ts`)
- **Next.js app**: `app/page.tsx`
- **API routes**: `app/api/`

### TypeScript Configs
- **Root**: `tsconfig.json` (for Next.js/React)
- **Electron**: `electron/tsconfig.json` (for main process)

## Platform Detection

The app automatically detects whether it's running in browser or Electron mode:

```typescript
import { isElectron, getPlatformType } from '@/lib/platform';

if (isElectron()) {
  // Use native Electron features
  window.electronFS.read('user', 'file.txt');
} else {
  // Use browser fallbacks
  localStorage.getItem('file');
}
```

## Documentation Organization

### Architecture Docs (`docs/architecture/`)
- Architecture comparisons
- Client-side architecture
- Hybrid architecture implementation
- OS architecture analysis
- WASM4 robot architecture
- And more...

### Hardware Docs (`docs/hardware/`)
- ESP32 complete tutorial
- Hardware quickstart guide
- ESP32-S3 integration test guide

### User Guides (`docs/guides/`)
- Desktop app documentation
- Browser compilation guide

### UI Docs (`docs/ui/`)
- Chat workflow improvement plan
- RLM architecture analysis

## Backend Services

The `backend/` directory contains Python services:
- **chat.py**: Chat API endpoints
- **collaboration-server.py**: Real-time collaboration
- **webhooks/**: GitHub webhook handlers
- **cron/**: Scheduled background jobs

## Development Tips

1. **Hot reload**: Both browser and desktop modes support hot reload
2. **Type safety**: Run `npm run type-check` before committing
3. **Code quality**: Run `npm run lint` to check code style
4. **Testing**: Tests are organized by type in `__tests__/`
5. **Documentation**: All docs are in `docs/` with clear categories

## Migration Notes

### No Breaking Changes
- All imports work the same (using `@/*` alias)
- All functionality preserved
- Only directory structure changed

### What Changed
- Duplicate directories consolidated
- Better organization and categorization
- Cleaner root directory
- More intuitive structure

## Benefits

✅ **Easier to navigate** - Clear hierarchy
✅ **Less confusion** - No duplicate directories
✅ **Industry standard** - Follows best practices
✅ **Better DX** - Developers know where to find things
✅ **Scalable** - Structure supports growth
✅ **Professional** - Clean, organized codebase
