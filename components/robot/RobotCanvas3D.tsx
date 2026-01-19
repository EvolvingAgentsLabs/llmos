'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { type CubeRobotState as SimulatorState, type FloorMap } from '@/lib/hardware/cube-robot-simulator';
import * as THREE from 'three';

/**
 * RobotCanvas3D - Three.js 3D rendering for robot world
 *
 * Features:
 * - Robot cube with LED color
 * - Arena floor and walls
 * - Obstacles and checkpoints
 * - Camera presets (top-down, isometric, follow, side)
 * - Mouse control with OrbitControls in all views
 * - Object picking and selection with shader effects
 * - Planning animation when agent is working
 */

type AgentPhase = 'idle' | 'analyzing' | 'planning' | 'voting' | 'executing' | 'sub-agent-execution' | 'completed';

interface AgentActivity {
  phase: AgentPhase;
  activeAgents: number;
  isLoading: boolean;
}

// Selected object information
interface SelectedObjectInfo {
  type: 'robot' | 'wall' | 'obstacle' | 'checkpoint' | 'floor';
  name: string;
  position: { x: number; y: number; z: number };
  data?: Record<string, unknown>;
}

interface RobotCanvas3DProps {
  robotState: SimulatorState | null;
  floorMap: FloorMap;
  cameraPreset: 'top-down' | 'isometric' | 'follow' | 'side';
  onArenaClick?: (x: number, y: number) => void;
  agentActivity?: AgentActivity;
  onObjectSelected?: (info: SelectedObjectInfo | null) => void;
}

