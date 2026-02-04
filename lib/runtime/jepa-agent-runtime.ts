/**
 * JEPA-Inspired Agent Runtime
 *
 * This runtime integrates JEPA-style mental simulation with the existing
 * ESP32 robot control system. It uses ONLY the LLM as the "world model".
 *
 * Key JEPA concepts implemented:
 * 1. Abstract state encoding (sensor → semantic representation)
 * 2. Mental simulation (predict outcomes before acting)
 * 3. Trajectory planning (evaluate action sequences, not just single actions)
 * 4. Prediction verification (compare expected vs actual outcomes)
 */

import {
  JEPAMentalModel,
  AbstractState,
  RobotAction,
  formatStateForLLM,
  JEPA_INSPIRED_AGENT_PROMPT,
} from './jepa-mental-model';
import {
  DEVICE_TOOLS,
  DeviceContext,
  SensorReadings,
  WheelDirection,
  StructuredResponse,
} from './esp32-agent-runtime';
import { LLMStorage, DEFAULT_BASE_URL } from '../llm/storage';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface JEPAAgentState {
  running: boolean;
  iteration: number;
  goal: string;
  mentalModel: JEPAMentalModel;
  lastPrediction: MentalPrediction | null;
  lastActualOutcome: AbstractState | null;
  predictionAccuracy: number[];  // Track how accurate predictions are
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface MentalPrediction {
  action: RobotAction;
  predictedState: {
    frontStatus: string;
    leftStatus: string;
    rightStatus: string;
    riskPercent: number;
    goalProgress: string;
  };
  confidence: number;
}

export interface JEPAResponse {
  phase: string;
  abstract_state: {
    position_description: string;
    front_status: string;
    left_status: string;
    right_status: string;
    stuck_risk: string;
    goal_direction: string;
  };
  mental_simulation: {
    forward_prediction: SimulationResult;
    left_prediction: SimulationResult;
    right_prediction: SimulationResult;
    backup_prediction: SimulationResult;
  };
  trajectory_plan: {
    chosen_sequence: string[];
    reasoning: string;
    expected_end_state: string;
  };
  selected_action: {
    action: string;
    confidence: number;
    reasoning: string;
  };
  wheel_commands: {
    left_wheel: WheelDirection;
    right_wheel: WheelDirection;
  };
}

interface SimulationResult {
  outcome: string;
  risk_percent: number;
  goal_progress: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// JEPA AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class JEPAAgentRuntime {
  private state: JEPAAgentState;
  private deviceContext: DeviceContext | null = null;
  private loopInterval: NodeJS.Timeout | null = null;
  private onStateChange?: (state: JEPAAgentState) => void;

  constructor(goal: string = 'Explore the environment safely') {
    this.state = {
      running: false,
      iteration: 0,
      goal,
      mentalModel: new JEPAMentalModel({
        planningHorizon: 3,
        numTrajectories: 3,
        riskTolerance: 0.5,
      }),
      lastPrediction: null,
      lastActualOutcome: null,
      predictionAccuracy: [],
      conversationHistory: [],
    };
  }

  /**
   * Initialize with device context
   */
  initialize(deviceContext: DeviceContext): void {
    this.deviceContext = deviceContext;
  }

  /**
   * Set callback for state changes
   */
  onStateUpdate(callback: (state: JEPAAgentState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Start the JEPA-style control loop
   */
  async start(intervalMs: number = 3000): Promise<void> {
    if (this.state.running) return;
    if (!this.deviceContext) {
      throw new Error('Device context not initialized');
    }

    this.state.running = true;
    this.notifyStateChange();

    console.log('[JEPA Agent] Starting with mental simulation enabled');

    // Run the loop
    this.loopInterval = setInterval(() => this.runCycle(), intervalMs);

    // Run first cycle immediately
    await this.runCycle();
  }

  /**
   * Stop the control loop
   */
  stop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    this.state.running = false;

    // Stop motors
    if (this.deviceContext) {
      this.deviceContext.setLeftWheel(0);
      this.deviceContext.setRightWheel(0);
    }

    this.notifyStateChange();
    console.log('[JEPA Agent] Stopped');
  }

  /**
   * Main control cycle - JEPA-style
   */
  private async runCycle(): Promise<void> {
    if (!this.state.running || !this.deviceContext) return;

    this.state.iteration++;
    console.log(`\n[JEPA Agent] === Cycle ${this.state.iteration} ===`);

    try {
      // Phase 1: OBSERVE & ENCODE
      const sensors = this.deviceContext.getSensors();
      const abstractState = this.state.mentalModel.updateState(
        {
          distance: {
            front: sensors.distance.front,
            left: sensors.distance.left,
            right: sensors.distance.right,
            back: sensors.distance.back,
          },
          pose: sensors.pose,
        },
        this.state.goal
      );

      console.log('[JEPA] Phase 1: OBSERVE & ENCODE');
      console.log(`  Abstract state: ${abstractState.position.description}`);
      console.log(`  Front: ${abstractState.surroundings.front.distance}`);

      // Phase 2: VERIFY PREVIOUS PREDICTION (if any)
      if (this.state.lastPrediction && this.state.lastActualOutcome) {
        const accuracy = this.verifyPrediction(
          this.state.lastPrediction,
          abstractState
        );
        this.state.predictionAccuracy.push(accuracy);
        console.log(`[JEPA] Prediction accuracy: ${(accuracy * 100).toFixed(0)}%`);
      }

      // Phase 3: MENTAL SIMULATION (via LLM)
      const llmResponse = await this.queryLLMWithMentalSimulation(
        sensors,
        abstractState
      );

      if (!llmResponse) {
        console.log('[JEPA] No valid response from LLM');
        return;
      }

      console.log('[JEPA] Phase 2: MENTAL SIMULATION');
      console.log(`  Forward prediction: ${llmResponse.mental_simulation.forward_prediction.outcome}`);
      console.log(`  Left prediction: ${llmResponse.mental_simulation.left_prediction.outcome}`);
      console.log(`  Right prediction: ${llmResponse.mental_simulation.right_prediction.outcome}`);

      // Phase 4: TRAJECTORY PLANNING
      console.log('[JEPA] Phase 3: TRAJECTORY PLANNING');
      console.log(`  Chosen sequence: ${llmResponse.trajectory_plan.chosen_sequence.join(' → ')}`);
      console.log(`  Reasoning: ${llmResponse.trajectory_plan.reasoning}`);

      // Phase 5: EXECUTE (first action of trajectory)
      console.log('[JEPA] Phase 4: EXECUTE');
      console.log(`  Action: ${llmResponse.selected_action.action}`);
      console.log(`  Confidence: ${llmResponse.selected_action.confidence}%`);

      // Store prediction for verification next cycle
      this.state.lastPrediction = {
        action: llmResponse.selected_action.action as RobotAction,
        predictedState: {
          frontStatus: llmResponse.abstract_state.front_status,
          leftStatus: llmResponse.abstract_state.left_status,
          rightStatus: llmResponse.abstract_state.right_status,
          riskPercent: this.getSelectedPrediction(llmResponse).risk_percent,
          goalProgress: this.getSelectedPrediction(llmResponse).goal_progress,
        },
        confidence: llmResponse.selected_action.confidence,
      };
      this.state.lastActualOutcome = abstractState;

      // Execute wheel commands
      this.executeWheelCommands(llmResponse.wheel_commands);

      // Record action in mental model
      this.state.mentalModel.recordAction(
        llmResponse.selected_action.action as RobotAction
      );

      this.notifyStateChange();

    } catch (error) {
      console.error('[JEPA Agent] Cycle error:', error);
    }
  }

  /**
   * Query LLM with JEPA-style mental simulation prompt
   */
  private async queryLLMWithMentalSimulation(
    sensors: SensorReadings,
    abstractState: AbstractState
  ): Promise<JEPAResponse | null> {
    const settings = LLMStorage.getSettings();

    // Build message with abstract state
    const userMessage = `
## Current Sensor Readings
- Front: ${sensors.distance.front}cm
- Left: ${sensors.distance.left}cm
- Right: ${sensors.distance.right}cm
- Back: ${sensors.distance.back}cm
- Position: (${sensors.pose.x.toFixed(2)}, ${sensors.pose.y.toFixed(2)})
- Rotation: ${sensors.pose.rotation.toFixed(0)}°

## Abstract Understanding
${formatStateForLLM(abstractState)}

## Goal
${this.state.goal}

## Your Task
1. Encode the current state abstractly
2. Run mental simulation for each possible action
3. Plan a 3-action trajectory
4. Select the best first action
5. Output wheel commands

Remember: SIMULATE before ACTING. Predict what will happen for each action.
`;

    // Add to conversation history
    this.state.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Keep history manageable
    if (this.state.conversationHistory.length > 10) {
      // Keep system prompt + last 8 exchanges
      this.state.conversationHistory = this.state.conversationHistory.slice(-8);
    }

    try {
      const response = await fetch(`${settings.baseUrl || DEFAULT_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model || 'google/gemini-2.0-flash-001',
          messages: [
            { role: 'system', content: JEPA_INSPIRED_AGENT_PROMPT },
            ...this.state.conversationHistory,
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Store response in history
      this.state.conversationHistory.push({
        role: 'assistant',
        content,
      });

      // Parse JSON response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                        content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr) as JEPAResponse;
      }

      console.log('[JEPA] Could not parse LLM response as JSON');
      return null;

    } catch (error) {
      console.error('[JEPA] LLM query error:', error);
      return null;
    }
  }

  /**
   * Execute wheel commands
   */
  private executeWheelCommands(commands: {
    left_wheel: WheelDirection;
    right_wheel: WheelDirection;
  }): void {
    if (!this.deviceContext) return;

    const leftPower = this.directionToPower(commands.left_wheel);
    const rightPower = this.directionToPower(commands.right_wheel);

    this.deviceContext.setLeftWheel(leftPower);
    this.deviceContext.setRightWheel(rightPower);

    console.log(`[JEPA] Wheels: L=${leftPower}, R=${rightPower}`);
  }

  private directionToPower(direction: WheelDirection): number {
    switch (direction) {
      case 'forward': return 80;
      case 'backward': return -80;
      default: return 0;
    }
  }

  /**
   * Verify how accurate the last prediction was
   */
  private verifyPrediction(
    prediction: MentalPrediction,
    actualState: AbstractState
  ): number {
    let matches = 0;
    let total = 3;

    // Check front status prediction
    const actualFront = actualState.surroundings.front.distance;
    const predictedFront = prediction.predictedState.frontStatus.toLowerCase();

    if (
      (actualFront === 'far' && predictedFront.includes('open')) ||
      (actualFront === 'danger' && predictedFront.includes('blocked')) ||
      (actualFront === 'close' && predictedFront.includes('close'))
    ) {
      matches++;
    }

    // Check if goal progress prediction was correct
    const goalOnTrack = actualState.goalProgress.onTrack;
    const predictedProgress = prediction.predictedState.goalProgress;

    if (
      (goalOnTrack && predictedProgress === 'positive') ||
      (!goalOnTrack && predictedProgress !== 'positive')
    ) {
      matches++;
    }

    // Check stuck prediction
    const actualStuck = actualState.exploration.stuckRisk > 0.5;
    const predictedRisk = prediction.predictedState.riskPercent > 50;

    if (actualStuck === predictedRisk) {
      matches++;
    }

    return matches / total;
  }

  /**
   * Get the simulation result for the selected action
   */
  private getSelectedPrediction(response: JEPAResponse): SimulationResult {
    const action = response.selected_action.action;
    const sim = response.mental_simulation;

    switch (action) {
      case 'move_forward': return sim.forward_prediction;
      case 'turn_left': return sim.left_prediction;
      case 'turn_right': return sim.right_prediction;
      case 'backup': return sim.backup_prediction;
      default: return sim.forward_prediction;
    }
  }

  /**
   * Get average prediction accuracy
   */
  getAveragePredictionAccuracy(): number {
    if (this.state.predictionAccuracy.length === 0) return 0;
    const sum = this.state.predictionAccuracy.reduce((a, b) => a + b, 0);
    return sum / this.state.predictionAccuracy.length;
  }

  /**
   * Get current state
   */
  getState(): JEPAAgentState {
    return this.state;
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function createJEPAAgent(goal: string): JEPAAgentRuntime {
  return new JEPAAgentRuntime(goal);
}

export default JEPAAgentRuntime;
