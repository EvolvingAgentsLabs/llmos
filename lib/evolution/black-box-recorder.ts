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
 * Failure marker in recording
 */
export interface FailureMarker {
  timestamp: number;
  frameIndex: number;
  type: 'collision' | 'timeout' | 'low_confidence' | 'safety_stop' | 'skill_error' | 'unknown';
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
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
  };
  status: 'recording' | 'completed' | 'failed';
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
