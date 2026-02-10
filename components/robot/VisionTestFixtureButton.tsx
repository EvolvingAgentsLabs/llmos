'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { FlaskConical, Download, Loader2, CheckCircle2, X } from 'lucide-react';
import { VISION_TEST_SCENARIOS, type VisionTestScenario } from '@/lib/runtime/vision/vision-test-scenarios';
import { buildTestFixtureZip, downloadBlob } from '@/lib/runtime/vision/vision-test-fixture-generator';
import type { FloorMap } from '@/lib/hardware/cube-robot-simulator';

// ═══════════════════════════════════════════════════════════════════════════
// OFFSCREEN SCENE RENDERER — renders a scenario from robot's POV
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Camera controller that positions the camera at the robot's pose,
 * looking forward from first-person perspective.
 */
function ScenarioCamera({ pose }: { pose: { x: number; y: number; rotation: number } }) {
  const { camera } = useThree();

  useFrame(() => {
    // Robot camera position: slightly above and behind the robot center
    const camHeight = 0.055; // 5.5cm above ground (robot body center)
    const camForwardOffset = 0.045; // Slightly forward from center

    // Calculate forward direction from rotation
    const forwardX = Math.cos(pose.rotation);
    const forwardZ = -Math.sin(pose.rotation); // Negative because Three.js Z is inverted

    camera.position.set(
      pose.x + forwardX * camForwardOffset,
      camHeight,
      -pose.y + forwardZ * camForwardOffset  // Y -> Z with flip for Three.js coords
    );

    // Look forward along robot's heading, slightly downward
    const lookDistance = 2.0;
    const lookDownAngle = -0.5; // ~30 degrees downward
    camera.lookAt(
      pose.x + forwardX * lookDistance,
      camHeight + lookDownAngle,
      -pose.y + forwardZ * lookDistance
    );

    camera.updateProjectionMatrix();
  });

  return (
    <PerspectiveCamera
      makeDefault
      fov={60}
      near={0.01}
      far={50}
      position={[0, 0.08, 0]}
    />
  );
}

/** Simple floor with grid */
function ScenarioFloor({ bounds }: { bounds: FloorMap['bounds'] }) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#B0B0B0" metalness={0.1} roughness={0.8} />
      </mesh>
      {/* Grid lines */}
      {(() => {
        const lines: JSX.Element[] = [];
        const step = 0.5;
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
              <lineBasicMaterial attach="material" color={isOrigin ? "#505050" : isMajor ? "#707070" : "#959595"} />
            </line>
          );
        }
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
              <lineBasicMaterial attach="material" color={isOrigin ? "#505050" : isMajor ? "#707070" : "#959595"} />
            </line>
          );
        }
        return lines;
      })()}
    </group>
  );
}

