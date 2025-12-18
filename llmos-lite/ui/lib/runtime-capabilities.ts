/**
 * Runtime Capabilities Manifest
 *
 * Defines what the browser-based Python runtime can actually execute
 * Used to constrain AI code generation to compatible libraries
 */

export interface PackageCapability {
  name: string;
  available: boolean;
  pyodidePackage?: string; // Pyodide package name if different
  limitations?: string[];
  alternatives?: string[];
}

export interface RuntimeCapabilities {
  python: {
    version: string;
    environment: 'browser' | 'server';
  };
  packages: PackageCapability[];
  features: {
    fileSystem: boolean;
    network: boolean;
    multiprocessing: boolean;
    nativeExtensions: boolean;
  };
  constraints: string[];
}

/**
 * Current runtime capabilities (Pyodide v0.29.0 in browser)
 */
export const RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  python: {
    version: '3.13',
    environment: 'browser',
  },
  packages: [
    // ✅ Fully supported scientific packages
    {
      name: 'numpy',
      available: true,
      pyodidePackage: 'numpy',
    },
    {
      name: 'scipy',
      available: true,
      pyodidePackage: 'scipy',
      limitations: [
        'Some advanced optimization functions may be slower',
        'Limited sparse matrix support',
      ],
    },
    {
      name: 'matplotlib',
      available: true,
      pyodidePackage: 'matplotlib',
      limitations: [
        'Agg backend only (no interactive plots)',
        'Output captured automatically as images',
      ],
    },
    {
      name: 'pandas',
      available: true,
      pyodidePackage: 'pandas',
    },
    {
      name: 'scikit-learn',
      available: true,
      pyodidePackage: 'scikit-learn',
    },
    {
      name: 'networkx',
      available: true,
      pyodidePackage: 'networkx',
    },
    {
      name: 'sympy',
      available: true,
      pyodidePackage: 'sympy',
    },

    // ⚠️ Quantum computing - LIMITED support via MicroQiskit
    {
      name: 'qiskit',
      available: true,
      pyodidePackage: 'custom', // We inject MicroQiskit
      limitations: [
        'MicroQiskit - lightweight simulator only',
        'Basic gates: H, X, Y, Z, RX, RY, RZ, CX, CZ',
        'Maximum ~10 qubits (performance degrades)',
        'No hardware backends (Aer, IBMQ)',
        'No advanced optimizations or transpilation',
        'No noise models',
        'QFT circuit available but simplified',
        'QuantumCircuit.draw() not available - use basic visualization',
      ],
      alternatives: [
        'Use simple quantum circuits with basic gates',
        'Avoid qiskit_aer - use built-in simulator',
        'Avoid qiskit.visualization - manually plot with matplotlib',
        'Keep circuit depth shallow (< 20 gates)',
        'Use QuantumRegister and ClassicalRegister as simple wrappers',
      ],
    },

    // ❌ NOT available
    {
      name: 'tensorflow',
      available: false,
      alternatives: ['Use numpy for simple neural networks', 'Use scikit-learn for ML'],
    },
    {
      name: 'pytorch',
      available: false,
      alternatives: ['Use numpy for simple neural networks', 'Use scikit-learn for ML'],
    },
    {
      name: 'opencv',
      available: false,
      alternatives: ['Use Pillow for basic image processing', 'Use scipy.ndimage'],
    },
    {
      name: 'requests',
      available: false,
      alternatives: ['Network access not available in browser sandbox'],
    },
    {
      name: 'qiskit_aer',
      available: false,
      alternatives: ['Use built-in MicroQiskit simulator', 'qiskit.execute() works with basic circuits'],
    },
  ],
  features: {
    fileSystem: false,
    network: false,
    multiprocessing: false,
    nativeExtensions: false,
  },
  constraints: [
    'Execution timeout: 30 seconds maximum',
    'Memory limit: ~2GB (browser dependent)',
    'No file I/O operations',
    'No network requests',
    'No subprocess execution',
    'No system calls',
    'Single-threaded execution only',
  ],
};

/**
 * Get a formatted capability description for AI system prompts
 */
