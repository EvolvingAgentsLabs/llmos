/**
 * Uncertainty Reasoner
 *
 * Manages and reasons about uncertainty in the world model.
 * This addresses the key challenge: knowing what you DON'T know is as
 * important as knowing what you DO know for intelligent behavior.
 *
 * Key Features:
 * - Multi-source uncertainty fusion (combining confidence from different sensors)
 * - Trust calibration (learning sensor reliability over time)
 * - Epistemic vs aleatoric uncertainty separation
 * - Uncertainty propagation through predictions
 * - Decision-making under uncertainty
 *
 * Philosophy: "It's not enough to have a belief; you must know how much to trust it."
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UncertaintyEstimate {
  /** Point estimate (most likely value) */
  pointEstimate: number;

  /** Uncertainty (standard deviation or equivalent) */
  uncertainty: number;

  /** Lower bound of confidence interval */
  lowerBound: number;

  /** Upper bound of confidence interval */
  upperBound: number;

  /** Confidence level (e.g., 0.95 for 95% CI) */
  confidenceLevel: number;

  /** Type of uncertainty */
  uncertaintyType: UncertaintyType;

  /** Sources contributing to this estimate */
  sources: string[];
}

export type UncertaintyType =
  | 'epistemic'    // Due to lack of knowledge (can be reduced with more data)
  | 'aleatoric'    // Due to inherent randomness (cannot be reduced)
  | 'combined';    // Mixture of both

export interface SourceTrust {
  /** Source identifier */
  sourceId: string;

  /** Current trust level (0-1) */
  trustLevel: number;

  /** Reliability history */
  reliability: number;

  /** Number of observations */
  observationCount: number;

  /** Average prediction error */
  meanError: number;

  /** Error variance */
  errorVariance: number;

  /** Last calibration timestamp */
  lastCalibrated: number;

  /** Bias estimate (systematic error) */
  biasEstimate: number;

  /** Is this source currently trusted? */
  isTrusted: boolean;
}

export interface BeliefState {
  /** Entity or property this belief is about */
  target: string;

  /** Belief distribution (mean, variance) */
  distribution: {
    mean: number;
    variance: number;
  };

  /** Confidence in this belief (0-1) */
  confidence: number;

  /** How stale is this belief? (0 = fresh, 1 = very stale) */
  staleness: number;

  /** Contributing observations */
  observations: Array<{
    sourceId: string;
    value: number;
    uncertainty: number;
    timestamp: number;
  }>;

  /** Last update timestamp */
  lastUpdated: number;
}

export interface UncertaintyReasonerConfig {
  /** Default initial trust for new sources */
  defaultTrust: number;

  /** Trust learning rate */
  trustLearningRate: number;

  /** Minimum trust to consider a source reliable */
  minTrustThreshold: number;

  /** Maximum trust level */
  maxTrust: number;

  /** Staleness decay rate per second */
  stalenessDecayRate: number;

  /** Confidence interval level */
  confidenceIntervalLevel: number;

  /** Minimum observations for trust calibration */
  minObservationsForCalibration: number;

  /** Outlier threshold (z-score) */
  outlierThreshold: number;

  /** Enable automatic bias correction */
  enableBiasCorrection: boolean;

  /** Trust penalty for outliers */
  outlierTrustPenalty: number;
}

export const DEFAULT_UNCERTAINTY_CONFIG: UncertaintyReasonerConfig = {
  defaultTrust: 0.7,
  trustLearningRate: 0.1,
  minTrustThreshold: 0.3,
  maxTrust: 0.99,
  stalenessDecayRate: 0.1,
  confidenceIntervalLevel: 0.95,
  minObservationsForCalibration: 10,
  outlierThreshold: 3.0,
  enableBiasCorrection: true,
  outlierTrustPenalty: 0.05,
};

export interface FusionResult {
  /** Fused estimate */
  estimate: UncertaintyEstimate;

  /** Weight given to each source */
  sourceWeights: Map<string, number>;

