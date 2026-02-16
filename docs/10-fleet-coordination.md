# Chapter 10: Fleet Coordination -- Multiple Robots, One World

A single robot exploring a 5-meter arena can map it in a few minutes. Two robots can do it in half the time -- but only if they do not both explore the same corner. Three robots are faster still, unless they spend all their time avoiding each other. Fleet coordination is the problem of making multiple robots collaborate rather than collide, share knowledge rather than duplicate effort, and divide territory rather than contest it. In LLMos, this is handled by the **Fleet Coordinator**, a centralized manager that merges individual world models, assigns exploration targets, and synchronizes shared knowledge back to every robot in the fleet.

## The Core Problem

Every robot in LLMos maintains its own WorldModel instance, identified by a unique `deviceId` and accessed via `getWorldModel(deviceId)`. Robot A's map of the arena is separate from Robot B's map. When Robot A discovers a wall in the southeast corner, Robot B has no idea unless someone tells it.

The Fleet Coordinator is that someone. It sits above the individual robots, periodically pulling their world models together into a shared grid, making task assignment decisions based on the combined picture, and pushing the merged knowledge back out so every robot benefits from every other robot's discoveries.

The implementation lives in `lib/runtime/fleet-coordinator.ts`.

## Fleet Members and Tasks

The coordinator tracks each robot as a `FleetMember` with a pose, a task assignment, and a sync timestamp:

```typescript
// lib/runtime/fleet-coordinator.ts

export interface FleetMember {
  /** Unique device/robot ID */
  deviceId: string;
  /** Current pose in world coordinates (meters) */
  pose: { x: number; y: number; rotation: number };
  /** Assigned task (if any) */
  assignedTask: FleetTask | null;
  /** Last sync timestamp */
  lastSync: number;
  /** Whether robot is active */
  active: boolean;
}
```

Tasks represent what each robot should be doing. The type system supports several task types, but the primary one for exploration is `explore_frontier`:

```typescript
// lib/runtime/fleet-coordinator.ts

export interface FleetTask {
  /** Task ID */
  id: string;
  /** Task type */
  type: 'explore_frontier' | 'navigate_to' | 'patrol' | 'idle';
  /** Target position (meters) */
  target: { x: number; y: number };
  /** Description for LLM */
  description: string;
  /** Assigned robot */
  assignedTo: string;
  /** Task status */
  status: 'pending' | 'active' | 'completed' | 'failed';
  /** Creation timestamp */
  createdAt: number;
}
```

Notice the `description` field. This is a human-readable string like `"Explore frontier at (1.2, -0.5)"` that gets passed to the LLM as context. The LLM does not need to understand the coordinator's internal data structures -- it just needs to know where it should go and why.

## Configuration

Fleet behavior is controlled by a configuration object with sensible defaults:

```typescript
// lib/runtime/fleet-coordinator.ts

export interface FleetCoordinatorConfig {
  /** Merge strategy: 'max_confidence' keeps highest confidence cell */
  mergeStrategy: 'max_confidence' | 'latest_update';
  /** Minimum distance between robot targets (meters) to avoid overlap */
  minTargetSeparation: number;
  /** How often to re-assign tasks (ms) */
  reassignIntervalMs: number;
  /** Maximum fleet size */
  maxRobots: number;
}

const DEFAULT_CONFIG: FleetCoordinatorConfig = {
  mergeStrategy: 'max_confidence',
  minTargetSeparation: 0.5,
  reassignIntervalMs: 5000,
  maxRobots: 10,
};
```

The `mergeStrategy` determines how conflicts are resolved when two robots have different information about the same cell. `max_confidence` keeps whichever observation has higher confidence -- the robot that was closer or had a better sensor reading wins. `latest_update` keeps the most recent observation regardless of confidence -- useful when the environment is changing and you want the freshest data.

The `minTargetSeparation` of 0.5 meters prevents two robots from being assigned frontiers that are right next to each other. Without this, two robots might both charge at adjacent frontier cells and end up exploring the same pocket of unknown space.

## Responsibility 1: World Model Merging

The heart of the coordinator is `mergeWorldModels()`. It iterates over every active robot's WorldModel, compares each cell against the shared model, and updates the shared model where the robot has better information:

```typescript
// lib/runtime/fleet-coordinator.ts

mergeWorldModels(): MergeResult {
  const sharedGrid = this.sharedModel.getGrid();
  const sharedDims = this.sharedModel.getGridDimensions();
  let cellsUpdated = 0;
  let robotsMerged = 0;

  for (const member of this.members.values()) {
    if (!member.active) continue;

    const robotModel = getWorldModel(member.deviceId);
    const robotGrid = robotModel.getGrid();
    const robotDims = robotModel.getGridDimensions();

    // Grid sizes must match
    if (robotDims.width !== sharedDims.width || robotDims.height !== sharedDims.height) continue;

    for (let gy = 0; gy < sharedDims.height; gy++) {
      for (let gx = 0; gx < sharedDims.width; gx++) {
        const robotCell = robotGrid[gy][gx];
        const sharedCell = sharedGrid[gy][gx];

        if (robotCell.state === 'unknown') continue;

        const shouldUpdate = this.shouldUpdateCell(sharedCell, robotCell);
        if (shouldUpdate) {
          sharedCell.state = robotCell.state;
          sharedCell.confidence = Math.max(sharedCell.confidence, robotCell.confidence);
          sharedCell.lastUpdated = Math.max(sharedCell.lastUpdated, robotCell.lastUpdated);
          cellsUpdated++;
        }
      }
    }

    robotsMerged++;
  }

  this.lastMerge = {
    cellsUpdated,
    robotsMerged,
    timestamp: Date.now(),
  };

  return this.lastMerge;
}
```

