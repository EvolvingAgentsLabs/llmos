/**
 * Object Identity Tracker
 *
 * Maintains persistent object identities across partial observations.
 * This addresses the key challenge: when a robot sees an object, loses sight of it,
 * and sees it again - is it the SAME object or a different one?
 *
 * Key Features:
 * - Multi-hypothesis tracking (multiple possible object identities)
 * - Re-identification using position, appearance, and motion continuity
 * - Handling occlusion (temporary invisibility)
 * - Object birth/death detection
 * - Merge detection (two tracks that are actually one object)
 *
 * Philosophy: Objects persist even when unobserved. The system maintains
 * belief over which observations correspond to which persistent entities.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ObjectFeatures {
  /** Semantic label (e.g., "chair", "robot", "collectible") */
  label: string;

  /** Category (furniture, obstacle, etc.) */
  category: string;

  /** Estimated size/dimensions */
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };

  /** Color features (if available) */
  color?: {
    primary: string;
    secondary?: string;
    brightness: number;
  };

  /** Shape features (simple descriptors) */
  shape?: string;

  /** Custom attributes */
  attributes: Record<string, string | number | boolean>;
}

export interface ObjectTrack {
  /** Unique track ID (persistent identity) */
  trackId: string;

  /** Current best position estimate */
  position: { x: number; y: number; z: number };

  /** Position uncertainty (covariance-like) */
  positionUncertainty: number;

  /** Velocity estimate */
  velocity: { vx: number; vy: number; vz: number };

  /** Object features */
  features: ObjectFeatures;

  /** Feature confidence (how sure we are about the features) */
  featureConfidence: number;

  /** Track state */
  state: TrackState;

  /** Number of times this track was matched to an observation */
  matchCount: number;

  /** Number of consecutive missed observations */
  missedCount: number;

  /** Track creation time */
  createdAt: number;

  /** Last observation time */
  lastSeenAt: number;

  /** Track confidence (overall belief this is a real object) */
  confidence: number;

  /** Is this track currently being actively observed? */
  isActive: boolean;

  /** History of positions */
  positionHistory: Array<{
    position: { x: number; y: number; z: number };
    timestamp: number;
  }>;
}

export type TrackState =
  | 'tentative'   // New track, not yet confirmed
  | 'confirmed'   // Confirmed track (multiple matches)
  | 'occluded'    // Temporarily not visible
  | 'lost'        // Haven't seen in a while
  | 'deleted';    // Track is dead

export interface ObjectObservation {
  /** Observation ID */
  observationId: string;

  /** Position in world coordinates */
  position: { x: number; y: number; z: number };

  /** Position measurement uncertainty */
  positionUncertainty: number;

  /** Observed features */
  features: ObjectFeatures;

  /** Detection confidence */
  confidence: number;

  /** Timestamp */
  timestamp: number;

  /** Source sensor */
  source: string;
}

export interface TrackingConfig {
  /** Distance threshold for matching (meters) */
  matchDistanceThreshold: number;

  /** Feature similarity threshold (0-1) */
  featureSimilarityThreshold: number;

  /** Gating threshold (Mahalanobis distance) */
  gatingThreshold: number;

  /** Observations needed to confirm a track */
  confirmationThreshold: number;

  /** Missed observations before track is lost */
  missedThreshold: number;

  /** Missed observations before track is deleted */
  deletionThreshold: number;

  /** Track confidence decay rate per second */
  confidenceDecayRate: number;

  /** Maximum tracks to maintain */
  maxTracks: number;

  /** Enable re-identification of lost tracks */
  enableReidentification: boolean;

  /** Re-identification distance threshold */
  reidentificationThreshold: number;

  /** Position history length */
  positionHistoryLength: number;
}

export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  matchDistanceThreshold: 0.5,        // 50cm
  featureSimilarityThreshold: 0.6,
  gatingThreshold: 3.0,               // 3 standard deviations
  confirmationThreshold: 3,           // 3 matches to confirm
  missedThreshold: 10,                // 10 missed before lost
  deletionThreshold: 30,              // 30 missed before delete
  confidenceDecayRate: 0.05,          // 5% per second
  maxTracks: 100,
  enableReidentification: true,
  reidentificationThreshold: 1.0,     // 1 meter
  positionHistoryLength: 50,
};

