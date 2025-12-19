# Quantum Circuit Skills System

## Overview

A **skill-based quantum circuit designer** that uses markdown files (`.md`) to define executable quantum nodes. Skills are created on-demand from natural language and can be persisted, shared, and reused.

## Architecture

```
Natural Language Input
    ↓
[NLP Parser] → Identifies required node types
    ↓
[Skill Creator] → Generates .md skill files on-demand
    ↓
[ReactFlow Graph] → Visual nodes with embedded skills
    ↓
[Execution Engine] → Runs skill code in Pyodide
    ↓
Results + Visualizations
```

## Skill Format (Markdown + YAML)

Each skill is a `.md` file with YAML frontmatter:

```markdown
---
skill_id: quantum-qft-1234567
name: Quantum Fourier Transform
description: Perform QFT for cardiac echo detection
type: python-wasm
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "circuit", "qft"]
version: 1.0.0
author: ai-generated
estimated_time_ms: 500
memory_mb: 20
inputs:
  - name: signal
    type: ndarray
    description: Input signal to transform
    required: true
  - name: n_qubits
    type: number
    description: Number of qubits
    default: 4
    required: false
outputs:
  - name: spectrum
    type: ndarray
    description: Frequency spectrum from QFT
  - name: circuit
    type: QuantumCircuit
    description: Quantum circuit used
---

# Quantum Fourier Transform

Performs QFT for frequency analysis of cardiac signals.

## Code

\`\`\`python
from qiskit import QuantumCircuit, execute
from qiskit.circuit.library import QFT
import numpy as np

def execute(inputs):
    """Quantum Fourier Transform"""
    signal = inputs['signal']
    n_qubits = int(inputs.get('n_qubits', 4))

    # Create quantum circuit
    qc = QuantumCircuit(n_qubits, n_qubits)

    # Apply QFT
    qft = QFT(n_qubits, do_swaps=True)
    qc.compose(qft, inplace=True)

    # Measure
    qc.measure(range(n_qubits), range(n_qubits))

    # Execute
    result = execute(qc, shots=1024).result()

    return {
        'spectrum': spectrum,
        'circuit': qc
    }
\`\`\`

## Usage

Connect to SignalInput node and downstream processing nodes.
```

## Key Components

### 1. Skill Parser (`/lib/skill-parser.ts`)
- Parses YAML frontmatter
- Extracts code blocks
- Validates skill structure
- Generates skill markdown from metadata

### 2. Skill Creator (`/lib/quantum-skill-creator.ts`)
- Creates skills on-demand from node type
- Generates appropriate code for context (e.g., "cardiac echo detection")
- Returns metadata, code, and full markdown

### 3. NLP Parser (`/lib/quantum-nlp-parser.ts`)
- Parses natural language → intent
- Calls skill creator for each node type
- Returns ReactFlow graph + generated skills

### 4. Circuit Designer (`/components/panel3-artifacts/QuantumCircuitDesigner.tsx`)
- Visual graph editor
- NLP input → circuit generation
- Saves skills to `/volumes/system/skills/`
- Executes workflows

## Usage Flow

### 1. User Enters Natural Language

```
"create a quantum circuit to process a cardiac pressure signal
and detect echoes using two quantum fourier transforms"
```

### 2. System Generates Skills

The NLP parser identifies:
- `SignalInput` → Creates `quantum-signalinput-123.md`
- `QFT` #1 → Creates `quantum-qft-124.md`
- `Cepstrum` → Creates `quantum-cepstrum-125.md`
- `QFT` #2 → Creates `quantum-qft-126.md`
- `EchoDetection` → Creates `quantum-echodetection-127.md`
- `Visualization` → Creates `quantum-visualization-128.md`

Each skill is a complete markdown file with:
- YAML metadata
- Description
- Python code
- Usage notes

### 3. Skills Saved to Filesystem

Skills are saved to:
```
/volumes/system/skills/quantum-signalinput-123.md
/volumes/system/skills/quantum-qft-124.md
/volumes/system/skills/quantum-cepstrum-125.md
...
```

### 4. Visual Graph Created

ReactFlow renders nodes, each linked to its skill:
```
┌──────────────────┐
│  Signal Input    │  ← skill_id: quantum-signalinput-123
│  (skill node)    │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  QFT #1          │  ← skill_id: quantum-qft-124
│  (skill node)    │
└────────┬─────────┘
         │
       ...
```

### 5. User Edits Skill Code

Click any node → Monaco editor opens with skill code
- Edit Python code
- Changes update skill in memory
- Can re-save to filesystem

### 6. Execute Workflow

Click "Run All":
- Each skill's `execute()` function runs in Pyodide
- Outputs passed to downstream nodes
- Results visualized

## Skill Reusability

Skills can be reused across circuits:

```typescript
// Load existing skill
const skillContent = await fetch('/volumes/system/skills/quantum-qft-124.md');
const skill = parseSkillMarkdown(await skillContent.text());

// Use in new circuit
const node = {
  id: 'qft-reused',
  data: {
    code: skill.code,
    inputs: skill.metadata.inputs,
    // ...
  }
};
```

## API Endpoints

### Save Skill

```typescript
POST /api/skills/save
{
  "filename": "quantum-qft-123.md",
  "content": "---\nskill_id: quantum-qft-123\n..."
}
```

### List Skills

```typescript
GET /api/skills
// Returns: ["quantum-vqe-node.md", "quantum-qft-123.md", ...]
```

### Load Skill

```typescript
GET /api/skills/:filename
// Returns: Skill markdown content
```

## Comparison with Anthropic Skills

