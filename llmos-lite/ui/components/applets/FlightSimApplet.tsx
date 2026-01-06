/**
 * Flight Simulator Applet - Hardware-in-the-Loop Drone Simulation
 *
 * Demonstrates LLMos self-building capability:
 * - Real-time 3D physics simulation
 * - PID-based flight controller
 * - Virtual/Physical ESP32-S3 integration
 * - React Three Fiber visualization
 */

'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  flightController,
  type FlightTelemetry,
  type MotorState,
} from '@/lib/hardware/virtual-flight-controller';
import { SerialManager } from '@/lib/hardware/serial-manager';
import {
  Play,
  Pause,
  RotateCcw,
  Target,
  Cpu,
  Radio,
  ChevronUp,
  ChevronDown,
  Power,
} from 'lucide-react';

// Physics constants
const GRAVITY = 9.81;
const AIR_RESISTANCE = 0.98;
const MAX_THRUST = 15; // m/s² per motor at full throttle
const GROUND_LEVEL = 0;

// Drone visual component
interface DroneProps {
  position: [number, number, number];
  rotation: [number, number, number];
  motors: MotorState;
}

function Drone({ position, rotation, motors }: DroneProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Motor visualization - prop spin effect
  const motorIntensity = [motors.motor1, motors.motor2, motors.motor3, motors.motor4];

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#1e40af" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Arms */}
      {[
        { pos: [0.3, 0, 0.3], idx: 0 },
        { pos: [-0.3, 0, 0.3], idx: 1 },
        { pos: [0.3, 0, -0.3], idx: 2 },
        { pos: [-0.3, 0, -0.3], idx: 3 },
      ].map(({ pos, idx }) => (
        <group key={idx} position={pos as [number, number, number]}>
          {/* Arm */}
          <mesh castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.4]} />
            <meshStandardMaterial color="#374151" />
          </mesh>

          {/* Motor housing */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.04]} />
            <meshStandardMaterial
              color={motorIntensity[idx] > 0.1 ? '#22c55e' : '#6b7280'}
              emissive={motorIntensity[idx] > 0.1 ? '#22c55e' : '#000000'}
              emissiveIntensity={motorIntensity[idx] * 0.5}
            />
          </mesh>

          {/* Propeller disc (shows thrust) */}
          <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.12, 32]} />
            <meshBasicMaterial
              color="#60a5fa"
              transparent
              opacity={motorIntensity[idx] * 0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {/* Direction indicator (front) */}
      <mesh position={[0, 0.06, 0.2]}>
        <coneGeometry args={[0.03, 0.08, 4]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
    </group>
  );
}

// Ground and environment
function Environment() {
  return (
    <>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Grid */}
      <Grid
        args={[50, 50]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#374151"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#4b5563"
        fadeDistance={30}
        fadeStrength={1}
        followCamera={false}
        position={[0, 0.01, 0]}
      />

      {/* Target altitude marker */}
      <mesh position={[0, flightController.targetAltitude, 0]}>
        <torusGeometry args={[1, 0.02, 16, 50]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.5} />
      </mesh>

      {/* Altitude scale */}
      {[0, 2, 4, 6, 8, 10].map((h) => (
        <group key={h} position={[-3, h, 0]}>
          <Line
            points={[
              [0, 0, 0],
              [0.3, 0, 0],
            ]}
            color="#6b7280"
            lineWidth={1}
          />
          <Text
            position={[-0.3, 0, 0]}
            fontSize={0.2}
            color="#9ca3af"
            anchorX="right"
          >
            {h}m
          </Text>
        </group>
      ))}
    </>
  );
}

// Physics simulation hook
interface PhysicsState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
}

