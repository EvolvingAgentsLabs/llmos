'use client';

import { useState } from 'react';
import ThreeRenderer, { ThreeScene } from './ThreeRenderer';
import CircuitRenderer, { QuantumCircuit } from './CircuitRenderer';
import PlotRenderer, { PlotData } from './PlotRenderer';

export type ViewMode = 'graphical' | 'code' | 'split';

export type ArtifactData =
  | { type: '3d-scene'; data: ThreeScene }
  | { type: 'quantum-circuit'; data: QuantumCircuit }
  | { type: 'plot'; data: PlotData }
  | { type: 'code'; data: { language: string; code: string; title?: string } };

interface ArtifactViewerProps {
  artifact: ArtifactData;
  defaultView?: ViewMode;
  height?: number | string;
}

/**
 * ArtifactViewer - Unified component for displaying all artifact types
 *
 * Features:
 * - Multiple artifact types (3D scenes, quantum circuits, plots, code)
 * - Dual view mode: Graphical | Code | Split
 * - Code serialization for all visual artifacts
 * - Syntax highlighting
 *
 * Usage:
 * ```tsx
 * <ArtifactViewer
 *   artifact={{ type: '3d-scene', data: mySceneData }}
 *   defaultView="split"
 * />
 * ```
 */
export default function ArtifactViewer({
  artifact,
  defaultView = 'graphical',
  height = 500,
}: ArtifactViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);

  // Generate code representation from artifact data
  const getCodeRepresentation = (): string => {
    switch (artifact.type) {
      case '3d-scene':
        return generateThreeSceneCode(artifact.data);
      case 'quantum-circuit':
        return generateCircuitCode(artifact.data);
      case 'plot':
        return generatePlotCode(artifact.data);
      case 'code':
        return artifact.data.code;
      default:
        return '// No code representation available';
    }
  };

  const getTitle = (): string => {
    switch (artifact.type) {
      case '3d-scene':
        return artifact.data.title || '3D Scene';
      case 'quantum-circuit':
        return artifact.data.title || 'Quantum Circuit';
      case 'plot':
        return artifact.data.title || 'Plot';
      case 'code':
        return artifact.data.title || 'Code';
      default:
        return 'Artifact';
    }
  };

  const code = getCodeRepresentation();
  const title = getTitle();

  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary border border-terminal-border rounded overflow-hidden">
      {/* Header with view mode toggles */}
      <div className="flex items-center justify-between p-3 border-b border-terminal-border bg-terminal-bg-primary">
        <h3 className="text-terminal-accent-green text-sm font-mono">
          {title}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('graphical')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === 'graphical'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
            }`}
            title="Graphical View"
          >
            📊 Visual
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === 'code'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
            }`}
            title="Code View"
          >
            💻 Code
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === 'split'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
            }`}
            title="Split View"
          >
            ⚡ Both
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden" style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        {viewMode === 'graphical' && (
          <div className="h-full p-4">
            {renderGraphical()}
          </div>
        )}

        {viewMode === 'code' && (
          <div className="h-full overflow-auto">
            <pre className="code-block text-xs p-4 h-full">
              <code className="text-terminal-accent-blue">{code}</code>
            </pre>
          </div>
        )}

        {viewMode === 'split' && (
          <div className="h-full flex flex-col md:flex-row">
            {/* Graphical view */}
            <div className="flex-1 border-b md:border-b-0 md:border-r border-terminal-border p-4 overflow-auto">
              {renderGraphical()}
            </div>
            {/* Code view */}
            <div className="flex-1 overflow-auto">
              <pre className="code-block text-xs p-4 h-full">
                <code className="text-terminal-accent-blue">{code}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderGraphical() {
    switch (artifact.type) {
      case '3d-scene':
        return <ThreeRenderer sceneData={artifact.data} height="100%" />;
      case 'quantum-circuit':
        return <CircuitRenderer circuitData={artifact.data} height="100%" />;
      case 'plot':
        return <PlotRenderer plotData={artifact.data} height={400} />;
      case 'code':
        return (
          <div className="h-full flex items-center justify-center text-terminal-fg-tertiary text-sm">
            No graphical representation available
          </div>
        );
      default:
        return (
          <div className="h-full flex items-center justify-center text-terminal-fg-tertiary text-sm">
            Unknown artifact type
          </div>
        );
    }
  }
}

/**
 * Generate Python code for Three.js scenes
 */
function generateThreeSceneCode(scene: ThreeScene): string {
  const imports = `import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';`;

  const sceneSetup = `
// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Setup camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(${scene.camera?.position?.join(', ') || '5, 5, 5'});
camera.lookAt(${scene.camera?.lookAt?.join(', ') || '0, 0, 0'});

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;`;

  const lights = scene.lights?.map((light, i) => {
    switch (light.type) {
      case 'ambient':
        return `const ambientLight${i} = new THREE.AmbientLight(${light.color || '0x404040'}, ${light.intensity || 1});
scene.add(ambientLight${i});`;
      case 'directional':
        return `const directionalLight${i} = new THREE.DirectionalLight(${light.color || '0xffffff'}, ${light.intensity || 0.5});
directionalLight${i}.position.set(${light.position?.join(', ') || '5, 5, 5'});
scene.add(directionalLight${i});`;
      case 'point':
        return `const pointLight${i} = new THREE.PointLight(${light.color || '0xffffff'}, ${light.intensity || 1});
pointLight${i}.position.set(${light.position?.join(', ') || '0, 5, 0'});
scene.add(pointLight${i});`;
    }
  }).join('\n\n') || '';

  const objects = scene.objects.map((obj, i) => {
    let geom = '';
    switch (obj.type) {
      case 'cube':
        geom = 'new THREE.BoxGeometry(1, 1, 1)';
        break;
      case 'sphere':
        geom = 'new THREE.SphereGeometry(1, 32, 32)';
        break;
      case 'plane':
        geom = 'new THREE.PlaneGeometry(5, 5)';
        break;
      default:
        geom = 'new THREE.BoxGeometry(1, 1, 1)';
    }

    return `const geometry${i} = ${geom};
const material${i} = new THREE.MeshStandardMaterial({
  color: ${obj.color || '0x00ff00'},
  wireframe: ${obj.wireframe || false}
});
const mesh${i} = new THREE.Mesh(geometry${i}, material${i});
mesh${i}.position.set(${obj.position?.join(', ') || '0, 0, 0'});
${obj.rotation ? `mesh${i}.rotation.set(${obj.rotation.join(', ')});` : ''}
${obj.scale ? `mesh${i}.scale.set(${obj.scale.join(', ')});` : ''}
scene.add(mesh${i});`;
  }).join('\n\n');

  const animation = scene.animation ? `
// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Custom animation
  const time = Date.now() * 0.001;
  // Add your animation logic here

  renderer.render(scene, camera);
}
animate();` : `
// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();`;

  return `${imports}\n${sceneSetup}\n\n// Add lights\n${lights}\n\n// Add objects\n${objects}\n${animation}`;
}

