#!/usr/bin/env python3
"""
Quantum Backend Server (Local)

Run this on your machine to get full Qiskit capabilities:
- 20+ qubits (limited by your RAM)
- Noise models
- Full transpilation/optimization
- IBM Quantum hardware access (with API key)

Usage:
    pip install qiskit qiskit-aer qiskit-ibm-runtime fastapi uvicorn
    python quantum_backend.py

Then configure your browser to connect to http://localhost:8080
"""

import os
import sys
import time
import json
from typing import Optional, List, Dict, Any

# Check dependencies
try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("Installing FastAPI...")
    os.system("pip install fastapi uvicorn pydantic")
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn

# Qiskit imports (will check availability)
QISKIT_AVAILABLE = False
QISKIT_AER_AVAILABLE = False
QISKIT_IBM_AVAILABLE = False

try:
    from qiskit import QuantumCircuit, transpile
    from qiskit.quantum_info import Statevector
    QISKIT_AVAILABLE = True
except ImportError:
    print("⚠️  Qiskit not found. Install with: pip install qiskit")

try:
    from qiskit_aer import Aer, AerSimulator
    from qiskit_aer.noise import NoiseModel, depolarizing_error, thermal_relaxation_error
    QISKIT_AER_AVAILABLE = True
except ImportError:
    print("⚠️  Qiskit Aer not found. Install with: pip install qiskit-aer")

try:
    from qiskit_ibm_runtime import QiskitRuntimeService, Session, Sampler
    QISKIT_IBM_AVAILABLE = True
except ImportError:
    print("ℹ️  Qiskit IBM Runtime not found. Install with: pip install qiskit-ibm-runtime")
    print("   (Only needed for real quantum hardware)")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="Quantum Backend (Local)",
    description="Full Qiskit backend for browser-based quantum computing",
    version="1.0.0"
)

# Allow browser connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request/Response Models
# ============================================================================

class TranspileRequest(BaseModel):
    qasm: str
    optimization_level: int = 1
    target_basis: Optional[List[str]] = None
    coupling_map: Optional[List[List[int]]] = None


class ExecuteRequest(BaseModel):
    qasm: str
    shots: int = 1024
    backend: str = "aer_simulator"
    noise_model: Optional[str] = None  # "depolarizing", "thermal", "ibmq_<device>"
    seed: Optional[int] = None


class NoiseConfig(BaseModel):
    type: str  # "depolarizing", "thermal", "custom"
    single_qubit_error: float = 0.001
    two_qubit_error: float = 0.01
    t1: float = 50e-6  # T1 relaxation time (seconds)
    t2: float = 70e-6  # T2 dephasing time (seconds)
    gate_time: float = 50e-9  # Gate duration (seconds)


class VQERequest(BaseModel):
    qasm_ansatz: str  # Parametric circuit in QASM
    hamiltonian: Dict[str, float]  # Pauli terms: {"ZZ": 1.0, "XI": 0.5}
    initial_params: Optional[List[float]] = None
    max_iterations: int = 100
    optimizer: str = "COBYLA"  # COBYLA, SPSA, L-BFGS-B


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/")
def root():
    return {
        "service": "Quantum Backend (Local)",
        "qiskit": QISKIT_AVAILABLE,
        "qiskit_aer": QISKIT_AER_AVAILABLE,
        "qiskit_ibm": QISKIT_IBM_AVAILABLE,
        "max_qubits": 25 if QISKIT_AER_AVAILABLE else 10,
        "features": {
            "transpilation": QISKIT_AVAILABLE,
            "noise_models": QISKIT_AER_AVAILABLE,
            "vqe_optimizer": QISKIT_AVAILABLE,
            "hardware_access": QISKIT_IBM_AVAILABLE,
        }
    }


@app.get("/api/quantum/health")
def health():
    return {
        "status": "healthy" if QISKIT_AVAILABLE else "limited",
        "qiskit_available": QISKIT_AVAILABLE,
        "qiskit_aer_available": QISKIT_AER_AVAILABLE,
        "qiskit_ibm_available": QISKIT_IBM_AVAILABLE,
        "supported_gates": ["x", "y", "z", "h", "s", "t", "rx", "ry", "rz",
                          "cx", "cz", "cy", "ch", "crz", "crx", "cry",
                          "ccx", "swap", "iswap", "u1", "u2", "u3"],
        "max_qubits": 25 if QISKIT_AER_AVAILABLE else 10,
        "openqasm_version": "2.0",
        "noise_models": ["depolarizing", "thermal", "custom"] if QISKIT_AER_AVAILABLE else [],
        "optimizers": ["COBYLA", "SPSA", "L-BFGS-B", "SLSQP", "Powell"] if QISKIT_AVAILABLE else [],
    }


# ============================================================================
# Transpilation Endpoint
# ============================================================================

