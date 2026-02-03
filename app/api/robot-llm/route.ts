/**
 * Robot LLM API Endpoint
 *
 * Called by ESP32AgentRuntime to get LLM decisions for robot control.
 * The LLM config is passed from the client since localStorage isn't
 * available server-side.
 *
 * Request:
 * POST /api/robot-llm
 * {
 *   deviceId: string,
 *   systemPrompt: string,
 *   userPrompt: string,
 *   tools: string,
 *   llmConfig: { apiKey: string, model: string, baseURL: string }
 * }
 *
 * Response:
 * {
 *   response: string  // LLM response with tool calls
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL: string;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface RobotLLMRequest {
  deviceId: string;
  systemPrompt: string;
  userPrompt: string;
  tools: string;
  conversationHistory?: ConversationMessage[];
  llmConfig: LLMConfig;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RobotLLMRequest = await request.json();

    const { deviceId, systemPrompt, userPrompt, tools, conversationHistory, llmConfig } = body;

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

    // Validate LLM config
    if (!llmConfig?.apiKey || !llmConfig?.model) {
      return NextResponse.json(
        {
          error: 'LLM not configured',
          hint: 'Configure API key and model in settings',
        },
        { status: 503 }
      );
    }

    // Build the full system prompt with tools
    const fullSystemPrompt = tools
      ? `${systemPrompt}\n\n## Available Tools\n${tools}`
      : systemPrompt;

    // Build messages for LLM - include conversation history if provided
    const messages: Message[] = [{ role: 'system', content: fullSystemPrompt }];

    // Add conversation history (excluding the current user prompt which we add separately)
    if (conversationHistory && conversationHistory.length > 0) {
      // Filter out system messages from history (we already have our own)
      // and the last user message (we'll add userPrompt instead)
      const historyWithoutLast = conversationHistory.slice(0, -1);
      for (const msg of historyWithoutLast) {
        if (msg.role !== 'system') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add the current user prompt
    messages.push({ role: 'user', content: userPrompt });

    // Create OpenAI client with passed config
    const client = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL,
    });

    // Call LLM
    const completion = await client.chat.completions.create({
      model: llmConfig.model,
      messages: messages,
    });

    const response = completion.choices[0]?.message?.content || '';

    console.log(`[RobotLLM] ${deviceId}: Got response (${response.length} chars), history: ${conversationHistory?.length || 0} msgs`);

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
