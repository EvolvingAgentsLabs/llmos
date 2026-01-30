/**
 * Gemini 3 Flash Agentic Vision Client
 *
 * Implements the Think-Act-Observe loop for active visual investigation.
 * Unlike static vision, Agentic Vision treats image understanding as an
 * investigation process - formulating plans, executing code to manipulate
 * images (zoom, crop, annotate), and verifying conclusions with pixel-level evidence.
 *
 * Based on: https://blog.google/innovation-and-ai/technology/developers-tools/agentic-vision-gemini-3-flash/
 */

import { logger } from '@/lib/debug/logger';
import { Message, ToolCall, ToolResult } from './types';

/**
 * Configuration for Agentic Vision behavior
 */
export interface AgenticVisionConfig {
  /** Enable code execution for image manipulation (zoom, crop, annotate) */
  enableCodeExecution: boolean;
  /** Maximum Think-Act-Observe iterations before returning */
  maxIterations: number;
  /** Image format for encoding */
  imageFormat: 'jpeg' | 'png';
  /** Confidence threshold below which to trigger investigation */
  investigationThreshold: number;
  /** API key for Gemini */
  apiKey: string;
  /** Base URL for API (defaults to Google AI Studio) */
  baseURL?: string;
}

/**
 * Result from a single code execution step
 */
export interface CodeExecutionStep {
  /** Python code that was executed */
  code: string;
  /** Output from execution (may include transformed image) */
  output: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Transformed image data URL if produced */
  transformedImage?: string;
}

/**
 * Result from Agentic Vision analysis
 */
export interface AgenticVisionResult {
  /** Text reasoning from the model */
  reasoning: string;
  /** Code execution steps performed during investigation */
  codeExecutions: CodeExecutionStep[];
  /** Tool calls for HAL operations (motor control, etc.) */
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Confidence in the analysis (0-1) */
  confidence: number;
  /** Number of Think-Act-Observe iterations performed */
  iterations: number;
  /** Detected objects with bounding boxes if annotated */
  detectedObjects?: Array<{
    label: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  /** Alerts triggered based on skill-defined conditions */
  alerts: string[];
}

/**
 * HAL (Hardware Abstraction Layer) tool declaration for Gemini
 */
export interface HALToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Gemini 3 Flash Agentic Vision Client
 *
 * Provides active visual investigation capabilities through the
 * Think-Act-Observe loop. Integrates with LLMos skill cartridges
 * and HAL tools for robot control.
 */
export class GeminiAgenticVision {
  private config: AgenticVisionConfig;

  constructor(config: Partial<AgenticVisionConfig> & { apiKey: string }) {
    this.config = {
      enableCodeExecution: true,
      maxIterations: 3,
      imageFormat: 'jpeg',
      investigationThreshold: 0.7,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      ...config,
    };

    logger.info('llm', 'Agentic Vision client initialized', {
      codeExecution: this.config.enableCodeExecution,
      maxIterations: this.config.maxIterations,
    });
  }