function PhysicsSimulation({
  running,
  onTelemetry,
}: {
  running: boolean;
  onTelemetry: (state: PhysicsState) => void;
}) {
  const stateRef = useRef<PhysicsState>({
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
  });

  useFrame((_, delta) => {
    if (!running) return;

    const dt = Math.min(delta, 0.1); // Cap dt to prevent physics explosions
    const state = stateRef.current;

    // Get motor thrust from flight controller
    const thrust = flightController.getMotorThrust() * MAX_THRUST;

    // Apply physics
    // Gravity (downward)
    const gravityForce = -GRAVITY;

    // Thrust (upward when armed)
    const thrustForce = flightController.armed ? thrust : 0;

    // Net vertical acceleration
    const netAcceleration = gravityForce + thrustForce;

    // Update velocity
    state.velocity.y += netAcceleration * dt;

    // Apply air resistance
    state.velocity.multiplyScalar(AIR_RESISTANCE);

    // Update position
    state.position.add(state.velocity.clone().multiplyScalar(dt));

    // Ground collision
    if (state.position.y < GROUND_LEVEL) {
      state.position.y = GROUND_LEVEL;
      state.velocity.y = Math.max(0, state.velocity.y);
    }

    // Feed sensor data back to flight controller
    flightController.updateSensors({
      altitude: state.position.y,
      velocity: {
        x: state.velocity.x,
        y: state.velocity.y,
        z: state.velocity.z,
      },
      position: {
        x: state.position.x,
        y: state.position.y,
        z: state.position.z,
      },
      orientation: {
        x: THREE.MathUtils.radToDeg(state.rotation.x),
        y: THREE.MathUtils.radToDeg(state.rotation.y),
        z: THREE.MathUtils.radToDeg(state.rotation.z),
      },
    });

    // Run flight controller tick
    flightController.tick(dt);

    // Report telemetry to parent
    onTelemetry({ ...state });
  });

  return null;
}

// Main scene component
function Scene({
  running,
  physicsState,
  setPhysicsState,
}: {
  running: boolean;
  physicsState: PhysicsState;
  setPhysicsState: (state: PhysicsState) => void;
}) {
  const { camera } = useThree();

  // Initial camera position
  useEffect(() => {
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 2, 0);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 10, 0]} intensity={0.5} />

      {/* Environment */}
      <Environment />

      {/* Drone */}
      <Drone
        position={[physicsState.position.x, physicsState.position.y, physicsState.position.z]}
        rotation={[physicsState.rotation.x, physicsState.rotation.y, physicsState.rotation.z]}
        motors={flightController.motors}
      />

      {/* Physics */}
      <PhysicsSimulation running={running} onTelemetry={setPhysicsState} />

      {/* Controls */}
      <OrbitControls
        target={[physicsState.position.x, physicsState.position.y, physicsState.position.z]}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