The `shouldUpdateCell()` method applies the configured merge strategy:

```typescript
// lib/runtime/fleet-coordinator.ts

private shouldUpdateCell(shared: GridCell, robot: GridCell): boolean {
  if (this.config.mergeStrategy === 'max_confidence') {
    return robot.confidence > shared.confidence;
  }
  // latest_update
  return robot.lastUpdated > shared.lastUpdated;
}
```

With `max_confidence`, the merge result tells you how much new information was gathered: `cellsUpdated` counts how many cells in the shared model were improved by merging. A merge that updates zero cells means every robot is re-exploring territory already well-mapped -- a signal that task assignment needs to spread the robots out.

## Responsibility 2: Task Assignment

The coordinator assigns exploration frontiers to robots using a greedy algorithm. Given a set of frontier cells (from the world model bridge), it sorts them by exploration value, then assigns each one to the closest available robot:

```typescript
// lib/runtime/fleet-coordinator.ts

assignFrontiers(frontiers: FrontierCell[]): FleetTask[] {
  const newTasks: FleetTask[] = [];
  const availableRobots = Array.from(this.members.values())
    .filter(m => m.active && !m.assignedTask);

  if (availableRobots.length === 0 || frontiers.length === 0) return newTasks;

  // Sort frontiers by exploration value (more unknown neighbors = higher priority)
  const sortedFrontiers = [...frontiers].sort((a, b) => b.unknownNeighbors - a.unknownNeighbors);

  const assignedTargets: Array<{ x: number; y: number }> = [];

  for (const frontier of sortedFrontiers) {
    if (availableRobots.length === 0) break;

    // Check minimum separation from already-assigned targets
    const tooClose = assignedTargets.some(t =>
      Math.hypot(t.x - frontier.wx, t.y - frontier.wy) < this.config.minTargetSeparation
    );
    if (tooClose) continue;

    // Find closest available robot
    let closestIdx = -1;
    let closestDist = Infinity;
    for (let i = 0; i < availableRobots.length; i++) {
      const dist = Math.hypot(
        availableRobots[i].pose.x - frontier.wx,
        availableRobots[i].pose.y - frontier.wy
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    if (closestIdx >= 0) {
      const robot = availableRobots.splice(closestIdx, 1)[0];
      const task: FleetTask = {
        id: `task-${++this.taskCounter}`,
        type: 'explore_frontier',
        target: { x: frontier.wx, y: frontier.wy },
        description: `Explore frontier at (${frontier.wx.toFixed(1)}, ${frontier.wy.toFixed(1)})`,
        assignedTo: robot.deviceId,
        status: 'active',
        createdAt: Date.now(),
      };

      this.tasks.set(task.id, task);
      robot.assignedTask = task;
      assignedTargets.push(task.target);
      newTasks.push(task);
    }
  }

  return newTasks;
}
```

The algorithm has three key properties:

1. **Prioritizes high-value frontiers.** Frontiers with more unknown neighbors are explored first, because they expose the most new territory per step.

2. **Enforces minimum separation.** The `tooClose` check ensures that no two robots target frontiers within 0.5 meters of each other. This spreads the fleet across the arena.

3. **Minimizes travel distance.** For each frontier, the closest available robot is assigned. This is a greedy heuristic, not an optimal assignment, but it is fast and works well in practice.

## Responsibility 3: State Synchronization

After merging, the coordinator can push the shared model back to individual robots via `distributeSharedModel()`. This is how Robot B learns about the wall that Robot A discovered:

```typescript
// lib/runtime/fleet-coordinator.ts

distributeSharedModel(): number {
  const sharedGrid = this.sharedModel.getGrid();
  const sharedDims = this.sharedModel.getGridDimensions();
  let totalUpdates = 0;

  for (const member of this.members.values()) {
    if (!member.active) continue;

    const robotModel = getWorldModel(member.deviceId);
    const robotGrid = robotModel.getGrid();
    const robotDims = robotModel.getGridDimensions();

    if (robotDims.width !== sharedDims.width || robotDims.height !== sharedDims.height) continue;

    for (let gy = 0; gy < sharedDims.height; gy++) {
      for (let gx = 0; gx < sharedDims.width; gx++) {
        const sharedCell = sharedGrid[gy][gx];
        const robotCell = robotGrid[gy][gx];

        // Only update robot cells that are unknown or lower confidence
        if (robotCell.state === 'unknown' && sharedCell.state !== 'unknown') {
          robotCell.state = sharedCell.state;
          robotCell.confidence = sharedCell.confidence * 0.8; // Slightly lower — it's indirect data
          robotCell.lastUpdated = sharedCell.lastUpdated;
          totalUpdates++;
        }
      }
    }
  }

  return totalUpdates;
}
```

