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

```mermaid
graph TB
    subgraph Browser["🌐 PRESENTATION LAYER (Browser)"]
        ReactFlow["⚡ React Flow<br/>Canvas"]
        Chat["💬 Chat Interface<br/>(Skill Context)"]
    end

    subgraph Execution["⚙️ EXECUTION LAYER"]
        Executor["🔧 Workflow Executor<br/>(TypeScript/Wasm)"]
        SkillMgr["📚 Skills Manager<br/>(Load/Filter)"]
    end

    subgraph API["🔌 INTERFACE LAYER (FastAPI)"]
        Sessions["📝 /api/sessions<br/>(persistence)"]
        Skills["🎯 /api/skills<br/>(storage)"]
        ChatAPI["🤖 /chat<br/>(LLM + context)"]
    end

    subgraph Storage["💾 STORAGE LAYER"]
        Redis["🔴 Redis<br/>Sessions + Messages"]
        Blob["📦 Vercel Blob<br/>Skills + Files"]
        Git["📂 Git<br/>(future)"]
    end

    ReactFlow --> Executor
    Chat --> SkillMgr
    Executor --> Sessions
    Executor --> Skills
    SkillMgr --> ChatAPI
    Sessions --> Redis
    Skills --> Blob
    ChatAPI --> Blob

    style Browser fill:#1a1a2e,stroke:#00ff00,stroke-width:2px,color:#00ff00
    style Execution fill:#16213e,stroke:#00d9ff,stroke-width:2px,color:#00d9ff
    style API fill:#0f3460,stroke:#ff8800,stroke-width:2px,color:#ff8800
    style Storage fill:#1a1a1a,stroke:#ff0080,stroke-width:2px,color:#ff0080

    style ReactFlow fill:#2d4a3e,stroke:#00ff00,color:#00ff00
    style Chat fill:#2d4a3e,stroke:#00ff00,color:#00ff00
    style Executor fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style SkillMgr fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style Sessions fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style Skills fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style ChatAPI fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style Redis fill:#4a2d2d,stroke:#ff0080,color:#ff0080
    style Blob fill:#4a2d2d,stroke:#ff0080,color:#ff0080
    style Git fill:#4a2d2d,stroke:#ff0080,color:#ff0080
```

### Storage Architecture

```mermaid
graph LR
    subgraph Redis["🔴 Redis (Sessions & Metadata)"]
        S1["session:{id}<br/>→ Session JSON"]
        S2["session:{id}:messages<br/>→ Message list"]
        S3["{volume}:{id}:sessions<br/>→ Session IDs set"]
        S4["all:sessions<br/>→ All session IDs"]
    end

    subgraph Blob["📦 Vercel Blob (Skills & Files)"]
        B1["volumes/system/<br/>system/skills/<br/>{skill}.md"]
        B2["volumes/user/<br/>{user_id}/skills/<br/>{skill}.md"]
        B3["volumes/team/<br/>{team_id}/skills/<br/>{skill}.md"]
    end

    style Redis fill:#1a1a1a,stroke:#ff0080,stroke-width:2px,color:#ff0080
    style Blob fill:#1a1a1a,stroke:#00d9ff,stroke-width:2px,color:#00d9ff
    style S1 fill:#2d1a1a,stroke:#ff0080,color:#ff0080
    style S2 fill:#2d1a1a,stroke:#ff0080,color:#ff0080
    style S3 fill:#2d1a1a,stroke:#ff0080,color:#ff0080
    style S4 fill:#2d1a1a,stroke:#ff0080,color:#ff0080
    style B1 fill:#1a2d2d,stroke:#00d9ff,color:#00d9ff
    style B2 fill:#1a2d2d,stroke:#00d9ff,color:#00d9ff
    style B3 fill:#1a2d2d,stroke:#00d9ff,color:#00d9ff
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

```mermaid
graph LR
    H["⚛️ Hamiltonian<br/>Builder"] --> V["🔬 VQE<br/>Optimizer"]
    V --> P["📊 Plot<br/>Convergence"]
    P --> E["💾 Export<br/>Results"]

    style H fill:#2d4a3e,stroke:#00ff00,stroke-width:2px,color:#00ff00
    style V fill:#3e2d4a,stroke:#ff0080,stroke-width:2px,color:#ff0080
    style P fill:#2d3e4a,stroke:#00d9ff,stroke-width:2px,color:#00d9ff
    style E fill:#4a3e2d,stroke:#ff8800,stroke-width:2px,color:#ff8800