export interface AssociationResult {
  /** Track ID that was matched */
  trackId: string;

  /** Observation that matched */
  observationId: string;

  /** Association score (higher = better match) */
  score: number;

  /** Distance between prediction and observation */
  distance: number;

  /** Feature similarity */
  featureSimilarity: number;
}

export interface TrackingEvent {
  type: TrackingEventType;
  timestamp: number;
  trackId: string;
  details: Record<string, unknown>;
}

export type TrackingEventType =
  | 'track_created'
  | 'track_confirmed'
  | 'track_occluded'
  | 'track_lost'
  | 'track_deleted'
  | 'track_reidentified'
  | 'tracks_merged'
  | 'observation_matched'
  | 'observation_unmatched';

// ═══════════════════════════════════════════════════════════════════════════
// OBJECT IDENTITY TRACKER
// ═══════════════════════════════════════════════════════════════════════════

export class ObjectIdentityTracker {
  private config: TrackingConfig;
  private tracks: Map<string, ObjectTrack> = new Map();
  private nextTrackId: number = 1;
  private events: TrackingEvent[] = [];
  private lostTracks: Map<string, ObjectTrack> = new Map(); // For re-identification

  constructor(config: Partial<TrackingConfig> = {}) {
    this.config = { ...DEFAULT_TRACKING_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN TRACKING LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a set of observations and update tracks.
   * This is the main entry point - call it each sensor frame.
   */
  update(observations: ObjectObservation[]): {
    associations: AssociationResult[];
    newTracks: string[];
    lostTracks: string[];
    events: TrackingEvent[];
  } {
    const timestamp = observations.length > 0 ? observations[0].timestamp : Date.now();
    const frameEvents: TrackingEvent[] = [];
    const newTracks: string[] = [];
    const lostTrackIds: string[] = [];

    // 1. Predict all track positions forward
    this.predictTracks(timestamp);

    // 2. Associate observations to tracks
    const { matched, unmatchedObservations, unmatchedTracks } =
      this.associateObservationsToTracks(observations);

    // 3. Update matched tracks
    for (const association of matched) {
      const track = this.tracks.get(association.trackId)!;
      const observation = observations.find(o => o.observationId === association.observationId)!;
      this.updateTrackWithObservation(track, observation);

      frameEvents.push({
        type: 'observation_matched',
        timestamp,
        trackId: track.trackId,
        details: {
          observationId: observation.observationId,
          score: association.score,
        },
      });
    }

    // 4. Handle unmatched observations (create new tracks or re-identify)
    for (const observation of unmatchedObservations) {
      // Try re-identification first
      const reidentifiedTrack = this.config.enableReidentification
        ? this.tryReidentify(observation)
        : null;

      if (reidentifiedTrack) {
        this.updateTrackWithObservation(reidentifiedTrack, observation);
        this.lostTracks.delete(reidentifiedTrack.trackId);
        this.tracks.set(reidentifiedTrack.trackId, reidentifiedTrack);

        frameEvents.push({
          type: 'track_reidentified',
          timestamp,
          trackId: reidentifiedTrack.trackId,
          details: { observation: observation.observationId },
        });
      } else {
        // Create new track
        const newTrack = this.createTrack(observation);
        this.tracks.set(newTrack.trackId, newTrack);
        newTracks.push(newTrack.trackId);

        frameEvents.push({
          type: 'track_created',
          timestamp,
          trackId: newTrack.trackId,
          details: { observation: observation.observationId },
        });
      }
    }

    // 5. Handle unmatched tracks (increment missed count)
    for (const trackId of unmatchedTracks) {
      const track = this.tracks.get(trackId)!;
      track.missedCount++;
      track.isActive = false;

      // Update track state based on missed count
      if (track.missedCount >= this.config.deletionThreshold) {
        track.state = 'deleted';
        this.tracks.delete(trackId);
        this.lostTracks.delete(trackId); // Clean up from lost tracks too

        frameEvents.push({
          type: 'track_deleted',
          timestamp,
          trackId,
          details: { missedCount: track.missedCount },
        });
      } else if (track.missedCount >= this.config.missedThreshold) {
        if (track.state !== 'lost') {
          track.state = 'lost';
          // Move to lost tracks for potential re-identification
          this.lostTracks.set(trackId, track);
          lostTrackIds.push(trackId);

          frameEvents.push({
            type: 'track_lost',
            timestamp,
            trackId,
            details: { missedCount: track.missedCount },
          });
        }
      } else if (track.state === 'confirmed') {
        track.state = 'occluded';

        frameEvents.push({
          type: 'track_occluded',
          timestamp,
          trackId,
          details: { missedCount: track.missedCount },
        });
      }
    }

    // 6. Check for track merges (two tracks that are actually one object)
    this.checkForMerges(timestamp, frameEvents);

    // 7. Decay confidence for all tracks
    this.decayConfidence(timestamp);

    // Store events
    this.events.push(...frameEvents);
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500);
    }

    return {
      associations: matched,
      newTracks,
      lostTracks: lostTrackIds,
      events: frameEvents,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PREDICTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Predict track positions forward in time using velocity model.
   */
  private predictTracks(currentTime: number): void {
    for (const track of this.tracks.values()) {
      if (track.state === 'deleted') continue;

      const dt = (currentTime - track.lastSeenAt) / 1000; // seconds
      if (dt > 0 && track.isActive) {
        // Only predict if we have velocity and track is active
        track.position.x += track.velocity.vx * dt;
        track.position.y += track.velocity.vy * dt;
        track.position.z += track.velocity.vz * dt;

        // Increase uncertainty over time
        track.positionUncertainty += dt * 0.1; // 10cm/s uncertainty growth
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSOCIATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Associate observations to tracks using Hungarian algorithm style matching.
   */
  private associateObservationsToTracks(observations: ObjectObservation[]): {
    matched: AssociationResult[];
    unmatchedObservations: ObjectObservation[];
    unmatchedTracks: string[];
  } {
    const activeTracks = Array.from(this.tracks.values()).filter(
      t => t.state !== 'deleted' && t.state !== 'lost'
    );

    if (activeTracks.length === 0 || observations.length === 0) {
      return {
        matched: [],
        unmatchedObservations: observations,
        unmatchedTracks: activeTracks.map(t => t.trackId),
      };
    }

    // Build cost matrix
    const costMatrix: number[][] = [];
    for (const track of activeTracks) {
      const row: number[] = [];
      for (const obs of observations) {
        const cost = this.calculateAssociationCost(track, obs);
        row.push(cost);
      }
      costMatrix.push(row);
    }

    // Greedy association (could be upgraded to Hungarian algorithm)
    const matched: AssociationResult[] = [];
    const matchedTracks = new Set<string>();
    const matchedObservations = new Set<string>();

    // Sort all possible associations by cost
    const associations: Array<{
      trackIdx: number;
      obsIdx: number;
      cost: number;
    }> = [];

    for (let ti = 0; ti < activeTracks.length; ti++) {
      for (let oi = 0; oi < observations.length; oi++) {
        if (costMatrix[ti][oi] < Infinity) {
          associations.push({ trackIdx: ti, obsIdx: oi, cost: costMatrix[ti][oi] });
        }
      }
    }

    associations.sort((a, b) => a.cost - b.cost);

    // Greedy matching
    for (const assoc of associations) {
      const track = activeTracks[assoc.trackIdx];
      const obs = observations[assoc.obsIdx];

      if (matchedTracks.has(track.trackId) || matchedObservations.has(obs.observationId)) {
        continue;
      }

      const distance = this.calculateDistance(track.position, obs.position);
      const featureSim = this.calculateFeatureSimilarity(track.features, obs.features);

      matched.push({
        trackId: track.trackId,
        observationId: obs.observationId,
        score: 1.0 / (1.0 + assoc.cost),
        distance,
        featureSimilarity: featureSim,
      });

      matchedTracks.add(track.trackId);
      matchedObservations.add(obs.observationId);
    }

    return {
      matched,
      unmatchedObservations: observations.filter(o => !matchedObservations.has(o.observationId)),
      unmatchedTracks: activeTracks
        .filter(t => !matchedTracks.has(t.trackId))
        .map(t => t.trackId),
    };
  }

  /**
   * Calculate association cost between a track and observation.
   * Lower cost = better match.
   */
  private calculateAssociationCost(track: ObjectTrack, observation: ObjectObservation): number {
    // Distance-based cost
    const distance = this.calculateDistance(track.position, observation.position);
    const gatedDistance = distance / (track.positionUncertainty + observation.positionUncertainty);

    // Gating: reject if too far
    if (gatedDistance > this.config.gatingThreshold) {
      return Infinity;
    }

    // Feature similarity
    const featureSim = this.calculateFeatureSimilarity(track.features, observation.features);
    if (featureSim < this.config.featureSimilarityThreshold) {
      return Infinity;
    }

    // Combined cost (weighted sum)
    const distanceCost = gatedDistance;
    const featureCost = 1.0 - featureSim;

    return distanceCost * 0.6 + featureCost * 0.4;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new track from an observation.
   */
  private createTrack(observation: ObjectObservation): ObjectTrack {
    const trackId = `track_${this.nextTrackId++}`;

    return {
      trackId,
      position: { ...observation.position },
      positionUncertainty: observation.positionUncertainty,
      velocity: { vx: 0, vy: 0, vz: 0 },
      features: { ...observation.features },
      featureConfidence: observation.confidence,
      state: 'tentative',
      matchCount: 1,
      missedCount: 0,
      createdAt: observation.timestamp,
      lastSeenAt: observation.timestamp,
      confidence: observation.confidence,
      isActive: true,
      positionHistory: [{
        position: { ...observation.position },
        timestamp: observation.timestamp,
      }],
    };
  }

  /**
   * Update a track with a new observation.
   */
  private updateTrackWithObservation(track: ObjectTrack, observation: ObjectObservation): void {
    // Update velocity estimate
    const dt = (observation.timestamp - track.lastSeenAt) / 1000;
    if (dt > 0 && dt < 10) { // Ignore very old or same-frame updates
      const alpha = 0.3; // Smoothing factor
      track.velocity.vx = alpha * (observation.position.x - track.position.x) / dt +
        (1 - alpha) * track.velocity.vx;
      track.velocity.vy = alpha * (observation.position.y - track.position.y) / dt +
        (1 - alpha) * track.velocity.vy;
      track.velocity.vz = alpha * (observation.position.z - track.position.z) / dt +
        (1 - alpha) * track.velocity.vz;
    }

    // Update position (Kalman-like update)
    const k = track.positionUncertainty /
      (track.positionUncertainty + observation.positionUncertainty);
    track.position.x = track.position.x + k * (observation.position.x - track.position.x);
    track.position.y = track.position.y + k * (observation.position.y - track.position.y);
    track.position.z = track.position.z + k * (observation.position.z - track.position.z);
    track.positionUncertainty = (1 - k) * track.positionUncertainty;

    // Update features (incremental update)
    this.updateFeatures(track, observation);

    // Update counters
    track.matchCount++;
    track.missedCount = 0;
    track.lastSeenAt = observation.timestamp;
    track.isActive = true;

    // Update confidence
    track.confidence = Math.min(1.0, track.confidence + 0.1 * observation.confidence);

    // Update state
    if (track.state === 'tentative' && track.matchCount >= this.config.confirmationThreshold) {
      track.state = 'confirmed';
    } else if (track.state === 'occluded' || track.state === 'lost') {
      track.state = 'confirmed';
    }

    // Update position history
    track.positionHistory.push({
      position: { ...track.position },
      timestamp: observation.timestamp,
    });
    if (track.positionHistory.length > this.config.positionHistoryLength) {
      track.positionHistory.shift();
    }
  }

  /**
   * Update track features from observation.
   */
  private updateFeatures(track: ObjectTrack, observation: ObjectObservation): void {
    const alpha = 0.2; // Feature update rate

    // Update label if more confident
    if (observation.confidence > track.featureConfidence) {
      track.features.label = observation.features.label;
      track.features.category = observation.features.category;
    }

    // Update dimensions (weighted average)
    if (observation.features.dimensions && track.features.dimensions) {
      track.features.dimensions.width = alpha * observation.features.dimensions.width +
        (1 - alpha) * track.features.dimensions.width;
      track.features.dimensions.height = alpha * observation.features.dimensions.height +
        (1 - alpha) * track.features.dimensions.height;
      track.features.dimensions.depth = alpha * observation.features.dimensions.depth +
        (1 - alpha) * track.features.dimensions.depth;
    } else if (observation.features.dimensions) {
      track.features.dimensions = { ...observation.features.dimensions };
    }

    // Update confidence
    track.featureConfidence = alpha * observation.confidence +
      (1 - alpha) * track.featureConfidence;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RE-IDENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Try to re-identify a lost track from an observation.
   */
  private tryReidentify(observation: ObjectObservation): ObjectTrack | null {
    let bestMatch: ObjectTrack | null = null;
    let bestScore = 0;

    for (const track of this.lostTracks.values()) {
      // Check if features match
      const featureSim = this.calculateFeatureSimilarity(track.features, observation.features);
      if (featureSim < this.config.featureSimilarityThreshold) continue;

      // Check if position is reasonable (within re-identification threshold)
      // Account for time since last seen
      const timeSinceLost = (observation.timestamp - track.lastSeenAt) / 1000;
      const maxMove = timeSinceLost * 1.0; // Assume max 1m/s movement
      const extendedThreshold = this.config.reidentificationThreshold + maxMove;

      const distance = this.calculateDistance(track.position, observation.position);
      if (distance > extendedThreshold) continue;

      // Calculate re-identification score
      const score = featureSim * (1 - distance / extendedThreshold);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = track;
      }
    }

    return bestScore > 0.5 ? bestMatch : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACK MERGING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if any tracks should be merged (were actually the same object).
   */
  private checkForMerges(timestamp: number, events: TrackingEvent[]): void {
    const confirmedTracks = Array.from(this.tracks.values()).filter(
      t => t.state === 'confirmed'
    );

    for (let i = 0; i < confirmedTracks.length; i++) {
      for (let j = i + 1; j < confirmedTracks.length; j++) {
        const track1 = confirmedTracks[i];
        const track2 = confirmedTracks[j];

        const distance = this.calculateDistance(track1.position, track2.position);
        const featureSim = this.calculateFeatureSimilarity(track1.features, track2.features);

        // Merge if very close and similar features
        if (distance < 0.2 && featureSim > 0.8) {
          // Merge into the older/more confident track
          const keepTrack = track1.confidence > track2.confidence ? track1 : track2;
          const deleteTrack = track1.confidence > track2.confidence ? track2 : track1;

          // Merge position histories
          keepTrack.positionHistory = [
            ...keepTrack.positionHistory,
            ...deleteTrack.positionHistory,
          ].sort((a, b) => a.timestamp - b.timestamp)
            .slice(-this.config.positionHistoryLength);

          // Increase confidence
          keepTrack.confidence = Math.min(1.0, keepTrack.confidence + 0.1);
          keepTrack.matchCount += deleteTrack.matchCount;

          // Delete the merged track
          this.tracks.delete(deleteTrack.trackId);

          events.push({
            type: 'tracks_merged',
            timestamp,
            trackId: keepTrack.trackId,
            details: {
              mergedTrackId: deleteTrack.trackId,
              newConfidence: keepTrack.confidence,
            },
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIDENCE DECAY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Decay confidence for all tracks based on time since last observation.
   */
  private decayConfidence(currentTime: number): void {
    for (const track of this.tracks.values()) {
      const timeSinceSeen = (currentTime - track.lastSeenAt) / 1000;
      if (timeSinceSeen > 1.0) {
        track.confidence *= Math.pow(1 - this.config.confidenceDecayRate, timeSinceSeen);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

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

  private calculateFeatureSimilarity(f1: ObjectFeatures, f2: ObjectFeatures): number {
    let similarity = 0;
    let weights = 0;

    // Label match (most important)
    if (f1.label === f2.label) {
      similarity += 0.5;
    } else if (f1.label.includes(f2.label) || f2.label.includes(f1.label)) {
      similarity += 0.3;
    }
    weights += 0.5;

    // Category match
    if (f1.category === f2.category) {
      similarity += 0.3;
    }
    weights += 0.3;

    // Size similarity (if available)
    if (f1.dimensions && f2.dimensions) {
      const sizeDiff = Math.abs(
        (f1.dimensions.width * f1.dimensions.height * f1.dimensions.depth) -
        (f2.dimensions.width * f2.dimensions.height * f2.dimensions.depth)
      );
      const maxSize = Math.max(
        f1.dimensions.width * f1.dimensions.height * f1.dimensions.depth,
        f2.dimensions.width * f2.dimensions.height * f2.dimensions.depth
      );
      if (maxSize > 0) {
        similarity += 0.2 * (1 - sizeDiff / maxSize);
        weights += 0.2;
      }
    }

    return weights > 0 ? similarity / weights : 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC QUERY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all active tracks.
   */
  getActiveTracks(): ObjectTrack[] {
    return Array.from(this.tracks.values()).filter(
      t => t.state !== 'deleted' && t.state !== 'lost'
    );
  }

  /**
   * Get all confirmed tracks.
   */
  getConfirmedTracks(): ObjectTrack[] {
    return Array.from(this.tracks.values()).filter(
      t => t.state === 'confirmed' || t.state === 'occluded'
    );
  }

  /**
   * Get a track by ID.
   */
  getTrack(trackId: string): ObjectTrack | null {
    return this.tracks.get(trackId) || this.lostTracks.get(trackId) || null;
  }

  /**
   * Get tracks by label.
   */
  getTracksByLabel(label: string): ObjectTrack[] {
    return Array.from(this.tracks.values()).filter(
      t => t.features.label === label && t.state !== 'deleted'
    );
  }

  /**
   * Get tracks within radius of a position.
   */
  getTracksInRadius(
    position: { x: number; y: number; z: number },
    radius: number
  ): ObjectTrack[] {
    return Array.from(this.tracks.values()).filter(
      t => t.state !== 'deleted' &&
        this.calculateDistance(t.position, position) <= radius
    );
  }

  /**
   * Get recent tracking events.
   */
  getRecentEvents(maxAge: number = 10000): TrackingEvent[] {
    const cutoff = Date.now() - maxAge;
    return this.events.filter(e => e.timestamp > cutoff);
  }

  /**
   * Get tracking statistics.
   */
  getStats(): {
    totalTracks: number;
    confirmedTracks: number;
    tentativeTracks: number;
    lostTracks: number;
    averageConfidence: number;
  } {
    const tracks = Array.from(this.tracks.values());
    const confirmed = tracks.filter(t => t.state === 'confirmed').length;
    const tentative = tracks.filter(t => t.state === 'tentative').length;
    const lost = this.lostTracks.size;
    const avgConfidence = tracks.length > 0
      ? tracks.reduce((sum, t) => sum + t.confidence, 0) / tracks.length
      : 0;

    return {
      totalTracks: tracks.length,
      confirmedTracks: confirmed,
      tentativeTracks: tentative,
      lostTracks: lost,
      averageConfidence: avgConfidence,
    };
  }

  /**
   * Generate a summary for LLM reasoning.
   */
  generateSummary(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('═══ OBJECT IDENTITY TRACKING ═══');
    lines.push(`Total tracks: ${stats.totalTracks} (${stats.confirmedTracks} confirmed, ${stats.tentativeTracks} tentative, ${stats.lostTracks} lost)`);
    lines.push(`Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    lines.push('');

    const confirmed = this.getConfirmedTracks();
    if (confirmed.length > 0) {
      lines.push('Tracked objects:');
      for (const track of confirmed.slice(0, 10)) {
        const age = ((Date.now() - track.lastSeenAt) / 1000).toFixed(1);
        lines.push(`  ${track.trackId}: ${track.features.label} at (${track.position.x.toFixed(2)}, ${track.position.z.toFixed(2)}) [${track.state}, age: ${age}s]`);
      }
    }

    const recentEvents = this.getRecentEvents(5000);
    if (recentEvents.length > 0) {
      lines.push('');
      lines.push('Recent events:');
      for (const event of recentEvents.slice(-5)) {
        lines.push(`  - ${event.type}: ${event.trackId}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear all tracks.
   */
  clear(): void {
    this.tracks.clear();
    this.lostTracks.clear();
    this.events = [];
    this.nextTrackId = 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const trackers = new Map<string, ObjectIdentityTracker>();

/**
 * Get or create an object identity tracker for a device.
 */
export function getObjectTracker(
  deviceId: string,
  config?: Partial<TrackingConfig>
): ObjectIdentityTracker {
  let tracker = trackers.get(deviceId);
  if (!tracker) {
    tracker = new ObjectIdentityTracker(config);
    trackers.set(deviceId, tracker);
  }
  return tracker;
}

/**
 * Clear tracker for a device.
 */
export function clearObjectTracker(deviceId: string): void {
  trackers.delete(deviceId);
}

export default ObjectIdentityTracker;
