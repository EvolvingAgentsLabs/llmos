# LLMunix Integration - SystemAgent Architecture

## Overview

I've integrated the LLMunix pattern into LLMos-Lite with a **minimal working version** that includes:

1. ✅ **SystemAgent** - Master orchestrator that creates projects, executes tasks, and saves outputs
2. ✅ **Virtual File System** - Browser-based file storage using localStorage
3. ✅ **System Tools** - File operations and Python execution
4. ✅ **Project Structure** - Auto-creates organized project directories
5. ✅ **Memory Logging** - Tracks all actions for learning

## Architecture

### Components Created

```
ui/
├── public/system/agents/
│   └── SystemAgent.md         # LLMunix orchestrator definition
├── lib/
│   ├── virtual-fs.ts          # Browser-based file system
│   ├── system-tools.ts        # Tools for file ops & Python
│   ├── system-agent-orchestrator.ts  # Main orchestration logic
│   └── pyodide-runtime.ts     # (Existing) Python execution
└── app/test-system-agent/
    └── page.tsx               # Test interface
```

### How It Works

1. **User provides a goal** (e.g., "Create a sine wave signal and apply FFT")

2. **SystemAgent analyzes** the goal and creates a plan:
   - Determine project name
   - Identify required tasks
   - Create project structure

3. **SystemAgent executes** using tools:
   - `write-file` - Create project directories and save outputs
   - `read-file` - Read existing files
   - `execute-python` - Run Python code in browser

4. **Outputs are organized** in the virtual file system:
   ```
   projects/[project_name]/
   ├── components/agents/  # Agent definitions
   ├── output/
   │   ├── code/          # Generated Python files
   │   ├── visualizations/ # Matplotlib plots
   │   └── data/          # Data files
   └── memory/
       ├── short_term/    # Execution logs
       └── long_term/     # Learnings
   ```

5. **Files persist** in browser localStorage

## Testing the SystemAgent

### 1. Navigate to Test Page

Visit: **http://localhost:3000/test-system-agent**

### 2. Try a Sample Goal

Click one of the sample goals or enter your own:

```
Create a sine wave signal, add noise, then apply FFT to show frequency spectrum
```

### 3. Click "Execute SystemAgent"

The agent will:
- Analyze your goal
- Create project structure (e.g., `projects/signal_fft_analysis/`)
- Generate Python code
- Execute the code
- Save outputs and logs
- Return a summary

### 4. View Results

- **Agent Response**: The SystemAgent's final summary
- **Tool Calls**: List of all tools executed (write-file, execute-python, etc.)
- **Virtual File System**: All files created during execution

### 5. Browse Files

Click "View" next to any file to see its contents:
- `/projects/signal_fft_analysis/memory/short_term/execution_log.md`
- `/projects/signal_fft_analysis/output/code/signal_processing.py`
- etc.

## Key Features

### 1. **Self-Documenting**
Every execution creates logs in `memory/short_term/` with:
- Timestamp
- Actions taken
- Code generated
- Results

### 2. **Organized Output**
All deliverables go to structured directories:
- Code → `output/code/`
- Visualizations → `output/visualizations/`
- Data → `output/data/`

### 3. **WebAssembly Compatible**
SystemAgent knows to use only browser-compatible libraries:
- ✅ numpy, scipy, matplotlib, pandas, scikit-learn
- ❌ NO qiskit_aer, tensorflow, pytorch

### 4. **Tool-Based Architecture**
SystemAgent uses tools explicitly:

```markdown
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/my_project/output/code/analysis.py",
    "content": "import numpy as np\n..."
  }
}
\```
```

## Virtual File System API

### Write File
```typescript
import { getVFS } from '@/lib/virtual-fs';

const vfs = getVFS();
vfs.writeFile('projects/my_project/README.md', '# My Project');
```

### Read File
```typescript
const file = vfs.readFile('projects/my_project/README.md');
console.log(file.content);
```

### List Directory
```typescript
const { files, directories } = vfs.listDirectory('projects/my_project');
```

### Check if Exists
```typescript
if (vfs.exists('projects/my_project/output/data.json')) {
  // File exists
}
```

## Next Steps (To Fully Integrate)

To integrate this into the main chat interface:

1. **Update ChatInterface.tsx**:
   - Import `executeSystemAgent`
   - Replace direct LLM call with SystemAgent orchestration
   - Display file tree results

2. **Update File Tree**:
   - Show VFS files in left panel
   - Allow clicking to view/edit files

3. **Add Canvas Integration**:
   - Display matplotlib images from Python execution
   - Show file contents in right panel

4. **Enhanced Memory**:
   - Consolidate short-term → long-term learnings
   - Reuse successful patterns

## Example Workflow

**User Goal**: "Create a sine wave signal, add noise, then apply FFT"

**SystemAgent Actions**:

1. Creates `projects/signal_fft_analysis/`
2. Writes `.gitkeep` files to create directory structure
3. Generates Python code for signal processing
4. Executes Python (returns matplotlib image as base64)
5. Saves code to `output/code/signal_processing.py`
6. Logs execution to `memory/short_term/execution_log.md`
7. Returns summary with file paths

**User Gets**:
- ✅ Working Python code
- ✅ Visualization (matplotlib plot)
- ✅ Complete execution trace
- ✅ Organized project structure
- ✅ All files saved for future reference

## Benefits vs. Simple Chat

| Simple Chat | LLMunix SystemAgent |
|------------|---------------------|
| Code in chat only | Code saved to files |
| No organization | Structured projects |
| Lost after refresh | Persists in VFS |
| No tracing | Full execution logs |
| One-off responses | Reusable artifacts |

## Try It Now!

1. Make sure dev server is running: `npm run dev`
2. Go to: **http://localhost:3000/test-system-agent**
3. Try the sample goals
4. Check the Virtual File System section to see created files
5. Use "View" to inspect file contents

The SystemAgent is ready to orchestrate complex workflows with full traceability! 🚀
