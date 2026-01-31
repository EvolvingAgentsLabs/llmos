/**
 * BlackBox Recorder
 *
 * Records robot interactions for later replay and analysis.
 * This is the "flight recorder" that captures failures for the Dreaming Engine.
 *
 * Records:
 * - Sensor readings at each timestep
 * - Camera frames
 * - Tool calls and results
 * - Skill context
 * - Failure conditions
 *
 * Usage:
 * ```typescript
 * const recorder = getBlackBoxRecorder();
 *
 * // Start recording a session
 * const sessionId = recorder.startSession({
 *   skillName: 'gardener',
 *   deviceId: 'robot-1',
 * });
 *
 * // Record frames during operation
 * recorder.recordFrame({
 *   sensors: { distance: { front: 45 } },
 *   toolCalls: [{ name: 'hal_drive', args: { left: 100, right: 100 } }],
 *   cameraFrame: 'data:image/jpeg;base64,...',
 * });
 *
 * // Mark failure when it occurs
 * recorder.markFailure({
 *   type: 'collision',
 *   description: 'Hit unexpected obstacle',
 * });
 *
 * // End session and save for replay
 * await recorder.endSession();
 * ```
 */

import { logger } from '@/lib/debug/logger';
import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { DeviceTelemetry, HALToolCall } from '../hal/types';

/**
 * Single recorded frame
 */
export interface RecordedFrame {
  timestamp: number;
  /** Time since session start (ms) */
  relativeTime: number;
  /** Full sensor telemetry */
  telemetry: Partial<DeviceTelemetry>;
  /** Camera frame as base64 data URL (may be sampled) */
  cameraFrame?: string;
  /** Tool calls made this frame */
  toolCalls: HALToolCall[];
  /** Tool results */
  toolResults: Array<{
    name: string;
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  /** LLM reasoning text */
  reasoning?: string;
  /** Agentic vision code executions */
  codeExecutions?: Array<{
    code: string;
    output: string;
    success: boolean;
  }>;
  /** Confidence level from vision analysis */
  confidence?: number;
  /** Active alerts */
  alerts?: string[];
}

/**
 * Failure types for recording and simulation
 */
export type FailureType =
  | 'collision'
  | 'imminent_collision'
  | 'lateral_collision_risk'
  | 'motor_deadband'
  | 'excessive_speed'
  | 'timeout'
  | 'low_confidence'
  | 'safety_stop'
  | 'skill_error'
  | 'unknown';

/**
 * Failure severity - 'warning' added for non-blocking issues
 */
export type FailureSeverity = 'minor' | 'moderate' | 'critical' | 'warning';

/**
 * Failure marker in recording
 */
export interface FailureMarker {
  timestamp: number;
  frameIndex: number;
  type: FailureType;
  description: string;
  severity: FailureSeverity;
  /** Sensor state at failure */
  sensorSnapshot?: Partial<DeviceTelemetry>;
  /** Recovery attempted? */
  recoveryAttempted?: boolean;
  /** Recovery successful? */
  recoverySuccessful?: boolean;
}

/**
 * Complete recording session
 */
export interface RecordingSession {
  id: string;
  startTime: number;
  endTime?: number;
  skillName: string;
  skillVersion: string;
  deviceId: string;
  mode: 'simulation' | 'physical';
  frames: RecordedFrame[];
  failures: FailureMarker[];
  metadata: {
    totalFrames: number;
    duration: number;
    failureCount: number;
    averageConfidence: number;
    toolCallCount: number;
    /** Distance traveled in session (cm) */
    distanceTraveled?: number;
    /** Peak speed reached (cm/s) */
    peakSpeed?: number;
    /** Number of direction changes */
    directionChanges?: number;
  };
  status: 'recording' | 'completed' | 'failed';
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Session analysis result
 */
export interface SessionAnalysis {
  sessionId: string;
  skillName: string;
  duration: number;
  /** Failure breakdown by type */
  failureBreakdown: Record<FailureType, number>;
  /** Time to first failure (ms from start) */
  timeToFirstFailure?: number;
  /** Failure clusters (failures within 5 frames of each other) */
  failureClusters: Array<{
    startFrame: number;
    endFrame: number;
    types: FailureType[];
    count: number;
  }>;
  /** Performance metrics */
  performance: {
    averageSpeed: number;
    maxSpeed: number;
    averageConfidence: number;
    minConfidence: number;
    totalDistance: number;
    emergencyStops: number;
  };
  /** Tool usage statistics */
  toolUsage: Record<string, {
    count: number;
    successRate: number;
    averageLatency?: number;
  }>;
  /** Trajectory reconstruction */
  trajectory: Array<{
    time: number;
    x: number;
    y: number;
    yaw: number;
  }>;
  /** Recommendations based on analysis */
  recommendations: string[];
}

/**
 * Session comparison result
 */
export interface SessionComparison {
  sessionA: string;
  sessionB: string;
  /** Which session performed better overall */
  betterSession: 'A' | 'B' | 'equal';
  /** Improvement percentage (positive = B is better) */
  improvement: number;
  differences: {
    failureCount: number;
    confidence: number;
    duration: number;
    emergencyStops: number;
  };
  /** Specific improvements/regressions */
  details: string[];
}

/**
 * Session start options
 */
export interface SessionOptions {
  skillName: string;
  skillVersion?: string;
  deviceId: string;
  mode?: 'simulation' | 'physical';
  /** Sample rate for camera frames (1 = every frame, 5 = every 5th) */
  cameraSampleRate?: number;
  /** Max frames to keep in memory before auto-flush */
  maxFrames?: number;
  /** Additional metadata for the session */
  metadata?: Record<string, unknown>;
}

/**
 * BlackBox Recorder
 *
 * Records robot sessions for failure analysis and replay.
 */
export class BlackBoxRecorder {
  private fs: FileSystemStorage;
  private currentSession: RecordingSession | null = null;
  private sessionStartTime = 0;
  private frameCount = 0;
  private cameraSampleRate = 5;
  private maxFrames = 1000;
  private confidenceSum = 0;
  private toolCallCount = 0;

