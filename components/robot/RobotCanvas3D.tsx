'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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
 * - Real-time updates from simulator or telemetry
 */

interface RobotCanvas3DProps {
  robotState: SimulatorState | null;
  floorMap: FloorMap;
  cameraPreset: 'top-down' | 'isometric' | 'follow' | 'side';
  onArenaClick?: (x: number, y: number) => void;
}

// Camera positions for each preset
const CAMERA_PRESETS = {
  'top-down': { position: [0, 5, 0.01] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
  'isometric': { position: [3, 3, 3] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
  'follow': { position: [0, 2, 2] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
  'side': { position: [4, 1, 0] as [number, number, number], lookAt: [0, 0, 0] as [number, number, number] },
};

// Robot cube component
function RobotCube({ state }: { state: SimulatorState | null }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (meshRef.current && state) {
      meshRef.current.position.set(state.pose.x, 0.04, state.pose.y);
      meshRef.current.rotation.y = -state.pose.rotation; // Negative for correct orientation
    }
  }, [state]);

  const ledColor = state
    ? `rgb(${state.led.r}, ${state.led.g}, ${state.led.b})`
    : '#58a6ff';

  return (
    <mesh ref={meshRef} position={[0, 0.04, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.08, 0.08, 0.08]} />
      <meshStandardMaterial
        color={ledColor}
        emissive={ledColor}
        emissiveIntensity={0.5}
        metalness={0.6}
        roughness={0.2}
      />
    </mesh>
  );
}

// Arena floor component with custom grid
function ArenaFloor({ bounds }: { bounds: FloorMap['bounds'] }) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Create grid lines manually
  const gridLines = useMemo(() => {
    const lines = [];
    const step = 0.5;

    // Vertical lines
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

    // Horizontal lines
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
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Grid lines */}
      {gridLines}
    </group>
  );
}

// Wall components
function Walls({ walls }: { walls: FloorMap['walls'] }) {
  return (
    <group>
      {walls.map((wall, idx) => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const centerX = (wall.x1 + wall.x2) / 2;
        const centerY = (wall.y1 + wall.y2) / 2;

        return (
          <mesh
            key={idx}
            position={[centerX, 0.15, centerY]}
            rotation={[0, angle, 0]}
            castShadow
          >
            <boxGeometry args={[length, 0.3, 0.05]} />
            <meshStandardMaterial
              color="#30363d"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Obstacle components
function Obstacles({ obstacles }: { obstacles: FloorMap['obstacles'] }) {
  return (
    <group>
      {obstacles.map((obstacle, idx) => (
        <mesh
          key={idx}
          position={[obstacle.x, obstacle.radius / 2, obstacle.y]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[obstacle.radius, obstacle.radius, obstacle.radius, 16]} />
          <meshStandardMaterial
            color="#f85149"
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

// Checkpoint markers
function Checkpoints({ checkpoints }: { checkpoints: FloorMap['checkpoints'] }) {
  return (
    <group>
      {checkpoints.map((checkpoint, idx) => (
        <mesh
          key={idx}
          position={[checkpoint.x, 0.05, checkpoint.y]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.15, 16]} />
          <meshStandardMaterial
            color="#3fb950"
            transparent
            opacity={0.6}
            emissive="#3fb950"
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

// Line track rendering
function LineTrack({ lines }: { lines: FloorMap['lines'] }) {
  if (!lines || lines.length === 0) return null;

  return (
    <group>
      {lines.map((line, idx) => (
        <mesh
          key={idx}
          position={[line.x, 0.002, line.y]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.015, 8]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      ))}
    </group>
  );
}

// Camera controller with presets
function CameraController({ preset, robotState }: { preset: string; robotState: SimulatorState | null }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const config = CAMERA_PRESETS[preset as keyof typeof CAMERA_PRESETS];

  useFrame(() => {
    if (cameraRef.current && config) {
      // Smooth camera transitions
      if (preset === 'follow' && robotState) {
        // Follow mode: camera follows robot
        const targetPos = new THREE.Vector3(
          robotState.pose.x - Math.sin(robotState.pose.rotation) * 2,
          2,
          robotState.pose.y + Math.cos(robotState.pose.rotation) * 2
        );
        cameraRef.current.position.lerp(targetPos, 0.1);
        cameraRef.current.lookAt(robotState.pose.x, 0, robotState.pose.y);
      } else {
        // Static presets
        const targetPos = new THREE.Vector3(...config.position);
        cameraRef.current.position.lerp(targetPos, 0.1);
      }
    }
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={config.position}
      fov={50}
      near={0.1}
      far={100}
    />
  );
}

export default function RobotCanvas3D({
  robotState,
  floorMap,
  cameraPreset,
  onArenaClick,
}: RobotCanvas3DProps) {
  const handleCanvasClick = (event: THREE.Intersection) => {
    if (event.point && onArenaClick) {
      onArenaClick(event.point.x, event.point.z);
    }
  };

  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      className="w-full h-full"
    >
      {/* Camera */}
      <CameraController preset={cameraPreset} robotState={robotState} />

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
      <ArenaFloor bounds={floorMap.bounds} />
      <Walls walls={floorMap.walls} />
      {floorMap.obstacles && <Obstacles obstacles={floorMap.obstacles} />}
      {floorMap.checkpoints && <Checkpoints checkpoints={floorMap.checkpoints} />}
      {floorMap.lines && <LineTrack lines={floorMap.lines} />}
      <RobotCube state={robotState} />

      {/* Controls - Only enable for non-follow mode */}
      {cameraPreset !== 'follow' && (
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          maxPolarAngle={Math.PI / 2}
          minDistance={1}
          maxDistance={15}
        />
      )}

      {/* Background */}
      <color attach="background" args={['#0d1117']} />
      <fog attach="fog" args={['#0d1117', 5, 20]} />
    </Canvas>
  );
}
