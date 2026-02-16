import { VisionSceneBridge, createVisionSceneBridge } from '../../../lib/runtime/vision-scene-bridge';
import { getSceneGraphManager, clearAllSceneGraphManagers } from '../../../lib/runtime/scene-graph/scene-graph-manager';
import { GroundTruthVisionSimulator } from '../../../lib/runtime/vision-simulator';
import { ARENA_SIMPLE_NAVIGATION } from '../../../lib/runtime/test-arenas';
import type { VisionFrame, Detection, SceneAnalysis, BoundingBox } from '../../../lib/runtime/vision/mobilenet-detector';

// =============================================================================
// Helpers
// =============================================================================

function makeDetection(overrides: Partial<Detection> = {}): Detection {
  return {
    label: 'obstacle',
    confidence: 0.85,
    bbox: { x: 0.3, y: 0.4, width: 0.2, height: 0.3 },
    estimatedDepthCm: 100,
    depthMethod: 'vlm_estimate',
    region: 'center',
    ...overrides,
  };
}

function makeFrame(detections: Detection[] = [], overrides: Partial<VisionFrame> = {}): VisionFrame {
  return {
    detections,
    scene: {
      openings: ['left', 'right'],
      blocked: ['center'],
      floorVisiblePercent: 0.7,
      environment: 'indoor',
      dominantSurface: 'floor',
    },
    timestamp: Date.now(),
    processingMs: 10,
    imageSize: { width: 160, height: 120 },
    frameId: 1,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('VisionSceneBridge', () => {
  let deviceId: string;

  beforeEach(() => {
    deviceId = `test-vsb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  });

  afterEach(() => {
    clearAllSceneGraphManagers();
  });

  describe('processFrame', () => {
    it('registers detections as scene graph nodes', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      const frame = makeFrame([
        makeDetection({ label: 'chair', region: 'left', estimatedDepthCm: 150 }),
        makeDetection({ label: 'box', region: 'right', estimatedDepthCm: 200 }),
      ]);

      const count = bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        frame
      );

      expect(count).toBe(2);
    });

    it('filters out low-confidence detections', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      const frame = makeFrame([
        makeDetection({ label: 'chair', confidence: 0.9 }),
        makeDetection({ label: 'box', confidence: 0.2 }),
      ]);

      const count = bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        frame
      );

      expect(count).toBe(1); // Only the high-confidence one
    });

    it('handles empty frames', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      const count = bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([])
      );

      expect(count).toBe(0);
    });
  });

  describe('label to category mapping', () => {
    it('maps common labels to correct categories', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      const frame = makeFrame([
        makeDetection({ label: 'chair' }),
        makeDetection({ label: 'wall', region: 'left' }),
        makeDetection({ label: 'door', region: 'right' }),
      ]);

      const count = bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        frame
      );

      expect(count).toBe(3);

      // Check that nodes exist in the scene graph with correct categories
      const nodes = manager.findByLabel('chair');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].semantics.category).toBe('furniture');
    });

    it('defaults to unknown for unrecognized labels', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([makeDetection({ label: 'alien_artifact' })])
      );

      const nodes = manager.findByLabel('alien_artifact');
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes[0].semantics.category).toBe('unknown');
    });
  });

  describe('world coordinate projection', () => {
    it('projects detections to correct world positions', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      // Detection at center of FOV, 1m away, robot facing north (rotation=0 → -Y)
      bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([makeDetection({
          label: 'box',
          bbox: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 }, // center at x=0.5
          estimatedDepthCm: 100,
          region: 'center',
        })])
      );

      const nodes = manager.findByLabel('box');
      expect(nodes.length).toBeGreaterThan(0);

      // Robot at (0,0) facing -Y (rotation=0), 1m ahead → position near (0, -1)
      const pos = nodes[0].geometry.pose.position;
      expect(pos.x).toBeCloseTo(0, 0);
      expect(pos.z).toBeCloseTo(-1, 0); // z = world-y
    });

    it('accounts for robot rotation', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);

      // Robot facing east (rotation=PI/2), detection at center, 1m away
      bridge.processFrame(
        { x: 0, y: 0, rotation: Math.PI / 2 },
        makeFrame([makeDetection({
          label: 'cone',
          bbox: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
          estimatedDepthCm: 100,
          region: 'center',
        })])
      );

      const nodes = manager.findByLabel('cone');
      expect(nodes.length).toBeGreaterThan(0);

      // Robot at (0,0) facing +X, 1m ahead → position near (1, 0)
      const pos = nodes[0].geometry.pose.position;
      expect(pos.x).toBeCloseTo(1, 0);
      expect(Math.abs(pos.z)).toBeLessThan(0.3); // z ≈ 0
    });
  });

  describe('integration with vision simulator', () => {
    it('processes simulated vision frames', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);

      // Face toward obstacles
      const pose = { x: -1.5, y: -1.5, rotation: 3 * Math.PI / 4 };
      const frame = sim.generateFrame(pose);
      const count = bridge.processFrame(pose, frame);

      expect(count).toBeGreaterThan(0);
    });

    it('builds scene graph from multiple observations', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager);
      const sim = new GroundTruthVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);

      // Observe from multiple directions
      const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      let totalCount = 0;

      for (const rot of rotations) {
        const pose = { x: 0, y: 0, rotation: rot };
        const frame = sim.generateFrame(pose);
        totalCount += bridge.processFrame(pose, frame);
      }

      expect(totalCount).toBeGreaterThan(4);

      // Scene graph should have accumulated nodes
      const stats = manager.getStats();
      expect(stats.totalNodes).toBeGreaterThan(1); // At least robot + detected objects
    });
  });

  describe('temporal coherence', () => {
    it('calls decayConfidence and pruneStale when decay is enabled', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager, { enableDecay: true });

      const sg = manager.getSceneGraph();
      const decaySpy = jest.spyOn(sg, 'decayConfidence');
      const pruneSpy = jest.spyOn(sg, 'pruneStale');

      bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([makeDetection()])
      );

      expect(decaySpy).toHaveBeenCalledTimes(1);
      expect(pruneSpy).toHaveBeenCalledTimes(1);
    });

    it('skips decay when disabled', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = new VisionSceneBridge(manager, { enableDecay: false });

      const sg = manager.getSceneGraph();
      const decaySpy = jest.spyOn(sg, 'decayConfidence');

      bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([makeDetection()])
      );

      expect(decaySpy).not.toHaveBeenCalled();
    });
  });

  describe('factory', () => {
    it('createVisionSceneBridge returns working bridge', () => {
      const manager = getSceneGraphManager(deviceId);
      manager.initialize({ x: 0, y: 0, z: 0 });
      const bridge = createVisionSceneBridge(manager);

      const count = bridge.processFrame(
        { x: 0, y: 0, rotation: 0 },
        makeFrame([makeDetection()])
      );

      expect(count).toBe(1);
    });
  });
});
