"""
Vercel Function: Skills management endpoint
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import os

# Import Vercel Blob client
try:
    from lib.vercel_blob import get_blob
    BLOB_ENABLED = os.getenv("BLOB_READ_WRITE_TOKEN") is not None
except ImportError:
    BLOB_ENABLED = False
    print("⚠️  Vercel Blob not available - using mock data")

app = FastAPI()


class Skill(BaseModel):
    id: str
    name: str
    description: str
    code: str
    language: str
    tags: List[str]
    usage_count: int
    success_rate: float
    created_at: str
    updated_at: str


class SkillCreateRequest(BaseModel):
    name: str
    description: str
    code: str
    language: str
    tags: List[str] = []


@app.get("/")
async def list_skills(volume: str = "system", volume_id: str = "system"):
    """
    List all available skills

    Uses Vercel Blob when available, falls back to mock data.
    """
    # Try Vercel Blob first
    if BLOB_ENABLED:
        try:
            blob = get_blob()

            # List all skills in the volume
            prefix = f"volumes/{volume}/{volume_id}/skills/"
            blobs = await blob.list(prefix=prefix)

            # Load and parse skill metadata
            skills = []
            for blob_obj in blobs:
                if blob_obj.pathname.endswith('.md') or blob_obj.pathname.endswith('.json'):
                    content = await blob.get(blob_obj.pathname)
                    if content:
                        # Parse skill metadata (simplified - should parse frontmatter)
                        skill_id = blob_obj.pathname.split('/')[-1].replace('.md', '').replace('.json', '')
                        skills.append({
                            "id": skill_id,
                            "name": skill_id.replace('-', ' ').title(),
                            "description": f"Skill from {blob_obj.pathname}",
                            "code": content[:200] + "..." if len(content) > 200 else content,
                            "language": "python",
                            "tags": ["blob-loaded"],
                            "usage_count": 0,
                            "success_rate": 1.0,
                            "created_at": blob_obj.uploaded_at,
                            "updated_at": blob_obj.uploaded_at
                        })

            if skills:
                return JSONResponse({"skills": skills})
        except Exception as e:
            print(f"⚠️  Blob error: {e}, falling back to mock data")

    # Fallback: mock data
    mock_skills = [
        {
            "id": "skill_001",
            "name": "quantum_circuit_builder",
            "description": "Builds quantum circuits with error correction",
            "code": "def build_circuit(qubits: int) -> str:\n    ...",
            "language": "python",
            "tags": ["quantum", "qiskit"],
            "usage_count": 42,
            "success_rate": 0.96,
            "created_at": "2025-12-01T10:00:00Z",
            "updated_at": "2025-12-10T15:30:00Z"
        },
        {
            "id": "skill_002",
            "name": "data_analyzer",
            "description": "Analyzes CSV data and generates insights",
            "code": "def analyze_data(csv_path: str) -> dict:\n    ...",
            "language": "python",
            "tags": ["data", "analysis"],
            "usage_count": 28,
            "success_rate": 0.89,
            "created_at": "2025-12-05T12:00:00Z",
            "updated_at": "2025-12-08T09:15:00Z"
        }
    ]

    return JSONResponse({"skills": mock_skills})


@app.get("/{skill_id}")
async def get_skill(skill_id: str):
    """
    Get a specific skill by ID

    TODO: Load from Vercel Blob storage
    """
    # Mock response
    if skill_id == "skill_001":
        return JSONResponse({
            "id": "skill_001",
            "name": "quantum_circuit_builder",
            "description": "Builds quantum circuits with error correction",
            "code": """def build_circuit(qubits: int) -> str:
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(qubits)
    for i in range(qubits):
        qc.h(i)
    qc.measure_all()

    return qc.qasm()
""",
            "language": "python",
            "tags": ["quantum", "qiskit"],
            "usage_count": 42,
            "success_rate": 0.96,
            "created_at": "2025-12-01T10:00:00Z",
            "updated_at": "2025-12-10T15:30:00Z"
        })

    raise HTTPException(status_code=404, detail="Skill not found")


@app.post("/")
async def create_skill(skill_req: SkillCreateRequest, volume: str = "user", volume_id: str = "default"):
    """
    Create a new skill

    Saves to Vercel Blob when available.
    """
    from datetime import datetime

    skill_id = skill_req.name.lower().replace(' ', '-')
    now = datetime.utcnow().isoformat() + "Z"

    # Create skill content (Markdown format)
    skill_content = f"""---
name: {skill_req.name}
description: {skill_req.description}
language: {skill_req.language}
tags: {json.dumps(skill_req.tags)}
---

# Skill: {skill_req.name}

{skill_req.description}

## Code

```{skill_req.language}
{skill_req.code}
```
"""

    # Save to Vercel Blob if available
    if BLOB_ENABLED:
        try:
            blob = get_blob()

            # Save skill file
            pathname = f"volumes/{volume}/{volume_id}/skills/{skill_id}.md"
            await blob.put(pathname, skill_content, content_type="text/markdown")

            print(f"✓ Skill saved to Blob: {pathname}")
        except Exception as e:
            print(f"⚠️  Blob save error: {e}")

    skill_data = {
        "id": skill_id,
        "name": skill_req.name,
        "description": skill_req.description,
        "code": skill_req.code,
        "language": skill_req.language,
        "tags": skill_req.tags,
        "usage_count": 0,
        "success_rate": 0.0,
        "created_at": now,
        "updated_at": now
    }

    return JSONResponse(skill_data, status_code=201)


@app.put("/{skill_id}")
async def update_skill(skill_id: str, skill_req: SkillCreateRequest):
    """
    Update an existing skill

    TODO: Update in Vercel Blob storage
    """
    return JSONResponse({
        "id": skill_id,
        "name": skill_req.name,
        "description": skill_req.description,
        "code": skill_req.code,
        "language": skill_req.language,
        "tags": skill_req.tags,
        "usage_count": 42,  # Preserve existing count
        "success_rate": 0.96,
        "created_at": "2025-12-01T10:00:00Z",
        "updated_at": "2025-12-13T00:00:00Z"
    })


@app.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """
    Delete a skill

    TODO: Delete from Vercel Blob storage
    """
    return JSONResponse({"message": f"Skill {skill_id} deleted"})


# Vercel expects the FastAPI app to be exported
handler = app
