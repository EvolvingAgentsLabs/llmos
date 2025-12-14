# llmos-lite: Browser-Native Computational Workbench

> Build, execute, and share computational workflows entirely in your browser

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/EvolvingAgentsLabs/llmos/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-yellow.svg)](https://python.org)
[![React](https://img.shields.io/badge/react-18+-61dafb.svg)](https://reactjs.org)

---

## 🚀 What is llmos-lite?

**llmos-lite** is a modern web application for building and executing computational workflows directly in the browser. No servers required for execution—everything runs client-side via WebAssembly.

### Core Concepts

1. **Skills** - Reusable computational units stored as Markdown files
2. **Workflows** - Visual DAGs built with drag-and-drop React Flow interface
3. **Browser Execution** - WebAssembly runtimes (Pyodide, Three.js, SPICE)
4. **Production Storage** - Vercel Blob + Redis for persistence
5. **LLM Integration** - Chat interface with skill-aware context

### Key Features

- ⚡ **Zero-latency execution** - Skills run instantly via WebAssembly
- 🎨 **Rich previews** - 3D graphics, charts, quantum circuits
- 🔒 **Sandboxed & safe** - Code executes in browser, not servers
- 💰 **Zero server costs** - Computation on user devices
- 📦 **Production-ready** - Redis + Blob storage with graceful fallbacks
- 🤖 **LLM-powered** - Chat via OpenRouter (100+ models, free tier available)

---

## Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/EvolvingAgentsLabs/llmos.git
cd llmos

# Install Python dependencies (API)
pip install -r requirements.txt

# Install Node.js dependencies (UI)
cd llmos-lite/ui
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
# Required: OpenRouter API key for LLM chat
# Get your free API key from: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-v1-xxx...

# Optional: Vercel Blob storage (for skills/files)
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx...

# Optional: Redis storage (for sessions/messages)
# REDIS_URL=redis://default:password@host:port
```

**Note:**
- `.env` is gitignored and will never be committed
- OpenRouter gives you access to 100+ models including Claude, GPT-4, and free models
- Get your free API key at https://openrouter.ai/keys
- Browse all free models: https://openrouter.ai/models/?q=free

**💡 Recommended Models:**

**Free Models:**
- `tng/deepseek-r1t2-chimera:free` - DeepSeek R1T2 Chimera (reasoning model)

**Premium Models (Paid):**
- `anthropic/claude-opus-4.5` - Claude Opus 4.5 (best quality)
- `openai/gpt-5.2` - GPT-5.2 (latest from OpenAI)

[View all free models →](https://openrouter.ai/models/?q=free)

### 3. Run the App

```bash
# Terminal 1: Start FastAPI backend
cd llmos-lite
python api/main.py
# → http://localhost:8000

# Terminal 2: Start Next.js frontend
cd llmos-lite/ui
npm run dev
# → http://localhost:3000
```

### 4. Test the API

```bash
# Chat with computational skills
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $OPENROUTER_API_KEY" \
  -d '{
    "user_id": "alice",
    "team_id": "engineering",
    "message": "Create a quantum VQE circuit",
    "include_skills": true,
    "model": "anthropic/claude-3.5-sonnet"
  }'

# Create a session
curl -X POST "http://localhost:8000/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Quantum Research",
    "volume": "user",
    "initial_message": "Hello!"
  }'
```

---

## Storage Setup

### Local Development (Mock Data)

By default, llmos-lite works with mock data. No storage setup required for testing!

### Production Storage (Vercel)

For production deployments:

#### Vercel Blob (Skills & Files)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project → **Storage** → **Create Database** → **Blob**
3. Name: `llmos-files`
4. Copy `BLOB_READ_WRITE_TOKEN`
5. Add to `.env` and Vercel environment variables

#### Redis (Sessions & Messages)

1. Vercel dashboard → **Storage** → **Create Database** → **Redis**
2. Copy `REDIS_URL`
3. Add to `.env` and Vercel environment variables

#### Deploy

```bash
npm install -g vercel
vercel --prod
# Your app is live! 🎉
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

### 1. Skills (Computational Units)

Skills are version-controlled Markdown files that define reusable computational capabilities.

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

Drag-and-drop computational graphs built with React Flow.

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

Each node executes in the browser via WebAssembly.

### 3. Sessions (Chat History)

Sessions store conversations with:
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

---

## API Endpoints

### Sessions
- `GET /api/sessions` - List sessions
- `GET /api/sessions/{id}` - Get session
- `POST /api/sessions` - Create session
- `POST /api/sessions/{id}/messages` - Add message
- `PUT /api/sessions/{id}` - Update session
- `DELETE /api/sessions/{id}` - Delete session

### Skills
- `GET /api/skills` - List skills
- `GET /api/skills/{id}` - Get skill
- `POST /api/skills` - Create skill
- `DELETE /api/skills/{id}` - Delete skill

### Chat
- `POST /chat` - Chat with LLM via OpenRouter (includes skills as context)
  - Headers: `X-API-Key` (your OpenRouter key), `X-Model` (optional model override)
  - Supports 100+ models: Claude, GPT-4, Gemini, Llama, and free models

### Workflows
- `GET /workflows/skills/executable` - List executable skills
- `POST /workflows/execute` - Prepare workflow execution
- `POST /workflows/save` - Save workflow
- `GET /workflows/categories` - List categories

---

## Features

### Completed ✅

1. **React Flow Canvas**
   - Drag-drop node positioning
   - Custom SkillNode components
   - MiniMap for navigation
   - Zoom controls + background grid
   - Run workflow button

2. **Node Library Panel**
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

- [x] Drag-drop from library → canvas ✅
- [x] Workflow execution integration ✅
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

**Result:** ⚡ Instant, interactive execution via WebAssembly

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

**Result:** 🎨 Real-time 3D visualization using Three.js

---

## Project Structure

```
llmos-lite/
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
└── ui/                           # Next.js frontend
    ├── components/
    │   └── panel3-artifacts/
    │       ├── WorkflowCanvas.tsx
    │       ├── NodeLibraryPanel.tsx
    │       ├── PlotRenderer.tsx
    │       ├── ThreeRenderer.tsx
    │       └── CircuitRenderer.tsx
    └── lib/
        ├── workflow-executor.ts
        └── pyodide-executor.ts
```

---

## Roadmap

### Phase 1: Core Infrastructure ✅ (Complete)
- [x] FastAPI service
- [x] Skills loader
- [x] Storage clients
- [x] Chat integration

### Phase 2: WebAssembly Workflows ✅ (Complete)
- [x] Executable skill format
- [x] Workflow engine (DAG execution)
- [x] Pyodide integration
- [x] Multi-runtime support

### Phase 3: React UI ✅ (Complete)
- [x] React Flow canvas
- [x] Node library panel
- [x] Drag-drop from library to canvas
- [x] Workflow execution via API
- [x] Execution controls & progress
- [x] Storage integration (Redis + Blob)
- [x] Chat interface
- [x] Preview renderers (plots, 3D, circuits)

### Phase 4: Advanced Features (Future)
- [ ] GPU acceleration (WebGPU)
- [ ] Workflow marketplace
- [ ] Collaborative editing
- [ ] Mobile PWA
- [ ] Auto-generate skills from patterns

---

## Contributing

We welcome contributions!

**Priority areas:**
1. Workflow execution integration
2. New computational skills (quantum, 3D, ML, electronics)
3. Runtime integrations (WebGPU, WebR)
4. Example workflows

**Development workflow:**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## Security

- ✅ API keys in `.env` (gitignored)
- ✅ Environment variables for secrets
- ✅ No hardcoded credentials
- ✅ Sandboxed WebAssembly execution

**Production checklist:**
- [ ] Rotate API keys
- [ ] Add authentication (JWT/OAuth)
- [ ] Enable CORS restrictions
- [ ] Set up rate limiting

---

## License

Apache 2.0

---

## Credits

Built by [Evolving Agents Labs](https://github.com/EvolvingAgentsLabs)

**Core Innovation:** Version-controlled Markdown skills that execute as WebAssembly workflows in the browser.

Inspired by OpenAI/Anthropic's Skills paradigm for AI capabilities.

---

<div align="center">

**[Architecture](ARCHITECTURE.md)** · **[GitHub](https://github.com/EvolvingAgentsLabs/llmos)** · **[Issues](https://github.com/EvolvingAgentsLabs/llmos/issues)**

</div>
