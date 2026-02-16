import { FleetCoordinator, createFleetCoordinator } from '../../../lib/runtime/fleet-coordinator';
import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { getWorldModel, clearAllWorldModels } from '../../../lib/runtime/world-model';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';
import type { FrontierCell } from '../../../lib/runtime/world-model-bridge';

// =============================================================================
// Helpers
// =============================================================================

function createRobotBridge(deviceId: string) {
  const bridge = new WorldModelBridge({ deviceId, inflationCells: 0 });
  bridge.rasterize(ARENA_SIMPLE_NAVIGATION.world);
  return bridge;
}

function makeFrontier(wx: number, wy: number, unknownNeighbors: number = 3): FrontierCell {
  return { gx: 0, gy: 0, wx, wy, unknownNeighbors };
}

// =============================================================================
// Tests
// =============================================================================

describe('FleetCoordinator', () => {
  afterEach(() => {
    clearAllWorldModels();
  });

  describe('fleet management', () => {
    it('adds and lists robots', () => {
      const coordinator = new FleetCoordinator('fleet-test-1');
      coordinator.addRobot('robot-1', { x: 0, y: 0, rotation: 0 });
      coordinator.addRobot('robot-2', { x: 1, y: 0, rotation: Math.PI });

      const members = coordinator.getMembers();
      expect(members).toHaveLength(2);
      expect(members[0].deviceId).toBe('robot-1');
      expect(members[1].deviceId).toBe('robot-2');
    });

    it('removes robots', () => {
      const coordinator = new FleetCoordinator('fleet-test-2');
      coordinator.addRobot('robot-1');
      coordinator.addRobot('robot-2');
      coordinator.removeRobot('robot-1');

      expect(coordinator.getMembers()).toHaveLength(1);
    });

    it('enforces max fleet size', () => {
      const coordinator = new FleetCoordinator('fleet-test-3', { maxRobots: 2 });
      coordinator.addRobot('r1');
      coordinator.addRobot('r2');

      expect(() => coordinator.addRobot('r3')).toThrow('Fleet is full');
    });

    it('updates robot pose', () => {
      const coordinator = new FleetCoordinator('fleet-test-4');
      coordinator.addRobot('robot-1');
      coordinator.updateRobotPose('robot-1', { x: 1.5, y: -0.5, rotation: 1.2 });

      const members = coordinator.getMembers();
      expect(members[0].pose.x).toBeCloseTo(1.5);
      expect(members[0].pose.y).toBeCloseTo(-0.5);
    });
  });

  describe('world model merging', () => {
    it('merges robot world models into shared model', () => {
      const coordinator = new FleetCoordinator('fleet-merge-1');

      // Create two robot world models
      const bridge1 = createRobotBridge('merge-r1');
      const bridge2 = createRobotBridge('merge-r2');

      coordinator.addRobot('merge-r1');
      coordinator.addRobot('merge-r2');

      // Robot 1 explores some cells
      const wm1 = bridge1.getWorldModel();
      const grid1 = wm1.getGrid();
      const { gx, gy } = wm1.worldToGrid(0, 0);
      grid1[gy][gx].state = 'free';
      grid1[gy][gx].confidence = 0.9;
      grid1[gy][gx].lastUpdated = Date.now();

      // Robot 2 explores different cells
      const wm2 = bridge2.getWorldModel();
      const grid2 = wm2.getGrid();
      const pos2 = wm2.worldToGrid(1, 1);
      grid2[pos2.gy][pos2.gx].state = 'obstacle';
      grid2[pos2.gy][pos2.gx].confidence = 0.85;
      grid2[pos2.gy][pos2.gx].lastUpdated = Date.now();

      const result = coordinator.mergeWorldModels();

      expect(result.robotsMerged).toBe(2);
      expect(result.cellsUpdated).toBeGreaterThan(0);

      // Shared model should have data from both robots
      const sharedGrid = coordinator.getSharedModel().getGrid();
      expect(sharedGrid[gy][gx].state).toBe('free');
      expect(sharedGrid[pos2.gy][pos2.gx].state).toBe('obstacle');
    });

    it('keeps highest confidence cell in max_confidence strategy', () => {
      const coordinator = new FleetCoordinator('fleet-merge-2', { mergeStrategy: 'max_confidence' });

      const bridge1 = createRobotBridge('conf-r1');
      const bridge2 = createRobotBridge('conf-r2');

      coordinator.addRobot('conf-r1');
      coordinator.addRobot('conf-r2');

      const wm1 = bridge1.getWorldModel();
      const wm2 = bridge2.getWorldModel();
      const { gx, gy } = wm1.worldToGrid(0.5, 0.5);

      // Robot 1 sees free with high confidence
      wm1.getGrid()[gy][gx].state = 'free';
      wm1.getGrid()[gy][gx].confidence = 0.95;
      wm1.getGrid()[gy][gx].lastUpdated = Date.now();

      // Robot 2 sees obstacle with lower confidence
      wm2.getGrid()[gy][gx].state = 'obstacle';
      wm2.getGrid()[gy][gx].confidence = 0.6;
      wm2.getGrid()[gy][gx].lastUpdated = Date.now() + 100;

      coordinator.mergeWorldModels();

      // Higher confidence (robot 1) should win
      const sharedGrid = coordinator.getSharedModel().getGrid();
      expect(sharedGrid[gy][gx].state).toBe('free');
      expect(sharedGrid[gy][gx].confidence).toBe(0.95);
    });

    it('distributes shared model to robots', () => {
      const coordinator = new FleetCoordinator('fleet-dist-1');

      const bridge1 = createRobotBridge('dist-r1');
      const bridge2 = createRobotBridge('dist-r2');

      coordinator.addRobot('dist-r1');
      coordinator.addRobot('dist-r2');

      // Robot 1 discovers something
      const wm1 = bridge1.getWorldModel();
      const { gx, gy } = wm1.worldToGrid(0, 0);
      wm1.getGrid()[gy][gx].state = 'free';
      wm1.getGrid()[gy][gx].confidence = 0.9;
      wm1.getGrid()[gy][gx].lastUpdated = Date.now();

      // Merge and distribute
      coordinator.mergeWorldModels();
      const updates = coordinator.distributeSharedModel();

      // Robot 2 should receive the discovery (if that cell was unknown)
      expect(updates).toBeGreaterThanOrEqual(0);
    });
  });

  describe('task assignment', () => {
    it('assigns frontiers to closest robots', () => {
      const coordinator = new FleetCoordinator('fleet-task-1');
      coordinator.addRobot('t-r1', { x: -1, y: -1, rotation: 0 });
      coordinator.addRobot('t-r2', { x: 1, y: 1, rotation: 0 });

      const frontiers: FrontierCell[] = [
        makeFrontier(-0.5, -0.5, 4), // Closer to robot 1
        makeFrontier(0.5, 0.5, 3),   // Closer to robot 2
      ];

      const tasks = coordinator.assignFrontiers(frontiers);

      expect(tasks).toHaveLength(2);

      const r1Task = tasks.find(t => t.assignedTo === 't-r1');
      const r2Task = tasks.find(t => t.assignedTo === 't-r2');

      // Robot 1 should get the frontier closer to it
      expect(r1Task!.target.x).toBeCloseTo(-0.5);
      // Robot 2 should get the other frontier
      expect(r2Task!.target.x).toBeCloseTo(0.5);
    });

    it('respects minimum target separation', () => {
      const coordinator = new FleetCoordinator('fleet-task-2', {
        minTargetSeparation: 1.0,
      });
      coordinator.addRobot('sep-r1', { x: 0, y: 0, rotation: 0 });
      coordinator.addRobot('sep-r2', { x: 1, y: 0, rotation: 0 });

      const frontiers: FrontierCell[] = [
        makeFrontier(0, 0.5, 4),
        makeFrontier(0.1, 0.5, 3), // Too close to first frontier
      ];

      const tasks = coordinator.assignFrontiers(frontiers);

      // Second frontier should be skipped (too close to first)
      expect(tasks).toHaveLength(1);
    });

    it('does not assign to robots that already have tasks', () => {
      const coordinator = new FleetCoordinator('fleet-task-3');
      coordinator.addRobot('busy-r1', { x: 0, y: 0, rotation: 0 });

      // First assignment
      coordinator.assignFrontiers([makeFrontier(1, 1, 3)]);

      // Second assignment — robot is busy
      const tasks = coordinator.assignFrontiers([makeFrontier(-1, -1, 3)]);
      expect(tasks).toHaveLength(0);
    });

    it('completes tasks and frees robots', () => {
      const coordinator = new FleetCoordinator('fleet-task-4');
      coordinator.addRobot('comp-r1', { x: 0, y: 0, rotation: 0 });

      const tasks = coordinator.assignFrontiers([makeFrontier(1, 1, 3)]);
      expect(tasks).toHaveLength(1);

      coordinator.completeTask(tasks[0].id);

      // Robot should be free for new assignment
      const member = coordinator.getMembers()[0];
      expect(member.assignedTask).toBeNull();

      const newTasks = coordinator.assignFrontiers([makeFrontier(-1, -1, 3)]);
      expect(newTasks).toHaveLength(1);
    });
  });

  describe('fleet status', () => {
    it('provides complete fleet status', () => {
      const coordinator = new FleetCoordinator('fleet-status-1');
      coordinator.addRobot('s-r1', { x: 0, y: 0, rotation: 0 });
      coordinator.addRobot('s-r2', { x: 1, y: 0, rotation: 0 });

      coordinator.assignFrontiers([makeFrontier(0.5, 0.5, 3)]);

      const status = coordinator.getStatus();
      expect(status.members).toHaveLength(2);
      expect(status.tasks.length).toBeGreaterThanOrEqual(1);
      expect(status.explorationProgress).toBeGreaterThanOrEqual(0);
    });

    it('serializes for LLM context', () => {
      const coordinator = new FleetCoordinator('fleet-llm-1');
      coordinator.addRobot('llm-r1', { x: 0.5, y: -0.5, rotation: 0 });

      const serialized = coordinator.serializeForLLM();
      expect(serialized).toContain('Fleet Status');
      expect(serialized).toContain('llm-r1');
      expect(serialized).toContain('0.5');
    });

    it('resets correctly', () => {
      const coordinator = new FleetCoordinator('fleet-reset-1');
      coordinator.addRobot('reset-r1');
      coordinator.assignFrontiers([makeFrontier(0, 0, 3)]);

      coordinator.reset();

      expect(coordinator.getMembers()).toHaveLength(0);
      expect(coordinator.getActiveTasks()).toHaveLength(0);
    });
  });

  describe('factory', () => {
    it('createFleetCoordinator returns working instance', () => {
      const coordinator = createFleetCoordinator({ maxRobots: 5 });
      coordinator.addRobot('factory-r1');

      expect(coordinator.getMembers()).toHaveLength(1);
    });
  });
});
