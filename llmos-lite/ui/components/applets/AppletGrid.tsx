'use client';

/**
 * AppletGrid - Desktop-style applet display
 *
 * Shows applets as:
 * - Icon cards in a grid (like macOS Launchpad or Windows Start)
 * - Click to open/expand an applet
 * - Full view mode for running applets
 * - JARVIS avatar when empty
 */

import React, { useState } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import { AppletViewer } from './AppletViewer';
import { ActiveApplet } from '@/lib/applets/applet-store';
import {
  Code2, Play, X, Sparkles, Grid3X3, Maximize2, Minimize2,
  Calculator, FileText, Clock, Palette, Zap, Box,
  Atom, Workflow, Boxes, CircuitBoard
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy load 3D avatar to avoid SSR issues
const JarvisAvatar = dynamic(
  () => import('@/components/system/JarvisAvatar'),
  { ssr: false }
);

// ============================================================================
// APPLET ICON CARD - Desktop icon style
// ============================================================================

interface AppletIconCardProps {
  applet: ActiveApplet;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  isActive: boolean;
}

function AppletIconCard({ applet, onClick, onClose, isActive }: AppletIconCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get icon based on applet name/type
  const getAppletIcon = () => {
    const name = applet.metadata.name.toLowerCase();
    if (name.includes('calc')) return <Calculator className="w-8 h-8" />;
    if (name.includes('timer') || name.includes('clock')) return <Clock className="w-8 h-8" />;
    if (name.includes('color') || name.includes('palette')) return <Palette className="w-8 h-8" />;
    if (name.includes('note') || name.includes('text') || name.includes('doc')) return <FileText className="w-8 h-8" />;
    if (name.includes('quantum') || name.includes('circuit')) return <Zap className="w-8 h-8" />;
    if (name.includes('3d') || name.includes('cube')) return <Box className="w-8 h-8" />;
    return <Sparkles className="w-8 h-8" />;
  };

  return (
    <div
      className={`relative group cursor-pointer transition-all duration-200
                 ${isActive ? 'scale-105' : 'hover:scale-105'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Icon Container */}
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center
                      transition-all duration-200
                      ${isActive
                        ? 'bg-accent-primary/30 ring-2 ring-accent-primary shadow-lg shadow-accent-primary/20'
                        : 'bg-white/10 hover:bg-white/20 border border-white/10'
                      }`}>
        <div className={`${isActive ? 'text-accent-primary' : 'text-fg-secondary group-hover:text-fg-primary'}`}>
          {getAppletIcon()}
        </div>
      </div>

      {/* Close button on hover */}
      {isHovered && (
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                   bg-red-500/80 hover:bg-red-500
                   flex items-center justify-center
                   text-white shadow-lg
                   transition-all duration-150
                   animate-scale-in"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Label */}
      <p className="mt-2 text-[10px] text-center text-fg-secondary
                   truncate w-20 group-hover:text-fg-primary">
        {applet.metadata.name}
      </p>

      {/* Running indicator */}
      {isActive && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2
                       w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
      )}
    </div>
  );
}

// ============================================================================
// FULL APPLET VIEW - Expanded applet with flip card
// ============================================================================

interface FullAppletViewProps {
  applet: ActiveApplet;
  onClose: () => void;
  onMinimize: () => void;
  onSubmit: (data: unknown) => void;
  onSave: (state: Record<string, unknown>) => void;
}

function FullAppletView({ applet, onClose, onMinimize, onSubmit, onSave }: FullAppletViewProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3
                     border-b border-white/10 bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="font-medium text-fg-primary">
            {applet.metadata.name}
          </span>
          {applet.metadata.version && (
            <span className="text-[10px] text-fg-muted px-1.5 py-0.5 rounded bg-white/5">
              v{applet.metadata.version}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode(!showCode)}
            className={`p-1.5 rounded-lg transition-colors ${
              showCode
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-fg-muted hover:text-fg-primary hover:bg-white/10'
            }`}
            title={showCode ? 'View UI' : 'View Code'}
          >
            {showCode ? <Play className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                      hover:bg-white/10 transition-colors"
            title="Back to Grid"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-red-400
                      hover:bg-red-500/10 transition-colors"
            title="Close Applet"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto p-4 bg-bg-primary/50">
            <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap">
              <code>{applet.code}</code>
            </pre>
          </div>
        ) : (
          <AppletViewer
            code={applet.code}
            metadata={applet.metadata}
            initialState={applet.state}
            onSubmit={onSubmit}
            onClose={onClose}
            onSave={onSave}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SYSTEM APPLET DEFINITIONS - Pre-built applets for Quick Create
// ============================================================================

const SYSTEM_APPLETS = {
  calculator: {
    name: 'Calculator',
    description: 'A simple calculator for quick math',
    code: `function Component({ onSubmit }) {
  const [display, setDisplay] = useState('0');
  const [firstNum, setFirstNum] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForSecond, setWaitingForSecond] = useState(false);

  const handleNumber = (num) => {
    if (waitingForSecond) {
      setDisplay(String(num));
      setWaitingForSecond(false);
    } else {
      setDisplay(display === '0' ? String(num) : display + num);
    }
  };

  const handleOperator = (op) => {
    setFirstNum(parseFloat(display));
    setOperator(op);
    setWaitingForSecond(true);
  };

  const calculate = () => {
    if (firstNum === null || operator === null) return;
    const second = parseFloat(display);
    let result;
    switch (operator) {
      case '+': result = firstNum + second; break;
      case '-': result = firstNum - second; break;
      case '*': result = firstNum * second; break;
      case '/': result = second !== 0 ? firstNum / second : 'Error'; break;
      default: return;
    }
    setDisplay(String(result));
    setFirstNum(null);
    setOperator(null);
  };

  const clear = () => {
    setDisplay('0');
    setFirstNum(null);
    setOperator(null);
    setWaitingForSecond(false);
  };

  const buttons = [
    ['C', '±', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '=']
  ];

  return (
    <div className="p-4 max-w-xs mx-auto">
      <div className="bg-gray-800 p-4 rounded-lg mb-4">
        <div className="text-right text-3xl font-mono text-white truncate">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {buttons.flat().map((btn, i) => (
          <button
            key={i}
            onClick={() => {
              if (btn === 'C') clear();
              else if (btn === '=') calculate();
              else if (['+', '-', '*', '/'].includes(btn)) handleOperator(btn);
              else if (btn === '±') setDisplay(String(-parseFloat(display)));
              else if (btn === '%') setDisplay(String(parseFloat(display) / 100));
              else handleNumber(btn);
            }}
            className={\`p-4 text-xl font-medium rounded-lg transition-colors \${
              btn === '0' ? 'col-span-2' : ''
            } \${
              ['+', '-', '*', '/', '='].includes(btn)
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : btn === 'C' ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }\`}
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
}`,
  },
  timer: {
    name: 'Timer',
    description: 'A countdown timer and stopwatch',
    code: `function Component({ onSubmit }) {
  const [mode, setMode] = useState('stopwatch');
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [countdownInput, setCountdownInput] = useState(60);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(t => {
          if (mode === 'countdown' && t <= 0) {
            setIsRunning(false);
            return 0;
          }
          return mode === 'stopwatch' ? t + 1 : t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, mode]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return \`\${h.toString().padStart(2, '0')}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
  };

  const reset = () => {
    setIsRunning(false);
    setTime(mode === 'countdown' ? countdownInput : 0);
  };

  return (
    <div className="p-6 text-center">
      <div className="flex justify-center gap-4 mb-6">
        <button
          onClick={() => { setMode('stopwatch'); setTime(0); setIsRunning(false); }}
          className={\`px-4 py-2 rounded-lg transition-colors \${mode === 'stopwatch' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}\`}
        >⏱️ Stopwatch</button>
        <button
          onClick={() => { setMode('countdown'); setTime(countdownInput); setIsRunning(false); }}
          className={\`px-4 py-2 rounded-lg transition-colors \${mode === 'countdown' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}\`}
        >⏳ Countdown</button>
      </div>

      <div className="text-6xl font-mono text-white mb-8 bg-gray-800 rounded-xl py-8">
        {formatTime(time)}
      </div>

      {mode === 'countdown' && !isRunning && (
        <div className="mb-6">
          <label className="text-sm text-gray-400 block mb-2">Set seconds:</label>
          <input
            type="number"
            value={countdownInput}
            onChange={(e) => { setCountdownInput(Number(e.target.value)); setTime(Number(e.target.value)); }}
            className="w-32 p-2 text-center bg-gray-700 border border-gray-600 rounded text-white"
          />
        </div>
      )}

      <div className="flex justify-center gap-4">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={\`px-8 py-3 rounded-lg font-medium transition-colors \${isRunning ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white\`}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Start'}
        </button>
        <button onClick={reset} className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white">
          🔄 Reset
        </button>
      </div>
    </div>
  );
}`,
  },
  colorPicker: {
    name: 'Color Picker',
    description: 'Pick and preview colors with hex/rgb values',
    code: `function Component({ onSubmit }) {
  const [color, setColor] = useState('#3B82F6');
  const [copied, setCopied] = useState('');

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  const rgb = hexToRgb(color);
  const rgbString = \`rgb(\${rgb.r}, \${rgb.g}, \${rgb.b})\`;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hslString = \`hsl(\${hsl.h}, \${hsl.s}%, \${hsl.l}%)\`;

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  const copyToClipboard = async (value, type) => {
    await navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="w-full h-32 rounded-xl shadow-lg" style={{ backgroundColor: color }} />
      </div>

      <div className="mb-6">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full h-12 cursor-pointer rounded-lg"
        />
      </div>

      <div className="space-y-3">
        {[
          { label: 'HEX', value: color.toUpperCase(), type: 'hex' },
          { label: 'RGB', value: rgbString, type: 'rgb' },
          { label: 'HSL', value: hslString, type: 'hsl' },
        ].map(({ label, value, type }) => (
          <div key={type} className="flex items-center gap-2">
            <span className="w-12 text-sm text-gray-400">{label}</span>
            <code className="flex-1 px-3 py-2 bg-gray-800 rounded font-mono text-sm text-white">{value}</code>
            <button
              onClick={() => copyToClipboard(value, type)}
              className={\`px-3 py-2 rounded transition-colors \${copied === type ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}\`}
            >
              {copied === type ? '✓' : '📋'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}`,
  },
  notes: {
    name: 'Quick Notes',
    description: 'A simple notepad for quick notes',
    code: `function Component({ onSubmit, onSave, initialState }) {
  const [notes, setNotes] = useState(initialState?.notes || []);
  const [currentNote, setCurrentNote] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    onSave?.({ notes });
  }, [notes, onSave]);

  const addNote = () => {
    if (!currentNote.trim()) return;
    const newNote = {
      id: Date.now(),
      text: currentNote.trim(),
      createdAt: new Date().toISOString(),
    };
    setNotes([newNote, ...notes]);
    setCurrentNote('');
  };

  const deleteNote = (id) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const updateNote = (id, text) => {
    setNotes(notes.map(n => n.id === id ? { ...n, text } : n));
    setEditingId(null);
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={currentNote}
          onChange={(e) => setCurrentNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
          placeholder="Write a note..."
          className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={addNote}
          disabled={!currentNote.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {notes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-2">📝</div>
            <p>No notes yet. Start typing above!</p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="group p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
            >
              {editingId === note.id ? (
                <input
                  type="text"
                  defaultValue={note.text}
                  onBlur={(e) => updateNote(note.id, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && updateNote(note.id, e.target.value)}
                  autoFocus
                  className="w-full p-1 bg-gray-700 border border-gray-600 rounded text-white"
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-gray-200 flex-1">{note.text}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingId(note.id)}
                      className="p-1 text-gray-400 hover:text-blue-400"
                    >✏️</button>
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 text-gray-400 hover:text-red-400"
                    >🗑️</button>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}`,
  },
  // ============================================================================
  // QUANTUM COMPUTING APPLETS
  // ============================================================================
  quantumCircuit: {
    name: 'Quantum Circuit',
    description: 'Design and visualize quantum circuits',
    category: 'quantum',
    code: `function Component({ onSubmit }) {
  const [qubits, setQubits] = useState(3);
  const [gates, setGates] = useState([]);
  const [selectedGate, setSelectedGate] = useState('H');

  const gateTypes = [
    { name: 'H', label: 'Hadamard', color: 'bg-blue-500' },
    { name: 'X', label: 'Pauli-X', color: 'bg-red-500' },
    { name: 'Y', label: 'Pauli-Y', color: 'bg-green-500' },
    { name: 'Z', label: 'Pauli-Z', color: 'bg-purple-500' },
    { name: 'CNOT', label: 'CNOT', color: 'bg-orange-500' },
    { name: 'T', label: 'T Gate', color: 'bg-pink-500' },
  ];

  const addGate = (qubit, step) => {
    setGates([...gates, { type: selectedGate, qubit, step, id: Date.now() }]);
  };

  const removeGate = (id) => {
    setGates(gates.filter(g => g.id !== id));
  };

  const steps = Math.max(5, ...gates.map(g => g.step + 1));

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Quantum Circuit Designer</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Qubits:</label>
          <input
            type="number"
            min="1"
            max="8"
            value={qubits}
            onChange={(e) => setQubits(Math.max(1, Math.min(8, Number(e.target.value))))}
            className="w-16 p-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
          />
        </div>
      </div>

      {/* Gate Palette */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {gateTypes.map(gate => (
          <button
            key={gate.name}
            onClick={() => setSelectedGate(gate.name)}
            className={\`px-3 py-1.5 rounded-lg text-xs font-medium transition-all \${
              selectedGate === gate.name
                ? \`\${gate.color} text-white ring-2 ring-white/50\`
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }\`}
          >
            {gate.name}
          </button>
        ))}
      </div>

      {/* Circuit Grid */}
      <div className="flex-1 overflow-auto bg-gray-900/50 rounded-lg p-4">
        <div className="min-w-[400px]">
          {Array.from({ length: qubits }).map((_, qubit) => (
            <div key={qubit} className="flex items-center h-12 border-b border-gray-700/50">
              <div className="w-12 text-sm text-gray-400 font-mono">q[{qubit}]</div>
              <div className="flex-1 flex items-center relative">
                {/* Qubit line */}
                <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-gray-600" />
                {/* Steps */}
                {Array.from({ length: steps }).map((_, step) => {
                  const gate = gates.find(g => g.qubit === qubit && g.step === step);
                  const gateConfig = gate ? gateTypes.find(t => t.name === gate.type) : null;
                  return (
                    <div
                      key={step}
                      onClick={() => gate ? removeGate(gate.id) : addGate(qubit, step)}
                      className="w-12 h-10 flex items-center justify-center cursor-pointer relative z-10"
                    >
                      {gate ? (
                        <div className={\`w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white \${gateConfig?.color || 'bg-gray-500'}\`}>
                          {gate.type}
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded border-2 border-dashed border-gray-600 hover:border-blue-400 transition-colors" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => onSubmit({ qubits, gates })}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Export Circuit
        </button>
      </div>
    </div>
  );
}`,
  },
  // ============================================================================
  // 3D VISUALIZATION APPLETS
  // ============================================================================
  scene3D: {
    name: '3D Scene',
    description: 'Create and animate 3D objects',
    category: '3d',
    code: `function Component({ onSubmit }) {
  const [objects, setObjects] = useState([
    { id: 1, type: 'cube', x: 0, y: 0, z: 0, color: '#3B82F6', size: 1 }
  ]);
  const [selectedId, setSelectedId] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(r => (r + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const selected = objects.find(o => o.id === selectedId);

  const addObject = (type) => {
    const newObj = {
      id: Date.now(),
      type,
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: 0,
      color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][Math.floor(Math.random() * 5)],
      size: 0.5 + Math.random() * 0.5
    };
    setObjects([...objects, newObj]);
    setSelectedId(newObj.id);
  };

  const updateSelected = (prop, value) => {
    setObjects(objects.map(o => o.id === selectedId ? { ...o, [prop]: value } : o));
  };

  const deleteSelected = () => {
    if (objects.length > 1) {
      setObjects(objects.filter(o => o.id !== selectedId));
      setSelectedId(objects.find(o => o.id !== selectedId)?.id || null);
    }
  };

  return (
    <div className="p-4 h-full flex gap-4">
      {/* 3D Canvas (CSS 3D simulation) */}
      <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden relative" style={{ perspective: '800px' }}>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transformStyle: 'preserve-3d', transform: \`rotateY(\${rotation}deg)\` }}
        >
          {objects.map(obj => (
            <div
              key={obj.id}
              onClick={() => setSelectedId(obj.id)}
              className={\`absolute cursor-pointer transition-all \${selectedId === obj.id ? 'ring-2 ring-white' : ''}\`}
              style={{
                width: \`\${obj.size * 60}px\`,
                height: \`\${obj.size * 60}px\`,
                backgroundColor: obj.color,
                borderRadius: obj.type === 'sphere' ? '50%' : obj.type === 'cylinder' ? '20%' : '0',
                transform: \`translate3d(\${obj.x * 100}px, \${obj.y * 100}px, \${obj.z * 100}px)\`,
                boxShadow: \`0 0 20px \${obj.color}40\`
              }}
            />
          ))}
        </div>
        {/* Grid floor */}
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-gray-800/50 to-transparent" />
      </div>

      {/* Controls Panel */}
      <div className="w-64 flex flex-col gap-4">
        {/* Add Objects */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Add Object</h3>
          <div className="flex gap-2">
            {['cube', 'sphere', 'cylinder'].map(type => (
              <button
                key={type}
                onClick={() => addObject(type)}
                className="flex-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white capitalize"
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Object Properties */}
        {selected && (
          <div className="bg-gray-800 rounded-lg p-3 flex-1">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Properties</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Color</label>
                <input
                  type="color"
                  value={selected.color}
                  onChange={(e) => updateSelected('color', e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
              {['x', 'y', 'z'].map(axis => (
                <div key={axis}>
                  <label className="text-xs text-gray-500 uppercase">{axis}</label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={selected[axis]}
                    onChange={(e) => updateSelected(axis, parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500">Size</label>
                <input
                  type="range"
                  min="0.2"
                  max="2"
                  step="0.1"
                  value={selected.size}
                  onChange={(e) => updateSelected('size', parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                onClick={deleteSelected}
                className="w-full px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
              >
                Delete Object
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => onSubmit({ objects })}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Export Scene
        </button>
      </div>
    </div>
  );
}`,
  },
  // ============================================================================
  // WORKFLOW/AUTOMATION APPLETS
  // ============================================================================
  workflowBuilder: {
    name: 'Workflow Builder',
    description: 'Create visual automation workflows',
    category: 'automation',
    code: `function Component({ onSubmit }) {
  const [nodes, setNodes] = useState([
    { id: 1, type: 'start', x: 50, y: 100, label: 'Start' },
    { id: 2, type: 'action', x: 200, y: 100, label: 'Process' },
    { id: 3, type: 'end', x: 350, y: 100, label: 'End' },
  ]);
  const [connections, setConnections] = useState([
    { from: 1, to: 2 },
    { from: 2, to: 3 },
  ]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [dragging, setDragging] = useState(null);

  const nodeTypes = {
    start: { color: 'bg-green-500', shape: 'rounded-full' },
    action: { color: 'bg-blue-500', shape: 'rounded-lg' },
    condition: { color: 'bg-yellow-500', shape: 'rotate-45' },
    end: { color: 'bg-red-500', shape: 'rounded-full' },
  };

  const addNode = (type) => {
    const newNode = {
      id: Date.now(),
      type,
      x: 100 + Math.random() * 200,
      y: 50 + Math.random() * 150,
      label: type.charAt(0).toUpperCase() + type.slice(1),
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(newNode.id);
  };

  const handleDrag = (e, nodeId) => {
    if (!dragging) return;
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    setNodes(nodes.map(n => n.id === nodeId ? {
      ...n,
      x: Math.max(0, Math.min(e.clientX - rect.left - 40, 400)),
      y: Math.max(0, Math.min(e.clientY - rect.top - 20, 200)),
    } : n));
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Workflow Builder</h2>
        <div className="flex gap-2">
          {Object.keys(nodeTypes).map(type => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white capitalize"
            >
              + {type}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-gray-900/50 rounded-xl relative overflow-hidden">
        {/* Grid */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />

        {/* Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map((conn, i) => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;
            return (
              <line
                key={i}
                x1={fromNode.x + 40}
                y1={fromNode.y + 20}
                x2={toNode.x + 40}
                y2={toNode.y + 20}
                stroke="#4B5563"
                strokeWidth="2"
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="#4B5563" />
            </marker>
          </defs>
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const config = nodeTypes[node.type];
          return (
            <div
              key={node.id}
              onClick={() => setSelectedNode(node.id)}
              onMouseDown={() => setDragging(node.id)}
              onMouseUp={() => setDragging(null)}
              onMouseMove={(e) => handleDrag(e, node.id)}
              onMouseLeave={() => setDragging(null)}
              className={\`absolute w-20 h-10 flex items-center justify-center cursor-move
                         \${config.color} \${config.shape} text-white text-xs font-medium
                         \${selectedNode === node.id ? 'ring-2 ring-white' : ''}\`}
              style={{ left: node.x, top: node.y }}
            >
              <span className={node.type === 'condition' ? '-rotate-45' : ''}>{node.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-between">
        <span className="text-xs text-gray-500">{nodes.length} nodes, {connections.length} connections</span>
        <button
          onClick={() => onSubmit({ nodes, connections })}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Export Workflow
        </button>
      </div>
    </div>
  );
}`,
  },
};

// Applet categories for organized display
const APPLET_CATEGORIES = {
  utilities: {
    label: 'Utilities',
    icon: 'Calculator',
    applets: ['calculator', 'timer', 'colorPicker', 'notes'],
  },
  quantum: {
    label: 'Quantum',
    icon: 'Atom',
    applets: ['quantumCircuit'],
  },
  visualization: {
    label: '3D & Visual',
    icon: 'Box',
    applets: ['scene3D'],
  },
  automation: {
    label: 'Automation',
    icon: 'Workflow',
    applets: ['workflowBuilder'],
  },
};

// ============================================================================
// EMPTY STATE - Desktop with JARVIS
// ============================================================================

interface EmptyDesktopProps {
  customMessage?: string;
  onLaunchApplet?: (type: keyof typeof SYSTEM_APPLETS) => void;
  recentApplets?: { id: string; name: string; description?: string }[];
  onOpenRecent?: (id: string) => void;
}

function EmptyDesktop({ customMessage, onLaunchApplet, recentApplets = [], onOpenRecent }: EmptyDesktopProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // All system applets organized by category
  const appletCategories = [
    {
      id: 'utilities',
      label: 'Utilities',
      icon: <Calculator className="w-4 h-4" />,
      color: 'from-blue-500 to-cyan-500',
      applets: [
        { icon: <Calculator className="w-5 h-5" />, label: 'Calculator', type: 'calculator' as const },
        { icon: <Clock className="w-5 h-5" />, label: 'Timer', type: 'timer' as const },
        { icon: <Palette className="w-5 h-5" />, label: 'Color Picker', type: 'colorPicker' as const },
        { icon: <FileText className="w-5 h-5" />, label: 'Notes', type: 'notes' as const },
      ],
    },
    {
      id: 'quantum',
      label: 'Quantum',
      icon: <Atom className="w-4 h-4" />,
      color: 'from-purple-500 to-pink-500',
      applets: [
        { icon: <CircuitBoard className="w-5 h-5" />, label: 'Quantum Circuit', type: 'quantumCircuit' as const },
      ],
    },
    {
      id: 'visualization',
      label: '3D & Visual',
      icon: <Boxes className="w-4 h-4" />,
      color: 'from-green-500 to-emerald-500',
      applets: [
        { icon: <Box className="w-5 h-5" />, label: '3D Scene', type: 'scene3D' as const },
      ],
    },
    {
      id: 'automation',
      label: 'Automation',
      icon: <Workflow className="w-4 h-4" />,
      color: 'from-orange-500 to-amber-500',
      applets: [
        { icon: <Workflow className="w-5 h-5" />, label: 'Workflow', type: 'workflowBuilder' as const },
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* JARVIS Avatar - Main presence */}
      <div className="flex-1 min-h-[180px] relative">
        <JarvisAvatar showLabel={false} />

        {/* Floating suggestion bubble */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2
                       px-4 py-2 rounded-xl
                       bg-bg-elevated/80 backdrop-blur-xl
                       border border-white/10 shadow-lg">
          <p className="text-sm text-fg-secondary text-center">
            {customMessage || 'Ask me to build anything - or launch a system app below!'}
          </p>
        </div>
      </div>

      {/* Bottom Section - System Apps & Recent */}
      <div className="flex-shrink-0 bg-gradient-to-t from-bg-primary via-bg-primary/80 to-transparent pb-4">
        {/* Category Pills */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex justify-center gap-2 flex-wrap">
            {appletCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
                           transition-all duration-200 ${
                  activeCategory === cat.id
                    ? `bg-gradient-to-r ${cat.color} text-white shadow-lg`
                    : 'bg-white/5 text-fg-secondary hover:bg-white/10 border border-white/10'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Applet Grid - Show active category or all */}
        <div className="px-6 pb-2">
          <div className="flex justify-center gap-3 flex-wrap">
            {(activeCategory
              ? appletCategories.find(c => c.id === activeCategory)?.applets || []
              : appletCategories.flatMap(c => c.applets.slice(0, 1)) // Show first from each category
            ).map((item) => (
              <button
                key={item.label}
                onClick={() => onLaunchApplet?.(item.type)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl
                          bg-white/5 border border-white/10
                          hover:bg-white/10 hover:border-accent-primary/30
                          transition-all duration-200 group
                          hover:scale-105 active:scale-95 min-w-[70px]"
              >
                <div className="text-fg-muted group-hover:text-accent-primary transition-colors">
                  {item.icon}
                </div>
                <span className="text-[10px] text-fg-tertiary group-hover:text-fg-secondary text-center">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent User/Team Applets */}
        {recentApplets.length > 0 && (
          <div className="px-6 pb-4 pt-2 border-t border-white/5 mt-2">
            <p className="text-[10px] text-fg-muted uppercase tracking-wider mb-3 text-center">
              Recent Applets
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {recentApplets.slice(0, 6).map((applet) => (
                <button
                  key={applet.id}
                  onClick={() => onOpenRecent?.(applet.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg
                            bg-white/5 border border-white/10
                            hover:bg-accent-primary/10 hover:border-accent-primary/30
                            transition-all duration-200 group"
                >
                  <Sparkles className="w-4 h-4 text-accent-primary" />
                  <span className="text-xs text-fg-secondary group-hover:text-fg-primary truncate max-w-[120px]">
                    {applet.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DESKTOP GRID VIEW - Multiple applet icons
// ============================================================================

interface DesktopGridProps {
  applets: ActiveApplet[];
  currentAppletId: string | null;
  onAppletClick: (id: string) => void;
  onAppletClose: (id: string) => void;
}

function DesktopGrid({ applets, currentAppletId, onAppletClick, onAppletClose }: DesktopGridProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Grid Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-bg-secondary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-fg-muted" />
            <span className="text-xs font-medium text-fg-secondary">
              Active Applets
            </span>
            <span className="px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-[10px]">
              {applets.length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of applet icons */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-6 justify-items-center">
          {applets.map((applet) => (
            <AppletIconCard
              key={applet.id}
              applet={applet}
              isActive={applet.id === currentAppletId}
              onClick={() => onAppletClick(applet.id)}
              onClose={(e) => {
                e.stopPropagation();
                onAppletClose(applet.id);
              }}
            />
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="p-4 border-t border-white/10 bg-bg-secondary/30">
        <p className="text-[10px] text-fg-muted text-center">
          Click an applet to open • Ask JARVIS to create more
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APPLET GRID COMPONENT
// ============================================================================

type ViewMode = 'grid' | 'full';

interface AppletGridProps {
  className?: string;
  showEmptyState?: boolean;
  emptyMessage?: string;
}

export default function AppletGrid({ className = '', showEmptyState = false, emptyMessage }: AppletGridProps) {
  const {
    activeApplets,
    currentApplet,
    closeApplet,
    focusApplet,
    handleAppletSubmit,
    updateAppletState,
    closeAllApplets,
    createApplet,
    recentApplets,
  } = useApplets();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedAppletId, setSelectedAppletId] = useState<string | null>(null);

  // Get the applet to display in full view
  const fullViewApplet = selectedAppletId
    ? activeApplets.find(a => a.id === selectedAppletId)
    : currentApplet;

  // Launch a system applet from Quick Create buttons
  const handleLaunchSystemApplet = (type: keyof typeof SYSTEM_APPLETS) => {
    const appletDef = SYSTEM_APPLETS[type];
    if (!appletDef) return;

    const applet = createApplet({
      code: appletDef.code,
      metadata: {
        id: `system-${type}-${Date.now()}`,
        name: appletDef.name,
        description: appletDef.description,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['system', type],
      },
      volume: 'system',
    });

    // Immediately switch to full view for the new applet
    setSelectedAppletId(applet.id);
    setViewMode('full');
  };

  const handleAppletClick = (id: string) => {
    focusApplet(id);
    setSelectedAppletId(id);
    setViewMode('full');
  };

  const handleMinimize = () => {
    setViewMode('grid');
    setSelectedAppletId(null);
  };

  const handleSubmit = (appletId: string) => (data: unknown) => {
    handleAppletSubmit(appletId, data);
  };

  const handleSave = (appletId: string) => (state: Record<string, unknown>) => {
    updateAppletState(appletId, state);
  };

  const handleClose = (appletId: string) => {
    closeApplet(appletId);
    if (selectedAppletId === appletId) {
      setSelectedAppletId(null);
      if (activeApplets.length <= 1) {
        setViewMode('grid');
      }
    }
  };

  // Handle opening a recent applet
  const handleOpenRecentApplet = (appletId: string) => {
    // Check if applet is already active
    const existingApplet = activeApplets.find(a => a.metadata.id === appletId);
    if (existingApplet) {
      focusApplet(existingApplet.id);
      setSelectedAppletId(existingApplet.id);
      setViewMode('full');
    }
    // Note: If applet is not active, we'd need to reload it from storage
    // This would require storing the applet code along with metadata
  };

  // No applets - show empty desktop with JARVIS
  if (activeApplets.length === 0 || showEmptyState) {
    return (
      <div className={`h-full ${className}`}>
        <EmptyDesktop
          customMessage={emptyMessage}
          onLaunchApplet={handleLaunchSystemApplet}
          recentApplets={recentApplets.map(a => ({ id: a.id, name: a.name, description: a.description }))}
          onOpenRecent={handleOpenRecentApplet}
        />
      </div>
    );
  }

  // Full view mode - show single applet expanded
  if (viewMode === 'full' && fullViewApplet) {
    return (
      <div className={`h-full ${className}`}>
        <FullAppletView
          applet={fullViewApplet}
          onClose={() => handleClose(fullViewApplet.id)}
          onMinimize={handleMinimize}
          onSubmit={handleSubmit(fullViewApplet.id)}
          onSave={handleSave(fullViewApplet.id)}
        />
      </div>
    );
  }

  // Grid view - show all applets as icons
  return (
    <div className={`h-full ${className}`}>
      <DesktopGrid
        applets={activeApplets}
        currentAppletId={currentApplet?.id || null}
        onAppletClick={handleAppletClick}
        onAppletClose={handleClose}
      />
    </div>
  );
}

// Animation styles
const styles = `
  @keyframes scale-in {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .animate-scale-in {
    animation: scale-in 0.15s ease-out;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
