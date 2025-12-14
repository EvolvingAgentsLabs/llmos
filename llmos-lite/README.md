# LLMos-Lite

> A WebAssembly-Powered, Git-Backed Computational Workbench

**LLMos-Lite** is a complete reimagining of the original `llmos` system, transforming it from a terminal-based LLM OS into a **browser-native computational workbench** where skills become executable nodes in visual workflows.

## 🚀 Migration Notice

**We are migrating from the original llmos architecture to llmos-lite:**

- **Original llmos:** Terminal UI, Python tools, server execution
- **llmos-lite:** Web UI, executable skills, browser execution via WebAssembly

This migration enables:
- ⚡ **Zero-latency execution** - Skills run instantly in browser
- 🎨 **Rich interactive previews** - 3D animations, quantum states, circuit diagrams
- 🔒 **Sandboxed safety** - Generated code runs in browser, not on servers
- 💰 **Zero server costs** - Execution happens on user devices
- 🌍 **Infinite scalability** - P2P computational model

See [WASM_WORKFLOWS.md](WASM_WORKFLOWS.md) for the complete WebAssembly workflow guide.

**🔌 NEW: Model Context Protocol (MCP)** - Skills can now access external services via MCP servers! See [MCP_INTEGRATION.md](MCP_INTEGRATION.md) for details.

## Key Concepts

### 1. Skills (Two Types)

**A. Context Skills** - Markdown files for LLM guidance:
```markdown
---
name: Python Testing
category: coding
keywords: [python, testing, pytest]
---

# Skill: Python Testing
## Approach
1. Write test functions...
```

**B. Executable Skills** - Runnable nodes in workflows:
```markdown
---
skill_id: quantum-vqe-node
type: python-wasm
execution_mode: browser-wasm
inputs:
  - name: iterations
    type: number
outputs:
  - name: eigenvalue
    type: number
---

\`\`\`python
def execute(inputs):
    # Runs in browser via Pyodide
    return {"eigenvalue": -1.137}
\`\`\`
```

Executable skills can be chained into **visual workflows** that execute entirely in the browser via WebAssembly.

### 2. Git-Backed Volumes
All artifacts (skills, traces, memory) are stored in **Git repositories**, enabling:
- Version control of skills
- Pull requests for skill promotion (User → Team → System)
- Distributed collaboration
- Rollback capabilities

**Volume Hierarchy:**
```
/volumes/
  system/         # Global skills (read-only for users)
  teams/
    {team_id}/    # Shared team skills
  users/
    {user_id}/    # Private user skills
```

### 3. Evolution Engine
The **Evolution Cron** analyzes execution traces, detects patterns, and auto-generates skills.

**Flow:**
1. User executes tasks → Traces saved
2. Evolution Cron runs (nightly or on-demand)
3. Detects repeated patterns (3+ occurrences)
4. Generates draft skills
5. Commits to user's Git volume
6. User reviews → Promotes to team if valuable

---

## Architecture

### Hybrid: Chat + Workflows

```
┌──────────────────────────────────────────────────────────┐
│              Web UI (React Flow + Chat)                  │
│  ┌─────────────────┐  ┌────────────────────────┐        │
│  │ Workflow Canvas │  │ Chat Interface         │        │
│  │ - Drag nodes    │  │ - Skill context        │        │
│  │ - Connect edges │  │ - LLM guidance         │        │
│  │ - Run in browser│  │ - Generate workflows   │        │
│  └─────────────────┘  └────────────────────────┘        │
└────────────┬──────────────────────┬──────────────────────┘
             │                      │
   ┌─────────▼─────────┐  ┌────────▼────────┐
   │ Workflow Executor │  │ Skills Manager  │
   │ (TypeScript/Wasm) │  │ (Context inject)│
   └─────────┬─────────┘  └────────┬────────┘
             │                     │
   ┌─────────▼─────────────────────▼─────────┐
   │          FastAPI Backend                │
   │  - /workflows (executable skills)       │
   │  - /chat (LLM + context)                │
   │  - /evolve (pattern → skill)            │
   └─────────┬───────────────────────────────┘
             │
   ┌─────────▼─────────┐
   │ WebAssembly       │
   │ - Pyodide (Python)│
   │ - Three.js (3D)   │
   │ - Ngspice (SPICE) │
   └───────────────────┘
```

---

## Quick Start

### 1. Installation

```bash
cd llmos-lite
pip install -r requirements.txt
```

### 2. Set API Key

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### 3. Run the API

```bash
python api/main.py
```

Server starts at `http://localhost:8000`

### 4. API Docs

Visit `http://localhost:8000/docs` for interactive API documentation.

---

## API Examples

### Chat with Skills

```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "team_id": "engineering",
    "message": "Write a Python function to calculate Fibonacci numbers",
    "include_skills": true,
    "max_skills": 5
  }'
```

**Response:**
```json
{
  "response": "Here's a Fibonacci function...",
  "skills_used": ["Python Coding Best Practices"],
  "trace_id": "trace_20250101_120000"
}
```

### List Skills

```bash
curl "http://localhost:8000/skills?user_id=alice&team_id=engineering"
```

**Response:**
```json
{
  "total": 3,
  "skills": [
    {
      "name": "Python Coding Best Practices",
      "category": "coding",
      "volume": "system",
      "keywords": ["python", "coding"]
    },
    ...
  ]
}
```

### Trigger Evolution

```bash
curl -X POST "http://localhost:8000/evolve" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "team_id": "engineering",
    "auto_apply": true
  }'
```

**Response:**
```json
{
  "status": "completed",
  "traces_analyzed": 47,
  "patterns_detected": 5,
  "skills_created": 2
}
```