  /**
   * Analyze an image using Agentic Vision with Think-Act-Observe loop
   *
   * @param imageDataUrl - Base64 encoded image data URL
   * @param skillPrompt - Visual Cortex instructions from the active skill
   * @param sensorContext - Additional sensor data for context
   * @returns Analysis result with reasoning, tool calls, and confidence
   */
  async analyzeWithAgenticVision(
    imageDataUrl: string,
    skillPrompt: string,
    sensorContext?: Record<string, unknown>
  ): Promise<AgenticVisionResult> {
    logger.time('agentic-vision', 'llm', 'Agentic Vision analysis');

    const result: AgenticVisionResult = {
      reasoning: '',
      codeExecutions: [],
      toolCalls: [],
      confidence: 0,
      iterations: 0,
      alerts: [],
    };

    try {
      // Build the complete prompt with skill context
      const systemPrompt = this.buildSystemPrompt(skillPrompt, sensorContext);

      // Prepare the request with code execution enabled
      const requestBody = this.buildRequestBody(
        imageDataUrl,
        systemPrompt,
        this.config.enableCodeExecution
      );

      // Make the API call
      const response = await this.callGeminiAPI(requestBody);

      // Parse the response
      const parsedResult = this.parseResponse(response);

      result.reasoning = parsedResult.reasoning;
      result.codeExecutions = parsedResult.codeExecutions;
      result.toolCalls = parsedResult.toolCalls;
      result.confidence = parsedResult.confidence;
      result.iterations = parsedResult.iterations;
      result.detectedObjects = parsedResult.detectedObjects;
      result.alerts = parsedResult.alerts;

      logger.timeEnd('agentic-vision', true, {
        iterations: result.iterations,
        codeExecutions: result.codeExecutions.length,
        toolCalls: result.toolCalls.length,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      logger.error('llm', 'Agentic Vision analysis failed', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Build system prompt combining skill instructions with Agentic Vision guidance
   */
  private buildSystemPrompt(
    skillPrompt: string,
    sensorContext?: Record<string, unknown>
  ): string {
    return `# Active Skill
${skillPrompt}

# Sensor Context
${sensorContext ? JSON.stringify(sensorContext, null, 2) : 'No additional sensors'}

# Agentic Vision Instructions

You are analyzing a camera frame from a robot. Use the Think-Act-Observe pattern:

## THINK Phase
- Analyze what you see in the image
- Refer to Visual Cortex Instructions from the skill for what to look for
- Formulate a plan if investigation is needed

## ACT Phase (Code Execution)
If you need to investigate details:
- Use Python code execution to zoom, crop, or annotate the image
- Available operations:
  - \`crop_region(img, x, y, w, h)\` - Crop to inspect details
  - \`zoom_region(img, x, y, factor)\` - Zoom in on a point
  - \`annotate_objects(img, boxes, labels)\` - Draw bounding boxes
  - \`measure_angle(img, p1, p2, p3)\` - Measure angles (e.g., leaf droop)
  - \`analyze_color(img, region)\` - Get HSV values for moisture/health

## OBSERVE Phase
- Verify your conclusions with the transformed image
- Only proceed to tool calls when confident

## Response Format
After analysis, respond with HAL tool calls for robot actions.
If confidence is below ${this.config.investigationThreshold * 100}%, use code execution to investigate further.

Available HAL Tools:
- hal_drive(left, right) - Control wheel motors (-255 to 255)
- hal_move_to(x, y, z) - Move arm to position
- hal_grasp(force) - Control gripper (0-100%)
- hal_speak(text) - Output audio message
- hal_vision_scan() - Request environment scan

Always verify visual evidence before taking action.`;
  }

  /**
   * Build the API request body for Gemini
   */
  private buildRequestBody(
    imageDataUrl: string,
    systemPrompt: string,
    enableCodeExecution: boolean
  ): Record<string, unknown> {
    const base64Data = this.extractBase64(imageDataUrl);
    const mimeType = imageDataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';

    const tools: Record<string, unknown>[] = [];

    // Add code execution tool if enabled
    if (enableCodeExecution) {
      tools.push({
        codeExecution: {},
      });
    }

    // Add HAL tools for robot control
    tools.push({
      functionDeclarations: this.getHALToolDeclarations(),
    });

    return {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: systemPrompt,
            },
          ],
        },
      ],
      tools,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    };
  }

  /**
   * Call the Gemini API
   */
  private async callGeminiAPI(
    requestBody: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${this.config.baseURL}/models/gemini-3-flash-preview:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Parse Gemini response into structured result
   */
  private parseResponse(response: Record<string, unknown>): AgenticVisionResult {
    const result: AgenticVisionResult = {
      reasoning: '',
      codeExecutions: [],
      toolCalls: [],
      confidence: 0.85,
      iterations: 0,
      alerts: [],
    };

    try {
      const candidates = response.candidates as Array<Record<string, unknown>>;
      if (!candidates || candidates.length === 0) {
        return result;
      }

      const content = candidates[0].content as Record<string, unknown>;
      const parts = content?.parts as Array<Record<string, unknown>>;

      if (!parts) {
        return result;
      }

      let textParts: string[] = [];

      for (const part of parts) {
        // Handle text content
        if (part.text) {
          textParts.push(part.text as string);
        }

        // Handle code execution results
        if (part.executableCode) {
          const codeExec = part.executableCode as Record<string, unknown>;
          result.codeExecutions.push({
            code: (codeExec.code as string) || '',
            output: '',
            success: true,
          });
          result.iterations++;
        }

        if (part.codeExecutionResult) {
          const execResult = part.codeExecutionResult as Record<string, unknown>;
          if (result.codeExecutions.length > 0) {
            const lastExec = result.codeExecutions[result.codeExecutions.length - 1];
            lastExec.output = (execResult.output as string) || '';
            lastExec.success = (execResult.outcome as string) === 'OUTCOME_OK';
          }
        }

        // Handle function calls (HAL tools)
        if (part.functionCall) {
          const funcCall = part.functionCall as Record<string, unknown>;
          result.toolCalls.push({
            name: funcCall.name as string,
            args: (funcCall.args as Record<string, unknown>) || {},
          });
        }
      }

      result.reasoning = textParts.join('\n');

      // Extract alerts from reasoning
      const alertPattern = /Alert:\s*"([^"]+)"/g;
      let match;
      while ((match = alertPattern.exec(result.reasoning)) !== null) {
        result.alerts.push(match[1]);
      }

      // Estimate confidence from response characteristics
      result.confidence = this.estimateConfidence(result);

    } catch (error) {
      logger.error('llm', 'Failed to parse response', {
        error: error instanceof Error ? error.message : error,
      });
    }

    return result;
  }

