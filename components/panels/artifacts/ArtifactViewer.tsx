'use client';

import { useState } from 'react';
import ThreeRenderer, { ThreeScene } from './ThreeRenderer';
import PlotRenderer, { PlotData } from './PlotRenderer';
import { Eye, Code, Maximize2, Minimize2 } from 'lucide-react';

export type ViewMode = 'preview' | 'code';

export type ArtifactData =
  | { type: '3d-scene'; data: ThreeScene }
  | { type: 'plot'; data: PlotData }
  | { type: 'code'; data: { language: string; code: string; title?: string; executable?: boolean } };

interface ArtifactViewerProps {
  artifact: ArtifactData;
  defaultView?: ViewMode;
  height?: number | string;
}

/**
 * ArtifactViewer - Tabbed component for displaying artifacts
 *
 * Features:
 * - Multiple artifact types (3D scenes, plots, code)
 * - Tabbed view mode: Preview | Code
 * - Code serialization for all visual artifacts
 * - Maximizable panel
 */
export default function ArtifactViewer({
  artifact,
  defaultView = 'preview',
  height = '100%',
}: ArtifactViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [isMaximized, setIsMaximized] = useState(false);

  // Generate code representation from artifact data
  const getCodeRepresentation = (): string => {
    switch (artifact.type) {
      case '3d-scene':
        return generateThreeSceneCode(artifact.data);
      case 'plot':
        return generatePlotCode(artifact.data);
      case 'code':
        return artifact.data.code;
      default:
        return '// No code representation available';
    }
  };

  const getTitle = (): string => {
    switch (artifact.type) {
      case '3d-scene':
        return artifact.data.title || '3D Scene';
      case 'plot':
        return artifact.data.title || 'Plot';
      case 'code':
        return artifact.data.title || 'Code';
      default:
        return 'Artifact';
    }
  };

  const getLanguage = (): string => {
    if (artifact.type === 'code') {
      return artifact.data.language;
    }
    // Plots use Python
    if (artifact.type === 'plot') {
      return 'python';
    }
    // 3D scenes use JavaScript
    if (artifact.type === '3d-scene') {
      return 'javascript';
    }
    return 'javascript';
  };

  const canExecute = (): boolean => {
    // Code artifacts can opt-in to execution
    if (artifact.type === 'code') {
      return artifact.data.executable !== false;
    }
    // Generated code is executable for plots
    return artifact.type === 'plot';
  };

  const hasPreview = (): boolean => {
    return artifact.type === '3d-scene' || artifact.type === 'plot';
  };

  const code = getCodeRepresentation();
  const title = getTitle();
  const language = getLanguage();
  const isExecutable = canExecute();
  const showPreview = hasPreview();

  const tabs: { id: ViewMode; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    {
      id: 'preview',
      label: 'Preview',
      icon: <Eye className="w-4 h-4" />,
      disabled: !showPreview
    },
    {
      id: 'code',
      label: 'Code',
      icon: <Code className="w-4 h-4" />
    },
  ];

  return (
    <div
      className={`flex flex-col bg-bg-secondary border border-border-primary rounded-lg overflow-hidden
                  ${isMaximized ? 'fixed inset-4 z-50' : ''}`}
      style={{ height: isMaximized ? 'auto' : (typeof height === 'number' ? `${height}px` : height) }}
    >
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-bg-primary">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-fg-primary">{title}</h3>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setViewMode(tab.id)}
                disabled={tab.disabled}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === tab.id
                    ? 'bg-accent-primary text-white'
                    : tab.disabled
                      ? 'text-fg-muted cursor-not-allowed'
                      : 'text-fg-secondary hover:text-fg-primary hover:bg-white/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setIsMaximized(!isMaximized)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
          title={isMaximized ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' && showPreview && (
          <div className="h-full p-4">
            {renderPreview()}
          </div>
        )}

        {(viewMode === 'code' || (viewMode === 'preview' && !showPreview)) && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              <pre className="text-xs p-4 h-full bg-bg-elevated font-mono">
                <code className="text-accent-primary">{code}</code>
              </pre>
            </div>
            {isExecutable && (
              <div className="px-4 py-2 text-xs text-fg-muted border-t border-border-primary">
                Code execution not available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  function renderPreview() {
    switch (artifact.type) {
      case '3d-scene':
        return <ThreeRenderer sceneData={artifact.data} height="100%" />;
      case 'plot':
        return <PlotRenderer plotData={artifact.data} height={400} />;
      case 'code':
        return (
          <div className="h-full flex items-center justify-center text-fg-tertiary text-sm">
            No preview available - switch to Code tab
          </div>
        );
      default:
        return (
          <div className="h-full flex items-center justify-center text-fg-tertiary text-sm">
            Unknown artifact type
          </div>
        );
    }
  }
}

/**
 * Generate JavaScript code for Three.js scenes
 */
function generateThreeSceneCode(scene: ThreeScene): string {
  const imports = `import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';`;

  const sceneSetup = `
// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Setup camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(${scene.camera?.position?.join(', ') || '5, 5, 5'});
camera.lookAt(${scene.camera?.lookAt?.join(', ') || '0, 0, 0'});

// Setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;`;

  const lights = scene.lights?.map((light, i) => {
    switch (light.type) {
      case 'ambient':
        return `const ambientLight${i} = new THREE.AmbientLight(${light.color || '0x404040'}, ${light.intensity || 1});
scene.add(ambientLight${i});`;
      case 'directional':
        return `const directionalLight${i} = new THREE.DirectionalLight(${light.color || '0xffffff'}, ${light.intensity || 0.5});
directionalLight${i}.position.set(${light.position?.join(', ') || '5, 5, 5'});
scene.add(directionalLight${i});`;
      case 'point':
        return `const pointLight${i} = new THREE.PointLight(${light.color || '0xffffff'}, ${light.intensity || 1});
pointLight${i}.position.set(${light.position?.join(', ') || '0, 5, 0'});
scene.add(pointLight${i});`;
    }
  }).join('\n\n') || '';

  const objects = scene.objects.map((obj, i) => {
    let geom = '';
    switch (obj.type) {
      case 'cube':
        geom = 'new THREE.BoxGeometry(1, 1, 1)';
        break;
      case 'sphere':
        geom = 'new THREE.SphereGeometry(1, 32, 32)';
        break;
      case 'plane':
        geom = 'new THREE.PlaneGeometry(5, 5)';
        break;
      default:
        geom = 'new THREE.BoxGeometry(1, 1, 1)';
    }

    return `const geometry${i} = ${geom};
const material${i} = new THREE.MeshStandardMaterial({
  color: ${obj.color || '0x00ff00'},
  wireframe: ${obj.wireframe || false}
});
const mesh${i} = new THREE.Mesh(geometry${i}, material${i});
mesh${i}.position.set(${obj.position?.join(', ') || '0, 0, 0'});
${obj.rotation ? `mesh${i}.rotation.set(${obj.rotation.join(', ')});` : ''}
${obj.scale ? `mesh${i}.scale.set(${obj.scale.join(', ')});` : ''}
scene.add(mesh${i});`;
  }).join('\n\n');

  const animation = scene.animation ? `
// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Custom animation
  const time = Date.now() * 0.001;
  // Add your animation logic here

  renderer.render(scene, camera);
}
animate();` : `
// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();`;

  return `${imports}\n${sceneSetup}\n\n// Add lights\n${lights}\n\n// Add objects\n${objects}\n${animation}`;
}

/**
 * Generate Python code for plots using matplotlib
 */
function generatePlotCode(plot: PlotData): string {
  const imports = `import matplotlib.pyplot as plt
import numpy as np`;

  const data = `
# Data
data = ${JSON.stringify(plot.data, null, 2)}
x = [d['${plot.xKey}'] for d in data]
y = [d['${plot.yKey}'] for d in data]`;

  let plotCode = '';
  switch (plot.type) {
    case 'line':
      plotCode = `
# Create line plot
plt.figure(figsize=(10, 6))
plt.plot(x, y, color='${plot.color || '#00ff00'}', linewidth=2, marker='o')
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Line Plot'}')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`;
      break;
    case 'scatter':
      plotCode = `
# Create scatter plot
plt.figure(figsize=(10, 6))
plt.scatter(x, y, color='${plot.color || '#00ff00'}', alpha=0.6, s=100)
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Scatter Plot'}')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()`;
      break;
    case 'bar':
      plotCode = `
# Create bar chart
plt.figure(figsize=(10, 6))
plt.bar(x, y, color='${plot.color || '#00ff00'}', alpha=0.8)
plt.xlabel('${plot.xKey}')
plt.ylabel('${plot.yKey}')
plt.title('${plot.title || 'Bar Chart'}')
plt.grid(True, alpha=0.3, axis='y')
plt.tight_layout()
plt.show()`;
      break;
  }

  return `${imports}${data}${plotCode}`;
}
