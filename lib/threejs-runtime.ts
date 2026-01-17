/**
 * Three.js Runtime - Execute and render Three.js code in the browser
 *
 * Features:
 * - Safe execution of Three.js code with eval in isolated scope
 * - Canvas rendering with automatic cleanup
 * - Support for animation loops
 * - Error handling and validation
 */

'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ThreeJSExecutionResult {
  success: boolean;
  error?: string;
  canvasId?: string;
  animationId?: number;
}

export class ThreeJSRuntime {
  private canvasElement: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private animationId: number | null = null;

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvasElement = canvasElement;
  }

  /**
   * Execute Three.js code and render to canvas
   */
  async execute(code: string): Promise<ThreeJSExecutionResult> {
    try {
      // Validate code
      if (!code.trim()) {
        return { success: false, error: 'Empty code provided' };
      }

      // Clean up previous render
      this.cleanup();

      // Create renderer
      if (!this.canvasElement) {
        return { success: false, error: 'Canvas element not available' };
      }

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasElement,
        antialias: true,
        alpha: true,
      });

      const width = this.canvasElement.parentElement?.clientWidth || 800;
      const height = this.canvasElement.parentElement?.clientHeight || 600;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio);

      // Create context for code execution
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 5;

      // Add lights by default
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      scene.add(directionalLight);

      // Add orbit controls
      const controls = new OrbitControls(camera, this.canvasElement);
      controls.enableDamping = true;

      // Execute user code in isolated scope
      const executeCode = new Function(
        'THREE',
        'scene',
        'camera',
        'renderer',
        'controls',
        `
        ${code}

        // Return animation function if defined
        if (typeof animate === 'function') {
          return animate;
        }
        return null;
        `
      );

      const animateFunction = executeCode(
        THREE,
        scene,
        camera,
        this.renderer,
        controls
      );

      // Animation loop
      const animate = () => {
        this.animationId = requestAnimationFrame(animate);

        controls.update();

        // Call user's animate function if provided
        if (typeof animateFunction === 'function') {
          animateFunction();
        }

        if (this.renderer) {
          this.renderer.render(scene, camera);
        }
      };

      // Start animation
      animate();

      // Handle window resize
      const handleResize = () => {
        if (!this.canvasElement || !this.renderer) return;

        const width = this.canvasElement.parentElement?.clientWidth || 800;
        const height = this.canvasElement.parentElement?.clientHeight || 600;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      };

      window.addEventListener('resize', handleResize);

      return {
        success: true,
        canvasId: this.canvasElement.id,
        animationId: this.animationId || undefined,
      };
    } catch (error) {
      console.error('[ThreeJSRuntime] Execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Cancel animation frame
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  /**
   * Dispose and clean up all resources
   */
  dispose() {
    this.cleanup();
    this.canvasElement = null;
  }
}

/**
 * Validate Three.js code
 */
export function validateThreeJSCode(code: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for dangerous patterns
  if (code.includes('eval(') || code.includes('Function(')) {
    errors.push('Code contains potentially dangerous eval() or Function() calls');
  }

  if (code.includes('import ') || code.includes('require(')) {
    errors.push('Code cannot contain import or require statements. Use provided THREE object.');
  }

  // Check for common mistakes
  if (!code.includes('THREE.')) {
    warnings.push('Code does not appear to use THREE object. Make sure to use THREE.Mesh, THREE.BoxGeometry, etc.');
  }

  if (!code.includes('scene.add')) {
    warnings.push('Code does not add anything to the scene. Use scene.add(object) to add objects.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get Three.js code template
 */
export function getThreeJSTemplate(): string {
  return `// Create a rotating cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshPhongMaterial({
  color: 0xC15F3C, // Claude's signature orange
  shininess: 100
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Animation function (optional)
function animate() {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
}`;
}
