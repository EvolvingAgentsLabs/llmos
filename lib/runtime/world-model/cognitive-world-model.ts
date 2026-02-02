/**
 * Cognitive World Model
 *
 * The unified AI World Model system that builds internal representations
 * from partial reality. This is the main integration point that combines
 * all the subsystems into a coherent cognitive architecture.
 *
 * Core Capabilities:
 * - Incrementally builds a persistent world model
 * - Updates model over time with temporal consistency
 * - Detects meaningful changes (not just noise)
 * - Reasons about uncertainty and trust
 * - Handles sparse, irregular observations
 *
 * Philosophy: "An AI that knows when something is different,
 * not just what it sees."
 *
 * This bridges robotics, medicine, and cognition by providing
 * pre-robot cognition - the ability to maintain persistent
 * spatial/temporal world models and notice subtle change.
 */

import {
  TemporalCoherenceEngine,
  TemporalState,
  TemporalAnomaly,
  type PositionState,
} from './temporal-coherence';

import {
  ObjectIdentityTracker,
  ObjectTrack,
  ObjectObservation,
  type TrackingEvent,
} from './object-identity-tracker';

import {
  ChangeDetector,
  ChangeEvent,
  type DriftAnalysis,
} from './change-detector';

import {
  UncertaintyReasoner,
  type SourceTrust,
  type BeliefState,
  type FusionResult,
  type DecisionUnderUncertainty,
} from './uncertainty-reasoner';

import {
  SparseUpdateHandler,
  SparseObservation,
  InterpolatedState,
  type UpdatePriority,
} from './sparse-update-handler';

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WorldModelState {
  /** Current understanding of entities */
  entities: Map<string, EntityState>;

  /** Active object tracks */
  tracks: ObjectTrack[];

  /** Recent significant changes */
  recentChanges: ChangeEvent[];

  /** Recent anomalies */
  anomalies: TemporalAnomaly[];

  /** Overall confidence in world model */
  modelConfidence: number;

  /** Timestamp of this snapshot */
  timestamp: number;
}

export interface EntityState {
  /** Entity ID */
  entityId: string;

  /** Position (from temporal coherence) */
  position: PositionState | null;

  /** Position confidence */
  positionConfidence: number;

  /** Temporal state */
  temporalState: TemporalState<PositionState> | null;

  /** Object track (if tracked) */
  track: ObjectTrack | null;

  /** Belief state */
  belief: BeliefState | null;

  /** Is this entity currently observable? */
  isObservable: boolean;

  /** Time since last observation (ms) */
  timeSinceObservation: number;

  /** Has this entity changed recently? */
  hasRecentChange: boolean;

  /** Entity attributes */
  attributes: Record<string, unknown>;
}

export interface WorldModelObservation {
  /** Entity being observed */
  entityId: string;

  /** Observed position */
  position: { x: number; y: number; z: number };

  /** Position uncertainty (standard deviation) */
  positionUncertainty: number;

  /** Entity label/type */
  label: string;

  /** Entity category */
  category: string;

  /** Detection confidence */
  confidence: number;

  /** Observation source */
  source: string;

  /** Timestamp */
  timestamp: number;

  /** Additional attributes */
  attributes?: Record<string, unknown>;
}

export interface CognitiveWorldModelConfig {
  /** Device ID */
  deviceId: string;

  /** Enable temporal coherence */
  enableTemporalCoherence: boolean;

  /** Enable object tracking */
  enableObjectTracking: boolean;

  /** Enable change detection */
  enableChangeDetection: boolean;

  /** Enable uncertainty reasoning */
  enableUncertaintyReasoning: boolean;

  /** Enable sparse update handling */
  enableSparseUpdates: boolean;

  /** Tick interval for background updates (ms) */
  tickInterval: number;

  /** Maximum age for "recent" events (ms) */
  recentEventWindow: number;
}

export const DEFAULT_COGNITIVE_CONFIG: CognitiveWorldModelConfig = {
  deviceId: 'default',
  enableTemporalCoherence: true,
  enableObjectTracking: true,
  enableChangeDetection: true,
  enableUncertaintyReasoning: true,
  enableSparseUpdates: true,
  tickInterval: 100,
  recentEventWindow: 10000,
};

