# LLMos-Lite Architecture

> Technical Deep-Dive: From Terminal OS to Self-Improving AI Workbench

## Table of Contents
1. [Philosophy & Design](#philosophy--design)
2. [System Architecture](#system-architecture)
3. [GitHub Integration](#github-integration)
4. [Evolution Engine](#evolution-engine)
5. [Data Flow & Workflows](#data-flow--workflows)
6. [Frontend Architecture](#frontend-architecture)
7. [Security Model](#security-model)
8. [Scalability & Performance](#scalability--performance)

---

## Philosophy & Design

### Core Principles

1. **Commits as Context Memory**
   - Traditional Git: Human-readable history
   - LLMos-Lite: AI-analyzable training data
   - Commit messages embed prompts, artifacts, traces

2. **Self-Improving System**
   - Users create sessions → Commits
   - Crons analyze commits → Detect patterns
   - Patterns → Auto-generated skills
   - Skills → Better workflows

3. **Zero-Cost Execution**
   - WebAssembly in browser (Pyodide, Three.js)
   - No server compute costs
   - Scales infinitely (P2P model)

4. **Collaboration-First**
   - Multi-volume hierarchy (System/Team/User)
   - Git-native collaboration (commits, branches, PRs)
   - Skills promotion workflow

---

## System Architecture

### Four-Layer Stack

```mermaid
graph TB
    subgraph Layer1["LAYER 1: PRESENTATION (Browser/React)"]
        A1[Chat Interface<br/>+ Artifacts]
        A2[Workflow Canvas<br/>React Flow]
    end

    subgraph Services["Client Services"]
        B1[LLM Client<br/>lib/llm-client]
        B2[GitHub Service<br/>lib/git-service]
    end

    subgraph Layer2["LAYER 2: INTERFACE (APIs)"]
        C1[Anthropic<br/>Claude API]
        C2[GitHub REST API<br/>v3]
    end

    subgraph Layer3["LAYER 3: LOGIC (State Management)"]
        D1[SessionContext<br/>React Context]
        D2[CronAnalyzer<br/>Pattern Detect]
    end

    subgraph Layer4["LAYER 4: STORAGE (Git/Local)"]
        E1[localStorage<br/>sessions]
        E2[GitHub Repos<br/>volumes]
    end

    A1 --> B1
    A2 --> B1
    A1 --> B2
    A2 --> B2

    B1 --> C1
    B2 --> C2

    B1 --> D1
    B1 --> D2
    B2 --> D1
    B2 --> D2

    D1 --> E1
    D2 --> E2
    B2 --> E2

    style Layer1 fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style Services fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style Layer2 fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style Layer3 fill:#0a0e14,stroke:#a78bfa,color:#a78bfa
    style Layer4 fill:#0a0e14,stroke:#ff6b6b,color:#ff6b6b
```

### Key Components

#### 1. Frontend (Next.js 14 + React 18)
- **App Router** (`app/`)
  - `page.tsx` - Main entry, setup flow
  - `layout.tsx` - Root layout
  - `api/auth/github/callback/route.ts` - OAuth server-side handler

- **Components** (`components/`)
  - `onboarding/FirstTimeGuide.tsx` - Wizard with sample prompts
  - `chat/ChatPanel.tsx` - Main chat interface
  - `context/ContextPanel.tsx` - GitHub + actions sidebar
  - `panel1-volumes/CronList.tsx` - Cron countdown timers
  - `settings/GitHubConnect.tsx` - OAuth UI
  - `panel3-artifacts/` - Renderers (quantum, 3D, plots)

- **Libraries** (`lib/`)
  - `llm-client.ts` - Anthropic/OpenRouter client
  - `github-auth.ts` - OAuth flow
  - `git-service.ts` - GitHub API wrapper
  - `cron-analyzer.ts` - Pattern detection engine
  - `user-storage.ts` - Local storage utils

- **Contexts** (`contexts/`)
  - `SessionContext.tsx` - Session state (messages, artifacts, traces)

#### 2. Backend (Optional FastAPI)
- **Core** (`core/`)
  - `volumes.py` - Git-backed storage
  - `skills.py` - Skill loader/filter
  - `evolution.py` - Pattern detection (server-side)

- **API** (`api/`)
  - `main.py` - FastAPI endpoints
  - Currently optional (UI is standalone)

---

## GitHub Integration

### OAuth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend<br/>(GitHubAuth)
    participant G as GitHub
    participant B as Backend<br/>(Next.js API)

    U->>F: 1. Click "Connect with GitHub"
    F->>F: 2. startOAuthFlow()
    F->>G: 3. Open popup<br/>github.com/login/oauth/authorize
    G->>U: 4. Show authorization page
    U->>G: 5. Approve access
    G->>B: 6. Redirect with code<br/>localhost:3000/api/auth/github/callback?code=...
    B->>G: 7. Exchange code for access_token
    G->>B: 8. Return access_token
    B->>G: 9. Fetch user profile
    G->>B: 10. Return user data
    B->>F: 11. postMessage({type: 'github_auth_success', user})
    F->>F: 12. Save user to localStorage
    F->>U: 13. GitHub connected!

    Note over F,B: Client secret never exposed to browser
    Note over F: Token stored in localStorage
```

**Files:**
- `lib/github-auth.ts` - OAuth client-side logic
- `app/api/auth/github/callback/route.ts` - Server-side token exchange
- `components/settings/GitHubConnect.tsx` - UI component

### Repository Structure

Each user gets three volumes, mapped to GitHub repos:

| Volume | Repo Name | Access | Purpose |
|--------|-----------|--------|---------|
| User | `llmunix-user-{username}` | Private | Personal sessions, skills |
| Team | `llmunix-team-volumes` | Shared | Team collaboration |
| System | `llmunix/system-volumes` | Read-only | Global templates |

**Auto-Creation:**
- Repos created on first commit via `GitService.ensureRepository()`
- Uses GitHub REST API: `POST /user/repos`
- Private by default

### Commit Format

**The Innovation:** Commits are dual-purpose (human + machine readable)

```
session: Quantum VQE Optimization

Prompt: Create a VQE circuit for H2 molecule with ansatz and optimizer.

Stats:
- 12 messages
- 3 artifacts generated
- 8 traces executed

Artifacts:
- quantum-circuit: bell_state_circuit
- code: vqe_h2_circuit.py
- skill: quantum-optimization.md

🤖 LLMunix Context Memory
```

**Why This Matters:**
1. **Pattern Detection**: LLM can extract prompts from commits
2. **Skill Generation**: Recurring patterns → Auto-generate skills
3. **Collaboration**: Team sees what you're working on
4. **Audit Trail**: Full history of work

### Git Operations (Client-Side)

All Git operations happen via GitHub REST API (no git CLI needed):

```typescript
// lib/git-service.ts

// Commit session
await GitService.commitSession(volume, {
  id: sessionId,
  name: sessionName,
  messages: messages,
  artifacts: artifacts,
  traces: traces
});

// Fetch history for analysis
const commits = await GitService.fetchCommitHistory(volume, {
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
});

// Pull latest sessions
const sessions = await GitService.pullLatestSessions(volume);
```

**GitHub API Endpoints Used:**
- `GET /repos/{owner}/{repo}` - Check if repo exists
- `POST /user/repos` - Create private repo
- `GET /repos/{owner}/{repo}/contents/{path}` - Read files
- `PUT /repos/{owner}/{repo}/contents/{path}` - Create/update files
- `GET /repos/{owner}/{repo}/commits` - Fetch commit history

---

## Evolution Engine

### Cron Analysis Pipeline

```mermaid
flowchart TD
    A[1. FETCH COMMITS] --> |GitService.fetchCommitHistory<br/>volume, since| B[2. PARSE COMMIT MESSAGES]
    B --> |Extract: prompts,<br/>artifacts, traces<br/>CronAnalyzer.extractContext| C[3. DETECT PATTERNS]
    C --> |Send prompts to Claude<br/>CronAnalyzer.detectPatterns<br/>Returns: patterns + confidence| D[4. FILTER HIGH-CONFIDENCE]
    D --> |Keep patterns with:<br/>occurrences ≥ 2<br/>confidence ≥ 0.85| E[5. GENERATE SKILLS]
    E --> |For each pattern:<br/>Create reusable skill<br/>CronAnalyzer.generateSkills| F[6. COMMIT SKILLS TO REPO]
    F --> |Future: auto-commit<br/>generated skills| G[✓ Complete]

    style A fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style C fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style E fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style G fill:#0a0e14,stroke:#00ff88,color:#00ff88
```

### Pattern Detection Algorithm

**Input**: Array of commit contexts
```typescript
{
  sha: string;
  prompt: string;
  artifacts: string[];
  traces: number[];
}[]
```

**Process**:
1. Format prompts as numbered list
2. Send to LLM with analysis prompt:
   ```
   Analyze these N prompts and identify recurring patterns.
   For each pattern:
   - Name (3-5 words)
   - Description (1 sentence)
   - Which prompt numbers (indices)
   - Confidence score (0-1)

   Focus on: similar domains, workflows, artifact types
   Return JSON: {patterns: [...]}
   ```
3. Parse JSON response
4. Map prompt indices back to commits
5. Calculate occurrences, group artifacts/traces

**Output**: Array of patterns
```typescript
{
  name: string;
  description: string;
  occurrences: number;
  confidence: number;
  commitShas: string[];
  prompts: string[];
  artifacts: string[];
}[]
```

### Skill Generation

**For each high-confidence pattern (>85%)**:

1. Create skill prompt:
   ```
   Create a reusable skill document for: {pattern.name}

   Description: {pattern.description}

   Example prompts:
   1. {prompt1}
   2. {prompt2}
   ...

   Artifacts produced: {artifacts}

   Create a skill document with:
   1. Title
   2. Purpose
   3. Input parameters
   4. Step-by-step workflow
   5. Example code/template
   6. Common variations

   Format as Markdown with YAML frontmatter.
   ```

2. Send to LLM
3. Parse Markdown response
4. Save as `{skill-name}.md`
5. (Future) Commit to user volume

---

## Data Flow & Workflows

### Session Lifecycle

```mermaid
flowchart TD
    A[1. USER STARTS CHAT] --> |Onboarding complete<br/>Click 'Try Now' or<br/>Type manually| B[2. AUTO-CREATE SESSION]
    B --> |SessionContext.addSession<br/>name, status: 'uncommitted'<br/>volume| C[3. CHAT LOOP]
    C --> |For each message:<br/>• Add to session<br/>• Send to LLM with skills<br/>• Get response<br/>• Update artifacts/traces| C
    C --> |User clicks<br/>'Commit Session'| D{GitHub<br/>Connected?}
    D -->|Yes| E[GitService.commitSession<br/>Real GitHub commit]
    D -->|No| F[Local commit<br/>Generate hash]
    E --> G[5. UPDATE SESSION STATUS]
    F --> G
    G --> |session.status = 'committed'<br/>session.commitHash = hash<br/>UI shows commit hash| H[✓ Session Committed]

    style A fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style C fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style D fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style H fill:#0a0e14,stroke:#00ff88,color:#00ff88
```

### Cron Execution Flow

```mermaid
flowchart TD
    A[TRIGGER] --> |Manual 'Run Now' or<br/>Auto 24h timer| B{Authenticated?}
    B -->|No| C[Show error<br/>Exit]
    B -->|Yes| D[2. DETERMINE VOLUME]
    D --> |Cron ID → Volume mapping:<br/>• evolution-user → user<br/>• evolution-team → team<br/>• evolution-system → system| E[3. RUN ANALYZER]
    E --> |CronAnalyzer.analyzeVolume<br/>minOccurrences: 2<br/>minConfidence: 0.7| F[4. DISPLAY RESULTS]
    F --> |Alert with:<br/>• Patterns detected: N<br/>• Skills generated: M<br/>• Commits analyzed: X<br/>• Pattern details| G[✓ Complete]

    style A fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style B fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style C fill:#0a0e14,stroke:#ff6b6b,color:#ff6b6b
    style E fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style G fill:#0a0e14,stroke:#00ff88,color:#00ff88
```

### Collaboration Workflow

```mermaid
flowchart TD
    A1[ALICE: Developer] --> A2[Creates 5 quantum<br/>circuit sessions]
    A2 --> A3[Commits all to<br/>user volume]
    A3 --> A4[Runs user cron]
    A4 --> A5[Pattern detected:<br/>Quantum Circuit Design<br/>5x, 92% confidence]
    A5 --> A6[Skill generated:<br/>quantum-circuit-design.md]
    A6 --> T1[TEAM VOLUME]

    T1[Team Volume<br/>Shared Repo] --> T2[Skill:<br/>quantum-circuit-design.md<br/>from Alice]

    T2 --> B1[BOB: Developer]
    B1 --> B2[Pulls latest from<br/>team volume]
    B2 --> B3[Sees Alice's<br/>quantum skill]
    B3 --> B4[Uses skill in<br/>his workflows]
    B4 --> B5[Creates 3 more<br/>quantum sessions]
    B5 --> B6[Commits to<br/>team volume]

    B6 --> C1[TEAM CRON]
    C1 --> C2[Analyzes team volume<br/>Weekly trigger]
    C2 --> C3[Detects cross-user<br/>pattern: Alice + Bob]
    C3 --> C4[Strengthens confidence<br/>98%]
    C4 --> C5[Updates skill with<br/>more examples]

    C5 --> S1[SYSTEM ADMIN]
    S1 --> S2[Reviews highly-used<br/>team skills]
    S2 --> S3[Promotes to<br/>system volume]

    S3 --> U1[ALL USERS]
    U1 --> U2[Benefit from<br/>evolved system skill]

    style A1 fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style T1 fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style B1 fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style C1 fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style S1 fill:#0a0e14,stroke:#a78bfa,color:#a78bfa
    style U1 fill:#0a0e14,stroke:#00ff88,color:#00ff88
```

---

## Frontend Architecture

### Component Hierarchy

```mermaid
graph TD
    A[App<br/>page.tsx] --> B{Configured?}
    B -->|No| C[APIKeySetup]
    B -->|Yes| D[TerminalLayoutNew<br/>main app]

    C --> C1[User/Team info form]
    C --> C2[FirstTimeGuide<br/>onboarding wizard]
    C2 --> C3[Sample prompts<br/>with 'Try Now']

    D --> D1[Header]
    D --> D2[SidebarPanel<br/>left]
    D --> D3[ChatPanel<br/>center]
    D --> D4[ContextPanel<br/>right]

    D1 --> D1a[Logo]
    D1 --> D1b[Settings button]

    D2 --> D2a[VolumeTree<br/>System/Team/User]
    D2 --> D2b[SessionList]
    D2 --> D2c[CronList]
    D2 --> D2d[ActivitySection]

    D2b --> D2b1[Session cards<br/>status, messages, time]

    D2c --> D2c1[Cron cards]
    D2c1 --> D2c1a[Countdown timer<br/>live]
    D2c1 --> D2c1b[Progress bar<br/>animated]
    D2c1 --> D2c1c['Run Now' button]

    D3 --> D3a[Session header]
    D3 --> D3b[Message list]
    D3 --> D3c[Input + Send button]

    D3b --> D3b1[User messages]
    D3b --> D3b2[Assistant messages]
    D3b2 --> D3b2a[Artifact previews]

    D4 --> D4a[Session info]
    D4 --> D4b[Artifacts list]
    D4 --> D4c[GitHub section]
    D4 --> D4d[Actions section]

    D4a --> D4a1[Status<br/>committed/uncommitted]
    D4a --> D4a2[Message count]
    D4a --> D4a3[Trace count]

    D4b --> D4b1[Artifact cards<br/>type, name]

    D4c --> D4c1[GitHubConnect widget]
    D4c1 --> D4c1a{Connected?}
    D4c1a -->|Yes| D4c1b[Avatar + name]
    D4c1a -->|No| D4c1c['Connect' button]

    D4d --> D4d1['Commit Session']
    D4d --> D4d2['Share Session']
    D4d --> D4d3['Export Chat']

    style A fill:#0a0e14,stroke:#00ff88,color:#00ff88
    style D fill:#0a0e14,stroke:#00d4ff,color:#00d4ff
    style D2 fill:#0a0e14,stroke:#ffcc00,color:#ffcc00
    style D3 fill:#0a0e14,stroke:#a78bfa,color:#a78bfa
    style D4 fill:#0a0e14,stroke:#ff6b6b,color:#ff6b6b
```

### State Management

**React Context (`SessionContext`)**:
```typescript
{
  sessions: Session[];              // All sessions
  activeSessions: {                 // Grouped by volume
    user: Session[];
    team: Session[];
    system: Session[];
  };
  cronJobs: CronJob[];              // Cron jobs list
  activeSession: string | null;     // Selected session ID

  // Methods
  addSession: (data) => Session;
  updateSession: (id, updates) => void;
  deleteSession: (id) => void;
  addMessage: (sessionId, message) => void;
  updateCronJob: (id, updates) => void;
}
```

**Local Storage**:
- `llmos_sessions` - All sessions (persisted)
- `llmos_cron_jobs` - Cron state (persisted)
- `llmos_active_session` - Selected session (persisted)
- `llmos_github_user` - GitHub user profile (persisted)
- `llmos_user` - User info from onboarding (persisted)
- `llmos_team` - Team info from onboarding (persisted)
- `llmos_llm_config` - LLM API key + model (persisted)

### Real-Time Updates

**Countdown Timers**:
```typescript
// components/panel1-volumes/CronList.tsx

const [countdowns, setCountdowns] = useState<Record<cronId, seconds>>({});

useEffect(() => {
  const interval = setInterval(() => {
    setCountdowns(prev => {
      const next = {...prev};
      crons.forEach(cron => {
        if (next[cron.id] > 0) {
          next[cron.id] = Math.max(0, next[cron.id] - 1);
        }
      });
      return next;
    });
  }, 1000); // Tick every second

  return () => clearInterval(interval);
}, []);
```

**Progress Bar Animation**:
```tsx
<div className="h-1 bg-terminal-bg-tertiary rounded-full">
  <div
    className="h-full bg-terminal-accent-green transition-all duration-1000 ease-linear"
    style={{ width: `${progress}%` }}
  />
</div>
```
- Smooth 1-second transitions via CSS
- Progress = `(total - remaining) / total * 100`

---

## Security Model

### Authentication

**GitHub OAuth**:
- Client secret stored server-side (Next.js env vars)
- Never exposed to browser
- Token exchange happens in API route
- Access token returned to client via postMessage
- Token stored in localStorage (client-side only)

**LLM API Key**:
- Stored in localStorage
- Direct API calls from browser to Anthropic/OpenRouter
- User-owned key, user pays
- No proxy server needed

### Authorization

**Volume Access Control** (Future):
| Volume | User | Team Admin | System Admin |
|--------|------|------------|--------------|
| User | R/W | R | R |
| Team | R | R/W | R/W |
| System | R | R | R/W |

Currently: All operations client-side, enforced by GitHub repo permissions

### Data Security

**Sensitive Data**:
- API keys: localStorage (not encrypted)
- GitHub tokens: localStorage (not encrypted)
- Session data: localStorage + GitHub (private repos)

**Production Recommendations**:
- Use httpOnly cookies for tokens
- Encrypt localStorage data
- Implement server-side session management
- Use GitHub Apps instead of OAuth

### Execution Safety

**WebAssembly Sandbox**:
- Python/JS code runs in browser (Pyodide)
- No access to file system
- No network access (except via MCP)
- Resource limits (memory, CPU)

---

## Scalability & Performance

### Frontend Performance

**Optimizations**:
- Next.js dynamic imports (code splitting)
- React.memo for expensive components
- Virtualized lists for long sessions
- Lazy loading of artifacts
- Debounced search/filter

**Bundle Size**:
- Main: ~500KB (Next.js + React)
- Pyodide: ~6MB (loaded on demand)
- Total: ~6.5MB (cached after first load)

### GitHub API Rate Limits

**Limits**:
- Authenticated: 5000 requests/hour
- Unauthenticated: 60 requests/hour

**Mitigation**:
- Cache commit history locally
- Batch operations
- Use conditional requests (ETags)
- Implement exponential backoff

**Typical Usage**:
- Commit session: 2 requests (check + create)
- Fetch history: 1 request
- Cron analysis: 3-5 requests (fetch commits + files)
- Total: ~10 requests/session → 500 sessions/hour max

### Storage Limits

**Browser Storage**:
- localStorage: ~10MB
- IndexedDB: ~50MB+ (future)

**GitHub**:
- File size: 100MB
- Repo size: No hard limit (soft limit ~1GB)

**Session Data**:
- Average session: ~50KB
- 100 sessions: ~5MB
- Fits comfortably in localStorage

### Future Scalability

**Backend Migration**:
- Add FastAPI backend for heavy operations
- Server-side cron scheduling
- Database for session metadata
- Redis for caching

**Distributed Architecture**:
- CDN for static assets
- WebSockets for real-time collaboration
- Message queue for async jobs
- Vector DB for semantic search

---

## Migration from Original LLMos

### What Changed

| Aspect | Original llmos | llmos-lite |
|--------|---------------|------------|
| **Storage** | File-based | Git-backed + localStorage |
| **Execution** | Server (Python) | Browser (WebAssembly) |
| **Interface** | Terminal CLI | Web UI (React) |
| **Capabilities** | Python tools | Markdown skills + artifacts |
| **Evolution** | Complex (sentience/valence) | Simple (pattern detection) |
| **Collaboration** | File system | GitHub (commits/PRs) |
| **Cost** | Server compute | Free (client-side) |

### Migration Strategy

**For existing llmos users**:
1. Export traces from `/workspace/memories/traces/`
2. Convert to session JSON format
3. Commit to llmos-lite user volume
4. Cron will analyze and generate skills

---

## Appendix

### File Locations Reference

**GitHub Integration**:
- `lib/github-auth.ts` - OAuth client
- `lib/git-service.ts` - GitHub API wrapper
- `lib/cron-analyzer.ts` - Pattern detection
- `app/api/auth/github/callback/route.ts` - OAuth callback
- `components/settings/GitHubConnect.tsx` - UI widget

**UI Components**:
- `components/onboarding/FirstTimeGuide.tsx` - Sample prompts
- `components/context/ContextPanel.tsx` - GitHub + actions
- `components/panel1-volumes/CronList.tsx` - Countdown timers
- `components/chat/ChatPanel.tsx` - Main chat
- `components/panel3-artifacts/` - Artifact renderers

**Configuration**:
- `ui/.env.local.example` - Environment template
- `ui/tailwind.config.js` - Terminal theme
- `ui/styles/globals.css` - CSS variables

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_client_id
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000

# Optional
LLMOS_VOLUMES_PATH=./volumes
```

### API Endpoints (Future)

```
GET  /api/sessions              # List sessions
POST /api/sessions              # Create session
GET  /api/sessions/:id          # Get session
PUT  /api/sessions/:id          # Update session
DEL  /api/sessions/:id          # Delete session

POST /api/sessions/:id/commit   # Commit to GitHub

GET  /api/crons                 # List cron jobs
POST /api/crons/:id/run         # Trigger cron

GET  /api/skills                # List skills
POST /api/skills                # Create skill
GET  /api/skills/:id            # Get skill
```

---

**End of Architecture Document**

For user-facing documentation, see README.md.
For setup instructions, see the Quick Start section in README.md.
