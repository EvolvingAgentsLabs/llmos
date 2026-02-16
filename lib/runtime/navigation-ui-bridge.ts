/**
 * Navigation UI Bridge
 *
 * Connects the NavigationLoop to the browser UI (RobotCanvas3D / RobotWorldPanel).
 * Provides a React-friendly interface for:
 *
 *   - Displaying navigation state (mode, cycle, path, predictions)
 *   - Showing LLM decisions in real-time
 *   - Visualizing world model predictions vs observations
 *   - Fleet coordination status overlay
 *
 * This is a state bridge, not a React component. It emits state updates
 * that React components can subscribe to via callbacks.
 *
 * Usage:
 *   const uiBridge = new NavigationUIBridge(bridge, infer);
 *   uiBridge.setGoal(1.5, 1.5, 'Navigate to corner');
 *   uiBridge.onStateChange(state => setNavState(state));
 *   uiBridge.startCycleLoop();
 */

import { NavigationLoop, type CycleResult, type InferenceFunction, type NavigationState } from './navigation-loop';
import { PredictiveWorldModel, type PredictionResult } from './predictive-world-model';
import { FleetCoordinator, type FleetStatus } from './fleet-coordinator';
import type { IWorldModelBridge } from './world-model-bridge';
import type { PathResult } from './local-planner';

// =============================================================================
// Types
// =============================================================================

export interface NavigationUIState {
  /** Current navigation state */
  nav: NavigationState;
  /** Current cycle number */
  cycle: number;
  /** Last LLM decision explanation */
  lastExplanation: string;
  /** Last action type */
  lastAction: string;
  /** Current planned path (for visualization) */
  currentPath: PathResult | null;
  /** Whether goal has been reached */
  goalReached: boolean;
  /** Prediction model statistics */
  predictions: PredictionResult | null;
  /** Fleet status (if multi-robot) */
  fleet: FleetStatus | null;
  /** Running state */
  running: boolean;
  /** Cycle timing (ms) */
  lastCycleMs: number;
  /** Error message (if any) */
  error: string | null;
}

export interface NavigationUIConfig {
  /** Cycle delay in ms (controls speed of autonomous cycling) */
  cycleDelayMs: number;
  /** Whether to enable predictive model */
  enablePredictions: boolean;
  /** Whether to enable fleet coordination */
  enableFleet: boolean;
}

const DEFAULT_CONFIG: NavigationUIConfig = {
  cycleDelayMs: 500,
  enablePredictions: false,
  enableFleet: false,
};

type StateChangeCallback = (state: NavigationUIState) => void;

// =============================================================================
// Navigation UI Bridge
// =============================================================================

export class NavigationUIBridge {
  private config: NavigationUIConfig;
  private loop: NavigationLoop;
  private bridge: IWorldModelBridge;
  private predictiveModel: PredictiveWorldModel | null = null;
  private fleetCoordinator: FleetCoordinator | null = null;
  private listeners: StateChangeCallback[] = [];
  private running: boolean = false;
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;

  private state: NavigationUIState = {
    nav: {
      cycle: 0,
      mode: 'idle',
      position: { x: 0, y: 0 },
      yaw: 0,
      speed: 0,
      battery: 100,
      isStuck: false,
      stuckCounter: 0,
      confidence: 0.5,
      lastPosition: { x: 0, y: 0 },
      history: [],
    },
    cycle: 0,
    lastExplanation: '',
    lastAction: 'none',
    currentPath: null,
    goalReached: false,
    predictions: null,
    fleet: null,
    running: false,
    lastCycleMs: 0,
    error: null,
  };

  constructor(
    bridge: IWorldModelBridge,
    infer: InferenceFunction,
    config: Partial<NavigationUIConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bridge = bridge;
    this.loop = new NavigationLoop(bridge, infer, {
      generateMapImages: true,
      enablePredictiveModel: this.config.enablePredictions,
    });

    if (this.config.enablePredictions) {
      this.predictiveModel = new PredictiveWorldModel();
    }

    if (this.config.enableFleet) {
      this.fleetCoordinator = new FleetCoordinator();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to state changes.
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Set navigation goal.
   */
  setGoal(x: number, y: number, description: string): void {
    this.loop.setGoal(x, y, description);
    this.emitState();
  }

  /**
   * Set exploration mode.
   */
  setExplorationMode(description: string = 'Explore the arena'): void {
    this.loop.setExplorationMode(description);
    this.emitState();
  }

  /**
   * Update robot pose (call from simulation or hardware).
   */
  updatePose(x: number, y: number, yaw: number, speed?: number): void {
    this.loop.updatePose(x, y, yaw, speed);
  }

  /**
   * Run a single cycle manually.
   */
  async runSingleCycle(cameraFrame?: string): Promise<CycleResult> {
    try {
      const cycle = await this.loop.runCycle(cameraFrame);
      this.updateStateFromCycle(cycle);
      return cycle;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Unknown error';
      this.emitState();
      throw error;
    }
  }

  /**
   * Start autonomous cycle loop.
   */
  startCycleLoop(): void {
    this.running = true;
    this.state.running = true;
    this.emitState();
    this.scheduleNextCycle();
  }

  /**
   * Stop the cycle loop.
   */
  stopCycleLoop(): void {
    this.running = false;
    this.state.running = false;
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.emitState();
  }

  /**
   * Get the NavigationLoop for direct access.
   */
  getLoop(): NavigationLoop {
    return this.loop;
  }

  /**
   * Get the fleet coordinator (if enabled).
   */
  getFleetCoordinator(): FleetCoordinator | null {
    return this.fleetCoordinator;
  }

  /**
   * Get current state snapshot.
   */
  getState(): NavigationUIState {
    return { ...this.state };
  }

  /**
   * Clean up timers.
   */
  dispose(): void {
    this.stopCycleLoop();
    this.listeners = [];
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private scheduleNextCycle(): void {
    if (!this.running) return;

    this.cycleTimer = setTimeout(async () => {
      try {
        const cycle = await this.loop.runCycle();
        this.updateStateFromCycle(cycle);

        if (cycle.goalReached) {
          this.stopCycleLoop();
          return;
        }
      } catch (error) {
        this.state.error = error instanceof Error ? error.message : 'Cycle failed';
        this.emitState();
      }

      this.scheduleNextCycle();
    }, this.config.cycleDelayMs);
  }

  private updateStateFromCycle(cycle: CycleResult): void {
    this.state.nav = this.loop.getState();
    this.state.cycle = cycle.cycle;
    this.state.lastExplanation = cycle.decision.explanation;
    this.state.lastAction = cycle.decision.action.type;
    this.state.currentPath = cycle.path;
    this.state.goalReached = cycle.goalReached;
    this.state.lastCycleMs = cycle.cycleTimeMs;
    this.state.error = null;

    // Update predictions if enabled
    if (this.predictiveModel) {
      const wm = this.bridge.getWorldModel();
      this.predictiveModel.verify(wm);
      this.predictiveModel.predict(wm);
      this.state.predictions = this.predictiveModel.getResult();
    }

    // Update fleet status if enabled
    if (this.fleetCoordinator) {
      this.state.fleet = this.fleetCoordinator.getStatus();
    }

    this.emitState();
  }

  private emitState(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createNavigationUIBridge(
  bridge: IWorldModelBridge,
  infer: InferenceFunction,
  config: Partial<NavigationUIConfig> = {}
): NavigationUIBridge {
  return new NavigationUIBridge(bridge, infer, config);
}