// Camera positions for each preset
const CAMERA_PRESETS = {
  'top-down': { position: [0, 8, 0.01] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'isometric': { position: [4, 4, 4] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'follow': { position: [0, 2, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
  'side': { position: [6, 2, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
};

// Selection outline shader
const SelectionOutlineMaterial = {
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec3 pos = position + normal * 0.015;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 outlineColor;
    uniform float opacity;
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(outlineColor, opacity * intensity + 0.5);
    }
  `,
};

// Selection glow component
function SelectionGlow({ mesh, color = '#58a6ff' }: { mesh: THREE.Mesh | null; color?: string }) {
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current) {
      // Pulsing effect
      const scale = 1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
      glowRef.current.scale.setScalar(scale);
    }
  });

  if (!mesh || !mesh.geometry) return null;

  return (
    <mesh
      ref={glowRef}
      geometry={mesh.geometry}
      position={mesh.position}
      rotation={mesh.rotation}
      scale={mesh.scale}
    >
      <shaderMaterial
        vertexShader={SelectionOutlineMaterial.vertexShader}
        fragmentShader={SelectionOutlineMaterial.fragmentShader}
        uniforms={{
          outlineColor: { value: new THREE.Color(color) },
          opacity: { value: 0.8 },
        }}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// R2D2-style Robot component with tilted cube, wheels, and camera
function RobotCube({
  state,
  agentActivity,
  isSelected,
  onClick
}: {
  state: SimulatorState | null;
  agentActivity?: AgentActivity;
  isSelected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cubeRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (groupRef.current && state) {
      groupRef.current.position.set(state.pose.x, 0, state.pose.y);
      groupRef.current.rotation.y = -state.pose.rotation;
    }
  }, [state]);

  // Agent activity affects LED color
  const getAgentColor = () => {
    if (!agentActivity || agentActivity.phase === 'idle') {
      return state ? `rgb(${state.led.r}, ${state.led.g}, ${state.led.b})` : '#58a6ff';
    }

    switch (agentActivity.phase) {
      case 'analyzing': return '#d29922';
      case 'planning': return '#a371f7';
      case 'voting': return '#58a6ff';
      case 'executing': return '#3fb950';
      case 'sub-agent-execution': return '#f85149';
      case 'completed': return '#3fb950';
      default: return '#58a6ff';
    }
  };

  const ledColor = getAgentColor();
  const tiltAngle = Math.PI / 6;

  return (
    <group
      ref={groupRef}
      position={[0, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {/* Main cube body */}
      <mesh
        ref={cubeRef}
        position={[0, 0.045, 0]}
        rotation={[tiltAngle, 0, 0]}
        castShadow
        receiveShadow
        userData={{ type: 'robot', name: 'Robot' }}
      >
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshStandardMaterial
          color={isSelected || hovered ? '#ffffff' : ledColor}
          emissive={ledColor}
          emissiveIntensity={isSelected ? 1.0 : hovered ? 0.7 : 0.5}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Selection outline */}
      {(isSelected || hovered) && cubeRef.current && (
        <mesh
          position={[0, 0.045, 0]}
          rotation={[tiltAngle, 0, 0]}
        >
          <boxGeometry args={[0.095, 0.095, 0.095]} />
          <meshBasicMaterial
            color={isSelected ? '#58a6ff' : '#8b949e'}
            transparent
            opacity={0.3}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {/* Left wheel */}
      <mesh
        position={[-0.035, 0.0163, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.0163, 0.0163, 0.01, 16]} />
        <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Right wheel */}
      <mesh
        position={[0.035, 0.0163, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.0163, 0.0163, 0.01, 16]} />
        <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Camera/eye */}
      <mesh position={[0, 0.055, 0.045]} rotation={[tiltAngle, 0, 0]} castShadow>
        <sphereGeometry args={[0.008, 16, 16]} />
        <meshStandardMaterial
          color="#e74c3c"
          emissive="#e74c3c"
          emissiveIntensity={0.8}
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>

      {/* Camera lens glow */}
      <pointLight position={[0, 0.055, 0.05]} color="#e74c3c" intensity={0.3} distance={0.15} />

      {/* Agent activity indicator rings */}
      {agentActivity && agentActivity.phase !== 'idle' && agentActivity.isLoading && (
        <AgentActivityRings ledColor={ledColor} activeAgents={agentActivity.activeAgents} />
      )}

      {/* Movement indicator */}
      {state && state.velocity.linear !== 0 && (
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.05, 0.053, 32]} />
          <meshBasicMaterial color="#3fb950" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// Animated agent activity rings
function AgentActivityRings({ ledColor, activeAgents }: { ledColor: string; activeAgents: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.02;
    }
    if (ring1Ref.current) {
      const scale = 1.0 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      ring1Ref.current.scale.setScalar(scale);
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z += 0.03;
    }
  });

  return (
    <>
      {/* Primary ring - pulsing */}
      <mesh ref={ring1Ref} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.055, 0.065, 32]} />
        <meshBasicMaterial color={ledColor} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Secondary ring - rotating */}
      <mesh ref={ring2Ref} position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.075, 32]} />
        <meshBasicMaterial color={ledColor} transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Orbiting agent spheres */}
      <group ref={groupRef} position={[0, 0.005, 0]}>
        {Array.from({ length: Math.min(activeAgents, 5) }).map((_, i) => {
          const angle = (i / activeAgents) * Math.PI * 2;
          const radius = 0.08;
          return (
            <mesh key={i} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
              <sphereGeometry args={[0.005, 8, 8]} />
              <meshStandardMaterial color={ledColor} emissive={ledColor} emissiveIntensity={1} />
            </mesh>
          );
        })}
      </group>
    </>
  );
}

// Arena floor component
function ArenaFloor({
  bounds,
  isSelected,
  onClick
}: {
  bounds: FloorMap['bounds'];
  isSelected: boolean;
  onClick: (point: THREE.Vector3) => void;
}) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  const gridLines = useMemo(() => {
    const lines = [];
    const step = 0.5;

    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      lines.push(
        <line key={`v${x}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([x, 0.001, bounds.minY, x, 0.001, bounds.maxY])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial attach="material" color={x % 1 === 0 ? "#58a6ff" : "#30363d"} />
        </line>
      );
    }

    for (let z = bounds.minY; z <= bounds.maxY; z += step) {
      lines.push(
        <line key={`h${z}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([bounds.minX, 0.001, z, bounds.maxX, 0.001, z])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial attach="material" color={z % 1 === 0 ? "#58a6ff" : "#30363d"} />
        </line>
      );
    }

    return lines;
  }, [bounds]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick(e.point); }}
        userData={{ type: 'floor', name: 'Arena Floor' }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color={isSelected ? '#2a3040' : '#1a1a2e'}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
      {gridLines}
    </group>
  );
}

// Wall components
function Walls({
  walls,
  selectedIndex,
  onSelect
}: {
  walls: FloorMap['walls'];
  selectedIndex: number | null;
  onSelect: (index: number, wall: FloorMap['walls'][0]) => void;
}) {
  return (
    <group>
      {walls.map((wall, idx) => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const centerX = (wall.x1 + wall.x2) / 2;
        const centerY = (wall.y1 + wall.y2) / 2;
        const isSelected = selectedIndex === idx;

        return (
          <group key={idx}>
            <mesh
              position={[centerX, 0.15, centerY]}
              rotation={[0, angle, 0]}
              castShadow
              onClick={(e) => { e.stopPropagation(); onSelect(idx, wall); }}
              onPointerOver={() => document.body.style.cursor = 'pointer'}
              onPointerOut={() => document.body.style.cursor = 'auto'}
              userData={{ type: 'wall', name: `Wall ${idx + 1}` }}
            >
              <boxGeometry args={[length, 0.3, 0.05]} />
              <meshStandardMaterial
                color={isSelected ? '#58a6ff' : '#30363d'}
                emissive={isSelected ? '#58a6ff' : '#000000'}
                emissiveIntensity={isSelected ? 0.3 : 0}
                metalness={0.8}
                roughness={0.2}
              />
            </mesh>
            {isSelected && (
              <mesh position={[centerX, 0.15, centerY]} rotation={[0, angle, 0]}>
                <boxGeometry args={[length + 0.02, 0.32, 0.07]} />
                <meshBasicMaterial color="#58a6ff" transparent opacity={0.2} side={THREE.BackSide} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Obstacle components
function Obstacles({
  obstacles,
  selectedIndex,
  onSelect
}: {
  obstacles: FloorMap['obstacles'];
  selectedIndex: number | null;
  onSelect: (index: number, obstacle: FloorMap['obstacles'][0]) => void;
}) {
  return (
    <group>
      {obstacles.map((obstacle, idx) => {
        const isSelected = selectedIndex === idx;
        return (
          <group key={idx}>
            <mesh
              position={[obstacle.x, obstacle.radius / 2, obstacle.y]}
              castShadow
              receiveShadow
              onClick={(e) => { e.stopPropagation(); onSelect(idx, obstacle); }}
              onPointerOver={() => document.body.style.cursor = 'pointer'}
              onPointerOut={() => document.body.style.cursor = 'auto'}
              userData={{ type: 'obstacle', name: `Obstacle ${idx + 1}` }}
            >
              <cylinderGeometry args={[obstacle.radius, obstacle.radius, obstacle.radius, 16]} />
              <meshStandardMaterial
                color={isSelected ? '#ff7b72' : '#f85149'}
                emissive={isSelected ? '#f85149' : '#000000'}
                emissiveIntensity={isSelected ? 0.5 : 0}
                metalness={0.5}
                roughness={0.5}
              />
            </mesh>
            {isSelected && (
              <mesh position={[obstacle.x, obstacle.radius / 2, obstacle.y]}>
                <cylinderGeometry args={[obstacle.radius + 0.02, obstacle.radius + 0.02, obstacle.radius + 0.02, 16]} />
                <meshBasicMaterial color="#f85149" transparent opacity={0.2} side={THREE.BackSide} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Checkpoint markers
function Checkpoints({
  checkpoints,
  selectedIndex,
  onSelect
}: {
  checkpoints: FloorMap['checkpoints'];
  selectedIndex: number | null;
  onSelect: (index: number, checkpoint: FloorMap['checkpoints'][0]) => void;
}) {
  return (
    <group>
      {checkpoints.map((checkpoint, idx) => {
        const isSelected = selectedIndex === idx;
        return (
          <group key={idx}>
            <mesh
              position={[checkpoint.x, 0.05, checkpoint.y]}
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e) => { e.stopPropagation(); onSelect(idx, checkpoint); }}
              onPointerOver={() => document.body.style.cursor = 'pointer'}
              onPointerOut={() => document.body.style.cursor = 'auto'}
              userData={{ type: 'checkpoint', name: `Checkpoint ${idx + 1}` }}
            >
              <circleGeometry args={[0.15, 16]} />
              <meshStandardMaterial
                color={isSelected ? '#7ee787' : '#3fb950'}
                transparent
                opacity={isSelected ? 0.9 : 0.6}
                emissive="#3fb950"
                emissiveIntensity={isSelected ? 0.6 : 0.3}
              />
            </mesh>
            {isSelected && (
              <mesh position={[checkpoint.x, 0.06, checkpoint.y]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.15, 0.18, 32]} />
                <meshBasicMaterial color="#3fb950" transparent opacity={0.8} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Line track rendering
function LineTrackRenderer({ lines }: { lines: FloorMap['lines'] }) {
  if (!lines || lines.length === 0) return null;

  return (
    <group>
      {lines.map((line, lineIdx) => (
        <group key={lineIdx}>
          {line.points.map((point, pointIdx) => (
            <mesh
              key={`${lineIdx}-${pointIdx}`}
              position={[point.x, 0.002, point.y]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[line.width / 2 || 0.015, 8]} />
              <meshBasicMaterial color={line.color || "#000000"} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// Planning animation - particles and effects when agent is planning
function PlanningAnimation({ agentActivity, robotState }: { agentActivity?: AgentActivity; robotState: SimulatorState | null }) {
  const particlesRef = useRef<THREE.Points>(null);
  const [particles] = useState(() => {
    const count = 50;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2;
      positions[i * 3 + 1] = Math.random() * 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2;

      // Purple/blue gradient colors
      colors[i * 3] = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 1] = 0.4 + Math.random() * 0.3;
      colors[i * 3 + 2] = 1.0;
    }

    return { positions, colors };
  });

  useFrame((state) => {
    if (particlesRef.current && agentActivity?.isLoading && agentActivity.phase === 'planning') {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      const time = state.clock.elapsedTime;

      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3;
        // Spiral upward motion
        const angle = time + i * 0.2;
        const radius = 0.3 + Math.sin(time + i) * 0.1;
        positions[i3] = Math.cos(angle) * radius + (robotState?.pose.x || 0);
        positions[i3 + 1] = (time * 0.1 + i * 0.02) % 0.5 + 0.1;
        positions[i3 + 2] = Math.sin(angle) * radius + (robotState?.pose.y || 0);
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  if (!agentActivity || agentActivity.phase !== 'planning' || !agentActivity.isLoading) return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.positions.length / 3}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particles.colors.length / 3}
          array={particles.colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

// Camera controller that responds to preset changes and allows OrbitControls
function CameraController({
  preset,
  robotState,
  agentActivity,
  controlsRef,
  presetChangeCount,
}: {
  preset: string;
  robotState: SimulatorState | null;
  agentActivity?: AgentActivity;
  controlsRef: React.RefObject<any>;
  presetChangeCount: number;
}) {
  const { camera } = useThree();
  const config = CAMERA_PRESETS[preset as keyof typeof CAMERA_PRESETS];
  const timeRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const transitionProgressRef = useRef(0);
  const lastPresetChangeRef = useRef(presetChangeCount);

  // Handle preset button clicks - reset camera
  useEffect(() => {
    if (presetChangeCount !== lastPresetChangeRef.current) {
      lastPresetChangeRef.current = presetChangeCount;
      isTransitioningRef.current = true;
      transitionProgressRef.current = 0;
    }
  }, [presetChangeCount]);

  useFrame((state, delta) => {
    timeRef.current += delta;

    const isAgentActive = agentActivity && agentActivity.phase !== 'idle' && agentActivity.isLoading;

    // Handle camera transitions when preset button is clicked
    if (isTransitioningRef.current && config) {
      transitionProgressRef.current += delta * 2; // Transition speed

      if (transitionProgressRef.current >= 1) {
        isTransitioningRef.current = false;
        transitionProgressRef.current = 1;
      }

      const t = Math.min(transitionProgressRef.current, 1);
      const easeT = 1 - Math.pow(1 - t, 3); // Ease out cubic

      // Interpolate camera position
      const targetPos = new THREE.Vector3(...config.position);
      camera.position.lerp(targetPos, easeT * 0.15);

      // Update OrbitControls target
      if (controlsRef.current) {
        const targetLookAt = new THREE.Vector3(...config.target);
        controlsRef.current.target.lerp(targetLookAt, easeT * 0.15);
        controlsRef.current.update();
      }
    }

    // Follow mode - camera follows robot
    if (preset === 'follow' && robotState && !isTransitioningRef.current) {
      const targetPos = new THREE.Vector3(
        robotState.pose.x - Math.sin(robotState.pose.rotation) * 2.5,
        2.5,
        robotState.pose.y + Math.cos(robotState.pose.rotation) * 2.5
      );
      camera.position.lerp(targetPos, 0.08);

      if (controlsRef.current) {
        const robotPos = new THREE.Vector3(robotState.pose.x, 0.05, robotState.pose.y);
        controlsRef.current.target.lerp(robotPos, 0.08);
        controlsRef.current.update();
      }
    }

    // Agent activity animation - dramatic camera movements when planning
    if (isAgentActive && agentActivity.phase === 'planning' && !isTransitioningRef.current) {
      const orbitSpeed = 0.15;
      const orbitRadius = 1.5;
      const orbitHeight = 1.0;

      const angle = timeRef.current * orbitSpeed;
      const targetPos = new THREE.Vector3(
        Math.cos(angle) * orbitRadius + (robotState?.pose.x || 0),
        orbitHeight,
        Math.sin(angle) * orbitRadius + (robotState?.pose.y || 0)
      );

      camera.position.lerp(targetPos, 0.03);

      if (controlsRef.current) {
        const lookAtPos = robotState
          ? new THREE.Vector3(robotState.pose.x, 0.04, robotState.pose.y)
          : new THREE.Vector3(0, 0.04, 0);
        controlsRef.current.target.lerp(lookAtPos, 0.03);
        controlsRef.current.update();
      }
    }
  });

  return null;
}

// Selection info panel component
function SelectionInfoPanel({ selectedObject }: { selectedObject: SelectedObjectInfo | null }) {
  if (!selectedObject) return null;

  const typeColors: Record<string, string> = {
    robot: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    wall: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
    obstacle: 'bg-red-500/20 border-red-500/50 text-red-400',
    checkpoint: 'bg-green-500/20 border-green-500/50 text-green-400',
    floor: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
  };

  return (
    <div className="absolute bottom-4 left-4 bg-[#0d1117]/95 backdrop-blur-sm border border-[#30363d] rounded-lg p-3 shadow-xl min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <div className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase border ${typeColors[selectedObject.type]}`}>
          {selectedObject.type}
        </div>
        <span className="text-sm font-medium text-[#e6edf3]">{selectedObject.name}</span>
      </div>
      <div className="space-y-1 text-xs font-mono">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#6e7681]">Position:</span>
          <span className="text-[#58a6ff]">
            ({selectedObject.position.x.toFixed(2)}, {selectedObject.position.z.toFixed(2)})
          </span>
        </div>
        {selectedObject.data && Object.entries(selectedObject.data).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-[#6e7681]">{key}:</span>
            <span className="text-[#a371f7]">{String(value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-[#30363d] text-[10px] text-[#6e7681]">
        Click elsewhere to deselect
      </div>
    </div>
  );
}

export default function RobotCanvas3D({
  robotState,
  floorMap,
  cameraPreset,
  onArenaClick,
  agentActivity,
  onObjectSelected,
}: RobotCanvas3DProps) {
  const controlsRef = useRef<any>(null);
  const [selectedObject, setSelectedObject] = useState<SelectedObjectInfo | null>(null);
  const [selectedType, setSelectedType] = useState<{ type: string; index: number | null }>({ type: '', index: null });
  const [presetChangeCount, setPresetChangeCount] = useState(0);
  const lastPresetRef = useRef(cameraPreset);

  // Track preset changes to trigger camera reset
  useEffect(() => {
    if (cameraPreset !== lastPresetRef.current) {
      lastPresetRef.current = cameraPreset;
      setPresetChangeCount(c => c + 1);
    }
  }, [cameraPreset]);

  const handleFloorClick = useCallback((point: THREE.Vector3) => {
    setSelectedObject({
      type: 'floor',
      name: 'Arena Floor',
      position: { x: point.x, y: point.y, z: point.z },
    });
    setSelectedType({ type: 'floor', index: null });
    onArenaClick?.(point.x, point.z);
    onObjectSelected?.({
      type: 'floor',
      name: 'Arena Floor',
      position: { x: point.x, y: point.y, z: point.z },
    });
  }, [onArenaClick, onObjectSelected]);

  const handleRobotClick = useCallback(() => {
    const info: SelectedObjectInfo = {
      type: 'robot',
      name: 'Robot',
      position: {
        x: robotState?.pose.x || 0,
        y: 0,
        z: robotState?.pose.y || 0
      },
      data: robotState ? {
        rotation: `${(robotState.pose.rotation * 180 / Math.PI).toFixed(1)}deg`,
        velocity: `${robotState.velocity.linear.toFixed(2)} m/s`,
        LED: `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`,
      } : undefined,
    };
    setSelectedObject(info);
    setSelectedType({ type: 'robot', index: null });
    onObjectSelected?.(info);
  }, [robotState, onObjectSelected]);

  const handleWallClick = useCallback((index: number, wall: FloorMap['walls'][0]) => {
    const info: SelectedObjectInfo = {
      type: 'wall',
      name: `Wall ${index + 1}`,
      position: { x: (wall.x1 + wall.x2) / 2, y: 0.15, z: (wall.y1 + wall.y2) / 2 },
      data: {
        start: `(${wall.x1.toFixed(2)}, ${wall.y1.toFixed(2)})`,
        end: `(${wall.x2.toFixed(2)}, ${wall.y2.toFixed(2)})`,
        length: `${Math.sqrt(Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.y2 - wall.y1, 2)).toFixed(2)}m`,
      },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'wall', index });
    onObjectSelected?.(info);
  }, [onObjectSelected]);

  const handleObstacleClick = useCallback((index: number, obstacle: FloorMap['obstacles'][0]) => {
    const info: SelectedObjectInfo = {
      type: 'obstacle',
      name: `Obstacle ${index + 1}`,
      position: { x: obstacle.x, y: obstacle.radius / 2, z: obstacle.y },
      data: {
        radius: `${obstacle.radius.toFixed(2)}m`,
      },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'obstacle', index });
    onObjectSelected?.(info);
  }, [onObjectSelected]);

  const handleCheckpointClick = useCallback((index: number, checkpoint: FloorMap['checkpoints'][0]) => {
    const info: SelectedObjectInfo = {
      type: 'checkpoint',
      name: `Checkpoint ${index + 1}`,
      position: { x: checkpoint.x, y: 0.05, z: checkpoint.y },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'checkpoint', index });
    onObjectSelected?.(info);
  }, [onObjectSelected]);

  const handleBackgroundClick = useCallback(() => {
    setSelectedObject(null);
    setSelectedType({ type: '', index: null });
    onObjectSelected?.(null);
  }, [onObjectSelected]);

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        className="w-full h-full"
        onPointerMissed={handleBackgroundClick}
      >
        {/* Camera */}
        <PerspectiveCamera
          makeDefault
          position={CAMERA_PRESETS[cameraPreset].position}
          fov={50}
          near={0.1}
          far={100}
        />

        {/* Camera controller for transitions and follow mode */}
        <CameraController
          preset={cameraPreset}
          robotState={robotState}
          agentActivity={agentActivity}
          controlsRef={controlsRef}
          presetChangeCount={presetChangeCount}
        />

        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.3} />

        {/* Scene */}
        <ArenaFloor
          bounds={floorMap.bounds}
          isSelected={selectedType.type === 'floor'}
          onClick={handleFloorClick}
        />
        <Walls
          walls={floorMap.walls}
          selectedIndex={selectedType.type === 'wall' ? selectedType.index : null}
          onSelect={handleWallClick}
        />
        {floorMap.obstacles && (
          <Obstacles
            obstacles={floorMap.obstacles}
            selectedIndex={selectedType.type === 'obstacle' ? selectedType.index : null}
            onSelect={handleObstacleClick}
          />
        )}
        {floorMap.checkpoints && (
          <Checkpoints
            checkpoints={floorMap.checkpoints}
            selectedIndex={selectedType.type === 'checkpoint' ? selectedType.index : null}
            onSelect={handleCheckpointClick}
          />
        )}
        {floorMap.lines && <LineTrackRenderer lines={floorMap.lines} />}

        <RobotCube
          state={robotState}
          agentActivity={agentActivity}
          isSelected={selectedType.type === 'robot'}
          onClick={handleRobotClick}
        />

        {/* Planning animation */}
        <PlanningAnimation agentActivity={agentActivity} robotState={robotState} />

        {/* Mouse controls - enabled for all views */}
        <OrbitControls
          ref={controlsRef}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          maxPolarAngle={Math.PI / 2}
          minDistance={0.5}
          maxDistance={20}
          dampingFactor={0.05}
          enableDamping
        />

        {/* Background */}
        <color attach="background" args={['#0d1117']} />
        <fog attach="fog" args={['#0d1117', 5, 20]} />
      </Canvas>

      {/* Selection info panel overlay */}
      <SelectionInfoPanel selectedObject={selectedObject} />
    </div>
  );
}
