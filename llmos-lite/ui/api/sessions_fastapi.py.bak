"""
Vercel Function: Session management endpoint
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

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
async def list_sessions(volume: Optional[str] = None):
    """
    List all sessions, optionally filtered by volume

    TODO: Load from Vercel KV storage
    For now, return mock data
    """
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
async def create_session(session_req: SessionCreateRequest):
    """
    Create a new session

    TODO: Save to Vercel KV storage
    """
    session_id = f"sess_{session_req.name.lower().replace(' ', '_')}"
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

    return JSONResponse({
        "id": session_id,
        "name": session_req.name,
        "volume": session_req.volume,
        "status": "active",
        "messages": messages,
        "traces_count": 0,
        "created_at": now,
        "updated_at": now,
        "metadata": {}
    }, status_code=201)


@app.post("/{session_id}/messages")
async def add_message(session_id: str, message: Message):
    """
    Add a message to a session

    TODO: Update in Vercel KV storage
    """
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
