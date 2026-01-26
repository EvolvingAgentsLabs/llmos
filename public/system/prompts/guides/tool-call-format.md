---
name: ToolCallFormatGuide
type: guide
version: "1.0"
description: Standard format for making tool calls in LLMos
variables: []
evolved_from: null
origin: extracted
extracted_from: lib/system-agent-orchestrator.ts:1078-1089
---

# Tool Call Format Guide

This document describes the standard format for making tool calls in LLMos.

## Basic Format

To use a tool, include this in your response:

```tool
{
  "tool": "tool-id",
  "inputs": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

## Multiple Tool Calls

You can make multiple tool calls in one response by including multiple tool blocks:

```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "user/config.json"
  }
}
```

```tool
{
  "tool": "list-directory",
  "inputs": {
    "path": "user/output"
  }
}
```

## Important Rules

### 1. Use Exact Tool IDs

Tool IDs are lowercase with hyphens:
- `write-file` (not `writeFile` or `write_file`)
- `execute-python` (not `executePython`)
- `generate-applet` (not `generateApplet`)

### 2. Match Parameter Names Exactly

Parameter names are as documented:
- `path` (not `filePath` or `file_path`)
- `content` (not `data` or `text`)
- `code` (not `source` or `script`)

### 3. Provide Required Parameters

Check the tool documentation for required parameters. Missing required parameters will cause errors.

### 4. Use Correct Types

- Strings: `"value"`
- Numbers: `123` (no quotes)
- Booleans: `true` or `false` (no quotes)
- Arrays: `["item1", "item2"]`
- Objects: `{"key": "value"}`

## Common Tool Call Examples

### Write a File
```tool
{
  "tool": "write-file",
  "inputs": {
    "path": "user/output/analysis.py",
    "content": "import numpy as np\n\ndata = np.array([1, 2, 3])\nprint(data.mean())"
  }
}
```

### Read a File
```tool
{
  "tool": "read-file",
  "inputs": {
    "path": "user/data/input.csv"
  }
}
```

### Execute Python
```tool
{
  "tool": "execute-python",
  "inputs": {
    "code": "import matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 10, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(10, 6))\nplt.plot(x, y)\nplt.title('Sine Wave')\nplt.xlabel('x')\nplt.ylabel('sin(x)')\nplt.grid(True)\nplt.show()",
    "workspacePath": "user"
  }
}
```

### Generate Applet
```tool
{
  "tool": "generate-applet",
  "inputs": {
    "name": "Counter",
    "description": "A simple counter applet",
    "code": "function Applet() {\n  const [count, setCount] = useState(0);\n  return (\n    <div className=\"p-6 bg-gray-800 text-white\">\n      <p className=\"text-4xl font-bold\">{count}</p>\n      <button\n        onClick={() => setCount(c => c + 1)}\n        className=\"mt-4 px-4 py-2 bg-blue-600 rounded\"\n      >\n        Increment\n      </button>\n    </div>\n  );\n}"
  }
}
```

### Invoke Sub-Agent
```tool
{
  "tool": "invoke-subagent",
  "inputs": {
    "agentPath": "user/components/agents/DataAnalyzer.md",
    "agentName": "DataAnalyzer",
    "task": "Analyze the frequency spectrum of the signal",
    "code": "import numpy as np\nfrom scipy import signal\n\n# Analysis code here...",
    "workspacePath": "user"
  }
}
```

## Error Handling

If a tool call fails, you'll receive an error message. Common issues:

### Invalid JSON
```
Error: Failed to parse tool call - invalid JSON
```
**Fix:** Check for missing commas, quotes, or brackets.

### Unknown Tool
```
Error: Tool not found: unknownTool
```
**Fix:** Use the correct tool ID from the available tools list.

### Missing Required Parameter
```
Error: Required input missing: path
```
**Fix:** Add the missing parameter to your inputs.

### Invalid Parameter Type
```
Error: Expected string for path, got number
```
**Fix:** Ensure parameter types match the expected types.

## Best Practices

1. **One action per tool call** - Don't try to do multiple things in one call
2. **Check results** - Read tool output before making dependent calls
3. **Handle errors** - If a tool fails, fix the issue and retry
4. **Use invoke-subagent** - Track agent usage for evolution
5. **Save intermediate results** - Write outputs to files for reference
