'use client';

import { useRef, useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { type CubeRobotState as SimulatorState, type FloorMap, type Collectible, type PushableObjectState, type DockZone } from '@/lib/hardware/cube-robot-simulator';
import { cameraCaptureManager, type CameraCapture } from '@/lib/runtime/camera-capture';
import { WorldModel, type WorldModelSnapshot } from '@/lib/runtime/world-model';
import { type RayFan, type TrajectoryPrediction, type PathExplorationResult } from '@/lib/runtime/navigation/ray-navigation';
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
  type: 'robot' | 'wall' | 'obstacle' | 'checkpoint' | 'floor' | 'collectible' | 'pushable' | 'dock-zone';
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
  collectedIds?: string[];  // IDs of already collected items (to hide them)
  worldModel?: WorldModel | null;  // World model for mini-map
  showMiniMap?: boolean;  // Whether to show the mini-map overlay
  onCameraCapture?: (capture: CameraCapture) => void;  // Callback when a screenshot is captured
  rayNavigation?: PathExplorationResult | null;  // Ray navigation data for visualization
  showRayVisualization?: boolean;  // Whether to show ray fan and trajectory
  pushableObjects?: PushableObjectState[];  // Runtime state of pushable objects
  dockZones?: DockZone[];  // Dock zones from the floor map
}

