/**
 * Temporal Coherence System
 *
 * Maintains temporal consistency across observations from partial reality.
 * This module addresses the core challenge: AI systems typically see snapshots,
 * not persistent world models. This system bridges that gap.
 *
 * Key Features:
 * - Observation history with temporal indexing
 * - Prediction of unobserved states based on motion models
 * - Temporal smoothing to reduce noise
 * - Detection of temporal anomalies (things that shouldn't change but did)
 *
 * Philosophy: An intelligent agent must understand not just WHAT it sees,
 * but HOW what it sees relates to what it saw before.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TemporalObservation<T = unknown> {
  /** Unique observation ID */
  id: string;

  /** Entity ID this observation is about */
  entityId: string;

  /** The observed state */
  state: T;

  /** Observation timestamp */
  timestamp: number;

  /** Source of observation (sensor, vision, inference) */
  source: ObservationSource;

  /** Confidence in this observation (0-1) */
  confidence: number;

  /** Sensor noise estimate (standard deviation) */
  noiseEstimate: number;
}

export type ObservationSource =
  | 'distance_sensor'
  | 'camera_vision'
  | 'line_sensor'
  | 'inference'      // Predicted from model
  | 'manual'         // User-provided
  | 'aggregated';    // Combined from multiple sources

export interface TemporalState<T = unknown> {
  /** Current best estimate of state */
  current: T;

  /** Previous state (for change detection) */
  previous: T | null;

  /** Predicted next state */
  predicted: T | null;

  /** Confidence in current state (0-1) */
  confidence: number;

  /** How stable this state has been */
  stability: number;

  /** Velocity/rate of change */
  velocity: Partial<T> | null;

  /** Last observation timestamp */
  lastObserved: number;

  /** Observation count */
  observationCount: number;

  /** Is this state currently visible/observable? */
  isObservable: boolean;
}

export interface TemporalCoherenceConfig {
  /** Maximum history length per entity */
  maxHistoryLength: number;

  /** Time window for recent observations (ms) */
  recentWindow: number;

  /** Confidence decay rate per second when unobserved */
  confidenceDecayRate: number;

  /** Minimum confidence before entity is considered "lost" */
  minConfidence: number;

  /** Temporal smoothing factor (0 = no smoothing, 1 = full smoothing) */
  smoothingFactor: number;

  /** Velocity estimation window (ms) */
  velocityWindow: number;

  /** Prediction horizon (ms) - how far ahead to predict */
  predictionHorizon: number;

  /** Anomaly detection threshold (standard deviations) */
  anomalyThreshold: number;
}

export const DEFAULT_TEMPORAL_CONFIG: TemporalCoherenceConfig = {
  maxHistoryLength: 100,
  recentWindow: 5000,      // 5 seconds
  confidenceDecayRate: 0.1, // 10% per second
  minConfidence: 0.05,
  smoothingFactor: 0.3,
  velocityWindow: 2000,    // 2 seconds
  predictionHorizon: 1000, // 1 second
  anomalyThreshold: 3.0,   // 3 standard deviations
};

export interface TemporalAnomaly {
  /** Entity that exhibited anomaly */
  entityId: string;

  /** Type of anomaly */
  type: AnomalyType;

  /** When detected */
  timestamp: number;

  /** Expected value */
  expected: unknown;

  /** Actual value */
  actual: unknown;

  /** How significant (in standard deviations) */
  significance: number;

  /** Human-readable description */
  description: string;
}

export type AnomalyType =
  | 'sudden_appearance'    // Entity appeared unexpectedly
  | 'sudden_disappearance' // Entity vanished unexpectedly
  | 'position_jump'        // Large unexpected position change
  | 'state_discontinuity'  // State changed in impossible way
  | 'temporal_violation';  // Causality violation (future affecting past)

// ═══════════════════════════════════════════════════════════════════════════
// POSITION STATE (Common use case)
// ═══════════════════════════════════════════════════════════════════════════

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Velocity3D {
  vx: number;
  vy: number;
  vz: number;
}

