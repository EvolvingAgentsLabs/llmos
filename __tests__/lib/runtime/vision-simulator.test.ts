import { GroundTruthVisionSimulator, createVisionSimulator } from '../../../lib/runtime/vision-simulator';
import {
  ARENA_SIMPLE_NAVIGATION,
  ARENA_EXPLORATION,
  ARENA_NARROW_CORRIDOR,
} from '../../../lib/runtime/test-arenas';
import type { VisionFrame } from '../../../lib/runtime/vision/mobilenet-detector';

// =============================================================================
// Tests
// =============================================================================

describe('GroundTruthVisionSimulator', () => {
  describe('basic frame generation', () => {
    it('generates a valid VisionFrame', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const frame = sim.generateFrame(ARENA_SIMPLE_NAVIGATION.startPose);

      expect(frame.detections).toBeDefined();
      expect(frame.scene).toBeDefined();
      expect(frame.timestamp).toBeGreaterThan(0);
      expect(frame.frameId).toBe(1);
      expect(frame.imageSize).toEqual({ width: 160, height: 120 });
    });

    it('increments frameId on successive calls', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const pose = { x: 0, y: 0, rotation: 0 };

      const f1 = sim.generateFrame(pose);
      const f2 = sim.generateFrame(pose);
      const f3 = sim.generateFrame(pose);

      expect(f1.frameId).toBe(1);
      expect(f2.frameId).toBe(2);
      expect(f3.frameId).toBe(3);
    });

    it('returns detections with required fields', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face center of arena where obstacles exist
      const frame = sim.generateFrame({ x: -1.5, y: -1.5, rotation: Math.PI / 4 });

      for (const det of frame.detections) {
        expect(det.label).toBeDefined();
        expect(det.confidence).toBeGreaterThan(0);
        expect(det.confidence).toBeLessThanOrEqual(1);
        expect(det.bbox).toBeDefined();
        expect(det.bbox.x).toBeGreaterThanOrEqual(0);
        expect(det.bbox.y).toBeGreaterThanOrEqual(0);
        expect(det.bbox.width).toBeGreaterThan(0);
        expect(det.bbox.height).toBeGreaterThan(0);
        expect(det.estimatedDepthCm).toBeGreaterThan(0);
        expect(det.depthMethod).toBe('vlm_estimate');
        expect(['left', 'center', 'right']).toContain(det.region);
      }
    });
  });

  describe('obstacle detection', () => {
    it('detects nearby obstacles within FOV', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Position facing toward obstacle at (-0.5, -0.5) from (-1.5, -1.5)
      // Direction: dx=1.0, dy=1.0 → atan2(dx, -dy) = atan2(1, -1) = 3*PI/4
      const frame = sim.generateFrame({ x: -1.5, y: -1.5, rotation: 3 * Math.PI / 4 });

      const obstacleDetections = frame.detections.filter(d => d.label === 'obstacle');
      expect(obstacleDetections.length).toBeGreaterThan(0);
    });

    it('does not detect obstacles behind the robot', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face away from obstacles — toward bottom-left corner (-X, -Y)
      // atan2(-1, 1) = -PI/4 faces (-X, -Y) direction
      const frame = sim.generateFrame({ x: -1.5, y: -1.5, rotation: -Math.PI / 4 });

      const obstacleDetections = frame.detections.filter(d => d.label === 'obstacle');
      expect(obstacleDetections.length).toBe(0);
    });

    it('reports correct depth for nearby obstacles', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face toward obstacle at (-0.5, -0.5) from (-1.5, -1.5), distance ~1.21m
      const frame = sim.generateFrame({ x: -1.5, y: -1.5, rotation: 3 * Math.PI / 4 });

      const obsDet = frame.detections.find(d => d.label === 'obstacle');
      if (obsDet) {
        // Distance from (-1.5,-1.5) to (-0.5,-0.5) surface = ~1.21m - 0.2m radius = ~1.01m
        expect(obsDet.estimatedDepthCm).toBeGreaterThan(50);
        expect(obsDet.estimatedDepthCm).toBeLessThan(200);
      }
    });
  });

  describe('wall detection', () => {
    it('detects walls within FOV', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face toward the bottom wall (y=-2.5) from (0, -2.0)
      // rotation=0 faces -Y direction, toward the wall
      const frame = sim.generateFrame({ x: 0, y: -2.0, rotation: 0 });

      const wallDetections = frame.detections.filter(d => d.label === 'wall');
      expect(wallDetections.length).toBeGreaterThan(0);
    });

    it('wall depth is consistent with distance', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face toward left wall (x=-2.5) from x=-1.5 → face -X direction
      // rotation=-PI/2: sin(-PI/2)=-1, -cos(-PI/2)=0 → faces -X
      const frame = sim.generateFrame({ x: -1.5, y: 0, rotation: -Math.PI / 2 });

      const wallDet = frame.detections.find(d => d.label === 'wall');
      if (wallDet) {
        // Distance to left wall at x=-2.5 from x=-1.5 is 1.0m
        expect(wallDet.estimatedDepthCm).toBeGreaterThan(50);
        expect(wallDet.estimatedDepthCm).toBeLessThan(200);
      }
    });
  });

  describe('scene analysis', () => {
    it('reports openings in clear directions', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Center of arena, facing up — should have some clear paths
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });

      expect(frame.scene.openings.length + frame.scene.blocked.length).toBe(3);
      // All regions must be categorized
      const allRegions = [...frame.scene.openings, ...frame.scene.blocked];
      expect(allRegions).toContain('left');
      expect(allRegions).toContain('center');
      expect(allRegions).toContain('right');
    });

    it('reports blocked when facing a wall closely', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Very close to bottom wall (y=-2.5), facing it (rotation=0 → -Y direction)
      const frame = sim.generateFrame({ x: 0, y: -2.3, rotation: 0 });

      expect(frame.scene.blocked.length).toBeGreaterThan(0);
    });

    it('reports open when facing clear space', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Center of arena facing north — 2.5m of clear space ahead
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });

      // Center should be open (2.5m to wall, well above threshold)
      expect(frame.scene.openings).toContain('center');
    });

    it('has valid floor visible percent', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });

      expect(frame.scene.floorVisiblePercent).toBeGreaterThanOrEqual(0);
      expect(frame.scene.floorVisiblePercent).toBeLessThanOrEqual(1);
    });

    it('environment is indoor', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });

      expect(frame.scene.environment).toBe('indoor');
    });
  });

  describe('region mapping', () => {
    it('maps objects to correct regions based on angle', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      // Face directly at obstacle at (-0.5, -0.5) from (-1.5, -1.5)
      // Direction: dx=1.0, dy=1.0 → atan2(dx, -dy) = atan2(1, -1) = 3*PI/4
      const frame = sim.generateFrame({ x: -1.5, y: -1.5, rotation: 3 * Math.PI / 4 });

      const obsDet = frame.detections.find(d => d.label === 'obstacle');
      if (obsDet) {
        // Should be roughly center since we're facing it directly
        expect(obsDet.region).toBe('center');
      }
    });
  });

  describe('narrow corridor detection', () => {
    it('detects corridor walls as blocked', () => {
      const sim = createVisionSimulator(ARENA_NARROW_CORRIDOR.world);
      // Robot at (-1.5, 1.5), face east (rotation=PI/2) toward corridor walls at x=-0.3 and x=0.3
      const frame = sim.generateFrame({ x: -1.5, y: 1.5, rotation: Math.PI / 2 });

      // Should detect some walls
      const wallDetections = frame.detections.filter(d => d.label === 'wall');
      expect(wallDetections.length).toBeGreaterThan(0);
    });
  });

  describe('exploration arena', () => {
    it('detects multiple obstacles from center', () => {
      const sim = createVisionSimulator(ARENA_EXPLORATION.world);
      // From center facing right — should see obstacle at (1.0, 0.0)
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: Math.PI / 2 });

      expect(frame.detections.length).toBeGreaterThan(0);
    });
  });

  describe('different rotations', () => {
    it('detections change when robot rotates', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const pos = { x: 0, y: 0 };

      const frames: VisionFrame[] = [];
      for (let rot = 0; rot < 2 * Math.PI; rot += Math.PI / 2) {
        frames.push(sim.generateFrame({ ...pos, rotation: rot }));
      }

      // Different rotations should produce different detections
      const detCounts = frames.map(f => f.detections.length);
      // Not all counts should be identical (unless the arena is perfectly symmetric)
      const allSame = detCounts.every(c => c === detCounts[0]);
      // The arena has asymmetric obstacles, so counts should vary
      expect(allSame).toBe(false);
    });
  });

  describe('factory', () => {
    it('createVisionSimulator returns working simulator', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });
      expect(frame).toBeDefined();
      expect(frame.detections).toBeDefined();
      expect(frame.scene).toBeDefined();
    });

    it('accepts custom config', () => {
      const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world, {
        maxRangeM: 1.0,
        imageSize: { width: 320, height: 240 },
      });
      const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });
      expect(frame.imageSize).toEqual({ width: 320, height: 240 });
    });
  });
});
