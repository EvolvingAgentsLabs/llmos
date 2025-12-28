'use client';

/**
 * JarvisAvatar - The visual representation of the LLMOS system agent
 *
 * A 3D animated avatar that:
 * - Represents the AI's presence
 * - Reacts to agent states (idle, thinking, executing, success, error)
 * - Shows processing activity with animations
 * - Provides visual feedback during conversations
 */

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Text, Ring } from '@react-three/drei';
import * as THREE from 'three';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';

// ============================================================================
// STATE CONFIGURATIONS
// ============================================================================

interface StateConfig {
  coreColor: string;
  emissive: string;
  ringColor: string;
  particleColor: string;
  pulseSpeed: number;
  rotationSpeed: number;
  distortion: number;
  label: string;
}

const stateConfigs: Record<AgentState, StateConfig> = {
  idle: {
    coreColor: '#3B82F6',
    emissive: '#1E40AF',
    ringColor: '#60A5FA',
    particleColor: '#93C5FD',
    pulseSpeed: 1,
    rotationSpeed: 0.3,
    distortion: 0.2,
    label: 'Ready',
  },
  thinking: {
    coreColor: '#8B5CF6',
    emissive: '#5B21B6',
    ringColor: '#A78BFA',
    particleColor: '#C4B5FD',
    pulseSpeed: 3,
    rotationSpeed: 1.5,
    distortion: 0.4,
    label: 'Thinking...',
  },
  executing: {
    coreColor: '#F59E0B',
    emissive: '#B45309',
    ringColor: '#FBBF24',
    particleColor: '#FCD34D',
    pulseSpeed: 2,
    rotationSpeed: 1,
    distortion: 0.35,
    label: 'Executing...',
  },
  success: {
    coreColor: '#10B981',
    emissive: '#047857',
    ringColor: '#34D399',
    particleColor: '#6EE7B7',
    pulseSpeed: 0.5,
    rotationSpeed: 0.2,
    distortion: 0.15,
    label: 'Complete',
  },
  error: {
    coreColor: '#EF4444',
    emissive: '#B91C1C',
    ringColor: '#F87171',
    particleColor: '#FCA5A5',
    pulseSpeed: 4,
    rotationSpeed: 2,
    distortion: 0.5,
    label: 'Error',
  },
};

// ============================================================================
// CORE SPHERE - The main AI presence
// ============================================================================

function CoreSphere({ config }: { config: StateConfig }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;

    const t = state.clock.getElapsedTime();

    // Breathing effect
    const breathe = Math.sin(t * config.pulseSpeed) * 0.1 + 1;
    meshRef.current.scale.setScalar(breathe);

    // Glow pulse
    const glowScale = 1.2 + Math.sin(t * config.pulseSpeed * 0.5) * 0.1;
    glowRef.current.scale.setScalar(glowScale);
  });

  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.3, 32, 32]} />
        <meshBasicMaterial
          color={config.coreColor}
          transparent
          opacity={0.15}
        />
      </mesh>

      {/* Main core */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 2]} />
        <MeshDistortMaterial
          color={config.coreColor}
          emissive={config.emissive}
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.8}
          distort={config.distortion}
          speed={config.pulseSpeed}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// ORBITAL RINGS - Rotating rings around the core
// ============================================================================

function OrbitalRings({ config }: { config: StateConfig }) {
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);
  const ring3Ref = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const speed = config.rotationSpeed;

    if (ring1Ref.current) {
      ring1Ref.current.rotation.x += delta * speed;
      ring1Ref.current.rotation.y += delta * speed * 0.5;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y += delta * speed * 0.7;
      ring2Ref.current.rotation.z += delta * speed * 0.3;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.z += delta * speed * 0.4;
      ring3Ref.current.rotation.x += delta * speed * 0.6;
    }
  });

  const ringMaterial = useMemo(() => ({
    color: config.ringColor,
    emissive: config.ringColor,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.7,
  }), [config.ringColor]);

  return (
    <>
      {/* Ring 1 - Horizontal */}
      <group ref={ring1Ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.8, 0.02, 16, 100]} />
          <meshStandardMaterial {...ringMaterial} />
        </mesh>
      </group>

      {/* Ring 2 - Tilted */}
      <group ref={ring2Ref}>
        <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
          <torusGeometry args={[2.2, 0.015, 16, 100]} />
          <meshStandardMaterial {...ringMaterial} opacity={0.5} />
        </mesh>
      </group>

      {/* Ring 3 - Opposite tilt */}
      <group ref={ring3Ref}>
        <mesh rotation={[Math.PI / 4, -Math.PI / 3, Math.PI / 6]}>
          <torusGeometry args={[2.5, 0.01, 16, 100]} />
          <meshStandardMaterial {...ringMaterial} opacity={0.3} />
        </mesh>
      </group>
    </>
  );
}

