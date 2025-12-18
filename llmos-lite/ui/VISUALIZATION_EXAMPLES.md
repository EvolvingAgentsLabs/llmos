# Visual Output Examples

This document contains example prompts and code snippets that demonstrate the auto-execution and visual rendering capabilities of LLMos-Lite.

## How It Works

When you include Python code blocks in assistant responses, the system will:
1. **Auto-execute** the code when the message is rendered
2. **Show visual output first** (circuit diagrams, plots, 3D renders)
3. **Hide code by default** - users can toggle to see the code
4. Support switching between "Visual" and "Code" views

## Quantum Circuit Visualization

### Example 1: Simple Quantum Circuit

```python
import matplotlib.pyplot as plt
import numpy as np

# Create a simple quantum circuit visualization
fig, ax = plt.subplots(figsize=(10, 4))

# Draw circuit elements
gates = ['H', 'CNOT', 'Measure']
qubits = ['q0', 'q1']

# Draw qubit lines
for i, qubit in enumerate(qubits):
    ax.plot([0, 10], [i, i], 'k-', linewidth=2)
    ax.text(-0.5, i, qubit, ha='right', va='center', fontsize=12)

# Draw gates
# Hadamard gate on q0
rect = plt.Rectangle((1.5, -0.3), 0.6, 0.6, fill=True, facecolor='lightblue', edgecolor='black')
ax.add_patch(rect)
ax.text(1.8, 0, 'H', ha='center', va='center', fontsize=14, weight='bold')

# CNOT gate
ax.plot([3.5, 3.5], [0, 1], 'k-', linewidth=2)
ax.plot(3.5, 0, 'ko', markersize=8, fillstyle='full')
ax.plot(3.5, 1, 'ko', markersize=15, fillstyle='none')
ax.plot([3.4, 3.6], [1, 1], 'k-', linewidth=2)
ax.plot([3.5, 3.5], [0.9, 1.1], 'k-', linewidth=2)

# Measurement on both qubits
for i in range(2):
    rect = plt.Rectangle((6, i-0.3), 1, 0.6, fill=True, facecolor='lightyellow', edgecolor='black')
    ax.add_patch(rect)
    ax.text(6.5, i, 'M', ha='center', va='center', fontsize=14, weight='bold')

ax.set_xlim(-1, 8)
ax.set_ylim(-0.5, 1.5)
ax.set_aspect('equal')
ax.axis('off')
ax.set_title('Quantum Circuit: Bell State Preparation', fontsize=16, weight='bold')

plt.tight_layout()
plt.show()
```

### Example 2: Quantum State Visualization (Bloch Sphere)

```python
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D

# Create Bloch sphere visualization
fig = plt.figure(figsize=(10, 10))
ax = fig.add_subplot(111, projection='3d')

# Draw sphere
u = np.linspace(0, 2 * np.pi, 100)
v = np.linspace(0, np.pi, 100)
x = np.outer(np.cos(u), np.sin(v))
y = np.outer(np.sin(u), np.sin(v))
z = np.outer(np.ones(np.size(u)), np.cos(v))

ax.plot_surface(x, y, z, alpha=0.1, color='cyan')

# Draw axes
axis_length = 1.3
ax.plot([0, axis_length], [0, 0], [0, 0], 'r-', linewidth=2)
ax.plot([0, 0], [0, axis_length], [0, 0], 'g-', linewidth=2)
ax.plot([0, 0], [0, 0], [0, axis_length], 'b-', linewidth=2)

ax.text(axis_length, 0, 0, 'X', fontsize=14, weight='bold')
ax.text(0, axis_length, 0, 'Y', fontsize=14, weight='bold')
ax.text(0, 0, axis_length, '|0⟩', fontsize=14, weight='bold')
ax.text(0, 0, -axis_length, '|1⟩', fontsize=14, weight='bold')

# Draw quantum state vector (superposition)
theta = np.pi / 3
phi = np.pi / 4
state_x = np.sin(theta) * np.cos(phi)
state_y = np.sin(theta) * np.sin(phi)
state_z = np.cos(theta)

ax.quiver(0, 0, 0, state_x, state_y, state_z, color='red', arrow_length_ratio=0.15, linewidth=3)

ax.set_xlim([-1.5, 1.5])
ax.set_ylim([-1.5, 1.5])
ax.set_zlim([-1.5, 1.5])
ax.set_title('Bloch Sphere: Quantum State Visualization', fontsize=16, weight='bold')

plt.show()
```

## 3D Visualizations

### Example 3: 3D Scene with Hierarchical Transforms

