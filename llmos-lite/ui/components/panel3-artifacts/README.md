# Artifact Visualization System

A comprehensive system for visualizing workflows, nodes, and artifacts with dual view support (graphical + code representation).

## 🎯 Overview

This implementation provides a complete artifact visualization pipeline that displays:
- **Workflows** - Interactive node graphs showing task composition
- **3D Scenes** - WebGL-rendered 3D visualizations using Three.js
- **Quantum Circuits** - SVG-based quantum circuit diagrams
- **Plots** - Data visualizations (line, scatter, bar charts)
- **Dual Views** - All artifacts support graphical ↔ code representation

## 📦 Components

### Core Components

#### `ArtifactViewer.tsx`
Unified component for rendering any artifact type with view mode toggling.

**Features:**
- Multiple artifact types (3D, circuit, plot, code)
- View modes: Graphical | Code | Split
- Automatic code generation from visual artifacts
- Syntax highlighting

**Usage:**
```tsx
import ArtifactViewer from './ArtifactViewer';

<ArtifactViewer
  artifact={{
    type: 'quantum-circuit',
    data: circuitData
  }}
  defaultView="split"
  height={500}
/>
```

**View Modes:**
- `graphical` - Visual representation only
- `code` - Generated code only
- `split` - Side-by-side view

#### `ArtifactGallery.tsx`
Display and manage multiple artifacts from workflow execution.

**Features:**
- Grid or list view
- Filter by artifact type
- Interactive previews
- Expandable detail view

**Usage:**
```tsx
import ArtifactGallery from './ArtifactGallery';

<ArtifactGallery
  artifacts={[
    { id: '1', type: '3d-scene', data: sceneData },
    { id: '2', type: 'quantum-circuit', data: circuitData }
  ]}
  defaultView="split"
/>
```

#### `WorkflowCanvas.tsx`
Full-featured interactive workflow editor using React Flow.

**Features:**
- Drag-drop node creation
- Real-time execution status
- Visual node states (pending/running/completed/error)
- Connection management
- Minimap and controls

**Usage:**
```tsx
import WorkflowCanvas from './WorkflowCanvas';

<WorkflowCanvas
  onNodeSelect={setSelectedNode}
  selectedNode={selectedNode}
/>
```

**Node States:**
- `pending` - Not started
- `running` - Executing (animated borders)
- `completed` - Successfully finished
- `error` - Failed execution

#### `NodeLibraryPanel.tsx`
Skill/tool library with drag-drop functionality.

**Categories:**
- ⚛️ Quantum (VQE, Circuit Builder, Hamiltonian)
- 🎨 3D Graphics (Cube Renderer, Animation)
- ⚡ Electronics (SPICE simulations)
- 📊 Data Science (Plots, Analysis)
- 💻 Code Generation (Export, Transform)

**Usage:**
```tsx
import NodeLibraryPanel from './NodeLibraryPanel';

<NodeLibraryPanel
  onSkillSelect={(skill) => console.log(skill)}
/>
```

### Renderer Components

#### `ThreeRenderer.tsx`
WebGL 3D scene renderer using Three.js.

**Supported Objects:**
- Cube, Sphere, Plane
- Custom geometries
- Wireframe mode
- Animations

**Usage:**
```tsx
import ThreeRenderer from './ThreeRenderer';

const scene: ThreeScene = {
  type: '3d-scene',
  title: 'H2 Molecule',
  objects: [
    { type: 'sphere', position: [-0.7, 0, 0], color: '#ffffff' },
    { type: 'sphere', position: [0.7, 0, 0], color: '#ffffff' }
  ],
  camera: { position: [3, 2, 3] }
};

<ThreeRenderer sceneData={scene} enableControls={true} />
```

#### `CircuitRenderer.tsx`
Quantum circuit visualization with SVG.

**Supported Gates:**
- Single-qubit: H, X, Y, Z, RX, RY, RZ
- Two-qubit: CNOT, SWAP, CZ
- Measurements

**Usage:**
```tsx
import CircuitRenderer from './CircuitRenderer';

const circuit: QuantumCircuit = {
  type: 'quantum-circuit',
  title: 'Bell State',
  numQubits: 2,
  gates: [
    { type: 'H', target: 0, time: 0 },
    { type: 'CNOT', target: 1, control: 0, time: 1 }
  ],
  measurements: [0, 1]
};

<CircuitRenderer circuitData={circuit} />
```

#### `PlotRenderer.tsx`
Data visualization using Recharts.

**Chart Types:**
- Line charts
- Scatter plots
- Bar charts

