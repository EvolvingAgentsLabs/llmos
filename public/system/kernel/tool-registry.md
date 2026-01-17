# Tool Registry

This document defines all available tools in the LLMos environment.

---

## Core Tools

### write-file
Write content to a file path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | Yes | File path relative to project root |
| `content` | string | Yes | Content to write |

**Usage:**
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "projects/demo/output/code/main.py",
    "content": "print('hello world')"
  }
}
```

**Constraints:**
- Path must start with `projects/` or `system/`
- Cannot overwrite kernel files without admin approval
- Maximum file size: 1MB

---

### read-file
Read content from a file path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | Yes | File path to read |

**Usage:**
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "/system/memory_log.md"
  }
}
```

**Returns:**
- File content as string
- Error if file not found

---

### list-directory
List files and directories in a path.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `path` | string | Yes | Directory path to list |

**Usage:**
```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "projects/demo/components/agents"
  }
}
```

**Returns:**
- Array of file/directory names
- File metadata (size, modified date)

---

### execute-python
Execute Python code in browser via Pyodide.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | string | Yes | Python code to execute |
| `projectPath` | string | No | Project path for saving images |

**Usage:**
```tool
{
  "tool": "execute-python",
  "inputs": {
    "code": "import numpy as np\nprint(np.array([1,2,3]))",
    "projectPath": "projects/demo"
  }
}
```

**Returns:**
- `stdout`: Standard output
- `stderr`: Standard error
- `images`: Matplotlib plots as base64
- `savedImages`: Paths to saved visualizations

**Available Libraries:**
- numpy, scipy, matplotlib, pandas
- scikit-learn, networkx, sympy
- statistics, math, random

**NOT Available:**
- tensorflow, pytorch (use scikit-learn)
- opencv (use scipy.ndimage)
- qiskit_aer (use MicroQiskit)

---

## Agent Tools

### discover-subagents
Discover available markdown sub-agents.

**Parameters:** None

**Usage:**
```tool
{
  "tool": "discover-subagents",
  "inputs": {}
}
```

**Returns:**
- List of agents with paths and capabilities
- Usage statistics
- Last used timestamp

---

### invoke-subagent
Execute code following a sub-agent's instructions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agentPath` | string | Yes | Path to agent markdown file |
| `agentName` | string | Yes | Agent name for tracking |
| `task` | string | Yes | Task description |
| `code` | string | Yes | Python code to execute |
| `projectPath` | string | No | Project path for outputs |

**Usage:**
```tool
{
  "tool": "invoke-subagent",
  "inputs": {
    "agentPath": "projects/demo/components/agents/AnalyzerAgent.md",
    "agentName": "AnalyzerAgent",
    "task": "Analyze signal frequency",
    "code": "import numpy as np\n...",
    "projectPath": "projects/demo"
  }
}
```

**Note:** Using `invoke-subagent` instead of `execute-python` tracks agent usage for evolution.

---

### validate-project-agents
Validate that a project meets the 3-agent minimum.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `projectPath` | string | Yes | Project path to validate |
| `userGoal` | string | No | User goal for recommendations |

**Returns:**
- `isValid`: Boolean
- `agentCount`: Number of agents
- `agents`: List with origin (copied/evolved/created)
- `recommendations`: Suggested agents if invalid

---

## UI Tools

### generate-applet
Generate an interactive React applet for the UI.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Applet display name |
| `description` | string | Yes | Brief description |
| `code` | string | Yes | React component code |

**Usage:**
```tool
{
  "tool": "generate-applet",
  "inputs": {
    "name": "Signal Analyzer",
    "description": "Interactive FFT analyzer",
    "code": "function Applet() {\n  const [freq, setFreq] = useState(50);\n  return <div>...</div>;\n}"
  }
}
```

**Code Requirements:**
- Must define `function Applet() {}` (not arrow function)
- Can use React hooks: useState, useEffect, useCallback, useMemo, useRef
- Can use Tailwind CSS classes
- NO import/export statements
- NO TypeScript type annotations

**Self-Healing:**
If compilation fails, the tool returns an error with hints. Retry with fixed code.

---

## Memory Tools

### query-memory
Search system memory for relevant experiences.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `limit` | number | No | Maximum results (default: 3) |
| `minSimilarity` | number | No | Minimum score (default: 0.3) |

**Returns:**
- List of matching memories
- Similarity scores
- Suggested approaches

---

## Hardware Tools (LLMos-Specific)

### quantum-execute
Execute a quantum circuit on the quantum backend.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `circuit` | string | Yes | QASM circuit definition |
| `shots` | number | No | Number of shots (default: 1000) |

**Returns:**
- Measurement results
- State probabilities

---

### esp32-control
Send commands to connected ESP32-S3 microcontroller.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `command` | string | Yes | Command type |
| `pin` | number | No | GPIO pin number |
| `value` | any | No | Value to set |

**Commands:**
- `gpio_write`: Set GPIO output
- `gpio_read`: Read GPIO input
- `pwm_set`: Set PWM duty cycle
- `sensor_read`: Read sensor value

---

## Tool Usage Guidelines

### Best Practices
1. **Read before write** - Always check existing content first
2. **Use invoke-subagent** - For tracked agent execution
3. **Save code to files** - Keep execution artifacts
4. **Generate applets for interactivity** - Use for UIs with controls

### Error Handling
- Check for `isError` in results
- Parse error messages for hints
- Retry with adjusted parameters
- Log failures to memory

### Performance
- Avoid reading large directories (use filters)
- Batch file operations where possible
- Set appropriate timeouts for Python execution