export type PositionState = {
  x: number;
  y: number;
  z: number;
  rotation?: number;
  [key: string]: number | undefined;
};

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL COHERENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class TemporalCoherenceEngine<T extends { [key: string]: number | undefined } = PositionState> {
  private config: TemporalCoherenceConfig;
  private states: Map<string, TemporalState<T>> = new Map();
  private history: Map<string, TemporalObservation<T>[]> = new Map();
  private anomalies: TemporalAnomaly[] = [];
  private lastUpdateTime: number = Date.now();

  constructor(config: Partial<TemporalCoherenceConfig> = {}) {
    this.config = { ...DEFAULT_TEMPORAL_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATION PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a new observation and update the temporal state.
   * This is the main entry point for new sensor data.
   */
  observe(
    entityId: string,
    state: T,
    source: ObservationSource,
    confidence: number = 1.0,
    noiseEstimate: number = 0.01
  ): TemporalState<T> {
    const timestamp = Date.now();
    const observation: TemporalObservation<T> = {
      id: `obs_${entityId}_${timestamp}`,
      entityId,
      state,
      timestamp,
      source,
      confidence,
      noiseEstimate,
    };

    // Get or create entity state
    let entityState = this.states.get(entityId);
    const isNew = !entityState;

    if (isNew) {
      // New entity - check for sudden appearance anomaly
      entityState = this.createInitialState(state, timestamp);

      // Only flag as anomaly if we've been tracking for a while
      if (this.states.size > 0 && timestamp - this.lastUpdateTime > 1000) {
        this.recordAnomaly({
          entityId,
          type: 'sudden_appearance',
          timestamp,
          expected: null,
          actual: state,
          significance: 1.0,
          description: `New entity "${entityId}" appeared at position`,
        });
      }
    } else {
      // Existing entity - check for anomalies and update
      // entityState is guaranteed to be defined here since isNew is false
      this.checkForAnomalies(entityId, entityState!, observation);
      entityState = this.updateState(entityState!, observation);
    }

    // Store observation in history
    this.addToHistory(entityId, observation);

    // Update state in map
    this.states.set(entityId, entityState);
    this.lastUpdateTime = timestamp;

    return entityState;
  }

  /**
   * Mark an entity as no longer observable (e.g., out of sensor range).
   * The system will predict its state based on motion model.
   */
  markUnobservable(entityId: string): void {
    const state = this.states.get(entityId);
    if (state) {
      state.isObservable = false;
    }
  }

  /**
   * Get the current best estimate of an entity's state.
   * If the entity hasn't been observed recently, returns predicted state.
   */
  getState(entityId: string): TemporalState<T> | null {
    return this.states.get(entityId) || null;
  }

  /**
   * Get all tracked entities
   */
  getAllEntities(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Get all states as a map
   */
  getAllStates(): Map<string, TemporalState<T>> {
    return new Map(this.states);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME EVOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Advance the world model forward in time.
   * This decays confidence and updates predictions for unobserved entities.
   */
  tick(currentTime: number = Date.now()): void {
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // seconds

    for (const [entityId, state] of this.states) {
      // Decay confidence for unobserved entities
      if (!state.isObservable) {
        const decay = Math.pow(1 - this.config.confidenceDecayRate, deltaTime);
        state.confidence *= decay;

        // Predict new position based on velocity
        if (state.velocity && state.confidence > this.config.minConfidence) {
          state.predicted = this.predictState(state, deltaTime * 1000);
        }

        // Mark as lost if confidence too low
        if (state.confidence < this.config.minConfidence) {
          this.recordAnomaly({
            entityId,
            type: 'sudden_disappearance',
            timestamp: currentTime,
            expected: state.current,
            actual: null,
            significance: 1.0,
            description: `Entity "${entityId}" lost (confidence decay)`,
          });
        }
      }

      // Update stability score
      state.stability = this.calculateStability(entityId);
    }

    // Remove truly lost entities
    for (const [entityId, state] of this.states) {
      if (state.confidence < this.config.minConfidence / 2) {
        this.states.delete(entityId);
        this.history.delete(entityId);
      }
    }

    this.lastUpdateTime = currentTime;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREDICTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Predict an entity's state at a future time.
   * Uses motion model (velocity-based) for prediction.
   */
  predictState(state: TemporalState<T>, horizonMs: number): T {
    if (!state.velocity) {
      return { ...state.current };
    }

    const deltaSeconds = horizonMs / 1000;
    const predicted = { ...state.current };

    // Apply velocity to each numeric field
    for (const key of Object.keys(state.velocity) as (keyof T)[]) {
      const velocityValue = state.velocity[key];
      if (typeof velocityValue === 'number' && typeof predicted[key] === 'number') {
        (predicted as Record<string, number>)[key as string] =
          (predicted[key] as number) + velocityValue * deltaSeconds;
      }
    }

    return predicted;
  }

  /**
   * Predict where an entity will be at a specific timestamp.
   */
  predictAt(entityId: string, timestamp: number): T | null {
    const state = this.states.get(entityId);
    if (!state) return null;

    const horizonMs = timestamp - state.lastObserved;
    return this.predictState(state, horizonMs);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANOMALY DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check for temporal anomalies in a new observation.
   */
  private checkForAnomalies(
    entityId: string,
    state: TemporalState<T>,
    observation: TemporalObservation<T>
  ): void {
    // Check for position jump
    if (state.current && observation.state) {
      const distance = this.calculateStateDistance(state.current, observation.state);
      const expectedMaxMove = this.calculateExpectedMaxMove(state, observation.timestamp);

      if (distance > expectedMaxMove * this.config.anomalyThreshold) {
        this.recordAnomaly({
          entityId,
          type: 'position_jump',
          timestamp: observation.timestamp,
          expected: state.predicted || state.current,
          actual: observation.state,
          significance: distance / expectedMaxMove,
          description: `Entity "${entityId}" jumped ${distance.toFixed(3)} units (expected max ${expectedMaxMove.toFixed(3)})`,
        });
      }
    }

    // Check for state discontinuity
    if (state.velocity) {
      const predicted = this.predictState(state, observation.timestamp - state.lastObserved);
      const predictionError = this.calculateStateDistance(predicted, observation.state);
      const threshold = observation.noiseEstimate * this.config.anomalyThreshold;

      if (predictionError > threshold) {
        this.recordAnomaly({
          entityId,
          type: 'state_discontinuity',
          timestamp: observation.timestamp,
          expected: predicted,
          actual: observation.state,
          significance: predictionError / observation.noiseEstimate,
          description: `Entity "${entityId}" state deviated from prediction by ${predictionError.toFixed(3)}`,
        });
      }
    }
  }

  /**
   * Get recent anomalies (optionally filtered by type)
   */
  getAnomalies(type?: AnomalyType, maxAge?: number): TemporalAnomaly[] {
    const now = Date.now();
    const maxAgeMs = maxAge || this.config.recentWindow;

    return this.anomalies.filter(a =>
      (now - a.timestamp) < maxAgeMs &&
      (!type || a.type === type)
    );
  }

  /**
   * Clear old anomalies
   */
  clearOldAnomalies(maxAge: number = 60000): void {
    const cutoff = Date.now() - maxAge;
    this.anomalies = this.anomalies.filter(a => a.timestamp > cutoff);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VELOCITY ESTIMATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Estimate velocity from recent observation history.
   * Uses weighted linear regression on recent observations.
   */
  private estimateVelocity(entityId: string): Partial<T> | null {
    const observations = this.history.get(entityId);
    if (!observations || observations.length < 2) return null;

    const now = Date.now();
    const windowStart = now - this.config.velocityWindow;
    const recent = observations.filter(o => o.timestamp >= windowStart);

    if (recent.length < 2) return null;

    // Get the keys to estimate velocity for
    const firstState = recent[0].state;
    const keys = Object.keys(firstState).filter(k => typeof firstState[k as keyof T] === 'number');

    const velocity: Record<string, number> = {};

    for (const key of keys) {
      // Weighted linear regression (more recent = higher weight)
      let sumW = 0, sumT = 0, sumV = 0, sumTT = 0, sumTV = 0;

      for (let i = 0; i < recent.length; i++) {
        const obs = recent[i];
        const t = (obs.timestamp - windowStart) / 1000; // seconds from window start
        const v = obs.state[key as keyof T] as number;
        const w = obs.confidence * (0.5 + 0.5 * i / recent.length); // Recent observations weighted higher

        sumW += w;
        sumT += w * t;
        sumV += w * v;
        sumTT += w * t * t;
        sumTV += w * t * v;
      }

      // Weighted linear regression slope
      const denominator = sumW * sumTT - sumT * sumT;
      if (Math.abs(denominator) > 1e-10) {
        velocity[key] = (sumW * sumTV - sumT * sumV) / denominator;
      } else {
        velocity[key] = 0;
      }
    }

    return velocity as Partial<T>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORAL SMOOTHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply temporal smoothing to reduce observation noise.
   * Uses exponential moving average.
   */
  private smoothState(previous: T, current: T): T {
    const alpha = this.config.smoothingFactor;
    const smoothed = { ...current };

    for (const key of Object.keys(current) as (keyof T)[]) {
      const prevVal = previous[key];
      const currVal = current[key];

      if (typeof prevVal === 'number' && typeof currVal === 'number') {
        (smoothed as Record<string, number>)[key as string] =
          alpha * prevVal + (1 - alpha) * currVal;
      }
    }

    return smoothed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private createInitialState(state: T, timestamp: number): TemporalState<T> {
    return {
      current: state,
      previous: null,
      predicted: null,
      confidence: 1.0,
      stability: 1.0,
      velocity: null,
      lastObserved: timestamp,
      observationCount: 1,
      isObservable: true,
    };
  }

  private updateState(
    entityState: TemporalState<T>,
    observation: TemporalObservation<T>
  ): TemporalState<T> {
    // Apply temporal smoothing
    const smoothedState = entityState.previous
      ? this.smoothState(entityState.current, observation.state)
      : observation.state;

    // Update velocity estimate
    const velocity = this.estimateVelocity(observation.entityId);

    // Combine confidence: observation confidence weighted by source reliability
    const sourceWeight = this.getSourceWeight(observation.source);
    const newConfidence = Math.min(
      1.0,
      entityState.confidence * 0.9 + observation.confidence * sourceWeight * 0.1
    );

    return {
      current: smoothedState,
      previous: entityState.current,
      predicted: velocity ? this.predictState({ ...entityState, velocity }, this.config.predictionHorizon) : null,
      confidence: newConfidence,
      stability: entityState.stability,
      velocity,
      lastObserved: observation.timestamp,
      observationCount: entityState.observationCount + 1,
      isObservable: true,
    };
  }

  private addToHistory(entityId: string, observation: TemporalObservation<T>): void {
    let history = this.history.get(entityId);
    if (!history) {
      history = [];
      this.history.set(entityId, history);
    }

    history.push(observation);

    // Trim old history
    if (history.length > this.config.maxHistoryLength) {
      history.shift();
    }
  }

  private recordAnomaly(anomaly: TemporalAnomaly): void {
    this.anomalies.push(anomaly);

    // Keep anomaly history bounded
    if (this.anomalies.length > 1000) {
      this.anomalies = this.anomalies.slice(-500);
    }
  }

  private calculateStateDistance(a: T, b: T): number {
    let sumSquares = 0;
    for (const key of Object.keys(a) as (keyof T)[]) {
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        sumSquares += Math.pow(aVal - bVal, 2);
      }
    }
    return Math.sqrt(sumSquares);
  }

  private calculateExpectedMaxMove(state: TemporalState<T>, observationTime: number): number {
    const deltaTime = (observationTime - state.lastObserved) / 1000;

    if (state.velocity) {
      // Expected move based on velocity
      let velocityMagnitude = 0;
      for (const key of Object.keys(state.velocity) as (keyof Partial<T>)[]) {
        const v = state.velocity[key];
        if (typeof v === 'number') {
          velocityMagnitude += v * v;
        }
      }
      velocityMagnitude = Math.sqrt(velocityMagnitude);

      // Allow 2x the expected move as reasonable
      return velocityMagnitude * deltaTime * 2 + 0.05; // +5cm baseline
    }

    // Default: assume slow movement possible
    return deltaTime * 0.5 + 0.05; // 0.5 m/s max + 5cm baseline
  }

  private calculateStability(entityId: string): number {
    const history = this.history.get(entityId);
    if (!history || history.length < 3) return 1.0;

    // Calculate variance in recent observations
    const recent = history.slice(-10);
    const keys = Object.keys(recent[0].state).filter(
      k => typeof recent[0].state[k as keyof T] === 'number'
    );

    let totalVariance = 0;
    for (const key of keys) {
      const values = recent.map(o => o.state[key as keyof T] as number);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      totalVariance += variance;
    }

    // Convert variance to stability (lower variance = higher stability)
    return Math.max(0, 1 - Math.sqrt(totalVariance));
  }

  private getSourceWeight(source: ObservationSource): number {
    switch (source) {
      case 'camera_vision': return 0.9;
      case 'distance_sensor': return 0.95;
      case 'line_sensor': return 0.98;
      case 'manual': return 1.0;
      case 'inference': return 0.7;
      case 'aggregated': return 0.85;
      default: return 0.8;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYSIS AND EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate a summary of temporal coherence status for LLM reasoning.
   */
  generateSummary(): string {
    const lines: string[] = [];
    lines.push('═══ TEMPORAL COHERENCE STATUS ═══');
    lines.push(`Tracked entities: ${this.states.size}`);
    lines.push(`Recent anomalies: ${this.getAnomalies().length}`);
    lines.push('');

    for (const [entityId, state] of this.states) {
      const age = (Date.now() - state.lastObserved) / 1000;
      const status = state.isObservable ? 'VISIBLE' : 'PREDICTED';
      lines.push(`  ${entityId}: ${status} (conf: ${(state.confidence * 100).toFixed(1)}%, age: ${age.toFixed(1)}s, stability: ${(state.stability * 100).toFixed(1)}%)`);
    }

    const recentAnomalies = this.getAnomalies(undefined, 10000);
    if (recentAnomalies.length > 0) {
      lines.push('');
      lines.push('Recent anomalies:');
      for (const anomaly of recentAnomalies.slice(-5)) {
        lines.push(`  - ${anomaly.description}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get observation history for an entity
   */
  getHistory(entityId: string): TemporalObservation<T>[] {
    return this.history.get(entityId) || [];
  }

  /**
   * Clear all state (reset)
   */
  clear(): void {
    this.states.clear();
    this.history.clear();
    this.anomalies = [];
    this.lastUpdateTime = Date.now();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const temporalEngines = new Map<string, TemporalCoherenceEngine>();

/**
 * Get or create a temporal coherence engine for a device
 */
export function getTemporalEngine<T extends Record<string, number> = PositionState>(
  deviceId: string,
  config?: Partial<TemporalCoherenceConfig>
): TemporalCoherenceEngine<T> {
  let engine = temporalEngines.get(deviceId) as TemporalCoherenceEngine<T> | undefined;
  if (!engine) {
    engine = new TemporalCoherenceEngine<T>(config);
    temporalEngines.set(deviceId, engine as TemporalCoherenceEngine);
  }
  return engine;
}

/**
 * Clear temporal engine for a device
 */
export function clearTemporalEngine(deviceId: string): void {
  temporalEngines.delete(deviceId);
}

export default TemporalCoherenceEngine;
