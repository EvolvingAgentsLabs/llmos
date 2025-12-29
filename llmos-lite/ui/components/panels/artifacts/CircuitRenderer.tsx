'use client';

import React, { useEffect, useRef } from 'react';

export interface QuantumCircuit {
  type: 'quantum-circuit';
  title?: string;
  numQubits: number;
  gates: QuantumGate[];
  measurements?: number[]; // Qubit indices to measure
}

export interface QuantumGate {
  type: 'H' | 'X' | 'Y' | 'Z' | 'CNOT' | 'RX' | 'RY' | 'RZ' | 'SWAP' | 'CZ';
  target: number; // Qubit index
  control?: number; // For two-qubit gates
  parameter?: number; // For rotation gates (in radians)
  time: number; // Time step in circuit
}

interface CircuitRendererProps {
  circuitData: QuantumCircuit;
  width?: number | string;
  height?: number | string;
}

/**
 * CircuitRenderer - Quantum circuit visualization component
 *
 * Features:
 * - SVG-based circuit diagrams
 * - Single-qubit gates (H, X, Y, Z, RX, RY, RZ)
 * - Two-qubit gates (CNOT, SWAP, CZ)
 * - Measurement indicators
 * - Clean terminal-themed styling
 *
 * Used for displaying:
 * - Quantum circuits from Qiskit workflows
 * - VQE ansatz visualizations
 * - Circuit optimization results
 */
export default function CircuitRenderer({
  circuitData,
  width = '100%',
  height = 400,
}: CircuitRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = svgRef.current;
    const container = containerRef.current;

    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Calculate dimensions
    const containerWidth = container.clientWidth;
    const containerHeight = typeof height === 'number' ? height : 400;
    const padding = 40;
    const qubitSpacing = Math.min(60, (containerHeight - 2 * padding) / Math.max(circuitData.numQubits - 1, 1));
    const timeSteps = Math.max(...circuitData.gates.map(g => g.time)) + 1;
    const gateSpacing = Math.min(80, (containerWidth - 2 * padding) / Math.max(timeSteps, 1));

    svg.setAttribute('width', containerWidth.toString());
    svg.setAttribute('height', containerHeight.toString());

    // Draw qubit lines
    for (let i = 0; i < circuitData.numQubits; i++) {
      const y = padding + i * qubitSpacing;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.toString());
      line.setAttribute('y1', y.toString());
      line.setAttribute('x2', (containerWidth - padding).toString());
      line.setAttribute('y2', y.toString());
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);

      // Qubit label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (padding - 20).toString());
      text.setAttribute('y', (y + 5).toString());
      text.setAttribute('fill', '#888');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-family', 'monospace');
      text.textContent = `q${i}`;
      svg.appendChild(text);
    }

    // Draw gates
    circuitData.gates.forEach((gate) => {
      const x = padding + gate.time * gateSpacing;
      const y = padding + gate.target * qubitSpacing;

      if (gate.control !== undefined) {
        // Two-qubit gate
        drawTwoQubitGate(svg, gate, x, padding, qubitSpacing);
      } else {
        // Single-qubit gate
        drawSingleQubitGate(svg, gate, x, y);
      }
    });

    // Draw measurements
    if (circuitData.measurements) {
      const measureTime = timeSteps - 0.5;
      circuitData.measurements.forEach((qubitIdx) => {
        const x = padding + measureTime * gateSpacing;
        const y = padding + qubitIdx * qubitSpacing;
        drawMeasurement(svg, x, y);
      });
    }
  }, [circuitData, height]);

  return (
    <div
      ref={containerRef}
      className="bg-black border border-terminal-border rounded overflow-auto"
      style={{ width, height }}
    >
      {circuitData.title && (
        <div className="bg-terminal-bg border-b border-terminal-border px-4 py-2 sticky top-0 z-10">
          <h3 className="text-terminal-accent-green text-sm font-mono">
            {circuitData.title}
          </h3>
        </div>
      )}
      <div className="p-4">
        <svg ref={svgRef} />
      </div>
    </div>
  );
}

/**
 * Draw single-qubit gate
 */
function drawSingleQubitGate(
  svg: SVGSVGElement,
  gate: QuantumGate,
  x: number,
  y: number
) {
  const boxSize = 30;

  // Gate box
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', (x - boxSize / 2).toString());
  rect.setAttribute('y', (y - boxSize / 2).toString());
  rect.setAttribute('width', boxSize.toString());
  rect.setAttribute('height', boxSize.toString());
  rect.setAttribute('fill', '#000');
  rect.setAttribute('stroke', '#00ff00');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('rx', '4');
  svg.appendChild(rect);

  // Gate label
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', x.toString());
  text.setAttribute('y', (y + 5).toString());
  text.setAttribute('fill', '#00ff00');
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('font-family', 'monospace');
  text.setAttribute('text-anchor', 'middle');

  let label = gate.type;
  if (gate.parameter !== undefined) {
    // Show parameter for rotation gates
    label += `(${(gate.parameter / Math.PI).toFixed(2)}π)`;
  }
  text.textContent = label;
  svg.appendChild(text);
}