// Handle for external camera capture control
export interface RobotCanvas3DHandle {
  captureScreenshot: (type?: CameraCapture['type']) => CameraCapture | null;
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
  onClick,
  rayNavigation,
  showRayVisualization,
}: {
  state: SimulatorState | null;
  agentActivity?: AgentActivity;
  isSelected: boolean;
  onClick: () => void;
  rayNavigation?: PathExplorationResult | null;
  showRayVisualization?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cubeRef = useRef<THREE.Mesh>(null);
  const leftWheelRef = useRef<THREE.Mesh>(null);
  const rightWheelRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Track accumulated wheel rotation for animation
  const wheelRotationRef = useRef({ left: 0, right: 0 });

  useEffect(() => {
    if (groupRef.current && state) {
      groupRef.current.position.set(state.pose.x, 0, state.pose.y);
      // Physics rotation (CCW from +Y) maps directly to Three.js rotation.y
      // sin(θ) gives X component, cos(θ) gives Z component for forward direction
      // With rotation.y = θ, local +Z → world (sin(θ), 0, cos(θ)), matching physics forward
      groupRef.current.rotation.y = state.pose.rotation;
    }
  }, [state]);

  // Animate wheel rotation based on motor RPM
  useFrame((_, delta) => {
    if (state && leftWheelRef.current && rightWheelRef.current) {
      // Convert RPM to radians per second, then multiply by delta time
      const leftRotSpeed = (state.motors.leftRPM / 60) * Math.PI * 2;
      const rightRotSpeed = (state.motors.rightRPM / 60) * Math.PI * 2;

      // Accumulate rotation (wheels rotate around their local X axis when viewed from the side)
      wheelRotationRef.current.left += leftRotSpeed * delta;
      wheelRotationRef.current.right += rightRotSpeed * delta;

      // Apply rotation - wheels are oriented with rotation [0, 0, PI/2], so we rotate around local Y
      leftWheelRef.current.rotation.y = wheelRotationRef.current.left;
      rightWheelRef.current.rotation.y = wheelRotationRef.current.right;
    }
  });

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

      {/* Left wheel - with rotation animation and tread pattern */}
      <group position={[-0.035, 0.0163, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh ref={leftWheelRef} castShadow>
          <cylinderGeometry args={[0.0163, 0.0163, 0.01, 16]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Wheel tread marks for visual rotation feedback */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={`left-tread-${i}`} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[0.002, 0.011, 0.032]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {/* Wheel hub */}
        <mesh>
          <cylinderGeometry args={[0.006, 0.006, 0.012, 8]} />
          <meshStandardMaterial color="#4b5563" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* Right wheel - with rotation animation and tread pattern */}
      <group position={[0.035, 0.0163, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh ref={rightWheelRef} castShadow>
          <cylinderGeometry args={[0.0163, 0.0163, 0.01, 16]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Wheel tread marks for visual rotation feedback */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={`right-tread-${i}`} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[0.002, 0.011, 0.032]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {/* Wheel hub */}
        <mesh>
          <cylinderGeometry args={[0.006, 0.006, 0.012, 8]} />
          <meshStandardMaterial color="#4b5563" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

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

      {/* LOCAL Ray Visualization - attached to robot as child, uses local coordinates */}
      {showRayVisualization && state && (
        <LocalRayVisualization rayNavigation={rayNavigation} velocity={state.velocity} motors={state.motors} />
      )}
    </group>
  );
}

// Local ray visualization - renders rays in robot's local coordinate system
// As a child of the robot group, rays automatically move and rotate with the robot
function LocalRayVisualization({
  rayNavigation,
  velocity,
  motors,
}: {
  rayNavigation?: PathExplorationResult | null;
  velocity: { linear: number; angular: number };
  motors: { leftPWM: number; rightPWM: number; leftRPM: number; rightRPM: number };
}) {
  const frontArrowRef = useRef<THREE.Mesh>(null);
  const predictedArrowRef = useRef<THREE.Mesh>(null);
  const bestPathRef = useRef<THREE.Mesh>(null);

  // Animate the visualization
  useFrame((state) => {
    if (bestPathRef.current) {
      const scale = 1.0 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
      bestPathRef.current.scale.set(scale, 1, scale);
    }
    if (frontArrowRef.current) {
      const intensity = 0.8 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
      (frontArrowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
    if (predictedArrowRef.current) {
      const intensity = 0.6 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      (predictedArrowRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  });

  const rayHeight = 0.05; // Height above ground for ray visualization
  const maxRayLength = 2.0; // Max visualization length in meters

  // In LOCAL coordinates: robot is at origin, +Z is forward
  const linearVel = velocity.linear;
  const angularVel = velocity.angular;
  const predictedLength = Math.abs(linearVel) > 0.001 ? 0.3 : 0;

  const rayFan = rayNavigation?.rayFan;
  const prediction = rayNavigation?.prediction;
  const recommendedSteering = rayNavigation?.recommendedSteering;

  return (
    <group>
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* FRONT DIRECTION VECTOR - Cyan arrow (LOCAL: points in +Z direction) */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <group position={[0, rayHeight + 0.02, 0]}>
        {/* Arrow shaft pointing forward (+Z) */}
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.015, 0.008, 0.2]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00ffff"
            emissiveIntensity={0.6}
            transparent
            opacity={0.9}
          />
        </mesh>
        {/* Arrow head */}
        <mesh
          ref={frontArrowRef}
          position={[0, 0, 0.25]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[0.025, 0.06, 8]} />
          <meshStandardMaterial
            color="#00ffff"
            emissive="#00ffff"
            emissiveIntensity={0.8}
            transparent
            opacity={0.95}
          />
        </mesh>
        {/* "FRONT" label ring */}
        <mesh position={[0, 0, 0.28]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.03, 0.04, 16]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* PREDICTED MOVEMENT VECTOR - Yellow/orange arrow showing actual movement */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {predictedLength > 0 && (
        <group position={[0, rayHeight + 0.04, 0]}>
          {/* Predicted direction arrow shaft */}
          <mesh position={[0, 0, linearVel > 0 ? 0.08 : -0.08]}>
            <boxGeometry args={[0.012, 0.006, predictedLength * 0.6]} />
            <meshStandardMaterial
              color={linearVel > 0 ? '#ffaa00' : '#ff6600'}
              emissive={linearVel > 0 ? '#ffaa00' : '#ff6600'}
              emissiveIntensity={0.5}
              transparent
              opacity={0.85}
            />
          </mesh>
          {/* Predicted direction arrow head */}
          <mesh
            ref={predictedArrowRef}
            position={[0, 0, linearVel > 0 ? 0.18 : -0.18]}
            rotation={[linearVel > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]}
          >
            <coneGeometry args={[0.02, 0.05, 6]} />
            <meshStandardMaterial
              color={linearVel > 0 ? '#ffaa00' : '#ff6600'}
              emissive={linearVel > 0 ? '#ffaa00' : '#ff6600'}
              emissiveIntensity={0.6}
              transparent
              opacity={0.9}
            />
          </mesh>
        </group>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* ANGULAR VELOCITY INDICATOR - Shows turning direction */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {Math.abs(angularVel) > 0.05 && (
        <group position={[0, rayHeight + 0.06, 0]}>
          {/* Curved arrow indicating rotation direction - flat on XZ plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.06, 0.008, 8, 16, Math.PI * 0.7]} />
            <meshStandardMaterial
              color={angularVel > 0 ? '#00ff88' : '#ff8800'}
              emissive={angularVel > 0 ? '#00ff88' : '#ff8800'}
              emissiveIntensity={0.6}
              transparent
              opacity={0.8}
            />
          </mesh>
          {/* Arrow tip on torus */}
          <mesh
            position={[
              Math.cos(angularVel > 0 ? Math.PI * 0.35 : -Math.PI * 0.35) * 0.06,
              0,
              Math.sin(angularVel > 0 ? Math.PI * 0.35 : -Math.PI * 0.35) * 0.06
            ]}
            rotation={[0, angularVel > 0 ? -Math.PI * 0.15 : Math.PI * 0.15, -Math.PI / 2]}
          >
            <coneGeometry args={[0.015, 0.03, 6]} />
            <meshStandardMaterial
              color={angularVel > 0 ? '#00ff88' : '#ff8800'}
              emissive={angularVel > 0 ? '#00ff88' : '#ff8800'}
              emissiveIntensity={0.7}
            />
          </mesh>
        </group>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* RAY FAN VISUALIZATION - Distance sensor rays (LOCAL coordinates) */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {rayFan && rayFan.rays.map((ray, idx) => {
        const rayLength = Math.min(ray.distance / 100, maxRayLength); // Convert cm to m
        // LOCAL coordinates: use ray.angle directly (relative to robot front)
        // Robot faces +Z, so sin gives X offset, cos gives Z offset
        const endX = Math.sin(ray.angle) * rayLength;
        const endZ = Math.cos(ray.angle) * rayLength;

        // Color based on clearance: green = clear, red = blocked, yellow = close
        let color = '#3fb950'; // Green - clear
        if (!ray.clear) {
          color = '#f85149'; // Red - blocked
        } else if (ray.distance < 50) {
          color = '#d29922'; // Yellow - caution
        }

        const points = new Float32Array([
          0, rayHeight, 0,           // Start at robot center (local origin)
          endX, rayHeight, endZ      // End at ray endpoint
        ]);

        return (
          <line key={`ray-${idx}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={points}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={ray.clear ? 0.6 : 0.8}
              linewidth={ray.clear ? 1 : 2}
            />
          </line>
        );
      })}

      {/* Best path indicator - cone pointing in best direction (LOCAL) */}
      {rayFan && rayFan.bestPath && (
        <group
          position={[
            Math.sin(rayFan.bestPath.centerAngle) * 0.15,
            rayHeight + 0.02,
            Math.cos(rayFan.bestPath.centerAngle) * 0.15
          ]}
          rotation={[Math.PI / 2, 0, -rayFan.bestPath.centerAngle]}
        >
          <mesh ref={bestPathRef}>
            <coneGeometry args={[0.03, 0.08, 8]} />
            <meshStandardMaterial
              color="#58a6ff"
              emissive="#58a6ff"
              emissiveIntensity={0.8}
              transparent
              opacity={0.9}
            />
          </mesh>
        </group>
      )}

      {/* Alternative paths visualization (dimmer) - LOCAL coordinates */}
      {rayFan && rayFan.alternativePaths.slice(0, 2).map((path, idx) => {
        const pathLength = Math.min(path.clearance / 100, maxRayLength * 0.7);
        const endX = Math.sin(path.centerAngle) * pathLength;
        const endZ = Math.cos(path.centerAngle) * pathLength;

        return (
          <line key={`alt-path-${idx}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  0, rayHeight - 0.01, 0,
                  endX, rayHeight - 0.01, endZ
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color="#a371f7"
              transparent
              opacity={0.3}
            />
          </line>
        );
      })}

      {/* Steering direction indicator */}
      {recommendedSteering && Math.abs(recommendedSteering.leftMotor - recommendedSteering.rightMotor) > 5 && (
        <mesh
          position={[0, rayHeight + 0.08, 0]}
          rotation={[
            0,
            recommendedSteering.leftMotor > recommendedSteering.rightMotor ? Math.PI / 4 : -Math.PI / 4,
            0
          ]}
        >
          <boxGeometry args={[0.02, 0.01, 0.04]} />
          <meshBasicMaterial
            color={recommendedSteering.leftMotor > recommendedSteering.rightMotor ? '#3fb950' : '#58a6ff'}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* WHEEL VELOCITY INDICATORS - Show wheel speeds */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {(motors.leftPWM !== 0 || motors.rightPWM !== 0) && (
        <group position={[0, 0.02, 0]}>
          {/* Left wheel velocity bar */}
          <mesh position={[-0.06, 0, 0]}>
            <boxGeometry args={[0.015, 0.005, Math.abs(motors.leftPWM) / 255 * 0.1 + 0.01]} />
            <meshStandardMaterial
              color={motors.leftPWM >= 0 ? '#00ff00' : '#ff0000'}
              emissive={motors.leftPWM >= 0 ? '#00ff00' : '#ff0000'}
              emissiveIntensity={0.5}
            />
          </mesh>
          {/* Right wheel velocity bar */}
          <mesh position={[0.06, 0, 0]}>
            <boxGeometry args={[0.015, 0.005, Math.abs(motors.rightPWM) / 255 * 0.1 + 0.01]} />
            <meshStandardMaterial
              color={motors.rightPWM >= 0 ? '#00ff00' : '#ff0000'}
              emissive={motors.rightPWM >= 0 ? '#00ff00' : '#ff0000'}
              emissiveIntensity={0.5}
            />
          </mesh>
          {/* Labels */}
          <mesh position={[-0.06, 0.015, 0]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
          <mesh position={[0.06, 0.015, 0]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshBasicMaterial color="#888888" />
          </mesh>
        </group>
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

// Create hazard stripe texture (yellow and black diagonal lines)
function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Fill with yellow background
  ctx.fillStyle = '#FFD700'; // Gold/yellow
  ctx.fillRect(0, 0, 64, 64);

  // Draw black diagonal stripes
  ctx.strokeStyle = '#1a1a1a'; // Near black
  ctx.lineWidth = 12;

  // Draw multiple diagonal lines to create stripe pattern
  for (let i = -64; i < 128; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1); // Repeat pattern along wall length

  return texture;
}

// Wall components with hazard stripe pattern (yellow/black diagonal lines)
// This makes walls clearly distinguishable from the sky for robot vision
function Walls({
  walls,
  selectedIndex,
  onSelect
}: {
  walls: FloorMap['walls'];
  selectedIndex: number | null;
  onSelect: (index: number, wall: FloorMap['walls'][0]) => void;
}) {
  // Create hazard stripe texture once and reuse
  const hazardTexture = useMemo(() => createHazardStripeTexture(), []);

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
                map={hazardTexture}
                color={isSelected ? '#ffffff' : '#eeeeee'}
                emissive={isSelected ? '#FFD700' : '#aa8800'}
                emissiveIntensity={isSelected ? 0.4 : 0.15}
                metalness={0.2}
                roughness={0.6}
              />
            </mesh>
            {isSelected && (
              <mesh position={[centerX, 0.15, centerY]} rotation={[0, angle, 0]}>
                <boxGeometry args={[length + 0.02, 0.32, 0.07]} />
                <meshBasicMaterial color="#FFD700" transparent opacity={0.3} side={THREE.BackSide} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// Create obstacle hazard texture (red and white diagonal lines)
// Uses contrasting colors to distinguish obstacles from walls for AI detection
function createObstacleHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Fill with red background
  ctx.fillStyle = '#e53935'; // Bright red
  ctx.fillRect(0, 0, 64, 64);

  // Draw white diagonal stripes (opposite direction from walls for distinction)
  ctx.strokeStyle = '#ffffff'; // White
  ctx.lineWidth = 10;

  // Draw diagonal lines in opposite direction (right-to-left instead of left-to-right)
  for (let i = -64; i < 128; i += 20) {
    ctx.beginPath();
    ctx.moveTo(64 - i, 0);
    ctx.lineTo(-i, 64);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3); // Repeat pattern around cylinder

  return texture;
}

// Obstacle components with hazard stripe pattern (red/white diagonal lines)
// This makes obstacles clearly distinguishable from walls for robot vision
function Obstacles({
  obstacles,
  selectedIndex,
  onSelect
}: {
  obstacles: FloorMap['obstacles'];
  selectedIndex: number | null;
  onSelect: (index: number, obstacle: FloorMap['obstacles'][0]) => void;
}) {
  // Create obstacle hazard texture once and reuse
  const obstacleTexture = useMemo(() => createObstacleHazardTexture(), []);

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
                map={obstacleTexture}
                color={isSelected ? '#ffffff' : '#eeeeee'}
                emissive={isSelected ? '#ff4444' : '#cc0000'}
                emissiveIntensity={isSelected ? 0.4 : 0.2}
                metalness={0.3}
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

// Collectibles rendering (coins, balls, gems, stars)
function CollectiblesRenderer({
  collectibles,
  collectedIds,
  selectedId,
  onSelect
}: {
  collectibles: Collectible[];
  collectedIds: string[];
  selectedId: string | null;
  onSelect: (collectible: Collectible) => void;
}) {
  if (!collectibles || collectibles.length === 0) return null;

  // Filter out already collected items
  const visibleCollectibles = collectibles.filter(c => !collectedIds.includes(c.id));

  return (
    <group>
      {visibleCollectibles.map((collectible) => {
        const isSelected = selectedId === collectible.id;
        const color = collectible.color || getDefaultColor(collectible.type);
        const height = getCollectibleHeight(collectible.type, collectible.radius);

        return (
          <group key={collectible.id}>
            <CollectibleMesh
              collectible={collectible}
              color={color}
              height={height}
              isSelected={isSelected}
              onSelect={onSelect}
            />
          </group>
        );
      })}
    </group>
  );
}

// Get default color based on collectible type
function getDefaultColor(type: Collectible['type']): string {
  switch (type) {
    case 'coin': return '#FFD700';
    case 'ball': return '#FF6B6B';
    case 'gem': return '#9B59B6';
    case 'star': return '#FFD700';
    default: return '#FFD700';
  }
}

// Get collectible display height
function getCollectibleHeight(type: Collectible['type'], radius: number): number {
  switch (type) {
    case 'coin': return 0.02;
    case 'ball': return radius;
    case 'gem': return radius * 1.5;
    case 'star': return 0.02;
    default: return radius;
  }
}

// Individual collectible mesh with animation
function CollectibleMesh({
  collectible,
  color,
  height,
  isSelected,
  onSelect
}: {
  collectible: Collectible;
  color: string;
  height: number;
  isSelected: boolean;
  onSelect: (collectible: Collectible) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Floating and rotating animation
  useFrame((state) => {
    if (meshRef.current) {
      // Float up and down
      meshRef.current.position.y = height + Math.sin(state.clock.elapsedTime * 2 + collectible.x * 10) * 0.02;

      // Rotate coins and stars
      if (collectible.type === 'coin' || collectible.type === 'star') {
        meshRef.current.rotation.y += 0.02;
      }
      // Gems rotate slower
      if (collectible.type === 'gem') {
        meshRef.current.rotation.y += 0.01;
      }
    }
  });

  const renderGeometry = () => {
    switch (collectible.type) {
      case 'coin':
        return <cylinderGeometry args={[collectible.radius, collectible.radius, 0.015, 16]} />;
      case 'ball':
        return <sphereGeometry args={[collectible.radius, 16, 16]} />;
      case 'gem':
        return <octahedronGeometry args={[collectible.radius]} />;
      case 'star':
        // Simplified star using a dodecahedron
        return <dodecahedronGeometry args={[collectible.radius]} />;
      default:
        return <sphereGeometry args={[collectible.radius, 16, 16]} />;
    }
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[collectible.x, height, collectible.y]}
        onClick={(e) => { e.stopPropagation(); onSelect(collectible); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
        userData={{ type: 'collectible', name: `${collectible.type} (${collectible.id})` }}
        castShadow
      >
        {renderGeometry()}
        <meshStandardMaterial
          color={isSelected || hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.8 : hovered ? 0.6 : 0.4}
          metalness={collectible.type === 'coin' ? 0.8 : 0.3}
          roughness={collectible.type === 'gem' ? 0.1 : 0.3}
        />
      </mesh>

      {/* Glow effect underneath */}
      <mesh
        position={[collectible.x, 0.005, collectible.y]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[collectible.radius * 1.5, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.5 : hovered ? 0.4 : 0.2}
        />
      </mesh>

      {/* Selection ring */}
      {(isSelected || hovered) && (
        <mesh
          position={[collectible.x, 0.006, collectible.y]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[collectible.radius * 1.6, collectible.radius * 1.8, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#58a6ff' : '#8b949e'}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Point light for glow */}
      <pointLight
        position={[collectible.x, height + 0.05, collectible.y]}
        color={color}
        intensity={isSelected ? 0.5 : 0.2}
        distance={0.3}
      />
    </group>
  );
}

// Pushable object rendering (physics-based cubes)
function PushableObjectsRenderer({
  objects,
  selectedId,
  onSelect,
}: {
  objects: PushableObjectState[];
  selectedId: string | null;
  onSelect: (obj: PushableObjectState) => void;
}) {
  if (!objects || objects.length === 0) return null;

  return (
    <group>
      {objects.map((obj) => (
        <PushableObjectMesh
          key={obj.id}
          object={obj}
          isSelected={selectedId === obj.id}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

// Individual pushable object with physics animation
function PushableObjectMesh({
  object: obj,
  isSelected,
  onSelect,
}: {
  object: PushableObjectState;
  isSelected: boolean;
  onSelect: (obj: PushableObjectState) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const halfSize = obj.size / 2;
  const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);

  // Animate: slight wobble when moving
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.set(obj.x, halfSize, obj.y);
      // Wobble when moving
      if (speed > 0.01) {
        const wobble = Math.sin(state.clock.elapsedTime * 8) * 0.05 * Math.min(speed * 5, 1);
        meshRef.current.rotation.x = wobble;
        meshRef.current.rotation.z = wobble * 0.7;
      } else {
        meshRef.current.rotation.x *= 0.9;
        meshRef.current.rotation.z *= 0.9;
      }
    }
  });

  return (
    <group>
      {/* The pushable cube */}
      <mesh
        ref={meshRef}
        position={[obj.x, halfSize, obj.y]}
        castShadow
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onSelect(obj); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
        userData={{ type: 'pushable', name: obj.label || obj.id }}
      >
        <boxGeometry args={[obj.size, obj.size, obj.size]} />
        <meshStandardMaterial
          color={isSelected || hovered ? '#ffffff' : obj.color}
          emissive={obj.color}
          emissiveIntensity={isSelected ? 0.8 : hovered ? 0.6 : 0.3}
          metalness={0.2}
          roughness={0.4}
        />
      </mesh>

      {/* Selection/hover outline */}
      {(isSelected || hovered) && (
        <mesh position={[obj.x, halfSize, obj.y]}>
          <boxGeometry args={[obj.size + 0.02, obj.size + 0.02, obj.size + 0.02]} />
          <meshBasicMaterial
            color={isSelected ? '#58a6ff' : '#8b949e'}
            transparent
            opacity={0.3}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {/* Shadow/glow on floor */}
      <mesh
        position={[obj.x, 0.003, obj.y]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[obj.size * 0.8, 16]} />
        <meshBasicMaterial
          color={obj.color}
          transparent
          opacity={isSelected ? 0.4 : 0.15}
        />
      </mesh>

      {/* Point light for glow */}
      <pointLight
        position={[obj.x, obj.size + 0.05, obj.y]}
        color={obj.color}
        intensity={isSelected ? 0.4 : 0.15}
        distance={0.5}
      />

      {/* Docked indicator */}
      {obj.dockedIn && (
        <mesh
          position={[obj.x, obj.size + 0.03, obj.y]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[obj.size * 0.5, obj.size * 0.6, 16]} />
          <meshBasicMaterial color="#4caf50" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// Dock zone rendering (target area on the floor)
function DockZonesRenderer({
  dockZones,
  dockedObjectIds,
  selectedId,
  onSelect,
}: {
  dockZones: DockZone[];
  dockedObjectIds: Map<string, string[]>; // dockId -> objectIds[]
  selectedId: string | null;
  onSelect: (dz: DockZone) => void;
}) {
  if (!dockZones || dockZones.length === 0) return null;

  return (
    <group>
      {dockZones.map((dz) => (
        <DockZoneMesh
          key={dz.id}
          dockZone={dz}
          isSelected={selectedId === dz.id}
          hasDockedObject={(dockedObjectIds.get(dz.id) || []).length > 0}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

// Individual dock zone mesh
function DockZoneMesh({
  dockZone: dz,
  isSelected,
  hasDockedObject,
  onSelect,
}: {
  dockZone: DockZone;
  isSelected: boolean;
  hasDockedObject: boolean;
  onSelect: (dz: DockZone) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const borderRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // Pulsing animation for the dock zone
  useFrame((state) => {
    if (borderRef.current) {
      const pulse = hasDockedObject
        ? 0.9 + Math.sin(state.clock.elapsedTime * 2) * 0.1
        : 0.7 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      (borderRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * (isSelected ? 0.9 : 0.6);
    }
  });

  return (
    <group>
      {/* Dock zone floor plane */}
      <mesh
        ref={meshRef}
        position={[dz.x, 0.004, dz.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onSelect(dz); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
        userData={{ type: 'dock-zone', name: dz.label || dz.id }}
      >
        <planeGeometry args={[dz.width, dz.height]} />
        <meshStandardMaterial
          color={dz.color}
          transparent
          opacity={hasDockedObject ? 0.5 : isSelected ? 0.4 : hovered ? 0.35 : 0.25}
          emissive={dz.color}
          emissiveIntensity={hasDockedObject ? 0.4 : 0.2}
        />
      </mesh>

      {/* Border outline */}
      <mesh
        ref={borderRef}
        position={[dz.x, 0.005, dz.y]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[
          Math.min(dz.width, dz.height) / 2 - 0.02,
          Math.min(dz.width, dz.height) / 2,
          4
        ]} />
        <meshBasicMaterial
          color={dz.color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Corner markers */}
      {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([cx, cy], i) => (
        <mesh
          key={i}
          position={[
            dz.x + cx * dz.width / 2,
            0.01,
            dz.y + cy * dz.height / 2
          ]}
        >
          <boxGeometry args={[0.03, 0.02, 0.03]} />
          <meshStandardMaterial
            color={dz.color}
            emissive={dz.color}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}

      {/* Success glow when object is docked */}
      {hasDockedObject && (
        <pointLight
          position={[dz.x, 0.2, dz.y]}
          color={dz.color}
          intensity={0.5}
          distance={1}
        />
      )}
    </group>
  );
}

// Canvas capture registration component
function CanvasCaptureRegistration() {
  const { gl } = useThree();

  useEffect(() => {
    if (gl.domElement) {
      cameraCaptureManager.registerCanvas(gl.domElement);
    }
    return () => {
      cameraCaptureManager.unregisterCanvas();
    };
  }, [gl]);

  return null;
}

// Mini-map overlay component (rendered outside Canvas as HTML)
function MiniMap({
  worldModel,
  robotState,
  size = 150,
}: {
  worldModel: WorldModel | null;
  robotState: SimulatorState | null;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !worldModel) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, size, size);

    // Get mini-map data
    const mapData = worldModel.generateMiniMapData(size);

    // Draw cells
    for (const cell of mapData.cells) {
      let color = '#1a1a2e';
      switch (cell.state) {
        case 'free': color = '#2d333b'; break;
        case 'explored': color = '#3fb950'; break;
        case 'obstacle': color = '#f85149'; break;
        case 'wall': color = '#FFD700'; break; // Yellow hazard color to match 3D walls
        case 'collectible': color = '#ffd700'; break;
        case 'collected': color = '#6e7681'; break;
      }

      const alpha = 0.3 + cell.confidence * 0.7;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(cell.x, cell.y, 2, 2);
    }

    ctx.globalAlpha = 1;

    // Draw robot position
    if (mapData.robotPosition) {
      const { x, y, rotation } = mapData.robotPosition;

      // Draw robot as a triangle pointing in direction
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rotation);

      ctx.fillStyle = '#a371f7';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-3, 4);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fill();

      // Glow effect
      ctx.strokeStyle = '#a371f7';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    }

    // Draw border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);

  }, [worldModel, robotState, size]);

  if (!worldModel) return null;

  const progress = (worldModel.getExplorationProgress() * 100).toFixed(0);

  return (
    <div className="absolute top-4 right-4 bg-[#0d1117]/90 backdrop-blur-sm border border-[#30363d] rounded-lg p-2 shadow-xl">
      <div className="text-[10px] text-[#8b949e] mb-1 flex items-center justify-between">
        <span>World Model</span>
        <span className="text-[#3fb950]">{progress}% explored</span>
      </div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="mt-1 flex items-center gap-2 text-[8px] text-[#6e7681]">
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-[#3fb950] rounded-sm" /> Explored
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-[#f85149] rounded-sm" /> Obstacle
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-[#a371f7] rounded-sm" /> Robot
        </span>
      </div>
    </div>
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

    // Follow mode - camera follows robot from behind
    if (preset === 'follow' && robotState && !isTransitioningRef.current) {
      // Camera positioned behind robot: robot.pos - forward_direction * distance
      // Forward direction = (sin(θ), 0, cos(θ))
      const targetPos = new THREE.Vector3(
        robotState.pose.x - Math.sin(robotState.pose.rotation) * 2.5,
        2.5,
        robotState.pose.y - Math.cos(robotState.pose.rotation) * 2.5
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
    collectible: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
    pushable: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
    'dock-zone': 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
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

const RobotCanvas3D = forwardRef<RobotCanvas3DHandle, RobotCanvas3DProps>(function RobotCanvas3D({
  robotState,
  floorMap,
  cameraPreset,
  onArenaClick,
  agentActivity,
  onObjectSelected,
  collectedIds = [],
  worldModel = null,
  showMiniMap = false,
  onCameraCapture,
  rayNavigation = null,
  showRayVisualization = false,
  pushableObjects = [],
  dockZones = [],
}, ref) {
  const controlsRef = useRef<any>(null);
  const [selectedObject, setSelectedObject] = useState<SelectedObjectInfo | null>(null);
  const [selectedType, setSelectedType] = useState<{ type: string; index: number | null; id?: string }>({ type: '', index: null });
  const [presetChangeCount, setPresetChangeCount] = useState(0);
  const lastPresetRef = useRef(cameraPreset);

  // Expose capture method via ref
  useImperativeHandle(ref, () => ({
    captureScreenshot: (type: CameraCapture['type'] = 'follower') => {
      const capture = cameraCaptureManager.capture(
        type,
        robotState ? {
          x: robotState.pose.x,
          y: robotState.pose.y,
          rotation: robotState.pose.rotation,
        } : undefined,
        { width: 320, height: 240, quality: 0.85 }
      );
      if (capture && onCameraCapture) {
        onCameraCapture(capture);
      }
      return capture;
    },
  }), [robotState, onCameraCapture]);

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

  const handleCollectibleClick = useCallback((collectible: Collectible) => {
    const info: SelectedObjectInfo = {
      type: 'collectible',
      name: `${collectible.type.charAt(0).toUpperCase() + collectible.type.slice(1)} (${collectible.id})`,
      position: { x: collectible.x, y: collectible.radius, z: collectible.y },
      data: {
        type: collectible.type,
        points: collectible.points ?? 10,
        radius: `${(collectible.radius * 100).toFixed(0)}cm`,
      },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'collectible', index: null, id: collectible.id });
    onObjectSelected?.(info);
  }, [onObjectSelected]);

  const handlePushableClick = useCallback((obj: PushableObjectState) => {
    const info: SelectedObjectInfo = {
      type: 'pushable',
      name: obj.label || obj.id,
      position: { x: obj.x, y: obj.size / 2, z: obj.y },
      data: {
        size: `${(obj.size * 100).toFixed(0)}cm`,
        mass: `${(obj.mass * 1000).toFixed(0)}g`,
        velocity: `${Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy).toFixed(3)} m/s`,
        docked: obj.dockedIn || 'none',
      },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'pushable', index: null, id: obj.id });
    onObjectSelected?.(info);
  }, [onObjectSelected]);

  const handleDockZoneClick = useCallback((dz: DockZone) => {
    const info: SelectedObjectInfo = {
      type: 'dock-zone',
      name: dz.label || dz.id,
      position: { x: dz.x, y: 0, z: dz.y },
      data: {
        width: `${(dz.width * 100).toFixed(0)}cm`,
        height: `${(dz.height * 100).toFixed(0)}cm`,
      },
    };
    setSelectedObject(info);
    setSelectedType({ type: 'dock-zone', index: null, id: dz.id });
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
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
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

        {/* Collectibles (coins, balls, gems, stars) */}
        {floorMap.collectibles && floorMap.collectibles.length > 0 && (
          <CollectiblesRenderer
            collectibles={floorMap.collectibles}
            collectedIds={collectedIds}
            selectedId={selectedType.type === 'collectible' ? selectedType.id || null : null}
            onSelect={handleCollectibleClick}
          />
        )}

        {/* Dock zones (target areas on the floor) - render before pushable objects */}
        {dockZones.length > 0 && (
          <DockZonesRenderer
            dockZones={dockZones}
            dockedObjectIds={new Map(
              dockZones.map(dz => [
                dz.id,
                pushableObjects.filter(obj => obj.dockedIn === dz.id).map(obj => obj.id)
              ])
            )}
            selectedId={selectedType.type === 'dock-zone' ? selectedType.id || null : null}
            onSelect={handleDockZoneClick}
          />
        )}

        {/* Pushable objects (physics cubes) */}
        {pushableObjects.length > 0 && (
          <PushableObjectsRenderer
            objects={pushableObjects}
            selectedId={selectedType.type === 'pushable' ? selectedType.id || null : null}
            onSelect={handlePushableClick}
          />
        )}

        <RobotCube
          state={robotState}
          agentActivity={agentActivity}
          isSelected={selectedType.type === 'robot'}
          onClick={handleRobotClick}
          rayNavigation={rayNavigation}
          showRayVisualization={showRayVisualization}
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

        {/* Canvas capture registration */}
        <CanvasCaptureRegistration />

        {/* Background */}
        <color attach="background" args={['#0d1117']} />
        <fog attach="fog" args={['#0d1117', 5, 20]} />
      </Canvas>

      {/* Selection info panel overlay */}
      <SelectionInfoPanel selectedObject={selectedObject} />

      {/* Mini-map overlay showing world model */}
      {showMiniMap && (
        <MiniMap worldModel={worldModel} robotState={robotState} size={150} />
      )}
    </div>
  );
});

export default RobotCanvas3D;
