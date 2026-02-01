/**
 * Sparse Update Handler
 *
 * Handles infrequent and irregular observations gracefully.
 * This addresses the reality that sensors don't provide continuous data -
 * observations are often sparse, irregular, and opportunistic.
 *
 * Key Features:
 * - Interpolation between sparse observations
 * - Extrapolation when observations are missing
 * - Event-driven update triggering
 * - Adaptive update scheduling
 * - Observation importance weighting
 *
 * Philosophy: Real-world perception is sparse. The system must maintain
 * coherent beliefs even with limited, irregular information.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SparseObservation {
  /** Observation ID */
  id: string;

  /** Entity being observed */
  entityId: string;

  /** Observed properties */
  properties: Record<string, number>;

  /** Timestamp */
  timestamp: number;

  /** Observation quality (0-1) */
  quality: number;

  /** Is this a scheduled or opportunistic observation? */
  type: 'scheduled' | 'opportunistic' | 'event_triggered';

  /** Source of observation */
  source: string;
}

export interface InterpolatedState {
  /** Entity ID */
  entityId: string;

  /** Interpolated properties */
  properties: Record<string, number>;

  /** Interpolation timestamp */
  timestamp: number;

  /** Interpolation method used */
  method: InterpolationMethod;

  /** Confidence in interpolation (0-1) */
  confidence: number;

  /** Time since last real observation */
  timeSinceObservation: number;

  /** Is this extrapolated (beyond observations)? */
  isExtrapolated: boolean;
}

export type InterpolationMethod =
  | 'linear'           // Simple linear interpolation
  | 'spline'           // Cubic spline interpolation
  | 'constant'         // Hold last value
  | 'physics_based'    // Use motion model
  | 'learned';         // Use learned patterns

export interface EntityObservationPattern {
  /** Entity ID */
  entityId: string;

  /** Average observation interval (ms) */
  averageInterval: number;

  /** Interval variance */
  intervalVariance: number;

  /** Last observation time */
  lastObservation: number;

  /** Expected next observation time */
  expectedNextObservation: number;

  /** Observation history (timestamps) */
  observationTimes: number[];

  /** Is this entity currently being observed regularly? */
  isActive: boolean;

  /** Reliability of observation schedule */
  scheduleReliability: number;
}

export interface UpdatePriority {
  /** Entity ID */
  entityId: string;

  /** Priority score (higher = more important) */
  priority: number;

  /** Reason for priority */
  reason: PriorityReason;

  /** Suggested update interval (ms) */
  suggestedInterval: number;

  /** Is urgent update needed? */
  isUrgent: boolean;
}

export type PriorityReason =
  | 'high_uncertainty'    // Belief is uncertain
  | 'stale_data'          // Data is old
  | 'high_velocity'       // Entity is moving fast
  | 'recent_change'       // Entity recently changed
  | 'user_interest'       // User expressed interest
  | 'safety_critical'     // Safety-relevant entity
  | 'scheduled';          // Regular scheduled update

export interface SparseUpdateConfig {
  /** Maximum extrapolation time (ms) */
  maxExtrapolationTime: number;

  /** Default interpolation method */
  defaultInterpolationMethod: InterpolationMethod;

  /** Confidence decay rate during extrapolation */
  extrapolationDecayRate: number;

  /** Minimum observations for pattern detection */
  minObservationsForPattern: number;

  /** Observation history length */
  observationHistoryLength: number;

  /** Priority update threshold */
  priorityUpdateThreshold: number;

  /** Enable adaptive scheduling */
  enableAdaptiveScheduling: boolean;

  /** Maximum priority queue size */
  maxPriorityQueueSize: number;
}

export const DEFAULT_SPARSE_UPDATE_CONFIG: SparseUpdateConfig = {
  maxExtrapolationTime: 10000,     // 10 seconds
  defaultInterpolationMethod: 'physics_based',
  extrapolationDecayRate: 0.1,     // 10% per second
  minObservationsForPattern: 5,
  observationHistoryLength: 50,
  priorityUpdateThreshold: 0.7,
  enableAdaptiveScheduling: true,
  maxPriorityQueueSize: 100,
};

