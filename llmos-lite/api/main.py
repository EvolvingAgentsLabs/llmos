"""
FastAPI Web Service for LLMos-Lite

Provides REST API for:
- Chat (with skills context injection)
- Skills management (list, create, promote)
- Evolution (manual/auto triggers)
- Volume stats and history

This replaces the terminal-based interface from the original llmos.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime
import sys
import os

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.volumes import VolumeManager, GitVolume
from core.skills import SkillsManager, Skill
from core.evolution import EvolutionCron
from core.workflow import WorkflowEngine
from api.workflows import router as workflows_router

# Initialize FastAPI
app = FastAPI(
    title="LLMos-Lite API",
    description="Git-backed, Skills-driven LLM Operating System",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state (would use dependency injection in production)
VOLUMES_PATH = Path(os.getenv("LLMOS_VOLUMES_PATH", "./volumes"))
volume_manager = VolumeManager(VOLUMES_PATH)
skills_manager = SkillsManager(volume_manager)

# Initialize workflow engine
from api import workflows as workflows_module
workflow_engine = WorkflowEngine(volume_manager)
workflows_module.workflow_engine = workflow_engine

# Include workflow router
app.include_router(workflows_router)


# ============================================================================
# Request/Response Models
# ============================================================================

class ChatRequest(BaseModel):
    user_id: str
    team_id: str
    message: str
    include_skills: bool = True
    max_skills: int = 5


class ChatResponse(BaseModel):
    response: str
    skills_used: List[str]
    trace_id: str


class SkillCreateRequest(BaseModel):
    user_id: str
    skill_id: str
    name: str
    category: str
    description: str
    content: str
    keywords: List[str] = []


class SkillPromoteRequest(BaseModel):
    user_id: str
    team_id: str
    skill_id: str
    reason: str


class EvolutionRequest(BaseModel):
    user_id: str
    team_id: str
    auto_apply: bool = True


class EvolutionResponse(BaseModel):
    status: str
    traces_analyzed: int
    patterns_detected: int
    skills_created: int


# ============================================================================
# Helper Functions
# ============================================================================

async def get_llm_response(message: str, context: str = "") -> str:
    """
    Get response from LLM (Anthropic Claude).

    In production, this would use the actual Claude SDK.
    For now, returns a placeholder.
    """
    # TODO: Integrate with Anthropic API
    # from anthropic import AsyncAnthropic
    # client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    # response = await client.messages.create(
    #     model="claude-sonnet-4",
    #     system=context,
    #     messages=[{"role": "user", "content": message}]
    # )
    # return response.content[0].text

    # Placeholder
    return f"[LLM Response to: {message}]\n\nContext skills loaded:\n{context[:200]}..."


def format_trace(user_id: str, message: str, response: str, skills: List[Skill]) -> str:
    """Format a trace as markdown"""
    return f"""# Execution Trace: {message[:100]}

## Metadata
- **User**: {user_id}
- **Timestamp**: {datetime.now().isoformat()}
- **Success Rating**: 90%

## Request
{message}

## Skills Used
{', '.join([s.name for s in skills]) if skills else 'None'}