The 0.8 confidence multiplier on distributed data is deliberate. When Robot B receives information about a cell that Robot A observed, it gets the state but at 80% of Robot A's confidence. This reflects the epistemic reality: Robot B did not see that cell itself. If Robot B later drives to that cell and observes it directly, the direct observation (at full confidence) will override the distributed data. This creates a natural preference for first-hand knowledge while still letting robots benefit from each other's discoveries.

## LLM Serialization

The coordinator can serialize fleet state for LLM context via `serializeForLLM()`:

```typescript
// lib/runtime/fleet-coordinator.ts

serializeForLLM(): string {
  const members = this.getMembers();
  const tasks = this.getActiveTasks();

  let output = `## Fleet Status (${members.length} robots)\n`;

  for (const m of members) {
    const pos = `(${m.pose.x.toFixed(1)}, ${m.pose.y.toFixed(1)})`;
    const task = m.assignedTask
      ? `task: ${m.assignedTask.description}`
      : 'idle';
    output += `- ${m.deviceId}: pos=${pos} ${task}\n`;
  }

  if (tasks.length > 0) {
    output += `\n### Active Tasks\n`;
    for (const t of tasks) {
      output += `- [${t.id}] ${t.description} → ${t.assignedTo}\n`;
    }
  }

  return output;
}
```

This produces markdown that the LLM can parse naturally:

```
## Fleet Status (3 robots)
- robot-1: pos=(0.5, -0.3) task: Explore frontier at (1.2, -0.5)
- robot-2: pos=(-1.0, 0.8) task: Explore frontier at (-1.5, 1.2)
- robot-3: pos=(0.0, 0.0) idle

### Active Tasks
- [task-1] Explore frontier at (1.2, -0.5) → robot-1
- [task-2] Explore frontier at (-1.5, 1.2) → robot-2
```

Each robot's LLM sees not only its own position and task but the positions and tasks of its teammates. This allows the LLM to make contextually aware decisions -- for example, avoiding an area that another robot is already heading toward.

## The Fleet Lifecycle

A typical fleet coordination cycle looks like this:

1. **Register robots.** Call `addRobot(deviceId, initialPose)` for each robot. The coordinator enforces `maxRobots` (default 10).

2. **Robots explore.** Each robot runs its own navigation loop, updating its own WorldModel through sensor readings.

3. **Merge.** Periodically, call `mergeWorldModels()` to pull all robot observations into the shared model.

4. **Assign.** Call `assignFrontiers(frontiers)` with frontier cells from the shared model to give idle robots new targets.

5. **Distribute.** Call `distributeSharedModel()` to push shared knowledge back to individual robots.

6. **Complete.** When a robot reaches its target, call `completeTask(taskId)` to free it for reassignment.

7. **Repeat** steps 2-6 until exploration is complete.

The coordinator tracks fleet-wide progress through `getStatus()`, which returns a `FleetStatus` object including the shared model's `explorationProgress` -- the percentage of the arena that has been mapped.

## Design Considerations

**Centralized vs. distributed.** The current design is centralized: one coordinator manages all robots. This simplifies implementation and avoids consensus problems, but it means the coordinator is a single point of failure. For a research system operating in simulation and small physical arenas, this is acceptable. A production fleet would need fault-tolerant coordination, likely with leader election or a distributed merge protocol.

**Grid size matching.** The coordinator requires all robots to have the same grid dimensions. This is enforced by the WorldModel singleton system, which creates 50x50 grids by default. If a robot joins with a different grid size (unlikely in practice), its data is silently skipped during merge.

**No path conflict resolution.** The coordinator assigns separate targets but does not prevent robots from crossing paths en route. Path-level deconfliction would require a shared path planning layer, which is a significant increase in complexity for marginal benefit in small fleets.

## Chapter Summary

The Fleet Coordinator manages multiple robots sharing a single arena through three mechanisms: world model merging (combining individual maps into a shared grid using max-confidence or latest-update strategies), task assignment (greedy frontier allocation with minimum target separation), and state synchronization (distributing shared knowledge back to individuals at reduced confidence). The system serializes fleet state into markdown for LLM context, giving each robot's LLM awareness of its teammates' positions and assignments. The design is centralized and straightforward, optimized for small research fleets exploring bounded indoor arenas.

---

*Previous: [Chapter 9 -- Predictive Intelligence: Thinking Before Acting](09-predictive-intelligence.md)*

*Next: [Chapter 11 -- The Evolution Engine: Robots That Dream](11-evolution-engine.md)*
