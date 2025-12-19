# Quantum Circuit Designer

## Overview

A visual programming environment for quantum circuits that converts natural language descriptions into executable node graphs.

## Features

### 1. Natural Language to Circuit Graph
Enter a description like:
```
create a quantum circuit to process a cardiac pressure signal and detect echoes
using two quantum fourier transforms
```

The system automatically generates a visual node graph with:
- Signal Input node
- QFT node #1
- Cepstrum Analysis node
- QFT node #2
- Echo Detection node
- Visualization node

### 2. Visual Node Graph
- **Drag-and-drop** nodes to rearrange
- **Connect** nodes by dragging between handles
- **Real-time** execution status
- **Color-coded** states (pending, running, completed, error)

### 3. Code Editor for Each Node
- **Monaco Editor** with Python syntax highlighting
- **WebAssembly View** - See simulated WASM bytecode representation
- **Live Execution** - Test run individual nodes
- **Input/Output** configuration

### 4. Step-by-Step Debugging
- **Run All** - Execute entire workflow
- **Step** - Execute one node at a time
- **Debug Mode** - Pause between nodes
- **Breakpoints** - (Future enhancement)

### 5. Error Detection & Auto-Fix
- Inline error display
- Suggested fixes
- Auto-fix button (integrated with AI)

## Components

### `/lib/quantum-nlp-parser.ts`
Parses natural language and generates circuit graphs:
- `parseCircuitIntent()` - Extract keywords and node types
- `generateCircuitGraph()` - Create ReactFlow nodes/edges
- `parseNaturalLanguageToCircuit()` - Main entry point

### `/components/panel3-artifacts/QuantumNode.tsx`
Visual node component with:
- Status indicators
- Code preview
- Input/output displays
- Action buttons (Run, Debug)

### `/components/panel3-artifacts/QuantumNodeEditor.tsx`
Code editor with:
- Monaco editor integration
- WebAssembly bytecode viewer
- Live execution
- Error handling with auto-fix

### `/components/panel3-artifacts/QuantumCircuitDesigner.tsx`
Main designer component:
- ReactFlow canvas
- NLP input bar
- Execution controls
- Node selection and editing

## Node Types

### SignalInput
Generates or loads input signal data (cardiac, audio, etc.)

### QFT (Quantum Fourier Transform)
Performs quantum frequency analysis using Qiskit

### Hadamard
Creates superposition state across qubits

### Cepstrum
Classical cepstrum analysis for echo detection

### EchoDetection
Detects and measures echoes in signals

### Measurement
Measures quantum state and collapses to classical result

### Visualization
Plots results using matplotlib

## Usage Example

### 1. Generate Circuit from Natural Language
```typescript
import QuantumCircuitDesigner from '@/components/panel3-artifacts/QuantumCircuitDesigner';

// In your component:
<QuantumCircuitDesigner />
```

Then type in the NLP input:
```
create a quantum circuit to process a cardiac pressure signal and detect
echoes using quantum fourier transform
```

Click **Generate** to create the circuit.

### 2. Edit Node Code
Click any node to open the editor. Modify the Python code:

```python
import numpy as np
from qiskit import QuantumCircuit

def execute(inputs):
    signal = inputs['signal']
    n_qubits = inputs.get('n_qubits', 4)

    # Your custom logic here

    return {
        'output': result
    }
```

### 3. Run the Circuit
- **Run All** - Execute entire workflow
- **Step** - Debug step-by-step
- **Debug Mode** - Pause between nodes

### 4. View Results
Each node shows:
- Execution time
- Output values
- Generated plots (matplotlib)
- Error messages (if any)

## Integration

### Add to Existing Page

```tsx
import QuantumCircuitDesigner from '@/components/panel3-artifacts/QuantumCircuitDesigner';

export default function MyPage() {
  return (
    <div className="h-screen">
      <QuantumCircuitDesigner />
    </div>
  );
}
```

### Use NLP Parser Programmatically