  constructor(fs?: FileSystemStorage) {
    this.fs = fs || getFileSystem();
  }

  /**
   * Start a new recording session
   */
  startSession(options: SessionOptions): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.sessionStartTime = Date.now();
    this.frameCount = 0;
    this.confidenceSum = 0;
    this.toolCallCount = 0;
    this.cameraSampleRate = options.cameraSampleRate || 5;
    this.maxFrames = options.maxFrames || 1000;

    this.currentSession = {
      id: sessionId,
      startTime: this.sessionStartTime,
      skillName: options.skillName,
      skillVersion: options.skillVersion || '1.0.0',
      deviceId: options.deviceId,
      mode: options.mode || 'simulation',
      frames: [],
      failures: [],
      metadata: {
        totalFrames: 0,
        duration: 0,
        failureCount: 0,
        averageConfidence: 0,
        toolCallCount: 0,
      },
      status: 'recording',
    };

    logger.info('blackbox', 'Recording session started', {
      sessionId,
      skill: options.skillName,
      device: options.deviceId,
    });

    return sessionId;
  }

  /**
   * Record a frame
   */
  recordFrame(frame: {
    telemetry?: Partial<DeviceTelemetry>;
    cameraFrame?: string;
    toolCalls?: HALToolCall[];
    toolResults?: Array<{
      name: string;
      success: boolean;
      data?: unknown;
      error?: string;
    }>;
    reasoning?: string;
    codeExecutions?: Array<{
      code: string;
      output: string;
      success: boolean;
    }>;
    confidence?: number;
    alerts?: string[];
  }): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return;
    }

    this.frameCount++;
    const now = Date.now();

    // Sample camera frames to reduce memory usage
    const shouldIncludeCamera =
      frame.cameraFrame && this.frameCount % this.cameraSampleRate === 0;

    const recordedFrame: RecordedFrame = {
      timestamp: now,
      relativeTime: now - this.sessionStartTime,
      telemetry: frame.telemetry || {},
      cameraFrame: shouldIncludeCamera ? frame.cameraFrame : undefined,
      toolCalls: frame.toolCalls || [],
      toolResults: frame.toolResults || [],
      reasoning: frame.reasoning,
      codeExecutions: frame.codeExecutions,
      confidence: frame.confidence,
      alerts: frame.alerts,
    };

