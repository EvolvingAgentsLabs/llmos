'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, Radio, Wifi, Camera, Maximize2, Settings, Cpu, Bot, Coins, Star, Trophy, Layers, Move, Map, Eye, ChevronDown, Brain } from 'lucide-react';
import { WorldModel, type CellState } from '@/lib/runtime/world-model';
import { createCubeRobotSimulator, type CubeRobotState as SimulatorState, type FloorMap, FLOOR_MAPS, type Collectible } from '@/lib/hardware/cube-robot-simulator';
import { getDeviceManager, type DeviceTelemetry } from '@/lib/hardware/esp32-device-manager';
import dynamic from 'next/dynamic';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { cameraCaptureManager } from '@/lib/runtime/camera-capture';
import { getRayNavigationSystem, type PathExplorationResult } from '@/lib/runtime/navigation/ray-navigation';

// Lazy load vision test fixture button
const VisionTestFixtureButton = dynamic(() => import('./VisionTestFixtureButton'), { ssr: false });

// Lazy load 3D canvas for better performance
const RobotCanvas3D = dynamic(() => import('./RobotCanvas3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#0d1117] to-[#161b22]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-[#58a6ff] rounded-lg shadow-lg shadow-[#58a6ff]/50 flex items-center justify-center text-2xl animate-pulse">
          🤖
        </div>
        <p className="text-sm text-[#8b949e]">Loading 3D World...</p>
      </div>
    </div>
  ),
});

/**
 * RobotWorldPanel - The central 3D workspace for robot programming
 *
 * This panel shows:
 * - 3D visualization of robot in arena (simulation or real)
 * - Real-time robot position, orientation, sensor data
 * - Camera controls for different viewpoints
 * - Sim/Real toggle for execution environment
 * - Record/replay for telemetry
 *
 * Conceptual model:
 * - Robot = Physical AI Agent
 * - Chat programs the robot (generates firmware)
 * - 3D view shows robot executing autonomously
 * - User/Team volumes organize robot programs
 */

type ExecutionMode = 'simulation' | 'real-robot' | 'replay';
type CameraPreset = 'top-down' | 'isometric' | 'follow' | 'side';

// PiP (Picture-in-Picture) configuration
type PiPViewType = 'top-down' | 'robot-camera' | 'world-model';

interface PiPConfig {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: 'small' | 'medium' | 'large';
  view: PiPViewType;
}

type AgentPhase = 'idle' | 'analyzing' | 'planning' | 'voting' | 'executing' | 'sub-agent-execution' | 'completed';

interface AgentActivity {
  phase: AgentPhase;
  activeAgents: number;
  isLoading: boolean;
}

interface RobotWorldPanelProps {
  currentMap?: string; // e.g., 'standard5x5Empty'
  deviceId?: string | null; // Optional device ID to sync with robot agent
  onRobotClick?: () => void;
  onArenaClick?: (x: number, y: number) => void;
  agentActivity?: AgentActivity;
  robotAgentName?: string; // Name of the selected/created robot agent to display
  worldModel?: WorldModel | null; // Robot's cognitive world model for visualization
}