/**
 * Draw two-qubit gate (CNOT, SWAP, CZ)
 */
function drawTwoQubitGate(
  svg: SVGSVGElement,
  gate: QuantumGate,
  x: number,
  padding: number,
  qubitSpacing: number
) {
  const controlY = padding + gate.control! * qubitSpacing;
  const targetY = padding + gate.target * qubitSpacing;

  // Control-target line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x.toString());
  line.setAttribute('y1', controlY.toString());
  line.setAttribute('x2', x.toString());
  line.setAttribute('y2', targetY.toString());
  line.setAttribute('stroke', '#00ff00');
  line.setAttribute('stroke-width', '2');
  svg.appendChild(line);

  if (gate.type === 'CNOT') {
    // Control dot
    const controlDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    controlDot.setAttribute('cx', x.toString());
    controlDot.setAttribute('cy', controlY.toString());
    controlDot.setAttribute('r', '5');
    controlDot.setAttribute('fill', '#00ff00');
    svg.appendChild(controlDot);

    // Target circle with plus
    const targetCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    targetCircle.setAttribute('cx', x.toString());
    targetCircle.setAttribute('cy', targetY.toString());
    targetCircle.setAttribute('r', '15');
    targetCircle.setAttribute('fill', 'none');
    targetCircle.setAttribute('stroke', '#00ff00');
    targetCircle.setAttribute('stroke-width', '2');
    svg.appendChild(targetCircle);

    // Plus sign
    const plus1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    plus1.setAttribute('x1', (x - 8).toString());
    plus1.setAttribute('y1', targetY.toString());
    plus1.setAttribute('x2', (x + 8).toString());
    plus1.setAttribute('y2', targetY.toString());
    plus1.setAttribute('stroke', '#00ff00');
    plus1.setAttribute('stroke-width', '2');
    svg.appendChild(plus1);

    const plus2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    plus2.setAttribute('x1', x.toString());
    plus2.setAttribute('y1', (targetY - 8).toString());
    plus2.setAttribute('x2', x.toString());
    plus2.setAttribute('y2', (targetY + 8).toString());
    plus2.setAttribute('stroke', '#00ff00');
    plus2.setAttribute('stroke-width', '2');
    svg.appendChild(plus2);
  } else if (gate.type === 'SWAP') {
    // SWAP gates (X symbols on both qubits)
    [controlY, targetY].forEach((y) => {
      const x1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      x1.setAttribute('x1', (x - 8).toString());
      x1.setAttribute('y1', (y - 8).toString());
      x1.setAttribute('x2', (x + 8).toString());
      x1.setAttribute('y2', (y + 8).toString());
      x1.setAttribute('stroke', '#00ff00');
      x1.setAttribute('stroke-width', '2');
      svg.appendChild(x1);

      const x2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      x2.setAttribute('x1', (x - 8).toString());
      x2.setAttribute('y1', (y + 8).toString());
      x2.setAttribute('x2', (x + 8).toString());
      x2.setAttribute('y2', (y - 8).toString());
      x2.setAttribute('stroke', '#00ff00');
      x2.setAttribute('stroke-width', '2');
      svg.appendChild(x2);
    });
  } else if (gate.type === 'CZ') {
    // CZ gates (control dots on both qubits)
    [controlY, targetY].forEach((y) => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x.toString());
      dot.setAttribute('cy', y.toString());
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', '#00ff00');
      svg.appendChild(dot);
    });
  }
}

/**
 * Draw measurement symbol
 */
function drawMeasurement(svg: SVGSVGElement, x: number, y: number) {
  const boxSize = 30;

  // Measurement box
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', (x - boxSize / 2).toString());
  rect.setAttribute('y', (y - boxSize / 2).toString());
  rect.setAttribute('width', boxSize.toString());
  rect.setAttribute('height', boxSize.toString());
  rect.setAttribute('fill', '#000');
  rect.setAttribute('stroke', '#ff8800');
  rect.setAttribute('stroke-width', '2');
  rect.setAttribute('rx', '4');
  svg.appendChild(rect);

  // Meter arc
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${x - 10} ${y + 5} Q ${x} ${y - 10} ${x + 10} ${y + 5}`);
  path.setAttribute('stroke', '#ff8800');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  svg.appendChild(path);

  // Meter arrow
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  arrow.setAttribute('x1', x.toString());
  arrow.setAttribute('y1', y.toString());
  arrow.setAttribute('x2', (x + 7).toString());
  arrow.setAttribute('y2', (y - 7).toString());
  arrow.setAttribute('stroke', '#ff8800');
  arrow.setAttribute('stroke-width', '2');
  svg.appendChild(arrow);
}

/**
 * Example usage:
 *
 * // Bell state circuit
 * const bellCircuit: QuantumCircuit = {
 *   type: 'quantum-circuit',
 *   title: 'Bell State Preparation',
 *   numQubits: 2,
 *   gates: [
 *     { type: 'H', target: 0, time: 0 },
 *     { type: 'CNOT', target: 1, control: 0, time: 1 },
 *   ],
 *   measurements: [0, 1],
 * };
 *
 * <CircuitRenderer circuitData={bellCircuit} />
 */