**Usage:**
```tsx
import PlotRenderer from './PlotRenderer';

const plot: PlotData = {
  type: 'line',
  title: 'VQE Convergence',
  data: [
    { iteration: 0, energy: -0.5 },
    { iteration: 50, energy: -1.137 }
  ],
  xKey: 'iteration',
  yKey: 'energy',
  color: '#00ff88'
};

<PlotRenderer plotData={plot} />
```

## 🔧 Integration

### ArtifactPanel
Main container integrating all components:

```tsx
import ArtifactPanel from './panel3-artifacts/ArtifactPanel';

<ArtifactPanel
  activeSession={sessionId}
  activeVolume="user"
/>
```

**Tabs:**
- 🔗 Workflow - Interactive canvas + node details
- 📦 Artifacts - Gallery of generated outputs
- 📚 Library - Drag-drop skill palette (mobile)

**Layout:**
- Desktop (lg+): Library sidebar + Main content
- Tablet/Mobile: Tabbed view

## 🎨 Code Generation

All visual artifacts automatically generate code representations:

### 3D Scenes → Three.js
```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const geometry = new THREE.SphereGeometry(1, 32, 32);
const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

### Quantum Circuits → Qiskit
```python
from qiskit import QuantumCircuit

qc = QuantumCircuit(2, 2)
qc.h(0)  # Hadamard gate
qc.cx(0, 1)  # CNOT gate
qc.measure([0, 1], [0, 1])
```

### Plots → Matplotlib
```python
import matplotlib.pyplot as plt

data = [{'iteration': 0, 'energy': -0.5}, ...]
x = [d['iteration'] for d in data]
y = [d['energy'] for d in data]

plt.plot(x, y, color='#00ff88')
plt.xlabel('iteration')
plt.ylabel('energy')
plt.show()
```

## 🚀 Workflow

### Building Workflows
1. Open **Workflow** tab
2. Drag skills from library (desktop) or Library tab (mobile)
3. Drop onto canvas to create nodes
4. Connect nodes by dragging between handles
5. Click **Run Workflow** to execute

### Viewing Artifacts
1. Switch to **Artifacts** tab
2. View all generated outputs in gallery
3. Filter by type (Circuit, 3D, Plot)
4. Click artifact for detailed view
5. Toggle between Visual/Code/Both views

### Node Details
- Click any node in workflow to view details
- See inputs, outputs, execution status
- Edit code and test individually

## 📱 Responsive Design

- **Desktop (lg+)**: 3-panel layout with persistent library
- **Tablet (md-lg)**: 2-panel with tab switching
- **Mobile (<md)**: Single panel with bottom navigation

## 🎯 Sample Data

The system includes demo artifacts:
- Bell State quantum circuit
- VQE convergence plot
- H2 molecule 3D visualization

## 🔗 File Structure

```
panel3-artifacts/
├── ArtifactViewer.tsx       # Unified artifact renderer with dual views
├── ArtifactGallery.tsx      # Multi-artifact gallery
├── ArtifactPanel.tsx        # Main integration container
├── WorkflowCanvas.tsx       # Interactive workflow editor
├── NodeLibraryPanel.tsx     # Drag-drop skill library
├── NodeEditor.tsx           # Individual node details
├── ThreeRenderer.tsx        # 3D scene renderer
├── CircuitRenderer.tsx      # Quantum circuit renderer
├── PlotRenderer.tsx         # Data plot renderer
└── README.md               # This file
```

## 🎓 Example: Complete Workflow

```tsx
// 1. Create workflow with nodes
const workflow = (
  <WorkflowCanvas
    onNodeSelect={handleNodeSelect}
    selectedNode={selectedNode}
  />
);

// 2. Execute and generate artifacts
const artifacts = [
  { id: '1', type: 'quantum-circuit', data: bellCircuit },
  { id: '2', type: 'plot', data: convergenceData },
  { id: '3', type: '3d-scene', data: moleculeViz }
];

// 3. Display in gallery with dual views
<ArtifactGallery
  artifacts={artifacts}
  defaultView="split"
/>

// 4. Individual artifact viewer
<ArtifactViewer
  artifact={artifacts[0]}
  defaultView="code"
  height={600}
/>
```

## ✅ Build Status

✓ All components built successfully
✓ TypeScript type checking passed
✓ Integration tests complete
✓ Responsive layout verified

## 🔮 Future Enhancements

- [ ] Real-time artifact streaming during execution
- [ ] Artifact export (PNG, SVG, code files)
- [ ] Collaborative editing
- [ ] Artifact versioning
- [ ] Custom node type creation
- [ ] Workflow templates library
