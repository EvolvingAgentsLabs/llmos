/**
 * Robot LLM API Endpoint
 *
 * Called by ESP32AgentRuntime to get LLM decisions for robot control.
 *
 * Request:
 * POST /api/robot-llm
 * {
 *   deviceId: string,
 *   systemPrompt: string,
 *   userPrompt: string,
 *   tools: string
 * }
 *
 * Response:
 * {
 *   response: string  // LLM response with tool calls
 * }
 */

import { NextRequest, NextResponse } from 'next/server';

interface RobotLLMRequest {
  deviceId: string;
  systemPrompt: string;
  userPrompt: string;
  tools: string;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RobotLLMRequest = await request.json();

    const { deviceId, systemPrompt, userPrompt, tools } = body;

    // Validate required fields
    if (!deviceId || !systemPrompt || !userPrompt) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: ['deviceId', 'systemPrompt', 'userPrompt'],
        },
        { status: 400 }
      );
    }

    // Build the full system prompt with tools
    const fullSystemPrompt = tools
      ? `${systemPrompt}\n\n## Available Tools\n${tools}`
      : systemPrompt;

    // Build messages for LLM
    const messages: Message[] = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Get LLM client
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

    // Call LLM
    const response = await client.chatDirect(messages);

    console.log(`[RobotLLM] ${deviceId}: Got response (${response.length} chars)`);

    return NextResponse.json({
      success: true,
      response,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[RobotLLM] Error:', error);

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
 * OPTIONS handler for CORS preflight
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