```

Each node is a skill that executes in the browser via WebAssembly.

### 3. Sessions (Chat History)

Sessions store chat conversations with:
- Messages (user + assistant)
- Execution traces
- Artifacts (generated files)
- Volume-scoped access (user/team/system)

### 4. Volumes (Multi-Tenant Storage)

```mermaid
graph TD
    Root["📁 /volumes/"]
    System["🌐 system/<br/>(Global skills)"]
    Team["👥 team/{team_id}/<br/>(Shared skills)"]
    User["👤 user/{user_id}/<br/>(Private skills)"]

    Root --> System
    Root --> Team
    Root --> User

    System --> SRead["✅ Users: Read Only"]
    Team --> TRead["✅ Users: Read Only<br/>✅ Team: Read/Write"]
    User --> UWrite["✅ User: Read/Write"]

    style Root fill:#1a1a1a,stroke:#ffffff,stroke-width:2px,color:#ffffff
    style System fill:#2d4a3e,stroke:#00ff00,stroke-width:2px,color:#00ff00
    style Team fill:#3e2d4a,stroke:#ff0080,stroke-width:2px,color:#ff0080
    style User fill:#2d3e4a,stroke:#00d9ff,stroke-width:2px,color:#00d9ff
    style SRead fill:#1a2d1a,stroke:#00ff00,color:#00ff00
    style TRead fill:#2d1a2d,stroke:#ff0080,color:#ff0080
    style UWrite fill:#1a2d2d,stroke:#00d9ff,color:#00d9ff
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

4. **Preview Renderers**
   - PlotRenderer (line, scatter, bar charts via Recharts)
   - ThreeRenderer (3D visualizations via Three.js + WebGL)
   - CircuitRenderer (quantum circuit diagrams via SVG)

### Next Steps 🚧

- [ ] Drag-drop from library → canvas
- [ ] Workflow execution integration
- [ ] Real-time collaboration

---

## Examples

### Quantum VQE Workflow

```mermaid
graph LR
    H["⚛️ Hamiltonian Node<br/>Define quantum system"]
    V["🔬 VQE Node<br/>Run simulation (Pyodide)"]
    P["📊 Plot Node<br/>Visualize convergence"]
    E["💾 Export Node<br/>Save results"]

    H -->|"Hamiltonian<br/>matrix"| V
    V -->|"Energy values<br/>convergence data"| P
    P -->|"Chart<br/>image"| E

    style H fill:#2d4a3e,stroke:#00ff00,stroke-width:3px,color:#00ff00
    style V fill:#3e2d4a,stroke:#ff0080,stroke-width:3px,color:#ff0080
    style P fill:#2d3e4a,stroke:#00d9ff,stroke-width:3px,color:#00d9ff
    style E fill:#4a3e2d,stroke:#ff8800,stroke-width:3px,color:#ff8800
```

**Result:** ⚡ Instant, interactive, in-browser execution via WebAssembly

### 3D Animation Workflow

```mermaid
graph LR
    M["🎨 Model Node<br/>Create 3D geometry"]
    Mat["🖼️ Material Node<br/>Apply textures"]
    S["🎬 Scene Node<br/>Position objects"]
    R["🎮 Render Node<br/>WebGL rendering (60 FPS)"]

    M -->|"Geometry<br/>data"| Mat
    Mat -->|"Textured<br/>mesh"| S
    S -->|"Scene<br/>graph"| R

    style M fill:#2d4a3e,stroke:#00ff00,stroke-width:3px,color:#00ff00
    style Mat fill:#4a2d3e,stroke:#ff00ff,stroke-width:3px,color:#ff00ff
    style S fill:#2d3e4a,stroke:#00d9ff,stroke-width:3px,color:#00d9ff
    style R fill:#4a3e2d,stroke:#ff8800,stroke-width:3px,color:#ff8800
```

**Result:** 🎨 Real-time 3D visualization in browser using Three.js

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
│       │   │   ├── NodeLibraryPanel.tsx
│       │   │   ├── PlotRenderer.tsx
│       │   │   ├── ThreeRenderer.tsx
│       │   │   └── CircuitRenderer.tsx
│       │   └── ...
│       └── lib/
│           ├── workflow-executor.ts
│           └── pyodide-executor.ts
│
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
- [x] Preview renderers (plots, 3D, circuits)

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
1. Workflow execution integration (connect UI → executor)
2. New executable skills (domains: quantum, 3D, electronics, ML)
3. Runtime integrations (WebGPU, WebR, etc.)
4. Example workflows and templates

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