  /** Conflict detected between sources */
  hasConflict: boolean;

  /** Conflict score (0 = no conflict, 1 = severe conflict) */
  conflictScore: number;

  /** Sources that were excluded (outliers) */
  excludedSources: string[];
}

export interface DecisionUnderUncertainty {
  /** Action being considered */
  action: string;

  /** Expected outcome */
  expectedOutcome: number;

  /** Outcome uncertainty */
  outcomeUncertainty: number;

  /** Probability of success/positive outcome */
  successProbability: number;

  /** Risk-adjusted value */
  riskAdjustedValue: number;

  /** Recommendation */
  recommendation: 'proceed' | 'proceed_with_caution' | 'gather_more_info' | 'avoid';

  /** Explanation */
  explanation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNCERTAINTY REASONER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class UncertaintyReasoner {
  private config: UncertaintyReasonerConfig;
  private sourceTrust: Map<string, SourceTrust> = new Map();
  private beliefs: Map<string, BeliefState> = new Map();
  private groundTruth: Map<string, Array<{ value: number; timestamp: number }>> = new Map();

  constructor(config: Partial<UncertaintyReasonerConfig> = {}) {
    this.config = { ...DEFAULT_UNCERTAINTY_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE TRUST MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new information source.
   */
  registerSource(
    sourceId: string,
    initialTrust: number = this.config.defaultTrust
  ): SourceTrust {
    const trust: SourceTrust = {
      sourceId,
      trustLevel: Math.min(initialTrust, this.config.maxTrust),
      reliability: 1.0,
      observationCount: 0,
      meanError: 0,
      errorVariance: 0.01,
      lastCalibrated: Date.now(),
      biasEstimate: 0,
      isTrusted: initialTrust >= this.config.minTrustThreshold,
    };

    this.sourceTrust.set(sourceId, trust);
    return trust;
  }

  /**
   * Get trust information for a source.
   */
  getSourceTrust(sourceId: string): SourceTrust | null {
    return this.sourceTrust.get(sourceId) || null;
  }

  /**
   * Update source trust based on observation accuracy.
   */
  updateSourceTrust(
    sourceId: string,
    observedValue: number,
    actualValue: number,
    expectedUncertainty: number
  ): void {
    let trust = this.sourceTrust.get(sourceId);
    if (!trust) {
      trust = this.registerSource(sourceId);
    }

    const error = observedValue - actualValue;
    const normalizedError = Math.abs(error) / (expectedUncertainty + 0.001);

    // Update running statistics
    trust.observationCount++;
    const alpha = 1 / Math.min(trust.observationCount, 100);
    trust.meanError = (1 - alpha) * trust.meanError + alpha * error;
    trust.errorVariance = (1 - alpha) * trust.errorVariance + alpha * Math.pow(error - trust.meanError, 2);

    // Update bias estimate
    if (this.config.enableBiasCorrection) {
      trust.biasEstimate = trust.meanError;
    }

    // Calculate reliability based on how often predictions are within expected uncertainty
    const withinExpected = normalizedError <= 1.0;
    trust.reliability = (1 - alpha) * trust.reliability + alpha * (withinExpected ? 1 : 0);

    // Update trust level
    if (normalizedError > this.config.outlierThreshold) {
      // Penalize for outliers
      trust.trustLevel = Math.max(0, trust.trustLevel - this.config.outlierTrustPenalty);
    } else {
      // Gradual adjustment toward reliability
      const targetTrust = trust.reliability * this.config.maxTrust;
      trust.trustLevel = trust.trustLevel +
        this.config.trustLearningRate * (targetTrust - trust.trustLevel);
    }

    trust.trustLevel = Math.max(0, Math.min(this.config.maxTrust, trust.trustLevel));
    trust.isTrusted = trust.trustLevel >= this.config.minTrustThreshold;
    trust.lastCalibrated = Date.now();
  }

  /**
   * Calibrate source trust using ground truth data.
   */
  calibrateSources(
    target: string,
    groundTruthValue: number,
    observations: Array<{ sourceId: string; value: number; uncertainty: number }>
  ): void {
    // Store ground truth
    let truths = this.groundTruth.get(target);
    if (!truths) {
      truths = [];
      this.groundTruth.set(target, truths);
    }
    truths.push({ value: groundTruthValue, timestamp: Date.now() });
    if (truths.length > 100) truths.shift();

    // Update each source
    for (const obs of observations) {
      this.updateSourceTrust(obs.sourceId, obs.value, groundTruthValue, obs.uncertainty);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BELIEF MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update a belief with a new observation.
   */
  updateBelief(
    target: string,
    sourceId: string,
    observedValue: number,
    observedUncertainty: number,
    timestamp: number = Date.now()
  ): BeliefState {
    const trust = this.sourceTrust.get(sourceId) || this.registerSource(sourceId);
    let belief = this.beliefs.get(target);

    // Apply bias correction
    const correctedValue = this.config.enableBiasCorrection
      ? observedValue - trust.biasEstimate
      : observedValue;

    // Adjust uncertainty based on trust
    const adjustedUncertainty = observedUncertainty / Math.sqrt(trust.trustLevel + 0.01);

    if (!belief) {
      // Initialize new belief
      belief = {
        target,
        distribution: {
          mean: correctedValue,
          variance: adjustedUncertainty * adjustedUncertainty,
        },
        confidence: trust.trustLevel,
        staleness: 0,
        observations: [],
        lastUpdated: timestamp,
      };
    } else {
      // Bayesian update (simplified)
      const priorVar = belief.distribution.variance;
      const obsVar = adjustedUncertainty * adjustedUncertainty;

      // Kalman gain
      const k = priorVar / (priorVar + obsVar);

      // Update mean and variance
      belief.distribution.mean = belief.distribution.mean + k * (correctedValue - belief.distribution.mean);
      belief.distribution.variance = (1 - k) * priorVar;

      // Update confidence
      belief.confidence = Math.min(
        0.99,
        belief.confidence + trust.trustLevel * (1 - belief.confidence) * 0.1
      );

      // Reset staleness
      belief.staleness = 0;
      belief.lastUpdated = timestamp;
    }

    // Store observation
    belief.observations.push({
      sourceId,
      value: correctedValue,
      uncertainty: adjustedUncertainty,
      timestamp,
    });

    // Keep only recent observations
    const cutoff = timestamp - 60000;
    belief.observations = belief.observations.filter(o => o.timestamp > cutoff);

    this.beliefs.set(target, belief);
    return belief;
  }

  /**
   * Get current belief about a target.
   */
  getBelief(target: string): BeliefState | null {
    return this.beliefs.get(target) || null;
  }

  /**
   * Decay beliefs based on time (increase staleness).
   */
  decayBeliefs(currentTime: number = Date.now()): void {
    for (const belief of this.beliefs.values()) {
      const timeSinceUpdate = (currentTime - belief.lastUpdated) / 1000;
      belief.staleness = Math.min(1, belief.staleness + this.config.stalenessDecayRate * timeSinceUpdate);
      belief.confidence *= Math.pow(0.99, timeSinceUpdate);
      belief.distribution.variance *= (1 + timeSinceUpdate * 0.01);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-SOURCE FUSION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fuse observations from multiple sources into a single estimate.
   */
  fuseObservations(
    observations: Array<{
      sourceId: string;
      value: number;
      uncertainty: number;
    }>
  ): FusionResult {
    if (observations.length === 0) {
      throw new Error('No observations to fuse');
    }

    if (observations.length === 1) {
      const obs = observations[0];
      const trust = this.sourceTrust.get(obs.sourceId);
      return {
        estimate: this.createUncertaintyEstimate(obs.value, obs.uncertainty),
        sourceWeights: new Map([[obs.sourceId, 1.0]]),
        hasConflict: false,
        conflictScore: 0,
        excludedSources: [],
      };
    }

    // Calculate weights based on trust and uncertainty
    const weightedObs: Array<{
      sourceId: string;
      value: number;
      weight: number;
      isOutlier: boolean;
    }> = [];

    for (const obs of observations) {
      const trust = this.sourceTrust.get(obs.sourceId) || this.registerSource(obs.sourceId);
      const weight = trust.trustLevel / (obs.uncertainty * obs.uncertainty + 0.001);
      weightedObs.push({
        sourceId: obs.sourceId,
        value: obs.value,
        weight,
        isOutlier: false,
      });
    }

    // Detect outliers using median absolute deviation
    const values = weightedObs.map(o => o.value);
    const median = this.calculateMedian(values);
    const mad = this.calculateMAD(values);

    for (const obs of weightedObs) {
      const deviation = Math.abs(obs.value - median) / (mad + 0.001);
      obs.isOutlier = deviation > this.config.outlierThreshold;
    }

    const validObs = weightedObs.filter(o => !o.isOutlier);
    const excludedSources = weightedObs.filter(o => o.isOutlier).map(o => o.sourceId);

    // Calculate conflict score
    const conflictScore = this.calculateConflict(observations);

    // Weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    let weightedVariance = 0;

    for (const obs of validObs) {
      weightedSum += obs.weight * obs.value;
      totalWeight += obs.weight;
    }

    const fusedMean = totalWeight > 0 ? weightedSum / totalWeight : median;

    // Calculate fused uncertainty
    for (const obs of validObs) {
      const origObs = observations.find(o => o.sourceId === obs.sourceId)!;
      weightedVariance += obs.weight * (origObs.uncertainty * origObs.uncertainty + Math.pow(obs.value - fusedMean, 2));
    }

    const fusedVariance = totalWeight > 0 ? weightedVariance / totalWeight : mad * mad;
    const fusedUncertainty = Math.sqrt(fusedVariance);

    // Build source weights map
    const sourceWeights = new Map<string, number>();
    for (const obs of validObs) {
      sourceWeights.set(obs.sourceId, obs.weight / totalWeight);
    }

    return {
      estimate: this.createUncertaintyEstimate(fusedMean, fusedUncertainty),
      sourceWeights,
      hasConflict: conflictScore > 0.5,
      conflictScore,
      excludedSources,
    };
  }

  /**
   * Calculate conflict between sources.
   */
  private calculateConflict(
    observations: Array<{ sourceId: string; value: number; uncertainty: number }>
  ): number {
    if (observations.length < 2) return 0;

    let maxConflict = 0;

    for (let i = 0; i < observations.length; i++) {
      for (let j = i + 1; j < observations.length; j++) {
        const obs1 = observations[i];
        const obs2 = observations[j];

        const diff = Math.abs(obs1.value - obs2.value);
        const combinedUncertainty = Math.sqrt(
          obs1.uncertainty * obs1.uncertainty + obs2.uncertainty * obs2.uncertainty
        );

        // Conflict if observations are more than 2 sigma apart
        const conflict = diff / (combinedUncertainty * 2 + 0.001);
        maxConflict = Math.max(maxConflict, Math.min(1, conflict - 1));
      }
    }

    return maxConflict;
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
    relevantBeliefs: string[],
    successCondition: (beliefs: Map<string, BeliefState>) => { probability: number; uncertainty: number }
  ): DecisionUnderUncertainty {
    const beliefs = new Map<string, BeliefState>();
    for (const target of relevantBeliefs) {
      const belief = this.beliefs.get(target);
      if (belief) beliefs.set(target, belief);
    }

    const { probability: successProb, uncertainty: probUncertainty } = successCondition(beliefs);

    // Expected value calculation
    const expectedOutcome = successProb * successValue + (1 - successProb) * failureValue;

    // Risk-adjusted value (penalize high uncertainty)
    const riskPenalty = probUncertainty * Math.abs(successValue - failureValue);
    const riskAdjustedValue = expectedOutcome - riskPenalty;

    // Determine recommendation
    let recommendation: DecisionUnderUncertainty['recommendation'];
    let explanation: string;

    if (probUncertainty > 0.3) {
      recommendation = 'gather_more_info';
      explanation = `High uncertainty (${(probUncertainty * 100).toFixed(0)}%) - recommend gathering more information before proceeding`;
    } else if (successProb >= 0.8 && riskAdjustedValue > 0) {
      recommendation = 'proceed';
      explanation = `High success probability (${(successProb * 100).toFixed(0)}%) with positive expected value`;
    } else if (successProb >= 0.5 && riskAdjustedValue > failureValue) {
      recommendation = 'proceed_with_caution';
      explanation = `Moderate success probability (${(successProb * 100).toFixed(0)}%) - proceed with monitoring`;
    } else {
      recommendation = 'avoid';
      explanation = `Low success probability (${(successProb * 100).toFixed(0)}%) or poor risk-adjusted value`;
    }

    return {
      action,
      expectedOutcome,
      outcomeUncertainty: probUncertainty * Math.abs(successValue - failureValue),
      successProbability: successProb,
      riskAdjustedValue,
      recommendation,
      explanation,
    };
  }

  /**
   * Estimate probability that a value is within a range.
   */
  estimateProbabilityInRange(
    target: string,
    lowerBound: number,
    upperBound: number
  ): { probability: number; confidence: number } {
    const belief = this.beliefs.get(target);
    if (!belief) {
      return { probability: 0.5, confidence: 0 };
    }

    const mean = belief.distribution.mean;
    const stdDev = Math.sqrt(belief.distribution.variance);

    // Normal CDF approximation
    const zLower = (lowerBound - mean) / stdDev;
    const zUpper = (upperBound - mean) / stdDev;

    const cdfLower = this.normalCDF(zLower);
    const cdfUpper = this.normalCDF(zUpper);

    return {
      probability: cdfUpper - cdfLower,
      confidence: belief.confidence * (1 - belief.staleness),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNCERTAINTY ESTIMATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create an uncertainty estimate with confidence intervals.
   */
  private createUncertaintyEstimate(
    mean: number,
    stdDev: number,
    type: UncertaintyType = 'combined'
  ): UncertaintyEstimate {
    // Z-score for confidence level (e.g., 1.96 for 95%)
    const z = this.getZScore(this.config.confidenceIntervalLevel);

    return {
      pointEstimate: mean,
      uncertainty: stdDev,
      lowerBound: mean - z * stdDev,
      upperBound: mean + z * stdDev,
      confidenceLevel: this.config.confidenceIntervalLevel,
      uncertaintyType: type,
      sources: [],
    };
  }

  /**
   * Propagate uncertainty through a function.
   * Uses first-order Taylor approximation.
   */
  propagateUncertainty(
    inputs: Array<{ mean: number; variance: number }>,
    partialDerivatives: number[]
  ): { mean: number; variance: number } {
    if (inputs.length !== partialDerivatives.length) {
      throw new Error('Inputs and derivatives must have same length');
    }

    // This calculates the propagated variance using:
    // Var(f) ≈ Σ (∂f/∂xi)² * Var(xi)
    let propagatedVariance = 0;
    for (let i = 0; i < inputs.length; i++) {
      propagatedVariance += Math.pow(partialDerivatives[i], 2) * inputs[i].variance;
    }

    // Mean requires knowing the function - caller should calculate
    // This returns only the variance propagation
    return {
      mean: 0, // Placeholder - caller must calculate actual mean
      variance: propagatedVariance,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateMAD(values: number[]): number {
    const median = this.calculateMedian(values);
    const deviations = values.map(v => Math.abs(v - median));
    return this.calculateMedian(deviations);
  }

  private normalCDF(z: number): number {
    // Approximation of standard normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  private getZScore(confidenceLevel: number): number {
    // Common z-scores for confidence levels
    if (confidenceLevel >= 0.99) return 2.576;
    if (confidenceLevel >= 0.95) return 1.960;
    if (confidenceLevel >= 0.90) return 1.645;
    if (confidenceLevel >= 0.80) return 1.282;
    return 1.0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY AND REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all source trust levels.
   */
  getAllSourceTrust(): Map<string, SourceTrust> {
    return new Map(this.sourceTrust);
  }

  /**
   * Get statistics about uncertainty in the system.
   */
  getStats(): {
    numSources: number;
    numBeliefs: number;
    averageTrust: number;
    averageConfidence: number;
    averageStaleness: number;
    untrustedSources: string[];
  } {
    const sources = Array.from(this.sourceTrust.values());
    const beliefs = Array.from(this.beliefs.values());

    const avgTrust = sources.length > 0
      ? sources.reduce((sum, s) => sum + s.trustLevel, 0) / sources.length
      : 0;

    const avgConfidence = beliefs.length > 0
      ? beliefs.reduce((sum, b) => sum + b.confidence, 0) / beliefs.length
      : 0;

    const avgStaleness = beliefs.length > 0
      ? beliefs.reduce((sum, b) => sum + b.staleness, 0) / beliefs.length
      : 0;

    const untrusted = sources
      .filter(s => !s.isTrusted)
      .map(s => s.sourceId);

    return {
      numSources: sources.length,
      numBeliefs: beliefs.length,
      averageTrust: avgTrust,
      averageConfidence: avgConfidence,
      averageStaleness: avgStaleness,
      untrustedSources: untrusted,
    };
  }

  /**
   * Generate a summary for LLM reasoning.
   */
  generateSummary(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('═══ UNCERTAINTY REASONING STATUS ═══');
    lines.push(`Sources: ${stats.numSources} (avg trust: ${(stats.averageTrust * 100).toFixed(1)}%)`);
    lines.push(`Beliefs: ${stats.numBeliefs} (avg confidence: ${(stats.averageConfidence * 100).toFixed(1)}%)`);
    lines.push(`Average staleness: ${(stats.averageStaleness * 100).toFixed(1)}%`);

    if (stats.untrustedSources.length > 0) {
      lines.push(`Untrusted sources: ${stats.untrustedSources.join(', ')}`);
    }

    lines.push('');
    lines.push('Source Trust Levels:');
    for (const [sourceId, trust] of this.sourceTrust) {
      const status = trust.isTrusted ? '✓' : '✗';
      lines.push(`  ${status} ${sourceId}: ${(trust.trustLevel * 100).toFixed(1)}% (reliability: ${(trust.reliability * 100).toFixed(1)}%)`);
    }

    if (this.beliefs.size > 0) {
      lines.push('');
      lines.push('Key Beliefs:');
      const sortedBeliefs = Array.from(this.beliefs.entries())
        .sort((a, b) => b[1].confidence - a[1].confidence)
        .slice(0, 5);

      for (const [target, belief] of sortedBeliefs) {
        const stdDev = Math.sqrt(belief.distribution.variance);
        lines.push(`  ${target}: ${belief.distribution.mean.toFixed(3)} ± ${stdDev.toFixed(3)} (conf: ${(belief.confidence * 100).toFixed(0)}%)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.sourceTrust.clear();
    this.beliefs.clear();
    this.groundTruth.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const reasoners = new Map<string, UncertaintyReasoner>();

/**
 * Get or create an uncertainty reasoner for a device.
 */
export function getUncertaintyReasoner(
  deviceId: string,
  config?: Partial<UncertaintyReasonerConfig>
): UncertaintyReasoner {
  let reasoner = reasoners.get(deviceId);
  if (!reasoner) {
    reasoner = new UncertaintyReasoner(config);
    reasoners.set(deviceId, reasoner);
  }
  return reasoner;
}

/**
 * Clear uncertainty reasoner for a device.
 */
export function clearUncertaintyReasoner(deviceId: string): void {
  reasoners.delete(deviceId);
}

export default UncertaintyReasoner;
