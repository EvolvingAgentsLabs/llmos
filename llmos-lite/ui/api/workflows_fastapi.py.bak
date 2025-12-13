"""
Workflow API Endpoints for LLMos-Lite

Adds REST endpoints for:
- Loading executable skills (nodes)
- Managing workflows
- Preparing workflows for browser execution
- Saving workflow results as traces
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.workflow import (
    WorkflowEngine,
    ExecutableSkill,
    Workflow,
    WorkflowNode,
    WorkflowEdge
)

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Global workflow engine (would be dependency injection in production)
workflow_engine: Optional[WorkflowEngine] = None


def get_workflow_engine():
    """Get the global workflow engine"""
    global workflow_engine
    if workflow_engine is None:
        raise HTTPException(status_code=500, detail="Workflow engine not initialized")
    return workflow_engine


# ============================================================================
# Request/Response Models
# ============================================================================

class ExecutableSkillResponse(BaseModel):
    """Response model for executable skills"""
    skill_id: str
    name: str
    description: str
    node_type: str
    execution_mode: str
    category: str
    tags: List[str]
    inputs: List[Dict[str, Any]]
    outputs: List[Dict[str, Any]]
    estimated_time_ms: int
    memory_mb: int


class WorkflowCreateRequest(BaseModel):
    """Request to create/update a workflow"""
    user_id: str
    workflow_id: str
    name: str
    description: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    metadata: Dict[str, Any] = {}


class WorkflowExecuteRequest(BaseModel):
    """Request to execute a workflow in browser"""
    user_id: str
    team_id: str
    workflow_id: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/skills/executable", response_model=List[ExecutableSkillResponse])
async def list_executable_skills(user_id: str, team_id: str):
    """
    List all executable skills (nodes) available to a user.

    These are skills that can be used as nodes in workflows.
    Returns only skills with the executable format (inputs/outputs/code).
    """
    try:
        engine = get_workflow_engine()
        skills = engine.load_executable_skills(user_id, team_id)

        return [
            ExecutableSkillResponse(
                skill_id=skill.skill_id,
                name=skill.name,
                description=skill.description,
                node_type=skill.node_type.value,
                execution_mode=skill.execution_mode.value,
                category=skill.category,
                tags=skill.tags,
                inputs=[
                    {
                        "name": inp.name,
                        "type": inp.type,
                        "description": inp.description,
                        "default": inp.default,
                        "required": inp.required
                    }
                    for inp in skill.inputs
                ],
                outputs=[
                    {
                        "name": out.name,
                        "type": out.type,
                        "description": out.description
                    }
                    for out in skill.outputs
                ],
                estimated_time_ms=skill.estimated_time_ms,
                memory_mb=skill.memory_mb
            )
            for skill in skills
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills/executable/{skill_id}")
async def get_executable_skill(skill_id: str, user_id: str, team_id: str):
    """Get details of a specific executable skill"""
    try:
        engine = get_workflow_engine()

        # Load all skills to populate cache
        engine.load_executable_skills(user_id, team_id)

        skill = engine.get_skill(skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        return skill.to_browser_payload()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def prepare_workflow_for_execution(req: WorkflowExecuteRequest):
    """
    Prepare a workflow for browser execution.

    Returns a payload containing:
    - Workflow structure (nodes + edges)
    - All skill code needed for execution
    - Execution metadata

    The browser will:
    1. Receive this payload
    2. Load Pyodide/Wasm runtimes
    3. Execute nodes topologically
    4. Render results
    """
    try:
        engine = get_workflow_engine()

        # Load skills to populate cache
        engine.load_executable_skills(req.user_id, req.team_id)

        # Construct workflow object
        nodes = [
            WorkflowNode(
                node_id=n["nodeId"],
                skill_id=n["skillId"],
                position=n["position"],
                input_values=n.get("inputValues", {})
            )
            for n in req.nodes
        ]

        edges = [
            WorkflowEdge(
                edge_id=e["edgeId"],
                source_node_id=e["source"],
                source_output=e["sourceOutput"],
                target_node_id=e["target"],
                target_input=e["targetInput"]
            )
            for e in req.edges
        ]

        workflow = Workflow(
            workflow_id=req.workflow_id,
            name="Runtime Workflow",
            description="Workflow prepared for browser execution",
            nodes=nodes,
            edges=edges
        )

        # Prepare for browser
        payload = engine.prepare_for_browser(workflow)

        return {
            "status": "ready",
            "payload": payload,
            "execution_mode": "browser-wasm"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_workflow(req: WorkflowCreateRequest):
    """
    Save a workflow to user's volume.

    Stores the workflow as a Markdown file in Git.
    """
    try:
        engine = get_workflow_engine()

        # Construct workflow
        nodes = [
            WorkflowNode(
                node_id=n["nodeId"],
                skill_id=n["skillId"],
                position=n["position"],
                input_values=n.get("inputValues", {})
            )
            for n in req.nodes
        ]

        edges = [
            WorkflowEdge(
                edge_id=e["edgeId"],
                source_node_id=e["source"],
                source_output=e["sourceOutput"],
                target_node_id=e["target"],
                target_input=e["targetInput"]
            )
            for e in req.edges
        ]

        workflow = Workflow(
            workflow_id=req.workflow_id,
            name=req.name,
            description=req.description,
            nodes=nodes,
            edges=edges,
            metadata=req.metadata
        )

        # Save to volume
        success = engine.save_workflow(req.user_id, workflow)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to save workflow")

        return {
            "status": "saved",
            "workflow_id": req.workflow_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def list_skill_categories():
    """List all skill categories for filtering"""
    return {
        "categories": [
            {"id": "quantum", "name": "Quantum Computing", "icon": "⚛️"},
            {"id": "3d-graphics", "name": "3D Graphics", "icon": "🎨"},
            {"id": "electronics", "name": "Electronics", "icon": "⚡"},
            {"id": "data-science", "name": "Data Science", "icon": "📊"},
            {"id": "coding", "name": "Code Generation", "icon": "💻"},
            {"id": "general", "name": "General", "icon": "🔧"}
        ]
    }
