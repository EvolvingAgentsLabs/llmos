---
name: PythonRuntimeConstraints
type: runtime
version: "1.0"
description: Constraints for Python code execution in browser via Pyodide
variables: []
evolved_from: null
origin: extracted
extracted_from: lib/agent-executor.ts:286-300
---

# Python Runtime Environment Constraints

When generating Python code, you MUST respect these browser runtime limitations.

## Available Packages

The following packages are available in the Pyodide runtime:

### Data Science
- `numpy` - Numerical computing
- `scipy` - Scientific computing
- `pandas` - Data manipulation
- `matplotlib` - Plotting and visualization

### Machine Learning
- `scikit-learn` - Machine learning algorithms
- `networkx` - Graph/network analysis
- `sympy` - Symbolic mathematics

### Standard Library
- `math` - Mathematical functions
- `statistics` - Statistical functions
- `random` - Random number generation
- `json` - JSON parsing
- `re` - Regular expressions
- `collections` - Container datatypes
- `itertools` - Iterator tools
- `functools` - Higher-order functions

## NOT Available

The following are NOT available in the browser runtime:

### Deep Learning
- `tensorflow` - Use scikit-learn instead
- `pytorch` / `torch` - Use scikit-learn instead
- `keras` - Use scikit-learn instead

### Computer Vision
- `opencv` / `cv2` - Use scipy.ndimage instead
- `PIL` / `Pillow` - Limited support, use matplotlib

### Networking
- `requests` - No network access
- `urllib` - No network access
- `socket` - No socket access

### File System
- Direct file I/O - Use VFS tools instead
- `os.path` operations on local filesystem

### Quantum Computing
- `qiskit_aer` - Use MicroQiskit instead
- Full Qiskit - Only basic circuit building available

## Code Guidelines

### Do:
```python
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression

# Use numpy for numerical operations
data = np.array([1, 2, 3, 4, 5])
result = np.mean(data)
```

### Don't:
```python
import tensorflow as tf  # NOT AVAILABLE
import cv2  # NOT AVAILABLE
import requests  # NOT AVAILABLE

with open('file.txt', 'w') as f:  # Use VFS instead
    f.write('data')
```

## Memory Limits

- Maximum execution time: 30 seconds
- Maximum memory: ~256MB
- Large arrays may cause issues
- Avoid loading large datasets in memory

## Visualization

Matplotlib is the primary visualization library:

```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot([1, 2, 3], [1, 4, 9])
ax.set_title('Example Plot')
plt.tight_layout()
plt.show()  # Returns base64 image
```

Generated plots are returned as base64-encoded PNG images.
