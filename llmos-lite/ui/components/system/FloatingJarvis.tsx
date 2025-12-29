'use client';

/**
 * FloatingJarvis - Persistent AI avatar like Siri on macOS
 *
 * A floating, draggable avatar that:
 * - Shows in a corner of the screen
 * - Displays current agent state (idle, thinking, executing)
 * - Can be minimized to a small orb
 * - Expands on hover/click to show status
 */

import { useState, useRef, useEffect } from 'react';
import { useWorkspace, AgentState } from '@/contexts/WorkspaceContext';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { MessageCircle, X, Minimize2, Maximize2 } from 'lucide-react';

// ============================================================================
// STATE CONFIGURATIONS
// ============================================================================

interface StateConfig {
  color: string;
  emissive: string;
  label: string;
  pulseSpeed: number;
  distortion: number;
}

const stateConfigs: Record<AgentState, StateConfig> = {
  idle: {
    color: '#3B82F6',
    emissive: '#1E40AF',
    label: 'Ready',
    pulseSpeed: 1,
    distortion: 0.2,
  },
  thinking: {
    color: '#8B5CF6',
    emissive: '#5B21B6',
    label: 'Thinking...',
    pulseSpeed: 3,
    distortion: 0.4,
  },
  executing: {
    color: '#F59E0B',
    emissive: '#B45309',
    label: 'Working...',
    pulseSpeed: 2,
    distortion: 0.35,
  },
  success: {
    color: '#10B981',
    emissive: '#047857',
    label: 'Done!',
    pulseSpeed: 0.5,
    distortion: 0.15,
  },
  error: {
    color: '#EF4444',
    emissive: '#B91C1C',
    label: 'Error',
    pulseSpeed: 4,
    distortion: 0.5,
  },
};

// ============================================================================
// MINI CORE - Compact 3D orb
// ============================================================================

function MiniCore({ config }: { config: StateConfig }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || !glowRef.current) return;

    const t = state.clock.getElapsedTime();

    // Breathing effect
    const breathe = Math.sin(t * config.pulseSpeed) * 0.1 + 1;
    meshRef.current.scale.setScalar(breathe);

    // Rotation
    meshRef.current.rotation.y = t * 0.5;
    meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.2;

    // Glow pulse
    const glowScale = 1.3 + Math.sin(t * config.pulseSpeed * 0.5) * 0.1;
    glowRef.current.scale.setScalar(glowScale);
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
      <group>
        {/* Outer glow */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshBasicMaterial
            color={config.color}
            transparent
            opacity={0.2}
          />
        </mesh>

        {/* Main orb */}
        <mesh ref={meshRef}>
          <icosahedronGeometry args={[1, 2]} />
          <MeshDistortMaterial
            color={config.color}
            emissive={config.emissive}
            emissiveIntensity={0.6}
            roughness={0.2}
            metalness={0.8}
            distort={config.distortion}
            speed={config.pulseSpeed}
          />
        </mesh>
      </group>
    </Float>
  );
}

// ============================================================================
// MINI SCENE
// ============================================================================

function MiniScene({ agentState }: { agentState: AgentState }) {
  const config = stateConfigs[agentState];

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={0.6} color={config.color} />
      <MiniCore config={config} />
    </>
  );
}

// ============================================================================
// FLOATING JARVIS COMPONENT
// ============================================================================

interface FloatingJarvisProps {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  onChatClick?: () => void;
}

export default function FloatingJarvis({
  position = 'bottom-right',
  onChatClick
}: FloatingJarvisProps) {
  const { state } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const config = stateConfigs[state.agentState];

  // Position classes
  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-20 right-6',
    'top-left': 'top-20 left-6',
  };

  // Auto-expand when agent is active
  useEffect(() => {
    if (state.agentState === 'thinking' || state.agentState === 'executing') {
      setIsExpanded(true);
    } else if (state.agentState === 'success' || state.agentState === 'error') {
      // Keep expanded briefly after completion
      const timer = setTimeout(() => setIsExpanded(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [state.agentState]);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className={`fixed ${positionClasses[position]} z-50
                   w-12 h-12 rounded-full
                   bg-bg-elevated/90 backdrop-blur-xl
                   border border-white/20 shadow-lg shadow-black/30
                   flex items-center justify-center
                   hover:scale-110 transition-transform duration-200`}
        style={{ boxShadow: `0 0 20px ${config.color}40` }}
      >
        <div
          className="w-4 h-4 rounded-full animate-pulse"
          style={{ backgroundColor: config.color }}
        />
      </button>
    );
  }

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50
                 transition-all duration-300 ease-out`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Container */}
      <div
        className={`relative rounded-2xl overflow-hidden
                   bg-bg-elevated/90 backdrop-blur-xl
                   border border-white/20 shadow-2xl shadow-black/40
                   transition-all duration-300
                   ${isExpanded ? 'w-64 h-72' : 'w-16 h-16'}`}
        style={{
          boxShadow: `0 0 30px ${config.color}30, 0 8px 32px rgba(0,0,0,0.4)`
        }}
      >
        {/* Collapsed View - Just the orb */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="w-full h-full flex items-center justify-center
                      hover:scale-105 transition-transform"
          >
            <div className="w-12 h-12">
              <Canvas
                camera={{ position: [0, 0, 4], fov: 45 }}
                style={{ background: 'transparent' }}
                gl={{ alpha: true, antialias: true }}
              >
                <MiniScene agentState={state.agentState} />
              </Canvas>
            </div>
          </button>
        )}

        {/* Expanded View */}
        {isExpanded && (
          <div className="flex flex-col h-full">
            {/* Header with controls */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-xs font-medium text-fg-primary">JARVIS</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded hover:bg-white/10 text-fg-muted hover:text-fg-primary transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-white/10 text-fg-muted hover:text-fg-primary transition-colors"
                  title="Collapse"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* 3D Avatar */}
            <div className="flex-1 min-h-0">
              <Canvas
                camera={{ position: [0, 0, 5], fov: 45 }}
                style={{ background: 'transparent' }}
                gl={{ alpha: true, antialias: true }}
              >
                <MiniScene agentState={state.agentState} />
              </Canvas>
            </div>

            {/* Status */}
            <div className="px-4 py-3 border-t border-white/10 bg-bg-secondary/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-fg-primary">{config.label}</p>
                  <p className="text-[10px] text-fg-muted">
                    {state.taskType ? `Mode: ${state.taskType}` : 'Awaiting commands'}
                  </p>
                </div>
                {onChatClick && (
                  <button
                    onClick={onChatClick}
                    className="p-2 rounded-lg bg-accent-primary/20 hover:bg-accent-primary/30
                             text-accent-primary transition-colors"
                    title="Open Chat"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick status indicator (when collapsed but hovered) */}
      {!isExpanded && isHovered && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2
                       px-2 py-1 rounded-lg
                       bg-bg-elevated/95 backdrop-blur-xl
                       border border-white/20 shadow-lg
                       text-[10px] text-fg-secondary whitespace-nowrap
                       animate-fade-in">
          {config.label}
        </div>
      )}
    </div>
  );
}
