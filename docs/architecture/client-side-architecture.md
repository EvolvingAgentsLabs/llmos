# Full Client-Side Architecture

## Philosophy

> **"The browser IS the operating system. No backend required."**

LLMos should run entirely in the browser, scaling infinitely without server costs or data transmission concerns.

---

## Current Backend vs Client-Side Replacement

### 1. Skills Manager

**Current (Python Backend):**
```python
# core/skills.py
class SkillsManager:
    def load_skills_for_user(self, user_id, team_id):
        # Loads from Vercel Blob via backend
        ...
```

**Client-Side Replacement (TypeScript):**
```typescript
// lib/skills/client-skills-manager.ts

class ClientSkillsManager {
  private storage: BrowserStorage;  // IndexedDB or Vercel Blob client SDK

  async loadSkills(scope: 'system' | 'user' | 'project'): Promise<Skill[]> {
    // Load markdown files directly from browser storage
    const files = await this.storage.glob(`${scope}/skills/*.md`);
    return Promise.all(files.map(f => this.parseSkill(f)));
  }

  async filterByKeywords(query: string): Promise<Skill[]> {
    const skills = await this.loadSkills('all');
    // Client-side keyword matching
    return skills.filter(s =>
      s.keywords.some(k => query.toLowerCase().includes(k))
    );
  }

  async createSkill(skill: Skill): Promise<void> {
    const content = this.formatAsMarkdown(skill);
    await this.storage.write(`user/skills/${skill.id}.md`, content);
  }

  private parseSkill(path: string): Skill {
    const content = await this.storage.read(path);
    const { frontmatter, body } = parseMarkdown(content);
    return { ...frontmatter, content: body, path };
  }
}
```

**Storage Options:**
- `IndexedDB` - Works offline, no network
- `Vercel Blob Client SDK` - Direct browser access with SAS tokens
- `OPFS (Origin Private File System)` - Native browser filesystem API

---

### 2. Evolution Cron

**Current (Python Backend):**
```python
# core/evolution.py
class EvolutionCron:
    async def run_user_evolution(self, user_id, team_id):
        # Server-side pattern detection
        traces = load_traces()
        patterns = self.pattern_detector.analyze_traces(traces)
        skills = await self.skill_generator.generate(patterns)
        ...
```

**Client-Side Replacement (TypeScript):**
```typescript
// lib/evolution/client-evolution.ts

class ClientEvolution {
  private storage: BrowserStorage;
  private llm: LLMClient;  // Direct API calls from browser

  async runEvolution(): Promise<EvolutionResult> {
    // 1. Load traces from browser storage
    const traces = await this.loadTraces();

    // 2. Client-side pattern detection (pure JavaScript)
    const patterns = this.detectPatterns(traces);

    // 3. Generate skills using LLM (direct browser → API)
    const skills = await this.generateSkills(patterns);

    // 4. Save to browser storage
    for (const skill of skills) {
      await this.storage.write(`user/skills/${skill.id}.md`, skill.content);
    }

    return { patternsFound: patterns.length, skillsCreated: skills.length };
  }

  private detectPatterns(traces: Trace[]): Pattern[] {
    // Pure JavaScript pattern detection
    const goalGroups = new Map<string, Trace[]>();

    for (const trace of traces) {
      const signature = this.computeSignature(trace.goal);
      if (!goalGroups.has(signature)) {
        goalGroups.set(signature, []);
      }
      goalGroups.get(signature)!.push(trace);
    }

    return Array.from(goalGroups.entries())
      .filter(([_, traces]) => traces.length >= 3)
      .map(([sig, traces]) => ({
        signature: sig,
        count: traces.length,
        successRate: this.calculateSuccessRate(traces),
        example: traces[0]
      }));
  }

  private async generateSkills(patterns: Pattern[]): Promise<Skill[]> {
    // Direct LLM call from browser
    const response = await this.llm.complete({
      system: "Generate skills from patterns...",
      user: JSON.stringify(patterns)
    });
    return this.parseSkillsFromResponse(response);
  }
}
```

**Key Insight:** Pattern detection is just text analysis - no server needed!

---

### 3. Workflow Engine

**Current (Python Backend):**
```python
# core/workflow.py
class WorkflowEngine:
    async def execute_skill(self, skill, inputs):
        # Server execution
        ...
```

**Client-Side Replacement (Already Exists!):**
```typescript
// lib/runtime/pyodide-runtime.ts - ALREADY CLIENT-SIDE!

class PyodideRuntime {
  private pyodide: PyodideInterface;

  async execute(code: string): Promise<ExecutionResult> {
    // Runs Python in browser via WebAssembly
    await this.pyodide.runPythonAsync(code);
    // No server involved!
  }
}
```

The Workflow Engine can be entirely client-side because Pyodide already runs Python in the browser!

---

## Full Client-Side Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    React UI (Next.js)                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                TypeScript Core                             │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │  │
│  │  │ Skills       │  │ Evolution    │  │ Workflow         │ │  │
│  │  │ Manager      │  │ Engine       │  │ Engine           │ │  │
│  │  │ (TS)         │  │ (TS)         │  │ (TS + Pyodide)   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │              Browser Storage Layer                         │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │  │
│  │  │ IndexedDB    │  │ OPFS         │  │ Vercel Blob      │ │  │
│  │  │ (offline)    │  │ (filesystem) │  │ (sync/backup)    │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │              Execution Runtimes (All WASM)                 │  │
│  │                                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │  │
│  │  │ Pyodide      │  │ JavaScript   │  │ MicroQiskit      │ │  │
│  │  │ (Python)     │  │ (Native)     │  │ (Quantum)        │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Direct API calls (no backend proxy)
                              ▼
                    ┌─────────────────┐
                    │   LLM APIs      │
                    │ (Claude/OpenAI) │
                    └─────────────────┘
```

---

## What Gets Eliminated

| Component | Lines of Python | Replacement |
|-----------|-----------------|-------------|
| `core/skills.py` | ~150 | TypeScript ClientSkillsManager |
| `core/evolution.py` | ~300 | TypeScript ClientEvolution |
| `core/workflow.py` | ~400 | Already have Pyodide runtime |
| `core/volumes.py` | ~200 | Browser storage abstraction |
| `api/main.py` | ~500 | Eliminated entirely |
| `api/chat.py` | ~100 | Direct LLM calls from browser |

**Total: ~1,650 lines of Python → 0**

---

## Storage Strategy

### Option 1: IndexedDB (Fully Offline)
```typescript
// Works completely offline
const storage = new IndexedDBStorage('llmos');
await storage.write('skills/my-skill.md', content);
const files = await storage.glob('skills/*.md');
```

### Option 2: OPFS (Native Filesystem)
```typescript
// Browser's native filesystem API
const root = await navigator.storage.getDirectory();
const skillsDir = await root.getDirectoryHandle('skills', { create: true });
const file = await skillsDir.getFileHandle('my-skill.md', { create: true });
```

### Option 3: Vercel Blob (Sync/Backup)
```typescript
// Direct client access with SAS tokens
import { put, list } from '@vercel/blob/client';

// Upload directly from browser
const blob = await put('skills/my-skill.md', content, {
  access: 'public',
  token: sasToken  // Generated per-session
});
```

### Hybrid Approach (Recommended)
```typescript
class HybridStorage {
  private local: IndexedDBStorage;
  private remote: VercelBlobClient;

  async write(path: string, content: string) {
    // Write locally first (instant)
    await this.local.write(path, content);

    // Background sync to cloud (eventual consistency)
    this.syncQueue.push({ path, content });
  }

  async read(path: string): Promise<string> {
    // Try local first
    const local = await this.local.read(path);
    if (local) return local;

    // Fallback to remote
    return this.remote.read(path);
  }
}
```

---

## LLM Calls: Direct from Browser

**Current (via backend):**
```
Browser → FastAPI → Anthropic API → FastAPI → Browser
```

**Client-Side:**
```
Browser → Anthropic API → Browser
```

```typescript
// lib/llm/browser-client.ts

class BrowserLLMClient {
  private apiKey: string;  // Stored in secure browser storage

  async complete(request: CompletionRequest): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: request.messages,
        max_tokens: request.maxTokens
      })
    });

    return response.json();
  }
}
```

**Security Note:** API key stored in browser requires:
- User provides their own key (no shared key)
- Stored in secure storage (not localStorage)
- Rate limiting on API side

---

## Migration Path

### Phase 1: Create TypeScript Equivalents
```
core/skills.py     → lib/skills/client-skills-manager.ts
core/evolution.py  → lib/evolution/client-evolution.ts
core/volumes.py    → lib/storage/browser-storage.ts
```

### Phase 2: Add Storage Abstraction
```typescript
// lib/storage/index.ts
export interface Storage {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  glob(pattern: string): Promise<string[]>;
  delete(path: string): Promise<void>;
}

export class IndexedDBStorage implements Storage { ... }
export class OPFSStorage implements Storage { ... }
export class VercelBlobStorage implements Storage { ... }
export class HybridStorage implements Storage { ... }
```

### Phase 3: Direct LLM Integration
```typescript
// lib/llm/index.ts
export class DirectLLMClient {
  // Browser → Anthropic/OpenAI directly
  // No backend proxy needed
}
```

### Phase 4: Remove Python Backend
```
DELETE: api/main.py
DELETE: api/chat.py
DELETE: core/*.py
DELETE: requirements.txt
```

---

## Benefits

| Aspect | With Backend | Full Client-Side |
|--------|--------------|------------------|
| **Latency** | +100-500ms | Near-zero |
| **Scaling** | Server limits | Infinite (CDN) |
| **Cost** | Server + DB | CDN only |
| **Privacy** | Data transmitted | Data stays local |
| **Offline** | No | Yes |
| **Deployment** | Complex | Static files |

---

## Conclusion

**The Python backend is NOT required.** Every component can run client-side:

1. **Skills Manager** → TypeScript + Browser storage
2. **Evolution Cron** → TypeScript pattern detection + LLM
3. **Workflow Engine** → Already uses Pyodide (WASM)
4. **Volumes/Storage** → IndexedDB + OPFS + Vercel Blob client
5. **LLM Calls** → Direct browser → API

The result: A fully static, infinitely scalable LLM OS that runs entirely in the browser.