## Response
{response}
"""


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check"""
    return {
        "status": "healthy",
        "service": "llmos-lite",
        "version": "1.0.0"
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main chat endpoint.

    Process:
    1. Load relevant skills for user
    2. Filter skills based on query
    3. Inject skills into LLM context
    4. Get LLM response
    5. Save trace to user volume
    """
    try:
        # 1. Get user volume
        user_vol = volume_manager.get_user_volume(req.user_id)

        # 2. Load and filter skills
        skills = []
        if req.include_skills:
            all_skills = skills_manager.load_skills_for_user(req.user_id, req.team_id)
            skills = skills_manager.filter_skills_by_query(
                all_skills,
                req.message,
                max_skills=req.max_skills
            )

        # 3. Build context
        context = ""
        if skills:
            context = "\n\n".join([s.to_context_injection() for s in skills])

        # 4. Get LLM response
        response = await get_llm_response(req.message, context)

        # 5. Save trace
        trace_id = f"trace_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        trace_content = format_trace(req.user_id, req.message, response, skills)
        user_vol.write_trace(trace_id, trace_content)

        return ChatResponse(
            response=response,
            skills_used=[s.name for s in skills],
            trace_id=trace_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/skills")
async def list_skills(user_id: str, team_id: str):
    """List all skills accessible to a user"""
    try:
        skills = skills_manager.load_skills_for_user(user_id, team_id)
        return {
            "total": len(skills),
            "skills": [
                {
                    "name": s.name,
                    "category": s.category,
                    "description": s.description,
                    "volume": s.volume,
                    "keywords": s.keywords
                }
                for s in skills
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/skills/{skill_id}")
async def get_skill(user_id: str, team_id: str, skill_id: str):
    """Get a specific skill"""
    try:
        skill = skills_manager.get_skill(user_id, team_id, skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")

        return {
            "name": skill.name,
            "category": skill.category,
            "description": skill.description,
            "keywords": skill.keywords,
            "content": skill.content,
            "volume": skill.volume
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/skills")
async def create_skill(req: SkillCreateRequest):
    """Create a new skill in user's volume"""
    try:
        success = skills_manager.create_skill(
            user_id=req.user_id,
            skill_id=req.skill_id,
            name=req.name,
            category=req.category,
            description=req.description,
            content=req.content,
            keywords=req.keywords
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to create skill")

        # Clear cache
        skills_manager.clear_cache()

        return {"status": "created", "skill_id": req.skill_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/skills/promote")
async def promote_skill(req: SkillPromoteRequest):
    """
    Promote a skill from user → team volume.

    This is like creating a "Pull Request" in the Git model.
    """
    try:
        user_vol = volume_manager.get_user_volume(req.user_id)
        team_vol = volume_manager.get_team_volume(req.team_id, readonly=False)

        success = volume_manager.promote_skill(
            skill_id=req.skill_id,
            from_volume=user_vol,
            to_volume=team_vol,
            reason=req.reason
        )

        if not success:
            raise HTTPException(status_code=404, detail="Skill not found or promotion failed")

        # Clear cache
        skills_manager.clear_cache()

        return {
            "status": "promoted",
            "from": "user",
            "to": "team",
            "skill_id": req.skill_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evolve", response_model=EvolutionResponse)
async def trigger_evolution(req: EvolutionRequest, background_tasks: BackgroundTasks):
    """
    Manually trigger evolution for a user.

    Analyzes traces and generates draft skills.
    """
    try:
        # Initialize evolution cron (with placeholder LLM callback)
        evolution_cron = EvolutionCron(
            volume_manager=volume_manager,
            llm_callback=None,  # TODO: Add LLM callback
            min_pattern_count=3,
            min_success_rate=0.7
        )

        # Run evolution
        result = await evolution_cron.run_user_evolution(req.user_id, req.team_id)

        # Clear skills cache
        skills_manager.clear_cache()

        return EvolutionResponse(
            status=result.get("status", "completed"),
            traces_analyzed=result.get("traces_analyzed", 0),
            patterns_detected=result.get("patterns_detected", 0),
            skills_created=result.get("skills_created", 0)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/volumes/stats")
async def get_volume_stats(user_id: str, team_id: str):
    """Get statistics for user/team/system volumes"""
    try:
        user_vol = volume_manager.get_user_volume(user_id)
        team_vol = volume_manager.get_team_volume(team_id, readonly=True)
        system_vol = volume_manager.get_system_volume(readonly=True)

        return {
            "user": user_vol.get_stats(),
            "team": team_vol.get_stats(),
            "system": system_vol.get_stats()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/volumes/history")
async def get_volume_history(user_id: str, limit: int = 10):
    """Get Git commit history for user volume"""
    try:
        user_vol = volume_manager.get_user_volume(user_id)
        commits = user_vol.get_git_log(limit=limit)

        return {
            "volume": "user",
            "owner": user_id,
            "commits": commits
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/traces")
async def list_traces(user_id: str, limit: int = 20):
    """List recent traces for a user"""
    try:
        user_vol = volume_manager.get_user_volume(user_id)
        trace_ids = user_vol.list_traces(limit=limit)

        traces = []
        for trace_id in trace_ids:
            content = user_vol.read_trace(trace_id)
            if content:
                # Extract basic info
                lines = content.split('\n')
                title = lines[0].replace('# Execution Trace: ', '') if lines else trace_id

                traces.append({
                    "trace_id": trace_id,
                    "title": title[:100],
                    "timestamp": trace_id  # Would extract from metadata in production
                })

        return {"total": len(traces), "traces": traces}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/traces/{trace_id}")
async def get_trace(user_id: str, trace_id: str):
    """Get a specific trace"""
    try:
        user_vol = volume_manager.get_user_volume(user_id)
        content = user_vol.read_trace(trace_id)

        if not content:
            raise HTTPException(status_code=404, detail="Trace not found")

        return {
            "trace_id": trace_id,
            "content": content
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Quantum / OpenQASM API Endpoints
# ============================================================================

class QuantumTranspileRequest(BaseModel):
    qasm: str
    optimization_level: int = 1
    target_basis: Optional[List[str]] = None
    approximation_degree: Optional[int] = None


class QuantumExecuteRequest(BaseModel):
    qasm: str
    shots: int = 1024
    backend: str = "simulator"


@app.get("/api/quantum/health")
async def quantum_health():
    """Check if quantum backend is available"""
    try:
        # Check if qiskit is available
        import importlib
        qiskit_available = importlib.util.find_spec("qiskit") is not None
        return {
            "status": "healthy" if qiskit_available else "limited",
            "qiskit_available": qiskit_available,
            "supported_gates": ["x", "y", "z", "h", "rx", "ry", "rz", "cx", "cz", "crz", "swap"],
            "max_qubits": 20 if qiskit_available else 10,
            "openqasm_version": "2.0"
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/quantum/transpile")
async def quantum_transpile(req: QuantumTranspileRequest):
    """
    Transpile OpenQASM circuit using Qiskit.

    This is the key endpoint for WASM → Backend optimization.
    Browser sends OpenQASM, backend returns optimized OpenQASM.
    """
    try:
        # Try to use full Qiskit if available
        try:
            from qiskit import QuantumCircuit, transpile
            from qiskit_aer import Aer

            # Import from QASM
            original_circuit = QuantumCircuit.from_qasm_str(req.qasm)
            original_gate_count = len(original_circuit.data)
            original_depth = original_circuit.depth()

            # Get backend
            backend = Aer.get_backend('aer_simulator')

            # Transpile
            transpiled = transpile(
                original_circuit,
                backend=backend,
                optimization_level=req.optimization_level,
                basis_gates=req.target_basis
            )

            # Export back to QASM
            optimized_qasm = transpiled.qasm()

            return {
                "success": True,
                "optimizedQasm": optimized_qasm,
                "originalGateCount": original_gate_count,
                "optimizedGateCount": len(transpiled.data),
                "originalDepth": original_depth,
                "optimizedDepth": transpiled.depth()
            }

        except ImportError:
            # Fallback: basic validation without optimization
            # Parse QASM to validate
            lines = req.qasm.strip().split('\n')
            gate_count = sum(1 for l in lines if l.strip() and
                           not l.strip().startswith('//') and
                           not l.strip().startswith('OPENQASM') and
                           not l.strip().startswith('include') and
                           not l.strip().startswith('qreg') and
                           not l.strip().startswith('creg'))

            return {
                "success": True,
                "optimizedQasm": req.qasm,  # Return unchanged
                "originalGateCount": gate_count,
                "optimizedGateCount": gate_count,
                "originalDepth": gate_count,
                "optimizedDepth": gate_count,
                "note": "Qiskit not available - returned unoptimized circuit"
            }

    except Exception as e:
        return {
            "success": False,
            "originalGateCount": 0,
            "optimizedGateCount": 0,
            "originalDepth": 0,
            "optimizedDepth": 0,
            "error": str(e)
        }


@app.post("/api/quantum/execute")
async def quantum_execute(req: QuantumExecuteRequest):
    """
    Execute OpenQASM circuit on simulator or hardware.

    For production, this would connect to IBM Quantum for hardware execution.
    """
    try:
        # Try to use full Qiskit if available
        try:
            from qiskit import QuantumCircuit, transpile
            from qiskit_aer import Aer
            import numpy as np

            # Import from QASM
            circuit = QuantumCircuit.from_qasm_str(req.qasm)

            # Get backend
            if req.backend == "simulator" or req.backend == "aer_simulator":
                backend = Aer.get_backend('aer_simulator')
            else:
                # For real hardware, would use IBMQ provider
                # For now, fall back to simulator
                backend = Aer.get_backend('aer_simulator')

            # Transpile for backend
            transpiled = transpile(circuit, backend=backend)

            # Execute
            import time
            start_time = time.time()
            job = backend.run(transpiled, shots=req.shots)
            result = job.result()
            execution_time = (time.time() - start_time) * 1000  # ms

            counts = result.get_counts()

            # Get statevector if possible
            statevector = None
            try:
                sv_backend = Aer.get_backend('statevector_simulator')
                sv_circuit = circuit.remove_final_measurements(inplace=False)
                sv_job = sv_backend.run(sv_circuit)
                sv_result = sv_job.result()
                sv = sv_result.get_statevector()
                statevector = [[float(np.real(c)), float(np.imag(c))] for c in sv]
            except:
                pass

            return {
                "success": True,
                "counts": counts,
                "statevector": statevector,
                "executionTime": execution_time
            }

        except ImportError:
            # Fallback: use MicroQiskit-style simulation
            # Parse basic circuit and simulate
            return {
                "success": False,
                "error": "Full Qiskit not available. Use browser simulation for small circuits."
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@app.post("/api/quantum/validate")
async def quantum_validate(qasm: str):
    """Validate OpenQASM syntax"""
    errors = []

    if not qasm or 'OPENQASM' not in qasm:
        errors.append("Missing OPENQASM header")

    if 'qreg' not in qasm:
        errors.append("Missing quantum register declaration")

    # Check for balanced brackets
    if qasm.count('[') != qasm.count(']'):
        errors.append("Unbalanced brackets")

    return {
        "valid": len(errors) == 0,
        "errors": errors
    }


# ============================================================================
# Startup/Shutdown
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize system on startup"""
    print("🚀 LLMos-Lite API starting...")
    print(f"📁 Volumes path: {VOLUMES_PATH}")

    # Ensure volumes directory exists
    VOLUMES_PATH.mkdir(parents=True, exist_ok=True)

    # Initialize system volume if needed
    sys_vol = volume_manager.get_system_volume(readonly=False)
    print(f"✓ System volume initialized: {sys_vol.base_path}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 LLMos-Lite API shutting down...")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
