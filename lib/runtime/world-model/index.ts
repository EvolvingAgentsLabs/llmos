/**
 * AI World Model System
 *
 * A comprehensive system for building internal world models from partial reality.
 * This bridges robotics, medicine, and cognition by providing the cognitive
 * infrastructure for AI agents to:
 *
 * - Incrementally build persistent world models
 * - Update them over time with temporal consistency
 * - Detect meaningful change (not just what they see)
 * - Reason about uncertainty and trust
 * - Handle sparse, irregular observations
 *
 * Philosophy: "An AI that knows when something is different, not just what it sees."
 *
 * Core Components:
 *
 * 1. **Temporal Coherence Engine** - Maintains consistency across observations
 *    - Observation history with temporal indexing
 *    - Prediction of unobserved states
 *    - Temporal smoothing and anomaly detection
 *
 * 2. **Object Identity Tracker** - Persistent object identities across time
 *    - Multi-hypothesis tracking
 *    - Re-identification after occlusion
 *    - Track lifecycle management (birth/death)
 *
 * 3. **Change Detector** - Distinguishes drift from real change
 *    - Statistical significance testing
 *    - Drift compensation
 *    - Change importance scoring
 *
 * 4. **Uncertainty Reasoner** - Trust calibration and belief management
 *    - Multi-source fusion
 *    - Source reliability tracking
 *    - Decision support under uncertainty
 *
 * 5. **Sparse Update Handler** - Handles irregular observations
 *    - Interpolation and extrapolation
 *    - Adaptive scheduling
 *    - Priority-based updates
 *
 * 6. **Cognitive World Model** - Unified integration layer
 *    - Combines all subsystems
 *    - Provides cognitive analysis for LLM reasoning
 *    - Supports decision-making
 *
 * Applications:
 * - Medical imaging (longitudinal change detection)
 * - Surgery navigation
 * - Rehabilitation monitoring
 * - Environment sensing
 * - Robotics and autonomous systems
 *
 * Hard Problems Addressed:
 * - Temporal coherence
 * - Object identity across time
 * - Drift vs real change
 * - Sparse updates
 * - Trust calibration
 *
 * Basic Usage:
 * ```typescript
 * import { getCognitiveWorldModel } from '@/lib/runtime/world-model';
 *
 * const worldModel = getCognitiveWorldModel('robot-1');
 * worldModel.start();
 *
 * // Process observations
 * const result = worldModel.processObservation({
 *   entityId: 'obstacle-1',
 *   position: { x: 1.5, y: 0, z: 2.3 },
 *   positionUncertainty: 0.05,
 *   label: 'box',
 *   category: 'obstacle',
 *   confidence: 0.9,
 *   source: 'camera_vision',
 *   timestamp: Date.now(),
 * });
 *
 * // Check for changes
 * console.log('Changes:', result.changes);
 * console.log('Anomalies:', result.anomalies);
 *
 * // Get world state
 * const state = worldModel.getWorldState();
 * console.log('Entities:', state.entities.size);
 * console.log('Model confidence:', state.modelConfidence);
 *
 * // Generate analysis for LLM
 * const analysis = worldModel.generateCognitiveAnalysis();
 * console.log(analysis);
 *
 * // Stop when done
 * worldModel.stop();
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COGNITIVE WORLD MODEL
// ═══════════════════════════════════════════════════════════════════════════

export {
  CognitiveWorldModel,
  getCognitiveWorldModel,
  clearCognitiveWorldModel,
  clearAllCognitiveWorldModels,
  type WorldModelState,
  type EntityState,
  type WorldModelObservation,
  type CognitiveWorldModelConfig,
  DEFAULT_COGNITIVE_CONFIG,
} from './cognitive-world-model';

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL COHERENCE
// ═══════════════════════════════════════════════════════════════════════════

export {
  TemporalCoherenceEngine,
  getTemporalEngine,
  clearTemporalEngine,
  type TemporalObservation,
  type TemporalState,
  type TemporalCoherenceConfig,
  type TemporalAnomaly,
  type AnomalyType,
  type ObservationSource,
  type PositionState,
  type Position3D,
  type Velocity3D,
  DEFAULT_TEMPORAL_CONFIG,
} from './temporal-coherence';

// ═══════════════════════════════════════════════════════════════════════════
// OBJECT IDENTITY TRACKING
// ═══════════════════════════════════════════════════════════════════════════

export {
  ObjectIdentityTracker,
  getObjectTracker,
  clearObjectTracker,
  type ObjectFeatures,
  type ObjectTrack,
  type TrackState,
  type ObjectObservation as TrackerObjectObservation,
  type TrackingConfig,
  type AssociationResult,
  type TrackingEvent,
  type TrackingEventType,
  DEFAULT_TRACKING_CONFIG,
} from './object-identity-tracker';

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export {
  ChangeDetector,
  getChangeDetector,
  clearChangeDetector,
  type ChangeEvent,
  type ChangeType,
  type ChangeCategory,
  type ChangeContext,
  type DriftType,
  type DriftAnalysis,
  type ChangeDetectorConfig,
  DEFAULT_CHANGE_DETECTOR_CONFIG,
} from './change-detector';

// ═══════════════════════════════════════════════════════════════════════════
// UNCERTAINTY REASONING
// ═══════════════════════════════════════════════════════════════════════════

export {
  UncertaintyReasoner,
  getUncertaintyReasoner,
  clearUncertaintyReasoner,
  type UncertaintyEstimate,
  type UncertaintyType,
  type SourceTrust,
  type BeliefState,
  type UncertaintyReasonerConfig,
  type FusionResult,
  type DecisionUnderUncertainty,
  DEFAULT_UNCERTAINTY_CONFIG,
} from './uncertainty-reasoner';

// ═══════════════════════════════════════════════════════════════════════════
// SPARSE UPDATE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export {
  SparseUpdateHandler,
  getSparseUpdateHandler,
  clearSparseUpdateHandler,
  type SparseObservation,
  type InterpolatedState,
  type InterpolationMethod,
  type EntityObservationPattern,
  type UpdatePriority,
  type PriorityReason,
  type SparseUpdateConfig,
  DEFAULT_SPARSE_UPDATE_CONFIG,
} from './sparse-update-handler';
