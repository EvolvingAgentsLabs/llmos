/**
 * Change Detector
 *
 * Distinguishes between meaningful changes and sensor drift/noise.
 * This addresses the key challenge: not everything that "changes" in sensor data
 * represents a real change in the world. This system separates signal from noise.
 *
 * Key Features:
 * - Statistical significance testing for changes
 * - Drift vs change discrimination using multiple criteria
 * - Change classification (position, appearance, state)
 * - Change importance scoring
 * - Historical change patterns for anomaly detection
 *
 * Philosophy: "An AI that knows when something is different, not just what it sees."
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ChangeEvent {
  /** Unique change ID */
  id: string;

  /** Entity that changed */
  entityId: string;

  /** Type of change */
  changeType: ChangeType;

  /** Category for semantic grouping */
  category: ChangeCategory;

  /** When the change was detected */
  detectedAt: number;

  /** When the change actually occurred (estimated) */
  occurredAt: number;

  /** Significance score (0-1, higher = more significant) */
  significance: number;

  /** Confidence that this is a real change (not drift) */
  confidence: number;

  /** Is this a reversible change? */
  isReversible: boolean;

  /** Previous value */
  previousValue: unknown;

  /** New value */
  newValue: unknown;

  /** Human-readable description */
  description: string;

  /** Additional context */
  context: ChangeContext;
}

export type ChangeType =
  | 'position_change'      // Object moved
  | 'appearance_change'    // Object looks different
  | 'state_change'         // Object state changed (on/off, open/closed)
  | 'object_appeared'      // New object in scene
  | 'object_disappeared'   // Object left scene
  | 'relationship_change'  // Spatial relationship changed
  | 'attribute_change';    // Property of object changed

export type ChangeCategory =
  | 'spatial'              // Position/orientation changes
  | 'visual'               // Appearance changes
  | 'semantic'             // State/attribute changes
  | 'structural'           // Scene structure changes
  | 'temporal';            // Timing-based changes

export interface ChangeContext {
  /** Was this change expected? */
  wasExpected: boolean;

  /** What might have caused this change? */
  possibleCauses: string[];

  /** Related entity IDs */
  relatedEntities: string[];

  /** Statistical details */
  statistics: {
    observationCount: number;
    noiseLevel: number;
    signalStrength: number;
    pValue: number;
  };
}

export type DriftType =
  | 'sensor_noise'         // Random measurement noise
  | 'calibration_drift'    // Systematic sensor drift
  | 'environmental'        // Environmental factors (lighting, temperature)
  | 'quantization'         // Discretization artifacts
  | 'aliasing';            // Sampling-related artifacts

export interface DriftAnalysis {
  /** Is this likely drift? */
  isDrift: boolean;

  /** Type of drift if detected */
  driftType?: DriftType;

  /** Confidence that this is drift (not real change) */
  driftConfidence: number;

  /** Estimated drift magnitude */
  driftMagnitude: number;

  /** Explanation */
  explanation: string;
}

export interface ChangeDetectorConfig {
  /** Minimum significance to report a change */
  significanceThreshold: number;

  /** Number of standard deviations for change detection */
  sigmaThreshold: number;

  /** Minimum observations before detecting changes */
  minObservationsForDetection: number;

  /** Window size for noise estimation (ms) */
  noiseEstimationWindow: number;

  /** Window size for drift detection (ms) */
  driftDetectionWindow: number;

  /** Minimum time between repeated change events (ms) */
  changeDebounceTime: number;

  /** Position change threshold (meters) */
  positionChangeThreshold: number;

  /** Enable drift compensation */
  enableDriftCompensation: boolean;

  /** Maximum changes to store in history */
  maxChangeHistory: number;
}

export const DEFAULT_CHANGE_DETECTOR_CONFIG: ChangeDetectorConfig = {
  significanceThreshold: 0.3,
  sigmaThreshold: 2.5,
  minObservationsForDetection: 5,
  noiseEstimationWindow: 5000,
  driftDetectionWindow: 30000,
  changeDebounceTime: 1000,
  positionChangeThreshold: 0.15,
  enableDriftCompensation: true,
  maxChangeHistory: 500,
};

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

