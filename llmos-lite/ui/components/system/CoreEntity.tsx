'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';

// ============================================================================
// STATE COLORS - J.A.R.V.I.S. inspired palette
// ============================================================================

const stateConfigs: Record<AgentState, {
  color: string;
  emissive: string;
  speed: number;
  distort: number;
  scale: number;
}> = {
  idle: {
    color: '#3B82F6',      // Blue
    emissive: '#1E40AF',
    speed: 0.5,
    distort: 0.2,
    scale: 1.0,
  },
  thinking: {
    color: '#8B5CF6',      // Purple
    emissive: '#5B21B6',
    speed: 3.0,
    distort: 0.4,
    scale: 1.15,
  },
  executing: {
    color: '#F59E0B',      // Amber
    emissive: '#B45309',
    speed: 2.0,
    distort: 0.35,
    scale: 1.1,
  },
  success: {
    color: '#10B981',      // Emerald
    emissive: '#047857',
    speed: 1.0,
    distort: 0.15,
    scale: 1.2,
  },
  error: {
    color: '#EF4444',      // Red
    emissive: '#B91C1C',
    speed: 4.0,
    distort: 0.5,
    scale: 0.9,
  },
};

// ============================================================================
// INNER CORE - The main geometric entity
// ============================================================================

function InnerCore({ agentState }: { agentState: AgentState }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const config = stateConfigs[agentState];

  // Animate based on state
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const t = state.clock.getElapsedTime();

    // Rotation speed varies by state
    meshRef.current.rotation.x += delta * config.speed * 0.3;
    meshRef.current.rotation.y += delta * config.speed * 0.5;

    // Breathing effect
    const breathe = Math.sin(t * (agentState === 'thinking' ? 3 : 1)) * 0.05;
    meshRef.current.scale.setScalar(config.scale + breathe);
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[0.8, 1]} />
      <MeshDistortMaterial
        color={config.color}
        emissive={config.emissive}
        emissiveIntensity={0.5}
        roughness={0.2}
        metalness={0.8}
        distort={config.distort}
        speed={config.speed}
        wireframe={agentState === 'thinking'}
      />
    </mesh>
  );
}

// ============================================================================
// OUTER RINGS - Orbiting elements
// ============================================================================

function OuterRings({ agentState }: { agentState: AgentState }) {
  const group = useRef<THREE.Group>(null);
  const isActive = agentState !== 'idle';

  useFrame((state, delta) => {
    if (!group.current) return;

    const speed = isActive ? 2 : 0.5;
    group.current.rotation.y += delta * speed;
    group.current.rotation.z += delta * speed * 0.3;
  });

  const ringColor = stateConfigs[agentState].color;

  return (
    <group ref={group}>
      {/* Inner ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.02, 16, 100]} />
        <meshStandardMaterial
          color={ringColor}
          emissive={ringColor}
          emissiveIntensity={isActive ? 0.8 : 0.3}
          transparent
          opacity={isActive ? 0.9 : 0.5}
        />
      </mesh>

      {/* Outer ring */}
      <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
        <torusGeometry args={[1.5, 0.015, 16, 100]} />
        <meshStandardMaterial
          color={ringColor}
          emissive={ringColor}
          emissiveIntensity={isActive ? 0.6 : 0.2}
          transparent
          opacity={isActive ? 0.7 : 0.3}
        />
      </mesh>

      {/* Tertiary ring */}
      <mesh rotation={[Math.PI / 6, -Math.PI / 3, Math.PI / 4]}>
        <torusGeometry args={[1.8, 0.01, 16, 100]} />
        <meshStandardMaterial
          color={ringColor}
          emissive={ringColor}
          emissiveIntensity={isActive ? 0.4 : 0.1}
          transparent
          opacity={isActive ? 0.5 : 0.2}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// PARTICLE FIELD - Ambient particles
// ============================================================================

function ParticleField({ agentState }: { agentState: AgentState }) {
  const isActive = agentState !== 'idle';
  const color = stateConfigs[agentState].color;

  return (
    <Sparkles
      count={isActive ? 100 : 30}
      scale={4}
      size={isActive ? 3 : 1.5}
      speed={isActive ? 2 : 0.5}
      color={color}
      opacity={isActive ? 0.8 : 0.4}
    />
  );
}

// ============================================================================
// CORE SCENE - Complete 3D scene
// ============================================================================

function CoreScene() {
  const { state } = useWorkspace();

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8B5CF6" />

      {/* The Entity */}
      <Float
        speed={2}
        rotationIntensity={0.5}
        floatIntensity={0.5}
        floatingRange={[-0.1, 0.1]}
      >
        <group>
          <InnerCore agentState={state.agentState} />
          <OuterRings agentState={state.agentState} />
        </group>
      </Float>

      {/* Ambient particles */}
      <ParticleField agentState={state.agentState} />
    </>
  );
}

// ============================================================================
// MAIN COMPONENT - Exportable CoreEntity
// ============================================================================

interface CoreEntityProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function CoreEntity({ className = '', size = 'md' }: CoreEntityProps) {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  };

  return (
    <div className={`${sizeClasses[size]} ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 4], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <CoreScene />
      </Canvas>
    </div>
  );
}

// ============================================================================
// FULL SCREEN BACKGROUND VERSION
// ============================================================================

export function CoreEntityBackground() {
  const { state } = useWorkspace();

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        {/* Subtle lighting */}
        <ambientLight intensity={0.15} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />

        {/* Distant core - subtle background presence */}
        <Float speed={1} rotationIntensity={0.2} floatIntensity={0.3}>
          <group scale={0.5} position={[0, 0, -5]}>
            <InnerCore agentState={state.agentState} />
            <OuterRings agentState={state.agentState} />
          </group>
        </Float>

        {/* Sparse particles for depth */}
        <Sparkles
          count={50}
          scale={15}
          size={1}
          speed={0.3}
          color={stateConfigs[state.agentState].color}
          opacity={0.3}
        />
      </Canvas>
    </div>
  );
}