/**
 * Generate Qiskit Python code for quantum circuits
 */
function generateCircuitCode(circuit: QuantumCircuit): string {
  const imports = `from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
from qiskit.visualization import circuit_drawer`;

  const setup = `
# Create quantum circuit with ${circuit.numQubits} qubits
qc = QuantumCircuit(${circuit.numQubits}${circuit.measurements ? `, ${circuit.numQubits}` : ''})`;

  const gates = circuit.gates
    .sort((a, b) => a.time - b.time)
    .map((gate) => {
      switch (gate.type) {
        case 'H':
          return `qc.h(${gate.target})  # Hadamard gate`;
        case 'X':
          return `qc.x(${gate.target})  # Pauli-X gate`;
        case 'Y':
          return `qc.y(${gate.target})  # Pauli-Y gate`;
        case 'Z':
          return `qc.z(${gate.target})  # Pauli-Z gate`;
        case 'CNOT':
          return `qc.cx(${gate.control}, ${gate.target})  # CNOT gate`;
        case 'SWAP':
          return `qc.swap(${gate.control}, ${gate.target})  # SWAP gate`;
        case 'CZ':
          return `qc.cz(${gate.control}, ${gate.target})  # Controlled-Z gate`;
        case 'RX':
          return `qc.rx(${gate.parameter}, ${gate.target})  # Rotation around X`;
        case 'RY':
          return `qc.ry(${gate.parameter}, ${gate.target})  # Rotation around Y`;
        case 'RZ':
          return `qc.rz(${gate.parameter}, ${gate.target})  # Rotation around Z`;
        default:
          return `# Unknown gate: ${gate.type}`;
      }
    })
    .join('\n');

  const measurements = circuit.measurements
    ? `\n# Add measurements\n${circuit.measurements.map(q => `qc.measure(${q}, ${q})`).join('\n')}`
    : '';

  const visualization = `
# Draw the circuit
qc.draw('mpl')`;

  return `${imports}\n${setup}\n\n# Add gates\n${gates}${measurements}\n${visualization}`;
}

/**
 * Generate Python code for plots using matplotlib/plotly
 */
function generatePlotCode(plot: PlotData): string {
  const imports = plot.type === 'scatter'
    ? `import matplotlib.pyplot as plt\nimport numpy as np`
    : `import matplotlib.pyplot as plt`;

  const data = `
# Data
data = ${JSON.stringify(plot.data, null, 2)}
x = [d['${plot.xKey}'] for d in data]
y = [d['${plot.yKey}'] for d in data]`;

  let plotCode = '';
  switch (plot.type) {
    case 'line':
      plotCode = `
# Create line plot
plt.figure(figsize=(10, 6))
plt.plot(x, y, color='${plot.color || '#00ff00'}', linewidth=2, marker='o')
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Line Plot'}')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`;
      break;
    case 'scatter':
      plotCode = `
# Create scatter plot
plt.figure(figsize=(10, 6))
plt.scatter(x, y, color='${plot.color || '#00ff00'}', alpha=0.6, s=100)
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Scatter Plot'}')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`;
      break;
    case 'bar':
      plotCode = `
# Create bar chart
plt.figure(figsize=(10, 6))
plt.bar(x, y, color='${plot.color || '#00ff00'}', alpha=0.8)
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Bar Chart'}')
plt.grid(True, alpha=0.3, axis='y')
plt.tight_layout()
plt.show()`;
      break;
  }

  return `${imports}${data}${plotCode}`;
}