```python
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D

fig = plt.figure(figsize=(12, 10))
ax = fig.add_subplot(111, projection='3d')

# Robot arm visualization with hierarchical transforms
# Base
theta = np.linspace(0, 2*np.pi, 50)
z_base = np.linspace(0, 1, 2)
Theta, Z = np.meshgrid(theta, z_base)
X = 0.5 * np.cos(Theta)
Y = 0.5 * np.sin(Theta)
ax.plot_surface(X, Y, Z, alpha=0.7, color='gray')

# First arm segment
arm1_start = np.array([0, 0, 1])
arm1_end = np.array([0, 2, 1])
ax.plot([arm1_start[0], arm1_end[0]],
        [arm1_start[1], arm1_end[1]],
        [arm1_start[2], arm1_end[2]], 'b-', linewidth=8)

# Joint 1
ax.scatter(*arm1_start, color='red', s=200, marker='o')

# Second arm segment (rotated)
arm2_start = arm1_end
arm2_end = arm1_end + np.array([1.5, 0.5, 0.5])
ax.plot([arm2_start[0], arm2_end[0]],
        [arm2_start[1], arm2_end[1]],
        [arm2_start[2], arm2_end[2]], 'g-', linewidth=8)

# Joint 2
ax.scatter(*arm2_start, color='red', s=200, marker='o')

# End effector
ax.scatter(*arm2_end, color='orange', s=300, marker='*')

# Add coordinate frames at each joint
def draw_frame(ax, origin, scale=0.5):
    ax.quiver(*origin, scale, 0, 0, color='r', arrow_length_ratio=0.3)
    ax.quiver(*origin, 0, scale, 0, color='g', arrow_length_ratio=0.3)
    ax.quiver(*origin, 0, 0, scale, color='b', arrow_length_ratio=0.3)

draw_frame(ax, arm1_start)
draw_frame(ax, arm2_start)
draw_frame(ax, arm2_end, scale=0.3)

ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
ax.set_title('3D Robot Arm: Hierarchical Transforms', fontsize=16, weight='bold')
ax.set_xlim([-2, 3])
ax.set_ylim([-2, 3])
ax.set_zlim([0, 3])

plt.show()
```

### Example 4: 3D Animation Path

```python
import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D

fig = plt.figure(figsize=(12, 10))
ax = fig.add_subplot(111, projection='3d')

# Parametric curve for animation path
t = np.linspace(0, 4*np.pi, 200)
x = np.cos(t) * (1 + 0.3 * np.sin(5*t))
y = np.sin(t) * (1 + 0.3 * np.sin(5*t))
z = t / (2*np.pi)

# Draw the path
ax.plot(x, y, z, 'b-', linewidth=2, alpha=0.6, label='Animation Path')

# Draw keyframes
keyframe_indices = [0, 50, 100, 150, 199]
for idx in keyframe_indices:
    ax.scatter(x[idx], y[idx], z[idx], color='red', s=100, marker='o')

    # Draw coordinate frame at keyframe
    scale = 0.2
    ax.quiver(x[idx], y[idx], z[idx], scale, 0, 0, color='r', arrow_length_ratio=0.5, alpha=0.7)
    ax.quiver(x[idx], y[idx], z[idx], 0, scale, 0, color='g', arrow_length_ratio=0.5, alpha=0.7)
    ax.quiver(x[idx], y[idx], z[idx], 0, 0, scale, color='b', arrow_length_ratio=0.5, alpha=0.7)

# Draw velocity vectors at some points
velocity_indices = [25, 75, 125, 175]
for idx in velocity_indices:
    if idx < len(t) - 1:
        dx = x[idx+1] - x[idx]
        dy = y[idx+1] - y[idx]
        dz = z[idx+1] - z[idx]
        ax.quiver(x[idx], y[idx], z[idx], dx*10, dy*10, dz*10,
                 color='orange', arrow_length_ratio=0.3, linewidth=2)

ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
ax.set_title('3D Animation: Path with Keyframes and Velocities', fontsize=16, weight='bold')
ax.legend()

plt.show()
```

## Graph Networks

### Example 5: Component Network Diagram

```python
import matplotlib.pyplot as plt
import numpy as np

fig, ax = plt.subplots(figsize=(12, 8))

# Define nodes (components)
components = {
    'Sensor': (1, 3),
    'Controller': (3, 3),
    'Actuator 1': (5, 4),
    'Actuator 2': (5, 2),
    'Display': (7, 3),
}

# Draw connections
connections = [
    ('Sensor', 'Controller', 'Data'),
    ('Controller', 'Actuator 1', 'Command'),
    ('Controller', 'Actuator 2', 'Command'),
    ('Actuator 1', 'Display', 'Status'),
    ('Actuator 2', 'Display', 'Status'),
]

for start, end, label in connections:
    start_pos = components[start]
    end_pos = components[end]
    ax.annotate('', xy=end_pos, xytext=start_pos,
               arrowprops=dict(arrowstyle='->', lw=2, color='blue'))

    # Add label in middle of edge
    mid_x = (start_pos[0] + end_pos[0]) / 2
    mid_y = (start_pos[1] + end_pos[1]) / 2
    ax.text(mid_x, mid_y, label, fontsize=9, ha='center',
           bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))

# Draw nodes
for component, pos in components.items():
    circle = plt.Circle(pos, 0.4, color='lightblue', ec='black', linewidth=2)
    ax.add_patch(circle)
    ax.text(pos[0], pos[1], component, ha='center', va='center',
           fontsize=11, weight='bold')

ax.set_xlim([0, 8])
ax.set_ylim([1, 5])
ax.set_aspect('equal')
ax.axis('off')
ax.set_title('System Component Network', fontsize=16, weight='bold')

plt.tight_layout()
plt.show()
```

## Sample Prompts for Testing

Use these prompts to test the visualization system:

1. **Quantum Circuit**: "Create a quantum circuit that prepares a Bell state with H and CNOT gates"

2. **Bloch Sphere**: "Show me a Bloch sphere representation of a qubit in superposition"

3. **Robot Kinematics**: "Visualize a 2-link robot arm with joint transforms"

4. **Animation Path**: "Create a 3D spiral animation path with keyframes"

5. **Network Diagram**: "Draw a component network showing sensors, controllers, and actuators"

## Expected Behavior

✅ **Auto-execution**: Code runs automatically when the message appears
✅ **Visual-first**: Diagrams shown by default, code hidden
✅ **Toggle**: Users can switch between Visual and Code views
✅ **Re-run**: Users can re-execute code with the "Re-run" button
✅ **Metadata**: Console output and return values shown below visualizations