// PiP (Picture-in-Picture) Top-Down View Component
function PiPTopView({
  robotState,
  floorMap,
  position,
  size,
  onDrag,
}: {
  robotState: SimulatorState | null;
  floorMap: FloorMap;
  position: PiPConfig['position'];
  size: PiPConfig['size'];
  onDrag?: (position: PiPConfig['position']) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Size mapping
  const sizeMap = {
    small: { width: 120, height: 120 },
    medium: { width: 160, height: 160 },
    large: { width: 200, height: 200 },
  };
  const { width, height } = sizeMap[size];

  // Position mapping
  const positionStyles: Record<PiPConfig['position'], string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-16 left-4',
    'bottom-right': 'bottom-16 right-4',
  };

  // Render top-down view on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Calculate scale to fit arena in canvas
    const bounds = floorMap.bounds;
    const arenaWidth = bounds.maxX - bounds.minX;
    const arenaHeight = bounds.maxY - bounds.minY;
    const scale = Math.min((width - 20) / arenaWidth, (height - 20) / arenaHeight);
    const offsetX = (width - arenaWidth * scale) / 2;
    const offsetY = (height - arenaHeight * scale) / 2;

    // Transform world coords to canvas coords
    const toCanvas = (x: number, y: number) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: offsetY + (y - bounds.minY) * scale,
    });

    // Draw grid
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 0.5;
    const gridStep = 0.5; // 0.5m grid
    for (let x = bounds.minX; x <= bounds.maxX; x += gridStep) {
      const start = toCanvas(x, bounds.minY);
      const end = toCanvas(x, bounds.maxY);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += gridStep) {
      const start = toCanvas(bounds.minX, y);
      const end = toCanvas(bounds.maxX, y);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    // Draw arena border
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    const topLeft = toCanvas(bounds.minX, bounds.minY);
    const bottomRight = toCanvas(bounds.maxX, bounds.maxY);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

    // Draw walls
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 3;
    floorMap.walls.forEach(wall => {
      const start = toCanvas(wall.x1, wall.y1);
      const end = toCanvas(wall.x2, wall.y2);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    });

    // Draw obstacles
    ctx.fillStyle = '#f85149';
    floorMap.obstacles?.forEach(obs => {
      const pos = toCanvas(obs.x, obs.y);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, obs.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw collectibles
    floorMap.collectibles?.forEach(col => {
      if (robotState?.collectibles?.collected.includes(col.id)) return;
      const pos = toCanvas(col.x, col.y);
      ctx.fillStyle = col.color || '#FFD700';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, col.radius * scale * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw dock zones
    floorMap.dockZones?.forEach(dz => {
      const pos = toCanvas(dz.x - dz.width / 2, dz.y - dz.height / 2);
      const w = dz.width * scale;
      const h = dz.height * scale;
      ctx.fillStyle = dz.color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(pos.x, pos.y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = dz.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x, pos.y, w, h);
    });

    // Draw pushable objects
    robotState?.pushableObjects?.forEach(obj => {
      const pos = toCanvas(obj.x, obj.y);
      const halfSize = obj.size * scale / 2;
      ctx.fillStyle = obj.color;
      ctx.fillRect(pos.x - halfSize, pos.y - halfSize, halfSize * 2, halfSize * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x - halfSize, pos.y - halfSize, halfSize * 2, halfSize * 2);
    });

    // Draw robot
    if (robotState) {
      const robotPos = toCanvas(robotState.pose.x, robotState.pose.y);
      const robotSize = 8;

      // Robot body
      ctx.save();
      ctx.translate(robotPos.x, robotPos.y);
      ctx.rotate(-robotState.pose.rotation + Math.PI);

      // Triangle pointing in direction of travel
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.moveTo(0, -robotSize);
      ctx.lineTo(-robotSize * 0.7, robotSize * 0.6);
      ctx.lineTo(robotSize * 0.7, robotSize * 0.6);
      ctx.closePath();
      ctx.fill();

      // LED indicator
      ctx.fillStyle = `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Robot trail (last few positions could be shown)
    }

    // Draw border decoration
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

  }, [robotState, floorMap, width, height]);

  return (
    <div
      className={`absolute ${positionStyles[position]} bg-[#0d1117]/95 backdrop-blur-sm border border-[#30363d] rounded-lg shadow-xl overflow-hidden group transition-all duration-200 hover:border-[#58a6ff]/50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-[#58a6ff]" />
          <span className="text-[9px] text-[#8b949e] font-medium uppercase tracking-wider">Top View</span>
        </div>
        <Move className="w-3 h-3 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity cursor-move" />
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ imageRendering: 'auto' }}
      />

      {/* Position info */}
      {robotState && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-[#0d1117]/80 rounded text-[8px] text-[#8b949e] font-mono">
          ({robotState.pose.x.toFixed(1)}, {robotState.pose.y.toFixed(1)})
        </div>
      )}
    </div>
  );
}

// First-person camera controller for PiP view
// Aligns camera with the physical camera position on the robot model
function FirstPersonCameraController({ robotState }: { robotState: SimulatorState | null }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!cameraRef.current || !robotState) return;

    // Robot physical parameters (must match RobotCanvas3D.tsx)
    const tiltAngle = Math.PI / 6; // 30 degrees forward tilt
    const cameraLocalOffset = { x: 0, y: 0.055, z: 0.045 }; // Camera position on robot body

    // Calculate camera position in world space
    // The camera is mounted on the tilted robot body, offset forward
    // Physics rotation θ: forward direction = (sin(θ), cos(θ)) in physics = (sin(θ), 0, cos(θ)) in Three.js
    const robotRotation = robotState.pose.rotation;

    // Transform local camera offset to world coordinates
    // Account for robot's Y rotation (heading)
    const sinR = Math.sin(robotRotation);
    const cosR = Math.cos(robotRotation);

    // The camera's local Z offset (forward) rotates with the robot
    // Forward in world coords: (sin(θ), 0, cos(θ))
    const worldOffsetX = sinR * cameraLocalOffset.z;
    const worldOffsetZ = cosR * cameraLocalOffset.z;

    // Camera height accounts for tilt - when tilted forward, camera moves forward and slightly down
    const effectiveHeight = cameraLocalOffset.y * Math.cos(tiltAngle) + cameraLocalOffset.z * Math.sin(tiltAngle);

    cameraRef.current.position.set(
      robotState.pose.x + worldOffsetX,
      effectiveHeight,
      robotState.pose.y + worldOffsetZ
    );

    // Calculate look direction - camera looks forward with the tilt
    // The camera looks in the direction the robot is facing, tilted down by tiltAngle
    const lookDistance = 1;

    // Look point is forward in robot direction, but lower due to tilt
    // Forward direction in world: (sin(θ), 0, cos(θ))
    const lookX = robotState.pose.x + sinR * lookDistance;
    const lookZ = robotState.pose.y + cosR * lookDistance;
    // Tilt the view downward - looking at ground level at distance accounts for 30deg tilt
    const lookY = effectiveHeight - Math.tan(tiltAngle) * lookDistance;

    cameraRef.current.lookAt(lookX, Math.max(0, lookY), lookZ);
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={60} // Match robot's sensor FOV (was 75, now 60 to match ray navigation)
      near={0.01}
      far={50}
      position={[0, 0.08, 0]}
    />
  );
}

// 3D Floor for PiP view - matches main arena floor for consistent robot camera vision
function PiPFloor({ bounds }: { bounds: FloorMap['bounds'] }) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Grid lines with 0.5m spacing — visible reference for robot navigation and vision LLM distance estimation
  // Major lines (every 1.0m) are darker/thicker, minor lines (every 0.5m) are lighter
  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    const step = 0.5; // 0.5 meter grid spacing

    // Vertical grid lines
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      const isMajor = Math.abs(x % 1) < 0.01;
      const isOrigin = Math.abs(x) < 0.01;
      lines.push(
        <line key={`v${x}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([x, 0.002, bounds.minY, x, 0.002, bounds.maxY])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            attach="material"
            color={isOrigin ? "#505050" : isMajor ? "#707070" : "#959595"}
            linewidth={1}
          />
        </line>
      );
    }

    // Horizontal grid lines
    for (let z = bounds.minY; z <= bounds.maxY; z += step) {
      const isMajor = Math.abs(z % 1) < 0.01;
      const isOrigin = Math.abs(z) < 0.01;
      lines.push(
        <line key={`h${z}`}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              count={2}
              array={new Float32Array([bounds.minX, 0.002, z, bounds.maxX, 0.002, z])}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            attach="material"
            color={isOrigin ? "#505050" : isMajor ? "#707070" : "#959595"}
            linewidth={1}
          />
        </line>
      );
    }

    return lines;
  }, [bounds]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#B0B0B0" metalness={0.1} roughness={0.8} />
      </mesh>
      {gridLines}
    </group>
  );
}

// Create wall stripe texture (blue with white diagonal lines)
// CV-optimized: blue hue maximally separated from red obstacles on color wheel
function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Fill with strong blue background
  ctx.fillStyle = '#1565C0'; // Strong blue
  ctx.fillRect(0, 0, 64, 64);

  // Draw white diagonal stripes
  ctx.strokeStyle = '#FFFFFF'; // White
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

// Create obstacle hazard texture (red with white diagonal stripes)
// CV-optimized: red is maximally separated from blue walls, opposite diagonal direction
function createObstacleHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Fill with strong red background
  ctx.fillStyle = '#D32F2F'; // Strong red
  ctx.fillRect(0, 0, 64, 64);

  // Draw white diagonal stripes (opposite direction from walls for distinction)
  ctx.strokeStyle = '#ffffff'; // White
  ctx.lineWidth = 10;

  // Diagonal lines (right-to-left) - opposite from wall stripes (left-to-right)
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

// 3D Walls for PiP view with blue/white stripe pattern
function PiPWalls({ walls }: { walls: FloorMap['walls'] }) {
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

        return (
          <mesh
            key={idx}
            position={[centerX, 0.15, centerY]}
            rotation={[0, angle, 0]}
            castShadow
          >
            <boxGeometry args={[length, 0.3, 0.05]} />
            <meshStandardMaterial
              map={hazardTexture}
              color="#E3F2FD"
              emissive="#1565C0"
              emissiveIntensity={0.25}
              metalness={0.1}
              roughness={0.5}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// 3D Obstacles for PiP view with red/white stripe pattern
function PiPObstacles({ obstacles }: { obstacles: FloorMap['obstacles'] }) {
  // Create obstacle hazard texture once and reuse
  const obstacleTexture = useMemo(() => createObstacleHazardTexture(), []);

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
            map={obstacleTexture}
            color="#FFCDD2"
            emissive="#D32F2F"
            emissiveIntensity={0.2}
            metalness={0.3}
            roughness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

// Component to register PiP Robot Camera canvas with cameraCaptureManager
// This enables the AI vision system to capture the robot's first-person view
function PiPCanvasCaptureRegistration() {
  const { gl } = useThree();

  useEffect(() => {
    if (gl.domElement) {
      // Register this canvas as the dedicated robot POV source (takes priority over main arena canvas)
      cameraCaptureManager.registerRobotPovCanvas(gl.domElement);
    }
    return () => {
      cameraCaptureManager.unregisterRobotPovCanvas();
    };
  }, [gl]);

  return null;
}

// 3D Collectibles for PiP view (simplified version)
function PiPCollectibles({ collectibles, collectedIds }: { collectibles: Collectible[]; collectedIds: string[] }) {
  const visibleCollectibles = collectibles.filter(c => !collectedIds.includes(c.id));

  return (
    <group>
      {visibleCollectibles.map((collectible) => {
        const color = collectible.color || '#FFD700';
        const height = collectible.type === 'coin' ? 0.02 : collectible.radius;

        return (
          <group key={collectible.id}>
            <mesh position={[collectible.x, height, collectible.y]} castShadow>
              {collectible.type === 'coin' ? (
                <cylinderGeometry args={[collectible.radius, collectible.radius, 0.015, 16]} />
              ) : collectible.type === 'gem' ? (
                <octahedronGeometry args={[collectible.radius]} />
              ) : (
                <sphereGeometry args={[collectible.radius, 16, 16]} />
              )}
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.4}
                metalness={collectible.type === 'coin' ? 0.8 : 0.3}
                roughness={collectible.type === 'gem' ? 0.1 : 0.3}
              />
            </mesh>
            {/* Glow effect underneath */}
            <mesh position={[collectible.x, 0.005, collectible.y]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[collectible.radius * 1.5, 16]} />
              <meshBasicMaterial color={color} transparent opacity={0.2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// PiP Robot Camera View Component - Shows robot's first-person perspective using Three.js
function PiPRobotCamera({
  robotState,
  floorMap,
  position,
  size,
}: {
  robotState: SimulatorState | null;
  floorMap: FloorMap;
  position: PiPConfig['position'];
  size: PiPConfig['size'];
}) {
  // Size mapping
  const sizeMap = {
    small: { width: 120, height: 90 },
    medium: { width: 180, height: 135 },
    large: { width: 240, height: 180 },
  };
  const { width, height } = sizeMap[size];

  // Position mapping
  const positionStyles: Record<PiPConfig['position'], string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-16 left-4',
    'bottom-right': 'bottom-16 right-4',
  };

  const collectedIds = robotState?.collectibles?.collected || [];

  return (
    <div
      className={`absolute ${positionStyles[position]} bg-[#0d1117]/95 backdrop-blur-sm border border-[#30363d] rounded-lg shadow-xl overflow-hidden group transition-all duration-200 hover:border-[#58a6ff]/50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-[#3fb950]" />
          <span className="text-[9px] text-[#8b949e] font-medium uppercase tracking-wider">Robot View</span>
        </div>
        <Move className="w-3 h-3 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity cursor-move" />
      </div>

      {/* 3D Canvas - First Person View */}
      <div style={{ width, height }}>
        {robotState ? (
          <Canvas
            gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
            dpr={[1, 1.5]}
            style={{ width, height }}
          >
            {/* First-person camera following robot */}
            <FirstPersonCameraController robotState={robotState} />

            {/* Register this canvas for AI vision capture */}
            <PiPCanvasCaptureRegistration />

            {/* Lighting - brighter to match main arena view */}
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
            <pointLight position={[-5, 5, -5]} intensity={0.4} />

            {/* Scene elements (same as main view but without robot) */}
            <PiPFloor bounds={floorMap.bounds} />
            <PiPWalls walls={floorMap.walls} />
            {floorMap.obstacles && <PiPObstacles obstacles={floorMap.obstacles} />}
            {floorMap.collectibles && floorMap.collectibles.length > 0 && (
              <PiPCollectibles collectibles={floorMap.collectibles} collectedIds={collectedIds} />
            )}
            {/* Pushable objects in PiP view - brighter for camera detection */}
            {robotState?.pushableObjects?.map(obj => (
              <group key={obj.id}>
                <mesh position={[obj.x, obj.size / 2, obj.y]} castShadow>
                  <boxGeometry args={[obj.size, obj.size, obj.size]} />
                  <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={0.5} metalness={0.2} roughness={0.4} />
                </mesh>
                <pointLight position={[obj.x, obj.size + 0.05, obj.y]} color={obj.color} intensity={0.2} distance={0.5} />
              </group>
            ))}
            {/* Dock zones in PiP view - bright and visible with corner markers */}
            {floorMap.dockZones?.map(dz => (
              <group key={dz.id}>
                {/* Dock zone floor plane */}
                <mesh position={[dz.x, 0.004, dz.y]} rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[dz.width, dz.height]} />
                  <meshStandardMaterial color={dz.color} transparent opacity={0.5} emissive={dz.color} emissiveIntensity={0.4} />
                </mesh>
                {/* Corner markers - tall and visible for camera detection */}
                {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([cx, cy], i) => (
                  <mesh
                    key={i}
                    position={[
                      dz.x + cx * dz.width / 2,
                      0.06,
                      dz.y + cy * dz.height / 2
                    ]}
                  >
                    <boxGeometry args={[0.05, 0.12, 0.05]} />
                    <meshStandardMaterial color={dz.color} emissive={dz.color} emissiveIntensity={0.8} />
                  </mesh>
                ))}
                {/* Point light to make dock zone glow */}
                <pointLight position={[dz.x, 0.15, dz.y]} color={dz.color} intensity={0.4} distance={1} />
              </group>
            ))}

            {/* Background and fog - dark neutral for max contrast with scene elements */}
            <color attach="background" args={['#1A1A2E']} />
            <fog attach="fog" args={['#1A1A2E', 3, 10]} />
          </Canvas>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#1a1a2e] to-[#0f3460]">
            <span className="text-[10px] text-[#8b949e]">No robot data</span>
          </div>
        )}
      </div>

      {/* Rotation indicator */}
      {robotState && (
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-[#0d1117]/80 rounded text-[8px] text-[#8b949e] font-mono">
          {(robotState.pose.rotation * 180 / Math.PI).toFixed(0)}°
        </div>
      )}
    </div>
  );
}

// PiP World Model View Component - Shows robot's cognitive understanding of the environment
function PiPWorldModel({
  robotState,
  worldModel,
  position,
  size,
}: {
  robotState: SimulatorState | null;
  worldModel: WorldModel | null;
  position: PiPConfig['position'];
  size: PiPConfig['size'];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Size mapping
  const sizeMap = {
    small: { width: 120, height: 120 },
    medium: { width: 160, height: 160 },
    large: { width: 200, height: 200 },
  };
  const { width, height } = sizeMap[size];

  // Position mapping
  const positionStyles: Record<PiPConfig['position'], string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-16 left-4',
    'bottom-right': 'bottom-16 right-4',
  };

  // Color mapping for cell states
  const getCellColor = (state: CellState, confidence: number): string => {
    const alpha = Math.max(0.3, confidence);
    switch (state) {
      case 'unknown': return `rgba(30, 30, 40, ${alpha})`;
      case 'free': return `rgba(63, 185, 80, ${alpha * 0.5})`;
      case 'explored': return `rgba(88, 166, 255, ${alpha * 0.6})`;
      case 'obstacle': return `rgba(248, 81, 73, ${alpha})`;
      case 'wall': return `rgba(88, 166, 255, ${alpha})`;
      case 'collectible': return `rgba(255, 215, 0, ${alpha})`;
      case 'collected': return `rgba(100, 100, 100, ${alpha * 0.5})`;
      case 'path': return `rgba(163, 113, 247, ${alpha * 0.6})`;
      default: return `rgba(50, 50, 50, ${alpha})`;
    }
  };

  // Render world model on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    if (!worldModel) {
      // No world model data
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No world model', width / 2, height / 2 - 8);
      ctx.fillText('Start agent to build', width / 2, height / 2 + 8);
      return;
    }

    // Get mini-map data from world model
    const mapData = worldModel.generateMiniMapData(Math.min(width, height));
    const cellSize = Math.max(2, Math.floor(width / 50));

    // Draw cells
    mapData.cells.forEach(cell => {
      ctx.fillStyle = getCellColor(cell.state, cell.confidence);
      ctx.fillRect(
        cell.x * cellSize,
        cell.y * cellSize,
        cellSize,
        cellSize
      );
    });

    // Draw grid overlay (subtle)
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.3)';
    ctx.lineWidth = 0.5;
    const gridStep = cellSize * 5;
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw robot position
    if (mapData.robotPosition) {
      const rx = mapData.robotPosition.x * cellSize;
      const ry = mapData.robotPosition.y * cellSize;
      const robotSize = Math.max(6, cellSize * 2);

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-mapData.robotPosition.rotation + Math.PI);

      // Robot body (triangle)
      ctx.fillStyle = '#58a6ff';
      ctx.beginPath();
      ctx.moveTo(0, -robotSize);
      ctx.lineTo(-robotSize * 0.7, robotSize * 0.6);
      ctx.lineTo(robotSize * 0.7, robotSize * 0.6);
      ctx.closePath();
      ctx.fill();

      // Glow effect
      ctx.shadowColor = '#58a6ff';
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.restore();
    }

    // Draw exploration progress bar
    const progress = worldModel.getExplorationProgress();
    const barWidth = width - 20;
    const barHeight = 4;
    const barY = height - 10;

    // Background
    ctx.fillStyle = '#21262d';
    ctx.fillRect(10, barY, barWidth, barHeight);

    // Progress
    ctx.fillStyle = '#3fb950';
    ctx.fillRect(10, barY, barWidth * progress, barHeight);

    // Border
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

  }, [robotState, worldModel, width, height]);

  // Get exploration percentage
  const explorationProgress = worldModel?.getExplorationProgress() ?? 0;

  return (
    <div
      className={`absolute ${positionStyles[position]} bg-[#0d1117]/95 backdrop-blur-sm border border-[#30363d] rounded-lg shadow-xl overflow-hidden group transition-all duration-200 hover:border-[#a371f7]/50`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3 h-3 text-[#a371f7]" />
          <span className="text-[9px] text-[#8b949e] font-medium uppercase tracking-wider">World Model</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-[#3fb950] font-mono">{(explorationProgress * 100).toFixed(0)}%</span>
          <Move className="w-3 h-3 text-[#6e7681] opacity-0 group-hover:opacity-100 transition-opacity cursor-move" />
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Legend */}
      <div className="absolute bottom-2 left-1 flex gap-1 items-center">
        <div className="flex items-center gap-0.5 px-1 py-0.5 bg-[#0d1117]/80 rounded">
          <div className="w-2 h-2 rounded-sm bg-[#58a6ff]/60" />
          <span className="text-[7px] text-[#8b949e]">explored</span>
        </div>
        <div className="flex items-center gap-0.5 px-1 py-0.5 bg-[#0d1117]/80 rounded">
          <div className="w-2 h-2 rounded-sm bg-[#f85149]" />
          <span className="text-[7px] text-[#8b949e]">obstacle</span>
        </div>
      </div>
    </div>
  );
}

export default function RobotWorldPanel({
  currentMap = 'standard5x5Empty',
  deviceId,
  onRobotClick,
  onArenaClick,
  agentActivity,
  robotAgentName,
  worldModel,
}: RobotWorldPanelProps) {
  // Unified robot color
  const ROBOT_COLOR = '#58a6ff';
  const canvasRef = useRef<HTMLDivElement>(null);
  const simulatorRef = useRef<ReturnType<typeof createCubeRobotSimulator> | null>(null);
  const animationFrameRef = useRef<number>();

  const [mode, setMode] = useState<ExecutionMode>('simulation');
  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('follow'); // Default to follow camera
  const [robotState, setRobotState] = useState<SimulatorState | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [floorMap, setFloorMap] = useState<FloorMap | null>(null);
  const [pipConfig, setPipConfig] = useState<PiPConfig>({
    enabled: true,
    position: 'top-right',
    size: 'medium',
    view: 'robot-camera',  // Default to robot camera so users can see what the robot sees
  });
  const [showPipMenu, setShowPipMenu] = useState(false);
  const [showRayVisualization, setShowRayVisualization] = useState(true); // Show ray trajectory by default

  // Compute ray navigation from robot sensor data for visualization
  const rayNavigation = useMemo((): PathExplorationResult | null => {
    if (!robotState || !robotState.sensors) return null;

    try {
      const rayNavSystem = getRayNavigationSystem();
      const sensors = robotState.sensors;

      // Build sensor distances from robot state
      const sensorDistances = {
        front: sensors.distance?.front ?? 200,
        frontLeft: sensors.distance?.frontLeft ?? 200,
        frontRight: sensors.distance?.frontRight ?? 200,
        left: sensors.distance?.left ?? 200,
        right: sensors.distance?.right ?? 200,
        back: sensors.distance?.back ?? 200,
        backLeft: sensors.distance?.backLeft ?? 200,
        backRight: sensors.distance?.backRight ?? 200,
      };

      const robotPose = {
        x: robotState.pose.x,
        y: robotState.pose.y,
        rotation: robotState.pose.rotation,
      };

      const velocity = {
        linear: robotState.velocity.linear,
        angular: robotState.velocity.angular,
      };

      return rayNavSystem.computeNavigation(sensorDistances, robotPose, velocity);
    } catch (e) {
      console.error('Error computing ray navigation:', e);
      return null;
    }
  }, [robotState]);

  // Initialize simulator OR sync with Device Manager
  useEffect(() => {
    // Load floor map regardless of mode
    const mapKey = currentMap as keyof typeof FLOOR_MAPS;
    const map = FLOOR_MAPS[mapKey] ? FLOOR_MAPS[mapKey]() : null;
    if (map) {
      setFloorMap(map);
    }

    // If we have a deviceId, sync with Device Manager instead of local simulator
    if (deviceId) {
      const manager = getDeviceManager();

      // Subscribe to telemetry events from the device
      const unsubscribeTelemetry = manager.on('device:telemetry', (telemetry: DeviceTelemetry) => {
        if (telemetry.deviceId === deviceId) {
          setRobotState(telemetry.robotState);
        }
      });

      // Get initial state from device
      const deviceState = manager.getDeviceState(deviceId);
      if (deviceState) {
        setRobotState(deviceState.robot);
        // Device is already running if status is running
        const deviceInfo = manager.getDevice(deviceId);
        if (deviceInfo?.status === 'running') {
          setIsRunning(true);
        }
      }

      // Update map on the device if needed
      if (map) {
        manager.sendCommand(deviceId, { type: 'set_map', payload: { map } });
      }

      return () => {
        unsubscribeTelemetry();
      };
    }

    // No deviceId - use local simulator (original behavior)
    const simulator = createCubeRobotSimulator({
      onStateChange: (state) => {
        setRobotState(state);
      },
    });
    simulatorRef.current = simulator;

    // Load current map
    if (map) {
      simulator.setMap(map);
    }

    // Get initial state
    setRobotState(simulator.getState());

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      simulator.dispose();
    };
  }, [currentMap, deviceId]);

  // Close PiP menu when clicking outside
  useEffect(() => {
    if (!showPipMenu) return;
    const handleClickOutside = () => setShowPipMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showPipMenu]);

  // Simulation loop - handle both local simulator and Device Manager modes
  useEffect(() => {
    // If using Device Manager, the device is controlled externally (e.g., by RobotAgentPanel)
    // We only send start/stop commands when the user explicitly clicks play/pause in THIS panel
    // The device may already be running from the agent, so we don't stop it on mount
    if (deviceId) {
      // Don't send any commands here - the device is controlled by RobotAgentPanel
      // This panel just passively receives telemetry updates
      return;
    }

    // Local simulator mode (original behavior)
    const simulator = simulatorRef.current;
    if (!simulator) return;

    if (isRunning && mode === 'simulation') {
      // Start simulator (it has its own internal physics loop)
      simulator.start();
    } else {
      // Stop simulator
      simulator.stop();
    }

    return () => {
      simulator.stop();
    };
  }, [isRunning, mode, deviceId]);

  // Control functions
  const handlePlayPause = useCallback(() => {
    setIsRunning(!isRunning);
  }, [isRunning]);

  const handleReset = useCallback(() => {
    if (deviceId) {
      // Reset via Device Manager
      const manager = getDeviceManager();
      manager.sendCommand(deviceId, { type: 'reset' });
    } else {
      // Reset local simulator
      simulatorRef.current?.reset();
    }
    setIsRunning(false);
    setRobotState(null);
  }, [deviceId]);

  const handleModeToggle = useCallback(() => {
    const modes: ExecutionMode[] = ['simulation', 'real-robot', 'replay'];
    const currentIndex = modes.indexOf(mode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setMode(nextMode);
    setIsRunning(false); // Stop when switching modes
  }, [mode]);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    // Camera transformation will be handled by Three.js component
  }, []);

  const handleArenaClick = useCallback((x: number, y: number) => {
    // Forward to parent if provided
    if (onArenaClick) {
      onArenaClick(x, y);
    }
  }, [onArenaClick]);

  // Mode display configuration
  const modeConfig = {
    simulation: {
      icon: <Play className="w-4 h-4" />,
      label: 'Simulation',
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      border: 'border-blue-500/50',
    },
    'real-robot': {
      icon: <Radio className="w-4 h-4" />,
      label: 'Real Robot',
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      border: 'border-green-500/50',
    },
    replay: {
      icon: <Camera className="w-4 h-4" />,
      label: 'Replay',
      color: 'text-purple-400',
      bg: 'bg-purple-500/20',
      border: 'border-purple-500/50',
    },
  };

  const currentModeConfig = modeConfig[mode];

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        {/* Left: Mode Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleModeToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 ${currentModeConfig.bg} ${currentModeConfig.border}`}
            title="Toggle execution mode"
          >
            {currentModeConfig.icon}
            <span className={`text-xs font-semibold ${currentModeConfig.color}`}>
              {currentModeConfig.label}
            </span>
          </button>

          {/* Connection Status */}
          {mode === 'real-robot' && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#21262d]">
              <Wifi className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-green-400">Connected</span>
            </div>
          )}
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isRunning
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
            }`}
            title={isRunning ? 'Pause' : 'Play'}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={handleReset}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] flex items-center justify-center transition-colors"
            title="Reset simulation"
          >
            <RotateCcw className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
          </button>

          <div className="w-px h-6 bg-[#30363d] mx-1" />

          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isRecording
                ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                : 'bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:border-[#58a6ff]'
            }`}
            title={isRecording ? 'Stop recording' : 'Record telemetry'}
          >
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-400 animate-pulse' : 'bg-[#8b949e]'}`} />
          </button>
        </div>

        {/* Right: View Controls & Settings */}
        <div className="flex items-center gap-2">
          {/* Follow Camera indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#58a6ff]/20 border border-[#58a6ff]/50">
            <Camera className="w-3 h-3 text-[#58a6ff]" />
            <span className="text-[10px] text-[#58a6ff] font-medium">Follow Cam</span>
          </div>

          {/* PiP View Selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPipMenu(!showPipMenu);
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                pipConfig.enabled
                  ? pipConfig.view === 'world-model'
                    ? 'bg-[#a371f7]/20 border-[#a371f7]/50 text-[#a371f7]'
                    : pipConfig.view === 'robot-camera'
                    ? 'bg-[#3fb950]/20 border-[#3fb950]/50 text-[#3fb950]'
                    : 'bg-[#58a6ff]/20 border-[#58a6ff]/50 text-[#58a6ff]'
                  : 'bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#58a6ff]'
              }`}
              title="Picture-in-Picture view options"
            >
              {pipConfig.view === 'world-model' ? (
                <Brain className="w-3.5 h-3.5" />
              ) : pipConfig.view === 'robot-camera' ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] font-medium">PiP</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* PiP Dropdown Menu */}
            {showPipMenu && (
              <div
                className="absolute top-full right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-3 py-2 border-b border-[#30363d] bg-[#0d1117]">
                  <span className="text-[10px] uppercase tracking-wider text-[#8b949e] font-medium">PiP View Options</span>
                </div>

                {/* Toggle PiP */}
                <button
                  onClick={() => {
                    setPipConfig(prev => ({ ...prev, enabled: !prev.enabled }));
                  }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-[#21262d] flex items-center justify-between"
                >
                  <span className={pipConfig.enabled ? 'text-[#3fb950]' : 'text-[#8b949e]'}>
                    {pipConfig.enabled ? '● Enabled' : '○ Disabled'}
                  </span>
                </button>

                <div className="border-t border-[#30363d]" />

                {/* View Type Options */}
                <button
                  onClick={() => {
                    setPipConfig(prev => ({ ...prev, view: 'top-down', enabled: true }));
                    setShowPipMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-[#21262d] flex items-center gap-2 ${
                    pipConfig.view === 'top-down' ? 'bg-[#58a6ff]/10 text-[#58a6ff]' : 'text-[#e6edf3]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <div>
                    <div className="font-medium">Top-Down View</div>
                    <div className="text-[9px] text-[#8b949e]">Overhead map of the arena</div>
                  </div>
                  {pipConfig.view === 'top-down' && <span className="ml-auto text-[#58a6ff]">✓</span>}
                </button>

                <button
                  onClick={() => {
                    setPipConfig(prev => ({ ...prev, view: 'robot-camera', enabled: true }));
                    setShowPipMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-[#21262d] flex items-center gap-2 ${
                    pipConfig.view === 'robot-camera' ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'text-[#e6edf3]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <div>
                    <div className="font-medium">Robot Camera</div>
                    <div className="text-[9px] text-[#8b949e]">First-person robot perspective</div>
                  </div>
                  {pipConfig.view === 'robot-camera' && <span className="ml-auto text-[#3fb950]">✓</span>}
                </button>

                <button
                  onClick={() => {
                    setPipConfig(prev => ({ ...prev, view: 'world-model', enabled: true }));
                    setShowPipMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-xs text-left hover:bg-[#21262d] flex items-center gap-2 ${
                    pipConfig.view === 'world-model' ? 'bg-[#a371f7]/10 text-[#a371f7]' : 'text-[#e6edf3]'
                  }`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <div>
                    <div className="font-medium">World Model</div>
                    <div className="text-[9px] text-[#8b949e]">Robot's cognitive map understanding</div>
                  </div>
                  {pipConfig.view === 'world-model' && <span className="ml-auto text-[#a371f7]">✓</span>}
                </button>

                <div className="border-t border-[#30363d]" />

                {/* Size Options */}
                <div className="px-3 py-2">
                  <span className="text-[9px] uppercase tracking-wider text-[#6e7681]">Size</span>
                  <div className="flex gap-1 mt-1">
                    {(['small', 'medium', 'large'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setPipConfig(prev => ({ ...prev, size: s }))}
                        className={`flex-1 px-2 py-1 text-[10px] rounded border transition-colors ${
                          pipConfig.size === s
                            ? 'bg-[#58a6ff]/20 border-[#58a6ff]/50 text-[#58a6ff]'
                            : 'bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#e6edf3]'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stats Toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
              showStats
                ? 'bg-[#58a6ff]/20 border-[#58a6ff]/50'
                : 'bg-[#21262d] border-[#30363d] hover:border-[#58a6ff]'
            }`}
            title="Toggle statistics"
          >
            <Settings className={`w-4 h-4 ${showStats ? 'text-[#58a6ff]' : 'text-[#8b949e] hover:text-[#58a6ff]'}`} />
          </button>

          {/* Vision Test Fixture Generator */}
          <VisionTestFixtureButton />

          <button
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] flex items-center justify-center transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4 text-[#8b949e] hover:text-[#58a6ff]" />
          </button>
        </div>
      </div>

      {/* 3D Canvas Area */}
      <div className="flex-1 relative bg-gradient-to-b from-[#0d1117] to-[#161b22]">
        <div ref={canvasRef} className="w-full h-full relative">
          {/* Three.js 3D Rendering */}
          {floorMap ? (
            <RobotCanvas3D
              robotState={robotState}
              floorMap={floorMap}
              cameraPreset={cameraPreset}
              onArenaClick={handleArenaClick}
              agentActivity={agentActivity}
              collectedIds={robotState?.collectibles?.collected || []}
              rayNavigation={rayNavigation}
              showRayVisualization={showRayVisualization}
              pushableObjects={robotState?.pushableObjects || []}
              dockZones={floorMap?.dockZones || []}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-[#58a6ff] rounded-lg shadow-lg shadow-[#58a6ff]/50 flex items-center justify-center text-2xl animate-pulse">
                  🤖
                </div>
                <p className="text-sm text-[#8b949e]">Loading arena...</p>
              </div>
            </div>
          )}
        </div>

        {/* Robot Agent Name Overlay */}
        {robotAgentName && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#0d1117]/90 backdrop-blur-sm border rounded-lg px-4 py-2 shadow-xl flex items-center gap-2"
            style={{ borderColor: `${ROBOT_COLOR}50` }}
          >
            <Cpu className="w-4 h-4" style={{ color: ROBOT_COLOR }} />
            <span className="text-sm font-semibold" style={{ color: ROBOT_COLOR }}>
              {robotAgentName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30">
              Active
            </span>
          </div>
        )}

        {/* Collectibles Score Overlay - shows when map has collectibles */}
        {robotState?.collectibles && robotState.collectibles.totalCount > 0 && (
          <div className="absolute top-4 right-4 bg-[#0d1117]/90 backdrop-blur-sm border border-[#FFD700]/30 rounded-lg p-3 shadow-xl min-w-[140px]">
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-[#FFD700]" />
              <span className="text-[10px] uppercase tracking-wider text-[#FFD700] font-medium">Collectibles</span>
            </div>
            <div className="space-y-2">
              {/* Score */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Score:</span>
                <span className="text-lg font-bold text-[#FFD700]">
                  {robotState.collectibles.totalPoints}
                </span>
              </div>
              {/* Items collected */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8b949e]">Collected:</span>
                <span className="text-sm font-medium text-[#e6edf3]">
                  {robotState.collectibles.collected.length} / {robotState.collectibles.totalCount}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] transition-all duration-300"
                  style={{
                    width: `${(robotState.collectibles.collected.length / robotState.collectibles.totalCount) * 100}%`
                  }}
                />
              </div>
              {/* Completion badge */}
              {robotState.collectibles.collected.length === robotState.collectibles.totalCount && (
                <div className="flex items-center justify-center gap-1 pt-1">
                  <Trophy className="w-3 h-3 text-[#FFD700]" />
                  <span className="text-[10px] text-[#FFD700] font-semibold uppercase">Goal Complete!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Statistics Overlay */}
        {showStats && robotState && (
          <div className="absolute top-4 left-4 bg-[#0d1117]/90 backdrop-blur-sm border border-[#30363d] rounded-lg p-3 shadow-xl">
            <div className="text-[10px] uppercase tracking-wider text-[#8b949e] mb-2">Robot State</div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Position:</span>
                <span className="text-[#58a6ff]">
                  ({robotState.pose.x.toFixed(2)}, {robotState.pose.y.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Rotation:</span>
                <span className="text-[#a371f7]">{(robotState.pose.rotation * 180 / Math.PI).toFixed(1)}°</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">Velocity:</span>
                <span className="text-[#3fb950]">
                  {robotState.velocity.linear.toFixed(2)} m/s
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#6e7681]">LED:</span>
                <div
                  className="w-4 h-4 rounded border border-[#30363d]"
                  style={{
                    backgroundColor: `rgb(${robotState.led.r}, ${robotState.led.g}, ${robotState.led.b})`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* PiP Views - Conditionally render based on selected view */}
        {pipConfig.enabled && floorMap && (
          <>
            {pipConfig.view === 'top-down' && (
              <PiPTopView
                robotState={robotState}
                floorMap={floorMap}
                position={pipConfig.position}
                size={pipConfig.size}
                onDrag={(pos) => setPipConfig(prev => ({ ...prev, position: pos }))}
              />
            )}
            {pipConfig.view === 'robot-camera' && (
              <PiPRobotCamera
                robotState={robotState}
                floorMap={floorMap}
                position={pipConfig.position}
                size={pipConfig.size}
              />
            )}
            {pipConfig.view === 'world-model' && (
              <PiPWorldModel
                robotState={robotState}
                worldModel={worldModel || null}
                position={pipConfig.position}
                size={pipConfig.size}
              />
            )}
          </>
        )}

        {/* Mode Badge */}
        <div className="absolute bottom-4 right-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${currentModeConfig.bg} ${currentModeConfig.border} backdrop-blur-sm`}>
            {currentModeConfig.icon}
            <span className={`text-xs font-semibold ${currentModeConfig.color}`}>
              {currentModeConfig.label}
            </span>
            {isRunning && mode === 'simulation' && (
              <div className="ml-2 flex gap-1">
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-t border-[#30363d] text-xs">
        <div className="flex items-center gap-4">
          {robotAgentName && (
            <span className="flex items-center gap-1.5" style={{ color: ROBOT_COLOR }}>
              <Cpu className="w-3 h-3" />
              <span className="font-medium">{robotAgentName}</span>
            </span>
          )}
          <span className="text-[#8b949e]">
            Map: <span className="text-[#e6edf3] font-medium">{currentMap}</span>
          </span>
          <span className="text-[#8b949e] flex items-center gap-1">
            <Camera className="w-3 h-3" />
            <span className="text-[#58a6ff] font-medium">Follow</span>
            {pipConfig.enabled && (
              <>
                <span className="text-[#6e7681]">+</span>
                {pipConfig.view === 'world-model' ? (
                  <>
                    <Brain className="w-3 h-3 text-[#a371f7]" />
                    <span className="text-[#a371f7]">World Model</span>
                  </>
                ) : pipConfig.view === 'robot-camera' ? (
                  <>
                    <Eye className="w-3 h-3 text-[#3fb950]" />
                    <span className="text-[#3fb950]">Robot Cam</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-3 h-3 text-[#58a6ff]" />
                    <span className="text-[#58a6ff]">Top View</span>
                  </>
                )}
              </>
            )}
          </span>
        </div>
        <div className="text-[#6e7681]">
          {isRecording && (
            <span className="text-red-400 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              Recording telemetry...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
