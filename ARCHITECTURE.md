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

```mermaid
graph TB
    subgraph Frontend["🌐 FRONTEND LAYER (Browser)"]
        ReactFlow["⚡ React Flow Canvas<br/>(Drag-drop workflow editor)"]
        ChatPanel["💬 Chat Panel<br/>(LLM conversation)"]
        NodeLib["📚 Node Library Panel<br/>(Skill browser)"]

        subgraph Executor["⚙️ Workflow Executor (TypeScript + Wasm)"]
            DAG["🔀 DAG Resolution"]
            Pyodide["🐍 Pyodide Runtime<br/>(Python → Wasm)"]
            ThreeJS["🎨 Three.js Runtime<br/>(3D graphics)"]
            Ngspice["⚡ Ngspice.js Runtime<br/>(Circuit simulation)"]
        end
    end

    subgraph API["🔌 API LAYER (FastAPI)"]
        SessionsAPI["📝 Sessions API<br/>(CRUD operations)"]
        SkillsAPI["🎯 Skills API<br/>(Load/Save skills)"]
        ChatAPI["🤖 Chat API<br/>(LLM + context injection)"]

        subgraph Storage["💼 Storage Client Abstraction"]
            RedisClient["redis_client.py<br/>(Direct Redis)"]
            KVClient["vercel_kv.py<br/>(KV REST API)"]
            BlobClient["vercel_blob.py<br/>(Blob storage)"]
        end
    end

    subgraph StorageLayer["💾 STORAGE LAYER"]
        Redis["🔴 Redis / Vercel KV<br/>- Sessions<br/>- Messages<br/>- Metadata"]
        Blob["📦 Vercel Blob<br/>- Skills (Markdown)<br/>- Workflows (JSON)<br/>- Files"]
    end

    ReactFlow --> Executor
    ChatPanel --> Executor
    NodeLib --> Executor

    DAG --> Pyodide
    DAG --> ThreeJS
    DAG --> Ngspice

    Executor -->|HTTP| SessionsAPI
    Executor -->|HTTP| SkillsAPI
    ChatPanel -->|HTTP| ChatAPI

    SessionsAPI --> RedisClient
    SkillsAPI --> BlobClient
    ChatAPI --> BlobClient

    RedisClient --> Redis
    KVClient --> Redis
    BlobClient --> Blob

    style Frontend fill:#1a1a2e,stroke:#00ff00,stroke-width:3px,color:#00ff00
    style Executor fill:#16213e,stroke:#00d9ff,stroke-width:2px,color:#00d9ff
    style API fill:#0f3460,stroke:#ff8800,stroke-width:3px,color:#ff8800
    style Storage fill:#1a1a2e,stroke:#ff0080,stroke-width:2px,color:#ff0080
    style StorageLayer fill:#1a1a1a,stroke:#ff0080,stroke-width:3px,color:#ff0080

    style ReactFlow fill:#2d4a3e,stroke:#00ff00,color:#00ff00
    style ChatPanel fill:#2d4a3e,stroke:#00ff00,color:#00ff00
    style NodeLib fill:#2d4a3e,stroke:#00ff00,color:#00ff00
    style DAG fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style Pyodide fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style ThreeJS fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style Ngspice fill:#2d3e4a,stroke:#00d9ff,color:#00d9ff
    style SessionsAPI fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style SkillsAPI fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style ChatAPI fill:#3e2d4a,stroke:#ff8800,color:#ff8800
    style RedisClient fill:#2d2d3e,stroke:#ff0080,color:#ff0080
    style KVClient fill:#2d2d3e,stroke:#ff0080,color:#ff0080
    style BlobClient fill:#2d2d3e,stroke:#ff0080,color:#ff0080
    style Redis fill:#4a2d2d,stroke:#ff0080,color:#ff0080
    style Blob fill:#2d4a4a,stroke:#00d9ff,color:#00d9ff
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

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API as Sessions API
    participant Redis

    User->>Frontend: Click "New Session"
    Frontend->>API: POST /api/sessions<br/>{name, volume}
    API->>API: Generate session ID
    API->>API: Create session object
    API->>Redis: SET session:{id}
    API->>Redis: SADD {volume}:sessions
    Redis-->>API: Success
    API-->>Frontend: Return session object
    Frontend->>Frontend: Update UI<br/>Show new session

    Note over User,Redis: Session persisted to Redis
```

### Chat Message Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant ChatAPI as Chat API
    participant Blob as Vercel Blob
    participant LLM as Anthropic API
    participant SessionsAPI as Sessions API
    participant Redis

    User->>Frontend: Send message
    Frontend->>ChatAPI: POST /chat<br/>{message, include_skills}

    alt Skills requested
        ChatAPI->>Blob: List skills
        Blob-->>ChatAPI: Return skill files
        ChatAPI->>ChatAPI: Build system prompt<br/>+ skill context
    end

    ChatAPI->>LLM: Send prompt
    LLM-->>ChatAPI: Return response
    ChatAPI-->>Frontend: {response, skills_used}
    Frontend->>Frontend: Display response

    Frontend->>SessionsAPI: POST /sessions/{id}/messages<br/>(user message)
    SessionsAPI->>Redis: RPUSH session:{id}:messages

    Frontend->>SessionsAPI: POST /sessions/{id}/messages<br/>(assistant message)
    SessionsAPI->>Redis: RPUSH session:{id}:messages

    Note over User,Redis: Messages saved to session history
```

### Workflow Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as React Flow
    participant Executor as Workflow Executor
    participant Blob as Vercel Blob
    participant Pyodide
    participant ThreeJS as Three.js

    User->>Frontend: Click "Run Workflow"
    Frontend->>Executor: Execute workflow<br/>(nodes, edges)

    Executor->>Executor: Build DAG
    Executor->>Executor: Topological sort
    Executor->>Executor: Validate connections

    loop For each node
        Executor->>Blob: Fetch skill by ID
        Blob-->>Executor: Return skill code
        Executor->>Executor: Resolve input values<br/>(from dependencies)

        alt Python skill
            Executor->>Pyodide: Execute code<br/>(inputs)
            Pyodide-->>Executor: Return result
        else JavaScript/3D skill
            Executor->>ThreeJS: Execute code<br/>(inputs)
            ThreeJS-->>Executor: Return result
        end

        Executor->>Frontend: Update node status<br/>(running → success)
    end

    Executor-->>Frontend: Workflow complete
    Frontend->>Frontend: Display final results

    Note over User,ThreeJS: All execution in browser (WebAssembly)
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
