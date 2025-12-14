# LLMunix Architecture

Technical deep dive into the LLMunix platform architecture.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Storage Layer](#storage-layer)
3. [API Layer](#api-layer)
4. [Frontend Layer](#frontend-layer)
5. [Execution Model](#execution-model)
6. [Data Flow](#data-flow)
7. [Security Model](#security-model)

---

## System Overview

LLMunix is a four-layer architecture optimized for browser-native computational workflows.

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER (Browser)                    │
│                                                                │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ React Flow      │  │ Chat Panel   │  │ Node Library    │  │
│  │ Canvas          │  │              │  │ Panel           │  │
│  └────────┬────────┘  └──────┬───────┘  └────────┬─────────┘  │
│           │                  │                   │            │
│  ┌────────▼──────────────────▼───────────────────▼─────────┐  │
│  │         Workflow Executor (TypeScript + Wasm)           │  │
│  │  - DAG resolution                                       │  │
│  │  - Pyodide runtime (Python → Wasm)                     │  │
│  │  - Three.js runtime (3D graphics)                      │  │
│  │  - Ngspice.js runtime (circuit simulation)            │  │
│  └────────┬────────────────────────────────────────────────┘  │
└───────────┼────────────────────────────────────────────────────┘
            │ HTTP/WebSocket
┌───────────▼────────────────────────────────────────────────────┐
│                      API LAYER (FastAPI)                       │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ Sessions API │  │ Skills API   │  │ Chat API         │     │
│  │              │  │              │  │ (+ LLM Context)  │     │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘     │
│         │                 │                   │               │
│  ┌──────▼─────────────────▼───────────────────▼─────────┐     │
│  │            Storage Client Abstraction               │     │
│  │  - redis_client.py (direct Redis)                   │     │
│  │  - vercel_kv.py (KV REST API)                       │     │
│  │  - vercel_blob.py (Blob storage)                    │     │
│  └──────┬───────────────────────────────────────────────┘     │
└─────────┼──────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                   STORAGE LAYER                                │
│                                                                │
│  ┌────────────────────┐         ┌──────────────────────────┐  │
│  │ Redis / Vercel KV  │         │ Vercel Blob              │  │
│  │                    │         │                          │  │
│  │ - Sessions         │         │ - Skills (Markdown)      │  │
│  │ - Messages         │         │ - Workflows (JSON)       │  │
│  │ - Metadata         │         │ - Files                  │  │
│  └────────────────────┘         └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Storage Layer

### 1. Redis (Sessions & Metadata)

**Purpose:** Fast key-value storage for ephemeral session data.

**Client Implementation:**
- `api/lib/redis_client.py` - Direct Redis connection via `redis.asyncio`
- `api/lib/vercel_kv.py` - Vercel KV REST API client (fallback)

**Data Structures:**

```python
# Session metadata
session:{session_id} = {
    "id": str,
    "name": str,
    "volume": str,  # "user" | "team" | "system"
    "volume_id": str,
    "status": str,  # "active" | "paused" | "completed"
    "created_at": str,  # ISO 8601
    "updated_at": str,
    "metadata": dict
}

# Message history (Redis list)
session:{session_id}:messages = [
    {
        "role": "user" | "assistant",
        "content": str,
        "timestamp": str,
        "traces": list[int] | null,
        "artifacts": list[str] | null
    },
    ...
]

# Volume session index (Redis set)
{volume}:{volume_id}:sessions = {session_id_1, session_id_2, ...}

# Global session index
all:sessions = {session_id_1, session_id_2, ...}
```

**Operations:**
- `SET/GET` - JSON objects with automatic serialization
- `SADD/SMEMBERS` - Set operations for indexing
- `RPUSH/LRANGE` - List operations for message history
- `DEL` - Key deletion

**Connection:**
```python
from lib.redis_client import get_redis

redis = get_redis()  # Singleton instance
await redis.set("key", {"value": 42}, ex=3600)  # Expire in 1 hour
data = await redis.get("key")  # Returns dict
```

### 2. Vercel Blob (Skills & Files)

**Purpose:** Object storage for skills, workflows, and user-uploaded files.

**Client Implementation:**
- `api/lib/vercel_blob.py` - Blob storage client via HTTP

**File Structure:**

```
volumes/
├── system/
│   └── system/
│       └── skills/
│           ├── quantum-vqe.md
│           ├── threejs-cube.md
│           └── plot-convergence.md
│
├── team/
│   └── {team_id}/
│       └── skills/
│           └── team-specific-skill.md
│
└── user/
    └── {user_id}/
        ├── skills/
        │   └── user-skill.md
        └── workflows/
            └── my-workflow.json
```

**Skill File Format (Markdown):**

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
  - name: convergence_trace
    type: array
---

# Skill: VQE Optimizer

Variational Quantum Eigensolver implementation using Qiskit.

## When to Use
When solving ground state energy problems for quantum systems.

## Code

\`\`\`python
def execute(inputs):
    from qiskit import QuantumCircuit
    # ... VQE implementation
    return {
        "eigenvalue": -1.137,
        "convergence_trace": [...]
    }
\`\`\`
```

**Operations:**
```python
from lib.vercel_blob import get_blob

blob = get_blob()

# Upload skill
await blob.put(
    "volumes/user/alice/skills/my-skill.md",
    content="# Skill content",
    content_type="text/markdown"
)

# Download skill
content = await blob.get("volumes/user/alice/skills/my-skill.md")

# List skills
blobs = await blob.list(prefix="volumes/system/system/skills/")

# Delete skill
await blob.delete("volumes/user/alice/skills/old-skill.md")
```

---

## API Layer

### FastAPI Structure

```python
# api/main.py - Main application
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Import route handlers
from sessions import app as sessions_app
from skills import app as skills_app
from chat import app as chat_app

# Mount sub-applications
app.mount("/api/sessions", sessions_app)
app.mount("/api/skills", skills_app)
app.mount("/chat", chat_app)
```

### 1. Sessions API (`api/sessions.py`)

**Endpoints:**

```python
@app.get("/")
async def list_sessions(volume: str = None, volume_id: str = "default"):
    """
    List all sessions with optional volume filtering.

    Query params:
    - volume: "user" | "team" | "system"
    - volume_id: User/team identifier

    Returns: {"sessions": [...]}
    """

@app.get("/{session_id}")
async def get_session(session_id: str):
    """Get session by ID with full message history."""

@app.post("/")
async def create_session(session_req: SessionCreateRequest):
    """
    Create new session.

    Body: {
        "name": str,
        "volume": "user" | "team" | "system",
        "initial_message": str (optional)
    }
    """

@app.post("/{session_id}/messages")
async def add_message(session_id: str, message: Message):
    """
    Add message to session.

    Body: {
        "role": "user" | "assistant",
        "content": str,
        "timestamp": str,
        "traces": [...] (optional),
        "artifacts": [...] (optional)
    }
    """

@app.put("/{session_id}")
async def update_session(session_id: str, status: str = None):
    """Update session status or metadata."""

@app.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete session and all messages."""
```

**Storage Integration:**

```python
# With Redis enabled
if REDIS_ENABLED:
    redis = get_redis()

    # Save session
    await redis.set(f"session:{session_id}", session_data)
    await redis.sadd(f"{volume}:{volume_id}:sessions", session_id)

    # Save messages
    await redis.rpush(
        f"session:{session_id}:messages",
        *[json.dumps(m) for m in messages]
    )
else:
    # Fallback to mock data
    return mock_sessions
```

### 2. Skills API (`api/skills.py`)

**Endpoints:**

```python
@app.get("/")
async def list_skills(volume: str = "system", volume_id: str = "system"):
    """List skills from Blob storage."""

@app.get("/{skill_id}")
async def get_skill(skill_id: str, volume: str = "system"):
    """Get skill details by ID."""

@app.post("/")
async def create_skill(skill_req: SkillCreateRequest):
    """
    Create new skill.

    Body: {
        "name": str,
        "description": str,
        "code": str,
        "language": "python" | "javascript",
        "tags": [str],
        "category": str (optional)
    }
    """

@app.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete skill from storage."""
```

**Blob Integration:**

```python
if BLOB_ENABLED:
    blob = get_blob()

    # Create skill as Markdown
    skill_content = f"""---
name: {skill_req.name}
description: {skill_req.description}
language: {skill_req.language}
tags: {skill_req.tags}
---

# Skill: {skill_req.name}

{skill_req.description}

\`\`\`{skill_req.language}
{skill_req.code}
\`\`\`
"""

    pathname = f"volumes/{volume}/{volume_id}/skills/{skill_id}.md"
    await blob.put(pathname, skill_content, content_type="text/markdown")
```

### 3. Chat API (`api/chat.py`)

**Endpoint:**

```python
@app.post("/")
async def chat(chat_req: ChatRequest):
    """
    Chat with LLM with skill context injection.

    Body: {
        "user_id": str,
        "team_id": str,
        "message": str,
        "include_skills": bool,
        "max_skills": int (default: 5)
    }

    Returns: {
        "response": str,
        "skills_used": [str]
    }
    """
```

**Skill Loading:**

```python
# Load skills from Blob
if chat_req.include_skills and BLOB_ENABLED:
    blob = get_blob()

    # Load system skills
    blobs = await blob.list(
        prefix="volumes/system/system/skills/",
        limit=chat_req.max_skills
    )

    skill_context = []
    for blob_obj in blobs:
        content = await blob.get(blob_obj.pathname)
        skill_context.append(f"**{skill_name}**:\n{content[:500]}")

    # Inject into system prompt
    system_message = f"""
You are an AI assistant with access to computational skills.

## Available Skills

{chr(10).join(skill_context)}

Use these skills to help the user accomplish their tasks.
"""
```

---

## Frontend Layer

### React Flow Canvas (`WorkflowCanvas.tsx`)

**Features:**
- Drag-drop node positioning
- Custom node components (SkillNode)
- Edge connections with validation
- MiniMap for navigation
- Zoom/pan controls
- Execution status display

**Node Structure:**

```typescript
interface Node {
  id: string;
  type: 'skill';
  position: { x: number; y: number };
  data: {
    label: string;
    skillType: string;
    inputs: Input[];
    outputs: Output[];
    status?: 'idle' | 'running' | 'success' | 'error';
    result?: any;
  };
}
```

**Execution Flow:**

```typescript
const executeWorkflow = async (nodes: Node[], edges: Edge[]) => {
  // 1. Build dependency graph
  const graph = buildDAG(nodes, edges);

  // 2. Topological sort
  const executionOrder = topologicalSort(graph);

  // 3. Execute nodes in order
  for (const nodeId of executionOrder) {
    const node = nodes.find(n => n.id === nodeId);
    const skill = await loadSkill(node.data.skillType);

    // 4. Execute in browser (Pyodide for Python)
    const result = await executeInBrowser(skill.code, node.data.inputs);

    // 5. Update node with result
    updateNodeResult(nodeId, result);
  }
};
```

### Node Library Panel (`NodeLibraryPanel.tsx`)

**Pre-loaded Skills:**

```typescript
const AVAILABLE_SKILLS = [
  // Quantum
  { id: 'quantum-hamiltonian', name: 'Hamiltonian Builder', type: 'qiskit', category: 'quantum' },
  { id: 'quantum-vqe', name: 'VQE Optimizer', type: 'qiskit', category: 'quantum' },
  { id: 'quantum-circuit', name: 'Circuit Builder', type: 'qiskit', category: 'quantum' },

  // 3D Graphics
  { id: 'threejs-cube', name: 'Cube Renderer', type: 'threejs', category: '3d' },
  { id: 'threejs-animation', name: 'Animation Loop', type: 'threejs', category: '3d' },

  // Data
  { id: 'plot-convergence', name: 'Plot Convergence', type: 'javascript', category: 'data' },

  // Utilities
  { id: 'export-results', name: 'Export Results', type: 'javascript', category: 'code' },

  // Electronics
  { id: 'spice-resistor', name: 'SPICE Resistor Circuit', type: 'ngspice', category: 'electronics' }
];
```

---

## Execution Model

### WebAssembly Runtimes

#### 1. Pyodide (Python)

```typescript
// lib/pyodide-executor.ts
import { loadPyodide } from 'pyodide';

let pyodide: any = null;

async function initPyodide() {
  if (!pyodide) {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
    });

    // Install packages
    await pyodide.loadPackage(['numpy', 'matplotlib']);
  }
  return pyodide;
}

export async function executePython(code: string, inputs: any): Promise<any> {
  const py = await initPyodide();

  // Inject inputs
  py.globals.set('inputs', py.toPy(inputs));

  // Execute
  await py.runPythonAsync(code);

  // Extract result
  const result = py.globals.get('result');
  return result.toJs();
}
```

#### 2. Three.js (3D Graphics)

```typescript
// lib/threejs-executor.ts
import * as THREE from 'three';

export async function executeThreeJS(code: string, inputs: any): Promise<any> {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight);
  const renderer = new THREE.WebGLRenderer();

  // Inject dependencies
  const context = { THREE, scene, camera, renderer, inputs };

  // Execute user code
  const fn = new Function(...Object.keys(context), code);
  const result = await fn(...Object.values(context));

  return result;
}
```

### Workflow DAG Execution

```typescript
// lib/workflow-executor.ts
interface WorkflowNode {
  id: string;
  skillId: string;
  inputs: Record<string, any>;
  dependencies: string[];  // Node IDs this depends on
}

export async function executeWorkflow(nodes: WorkflowNode[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  const executed = new Set<string>();

  // Topological sort
  const sorted = topologicalSort(nodes);

  for (const node of sorted) {
    // Wait for dependencies
    await waitForDependencies(node.dependencies, executed);

    // Resolve inputs from dependency outputs
    const resolvedInputs = resolveInputs(node.inputs, results);

    // Execute skill
    const skill = await fetchSkill(node.skillId);
    const result = await executeSkill(skill, resolvedInputs);

    // Store result
    results.set(node.id, result);
    executed.add(node.id);
  }

  return results;
}
```

---

## Data Flow

### Session Creation Flow

```
User Action (Frontend)
  │
  ├─> POST /api/sessions
  │     ├─> Create session object
  │     ├─> Generate session ID
  │     ├─> Save to Redis: session:{id}
  │     ├─> Add to index: {volume}:{volume_id}:sessions
  │     └─> Return session object
  │
  └─> Update UI with new session
```

### Chat Message Flow

```
User sends message
  │
  ├─> POST /chat
  │     ├─> Load skills from Blob (if include_skills=true)
  │     ├─> Build system prompt with skill context
  │     ├─> Call Anthropic API
  │     ├─> Get LLM response
  │     └─> Return response + skills_used
  │
  ├─> POST /api/sessions/{id}/messages (user message)
  │     └─> Save to Redis: session:{id}:messages
  │
  └─> POST /api/sessions/{id}/messages (assistant message)
        └─> Save to Redis: session:{id}:messages
```

### Workflow Execution Flow

```
User clicks "Run Workflow"
  │
  ├─> Build DAG from React Flow nodes/edges
  │     ├─> Validate connections
  │     └─> Topological sort
  │
  ├─> For each node (in execution order):
  │     ├─> Fetch skill from Blob
  │     ├─> Resolve input values
  │     ├─> Execute in appropriate runtime:
  │     │     ├─> Python → Pyodide
  │     │     ├─> JavaScript → eval in sandbox
  │     │     └─> Three.js → WebGL context
  │     ├─> Collect output
  │     └─> Update node UI
  │
  └─> Display final results
```

---

## Security Model

### 1. Credential Management

**Environment Variables:**
```bash
# .env (gitignored)
ANTHROPIC_API_KEY=sk-ant-api03-xxx...
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx...
REDIS_URL=redis://default:password@host:port
```

**Production (Vercel):**
- Environment variables set in Vercel dashboard
- Separate values for Production/Preview/Development
- No credentials in code

### 2. Sandboxed Execution

**Pyodide:**
- Runs in WebAssembly sandbox
- No access to Node.js/filesystem APIs
- Network requests controlled by browser CORS

**JavaScript:**
```typescript
// Sandboxed evaluation
function executeSandboxed(code: string, context: any): any {
  const fn = new Function(...Object.keys(context), `
    "use strict";
    ${code}
  `);
  return fn(...Object.values(context));
}
```

### 3. Access Control

**Volume Permissions:**
```python
def can_write(user_id: str, volume: str, volume_id: str) -> bool:
    if volume == "user" and volume_id == user_id:
        return True  # User can write to their own volume
    if volume == "team" and user_in_team(user_id, volume_id):
        return False  # Team members read-only (cron writes)
    if volume == "system":
        return False  # System is read-only for all users
    return False
```

### 4. Input Validation

**Pydantic Models:**
```python
from pydantic import BaseModel, validator

class SessionCreateRequest(BaseModel):
    name: str
    volume: str
    initial_message: Optional[str] = None

    @validator('volume')
    def validate_volume(cls, v):
        if v not in ['user', 'team', 'system']:
            raise ValueError('Invalid volume')
        return v

    @validator('name')
    def validate_name(cls, v):
        if len(v) > 100:
            raise ValueError('Name too long')
        return v
```

---

## Performance Optimizations

### 1. Redis Connection Pooling

```python
class RedisClient:
    _client: Optional[redis.Redis] = None

    async def _get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=10  # Connection pool
            )
        return self._client
```

### 2. Skill Caching

```typescript
const skillCache = new Map<string, Skill>();

async function loadSkill(skillId: string): Promise<Skill> {
  if (skillCache.has(skillId)) {
    return skillCache.get(skillId)!;
  }

  const skill = await fetchSkillFromBlob(skillId);
  skillCache.set(skillId, skill);
  return skill;
}
```

### 3. Lazy Pyodide Loading

```typescript
let pyodidePromise: Promise<any> | null = null;

export async function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({
      indexURL: CDN_URL
    });
  }
  return await pyodidePromise;
}
```

---

## Future Enhancements

### 1. WebGPU Acceleration

```typescript
// lib/webgpu-executor.ts
async function executeWithGPU(code: string, data: Float32Array): Promise<Float32Array> {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();

  // Create compute pipeline
  const pipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({ code }),
      entryPoint: 'main'
    }
  });

  // Execute on GPU
  // ...

  return result;
}
```

### 2. Real-time Collaboration

```typescript
// lib/collaboration.ts
import { WebSocket } from 'ws';

class CollaborationManager {
  private ws: WebSocket;

  syncNodePosition(nodeId: string, position: { x: number; y: number }) {
    this.ws.send(JSON.stringify({
      type: 'node_move',
      nodeId,
      position,
      timestamp: Date.now()
    }));
  }

  onRemoteUpdate(callback: (update: any) => void) {
    this.ws.on('message', (data) => {
      const update = JSON.parse(data.toString());
      callback(update);
    });
  }
}
```

### 3. Evolution Engine

```python
# core/evolution.py
class PatternDetector:
    async def detect_patterns(self, user_id: str) -> List[Pattern]:
        """
        Analyze user's execution traces to find repeated patterns.
        Generate compound skills automatically.
        """
        traces = await self.load_traces(user_id, days=7)

        # Detect frequently used node sequences
        patterns = self.find_sequences(traces, min_frequency=3)

        # Generate compound skills
        for pattern in patterns:
            skill = self.generate_compound_skill(pattern)
            await self.save_skill(skill, volume="user", volume_id=user_id)

        return patterns
```

---

## Deployment

### Vercel Configuration

```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/main.py",
      "use": "@vercel/python"
    },
    {
      "src": "llmos-lite/ui/package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "api/main.py"
    },
    {
      "src": "/(.*)",
      "dest": "llmos-lite/ui/$1"
    }
  ],
  "env": {
    "ANTHROPIC_API_KEY": "@anthropic-api-key",
    "BLOB_READ_WRITE_TOKEN": "@blob-token",
    "REDIS_URL": "@redis-url"
  }
}
```

### Environment Variables

```bash
# Add to Vercel via dashboard or CLI
vercel env add ANTHROPIC_API_KEY production
vercel env add BLOB_READ_WRITE_TOKEN production
vercel env add REDIS_URL production
```

---

## Monitoring & Debugging

### Redis Monitoring

```bash
# Test connection
python test_redis.py

# Monitor Redis commands (if using Redis CLI)
redis-cli MONITOR
```

### API Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# In endpoints
logger.info(f"Session created: {session_id}")
logger.error(f"Redis error: {e}")
```

### Frontend Debugging

```typescript
// Enable React Flow debug mode
<ReactFlow
  defaultNodes={nodes}
  defaultEdges={edges}
  onError={(error) => console.error('React Flow error:', error)}
  debug={process.env.NODE_ENV === 'development'}
/>
```

---

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Redis Documentation](https://redis.io/docs/)
- [Vercel Storage](https://vercel.com/docs/storage)
- [Pyodide Documentation](https://pyodide.org/)
- [React Flow Documentation](https://reactflow.dev/)
- [Three.js Documentation](https://threejs.org/docs/)

---

Built by [Evolving Agents Labs](https://github.com/EvolvingAgentsLabs)
