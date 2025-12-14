# LLMunix: WebAssembly-Powered Computational Workbench

> **llmos-lite** - Transform from Terminal OS to Browser-Native Computational Platform

[![Version](https://img.shields.io/badge/version-1.0.0--lite-blue.svg)](https://github.com/EvolvingAgentsLabs/llmunix/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-yellow.svg)](https://python.org)

---

## 🚀 What is LLMunix?

**LLMunix** is a browser-native computational workbench where:

1. **Skills are Markdown files** - Version-controlled capabilities that LLMs can use
2. **Workflows are visual DAGs** - Drag-and-drop computational graphs using React Flow
3. **Execution is browser-native** - WebAssembly (Pyodide, Three.js, SPICE)
4. **Storage is production-ready** - Vercel Blob + Redis for persistence
5. **Everything is Git-backed** - Version control for skills, workflows, traces

### Key Features

- ⚡ **Zero-latency execution** - Skills run instantly in browser via WebAssembly
- 🎨 **Rich interactive previews** - 3D animations, quantum states, circuit diagrams
- 🔒 **Sandboxed safety** - Generated code runs in browser, not on servers
- 💰 **Zero server costs** - Execution happens on user devices
- 📦 **Production storage** - Redis for sessions, Blob for skills/files
- 📝 **Git-backed everything** - Version control for all artifacts

---

## Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/EvolvingAgentsLabs/llmunix.git
cd llmunix

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies (for UI)
cd llmos-lite/ui
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
# Required: Anthropic API key for LLM chat
ANTHROPIC_API_KEY=sk-ant-api03-xxx...

# Optional: Vercel Blob storage (for skills/files)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx...

# Optional: Redis storage (for sessions/messages)
REDIS_URL=redis://default:password@host:port
```

**Note:** `.env` is gitignored and will never be committed.

### 3. Run the API

```bash
# Start FastAPI backend
cd llmos-lite
python api/main.py

# Server starts at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 4. Run the UI (Development)

```bash
# Start Next.js frontend
cd llmos-lite/ui
npm run dev

# Open http://localhost:3000
```

### 5. Test the API

```bash
# Chat with skills
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "team_id": "engineering",
    "message": "Write a Python function to calculate Fibonacci numbers",
    "include_skills": true
  }'

# List sessions
curl "http://localhost:8000/api/sessions?volume=user"

# Create a session
curl -X POST "http://localhost:8000/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Research Session",
    "volume": "user",
    "initial_message": "Hello!"
  }'
```

---

## Storage Setup

### Local Development (Mock Data)

By default, the app works with mock data (no storage required). Perfect for testing!

### Production Storage (Vercel)

For production deployments, set up Vercel storage:

#### Option 1: Vercel Blob (Skills & Files)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project → **Storage** tab
3. Click **Create Database** → Select **Blob**
4. Name it: `llmos-files`
5. Copy the `BLOB_READ_WRITE_TOKEN`
6. Add to `.env` and Vercel environment variables

#### Option 2: Redis/Vercel KV (Sessions & Messages)

1. In Vercel dashboard → **Storage** tab
2. Click **Create Database** → Select **Redis** (or KV if available)
3. Copy the connection details:
   - If Redis: `REDIS_URL`
   - If KV: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
4. Add to `.env` and Vercel environment variables

#### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Your app is live! 🎉
```

### Test Storage Connection

```bash
# Test Redis connection
python test_redis.py

# Expected output:
# ✅ Test 1: Set/Get key-value - PASSED
# ✅ Test 2: JSON object storage - PASSED
# ✅ Test 3: Set operations - PASSED
# ✅ Test 4: List operations - PASSED
```

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────┐
│          PRESENTATION LAYER (Browser)                    │
│  ┌──────────────┐  ┌────────────────┐                   │
│  │ React Flow   │  │ Chat Interface │                   │
│  │ Canvas       │  │ (Skill Context)│                   │
│  └──────┬───────┘  └────────┬───────┘                   │
└─────────┼──────────────────────┼────────────────────────┘
          │                      │
┌─────────▼─────────┐  ┌────────▼────────┐
│ Workflow Executor │  │ Skills Manager  │
│ (TypeScript/Wasm) │  │ (Load/Filter)   │
└─────────┬─────────┘  └────────┬────────┘
          │                     │
┌─────────▼─────────────────────▼─────────┐
│        INTERFACE LAYER (API)            │
│  - FastAPI endpoints                    │
│  - /api/sessions (persistence)          │
│  - /api/skills (storage)                │
│  - /chat (LLM + context)                │
└─────────┬───────────────────────────────┘
          │
┌─────────▼─────────────────────────────────┐
│         STORAGE LAYER                     │
│  - Redis: Sessions + Messages             │
│  - Blob: Skills + Files                   │
│  - Git: Version control (future)          │
└───────────────────────────────────────────┘
```

### Storage Architecture

**Redis (Sessions & Metadata):**
```
session:{session_id}              → Session JSON object
session:{session_id}:messages     → List of messages
{volume}:{volume_id}:sessions     → Set of session IDs per volume
all:sessions                      → Set of all session IDs
```

**Vercel Blob (Skills & Files):**
```
volumes/system/system/skills/{skill}.md → System skills
volumes/user/{user_id}/skills/{skill}.md → User skills
volumes/team/{team_id}/skills/{skill}.md → Team skills
```

For detailed technical documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Key Concepts

### 1. Skills (Markdown-Based Capabilities)

Skills are version-controlled Markdown files that define capabilities.

**Example Skill:**
```markdown
---
name: VQE Optimizer
skill_id: quantum-vqe-node
type: qiskit
category: quantum
execution_mode: browser-wasm
inputs:
  - name: hamiltonian
    type: object
  - name: iterations
    type: number
outputs:
  - name: eigenvalue
    type: number
---

# Skill: VQE Optimizer

Variational Quantum Eigensolver implementation.

\`\`\`python
def execute(inputs):
    # Runs in browser via Pyodide
    from qiskit import QuantumCircuit
    # ... VQE implementation
    return {"eigenvalue": -1.137}
\`\`\`
```

### 2. Workflows (Visual DAGs)

Workflows are drag-and-drop computational graphs built with React Flow.

**Example Workflow:**
```
[Hamiltonian] → [VQE Optimizer] → [Plot Convergence] → [Export Results]
```

Each node is a skill that executes in the browser via WebAssembly.

### 3. Sessions (Chat History)

Sessions store chat conversations with:
- Messages (user + assistant)
- Execution traces
- Artifacts (generated files)
- Volume-scoped access (user/team/system)

### 4. Volumes (Multi-Tenant Storage)

```
/volumes/
  system/         # Global skills (read-only for users)
  team/{team_id}/ # Shared team skills
  user/{user_id}/ # Private user skills
```

**Access Control:**
| Volume | User Can | Team Can | System Can |
|--------|----------|----------|------------|
| User   | R/W      | R        | R/W        |
| Team   | R        | R/W      | R/W        |
| System | R        | R        | R/W        |

---

## API Endpoints

### Sessions
- `GET /api/sessions` - List sessions (with volume filter)
- `GET /api/sessions/{id}` - Get session details
- `POST /api/sessions` - Create new session
- `POST /api/sessions/{id}/messages` - Add message
- `PUT /api/sessions/{id}` - Update session
- `DELETE /api/sessions/{id}` - Delete session

### Skills
- `GET /api/skills` - List skills (with volume filter)
- `GET /api/skills/{id}` - Get skill details
- `POST /api/skills` - Create skill
- `DELETE /api/skills/{id}` - Delete skill

### Chat
- `POST /chat` - Chat with LLM (includes skills as context)

### Workflows
- `GET /workflows/skills/executable` - List executable skills
- `POST /workflows/execute` - Prepare workflow for execution
- `POST /workflows/save` - Save workflow to storage
- `GET /workflows/categories` - List skill categories

---

## Phase 3 React UI (Current)

### Completed Features ✅

1. **React Flow Canvas** (`WorkflowCanvas.tsx`)
   - Drag-drop node positioning
   - Custom SkillNode components
   - MiniMap for navigation
   - Zoom controls + background grid
   - Run workflow button

2. **Node Library Panel** (`NodeLibraryPanel.tsx`)
   - 8 pre-loaded skills (Quantum, 3D, Electronics, Data, Code)
   - Category filtering
   - Search functionality
   - Draggable skill cards

3. **Storage Integration**
   - Redis client for sessions/messages
   - Blob client for skills/files
   - Graceful fallbacks to mock data

### In Progress 🚧

- [ ] Preview renderers (3D, plots, circuits)
- [ ] Drag-drop from library → canvas
- [ ] Workflow execution integration
- [ ] Real-time collaboration

---

## Examples

### Quantum VQE Workflow

```
[Hamiltonian Node] → [VQE Node] → [Plot Node] → [Export Node]

1. Hamiltonian Node: Defines quantum system
2. VQE Node: Runs simulation (Pyodide)
3. Plot Node: Visualizes convergence (JavaScript)
4. Export Node: Saves results (Canvas API)

Result: Instant, interactive, in-browser execution
```

### 3D Animation Workflow

```
[Model Node] → [Material Node] → [Scene Node] → [Render Node]

1. Model Node: Creates 3D geometry (Three.js)
2. Material Node: Applies textures
3. Scene Node: Positions objects
4. Render Node: WebGL rendering (60 FPS)

Result: Real-time 3D visualization in browser
```

---

## Project Structure

```
llmunix/
├── api/                          # FastAPI backend
│   ├── main.py                   # Main API server
│   ├── sessions.py               # Session endpoints
│   ├── skills.py                 # Skill endpoints
│   ├── chat.py                   # Chat endpoint
│   └── lib/                      # Storage clients
│       ├── redis_client.py       # Redis adapter
│       ├── vercel_kv.py          # Vercel KV client
│       └── vercel_blob.py        # Blob storage client
│
├── llmos-lite/                   # Next.js frontend
│   └── ui/
│       ├── components/
│       │   ├── panel3-artifacts/
│       │   │   ├── WorkflowCanvas.tsx
│       │   │   └── NodeLibraryPanel.tsx
│       │   └── ...
│       └── lib/
│           ├── workflow-executor.ts
│           └── pyodide-executor.ts
│
├── test_redis.py                 # Redis connection test
├── README.md                     # This file
├── ARCHITECTURE.md               # Technical deep dive
└── .env                          # Environment variables (gitignored)
```

---

## Roadmap

### Phase 1: Core Infrastructure ✅ (Complete)
- [x] FastAPI service
- [x] Skills loader
- [x] Git-backed volumes
- [x] Evolution engine

### Phase 2: WebAssembly Workflows ✅ (Complete)
- [x] Executable skill format
- [x] Workflow engine (DAG execution)
- [x] Pyodide integration
- [x] Multi-runtime support

### Phase 3: React UI ✅ (Complete)
- [x] React Flow canvas
- [x] Node library panel
- [x] Execution controls & progress
- [x] Storage integration (Redis + Blob)
- [x] Chat interface integration
- [ ] Preview renderers (plots, 3D, circuits)

### Phase 4: Advanced Features (Future)
- [ ] GPU acceleration (WebGPU)
- [ ] Workflow marketplace
- [ ] Collaborative editing
- [ ] Mobile PWA
- [ ] Evolution engine (auto-generate skills from patterns)

---

## Contributing

We welcome contributions!

**Priority areas:**
1. Preview renderers (Three.js, Recharts, circuit diagrams)
2. New executable skills (domains: quantum, 3D, electronics, ML)
3. Runtime integrations (WebGPU, WebR, etc.)
4. Example workflows

**Development workflow:**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `python test_redis.py`
5. Submit a pull request

---

## Security

- ✅ API keys stored in `.env` (gitignored)
- ✅ Environment variables for production secrets
- ✅ No hardcoded credentials in code
- ✅ Sandboxed execution (WebAssembly in browser)

**Production checklist:**
- [ ] Rotate API keys after initial setup
- [ ] Add authentication layer (JWT/OAuth)
- [ ] Enable CORS restrictions
- [ ] Set up rate limiting

---

## Troubleshooting

### Redis Connection Issues

```bash
# Test connection
python test_redis.py

# Common fixes:
# 1. Check REDIS_URL in .env
# 2. Verify Redis server is running
# 3. Check firewall/network settings
```

### Blob Storage Issues

```bash
# Verify token in .env
echo $BLOB_READ_WRITE_TOKEN

# Check Vercel dashboard for token
# Re-create if expired
```

### API Not Starting

```bash
# Check Python version (3.10+ required)
python --version

# Install dependencies
pip install -r requirements.txt

# Check for port conflicts
lsof -i :8000
```

---

## Migration from Original llmos

The original llmos architecture is **deprecated** but preserved in `/llmos` folder for reference.

### What Changed

| Aspect | Original llmos | llmos-lite |
|--------|----------------|------------|
| **Interface** | Terminal UI | Web UI (React Flow) |
| **Execution** | Server (Python) | Browser (WebAssembly) |
| **Storage** | In-memory | Redis + Blob |
| **Latency** | 100-500ms | <50ms |
| **Cost** | Server compute | Free (user devices) |
| **Scalability** | Limited | Unlimited (P2P) |

### Why the Change

The original llmos was **over-engineered for a web app**. llmos-lite simplifies to essentials while adding:
- Browser-native execution
- Production-ready storage
- Visual workflow editor
- Real-time collaboration (future)

---

## License

Apache 2.0

---

## Credits

Built by [Evolving Agents Labs](https://github.com/EvolvingAgentsLabs)

**Core Innovation:** Treating capabilities as **version-controlled Markdown files** that execute as **WebAssembly workflows** in the browser.

Inspired by OpenAI/Anthropic's Skills paradigm for AI capabilities.

---

<div align="center">

**[Architecture](ARCHITECTURE.md)** · **[GitHub](https://github.com/EvolvingAgentsLabs/llmunix)** · **[Issues](https://github.com/EvolvingAgentsLabs/llmunix/issues)**

</div>