Inspired by https://github.com/anthropics/skills/:

### Similar:
- ✅ Markdown format with YAML frontmatter
- ✅ `inputs` and `outputs` definitions
- ✅ Code blocks with `execute()` function
- ✅ Reusable, shareable skills

### Enhanced:
- ✅ **Visual graph interface** (ReactFlow)
- ✅ **NLP-driven skill creation** (auto-generate from description)
- ✅ **Monaco code editor** with WebAssembly view
- ✅ **Live execution** in browser (Pyodide)
- ✅ **Quantum circuit focus** (QFT, VQE, cepstrum, etc.)

## Example Workflow

### Input:
```
create a quantum circuit for cardiac echo detection using cepstral analysis
```

### Generated Skills:

**1. quantum-signalinput-001.md**
```markdown
---
skill_id: quantum-signalinput-001
name: Signal Input
description: Load cardiac pressure signal for echo detection
inputs:
  - name: n_samples
    type: number
    default: 64
outputs:
  - name: signal
    type: ndarray
---
# Signal Input
## Code
\`\`\`python
def execute(inputs):
    # Generate cardiac signal
    return {'signal': signal_data}
\`\`\`
```

**2. quantum-cepstrum-002.md**
```markdown
---
skill_id: quantum-cepstrum-002
name: Cepstrum Analysis
description: Classical cepstrum for cardiac echo detection
inputs:
  - name: signal
    type: ndarray
outputs:
  - name: cepstrum
    type: ndarray
  - name: peak_idx
    type: number
---
# Cepstrum Analysis
## Code
\`\`\`python
def execute(inputs):
    # Compute cepstrum
    return {'cepstrum': ceps, 'peak_idx': idx}
\`\`\`
```

### Visual Output:

User sees a graph with connected nodes, each editable and executable.

## Benefits

### For Users:
- **Natural language → working circuit** in seconds
- **Visual programming** (drag-drop, connect)
- **Edit code** in-place with Monaco editor
- **See WebAssembly** representation
- **Debug** step-by-step

### For Developers:
- **Skills are portable** (markdown files)
- **Version control** (git-friendly)
- **Composable** (mix and match)
- **AI-friendly** (can be generated, edited, improved by AI)

### For Collaboration:
- **Share skills** via GitHub/filesystem
- **Library of circuits** (templates)
- **Community contributions** (skill marketplace)

## Advanced Features

### Skill Chaining
```
SignalInput → [QFT → Measurement] → Visualization
                ↓
              [VQE] → EnergyPlot
```

### Conditional Execution
```python
def execute(inputs):
    if inputs.get('mode') == 'quantum':
        # Use QFT
    else:
        # Use classical FFT
```

### Skill Inheritance
```yaml
extends: quantum-qft-base
modifications:
  - Add noise model
  - Increase shots to 2048
```

### Parameterized Skills
```yaml
inputs:
  - name: algorithm
    type: enum
    options: ['VQE', 'QAOA', 'Grover']
```

## Future Enhancements

- [ ] **Skill marketplace** (browse, install skills)
- [ ] **Version control** integration (git commits per skill)
- [ ] **Collaborative editing** (multiple users)
- [ ] **Skill optimization** (AI suggests improvements)
- [ ] **Export to Qiskit/Cirq** native format
- [ ] **Performance profiling** (execution time, memory)
- [ ] **Skill testing framework** (unit tests for skills)
- [ ] **Dependency management** (skill A requires skill B)

## Files Created

```
/lib/skill-parser.ts                    - Parse/generate skill markdown
/lib/quantum-skill-creator.ts           - Create quantum skills on-demand
/lib/quantum-nlp-parser.ts              - NLP → skills (updated)
/components/.../QuantumCircuitDesigner  - Main designer (updated)
/components/.../QuantumNode.tsx         - Visual skill node
/components/.../QuantumNodeEditor.tsx   - Code editor for skills
```

## Running the System

1. **Start the app:**
   ```bash
   cd ui
   npm run dev
   ```

2. **Navigate to:**
   ```
   http://localhost:3000/quantum-designer
   ```

3. **Enter natural language:**
   ```
   create a quantum circuit to process a cardiac pressure signal and detect
   echoes using quantum fourier transform and cepstral analysis
   ```

4. **Click "Generate"**
   - Skills created on-demand
   - Visual graph appears
   - Each node is a skill

5. **Click any node**
   - Edit code in Monaco editor
   - View WebAssembly representation
   - Test run individually

6. **Click "Run All"**
   - Full workflow executes
   - Results visualized

## Comparison: Before vs After

### Before (Static Nodes)
```typescript
const node = {
  id: 'qft-1',
  data: {
    code: `hardcoded code here...`,
  }
};
```

### After (Skill-Based)
```typescript
// Natural language generates skill
const skill = createQuantumSkill({ type: 'QFT', context: 'cardiac' });

// Skill is markdown file
await saveSkill(skill.markdown, 'quantum-qft-123.md');

// Node references skill
const node = {
  id: 'qft-1',
  data: {
    skillId: 'quantum-qft-123',
    code: skill.code, // Extracted from markdown
    skillMarkdown: skill.markdown, // Full source
  }
};
```

## Conclusion

This system combines:
- **Natural language understanding** (NLP parser)
- **AI-powered code generation** (skill creator)
- **Visual programming** (ReactFlow graph)
- **Skill-based architecture** (markdown files with YAML)
- **Browser execution** (Pyodide WASM)

Users describe what they want → System creates skills → Visual graph appears → Click Run → Results displayed

All skills are portable, reusable, and AI-friendly markdown files!
