---
skill_id: threejs-cube-node
name: 3D Animated Cube
description: Creates and animates a 3D cube using Three.js
type: threejs
execution_mode: browser-wasm
category: 3d-graphics
tags: ["3d", "animation", "threejs", "graphics"]
version: 1.0.0
author: system
estimated_time_ms: 50
memory_mb: 5
inputs:
  - name: size
    type: number
    description: Size of the cube
    default: 1
    required: true
  - name: color
    type: string
    description: Color of the cube (hex format)
    default: "#00ff00"
    required: true
  - name: rotation_speed
    type: number
    description: Rotation speed (radians per frame)
    default: 0.01
    required: true
  - name: wireframe
    type: boolean
    description: Render as wireframe
    default: false
    required: false
outputs:
  - name: scene_data
    type: object
    description: Three.js scene configuration
  - name: animation_frame
    type: number
    description: Current animation frame number
---

# 3D Animated Cube

Creates a 3D cube with configurable size, color, and rotation using Three.js.

## Inputs
- **size** (number): Size of the cube
- **color** (string): Color of the cube (hex format)
- **rotation_speed** (number): Rotation speed (radians per frame)
- **wireframe** (boolean): Render as wireframe

## Outputs
- **scene_data** (object): Three.js scene configuration
- **animation_frame** (number): Current animation frame number

## Code

```javascript
function execute(inputs) {
    /**
     * Creates a Three.js cube configuration.
     *
     * This runs directly in the browser (no Wasm compilation needed).
     * The output is a scene description that the UI renders.
     */

    const size = inputs.size || 1;
    const color = inputs.color || '#00ff00';
    const rotationSpeed = inputs.rotation_speed || 0.01;
    const wireframe = inputs.wireframe || false;

    // Return scene configuration
    // The UI will use this to create/update the Three.js scene
    return {
        scene_data: {
            type: 'cube',
            geometry: {
                type: 'BoxGeometry',
                args: [size, size, size]
            },
            material: {
                type: wireframe ? 'MeshBasicMaterial' : 'MeshStandardMaterial',
                color: color,
                wireframe: wireframe,
                metalness: 0.5,
                roughness: 0.5
            },
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            animation: {
                type: 'rotate',
                axis: 'y',
                speed: rotationSpeed
            },
            lighting: [
                {
                    type: 'AmbientLight',
                    color: '#ffffff',
                    intensity: 0.5
                },
                {
                    type: 'DirectionalLight',
                    color: '#ffffff',
                    intensity: 0.8,
                    position: [5, 5, 5]
                }
            ],
            camera: {
                type: 'PerspectiveCamera',
                fov: 75,
                position: [0, 0, 5]
            }
        },
        animation_frame: 0
    };
}
```

## Usage Notes

This node executes in browser-wasm.
Estimated execution time: 50ms
Memory usage: ~5MB

### Example Workflow

1. Connect to "Scene Composer" to combine multiple 3D objects
2. Pipe to "Render Output" to display in canvas
3. Connect rotation_speed input to "Slider Control" for interactive adjustment

### Three.js Integration

The UI renders this using:
```javascript
// Pseudo-code for UI integration
const sceneData = nodeOutput.scene_data;
const geometry = new THREE.BoxGeometry(...sceneData.geometry.args);
const material = new THREE.MeshStandardMaterial(sceneData.material);
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// Animation loop
function animate() {
    cube.rotation.y += sceneData.animation.speed;
    renderer.render(scene, camera);
}
```