// ═══════════════════════════════════════════════════════════════════════════
// SPARSE UPDATE HANDLER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SparseUpdateHandler {
  private config: SparseUpdateConfig;
  private observations: Map<string, SparseObservation[]> = new Map();
  private patterns: Map<string, EntityObservationPattern> = new Map();
  private velocities: Map<string, Record<string, number>> = new Map();
  private priorityQueue: UpdatePriority[] = [];
  private urgentEntities: Set<string> = new Set();

  constructor(config: Partial<SparseUpdateConfig> = {}) {
    this.config = { ...DEFAULT_SPARSE_UPDATE_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a new observation.
   */
  recordObservation(observation: SparseObservation): void {
    // Get or create observation history
    let history = this.observations.get(observation.entityId);
    if (!history) {
      history = [];
      this.observations.set(observation.entityId, history);
    }

    // Update velocity estimate
    if (history.length > 0) {
      const lastObs = history[history.length - 1];
      const dt = (observation.timestamp - lastObs.timestamp) / 1000;
      if (dt > 0 && dt < 60) { // Ignore if too old
        const velocities: Record<string, number> = {};
        for (const [key, value] of Object.entries(observation.properties)) {
          const lastValue = lastObs.properties[key];
          if (typeof lastValue === 'number') {
            velocities[key] = (value - lastValue) / dt;
          }
        }
        this.velocities.set(observation.entityId, velocities);
      }
    }

    // Add observation
    history.push(observation);

    // Trim history
    if (history.length > this.config.observationHistoryLength) {
      history.shift();
    }

    // Update pattern
    this.updatePattern(observation.entityId, observation.timestamp);

    // Remove from urgent if observed
    this.urgentEntities.delete(observation.entityId);
  }

  /**
   * Update observation pattern for an entity.
   */
  private updatePattern(entityId: string, timestamp: number): void {
    const history = this.observations.get(entityId);
    if (!history || history.length < 2) return;

    let pattern = this.patterns.get(entityId);
    if (!pattern) {
      pattern = {
        entityId,
        averageInterval: 1000,
        intervalVariance: 1000000,
        lastObservation: timestamp,
        expectedNextObservation: timestamp + 1000,
        observationTimes: [],
        isActive: true,
        scheduleReliability: 0.5,
      };
      this.patterns.set(entityId, pattern);
    }

    // Update observation times
    pattern.observationTimes.push(timestamp);
    if (pattern.observationTimes.length > this.config.observationHistoryLength) {
      pattern.observationTimes.shift();
    }

    // Calculate interval statistics
    if (pattern.observationTimes.length >= this.config.minObservationsForPattern) {
      const intervals: number[] = [];
      for (let i = 1; i < pattern.observationTimes.length; i++) {
        intervals.push(pattern.observationTimes[i] - pattern.observationTimes[i - 1]);
      }

      pattern.averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      pattern.intervalVariance = intervals.reduce(
        (sum, val) => sum + Math.pow(val - pattern!.averageInterval, 2),
        0
      ) / intervals.length;

      // Calculate reliability (lower variance = higher reliability)
      const cv = Math.sqrt(pattern.intervalVariance) / pattern.averageInterval;
      pattern.scheduleReliability = Math.max(0, 1 - cv);
    }

    pattern.lastObservation = timestamp;
    pattern.expectedNextObservation = timestamp + pattern.averageInterval;
    pattern.isActive = true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERPOLATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get interpolated state at a specific timestamp.
   */
  getInterpolatedState(
    entityId: string,
    timestamp: number = Date.now(),
    method?: InterpolationMethod
  ): InterpolatedState | null {
    const history = this.observations.get(entityId);
    if (!history || history.length === 0) return null;

    const interpMethod = method || this.config.defaultInterpolationMethod;

    // Find bracketing observations
    const before = this.findObservationBefore(history, timestamp);
    const after = this.findObservationAfter(history, timestamp);

    // If timestamp is within observation range, interpolate
    if (before && after && before !== after) {
      return this.interpolateBetween(entityId, before, after, timestamp, interpMethod);
    }

    // If timestamp is after all observations, extrapolate
    if (before && (!after || after === before)) {
      return this.extrapolateFrom(entityId, before, timestamp, interpMethod);
    }

    // If timestamp is before all observations, use first observation
    if (after && !before) {
      return {
        entityId,
        properties: { ...after.properties },
        timestamp,
        method: 'constant',
        confidence: 0.5,
        timeSinceObservation: timestamp - after.timestamp,
        isExtrapolated: true,
      };
    }

    return null;
  }

  /**
   * Interpolate between two observations.
   */
  private interpolateBetween(
    entityId: string,
    before: SparseObservation,
    after: SparseObservation,
    timestamp: number,
    method: InterpolationMethod
  ): InterpolatedState {
    const t = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
    const interpolated: Record<string, number> = {};

    switch (method) {
      case 'linear':
        for (const key of Object.keys(before.properties)) {
          const v0 = before.properties[key];
          const v1 = after.properties[key];
          if (v1 !== undefined) {
            interpolated[key] = v0 + t * (v1 - v0);
          }
        }
        break;

      case 'spline':
        // Simplified cubic interpolation using Hermite spline
        interpolated.push(...this.hermiteInterpolate(before, after, t));
        break;

      case 'constant':
        Object.assign(interpolated, before.properties);
        break;

      case 'physics_based':
      default:
        // Use velocity for smoother interpolation
        const velocities = this.velocities.get(entityId);
        for (const key of Object.keys(before.properties)) {
          const v0 = before.properties[key];
          const v1 = after.properties[key];
          if (v1 !== undefined) {
            const velocity = velocities?.[key] || 0;
            // Blend between linear and velocity-based
            const linear = v0 + t * (v1 - v0);
            const velocityBased = v0 + velocity * (timestamp - before.timestamp) / 1000;
            interpolated[key] = 0.7 * linear + 0.3 * velocityBased;
          }
        }
        break;
    }

    // Confidence based on observation quality
    const confidence = Math.min(before.quality, after.quality);

    return {
      entityId,
      properties: interpolated,
      timestamp,
      method,
      confidence,
      timeSinceObservation: 0, // Within observation window
      isExtrapolated: false,
    };
  }

  /**
   * Extrapolate from the last observation.
   */
  private extrapolateFrom(
    entityId: string,
    lastObs: SparseObservation,
    timestamp: number,
    method: InterpolationMethod
  ): InterpolatedState {
    const dt = timestamp - lastObs.timestamp;

    // Check if extrapolation is too far
    if (dt > this.config.maxExtrapolationTime) {
      // Return last known state with very low confidence
      return {
        entityId,
        properties: { ...lastObs.properties },
        timestamp,
        method: 'constant',
        confidence: 0.1,
        timeSinceObservation: dt,
        isExtrapolated: true,
      };
    }

    const extrapolated: Record<string, number> = {};
    const velocities = this.velocities.get(entityId);
    const dtSeconds = dt / 1000;

    for (const key of Object.keys(lastObs.properties)) {
      const baseValue = lastObs.properties[key];

      switch (method) {
        case 'physics_based':
          const velocity = velocities?.[key] || 0;
          extrapolated[key] = baseValue + velocity * dtSeconds;
          break;

        case 'constant':
        default:
          extrapolated[key] = baseValue;
          break;
      }
    }

    // Decay confidence based on time
    const confidence = lastObs.quality * Math.exp(-this.config.extrapolationDecayRate * dtSeconds);

    return {
      entityId,
      properties: extrapolated,
      timestamp,
      method,
      confidence,
      timeSinceObservation: dt,
      isExtrapolated: true,
    };
  }

  /**
   * Hermite spline interpolation helper.
   */
  private hermiteInterpolate(
    before: SparseObservation,
    after: SparseObservation,
    t: number
  ): Record<string, number> {
    const result: Record<string, number> = {};

    // Hermite basis functions
    const h00 = 2 * t * t * t - 3 * t * t + 1;
    const h10 = t * t * t - 2 * t * t + t;
    const h01 = -2 * t * t * t + 3 * t * t;
    const h11 = t * t * t - t * t;

    for (const key of Object.keys(before.properties)) {
      const p0 = before.properties[key];
      const p1 = after.properties[key];
      if (p1 !== undefined) {
        // Estimate tangents (simple difference)
        const m0 = (p1 - p0) * 0.5;
        const m1 = m0;

        result[key] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVATION FINDING
  // ═══════════════════════════════════════════════════════════════════════════

  private findObservationBefore(
    history: SparseObservation[],
    timestamp: number
  ): SparseObservation | null {
    let result: SparseObservation | null = null;
    for (const obs of history) {
      if (obs.timestamp <= timestamp) {
        result = obs;
      } else {
        break;
      }
    }
    return result;
  }

  private findObservationAfter(
    history: SparseObservation[],
    timestamp: number
  ): SparseObservation | null {
    for (const obs of history) {
      if (obs.timestamp > timestamp) {
        return obs;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate update priorities for all tracked entities.
   */
  calculatePriorities(currentTime: number = Date.now()): UpdatePriority[] {
    this.priorityQueue = [];

    for (const [entityId, pattern] of this.patterns) {
      const priority = this.calculateEntityPriority(entityId, pattern, currentTime);
      this.priorityQueue.push(priority);

      if (priority.isUrgent) {
        this.urgentEntities.add(entityId);
      }
    }

    // Sort by priority (descending)
    this.priorityQueue.sort((a, b) => b.priority - a.priority);

    // Trim queue
    if (this.priorityQueue.length > this.config.maxPriorityQueueSize) {
      this.priorityQueue = this.priorityQueue.slice(0, this.config.maxPriorityQueueSize);
    }

    return this.priorityQueue;
  }

  /**
   * Calculate priority for a single entity.
   */
  private calculateEntityPriority(
    entityId: string,
    pattern: EntityObservationPattern,
    currentTime: number
  ): UpdatePriority {
    let priority = 0;
    let reason: PriorityReason = 'scheduled';
    let isUrgent = false;

    // Time since last observation
    const timeSince = currentTime - pattern.lastObservation;
    const normalizedTime = timeSince / pattern.averageInterval;

    // High priority if overdue
    if (normalizedTime > 1.5) {
      priority += 0.3 * normalizedTime;
      reason = 'stale_data';
    }

    // Check velocity (fast-moving entities need more frequent updates)
    const velocities = this.velocities.get(entityId);
    if (velocities) {
      const totalVelocity = Math.sqrt(
        Object.values(velocities).reduce((sum, v) => sum + v * v, 0)
      );
      if (totalVelocity > 0.5) { // > 0.5 m/s
        priority += 0.2 * Math.min(totalVelocity, 2);
        reason = 'high_velocity';
      }
    }

    // Check for extrapolation confidence decay
    const currentState = this.getInterpolatedState(entityId, currentTime);
    if (currentState && currentState.isExtrapolated && currentState.confidence < 0.5) {
      priority += 0.3 * (1 - currentState.confidence);
      reason = 'high_uncertainty';
    }

    // Mark as urgent if very overdue
    if (normalizedTime > 3.0 || (currentState && currentState.confidence < 0.3)) {
      isUrgent = true;
    }

    // Suggested interval based on pattern and velocity
    let suggestedInterval = pattern.averageInterval;
    if (velocities) {
      const totalVelocity = Math.sqrt(
        Object.values(velocities).reduce((sum, v) => sum + v * v, 0)
      );
      // Faster movement = shorter interval
      suggestedInterval = Math.max(100, suggestedInterval / (1 + totalVelocity));
    }

    return {
      entityId,
      priority: Math.min(1, priority),
      reason,
      suggestedInterval,
      isUrgent,
    };
  }

  /**
   * Get entities that urgently need updates.
   */
  getUrgentEntities(): string[] {
    return Array.from(this.urgentEntities);
  }

  /**
   * Get next entity to update (highest priority).
   */
  getNextUpdateTarget(): UpdatePriority | null {
    if (this.priorityQueue.length === 0) return null;
    return this.priorityQueue[0];
  }

  /**
   * Mark an entity as safety-critical (always high priority).
   */
  markSafetyCritical(entityId: string): void {
    const existingIdx = this.priorityQueue.findIndex(p => p.entityId === entityId);
    if (existingIdx >= 0) {
      this.priorityQueue[existingIdx].priority = 1.0;
      this.priorityQueue[existingIdx].reason = 'safety_critical';
      this.priorityQueue[existingIdx].isUrgent = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE SCHEDULING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get recommended observation schedule.
   */
  getObservationSchedule(maxEntities: number = 10): Array<{
    entityId: string;
    suggestedTime: number;
    priority: number;
    interval: number;
  }> {
    if (!this.config.enableAdaptiveScheduling) {
      return [];
    }

    const schedule: Array<{
      entityId: string;
      suggestedTime: number;
      priority: number;
      interval: number;
    }> = [];

    const currentTime = Date.now();

    // Get top priority entities
    const priorities = this.calculatePriorities(currentTime);
    const topEntities = priorities.slice(0, maxEntities);

    for (const priority of topEntities) {
      const pattern = this.patterns.get(priority.entityId);
      const suggestedTime = pattern
        ? Math.max(currentTime, pattern.expectedNextObservation)
        : currentTime + priority.suggestedInterval;

      schedule.push({
        entityId: priority.entityId,
        suggestedTime,
        priority: priority.priority,
        interval: priority.suggestedInterval,
      });
    }

    // Sort by suggested time
    schedule.sort((a, b) => a.suggestedTime - b.suggestedTime);

    return schedule;
  }

  /**
   * Check if an entity is overdue for observation.
   */
  isObservationOverdue(entityId: string, currentTime: number = Date.now()): boolean {
    const pattern = this.patterns.get(entityId);
    if (!pattern) return false;

    const timeSince = currentTime - pattern.lastObservation;
    return timeSince > pattern.averageInterval * 1.5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get observation pattern for an entity.
   */
  getPattern(entityId: string): EntityObservationPattern | null {
    return this.patterns.get(entityId) || null;
  }

  /**
   * Get observation history for an entity.
   */
  getObservationHistory(entityId: string): SparseObservation[] {
    return this.observations.get(entityId) || [];
  }

  /**
   * Get estimated velocity for an entity.
   */
  getVelocity(entityId: string): Record<string, number> | null {
    return this.velocities.get(entityId) || null;
  }

  /**
   * Get statistics.
   */
  getStats(): {
    trackedEntities: number;
    totalObservations: number;
    urgentCount: number;
    averageObservationInterval: number;
    averageScheduleReliability: number;
  } {
    let totalObs = 0;
    let totalInterval = 0;
    let totalReliability = 0;
    let patternCount = 0;

    for (const history of this.observations.values()) {
      totalObs += history.length;
    }

    for (const pattern of this.patterns.values()) {
      totalInterval += pattern.averageInterval;
      totalReliability += pattern.scheduleReliability;
      patternCount++;
    }

    return {
      trackedEntities: this.patterns.size,
      totalObservations: totalObs,
      urgentCount: this.urgentEntities.size,
      averageObservationInterval: patternCount > 0 ? totalInterval / patternCount : 0,
      averageScheduleReliability: patternCount > 0 ? totalReliability / patternCount : 0,
    };
  }

  /**
   * Generate summary for LLM reasoning.
   */
  generateSummary(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('═══ SPARSE UPDATE STATUS ═══');
    lines.push(`Tracked entities: ${stats.trackedEntities}`);
    lines.push(`Total observations: ${stats.totalObservations}`);
    lines.push(`Urgent updates needed: ${stats.urgentCount}`);
    lines.push(`Avg observation interval: ${(stats.averageObservationInterval / 1000).toFixed(1)}s`);
    lines.push(`Schedule reliability: ${(stats.averageScheduleReliability * 100).toFixed(1)}%`);

    const urgent = this.getUrgentEntities();
    if (urgent.length > 0) {
      lines.push('');
      lines.push('Entities needing urgent updates:');
      for (const entityId of urgent.slice(0, 5)) {
        const pattern = this.patterns.get(entityId);
        if (pattern) {
          const overdue = Date.now() - pattern.lastObservation;
          lines.push(`  - ${entityId} (${(overdue / 1000).toFixed(1)}s since last observation)`);
        }
      }
    }

    const schedule = this.getObservationSchedule(5);
    if (schedule.length > 0) {
      lines.push('');
      lines.push('Recommended observation schedule:');
      for (const item of schedule) {
        const inMs = item.suggestedTime - Date.now();
        const inStr = inMs <= 0 ? 'NOW' : `in ${(inMs / 1000).toFixed(1)}s`;
        lines.push(`  - ${item.entityId}: ${inStr} (priority: ${(item.priority * 100).toFixed(0)}%)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.observations.clear();
    this.patterns.clear();
    this.velocities.clear();
    this.priorityQueue = [];
    this.urgentEntities.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const handlers = new Map<string, SparseUpdateHandler>();

/**
 * Get or create a sparse update handler for a device.
 */
export function getSparseUpdateHandler(
  deviceId: string,
  config?: Partial<SparseUpdateConfig>
): SparseUpdateHandler {
  let handler = handlers.get(deviceId);
  if (!handler) {
    handler = new SparseUpdateHandler(config);
    handlers.set(deviceId, handler);
  }
  return handler;
}

/**
 * Clear sparse update handler for a device.
 */
export function clearSparseUpdateHandler(deviceId: string): void {
  handlers.delete(deviceId);
}

export default SparseUpdateHandler;
