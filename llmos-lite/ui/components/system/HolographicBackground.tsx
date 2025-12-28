'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { useWorkspace } from '@/contexts/WorkspaceContext';

// Global mouse position hook
function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setPosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return position;
}

// ============================================================================
// HOLOGRAPHIC GRID
// ============================================================================

function HoloGrid({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  const gridRef = useRef<THREE.GridHelper>(null);
  const { state } = useWorkspace();

  const gridColor = useMemo(() => {
    switch (state.agentState) {
      case 'thinking': return '#8B5CF6';
      case 'executing': return '#F59E0B';
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#3B82F6';
    }
  }, [state.agentState]);

  useFrame(() => {
    if (!gridRef.current) return;

    // Subtle parallax based on mouse position
    gridRef.current.rotation.x = Math.PI / 2 + mousePosition.y * 0.05;
    gridRef.current.rotation.z = mousePosition.x * 0.02;
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[50, 50, gridColor, gridColor]}
      position={[0, -3, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

// ============================================================================
// FLOATING PARTICLES
// ============================================================================

function FloatingParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const { state } = useWorkspace();

  const particleCount = state.agentState === 'idle' ? 100 : 200;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    return positions;
  }, [particleCount]);

  const color = useMemo(() => {
    switch (state.agentState) {
      case 'thinking': return '#8B5CF6';
      case 'executing': return '#F59E0B';
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#3B82F6';
    }
  }, [state.agentState]);

  useFrame((frameState, delta) => {
    if (!particlesRef.current) return;

    const speed = state.agentState === 'idle' ? 0.1 : 0.3;
    particlesRef.current.rotation.y += delta * speed;
    particlesRef.current.rotation.x += delta * speed * 0.5;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={color}
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

// ============================================================================
// AMBIENT GLOW ORBS
// ============================================================================

function GlowOrbs() {
  const { state } = useWorkspace();
  const groupRef = useRef<THREE.Group>(null);

  const orbColor = useMemo(() => {
    switch (state.agentState) {
      case 'thinking': return '#8B5CF6';
      case 'executing': return '#F59E0B';
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      default: return '#3B82F6';
    }
  }, [state.agentState]);

  useFrame((frameState) => {
    if (!groupRef.current) return;
    const t = frameState.clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.1;
  });

  return (
    <group ref={groupRef}>
      {[...Array(5)].map((_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const radius = 8;
        return (
          <Float
            key={i}
            speed={1 + i * 0.2}
            rotationIntensity={0.5}
            floatIntensity={1}
          >
            <mesh position={[
              Math.cos(angle) * radius,
              (Math.random() - 0.5) * 4,
              Math.sin(angle) * radius - 5
            ]}>
              <sphereGeometry args={[0.1 + Math.random() * 0.1, 16, 16]} />
              <meshBasicMaterial
                color={orbColor}
                transparent
                opacity={0.3 + Math.random() * 0.3}
              />
            </mesh>
          </Float>
        );
      })}
    </group>
  );
}

// ============================================================================
// SCENE COMPOSITION
// ============================================================================

interface SceneProps {
  mousePosition: { x: number; y: number };
}

function Scene({ mousePosition }: SceneProps) {
  const { camera } = useThree();

  // Subtle camera movement based on mouse
  useFrame(() => {
    camera.position.x = mousePosition.x * 0.5;
    camera.position.y = mousePosition.y * 0.3;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      {/* Minimal lighting */}
      <ambientLight intensity={0.1} />

      {/* Grid floor */}
      <HoloGrid mousePosition={mousePosition} />

      {/* Floating particles */}
      <FloatingParticles />

      {/* Ambient orbs */}
      <GlowOrbs />
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function HolographicBackground() {
  const mousePosition = useMousePosition();

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 2, 10], fov: 60 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <Scene mousePosition={mousePosition} />
      </Canvas>

      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent to-transparent opacity-80" />
    </div>
  );
}