// Telemetry display component
function TelemetryPanel({ telemetry }: { telemetry: FlightTelemetry | null }) {
  if (!telemetry) return null;

  return (
    <div className="absolute top-4 left-4 bg-gray-900/90 backdrop-blur rounded-lg p-4 text-sm font-mono">
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Telemetry</h3>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Altitude:</span>
          <span className="text-blue-400">{telemetry.altitude.toFixed(2)}m</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Target:</span>
          <span className="text-yellow-400">{telemetry.targetAltitude.toFixed(1)}m</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">V. Velocity:</span>
          <span className="text-green-400">{telemetry.verticalVelocity.toFixed(2)}m/s</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Throttle:</span>
          <span className="text-orange-400">
            {(
              ((telemetry.motors.motor1 +
                telemetry.motors.motor2 +
                telemetry.motors.motor3 +
                telemetry.motors.motor4) /
                4) *
              100
            ).toFixed(0)}
            %
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">PID Error:</span>
          <span className={telemetry.pidError > 0.5 ? 'text-red-400' : 'text-green-400'}>
            {telemetry.pidError.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Motor visualization
function MotorIndicators({ motors }: { motors: MotorState }) {
  return (
    <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur rounded-lg p-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Motors</h3>
      <div className="grid grid-cols-2 gap-2">
        {[motors.motor1, motors.motor2, motors.motor3, motors.motor4].map((value, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className="text-xs text-gray-500">M{i + 1}</span>
            <div className="w-8 h-20 bg-gray-800 rounded relative">
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 to-green-400 rounded transition-all"
                style={{ height: `${value * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{(value * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main applet component
export default function FlightSimApplet({
  onSubmit,
}: {
  onSubmit?: (data: unknown) => void;
}) {
  const [running, setRunning] = useState(false);
  const [telemetry, setTelemetry] = useState<FlightTelemetry | null>(null);
  const [physicsState, setPhysicsState] = useState<PhysicsState>({
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0),
  });
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Setup telemetry callback
  useEffect(() => {
    flightController.onTelemetryUpdate((t) => setTelemetry(t));
    return () => flightController.onTelemetryUpdate(() => {});
  }, []);

  // Connect virtual device
  const connectVirtualDevice = useCallback(async () => {
    try {
      const id = await SerialManager.connectVirtual('ESP32-S3-FlightController');
      setDeviceId(id);
      setDeviceConnected(true);
      console.log('[FlightSim] Virtual device connected:', id);
    } catch (error) {
      console.error('[FlightSim] Failed to connect virtual device:', error);
    }
  }, []);

  // Disconnect device
  const disconnectDevice = useCallback(async () => {
    if (deviceId) {
      await SerialManager.disconnect(deviceId);
      setDeviceId(null);
      setDeviceConnected(false);
    }
  }, [deviceId]);

  // Reset simulation
  const resetSimulation = useCallback(() => {
    setRunning(false);
    flightController.reset();
    setPhysicsState({
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
    });
    setTelemetry(null);
  }, []);

  // Toggle running
  const toggleRunning = useCallback(() => {
    if (!running) {
      flightController.arm();
    }
    setRunning(!running);
  }, [running]);

  // Adjust target altitude
  const adjustTargetAltitude = useCallback((delta: number) => {
    flightController.setTargetAltitude(flightController.targetAltitude + delta);
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-gray-950">
      {/* 3D Canvas */}
      <div className="flex-1 relative">
        <Canvas shadows camera={{ fov: 50, near: 0.1, far: 100 }}>
          <Scene
            running={running}
            physicsState={physicsState}
            setPhysicsState={setPhysicsState}
          />
        </Canvas>

        {/* Overlays */}
        <TelemetryPanel telemetry={telemetry} />
        <MotorIndicators motors={flightController.motors} />

        {/* Status badges */}
        <div className="absolute bottom-4 left-4 flex gap-2">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              flightController.armed
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {flightController.armed ? 'ARMED' : 'DISARMED'}
          </span>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              flightController.autopilotEnabled
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {flightController.autopilotEnabled ? 'AUTOPILOT' : 'MANUAL'}
          </span>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              deviceConnected
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {deviceConnected ? 'ESP32 CONNECTED' : 'NO DEVICE'}
          </span>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-gray-900 border-t border-gray-800 p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Simulation controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleRunning}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                running
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
              {running ? 'Pause' : 'Start'}
            </button>

            <button
              onClick={resetSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
            >
              <RotateCcw size={18} />
              Reset
            </button>
          </div>

          {/* Autopilot controls */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-yellow-400" />
              <span className="text-sm text-gray-400">Target:</span>
              <button
                onClick={() => adjustTargetAltitude(-1)}
                className="p-1 bg-gray-700 hover:bg-gray-600 rounded"
              >
                <ChevronDown size={16} />
              </button>
              <span className="w-16 text-center font-mono text-white">
                {flightController.targetAltitude.toFixed(1)}m
              </span>
              <button
                onClick={() => adjustTargetAltitude(1)}
                className="p-1 bg-gray-700 hover:bg-gray-600 rounded"
              >
                <ChevronUp size={16} />
              </button>
            </div>

            <button
              onClick={() => flightController.toggleAutopilot()}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                flightController.autopilotEnabled
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              <Cpu size={18} />
              Autopilot
            </button>
          </div>

          {/* Device controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={deviceConnected ? disconnectDevice : connectVirtualDevice}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                deviceConnected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              <Radio size={18} />
              {deviceConnected ? 'Disconnect' : 'Connect Virtual'}
            </button>

            <button
              onClick={() => flightController.toggleArmed()}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                flightController.armed
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <Power size={18} />
              {flightController.armed ? 'Disarm' : 'Arm'}
            </button>
          </div>

          {/* Export */}
          <button
            onClick={() =>
              onSubmit?.({
                telemetryHistory: flightController.telemetryHistory,
                config: flightController.toJSON(),
              })
            }
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm"
          >
            Export Data
          </button>
        </div>
      </div>
    </div>
  );
}