export function getRuntimeCapabilitiesPrompt(): string {
  const available = RUNTIME_CAPABILITIES.packages
    .filter(p => p.available)
    .map(p => {
      let desc = `- ${p.name}`;
      if (p.limitations && p.limitations.length > 0) {
        desc += ` (⚠️ ${p.limitations.join(', ')})`;
      }
      return desc;
    })
    .join('\n');

  const unavailable = RUNTIME_CAPABILITIES.packages
    .filter(p => !p.available)
    .map(p => {
      let desc = `- ${p.name}`;
      if (p.alternatives && p.alternatives.length > 0) {
        desc += ` → Use: ${p.alternatives.join(' OR ')}`;
      }
      return desc;
    })
    .join('\n');

  return `# Python Runtime Environment (Browser-based Pyodide)

## Available Packages:
${available}

## NOT Available (use alternatives):
${unavailable}

## Constraints:
${RUNTIME_CAPABILITIES.constraints.map(c => `- ${c}`).join('\n')}

## Important Notes for Quantum Computing:
- Qiskit is available via MicroQiskit (lightweight simulator)
- DO NOT import from qiskit_aer (use qiskit.execute() directly)
- DO NOT use qiskit.visualization.circuit_drawer (will fail)
- Keep circuits simple (< 10 qubits, < 20 gates)
- Use basic gates only: H, X, Y, Z, RX, RY, RZ, CX, CZ
- Create visualizations manually with matplotlib if needed

## Example of Compatible Quantum Code:
\`\`\`python
from qiskit import QuantumCircuit, execute
from qiskit.circuit.library import QFT
import matplotlib.pyplot as plt

# Simple quantum circuit
qc = QuantumCircuit(3, 3)
qc.h(0)
qc.cx(0, 1)
qc.cx(1, 2)
qc.measure([0, 1, 2], [0, 1, 2])

# Execute (uses MicroQiskit simulator automatically)
result = execute(qc, shots=1024).result()
counts = result.get_counts()

# Visualize with matplotlib (NOT qiskit.visualization)
plt.bar(counts.keys(), counts.values())
plt.xlabel('State')
plt.ylabel('Counts')
plt.title('Measurement Results')
plt.show()
\`\`\`
`;
}

/**
 * Validate code against runtime capabilities
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export function validateCode(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for unavailable packages
  const unavailablePackages = RUNTIME_CAPABILITIES.packages.filter(p => !p.available);
  for (const pkg of unavailablePackages) {
    const importPatterns = [
      new RegExp(`import\\s+${pkg.name}`, 'g'),
      new RegExp(`from\\s+${pkg.name}`, 'g'),
    ];

    for (const pattern of importPatterns) {
      if (pattern.test(code)) {
        errors.push(`Package '${pkg.name}' is not available in browser runtime`);
        if (pkg.alternatives && pkg.alternatives.length > 0) {
          suggestions.push(`Instead of '${pkg.name}': ${pkg.alternatives.join(' OR ')}`);
        }
      }
    }
  }

  // Check for file I/O
  const fileIOPatterns = [
    /open\s*\(/,
    /\.read\(/,
    /\.write\(/,
    /with\s+open/,
  ];
  for (const pattern of fileIOPatterns) {
    if (pattern.test(code)) {
      errors.push('File I/O is not available in browser runtime');
      suggestions.push('Work with in-memory data structures instead of files');
    }
  }

  // Check for network access
  const networkPatterns = [
    /import\s+requests/,
    /import\s+urllib/,
    /import\s+http/,
  ];
  for (const pattern of networkPatterns) {
    if (pattern.test(code)) {
      errors.push('Network access is not available in browser runtime');
      suggestions.push('All data must be provided in-memory');
    }
  }

  // Qiskit-specific warnings
  if (code.includes('qiskit')) {
    // Check for qiskit_aer
    if (code.includes('qiskit_aer') || code.includes('from qiskit_aer')) {
      errors.push("qiskit_aer is not available - use 'from qiskit import execute' instead");
      suggestions.push("Replace 'from qiskit_aer import Aer; backend = Aer.get_backend(...)' with just 'execute(circuit, shots=1024)'");
    }

    // Check for visualization
    if (code.includes('circuit_drawer') || code.includes('qiskit.visualization')) {
      warnings.push('qiskit.visualization is not available');
      suggestions.push('Use matplotlib to create custom visualizations instead');
    }

    // Check for large circuits
    const qubitMatches = code.match(/QuantumCircuit\s*\(\s*(\d+)/);
    if (qubitMatches && parseInt(qubitMatches[1]) > 10) {
      warnings.push(`Circuit has ${qubitMatches[1]} qubits - performance may degrade above 10 qubits`);
      suggestions.push('Consider reducing circuit size for better performance');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Check if a package is available
 */
export function isPackageAvailable(packageName: string): boolean {
  const pkg = RUNTIME_CAPABILITIES.packages.find(p => p.name === packageName);
  return pkg?.available ?? false;
}

/**
 * Get package information
 */
export function getPackageInfo(packageName: string): PackageCapability | undefined {
  return RUNTIME_CAPABILITIES.packages.find(p => p.name === packageName);
}