/** Wall texture (blue with chevrons) */
function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1565C0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  for (let row = 0; row < 2; row++) {
    const y = 10 + row * 32;
    ctx.beginPath(); ctx.moveTo(0, y + 20); ctx.lineTo(32, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, y + 20); ctx.lineTo(32, y); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Obstacle texture (red-white diagonal stripes) */
function createObstacleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#D32F2F';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  for (let i = -1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 24, 0);
    ctx.lineTo(i * 24 + 64, 64);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Render walls from a floor map */
function ScenarioWalls({ walls }: { walls: FloorMap['walls'] }) {
  const wallTexture = createWallTexture();

  return (
    <group>
      {walls.map((wall, i) => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const cx = (wall.x1 + wall.x2) / 2;
        const cy = (wall.y1 + wall.y2) / 2;
        const wallHeight = 0.15;
        const wallThickness = 0.03;

        return (
          <mesh
            key={`wall-${i}`}
            position={[cx, wallHeight / 2, -cy]}
            rotation={[0, -angle, 0]}
            castShadow
          >
            <boxGeometry args={[length, wallHeight, wallThickness]} />
            <meshStandardMaterial map={wallTexture} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Render obstacles from a floor map */
function ScenarioObstacles({ obstacles }: { obstacles: FloorMap['obstacles'] }) {
  const obstacleTexture = createObstacleTexture();

  return (
    <group>
      {obstacles.map((obs, i) => {
        const height = Math.max(0.1, obs.radius * 0.8);
        return (
          <mesh
            key={`obs-${i}`}
            position={[obs.x, height / 2, -obs.y]}
            castShadow
          >
            <cylinderGeometry args={[obs.radius, obs.radius, height, 16]} />
            <meshStandardMaterial map={obstacleTexture} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Render collectibles from a floor map */
function ScenarioCollectibles({ collectibles }: { collectibles: NonNullable<FloorMap['collectibles']> }) {
  return (
    <group>
      {collectibles.map((c) => {
        const color = c.color || '#FFD700';
        if (c.type === 'gem') {
          return (
            <mesh key={c.id} position={[c.x, 0.05, -c.y]}>
              <octahedronGeometry args={[c.radius]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
          );
        }
        // Default: coin (flat cylinder)
        return (
          <mesh key={c.id} position={[c.x, 0.02, -c.y]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[c.radius, c.radius, 0.01, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.8} roughness={0.2} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Component that captures the canvas once the scene is rendered,
 * then calls onCapture with the data URL.
 */
function CaptureOnRender({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const { gl } = useThree();
  const capturedRef = useRef(false);
  const frameCount = useRef(0);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  useFrame(() => {
    frameCount.current++;
    // Wait enough frames for the scene geometry + lighting to stabilize
    if (frameCount.current >= 10 && !capturedRef.current) {
      capturedRef.current = true;
      try {
        const dataUrl = gl.domElement.toDataURL('image/png');
        onCaptureRef.current(dataUrl);
      } catch (e) {
        console.error('Failed to capture canvas:', e);
        onCaptureRef.current('');
      }
    }
  });

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUTTON + MODAL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface CaptureResult {
  scenarioId: number;
  scenarioName: string;
  imageDataUrl: string;
  promptText: string;
  expectedResult: string;
}

export default function VisionTestFixtureButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(-1);
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [isDone, setIsDone] = useState(false);
  const captureResolveRef = useRef<((dataUrl: string) => void) | null>(null);

  const totalScenarios = VISION_TEST_SCENARIOS.length;
  const currentScenario = currentScenarioIdx >= 0 && currentScenarioIdx < totalScenarios
    ? VISION_TEST_SCENARIOS[currentScenarioIdx]
    : null;

  // Handle a capture from the renderer
  const handleCapture = useCallback((dataUrl: string) => {
    if (captureResolveRef.current) {
      captureResolveRef.current(dataUrl);
      captureResolveRef.current = null;
    }
  }, []);

  // Wait for a capture to complete
  const waitForCapture = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      captureResolveRef.current = resolve;
    });
  }, []);

  // Run all scenarios sequentially
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setCaptures([]);
    setIsDone(false);

    const results: CaptureResult[] = [];

    for (let i = 0; i < totalScenarios; i++) {
      const scenario = VISION_TEST_SCENARIOS[i];

      // IMPORTANT: Set up the capture promise BEFORE triggering the Canvas render.
      // CaptureOnRender fires after ~10 frames (~167ms at 60fps). If we set up
      // the promise after setState + delay, the capture can fire before the
      // resolve ref is in place, causing a deadlock.
      const capturePromise = waitForCapture();

      // Trigger render of new scenario (Canvas remounts due to key prop)
      setCurrentScenarioIdx(i);

      // Wait for CaptureOnRender to capture the canvas
      const imageDataUrl = await capturePromise;

      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        imageDataUrl,
        promptText: scenario.promptText,
        expectedResult: scenario.expectedResult,
      });

      setCaptures([...results]);
    }

    setCurrentScenarioIdx(-1);
    setIsGenerating(false);
    setIsDone(true);
  }, [totalScenarios, waitForCapture]);

  // Download the zip
  const handleDownload = useCallback(() => {
    if (captures.length === 0) return;
    const blob = buildTestFixtureZip(captures);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadBlob(blob, `vision-test-fixtures-${timestamp}.zip`);
  }, [captures]);

  // Reset state when closing
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsGenerating(false);
    setCurrentScenarioIdx(-1);
    setCaptures([]);
    setIsDone(false);
  }, []);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] hover:border-[#da3633] flex items-center justify-center transition-colors"
        title="Generate Vision Test Fixtures"
      >
        <FlaskConical className="w-4 h-4 text-[#8b949e] hover:text-[#da3633]" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#30363d]">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-[#da3633]" />
                <span className="text-sm font-semibold text-[#e6edf3]">Vision Test Fixture Generator</span>
              </div>
              <button onClick={handleClose} className="p-1 rounded hover:bg-[#21262d]">
                <X className="w-4 h-4 text-[#8b949e]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Generates test fixtures for all {totalScenarios} vision analysis scenarios.
                Each scenario renders the robot&apos;s first-person camera view in a hardcoded scene,
                then packages the image + prompt + expected result into a downloadable zip file.
              </p>

              {/* Scenario List */}
              <div className="space-y-1">
                {VISION_TEST_SCENARIOS.map((s, idx) => {
                  const captured = captures.find(c => c.scenarioId === s.id);
                  const isActive = currentScenarioIdx === idx;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-[#da3633]/20 border border-[#da3633]/50'
                          : captured
                          ? 'bg-[#238636]/10 border border-[#238636]/30'
                          : 'bg-[#0d1117] border border-[#30363d]'
                      }`}
                    >
                      <span className="w-5 text-center font-mono text-[#6e7681]">{s.id}</span>
                      <span className={`flex-1 ${isActive ? 'text-[#da3633]' : captured ? 'text-[#3fb950]' : 'text-[#e6edf3]'}`}>
                        {s.name}
                      </span>
                      {isActive && <Loader2 className="w-3.5 h-3.5 text-[#da3633] animate-spin" />}
                      {captured && <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />}
                    </div>
                  );
                })}
              </div>

              {/* Rendering Canvas (hidden but functional) */}
              {currentScenario && (
                <div className="border border-[#30363d] rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#0d1117] border-b border-[#30363d]">
                    <span className="text-[10px] text-[#8b949e] uppercase tracking-wider">
                      Rendering: {currentScenario.name}
                    </span>
                  </div>
                  <div style={{ width: 600, height: 400 }}>
                    <Canvas
                      key={`scenario-${currentScenario.id}`}
                      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
                      dpr={[1, 2]}
                      style={{ width: 600, height: 400 }}
                    >
                      <ScenarioCamera pose={currentScenario.robotPose} />
                      <CaptureOnRender onCapture={handleCapture} />

                      {/* Lighting */}
                      <ambientLight intensity={0.6} />
                      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
                      <pointLight position={[-5, 5, -5]} intensity={0.4} />

                      {/* Scene elements */}
                      <ScenarioFloor bounds={currentScenario.floorMap.bounds} />
                      <ScenarioWalls walls={currentScenario.floorMap.walls} />
                      {currentScenario.floorMap.obstacles.length > 0 && (
                        <ScenarioObstacles obstacles={currentScenario.floorMap.obstacles} />
                      )}
                      {currentScenario.floorMap.collectibles && currentScenario.floorMap.collectibles.length > 0 && (
                        <ScenarioCollectibles collectibles={currentScenario.floorMap.collectibles} />
                      )}

                      {/* Background and fog */}
                      <color attach="background" args={['#1A1A2E']} />
                      <fog attach="fog" args={['#1A1A2E', 3, 10]} />
                    </Canvas>
                  </div>
                </div>
              )}

              {/* Preview last capture */}
              {captures.length > 0 && !isGenerating && (
                <div className="border border-[#30363d] rounded-lg overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#0d1117] border-b border-[#30363d]">
                    <span className="text-[10px] text-[#8b949e] uppercase tracking-wider">
                      Last Captured: Scenario {captures[captures.length - 1].scenarioId}
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={captures[captures.length - 1].imageDataUrl}
                    alt={`Scenario ${captures[captures.length - 1].scenarioId}`}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#30363d] bg-[#0d1117]">
              <span className="text-xs text-[#6e7681]">
                {isDone
                  ? `${captures.length}/${totalScenarios} scenarios captured`
                  : isGenerating
                  ? `Rendering scenario ${currentScenarioIdx + 1}/${totalScenarios}...`
                  : `${totalScenarios} scenarios ready`}
              </span>
              <div className="flex items-center gap-2">
                {isDone && captures.length > 0 && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#238636] text-white text-xs font-medium hover:bg-[#2ea043] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Zip
                  </button>
                )}
                {!isGenerating && !isDone && (
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#da3633] text-white text-xs font-medium hover:bg-[#f85149] transition-colors"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Generate All Fixtures
                  </button>
                )}
                {isDone && (
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] text-xs hover:text-[#e6edf3] transition-colors"
                  >
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