```typescript
import { parseNaturalLanguageToCircuit } from '@/lib/quantum-nlp-parser';

const result = parseNaturalLanguageToCircuit(
  "create a quantum circuit for VQE optimization"
);

console.log(result.nodes);  // Array of ReactFlow nodes
console.log(result.edges);  // Array of ReactFlow edges
```

## Workflow Example: Cardiac Echo Detection

### Natural Language Input:
```
create a quantum circuit to process a cardiac pressure signal and detect
echoes using cepstral analysis with quantum fourier transforms
```

### Generated Graph:
```
SignalInput
    ↓
  QFT #1
    ↓
 Cepstrum
    ↓
  QFT #2
    ↓
EchoDetection
    ↓
Visualization
```

### Execution Flow:
1. **SignalInput** - Generates cardiac signal with synthetic echo
2. **QFT #1** - Transforms to frequency domain
3. **Cepstrum** - Computes cepstrum for echo detection
4. **QFT #2** - Secondary frequency analysis
5. **EchoDetection** - Identifies echo position and strength
6. **Visualization** - Plots all results

## Advanced Features

### Custom Node Types
Add new node types in `/lib/quantum-nlp-parser.ts`:

```typescript
const configs: Record<string, any> = {
  MyCustomNode: {
    label: 'My Custom Node',
    description: 'Does custom processing',
    inputs: [{ name: 'input1', type: 'ndarray' }],
    outputs: [{ name: 'output1', type: 'ndarray' }],
    defaultCode: `
def execute(inputs):
    data = inputs['input1']
    # Your logic
    return {'output1': result}
    `,
  },
};
```

### WebAssembly Code View
Each node shows a simulated WebAssembly representation:
- Module structure
- Function imports/exports
- Memory layout
- Stack depth estimate
- Size estimate

### Error Auto-Fix (Future)
Integration with AI to suggest and apply fixes:
```typescript
// In QuantumNodeEditor.tsx
const autoFixError = async (errorMessage: string, code: string) => {
  const llmClient = createLLMClient();
  const fixedCode = await llmClient.fixCode(code, errorMessage);
  setCode(fixedCode);
};
```

## Architecture

```
User Input (NLP)
    ↓
parseNaturalLanguageToCircuit()
    ↓
ReactFlow Graph (Nodes + Edges)
    ↓
User Edits Code (Monaco Editor)
    ↓
Execute Workflow (Pyodide Runtime)
    ↓
Results + Visualizations
```

## Performance

- **NLP Parsing**: < 50ms
- **Graph Generation**: < 100ms
- **Node Execution**: Depends on Python code (typically 100ms - 5s)
- **Full Workflow**: Depends on circuit complexity

## Limitations

- WebAssembly view is simulated (not actual WASM compilation)
- Quantum simulation limited by browser memory
- Large circuits (>20 qubits) may be slow
- Auto-fix requires AI integration (not yet implemented)

## Future Enhancements

- [ ] Real Python-to-WASM compilation
- [ ] Breakpoints in code editor
- [ ] Variable inspection during debug
- [ ] Export to Qiskit/Cirq
- [ ] Import existing circuits
- [ ] Collaborative editing
- [ ] Circuit templates library
- [ ] Performance profiling
- [ ] GPU acceleration for simulation

## Example: Run the Cardiac Cepstral Example

```typescript
// In your component or page:
import QuantumCircuitDesigner from '@/components/panel3-artifacts/QuantumCircuitDesigner';

export default function CardiacAnalysisPage() {
  return (
    <div className="h-screen p-4">
      <h1 className="text-xl mb-4">Cardiac Echo Detection with Quantum Circuits</h1>
      <QuantumCircuitDesigner />
    </div>
  );
}
```

Then in the NLP input, paste:
```
create a quantum circuit to process a cardiac pressure signal and detect echoes
using cepstral analysis and two quantum fourier transforms
```

Click **Generate**, then **Run All** to execute the full workflow!

## Support

For issues or questions, see:
- `/lib/quantum-nlp-parser.ts` for NLP logic
- `/components/panel3-artifacts/QuantumNode.tsx` for node rendering
- `/components/panel3-artifacts/QuantumNodeEditor.tsx` for code editing
- `/lib/pyodide-runtime.ts` for Python execution
