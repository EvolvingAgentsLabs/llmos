# Week 1 Code Audit: Browser vs Desktop

**Date**: January 18, 2026
**Purpose**: Identify browser-specific code for desktop-only simplification
**Status**: ✅ Complete

## Executive Summary

- **Total files audited**: 142 TypeScript files in `lib/`
- **Files with browser APIs**: 58 files
- **Files using platform abstraction**: 2 files
- **Browser-only systems**: Virtual FS, CDN compilation, Web Serial fallbacks
- **Recommendation**: Keep browser code commented for Phase 2, focus desktop-only for Phase 1

---

## Platform Abstraction Layer

### Current Files

**`lib/platform/index.ts`** (361 lines)
- Dual-mode platform detection
- Platform-agnostic APIs: `PlatformFS`, `PlatformASC`, `PlatformSerial`, `PlatformSystem`
- Browser fallbacks for each API

**Used By**:
- `lib/llm-tools/assemblyscript-tools.ts` (minimal usage)
- Almost all other files use direct browser or Electron APIs

### Decision: **SIMPLIFY**

**Action**:
```typescript
// Before: Dual mode
if (isElectron()) {
  return window.electronFS.read(...)
} else {
  return vfs.readFile(...) // Browser fallback
}

// After: Desktop-only
return window.electronFS.read(...)
// Keep browser code commented for future
```

**Files to Update**:
- [ ] `lib/platform/index.ts` - Simplify to desktop-only, comment browser paths
- [ ] `lib/platform/capabilities.ts` - Remove browser capability checks

---

## Browser-Only Systems to Remove/Simplify

### 1. Virtual File System (Browser localStorage)

**File**: `lib/virtual-fs.ts` (468 lines)
- localStorage-based file system for browser
- Used when no native FS available
- Complex event system, indexing, directory management

**Usage**: Fallback in `PlatformFS` when not Electron

**Decision**: **KEEP COMMENTED**
- Don't delete (useful for future web version)
- Remove from active code paths
- Desktop always uses native FS

**Impact**: Simplifies file operations significantly

---

### 2. Browser AssemblyScript Compilation

**File**: `lib/runtime/assemblyscript-compiler.ts` (694 lines)

**Browser-Specific Code** (Lines 434-479):
```typescript
// Loads AssemblyScript compiler from CDN
const cdnUrl = 'https://cdn.jsdelivr.net/npm/assemblyscript@0.27.29/dist/asc.js';

await new Promise<void>((resolve, reject) => {
  const script = document.createElement('script');
  script.src = cdnUrl;
  script.onload = () => { ... }
  document.head.appendChild(script);
});
```

**Decision**: **SIMPLIFY**
- Desktop uses native compilation (Electron service)
- Keep browser compilation class but don't load it
- Remove CDN loading in desktop mode

**Files to Update**:
- [ ] `lib/runtime/assemblyscript-compiler.ts` - Add desktop-only guard
- [ ] `lib/llm-tools/assemblyscript-tools.ts` - Use Electron compiler directly

---

### 3. Web Serial API Fallbacks

**File**: `lib/hardware/serial-manager.ts`

**Browser-Specific Code**:
- Web Serial API checks (`'serial' in navigator`)
- User gesture requirements
- Limited device detection

**Decision**: **REMOVE FALLBACKS**
- Desktop has full serial port access
- No Web Serial API needed
- Simplify to native node-serialport only

**Files to Update**:
- [ ] `lib/platform/index.ts` - Remove Web Serial paths in `PlatformSerial`
- [ ] `lib/hardware/serial-manager.ts` - Electron-only implementation

---

### 4. Browser Window/Navigator Usage

**Files with window/navigator** (58 total):

**Categories**:

**A. Essential (Keep)**:
- Window checks for SSR: `typeof window === 'undefined'`
- Electron detection: `window.electronSystem !== undefined`
- Storage access: `window.localStorage` (keep, it's available in Electron)

**B. Browser-Only (Remove/Simplify)**:
- `navigator.userAgent` - For browser OS detection (not needed)
- `navigator.serial` - Web Serial API (remove)
- `document.createElement('script')` - CDN loading (remove)
- `window.open()` - Use Electron shell.openExternal instead

**Decision**: **SIMPLIFY CASE-BY-CASE**
- Keep SSR checks (Next.js needs them)
- Replace browser APIs with Electron equivalents
- Remove browser-specific feature detection

---

## Files Requiring Updates

### Priority 1: Core Platform (Week 1 Day 3-4)

| File | Lines | Action | Impact |
|------|-------|--------|--------|
| `lib/platform/index.ts` | 361 | Simplify to desktop-only, comment browser paths | High - affects all file ops |
| `lib/runtime/assemblyscript-compiler.ts` | 694 | Skip browser initialization in desktop | Medium - faster compile |
| `lib/virtual-fs.ts` | 468 | Comment out, keep for reference | Low - not used in desktop |

### Priority 2: Hardware (Week 3)

| File | Lines | Action | Impact |
|------|-------|--------|--------|
| `lib/hardware/serial-manager.ts` | ? | Remove Web Serial fallbacks | Medium - cleaner code |
| `lib/hardware/esp32-wasm4-vm.ts` | ? | Desktop-only communication | Low |
| `lib/hardware/wasm4-runtime.ts` | ? | Review browser checks | Low |

### Priority 3: Tools & Utilities (Ongoing)

| File | Action |
|------|--------|
| `lib/llm-tools/assemblyscript-tools.ts` | Use PlatformASC, works in desktop mode |
| `lib/llm-tools/git-tools-enhanced.ts` | Desktop git operations already work |
| `lib/system-tools.ts` | Review browser API usage |

---

## What to KEEP (Don't Remove)

### 1. Electron Integration ✅
- All `window.electron*` APIs
- IPC communication
- Native services

### 2. Next.js SSR Checks ✅
```typescript
if (typeof window === 'undefined') return; // SSR check
```
- Keep these! Next.js needs them
- Not browser-specific, it's SSR handling

### 3. Robot4 Standard Library ✅
- `ROBOT4_STDLIB_SOURCE` in assemblyscript-compiler.ts
- This is the API for ESP32, not browser-specific
- Keep as-is

### 4. Storage APIs ✅
- `localStorage` works in Electron
- `sessionStorage` works in Electron
- Keep for app state

### 5. React/UI Code ✅
- All React components
- UI state management
- Don't touch!

---

## What to REMOVE

### Immediate (Week 1)

1. **Browser Compiler Initialization**
   - CDN script loading
   - Browser-based compilation
   - Use native Electron compiler only

2. **Virtual FS Active Usage**
   - Remove from PlatformFS fallback
   - Keep file for reference (commented)

3. **Web Serial API Checks**
   - Remove `'serial' in navigator` checks
   - Desktop has full serial access

### Later (Week 3+)

1. **Browser-Only Features**
   - PWA utilities (`lib/pwa-utils.ts`)
   - Browser-specific optimizations
   - Web-only authentication flows

2. **Pyodide Runtime** (if browser-only)
   - Check if used in desktop
   - If browser-only, remove from build

---

## Implementation Strategy

### Week 1 Day 3-4: Platform Simplification

**Step 1: Create Desktop-Only Platform Layer**
```bash
# New file
lib/platform/desktop.ts
```

**Contents**:
```typescript
// Desktop-only platform APIs (no browser fallbacks)
export const DesktopFS = {
  read: (volumeType: string, path: string) => {
    return window.electronFS.read(volumeType, path);
  },
  // ... other methods, all using window.electron* directly
};

export const DesktopASC = {
  compile: (source: string, options: any) => {
    return window.electronASC.compile(source, options);
  },
  // ... no browser fallback
};

export const DesktopSerial = {
  // Native serial only, no Web Serial API
};
```

**Step 2: Update lib/platform/index.ts**
```typescript
// Option A: Direct desktop (Phase 1)
export * from './desktop';

// Option B: Keep dual-mode but simplified (Phase 2+)
if (isElectron()) {
  export * from './desktop';
} else {
  // Browser mode (future)
  // export * from './browser';
  throw new Error('Browser mode not supported in this build');
}
```

**Step 3: Update Compilation**
```typescript
// lib/runtime/assemblyscript-compiler.ts

async doInitialize(): Promise<void> {
  // Desktop-only path
  if (typeof window !== 'undefined' && window.electronASC) {
    console.log('[Desktop-ASC] Using native Electron compiler');
    this.isInitialized = true;
    return;
  }

  // Browser path (commented out for Phase 1)
  /*
  console.log('[Browser-ASC] Loading AssemblyScript compiler...');
  const cdnUrl = 'https://cdn.jsdelivr.net/npm/assemblyscript@0.27.29/dist/asc.js';
  // ... browser loading code
  */

  throw new Error('ASC compiler requires LLMos Desktop');
}
```

---

## Code Size Impact

### Before (Current - Dual Mode)
```
lib/platform/index.ts:       361 lines
lib/virtual-fs.ts:           468 lines
lib/runtime/asc-compiler.ts: 694 lines (includes browser init)
Total browser support:       ~1,500+ lines
```

### After (Desktop-Only)
```
lib/platform/desktop.ts:     ~150 lines (simple, no fallbacks)
lib/virtual-fs.ts:           0 lines (commented, kept for reference)
lib/runtime/asc-compiler.ts: ~200 lines (desktop-only)
Total:                       ~350 lines

Reduction: ~75% less platform abstraction code
```

---

## Testing Plan

### After Simplification

1. **Build Test**
   ```bash
   npm run electron:build
   # Should build cleanly with no browser deps
   ```

2. **Boot Test**
   ```bash
   npm run electron:dev
   # Should boot faster (no browser checks)
   ```

3. **File Operations Test**
   - Create file
   - Read file
   - Delete file
   - All should use native FS

4. **Compilation Test**
   - Compile AssemblyScript
   - Should use native Electron compiler
   - No CDN loading

5. **Serial Test** (Week 3)
   - Connect ESP32
   - No Web Serial fallback
   - Full native access

---

## Risk Assessment

### Risk: Breaking Existing Functionality
**Likelihood**: Medium
**Mitigation**:
- Keep browser code commented, not deleted
- Test each change incrementally
- Can revert quickly

### Risk: Future Web Version More Difficult
**Likelihood**: Low
**Mitigation**:
- All browser code preserved (commented)
- Clear documentation of changes
- Can uncomment and re-enable in Phase 2

### Risk: Platform Detection Issues
**Likelihood**: Low
**Mitigation**:
- Desktop-only build, no detection needed
- Clear error messages if browser attempted
- Simple code paths

---

## Success Metrics

### Week 1 End Goals

- [ ] Boot time: < 3 seconds (measure baseline first)
- [ ] Platform code: < 400 lines (from ~1,500)
- [ ] No CDN calls on startup
- [ ] All features working in desktop mode
- [ ] No browser console warnings

---

## Next Steps

### Day 3-4 (Next)
1. Create `lib/platform/desktop.ts`
2. Update `lib/platform/index.ts` to use desktop
3. Comment out browser paths (don't delete!)
4. Test build and basic functionality

### Day 5
1. Update webpack config (remove browser-only deps)
2. Optimize Electron build
3. Measure performance improvements
4. Document changes

---

**Audit Complete** ✅
**Ready for**: Week 1 Day 3-4 Implementation
**Estimated Time**: 2 days (4-6 hours coding)
**Complexity**: Medium (careful refactoring required)
