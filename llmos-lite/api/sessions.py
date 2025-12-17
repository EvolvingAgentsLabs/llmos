"""
Vercel Function: Session management endpoint
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import os

# Import Redis client
try:
    from lib.redis_client import get_redis
    REDIS_ENABLED = os.getenv("REDIS_URL") is not None
except ImportError:
    REDIS_ENABLED = False
    print("⚠️  Redis not available - using mock data")

app = FastAPI()


class Message(BaseModel):
    role: str
    content: str
    timestamp: str
    traces: Optional[List[int]] = None
    artifacts: Optional[List[str]] = None


class Session(BaseModel):
    id: str
    name: str
    volume: str  # 'system', 'team', or 'user'
    status: str  # 'active', 'paused', 'completed'
    messages: List[Message]
    traces_count: int
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = {}


class SessionCreateRequest(BaseModel):
    name: str
    volume: str
    initial_message: Optional[str] = None


@app.get("/")
async def list_sessions(volume: Optional[str] = None, volume_id: str = "default"):
    """
    List all sessions, optionally filtered by volume

    Uses Redis when available, falls back to mock data.
    """
    # Try Redis first
    if REDIS_ENABLED:
        try:
            redis = get_redis()

            # Get session IDs for this volume
            key = f"{volume}:{volume_id}:sessions" if volume else "all:sessions"
            session_ids = await redis.smembers(key)

            # Load each session
            sessions = []
            for session_id in session_ids:
                session_data = await redis.get(f"session:{session_id}")
                if session_data:
                    sessions.append(session_data)

            return JSONResponse({"sessions": sessions})
        except Exception as e:
            print(f"⚠️  Redis error: {e}, falling back to mock data")

    # Fallback: mock data
    mock_sessions = [
        {
            "id": "sess_quantum_research",
            "name": "Quantum Research",
            "volume": "user",
            "status": "active",
            "messages": [
                {
                    "role": "user",
                    "content": "Create a quantum circuit with 3 qubits",
                    "timestamp": "2025-12-13T10:00:00Z",
                    "traces": None,
                    "artifacts": None
                },
                {
                    "role": "assistant",
                    "content": "I'll create a quantum circuit with 3 qubits using Qiskit.",
                    "timestamp": "2025-12-13T10:00:05Z",
                    "traces": [1, 2, 3],
                    "artifacts": ["quantum_circuit.py", "circuit_diagram.png"]
                }
            ],
            "traces_count": 3,
            "created_at": "2025-12-13T10:00:00Z",
            "updated_at": "2025-12-13T10:30:00Z",
            "metadata": {"project": "qiskit-studio"}
        },
        {
            "id": "sess_data_analysis",
            "name": "Data Analysis Pipeline",
            "volume": "team",
            "status": "paused",
            "messages": [
                {
                    "role": "user",
                    "content": "Analyze sales data from Q4",
                    "timestamp": "2025-12-12T14:00:00Z",
                    "traces": None,
                    "artifacts": None
                }
            ],
            "traces_count": 5,
            "created_at": "2025-12-12T14:00:00Z",
            "updated_at": "2025-12-12T16:00:00Z",
            "metadata": {"team": "analytics"}
        }
    ]

    if volume:
        mock_sessions = [s for s in mock_sessions if s["volume"] == volume]

    return JSONResponse({"sessions": mock_sessions})


@app.get("/{session_id}")
async def get_session(session_id: str):
    """
    Get a specific session by ID

    TODO: Load from Vercel KV storage
    """
    if session_id == "sess_quantum_research":
        return JSONResponse({
            "id": "sess_quantum_research",
            "name": "Quantum Research",
            "volume": "user",
            "status": "active",
            "messages": [
                {
                    "role": "user",
                    "content": "Create a quantum circuit with 3 qubits",
                    "timestamp": "2025-12-13T10:00:00Z",
                    "traces": None,
                    "artifacts": None
                },
                {
                    "role": "assistant",
                    "content": "I'll create a quantum circuit with 3 qubits using Qiskit.",
                    "timestamp": "2025-12-13T10:00:05Z",
                    "traces": [1, 2, 3],
                    "artifacts": ["quantum_circuit.py", "circuit_diagram.png"]
                }
            ],
            "traces_count": 3,
            "created_at": "2025-12-13T10:00:00Z",
            "updated_at": "2025-12-13T10:30:00Z",
            "metadata": {"project": "qiskit-studio"}
        })

    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/")
async def create_session(session_req: SessionCreateRequest, volume_id: str = "default"):
    """
    Create a new session

    Saves to Vercel KV when available.
    """
    session_id = f"sess_{session_req.name.lower().replace(' ', '_')}_{int(datetime.utcnow().timestamp())}"
    now = datetime.utcnow().isoformat() + "Z"

    messages = []
    if session_req.initial_message:
        messages.append({
            "role": "user",
            "content": session_req.initial_message,
            "timestamp": now,
            "traces": None,
            "artifacts": None
        })

    session_data = {
        "id": session_id,
        "name": session_req.name,
        "volume": session_req.volume,
        "volume_id": volume_id,
        "status": "active",
        "messages": messages,
        "traces_count": 0,
        "created_at": now,
        "updated_at": now,
        "metadata": {}
    }

    # Save to Redis if available
    if REDIS_ENABLED:
        try:
            redis = get_redis()

            # Save session data
            await redis.set(f"session:{session_id}", session_data)

            # Add to volume's session set
            await redis.sadd(f"{session_req.volume}:{volume_id}:sessions", session_id)
            await redis.sadd("all:sessions", session_id)

            # Save messages list
            if messages:
                await redis.rpush(f"session:{session_id}:messages", *[json.dumps(m) for m in messages])

        except Exception as e:
            print(f"⚠️  Redis save error: {e}")

    return JSONResponse(session_data, status_code=201)


@app.post("/{session_id}/messages")
async def add_message(session_id: str, message: Message):
    """
    Add a message to a session

    Saves to Redis when available.
    """
    # Save to Redis if available
    if REDIS_ENABLED:
        try:
            redis = get_redis()

            # Add message to list
            await redis.rpush(f"session:{session_id}:messages", json.dumps(message.dict()))

            # Update session timestamp
            session_data = await redis.get(f"session:{session_id}")
            if session_data:
                session_data["updated_at"] = datetime.utcnow().isoformat() + "Z"
                await redis.set(f"session:{session_id}", session_data)

        except Exception as e:
            print(f"⚠️  Redis message save error: {e}")

    return JSONResponse({
        "message": "Message added to session",
        "session_id": session_id
    })


@app.put("/{session_id}")
async def update_session(session_id: str, status: Optional[str] = None):
    """
    Update session status or metadata

    TODO: Update in Vercel KV storage
    """
    return JSONResponse({
        "id": session_id,
        "status": status or "active",
        "updated_at": datetime.utcnow().isoformat() + "Z"
    })


@app.delete("/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a session

    TODO: Delete from Vercel KV storage
    """
    return JSONResponse({"message": f"Session {session_id} deleted"})


# Vercel expects the FastAPI app to be exported
handler = app