interface ObservationStats {
  count: number;
  mean: number;
  variance: number;
  min: number;
  max: number;
  lastValue: number;
  lastTimestamp: number;
  recentValues: Array<{ value: number; timestamp: number }>;
}

interface EntityStatistics {
  entityId: string;
  properties: Map<string, ObservationStats>;
  lastChangeTimestamps: Map<string, number>;
  baselineEstablished: boolean;
  driftEstimates: Map<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE DETECTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ChangeDetector {
  private config: ChangeDetectorConfig;
  private entityStats: Map<string, EntityStatistics> = new Map();
  private changeHistory: ChangeEvent[] = [];
  private nextChangeId: number = 1;

  constructor(config: Partial<ChangeDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CHANGE_DETECTOR_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN DETECTION INTERFACE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze an observation and detect changes.
   * This is the main entry point.
   */
  analyzeObservation(
    entityId: string,
    properties: Record<string, number>,
    timestamp: number = Date.now()
  ): {
    changes: ChangeEvent[];
    drift: DriftAnalysis;
    isSignificant: boolean;
  } {
    // Get or create entity statistics
    const stats = this.getOrCreateStats(entityId);
    const changes: ChangeEvent[] = [];

    // Analyze each property
    for (const [propName, value] of Object.entries(properties)) {
      const propStats = stats.properties.get(propName);

      if (!propStats) {
        // First observation for this property
        this.initializePropertyStats(stats, propName, value, timestamp);
        continue;
      }

      // Check for significant change
      const changeAnalysis = this.analyzePropertyChange(
        entityId,
        propName,
        value,
        propStats,
        timestamp
      );

      if (changeAnalysis.isChange) {
        const change = this.createChangeEvent(
          entityId,
          propName,
          propStats.lastValue,
          value,
          changeAnalysis,
          timestamp
        );
        changes.push(change);
        stats.lastChangeTimestamps.set(propName, timestamp);
      }

      // Update statistics
      this.updatePropertyStats(propStats, value, timestamp);
    }

    // Analyze overall drift
    const drift = this.analyzeDrift(entityId, properties, timestamp);

    // Store significant changes
    for (const change of changes) {
      if (change.significance >= this.config.significanceThreshold) {
        this.changeHistory.push(change);
      }
    }

    // Trim history
    if (this.changeHistory.length > this.config.maxChangeHistory) {
      this.changeHistory = this.changeHistory.slice(-this.config.maxChangeHistory);
    }

    return {
      changes,
      drift,
      isSignificant: changes.some(c => c.significance >= this.config.significanceThreshold),
    };
  }

  /**
   * Analyze whether a position change is meaningful.
   */
  analyzePositionChange(
    entityId: string,
    oldPosition: { x: number; y: number; z: number },
    newPosition: { x: number; y: number; z: number },
    timestamp: number = Date.now()
  ): ChangeEvent | null {
    const distance = this.calculateDistance(oldPosition, newPosition);

    // Get noise estimate for this entity
    const stats = this.entityStats.get(entityId);
    const noiseLevel = stats ? this.estimateNoiseLevel(stats) : 0.05;

    // Statistical significance
    const zScore = distance / (noiseLevel + 0.001);
    const isSignificant = zScore > this.config.sigmaThreshold ||
      distance > this.config.positionChangeThreshold;

    if (!isSignificant) {
      return null;
    }

    // Determine if this is drift or real change
    const driftAnalysis = this.checkPositionDrift(entityId, distance, timestamp);

    if (driftAnalysis.isDrift && driftAnalysis.driftConfidence > 0.7) {
      return null; // This is drift, not a real change
    }

    // Calculate significance
    const significance = Math.min(1.0, zScore / 5.0);

    return this.createChangeEvent(
      entityId,
      'position',
      oldPosition,
      newPosition,
      {
        isChange: true,
        significance,
        isDrift: driftAnalysis.isDrift,
        driftConfidence: driftAnalysis.driftConfidence,
        statistics: {
          distance,
          zScore,
          noiseLevel,
        },
      },
      timestamp
    );
  }

  /**
   * Detect object appearance (new object in scene).
   */
  detectObjectAppeared(
    entityId: string,
    properties: Record<string, unknown>,
    timestamp: number = Date.now()
  ): ChangeEvent {
    const change: ChangeEvent = {
      id: `change_${this.nextChangeId++}`,
      entityId,
      changeType: 'object_appeared',
      category: 'structural',
      detectedAt: timestamp,
      occurredAt: timestamp,
      significance: 0.9,
      confidence: 0.8,
      isReversible: true,
      previousValue: null,
      newValue: properties,
      description: `Object "${entityId}" appeared in scene`,
      context: {
        wasExpected: false,
        possibleCauses: ['entered field of view', 'was occluded', 'new object'],
        relatedEntities: [],
        statistics: {
          observationCount: 1,
          noiseLevel: 0,
          signalStrength: 1.0,
          pValue: 0.01,
        },
      },
    };

    this.changeHistory.push(change);
    return change;
  }

  /**
   * Detect object disappearance.
   */
  detectObjectDisappeared(
    entityId: string,
    lastKnownProperties: Record<string, unknown>,
    timestamp: number = Date.now()
  ): ChangeEvent {
    const stats = this.entityStats.get(entityId);

    const change: ChangeEvent = {
      id: `change_${this.nextChangeId++}`,
      entityId,
      changeType: 'object_disappeared',
      category: 'structural',
      detectedAt: timestamp,
      occurredAt: timestamp,
      significance: 0.9,
      confidence: stats ? 0.9 : 0.5,
      isReversible: true,
      previousValue: lastKnownProperties,
      newValue: null,
      description: `Object "${entityId}" disappeared from scene`,
      context: {
        wasExpected: false,
        possibleCauses: ['left field of view', 'was occluded', 'removed'],
        relatedEntities: [],
        statistics: {
          observationCount: stats?.properties.size || 0,
          noiseLevel: stats ? this.estimateNoiseLevel(stats) : 0,
          signalStrength: 1.0,
          pValue: 0.01,
        },
      },
    };

    this.changeHistory.push(change);
    return change;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIFT ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze whether observed differences are due to drift.
   */
  private analyzeDrift(
    entityId: string,
    properties: Record<string, number>,
    timestamp: number
  ): DriftAnalysis {
    const stats = this.entityStats.get(entityId);
    if (!stats || stats.properties.size === 0) {
      return {
        isDrift: false,
        driftConfidence: 0,
        driftMagnitude: 0,
        explanation: 'Insufficient data for drift analysis',
      };
    }

    // Check for systematic drift across properties
    let totalDrift = 0;
    let driftCount = 0;
    let consistentDirection = true;
    let lastDirection = 0;

    for (const [propName, value] of Object.entries(properties)) {
      const propStats = stats.properties.get(propName);
      if (!propStats || propStats.recentValues.length < 3) continue;

      // Calculate trend
      const trend = this.calculateTrend(propStats.recentValues);
      const driftMagnitude = Math.abs(trend);
      totalDrift += driftMagnitude;
      driftCount++;

      // Check consistency
      if (lastDirection !== 0 && Math.sign(trend) !== Math.sign(lastDirection)) {
        consistentDirection = false;
      }
      lastDirection = trend;

      // Update drift estimate
      if (this.config.enableDriftCompensation) {
        stats.driftEstimates.set(propName, trend);
      }
    }

    const avgDrift = driftCount > 0 ? totalDrift / driftCount : 0;

    // Determine drift type
    let driftType: DriftType | undefined;
    if (avgDrift > 0.001) {
      if (consistentDirection) {
        driftType = 'calibration_drift';
      } else {
        driftType = 'environmental';
      }
    } else if (avgDrift > 0) {
      driftType = 'sensor_noise';
    }

    const isDrift = avgDrift > 0 && avgDrift < 0.01; // Small but consistent
    const driftConfidence = isDrift ? Math.min(0.9, avgDrift * 100) : 0;

    return {
      isDrift,
      driftType,
      driftConfidence,
      driftMagnitude: avgDrift,
      explanation: isDrift
        ? `Detected ${driftType} with magnitude ${avgDrift.toFixed(4)}`
        : 'No significant drift detected',
    };
  }

  /**
   * Check if a position change is likely drift.
   */
  private checkPositionDrift(
    entityId: string,
    distance: number,
    timestamp: number
  ): { isDrift: boolean; driftConfidence: number } {
    const stats = this.entityStats.get(entityId);
    if (!stats) {
      return { isDrift: false, driftConfidence: 0 };
    }

    // Check position history for drift patterns
    const posX = stats.properties.get('position_x');
    const posZ = stats.properties.get('position_z');

    if (!posX || !posZ) {
      return { isDrift: false, driftConfidence: 0 };
    }

    // Characteristics of drift:
    // 1. Small magnitude
    // 2. Consistent direction over time
    // 3. No acceleration (constant drift rate)

    const isSmall = distance < this.config.positionChangeThreshold * 0.5;

    const trendX = this.calculateTrend(posX.recentValues);
    const trendZ = this.calculateTrend(posZ.recentValues);
    const isConsistent = Math.abs(trendX) < 0.01 && Math.abs(trendZ) < 0.01;

    // Check for suddenness (changes shouldn't be sudden for drift)
    const lastChange = stats.lastChangeTimestamps.get('position');
    const timeSinceLastChange = lastChange ? timestamp - lastChange : Infinity;
    const isSudden = timeSinceLastChange < this.config.changeDebounceTime;

    const isDrift = isSmall && isConsistent && !isSudden;
    const driftConfidence = isDrift
      ? 0.5 + 0.25 * (isSmall ? 1 : 0) + 0.25 * (isConsistent ? 1 : 0)
      : 0;

    return { isDrift, driftConfidence };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze whether a property change is significant.
   */
  private analyzePropertyChange(
    entityId: string,
    propName: string,
    newValue: number,
    stats: ObservationStats,
    timestamp: number
  ): {
    isChange: boolean;
    significance: number;
    isDrift: boolean;
    driftConfidence: number;
    statistics: {
      delta: number;
      zScore: number;
      noiseLevel: number;
    };
  } {
    const delta = newValue - stats.lastValue;
    const absDelta = Math.abs(delta);

    // Calculate z-score
    const stdDev = Math.sqrt(stats.variance);
    const zScore = stdDev > 0 ? absDelta / stdDev : absDelta > 0 ? Infinity : 0;

    // Check debounce
    const entityStats = this.entityStats.get(entityId);
    const lastChange = entityStats?.lastChangeTimestamps.get(propName);
    const withinDebounce = lastChange
      ? timestamp - lastChange < this.config.changeDebounceTime
      : false;

    // Determine if this is a significant change
    const isStatisticallySignificant = zScore > this.config.sigmaThreshold;
    const isChange = isStatisticallySignificant && !withinDebounce;

    // Calculate significance
    const significance = isChange
      ? Math.min(1.0, (zScore / this.config.sigmaThreshold - 1) * 0.5 + 0.5)
      : 0;

    // Check for drift
    const trendBased = stats.recentValues.length >= 3
      && Math.abs(this.calculateTrend(stats.recentValues)) > 0.001;
    const isDrift = trendBased && !isStatisticallySignificant;

    return {
      isChange,
      significance,
      isDrift,
      driftConfidence: isDrift ? 0.6 : 0,
      statistics: {
        delta,
        zScore,
        noiseLevel: stdDev,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private getOrCreateStats(entityId: string): EntityStatistics {
    let stats = this.entityStats.get(entityId);
    if (!stats) {
      stats = {
        entityId,
        properties: new Map(),
        lastChangeTimestamps: new Map(),
        baselineEstablished: false,
        driftEstimates: new Map(),
      };
      this.entityStats.set(entityId, stats);
    }
    return stats;
  }

  private initializePropertyStats(
    stats: EntityStatistics,
    propName: string,
    value: number,
    timestamp: number
  ): void {
    stats.properties.set(propName, {
      count: 1,
      mean: value,
      variance: 0,
      min: value,
      max: value,
      lastValue: value,
      lastTimestamp: timestamp,
      recentValues: [{ value, timestamp }],
    });
  }

  private updatePropertyStats(
    stats: ObservationStats,
    value: number,
    timestamp: number
  ): void {
    // Welford's online algorithm for mean and variance
    stats.count++;
    const delta = value - stats.mean;
    stats.mean += delta / stats.count;
    const delta2 = value - stats.mean;
    stats.variance = (stats.variance * (stats.count - 1) + delta * delta2) / stats.count;

    stats.min = Math.min(stats.min, value);
    stats.max = Math.max(stats.max, value);
    stats.lastValue = value;
    stats.lastTimestamp = timestamp;

    // Update recent values
    stats.recentValues.push({ value, timestamp });
    const windowStart = timestamp - this.config.noiseEstimationWindow;
    stats.recentValues = stats.recentValues.filter(v => v.timestamp >= windowStart);
  }

  private estimateNoiseLevel(stats: EntityStatistics): number {
    let totalVariance = 0;
    let count = 0;

    for (const propStats of stats.properties.values()) {
      if (propStats.variance > 0) {
        totalVariance += propStats.variance;
        count++;
      }
    }

    return count > 0 ? Math.sqrt(totalVariance / count) : 0.01;
  }

  private calculateTrend(values: Array<{ value: number; timestamp: number }>): number {
    if (values.length < 2) return 0;

    // Simple linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = values.length;
    const t0 = values[0].timestamp;

    for (const { value, timestamp } of values) {
      const x = (timestamp - t0) / 1000; // seconds
      sumX += x;
      sumY += value;
      sumXY += x * value;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (Math.abs(denominator) < 1e-10) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE EVENT CREATION
  // ═══════════════════════════════════════════════════════════════════════════

  private createChangeEvent(
    entityId: string,
    property: string,
    oldValue: unknown,
    newValue: unknown,
    analysis: {
      isChange: boolean;
      significance: number;
      isDrift: boolean;
      driftConfidence: number;
      statistics?: Record<string, number>;
    },
    timestamp: number
  ): ChangeEvent {
    const isPosition = property.startsWith('position') || property === 'position';

    return {
      id: `change_${this.nextChangeId++}`,
      entityId,
      changeType: isPosition ? 'position_change' : 'attribute_change',
      category: isPosition ? 'spatial' : 'semantic',
      detectedAt: timestamp,
      occurredAt: timestamp,
      significance: analysis.significance,
      confidence: analysis.isDrift ? 1 - analysis.driftConfidence : 0.9,
      isReversible: true,
      previousValue: oldValue,
      newValue,
      description: this.generateChangeDescription(entityId, property, oldValue, newValue),
      context: {
        wasExpected: false,
        possibleCauses: this.inferPossibleCauses(property, analysis),
        relatedEntities: [],
        statistics: {
          observationCount: 1,
          noiseLevel: analysis.statistics?.noiseLevel || 0,
          signalStrength: analysis.significance,
          pValue: this.calculatePValue(analysis.statistics?.zScore || 0),
        },
      },
    };
  }

  private generateChangeDescription(
    entityId: string,
    property: string,
    oldValue: unknown,
    newValue: unknown
  ): string {
    if (typeof oldValue === 'number' && typeof newValue === 'number') {
      const delta = newValue - oldValue;
      const direction = delta > 0 ? 'increased' : 'decreased';
      return `"${entityId}" ${property} ${direction} by ${Math.abs(delta).toFixed(3)}`;
    }

    if (typeof oldValue === 'object' && typeof newValue === 'object') {
      return `"${entityId}" ${property} changed`;
    }

    return `"${entityId}" ${property} changed from ${JSON.stringify(oldValue)} to ${JSON.stringify(newValue)}`;
  }

  private inferPossibleCauses(
    property: string,
    analysis: { isDrift: boolean; driftConfidence: number }
  ): string[] {
    const causes: string[] = [];

    if (analysis.isDrift) {
      causes.push('sensor drift', 'environmental factors');
    }

    if (property.includes('position')) {
      causes.push('object moved', 'measurement error');
    } else {
      causes.push('state change', 'external interaction');
    }

    return causes;
  }

  private calculatePValue(zScore: number): number {
    // Approximate p-value from z-score (two-tailed)
    const absZ = Math.abs(zScore);
    if (absZ > 5) return 0.00001;

    // Use simple approximation
    const p = Math.exp(-0.5 * absZ * absZ) / Math.sqrt(2 * Math.PI);
    return Math.min(1, 2 * p * (1 - p));
  }

  private calculateDistance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get recent significant changes.
   */
  getRecentChanges(maxAge: number = 30000): ChangeEvent[] {
    const cutoff = Date.now() - maxAge;
    return this.changeHistory.filter(
      c => c.detectedAt >= cutoff && c.significance >= this.config.significanceThreshold
    );
  }

  /**
   * Get changes for a specific entity.
   */
  getEntityChanges(entityId: string, maxAge?: number): ChangeEvent[] {
    const changes = this.changeHistory.filter(c => c.entityId === entityId);
    if (maxAge) {
      const cutoff = Date.now() - maxAge;
      return changes.filter(c => c.detectedAt >= cutoff);
    }
    return changes;
  }

  /**
   * Get changes by type.
   */
  getChangesByType(type: ChangeType, maxAge?: number): ChangeEvent[] {
    const changes = this.changeHistory.filter(c => c.changeType === type);
    if (maxAge) {
      const cutoff = Date.now() - maxAge;
      return changes.filter(c => c.detectedAt >= cutoff);
    }
    return changes;
  }

  /**
   * Check if an entity has changed recently.
   */
  hasRecentChange(entityId: string, maxAge: number = 5000): boolean {
    const cutoff = Date.now() - maxAge;
    return this.changeHistory.some(
      c => c.entityId === entityId && c.detectedAt >= cutoff
    );
  }

  /**
   * Get change statistics.
   */
  getStats(): {
    totalChanges: number;
    recentChanges: number;
    changesByType: Record<string, number>;
    entitiesWithChanges: number;
  } {
    const recentCutoff = Date.now() - 60000;
    const recentChanges = this.changeHistory.filter(c => c.detectedAt >= recentCutoff);

    const changesByType: Record<string, number> = {};
    const entities = new Set<string>();

    for (const change of this.changeHistory) {
      changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1;
      entities.add(change.entityId);
    }

    return {
      totalChanges: this.changeHistory.length,
      recentChanges: recentChanges.length,
      changesByType,
      entitiesWithChanges: entities.size,
    };
  }

  /**
   * Generate a summary for LLM reasoning.
   */
  generateSummary(): string {
    const stats = this.getStats();
    const recent = this.getRecentChanges(10000);
    const lines: string[] = [];

    lines.push('═══ CHANGE DETECTION STATUS ═══');
    lines.push(`Total changes recorded: ${stats.totalChanges}`);
    lines.push(`Recent changes (last minute): ${stats.recentChanges}`);
    lines.push(`Entities with changes: ${stats.entitiesWithChanges}`);
    lines.push('');

    if (recent.length > 0) {
      lines.push('Recent significant changes:');
      for (const change of recent.slice(-5)) {
        const age = ((Date.now() - change.detectedAt) / 1000).toFixed(1);
        lines.push(`  - ${change.description} (${age}s ago, significance: ${(change.significance * 100).toFixed(0)}%)`);
      }
    } else {
      lines.push('No recent significant changes detected.');
    }

    return lines.join('\n');
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.entityStats.clear();
    this.changeHistory = [];
    this.nextChangeId = 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const detectors = new Map<string, ChangeDetector>();

/**
 * Get or create a change detector for a device.
 */
export function getChangeDetector(
  deviceId: string,
  config?: Partial<ChangeDetectorConfig>
): ChangeDetector {
  let detector = detectors.get(deviceId);
  if (!detector) {
    detector = new ChangeDetector(config);
    detectors.set(deviceId, detector);
  }
  return detector;
}

/**
 * Clear change detector for a device.
 */
export function clearChangeDetector(deviceId: string): void {
  detectors.delete(deviceId);
}

export default ChangeDetector;
