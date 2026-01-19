/**
 * Device LLM Request API Endpoint
 *
 * This endpoint is called by ESP32-S3 devices running robot agents.
 * The device sends its current sensor context and receives LLM responses
 * with tool calls to execute locally on the hardware.
 *
 * Architecture:
 * - ESP32-S3 device runs the agent loop
 * - Device reads sensors locally
 * - Device calls this endpoint for LLM "thinking"
 * - Device executes returned tool calls on local hardware
 *
 * Request:
 * POST /api/device/llm-request
 * {
 *   deviceId: string,
 *   agentId: string,
 *   systemPrompt: string,
 *   sensorContext: string,
 *   conversationHistory?: Message[]
 * }
 *
 * Response:
 * {
 *   response: string,  // LLM response with tool calls
 *   toolCalls: Array<{tool: string, args: object}>
 * }
 */

import { NextRequest, NextResponse } from 'next/server';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeviceLLMRequest {
  deviceId: string;
  agentId: string;
  systemPrompt: string;
  sensorContext: string;
  conversationHistory?: Message[];
}

export async function POST(request: NextRequest) {
  try {
    const body: DeviceLLMRequest = await request.json();

    const { deviceId, agentId, systemPrompt, sensorContext, conversationHistory = [] } = body;

    // Validate required fields
    if (!deviceId || !agentId || !systemPrompt || !sensorContext) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: ['deviceId', 'agentId', 'systemPrompt', 'sensorContext'],
        },
        { status: 400 }
      );
    }

    // Build messages for LLM
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: sensorContext },
    ];

    // Call LLM
    // In production, this would use the configured LLM provider
    // For now, we'll use a direct import of the LLM client
    const { createLLMClient } = await import('@/lib/llm/client');
    const client = createLLMClient();

    if (!client) {
      return NextResponse.json(
        {
          error: 'LLM client not available',
          hint: 'Configure API key in settings',
        },
        { status: 503 }
      );
    }

    const response = await client.chatDirect(messages);

    // Parse tool calls from response
    const toolCalls = parseToolCalls(response);

    // Log request for debugging/monitoring
    console.log(`[DeviceLLM] ${deviceId}/${agentId}: ${toolCalls.length} tool calls`);

    return NextResponse.json({
      success: true,
      response,
      toolCalls,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[DeviceLLM] Error:', error);

    return NextResponse.json(
      {
        error: 'LLM request failed',
        message: error.message || String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Parse tool calls from LLM response
 */
function parseToolCalls(response: string): Array<{ tool: string; args: Record<string, any> }> {
  const calls: Array<{ tool: string; args: Record<string, any> }> = [];

  // Find all JSON objects with tool calls
  const jsonPattern = /\{[\s\S]*?"tool"[\s\S]*?\}/g;
  const matches = response.match(jsonPattern) || [];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);
      if (parsed.tool && typeof parsed.tool === 'string') {
        calls.push({
          tool: parsed.tool,
          args: parsed.args || {},
        });
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return calls;
}

/**
 * OPTIONS handler for CORS preflight
 * Needed for ESP32 devices making cross-origin requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