    this.currentSession.frames.push(recordedFrame);

    // Track statistics
    if (frame.confidence !== undefined) {
      this.confidenceSum += frame.confidence;
    }
    this.toolCallCount += (frame.toolCalls?.length || 0);

    // Auto-flush if too many frames
    if (this.currentSession.frames.length > this.maxFrames) {
      this.flushOldFrames();
    }
  }

  /**
   * Mark a failure in the recording
   */
  markFailure(failure: {
    type: FailureMarker['type'];
    description: string;
    severity?: FailureMarker['severity'];
    sensorSnapshot?: Partial<DeviceTelemetry>;
    recoveryAttempted?: boolean;
    recoverySuccessful?: boolean;
  }): void {
    if (!this.currentSession) {
      return;
    }

    const marker: FailureMarker = {
      timestamp: Date.now(),
      frameIndex: this.currentSession.frames.length - 1,
      type: failure.type,
      description: failure.description,
      severity: failure.severity || 'moderate',
      sensorSnapshot: failure.sensorSnapshot,
      recoveryAttempted: failure.recoveryAttempted,
      recoverySuccessful: failure.recoverySuccessful,
    };

    this.currentSession.failures.push(marker);

    logger.warn('blackbox', 'Failure recorded', {
      type: failure.type,
      description: failure.description,
      frameIndex: marker.frameIndex,
    });
  }

  /**
   * End the recording session and save
   */
  async endSession(): Promise<RecordingSession | null> {
    if (!this.currentSession) {
      return null;
    }

    const session = this.currentSession;
    session.endTime = Date.now();
    session.status = session.failures.length > 0 ? 'failed' : 'completed';

    // Calculate metadata
    session.metadata = {
      totalFrames: this.frameCount,
      duration: session.endTime - session.startTime,
      failureCount: session.failures.length,
      averageConfidence: this.frameCount > 0 ? this.confidenceSum / this.frameCount : 0,
      toolCallCount: this.toolCallCount,
    };

    // Save to filesystem
    await this.saveSession(session);

    logger.info('blackbox', 'Recording session ended', {
      sessionId: session.id,
      duration: session.metadata.duration,
      frames: session.metadata.totalFrames,
      failures: session.metadata.failureCount,
    });

    this.currentSession = null;
    return session;
  }

  /**
   * Get current session (if recording)
   */
  getCurrentSession(): RecordingSession | null {
    return this.currentSession;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.currentSession !== null && this.currentSession.status === 'recording';
  }

  /**
   * Load a saved session for replay
   */
  async loadSession(sessionId: string): Promise<RecordingSession | null> {
    const path = `blackbox/${sessionId}.json`;
    const result = await this.fs.read(path);

    if (!result.ok || !result.value) {
      return null;
    }

    try {
      return JSON.parse(result.value) as RecordingSession;
    } catch {
      return null;
    }
  }

  /**
   * List all saved sessions
   */
  async listSessions(): Promise<Array<{
    id: string;
    skillName: string;
    startTime: number;
    status: string;
    failureCount: number;
  }>> {
    const sessions: Array<{
      id: string;
      skillName: string;
      startTime: number;
      status: string;
      failureCount: number;
    }> = [];

    const filesResult = await this.fs.glob('blackbox/*.json');
    if (!filesResult.ok) {
      return sessions;
    }

    for (const path of filesResult.value) {
      const content = await this.fs.read(path);
      if (content.ok && content.value) {
        try {
          const session = JSON.parse(content.value) as RecordingSession;
          sessions.push({
            id: session.id,
            skillName: session.skillName,
            startTime: session.startTime,
            status: session.status,
            failureCount: session.metadata.failureCount,
          });
        } catch {
          // Skip invalid files
        }
      }
    }

    // Sort by start time (newest first)
    sessions.sort((a, b) => b.startTime - a.startTime);

    return sessions;
  }

  /**
   * Get sessions with failures for the dreaming engine
   */
  async getFailedSessions(limit = 10): Promise<RecordingSession[]> {
    const sessions: RecordingSession[] = [];
    const filesResult = await this.fs.glob('blackbox/*.json');

    if (!filesResult.ok) {
      return sessions;
    }

    for (const path of filesResult.value) {
      const content = await this.fs.read(path);
      if (content.ok && content.value) {
        try {
          const session = JSON.parse(content.value) as RecordingSession;
          if (session.status === 'failed' && session.failures.length > 0) {
            sessions.push(session);
          }
        } catch {
          // Skip invalid files
        }
      }

      if (sessions.length >= limit) {
        break;
      }
    }

    return sessions;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const path = `blackbox/${sessionId}.json`;
    const result = await this.fs.delete(path);
    return result.ok;
  }

  /**
   * Save session to filesystem
   */
  private async saveSession(session: RecordingSession): Promise<void> {
    const path = `blackbox/${session.id}.json`;

    // Ensure directory exists
    await this.fs.write('blackbox/.gitkeep', '');

    // Save session
    await this.fs.write(path, JSON.stringify(session, null, 2));
  }

  /**
   * Flush old frames to save memory
   */
  private flushOldFrames(): void {
    if (!this.currentSession) return;

    // Keep last 500 frames + all frames with failures
    const failureIndices = new Set(this.currentSession.failures.map((f) => f.frameIndex));
    const keepCount = Math.min(500, this.maxFrames / 2);

    const frames = this.currentSession.frames;
    const newFrames: RecordedFrame[] = [];

    for (let i = 0; i < frames.length; i++) {
      // Keep if it's a failure frame or in the recent window
      if (failureIndices.has(i) || i >= frames.length - keepCount) {
        newFrames.push(frames[i]);
      }
    }

    this.currentSession.frames = newFrames;

    logger.debug('blackbox', 'Flushed old frames', {
      before: frames.length,
      after: newFrames.length,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYSIS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze a session for patterns and insights
   */
  analyzeSession(session: RecordingSession): SessionAnalysis {
    const failureBreakdown: Record<FailureType, number> = {
      collision: 0,
      imminent_collision: 0,
      lateral_collision_risk: 0,
      motor_deadband: 0,
      excessive_speed: 0,
      timeout: 0,
      low_confidence: 0,
      safety_stop: 0,
      skill_error: 0,
      unknown: 0,
    };

    // Count failures by type
    for (const failure of session.failures) {
      failureBreakdown[failure.type]++;
    }

    // Find time to first failure
    const timeToFirstFailure = session.failures.length > 0
      ? session.failures[0].timestamp - session.startTime
      : undefined;

    // Identify failure clusters
    const failureClusters = this.identifyFailureClusters(session.failures);

    // Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(session);

    // Calculate tool usage
    const toolUsage = this.calculateToolUsage(session);

    // Reconstruct trajectory
    const trajectory = this.reconstructTrajectory(session);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      failureBreakdown,
      failureClusters,
      performance,
      toolUsage
    );

    return {
      sessionId: session.id,
      skillName: session.skillName,
      duration: session.metadata.duration,
      failureBreakdown,
      timeToFirstFailure,
      failureClusters,
      performance,
      toolUsage,
      trajectory,
      recommendations,
    };
  }

  /**
   * Identify clusters of failures (failures occurring close together)
   */
  private identifyFailureClusters(
    failures: FailureMarker[]
  ): SessionAnalysis['failureClusters'] {
    if (failures.length === 0) return [];

    const clusters: SessionAnalysis['failureClusters'] = [];
    const clusterThreshold = 5; // Frames

    let currentCluster: {
      startFrame: number;
      endFrame: number;
      types: Set<FailureType>;
      count: number;
    } | null = null;

    for (const failure of failures) {
      if (!currentCluster) {
        currentCluster = {
          startFrame: failure.frameIndex,
          endFrame: failure.frameIndex,
          types: new Set([failure.type]),
          count: 1,
        };
      } else if (failure.frameIndex - currentCluster.endFrame <= clusterThreshold) {
        // Extend current cluster
        currentCluster.endFrame = failure.frameIndex;
        currentCluster.types.add(failure.type);
        currentCluster.count++;
      } else {
        // Save current cluster and start new one
        if (currentCluster.count >= 2) {
          clusters.push({
            ...currentCluster,
            types: Array.from(currentCluster.types),
          });
        }
        currentCluster = {
          startFrame: failure.frameIndex,
          endFrame: failure.frameIndex,
          types: new Set([failure.type]),
          count: 1,
        };
      }
    }

    // Don't forget the last cluster
    if (currentCluster && currentCluster.count >= 2) {
      clusters.push({
        ...currentCluster,
        types: Array.from(currentCluster.types),
      });
    }

    return clusters;
  }

  /**
   * Calculate performance metrics from session
   */
  private calculatePerformanceMetrics(
    session: RecordingSession
  ): SessionAnalysis['performance'] {
    let speedSum = 0;
    let maxSpeed = 0;
    let confidenceSum = 0;
    let minConfidence = 1;
    let totalDistance = 0;
    let emergencyStops = 0;
    let validFrames = 0;

    let lastX = 0;
    let lastY = 0;
    let hasLastPos = false;

    for (const frame of session.frames) {
      // Calculate speed from motor values
      const motors = frame.telemetry.motors;
      if (motors) {
        const speed = Math.abs(motors.left + motors.right) / 2;
        speedSum += speed;
        maxSpeed = Math.max(maxSpeed, speed);
        validFrames++;
      }

      // Track confidence
      if (frame.confidence !== undefined) {
        confidenceSum += frame.confidence;
        minConfidence = Math.min(minConfidence, frame.confidence);
      }

      // Track distance
      const pose = frame.telemetry.pose;
      if (pose) {
        if (hasLastPos) {
          const dx = pose.x - lastX;
          const dy = pose.y - lastY;
          totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        lastX = pose.x;
        lastY = pose.y;
        hasLastPos = true;
      }

      // Count emergency stops
      if (frame.toolCalls.some(tc => tc.name === 'hal_emergency_stop')) {
        emergencyStops++;
      }
    }

    return {
      averageSpeed: validFrames > 0 ? speedSum / validFrames : 0,
      maxSpeed,
      averageConfidence: session.frames.length > 0
        ? confidenceSum / session.frames.length
        : 0,
      minConfidence,
      totalDistance,
      emergencyStops,
    };
  }

  /**
   * Calculate tool usage statistics
   */
  private calculateToolUsage(
    session: RecordingSession
  ): SessionAnalysis['toolUsage'] {
    const usage: Record<string, { count: number; successes: number }> = {};

    for (const frame of session.frames) {
      for (const toolCall of frame.toolCalls) {
        if (!usage[toolCall.name]) {
          usage[toolCall.name] = { count: 0, successes: 0 };
        }
        usage[toolCall.name].count++;
      }

      for (const result of frame.toolResults) {
        if (usage[result.name] && result.success) {
          usage[result.name].successes++;
        }
      }
    }

    const toolUsage: SessionAnalysis['toolUsage'] = {};
    for (const [name, stats] of Object.entries(usage)) {
      toolUsage[name] = {
        count: stats.count,
        successRate: stats.count > 0 ? stats.successes / stats.count : 0,
      };
    }

    return toolUsage;
  }

  /**
   * Reconstruct trajectory from session frames
   */
  private reconstructTrajectory(
    session: RecordingSession
  ): SessionAnalysis['trajectory'] {
    const trajectory: SessionAnalysis['trajectory'] = [];

    for (const frame of session.frames) {
      const pose = frame.telemetry.pose;
      if (pose) {
        trajectory.push({
          time: frame.relativeTime,
          x: pose.x,
          y: pose.y,
          yaw: pose.yaw,
        });
      }
    }

    return trajectory;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    failureBreakdown: Record<FailureType, number>,
    failureClusters: SessionAnalysis['failureClusters'],
    performance: SessionAnalysis['performance'],
    toolUsage: SessionAnalysis['toolUsage']
  ): string[] {
    const recommendations: string[] = [];

    // Collision-related recommendations
    if (failureBreakdown.collision > 0) {
      recommendations.push('Improve obstacle detection - collisions detected');
    }
    if (failureBreakdown.imminent_collision > 2) {
      recommendations.push('Reduce approach speed near obstacles - multiple near-misses');
    }

    // Confidence recommendations
    if (failureBreakdown.low_confidence > 3) {
      recommendations.push('Consider improving visual detection or increasing light conditions');
    }
    if (performance.minConfidence < 0.2) {
      recommendations.push('Very low confidence detected - verify camera is functioning');
    }

    // Speed recommendations
    if (failureBreakdown.excessive_speed > 0) {
      recommendations.push('Reduce maximum speed in confined areas');
    }

    // Motor recommendations
    if (failureBreakdown.motor_deadband > 2) {
      recommendations.push('Increase minimum PWM values - motor deadband detected');
    }

    // Cluster recommendations
    if (failureClusters.length > 0) {
      const avgClusterSize = failureClusters.reduce((sum, c) => sum + c.count, 0) / failureClusters.length;
      if (avgClusterSize > 3) {
        recommendations.push('Failure cascades detected - improve recovery protocols');
      }
    }

    // Tool usage recommendations
    const driveUsage = toolUsage['hal_drive'];
    if (driveUsage && driveUsage.successRate < 0.9) {
      recommendations.push('Drive commands failing - check motor connections');
    }

    if (performance.emergencyStops > 2) {
      recommendations.push('Multiple emergency stops - review navigation strategy');
    }

    return recommendations;
  }

  /**
   * Compare two sessions to identify improvements or regressions
   */
  compareSession(sessionA: RecordingSession, sessionB: RecordingSession): SessionComparison {
    const analysisA = this.analyzeSession(sessionA);
    const analysisB = this.analyzeSession(sessionB);

    const differences = {
      failureCount: sessionB.failures.length - sessionA.failures.length,
      confidence: analysisB.performance.averageConfidence - analysisA.performance.averageConfidence,
      duration: sessionB.metadata.duration - sessionA.metadata.duration,
      emergencyStops: analysisB.performance.emergencyStops - analysisA.performance.emergencyStops,
    };

    const details: string[] = [];

    // Failure analysis
    if (differences.failureCount < 0) {
      details.push(`${Math.abs(differences.failureCount)} fewer failures in session B`);
    } else if (differences.failureCount > 0) {
      details.push(`${differences.failureCount} more failures in session B`);
    }

    // Confidence analysis
    if (differences.confidence > 0.1) {
      details.push(`${(differences.confidence * 100).toFixed(1)}% better confidence in session B`);
    } else if (differences.confidence < -0.1) {
      details.push(`${(Math.abs(differences.confidence) * 100).toFixed(1)}% worse confidence in session B`);
    }

    // Emergency stops
    if (differences.emergencyStops < 0) {
      details.push(`${Math.abs(differences.emergencyStops)} fewer emergency stops in session B`);
    } else if (differences.emergencyStops > 0) {
      details.push(`${differences.emergencyStops} more emergency stops in session B`);
    }

    // Determine overall better session
    let scoreA = 0;
    let scoreB = 0;

    // Fewer failures is better (weighted heavily)
    if (differences.failureCount < 0) scoreB += 3;
    else if (differences.failureCount > 0) scoreA += 3;

    // Better confidence is better
    if (differences.confidence > 0.05) scoreB += 1;
    else if (differences.confidence < -0.05) scoreA += 1;

    // Fewer emergency stops is better
    if (differences.emergencyStops < 0) scoreB += 2;
    else if (differences.emergencyStops > 0) scoreA += 2;

    const betterSession: 'A' | 'B' | 'equal' = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'equal';

    // Calculate improvement percentage (based on failure reduction)
    const improvement = sessionA.failures.length > 0
      ? ((sessionA.failures.length - sessionB.failures.length) / sessionA.failures.length) * 100
      : sessionB.failures.length === 0 ? 0 : -100;

    return {
      sessionA: sessionA.id,
      sessionB: sessionB.id,
      betterSession,
      improvement,
      differences,
      details,
    };
  }

  /**
   * Export session for external analysis (CSV format)
   */
  exportSessionToCSV(session: RecordingSession): string {
    const headers = [
      'timestamp',
      'relative_time',
      'pos_x',
      'pos_y',
      'pos_yaw',
      'distance_front',
      'distance_left',
      'distance_right',
      'motor_left',
      'motor_right',
      'confidence',
      'tool_calls',
      'has_failure',
    ];

    const rows: string[] = [headers.join(',')];

    const failureFrames = new Set(session.failures.map(f => f.frameIndex));

    for (let i = 0; i < session.frames.length; i++) {
      const frame = session.frames[i];
      const telemetry = frame.telemetry;

      const row = [
        frame.timestamp,
        frame.relativeTime,
        telemetry.pose?.x ?? '',
        telemetry.pose?.y ?? '',
        telemetry.pose?.yaw ?? '',
        telemetry.sensors?.distance?.[0] ?? '',
        telemetry.sensors?.distance?.[1] ?? '',
        telemetry.sensors?.distance?.[2] ?? '',
        telemetry.motors?.left ?? '',
        telemetry.motors?.right ?? '',
        frame.confidence ?? '',
        frame.toolCalls.map(tc => tc.name).join(';'),
        failureFrames.has(i) ? '1' : '0',
      ];

      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Get aggregate statistics across multiple sessions
   */
  async getAggregateStatistics(skillName?: string): Promise<{
    totalSessions: number;
    totalFailures: number;
    averageConfidence: number;
    failuresByType: Record<FailureType, number>;
    mostCommonFailures: Array<{ type: FailureType; count: number }>;
    averageSessionDuration: number;
    successRate: number;
  }> {
    const sessions = await this.listSessions();
    const relevantSessions = skillName
      ? sessions.filter(s => s.skillName === skillName)
      : sessions;

    const failuresByType: Record<FailureType, number> = {
      collision: 0,
      imminent_collision: 0,
      lateral_collision_risk: 0,
      motor_deadband: 0,
      excessive_speed: 0,
      timeout: 0,
      low_confidence: 0,
      safety_stop: 0,
      skill_error: 0,
      unknown: 0,
    };

    let totalFailures = 0;
    let confidenceSum = 0;
    let durationSum = 0;
    let successfulSessions = 0;
    let sessionsWithData = 0;

    for (const sessionInfo of relevantSessions) {
      const session = await this.loadSession(sessionInfo.id);
      if (!session) continue;

      sessionsWithData++;
      totalFailures += session.failures.length;
      durationSum += session.metadata.duration;

      if (session.failures.length === 0) {
        successfulSessions++;
      }

      if (session.metadata.averageConfidence > 0) {
        confidenceSum += session.metadata.averageConfidence;
      }

      for (const failure of session.failures) {
        failuresByType[failure.type]++;
      }
    }

    // Sort failures by count
    const mostCommonFailures = Object.entries(failuresByType)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type: type as FailureType, count }));

    return {
      totalSessions: relevantSessions.length,
      totalFailures,
      averageConfidence: sessionsWithData > 0 ? confidenceSum / sessionsWithData : 0,
      failuresByType,
      mostCommonFailures,
      averageSessionDuration: sessionsWithData > 0 ? durationSum / sessionsWithData : 0,
      successRate: relevantSessions.length > 0
        ? successfulSessions / relevantSessions.length
        : 0,
    };
  }

  /**
   * Add tags to a session for categorization
   */
  async tagSession(sessionId: string, tags: string[]): Promise<boolean> {
    const session = await this.loadSession(sessionId);
    if (!session) return false;

    session.tags = [...new Set([...(session.tags || []), ...tags])];
    await this.saveSession(session);
    return true;
  }

  /**
   * Find sessions by tag
   */
  async findSessionsByTag(tag: string): Promise<RecordingSession[]> {
    const sessions: RecordingSession[] = [];
    const filesResult = await this.fs.glob('blackbox/*.json');

    if (!filesResult.ok) {
      return sessions;
    }

    for (const path of filesResult.value) {
      const content = await this.fs.read(path);
      if (content.ok && content.value) {
        try {
          const session = JSON.parse(content.value) as RecordingSession;
          if (session.tags?.includes(tag)) {
            sessions.push(session);
          }
        } catch {
          // Skip invalid files
        }
      }
    }

    return sessions;
  }
}

// Singleton instance
let recorderInstance: BlackBoxRecorder | null = null;

/**
 * Get the BlackBox recorder instance
 */
export function getBlackBoxRecorder(): BlackBoxRecorder {
  if (!recorderInstance) {
    recorderInstance = new BlackBoxRecorder();
  }
  return recorderInstance;
}
