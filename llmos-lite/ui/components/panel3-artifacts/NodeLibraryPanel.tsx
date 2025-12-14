'use client';

import { useState } from 'react';

interface SkillCategory {
  id: string;
  name: string;
  icon: string;
}

interface AvailableSkill {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
}

const CATEGORIES: SkillCategory[] = [
  { id: 'all', name: 'All Skills', icon: '📚' },
  { id: 'quantum', name: 'Quantum', icon: '⚛️' },
  { id: '3d', name: '3D Graphics', icon: '🎨' },
  { id: 'electronics', name: 'Electronics', icon: '⚡' },
  { id: 'data', name: 'Data Science', icon: '📊' },
  { id: 'code', name: 'Code Gen', icon: '💻' },
];

const AVAILABLE_SKILLS: AvailableSkill[] = [
  {
    id: 'quantum-hamiltonian',
    name: 'Hamiltonian Builder',
    type: 'qiskit',
    category: 'quantum',
    description: 'Create quantum Hamiltonians for molecules',
  },
  {
    id: 'quantum-vqe',
    name: 'VQE Optimizer',
    type: 'qiskit',
    category: 'quantum',
    description: 'Variational Quantum Eigensolver',
  },
  {
    id: 'quantum-circuit',
    name: 'Circuit Builder',
    type: 'qiskit',
    category: 'quantum',
    description: 'Build quantum circuits',
  },
  {
    id: '3d-cube',
    name: 'Cube Renderer',
    type: 'threejs',
    category: '3d',
    description: 'Render 3D cube with Three.js',
  },
  {
    id: '3d-animation',
    name: 'Animation Loop',
    type: 'threejs',
    category: '3d',
    description: 'Animate 3D objects',
  },
  {
    id: 'plot-convergence',
    name: 'Plot Convergence',
    type: 'javascript',
    category: 'data',
    description: 'Plot optimization convergence',
  },
  {
    id: 'export-results',
    name: 'Export Results',
    type: 'javascript',
    category: 'code',
    description: 'Export workflow results',
  },
  {
    id: 'spice-resistor',
    name: 'Resistor Circuit',
    type: 'spice',
    category: 'electronics',
    description: 'Simulate resistor circuits',
  },
];

interface NodeLibraryPanelProps {
  onSkillSelect?: (skill: AvailableSkill) => void;
}

export default function NodeLibraryPanel({ onSkillSelect }: NodeLibraryPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter skills by category and search
  const filteredSkills = AVAILABLE_SKILLS.filter((skill) => {
    const matchesCategory =
      selectedCategory === 'all' || skill.category === selectedCategory;
    const matchesSearch =
      skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const onDragStart = (event: React.DragEvent, skill: AvailableSkill) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(skill));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="h-full flex flex-col bg-terminal-bg-primary">
      {/* Header */}
      <div className="p-3 border-b border-terminal-border">
        <h3 className="terminal-heading text-xs mb-2">NODE LIBRARY</h3>
        <input
          type="text"
          placeholder="Search skills..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="terminal-input w-full text-xs"
        />
      </div>

      {/* Categories */}
      <div className="p-2 border-b border-terminal-border overflow-x-auto">
        <div className="flex gap-1">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`
                px-2 py-1 rounded text-xs whitespace-nowrap transition-colors
                ${
                  selectedCategory === category.id
                    ? 'bg-terminal-accent-green text-terminal-bg-primary'
                    : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
                }
              `}
            >
              {category.icon} {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Skills List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredSkills.length === 0 ? (
          <div className="text-xs text-terminal-fg-tertiary text-center py-4">
            No skills found
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <div
              key={skill.id}
              draggable
              onDragStart={(e) => onDragStart(e, skill)}
              onClick={() => onSkillSelect?.(skill)}
              className="
                p-2 rounded border border-terminal-border
                bg-terminal-bg-secondary hover:bg-terminal-bg-tertiary
                hover:border-terminal-accent-green
                cursor-move transition-all
              "
            >
              <div className="flex items-start justify-between mb-1">
                <div className="text-xs font-medium text-terminal-fg-primary">
                  {skill.name}
                </div>
                <div className="text-[10px] px-1 py-0.5 rounded bg-terminal-bg-tertiary text-terminal-fg-tertiary">
                  {skill.type}
                </div>
              </div>
              <div className="text-[10px] text-terminal-fg-secondary">
                {skill.description}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-terminal-border text-[10px] text-terminal-fg-tertiary">
        💡 Drag skills onto canvas to build workflows
      </div>
    </div>
  );
}