  /**
   * Estimate confidence based on analysis characteristics
   */
  private estimateConfidence(result: AgenticVisionResult): number {
    let confidence = 0.7; // Base confidence

    // Increase for code execution (verified investigation)
    if (result.codeExecutions.length > 0) {
      confidence += 0.1;
    }

    // Increase if all code executions succeeded
    const allSuccess = result.codeExecutions.every((e) => e.success);
    if (allSuccess && result.codeExecutions.length > 0) {
      confidence += 0.05;
    }

    // Decrease if alerts were triggered
    if (result.alerts.length > 0) {
      confidence -= 0.05 * result.alerts.length;
    }

    // Increase if specific tool calls were made
    if (result.toolCalls.length > 0) {
      confidence += 0.05;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Get HAL tool declarations for Gemini function calling
   */
  private getHALToolDeclarations(): HALToolDeclaration[] {
    return [
      {
        name: 'hal_vision_scan',
        description: 'Scan environment and return detected objects with 3D coordinates',
        parameters: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              description: 'Scan mode: full, targeted, or quick',
              enum: ['full', 'targeted', 'quick'],
            },
          },
        },
      },
      {
        name: 'hal_drive',
        description: 'Control wheel motors for differential drive locomotion',
        parameters: {
          type: 'object',
          properties: {
            left: {
              type: 'number',
              description: 'Left wheel power (-255 to 255)',
            },
            right: {
              type: 'number',
              description: 'Right wheel power (-255 to 255)',
            },
            duration_ms: {
              type: 'number',
              description: 'Duration in milliseconds (optional)',
            },
          },
          required: ['left', 'right'],
        },
      },
      {
        name: 'hal_move_to',
        description: 'Move robot arm/manipulator to 3D position',
        parameters: {
          type: 'object',
          properties: {
            x: {
              type: 'number',
              description: 'X coordinate in meters',
            },
            y: {
              type: 'number',
              description: 'Y coordinate in meters',
            },
            z: {
              type: 'number',
              description: 'Z coordinate in meters',
            },
            speed: {
              type: 'number',
              description: 'Movement speed (0-100%)',
            },
          },
          required: ['x', 'y', 'z'],
        },
      },
      {
        name: 'hal_grasp',
        description: 'Control gripper/end effector',
        parameters: {
          type: 'object',
          properties: {
            force: {
              type: 'number',
              description: 'Grip force percentage (0-100)',
            },
            mode: {
              type: 'string',
              description: 'Grip mode: open, close, or hold',
              enum: ['open', 'close', 'hold'],
            },
          },
          required: ['force'],
        },
      },
      {
        name: 'hal_speak',
        description: 'Output audio message through robot speaker',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Message to speak',
            },
            urgency: {
              type: 'string',
              description: 'Urgency level: info, warning, or alert',
              enum: ['info', 'warning', 'alert'],
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'hal_set_led',
        description: 'Control robot LED indicators',
        parameters: {
          type: 'object',
          properties: {
            r: {
              type: 'number',
              description: 'Red value (0-255)',
            },
            g: {
              type: 'number',
              description: 'Green value (0-255)',
            },
            b: {
              type: 'number',
              description: 'Blue value (0-255)',
            },
            pattern: {
              type: 'string',
              description: 'LED pattern: solid, blink, or pulse',
              enum: ['solid', 'blink', 'pulse'],
            },
          },
          required: ['r', 'g', 'b'],
        },
      },
      {
        name: 'hal_emergency_stop',
        description: 'Immediately stop all robot motion',
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Reason for emergency stop',
            },
          },
        },
      },
    ];
  }

  /**
   * Extract base64 data from data URL
   */
  private extractBase64(dataUrl: string): string {
    const base64Match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    return base64Match ? base64Match[1] : dataUrl;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgenticVisionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AgenticVisionConfig {
    return { ...this.config };
  }
}

/**
 * Create Agentic Vision client from environment/storage
 */
export function createAgenticVisionClient(
  apiKey: string,
  config?: Partial<Omit<AgenticVisionConfig, 'apiKey'>>
): GeminiAgenticVision {
  return new GeminiAgenticVision({
    apiKey,
    ...config,
  });
}