// ============================================================================
// DATA PARTICLES - Floating data points
// ============================================================================

function DataParticles({ config }: { config: StateConfig }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = config.pulseSpeed > 1 ? 200 : 100;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 2.5 + Math.random() * 2;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Random velocities for animation
      velocities[i * 3] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
    }

    return { positions, velocities };
  }, [particleCount]);

  useFrame((state) => {
    if (!particlesRef.current) return;

    const t = state.clock.getElapsedTime();
    particlesRef.current.rotation.y = t * config.rotationSpeed * 0.1;
    particlesRef.current.rotation.x = Math.sin(t * 0.3) * 0.1;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color={config.particleColor}
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// ============================================================================
// ACTIVITY WAVES - Ripple effect when active
// ============================================================================

function ActivityWaves({ config }: { config: StateConfig }) {
  const wave1Ref = useRef<THREE.Mesh>(null);
  const wave2Ref = useRef<THREE.Mesh>(null);
  const wave3Ref = useRef<THREE.Mesh>(null);

  const isActive = config.pulseSpeed > 1;

  useFrame((state) => {
    if (!isActive) return;

    const t = state.clock.getElapsedTime();

    [wave1Ref, wave2Ref, wave3Ref].forEach((ref, i) => {
      if (!ref.current) return;

      const offset = i * 0.5;
      const scale = 1 + ((t * config.pulseSpeed + offset) % 3) * 0.5;
      const opacity = Math.max(0, 1 - ((t * config.pulseSpeed + offset) % 3) / 3);

      ref.current.scale.setScalar(scale);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.3;
    });
  });

  if (!isActive) return null;

  return (
    <group>
      <mesh ref={wave1Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.6, 64]} />
        <meshBasicMaterial color={config.ringColor} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wave2Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.6, 64]} />
        <meshBasicMaterial color={config.ringColor} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={wave3Ref} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.6, 64]} />
        <meshBasicMaterial color={config.ringColor} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ============================================================================
// JARVIS SCENE - Complete 3D scene
// ============================================================================

function JarvisScene() {
  const { state } = useWorkspace();
  const config = stateConfigs[state.agentState];

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.4} color={config.coreColor} />

      {/* Main avatar group with floating animation */}
      <Float
        speed={2}
        rotationIntensity={0.3}
        floatIntensity={0.5}
        floatingRange={[-0.2, 0.2]}
      >
        <group>
          <CoreSphere config={config} />
          <OrbitalRings config={config} />
          <ActivityWaves config={config} />
        </group>
      </Float>

      {/* Ambient particles */}
      <DataParticles config={config} />
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface JarvisAvatarProps {
  className?: string;
  showLabel?: boolean;
}

export default function JarvisAvatar({ className = '', showLabel = true }: JarvisAvatarProps) {
  const { state } = useWorkspace();
  const config = stateConfigs[state.agentState];

  return (
    <div className={`relative w-full h-full min-h-[300px] ${className}`}>
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <JarvisScene />
      </Canvas>

      {/* Status Label */}
      {showLabel && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: config.coreColor }}
          />
          <span className="text-sm font-medium text-fg-secondary">
            {config.label}
          </span>
        </div>
      )}

      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-bg-primary/50" />
    </div>
  );
}

// ============================================================================
// COMPACT VERSION - For smaller displays
// ============================================================================

export function JarvisAvatarCompact({ className = '' }: { className?: string }) {
  const { state } = useWorkspace();
  const config = stateConfigs[state.agentState];

  return (
    <div className={`relative ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={0.5} />
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
          <CoreSphere config={config} />
          <OrbitalRings config={config} />
        </Float>
      </Canvas>
    </div>
  );
}
