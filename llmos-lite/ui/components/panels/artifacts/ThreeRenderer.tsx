'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ThreeScene {
  type: '3d-scene';
  title?: string;
  objects: ThreeObject[];
  camera?: {
    position?: [number, number, number];
    lookAt?: [number, number, number];
  };
  lights?: ThreeLight[];
  animation?: (scene: THREE.Scene, camera: THREE.Camera, time: number) => void;
}

export interface ThreeObject {
  type: 'cube' | 'sphere' | 'plane' | 'custom';
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string;
  wireframe?: boolean;
  geometry?: any; // For custom geometries
  material?: any; // For custom materials
}

export interface ThreeLight {
  type: 'ambient' | 'directional' | 'point';
  color?: string;
  intensity?: number;
  position?: [number, number, number];
}

interface ThreeRendererProps {
  sceneData: ThreeScene;
  width?: number | string;
  height?: number | string;
  enableControls?: boolean;
}

/**
 * ThreeRenderer - 3D visualization component using Three.js
 *
 * Features:
 * - Real-time WebGL rendering
 * - Orbit controls (pan, zoom, rotate)
 * - Animation support
 * - Multiple object types (cube, sphere, plane)
 * - Custom geometries and materials
 *
 * Used for displaying:
 * - 3D molecular structures
 * - Quantum state visualizations
 * - Geometric simulations
 * - Custom 3D artifacts from workflows
 */
export default function ThreeRenderer({
  sceneData,
  width = '100%',
  height = 400,
  enableControls = true,
}: ThreeRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Get container dimensions
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = typeof height === 'number' ? height : 400;

    // Initialize scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerWidth / containerHeight,
      0.1,
      1000
    );
    const camPos = sceneData.camera?.position || [5, 5, 5];
    camera.position.set(...camPos);
    const lookAt = sceneData.camera?.lookAt || [0, 0, 0];
    camera.lookAt(...lookAt);
    cameraRef.current = camera;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add controls
    if (enableControls) {
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;
    }

    // Add lights
    const lights = sceneData.lights || [
      { type: 'ambient' as const, color: '#404040', intensity: 1 },
      { type: 'directional' as const, color: '#ffffff', intensity: 0.5, position: [5, 5, 5] },
    ];

    lights.forEach((lightData) => {
      let light: THREE.Light;
      switch (lightData.type) {
        case 'ambient':
          light = new THREE.AmbientLight(
            lightData.color || '#404040',
            lightData.intensity || 1
          );
          break;
        case 'directional':
          light = new THREE.DirectionalLight(
            lightData.color || '#ffffff',
            lightData.intensity || 0.5
          );
          if (lightData.position) {
            light.position.set(...lightData.position);
          }
          break;
        case 'point':
          light = new THREE.PointLight(
            lightData.color || '#ffffff',
            lightData.intensity || 1
          );
          if (lightData.position) {
            light.position.set(...lightData.position);
          }
          break;
      }
      scene.add(light);
    });

    // Add objects
    sceneData.objects.forEach((objData) => {
      const obj = createObject(objData);
      if (obj) scene.add(obj);
    });

    // Animation loop
    let startTime = Date.now();
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Custom animation if provided
      if (sceneData.animation) {
        const elapsed = (Date.now() - startTime) / 1000;
        sceneData.animation(scene, camera, elapsed);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = typeof height === 'number' ? height : 400;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, [sceneData, height, enableControls]);

  return (
    <div
      className="bg-black border border-terminal-border rounded overflow-hidden"
      style={{ width, height }}
    >
      {sceneData.title && (
        <div className="bg-terminal-bg border-b border-terminal-border px-4 py-2">
          <h3 className="text-terminal-accent-green text-sm font-mono">
            {sceneData.title}
          </h3>
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/**
 * Helper function to create Three.js objects from data
 */
function createObject(objData: ThreeObject): THREE.Object3D | null {
  let geometry: THREE.BufferGeometry;
  let material: THREE.Material;

  // Create geometry
  switch (objData.type) {
    case 'cube':
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(1, 32, 32);
      break;
    case 'plane':
      geometry = new THREE.PlaneGeometry(5, 5);
      break;
    case 'custom':
      if (!objData.geometry) return null;
      geometry = objData.geometry;
      break;
    default:
      return null;
  }

  // Create material
  if (objData.material) {
    material = objData.material;
  } else {
    material = new THREE.MeshStandardMaterial({
      color: objData.color || '#00ff00',
      wireframe: objData.wireframe || false,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);

  // Set transformations
  if (objData.position) {
    mesh.position.set(...objData.position);
  }
  if (objData.rotation) {
    mesh.rotation.set(...objData.rotation);
  }
  if (objData.scale) {
    mesh.scale.set(...objData.scale);
  }

  return mesh;
}

/**
 * Example usage:
 *
 * // Rotating cube
 * const cubeScene: ThreeScene = {
 *   type: '3d-scene',
 *   title: '3D Cube Animation',
 *   objects: [
 *     {
 *       type: 'cube',
 *       position: [0, 0, 0],
 *       color: '#00ff00',
 *     },
 *   ],
 *   animation: (scene, camera, time) => {
 *     const cube = scene.children.find(obj => obj instanceof THREE.Mesh);
 *     if (cube) {
 *       cube.rotation.x = time;
 *       cube.rotation.y = time * 0.5;
 *     }
 *   },
 * };
 *
 * <ThreeRenderer sceneData={cubeScene} />
 */