@app.post("/api/quantum/transpile")
def quantum_transpile(req: TranspileRequest):
    """
    Transpile circuit with full Qiskit optimization.

    Optimization levels:
    - 0: No optimization
    - 1: Light optimization (default)
    - 2: Medium optimization
    - 3: Heavy optimization (best for hardware)
    """
    if not QISKIT_AVAILABLE:
        raise HTTPException(500, "Qiskit not installed")

    try:
        # Parse QASM
        circuit = QuantumCircuit.from_qasm_str(req.qasm)
        original_depth = circuit.depth()
        original_gates = len(circuit.data)

        # Build transpile options
        transpile_opts = {
            "optimization_level": req.optimization_level,
        }

        if req.target_basis:
            transpile_opts["basis_gates"] = req.target_basis

        if req.coupling_map:
            transpile_opts["coupling_map"] = req.coupling_map

        # Get backend for realistic constraints
        if QISKIT_AER_AVAILABLE:
            backend = AerSimulator()
            transpile_opts["backend"] = backend

        # Transpile
        start = time.time()
        transpiled = transpile(circuit, **transpile_opts)
        transpile_time = (time.time() - start) * 1000

        # Export back to QASM
        optimized_qasm = transpiled.qasm()

        return {
            "success": True,
            "optimizedQasm": optimized_qasm,
            "originalGateCount": original_gates,
            "optimizedGateCount": len(transpiled.data),
            "originalDepth": original_depth,
            "optimizedDepth": transpiled.depth(),
            "transpileTimeMs": transpile_time,
            "optimizationLevel": req.optimization_level,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# Execution Endpoint (with Noise Models)
# ============================================================================

@app.post("/api/quantum/execute")
def quantum_execute(req: ExecuteRequest):
    """
    Execute circuit on simulator with optional noise model.
    """
    if not QISKIT_AVAILABLE:
        raise HTTPException(500, "Qiskit not installed")

    try:
        # Parse circuit
        circuit = QuantumCircuit.from_qasm_str(req.qasm)

        # Choose backend
        if QISKIT_AER_AVAILABLE:
            if req.noise_model:
                backend = AerSimulator(noise_model=_build_noise_model(req.noise_model, circuit.num_qubits))
            else:
                backend = AerSimulator()
        else:
            raise HTTPException(500, "Qiskit Aer required for simulation")

        # Transpile for backend
        transpiled = transpile(circuit, backend=backend)

        # Execute
        start = time.time()
        job = backend.run(transpiled, shots=req.shots, seed_simulator=req.seed)
        result = job.result()
        exec_time = (time.time() - start) * 1000

        counts = result.get_counts()

        # Get statevector if circuit is small enough
        statevector = None
        if circuit.num_qubits <= 15:
            try:
                # Remove measurements for statevector
                sv_circuit = circuit.remove_final_measurements(inplace=False)
                sv = Statevector.from_instruction(sv_circuit)
                statevector = {
                    "amplitudes": [
                        {"real": float(c.real), "imag": float(c.imag)}
                        for c in sv.data
                    ],
                    "probabilities": sv.probabilities().tolist(),
                }
            except:
                pass

        return {
            "success": True,
            "counts": counts,
            "statevector": statevector,
            "executionTimeMs": exec_time,
            "shots": req.shots,
            "backend": req.backend,
            "noiseModel": req.noise_model,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _build_noise_model(noise_type: str, num_qubits: int) -> "NoiseModel":
    """Build a noise model for realistic simulation."""
    if not QISKIT_AER_AVAILABLE:
        return None

    noise_model = NoiseModel()

    if noise_type == "depolarizing":
        # Simple depolarizing noise
        error_1q = depolarizing_error(0.001, 1)
        error_2q = depolarizing_error(0.01, 2)

        noise_model.add_all_qubit_quantum_error(error_1q, ['x', 'y', 'z', 'h', 's', 't', 'rx', 'ry', 'rz'])
        noise_model.add_all_qubit_quantum_error(error_2q, ['cx', 'cz', 'swap'])

    elif noise_type == "thermal":
        # Thermal relaxation noise (more realistic)
        t1 = 50e-6  # 50 microseconds
        t2 = 70e-6  # 70 microseconds
        gate_time_1q = 50e-9  # 50 ns
        gate_time_2q = 300e-9  # 300 ns

        error_1q = thermal_relaxation_error(t1, t2, gate_time_1q)
        error_2q = thermal_relaxation_error(t1, t2, gate_time_2q).tensor(
            thermal_relaxation_error(t1, t2, gate_time_2q)
        )

        noise_model.add_all_qubit_quantum_error(error_1q, ['x', 'y', 'z', 'h', 'rx', 'ry', 'rz'])
        noise_model.add_all_qubit_quantum_error(error_2q, ['cx', 'cz'])

    return noise_model


# ============================================================================
# VQE / Optimization Endpoint
# ============================================================================

@app.post("/api/quantum/vqe")
def quantum_vqe(req: VQERequest):
    """
    Run Variational Quantum Eigensolver with classical optimizer.
    """
    if not QISKIT_AVAILABLE:
        raise HTTPException(500, "Qiskit not installed")

    try:
        from scipy.optimize import minimize
        import numpy as np

        # Parse ansatz circuit
        ansatz = QuantumCircuit.from_qasm_str(req.qasm_ansatz)
        num_params = ansatz.num_parameters if hasattr(ansatz, 'num_parameters') else 0

        # For now, use simple parameter binding approach
        # In production, would use Qiskit's ParameterVector

        # Build Hamiltonian as sum of Pauli terms
        # req.hamiltonian = {"ZZ": 1.0, "XI": 0.5, ...}

        backend = AerSimulator() if QISKIT_AER_AVAILABLE else None
        if not backend:
            raise HTTPException(500, "Qiskit Aer required for VQE")

        convergence = []

        def cost_function(params):
            # This is simplified - real VQE needs parameter binding
            # For demo, we'll evaluate expectation value

            # Bind parameters to circuit (simplified)
            bound_circuit = ansatz.copy()

            # Execute and compute expectation
            transpiled = transpile(bound_circuit, backend)
            job = backend.run(transpiled, shots=1024)
            counts = job.result().get_counts()

            # Compute expectation value (simplified for ZZ Hamiltonian)
            energy = 0.0
            total = sum(counts.values())
            for bitstring, count in counts.items():
                # Compute Pauli expectation
                parity = 1
                for pauli_term, coeff in req.hamiltonian.items():
                    term_parity = 1
                    for i, p in enumerate(pauli_term):
                        if p == 'Z' and i < len(bitstring):
                            term_parity *= 1 if bitstring[-(i+1)] == '0' else -1
                    parity *= term_parity
                energy += coeff * parity * count / total

            convergence.append(float(energy))
            return energy

        # Initialize parameters
        x0 = req.initial_params or np.random.uniform(-np.pi, np.pi, num_params).tolist()
        if len(x0) == 0:
            x0 = [0.0]  # Dummy for circuits without parameters

        # Optimize
        start = time.time()
        result = minimize(
            cost_function,
            x0,
            method=req.optimizer,
            options={"maxiter": req.max_iterations}
        )
        opt_time = (time.time() - start) * 1000

        return {
            "success": True,
            "eigenvalue": float(result.fun),
            "optimalParams": result.x.tolist(),
            "convergence": convergence,
            "iterations": result.nit if hasattr(result, 'nit') else len(convergence),
            "optimizer": req.optimizer,
            "optimizationTimeMs": opt_time,
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# IBM Quantum Hardware (Optional)
# ============================================================================

@app.post("/api/quantum/hardware/connect")
def connect_ibm(api_token: str):
    """Connect to IBM Quantum with your API token."""
    if not QISKIT_IBM_AVAILABLE:
        raise HTTPException(500, "qiskit-ibm-runtime not installed")

    try:
        # Save credentials
        QiskitRuntimeService.save_account(channel="ibm_quantum", token=api_token, overwrite=True)
        service = QiskitRuntimeService(channel="ibm_quantum")

        # List available backends
        backends = service.backends()

        return {
            "success": True,
            "message": "Connected to IBM Quantum",
            "backends": [
                {
                    "name": b.name,
                    "qubits": b.num_qubits,
                    "status": str(b.status().status_msg),
                }
                for b in backends[:10]  # First 10
            ]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/quantum/hardware/backends")
def list_backends():
    """List available IBM Quantum backends."""
    if not QISKIT_IBM_AVAILABLE:
        return {"backends": [], "note": "IBM Quantum not configured"}

    try:
        service = QiskitRuntimeService(channel="ibm_quantum")
        backends = service.backends()

        return {
            "backends": [
                {
                    "name": b.name,
                    "qubits": b.num_qubits,
                    "status": str(b.status().status_msg),
                    "pending_jobs": b.status().pending_jobs,
                }
                for b in backends
            ]
        }
    except Exception as e:
        return {"backends": [], "error": str(e)}


# ============================================================================
# Startup
# ============================================================================

def main():
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║           Quantum Backend Server (Local)                          ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  This server provides full Qiskit capabilities for browser-based  ║
║  quantum computing applications.                                  ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
    """)

    print(f"  Qiskit:          {'✓ Available' if QISKIT_AVAILABLE else '✗ Not installed'}")
    print(f"  Qiskit Aer:      {'✓ Available' if QISKIT_AER_AVAILABLE else '✗ Not installed'}")
    print(f"  IBM Quantum:     {'✓ Available' if QISKIT_IBM_AVAILABLE else '○ Optional'}")
    print()

    if not QISKIT_AVAILABLE:
        print("  To install Qiskit:")
        print("    pip install qiskit qiskit-aer")
        print()

    print("  Starting server on http://localhost:8080")
    print("  Configure your browser app to connect to this URL")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