### Create a Skill

```bash
curl -X POST "http://localhost:8000/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "skill_id": "my-testing-skill",
    "name": "My Testing Workflow",
    "category": "coding",
    "description": "How I write tests",
    "content": "## Approach\n1. Write test\n2. Run test\n...",
    "keywords": ["testing", "pytest"]
  }'
```

### Promote Skill (User → Team)

```bash
curl -X POST "http://localhost:8000/skills/promote" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "team_id": "engineering",
    "skill_id": "my-testing-skill",
    "reason": "Useful for all team members"
  }'
```

---

## Directory Structure

```
llmos-lite/
├── core/                          # Backend logic
│   ├── volumes.py                 # Git-backed storage
│   ├── skills.py                  # Skills loader
│   ├── evolution.py               # Pattern detection
│   └── workflow.py                # ✨ Workflow engine (NEW)
├── api/                           # REST API
│   ├── main.py                    # Main API
│   └── workflows.py               # ✨ Workflow endpoints (NEW)
├── ui/                            # ✨ Browser frontend (NEW)
│   ├── lib/
│   │   ├── pyodide-runner.ts      # Python → Wasm
│   │   ├── workflow-executor.ts   # DAG executor
│   │   ├── mcp-client.ts          # ✨ MCP client (NEW)
│   │   ├── mcp-config.ts          # ✨ MCP config (NEW)
│   │   └── execution-policy.ts    # ✨ Security policies (NEW)
│   └── package.json               # React Flow deps
├── volumes/                       # Git repositories
│   └── system/skills/
│       ├── python-coding.md       # Context skill
│       ├── quantum-vqe-node.md    # ✨ Executable skill
│       ├── threejs-cube-node.md   # ✨ Executable skill
│       ├── circuit-rc-node.md     # ✨ Executable skill
│       ├── database-query-node.md # ✨ MCP skill (NEW)
│       └── weather-analysis-node.md # ✨ MCP skill (NEW)
├── WASM_WORKFLOWS.md              # ✨ WebAssembly guide (NEW)
├── MCP_INTEGRATION.md             # ✨ MCP documentation (NEW)
└── README.md
```

---

## Key Differences from Original LLMos

| Original `llmos` | `llmos-lite` |
|------------------|--------------|
| **Execution** | 5 modes (LEARNER, FOLLOWER, etc.) | Chat + Workflows (hybrid) |
| **Interface** | Terminal UI | Web UI (React Flow + Chat) |
| **Capabilities** | Python tools | Markdown skills (2 types) |
| **Execution Location** | Server (Python/Docker) | Browser (WebAssembly) |
| **Latency** | 100-500ms (network) | <50ms (local) |
| **Previews** | Text logs | Interactive (3D, plots, etc.) |
| **Storage** | File-based | Git-backed |
| **State** | Sentience/Valence | Simple pattern detection |
| **Cost** | Server compute | Free (user devices) |

---

## Evolution Workflow

```
┌──────────────┐
│ User Works   │
│ (Chat, Code) │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Save Traces  │
│ (Execution   │
│  History)    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Evolution Cron   │
│ (Nightly/Manual) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Detect Patterns  │
│ (3+ occurrences) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Generate Skills  │
│ (Markdown files) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Git Commit       │
│ (User volume)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ User Reviews     │
│ → Promote to Team│
└──────────────────┘
```

---

## Development Roadmap

### Phase 1: Core System ✓
- [x] Git-backed volumes
- [x] Skills loader
- [x] Evolution engine
- [x] FastAPI service

### Phase 2: WebAssembly Workflows ✓
- [x] Executable skill format (inputs/outputs/code)
- [x] Workflow engine (DAG execution)
- [x] Pyodide integration (Python → Wasm)
- [x] Multi-runtime support (Python, JS, Three.js, SPICE)
- [x] Example skills (Quantum VQE, 3D Cube, RC Circuit)
- [x] Workflow API endpoints
- [x] MCP integration (external service access)
- [x] Execution policies (resource limits, security)

### Phase 3: React UI (Current)
- [ ] React Flow canvas
- [ ] Node library panel
- [ ] Execution controls & progress
- [ ] Preview renderers (plots, 3D, circuits)
- [ ] Chat interface integration
- [ ] Workflow save/load

### Phase 4: LLM Integration
- [ ] Anthropic Claude API
- [ ] Generate workflows from chat
- [ ] Skill-aware prompting
- [ ] Streaming responses

### Phase 5: Advanced Features
- [ ] GPU acceleration (WebGPU)
- [ ] Workflow marketplace
- [ ] Collaborative editing
- [ ] Mobile PWA

---

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=your-key-here

# Optional
LLMOS_VOLUMES_PATH=./volumes          # Default: ./volumes
LLMOS_MIN_PATTERN_COUNT=3             # Default: 3
LLMOS_MIN_SUCCESS_RATE=0.7            # Default: 0.7
```

---

## Contributing

This is a **living system** designed to evolve:

1. **Add System Skills**: Create `.md` files in `/volumes/system/skills/`
2. **Improve Evolution**: Enhance pattern detection in `core/evolution.py`
3. **Build Integrations**: Add support for new LLMs, storage backends
4. **Create UI**: Build web interface for skills management

---

## License

Apache 2.0

---

## Credits

Built on insights from the original [llmos](../llmos) architecture, reimagined for the **Skills Era** of AI development (inspired by OpenAI/Anthropic's 2025 direction).

**Core Innovation**: Treating capabilities as **version-controlled Markdown files** rather than Python code, enabling:
- Human-readable, editable skills
- Git-based collaboration
- LLM-native context injection
- Zero-cost execution (no tool calling overhead)