// ═══════════════════════════════════════════════════════════════════════════
// COGNITIVE WORLD MODEL CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class CognitiveWorldModel {
  private config: CognitiveWorldModelConfig;

  // Subsystems
  private temporalEngine: TemporalCoherenceEngine<PositionState>;
  private objectTracker: ObjectIdentityTracker;
  private changeDetector: ChangeDetector;
  private uncertaintyReasoner: UncertaintyReasoner;
  private sparseHandler: SparseUpdateHandler;

  // State
  private lastTickTime: number = Date.now();
  private tickIntervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: Partial<CognitiveWorldModelConfig> = {}) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };

    // Initialize subsystems
    this.temporalEngine = new TemporalCoherenceEngine();
    this.objectTracker = new ObjectIdentityTracker();
    this.changeDetector = new ChangeDetector();
    this.uncertaintyReasoner = new UncertaintyReasoner();
    this.sparseHandler = new SparseUpdateHandler();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the world model (begins background processing).
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTickTime = Date.now();

    // Start background tick
    this.tickIntervalId = setInterval(() => {
      this.tick();
    }, this.config.tickInterval);
  }

  /**
   * Stop the world model.
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.tickIntervalId) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  /**
   * Background tick - updates internal state.
   */
  private tick(): void {
    const currentTime = Date.now();

    // Update temporal coherence
    if (this.config.enableTemporalCoherence) {
      this.temporalEngine.tick(currentTime);
    }

    // Decay beliefs
    if (this.config.enableUncertaintyReasoning) {
      this.uncertaintyReasoner.decayBeliefs(currentTime);
    }

    // Calculate update priorities
    if (this.config.enableSparseUpdates) {
      this.sparseHandler.calculatePriorities(currentTime);
    }

    this.lastTickTime = currentTime;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATION PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a new observation and update the world model.
   * This is the main entry point for sensor data.
   */
  processObservation(observation: WorldModelObservation): {
    entity: EntityState;
    changes: ChangeEvent[];
    anomalies: TemporalAnomaly[];
    trackingEvents: TrackingEvent[];
  } {
    const timestamp = observation.timestamp || Date.now();
    const changes: ChangeEvent[] = [];
    const anomalies: TemporalAnomaly[] = [];
    const trackingEvents: TrackingEvent[] = [];

    // 1. Update temporal coherence
    let temporalState: TemporalState<PositionState> | null = null;
    if (this.config.enableTemporalCoherence) {
      const posState: PositionState = {
        x: observation.position.x,
        y: observation.position.y,
        z: observation.position.z,
      };

      temporalState = this.temporalEngine.observe(
        observation.entityId,
        posState,
        this.mapSourceToObservationSource(observation.source),
        observation.confidence,
        observation.positionUncertainty
      );

      // Collect anomalies
      const recentAnomalies = this.temporalEngine.getAnomalies(undefined, 1000);
      anomalies.push(...recentAnomalies);
    }

    // 2. Update object tracking
    let track: ObjectTrack | null = null;
    if (this.config.enableObjectTracking) {
      const trackObs: ObjectObservation = {
        observationId: `obs_${observation.entityId}_${timestamp}`,
        position: observation.position,
        positionUncertainty: observation.positionUncertainty,
        features: {
          label: observation.label,
          category: observation.category,
          attributes: (observation.attributes || {}) as Record<string, string | number | boolean>,
        },
        confidence: observation.confidence,
        timestamp,
        source: observation.source,
      };

      const trackResult = this.objectTracker.update([trackObs]);
      trackingEvents.push(...trackResult.events);

      // Get the track for this entity
      const tracks = this.objectTracker.getTracksByLabel(observation.label);
      if (tracks.length > 0) {
        track = tracks[0];
      }
    }

    // 3. Detect changes
    if (this.config.enableChangeDetection) {
      const changeResult = this.changeDetector.analyzeObservation(
        observation.entityId,
        {
          x: observation.position.x,
          y: observation.position.y,
          z: observation.position.z,
        },
        timestamp
      );

      if (changeResult.isSignificant) {
        changes.push(...changeResult.changes);
      }
    }

    // 4. Update uncertainty reasoning
    if (this.config.enableUncertaintyReasoning) {
      // Register source if new
      if (!this.uncertaintyReasoner.getSourceTrust(observation.source)) {
        this.uncertaintyReasoner.registerSource(observation.source, 0.7);
      }

      // Update beliefs
      this.uncertaintyReasoner.updateBelief(
        `${observation.entityId}_x`,
        observation.source,
        observation.position.x,
        observation.positionUncertainty,
        timestamp
      );
      this.uncertaintyReasoner.updateBelief(
        `${observation.entityId}_y`,
        observation.source,
        observation.position.y,
        observation.positionUncertainty,
        timestamp
      );
      this.uncertaintyReasoner.updateBelief(
        `${observation.entityId}_z`,
        observation.source,
        observation.position.z,
        observation.positionUncertainty,
        timestamp
      );
    }

    // 5. Record for sparse update handling
    if (this.config.enableSparseUpdates) {
      const sparseObs: SparseObservation = {
        id: `obs_${observation.entityId}_${timestamp}`,
        entityId: observation.entityId,
        properties: {
          x: observation.position.x,
          y: observation.position.y,
          z: observation.position.z,
        },
        timestamp,
        quality: observation.confidence,
        type: 'opportunistic',
        source: observation.source,
      };

      this.sparseHandler.recordObservation(sparseObs);
    }

    // Build entity state
    const entity = this.buildEntityState(
      observation.entityId,
      temporalState,
      track,
      timestamp,
      observation.attributes
    );

    return { entity, changes, anomalies, trackingEvents };
  }

  /**
   * Process multiple observations at once.
   */
  processObservations(observations: WorldModelObservation[]): {
    entities: EntityState[];
    allChanges: ChangeEvent[];
    allAnomalies: TemporalAnomaly[];
    allTrackingEvents: TrackingEvent[];
  } {
    const entities: EntityState[] = [];
    const allChanges: ChangeEvent[] = [];
    const allAnomalies: TemporalAnomaly[] = [];
    const allTrackingEvents: TrackingEvent[] = [];

    for (const obs of observations) {
      const result = this.processObservation(obs);
      entities.push(result.entity);
      allChanges.push(...result.changes);
      allAnomalies.push(...result.anomalies);
      allTrackingEvents.push(...result.trackingEvents);
    }

    return { entities, allChanges, allAnomalies, allTrackingEvents };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current state of an entity.
   */
  getEntityState(entityId: string): EntityState | null {
    const temporalState = this.temporalEngine.getState(entityId);
    const tracks = this.objectTracker.getConfirmedTracks()
      .filter(t => t.features.label === entityId || t.trackId === entityId);
    const track = tracks.length > 0 ? tracks[0] : null;

    if (!temporalState && !track) return null;

    return this.buildEntityState(
      entityId,
      temporalState,
      track,
      Date.now()
    );
  }

  /**
   * Get interpolated state at a specific time.
   */
  getInterpolatedEntityState(entityId: string, timestamp: number): EntityState | null {
    // Use sparse handler for interpolation
    const interpolated = this.sparseHandler.getInterpolatedState(entityId, timestamp);
    if (!interpolated) return null;

    return {
      entityId,
      position: interpolated.properties as PositionState,
      positionConfidence: interpolated.confidence,
      temporalState: null,
      track: null,
      belief: null,
      isObservable: !interpolated.isExtrapolated,
      timeSinceObservation: interpolated.timeSinceObservation,
      hasRecentChange: false,
      attributes: {},
    };
  }

  /**
   * Get the full world model state.
   */
  getWorldState(): WorldModelState {
    const entities = new Map<string, EntityState>();
    const currentTime = Date.now();

    // Collect all tracked entities
    for (const entityId of this.temporalEngine.getAllEntities()) {
      const state = this.getEntityState(entityId);
      if (state) {
        entities.set(entityId, state);
      }
    }

    // Add tracked objects
    for (const track of this.objectTracker.getConfirmedTracks()) {
      if (!entities.has(track.trackId)) {
        entities.set(track.trackId, this.buildEntityStateFromTrack(track, currentTime));
      }
    }

    // Collect recent changes
    const recentChanges = this.changeDetector.getRecentChanges(this.config.recentEventWindow);

    // Collect anomalies
    const anomalies = this.temporalEngine.getAnomalies(undefined, this.config.recentEventWindow);

    // Calculate overall confidence
    const uncertaintyStats = this.uncertaintyReasoner.getStats();
    const modelConfidence = uncertaintyStats.averageConfidence * (1 - uncertaintyStats.averageStaleness);

    return {
      entities,
      tracks: this.objectTracker.getConfirmedTracks(),
      recentChanges,
      anomalies,
      modelConfidence,
      timestamp: currentTime,
    };
  }

  /**
   * Check if an entity has changed recently.
   */
  hasEntityChanged(entityId: string, maxAge: number = 5000): boolean {
    return this.changeDetector.hasRecentChange(entityId, maxAge);
  }

  /**
   * Get entities that need attention (urgent updates, anomalies, etc.).
   */
  getEntitiesNeedingAttention(): Array<{
    entityId: string;
    reason: string;
    priority: number;
  }> {
    const results: Array<{ entityId: string; reason: string; priority: number }> = [];

    // Urgent updates from sparse handler
    for (const entityId of this.sparseHandler.getUrgentEntities()) {
      results.push({
        entityId,
        reason: 'needs_observation',
        priority: 0.8,
      });
    }

    // Recent anomalies
    const anomalies = this.temporalEngine.getAnomalies(undefined, 5000);
    for (const anomaly of anomalies) {
      if (!results.find(r => r.entityId === anomaly.entityId)) {
        results.push({
          entityId: anomaly.entityId,
          reason: `anomaly: ${anomaly.type}`,
          priority: 0.9,
        });
      }
    }

    // Sort by priority
    results.sort((a, b) => b.priority - a.priority);

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION SUPPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate an action under uncertainty.
   */
  evaluateAction(
    action: string,
    successValue: number,
    failureValue: number,
    relevantEntities: string[],
    successCondition: (beliefs: Map<string, BeliefState>) => { probability: number; uncertainty: number }
  ): DecisionUnderUncertainty {
    const relevantBeliefs = relevantEntities.flatMap(e => [
      `${e}_x`,
      `${e}_y`,
      `${e}_z`,
    ]);

    return this.uncertaintyReasoner.evaluateAction(
      action,
      successValue,
      failureValue,
      relevantBeliefs,
      successCondition
    );
  }

  /**
   * Fuse observations from multiple sources.
   */
  fuseObservations(
    observations: Array<{
      sourceId: string;
      value: number;
      uncertainty: number;
    }>
  ): FusionResult {
    return this.uncertaintyReasoner.fuseObservations(observations);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildEntityState(
    entityId: string,
    temporalState: TemporalState<PositionState> | null,
    track: ObjectTrack | null,
    timestamp: number,
    attributes?: Record<string, unknown>
  ): EntityState {
    const hasRecentChange = this.changeDetector.hasRecentChange(entityId, 5000);

    // Get position from best source
    let position: PositionState | null = null;
    let positionConfidence = 0;
    let timeSinceObs = Infinity;

    if (temporalState) {
      position = temporalState.current;
      positionConfidence = temporalState.confidence;
      timeSinceObs = timestamp - temporalState.lastObserved;
    } else if (track) {
      position = {
        x: track.position.x,
        y: track.position.y,
        z: track.position.z,
      };
      positionConfidence = track.confidence;
      timeSinceObs = timestamp - track.lastSeenAt;
    }

    // Get belief
    const beliefX = this.uncertaintyReasoner.getBelief(`${entityId}_x`);

    return {
      entityId,
      position,
      positionConfidence,
      temporalState,
      track,
      belief: beliefX,
      isObservable: temporalState?.isObservable ?? track?.isActive ?? false,
      timeSinceObservation: timeSinceObs,
      hasRecentChange,
      attributes: attributes || {},
    };
  }

  private buildEntityStateFromTrack(track: ObjectTrack, timestamp: number): EntityState {
    return {
      entityId: track.trackId,
      position: {
        x: track.position.x,
        y: track.position.y,
        z: track.position.z,
      },
      positionConfidence: track.confidence,
      temporalState: null,
      track,
      belief: null,
      isObservable: track.isActive,
      timeSinceObservation: timestamp - track.lastSeenAt,
      hasRecentChange: false,
      attributes: track.features.attributes,
    };
  }

  private mapSourceToObservationSource(source: string): 'distance_sensor' | 'camera_vision' | 'line_sensor' | 'inference' | 'manual' | 'aggregated' {
    if (source.includes('distance') || source.includes('lidar')) return 'distance_sensor';
    if (source.includes('camera') || source.includes('vision')) return 'camera_vision';
    if (source.includes('line')) return 'line_sensor';
    if (source.includes('inference') || source.includes('predict')) return 'inference';
    if (source.includes('manual') || source.includes('user')) return 'manual';
    return 'aggregated';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a comprehensive cognitive analysis for LLM reasoning.
   */
  generateCognitiveAnalysis(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║           COGNITIVE WORLD MODEL ANALYSIS                     ║');
    lines.push('║  "Knowing when something is different, not just what it sees"║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('');

    // World state summary
    const worldState = this.getWorldState();
    lines.push(`WORLD STATE (confidence: ${(worldState.modelConfidence * 100).toFixed(1)}%)`);
    lines.push(`├─ Tracked entities: ${worldState.entities.size}`);
    lines.push(`├─ Object tracks: ${worldState.tracks.length}`);
    lines.push(`├─ Recent changes: ${worldState.recentChanges.length}`);
    lines.push(`└─ Anomalies: ${worldState.anomalies.length}`);
    lines.push('');

    // Temporal coherence
    lines.push(this.temporalEngine.generateSummary());
    lines.push('');

    // Object tracking
    lines.push(this.objectTracker.generateSummary());
    lines.push('');

    // Change detection
    lines.push(this.changeDetector.generateSummary());
    lines.push('');

    // Uncertainty reasoning
    lines.push(this.uncertaintyReasoner.generateSummary());
    lines.push('');

    // Sparse updates
    lines.push(this.sparseHandler.generateSummary());
    lines.push('');

    // Entities needing attention
    const attention = this.getEntitiesNeedingAttention();
    if (attention.length > 0) {
      lines.push('ENTITIES REQUIRING ATTENTION:');
      for (const item of attention.slice(0, 5)) {
        lines.push(`  ⚠ ${item.entityId}: ${item.reason} (priority: ${(item.priority * 100).toFixed(0)}%)`);
      }
    }

    lines.push('');
    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  /**
   * Get a brief status summary.
   */
  getStatusSummary(): {
    isRunning: boolean;
    entityCount: number;
    trackCount: number;
    modelConfidence: number;
    recentChanges: number;
    urgentEntities: number;
  } {
    const worldState = this.getWorldState();

    return {
      isRunning: this.isRunning,
      entityCount: worldState.entities.size,
      trackCount: worldState.tracks.length,
      modelConfidence: worldState.modelConfidence,
      recentChanges: worldState.recentChanges.length,
      urgentEntities: this.sparseHandler.getUrgentEntities().length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSYSTEM ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get temporal coherence engine */
  getTemporalEngine(): TemporalCoherenceEngine<PositionState> {
    return this.temporalEngine;
  }

  /** Get object identity tracker */
  getObjectTracker(): ObjectIdentityTracker {
    return this.objectTracker;
  }

  /** Get change detector */
  getChangeDetector(): ChangeDetector {
    return this.changeDetector;
  }

  /** Get uncertainty reasoner */
  getUncertaintyReasoner(): UncertaintyReasoner {
    return this.uncertaintyReasoner;
  }

  /** Get sparse update handler */
  getSparseHandler(): SparseUpdateHandler {
    return this.sparseHandler;
  }

  /**
   * Clear all state and reset.
   */
  clear(): void {
    this.temporalEngine.clear();
    this.objectTracker.clear();
    this.changeDetector.clear();
    this.uncertaintyReasoner.clear();
    this.sparseHandler.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const cognitiveModels = new Map<string, CognitiveWorldModel>();

/**
 * Get or create a cognitive world model for a device.
 */
export function getCognitiveWorldModel(
  deviceId: string,
  config?: Partial<CognitiveWorldModelConfig>
): CognitiveWorldModel {
  let model = cognitiveModels.get(deviceId);
  if (!model) {
    model = new CognitiveWorldModel({ ...config, deviceId });
    cognitiveModels.set(deviceId, model);
  }
  return model;
}

/**
 * Clear cognitive world model for a device.
 */
export function clearCognitiveWorldModel(deviceId: string): void {
  const model = cognitiveModels.get(deviceId);
  if (model) {
    model.stop();
    model.clear();
    cognitiveModels.delete(deviceId);
  }
}

/**
 * Clear all cognitive world models.
 */
export function clearAllCognitiveWorldModels(): void {
  for (const [deviceId] of cognitiveModels) {
    clearCognitiveWorldModel(deviceId);
  }
}

export default CognitiveWorldModel;
