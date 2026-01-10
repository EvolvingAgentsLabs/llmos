/**
 * ESP32 Robot Tools Registry
 *
 * Registers ESP32 robot control tools with the MCP tool registry.
 */

import { getMCPToolRegistry, type MCPToolDefinition, type MCPToolResult } from '../agents/mcp-tools';
import { ESP32_ROBOT_TOOLS, type Tool } from './esp32-robot-tools';
import { getESP32RobotToolExecutor } from './esp32-robot-executor';

/**
 * Convert Tool to MCPToolDefinition
 */
function toMCPToolDefinition(tool: Tool): MCPToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties || {}).map(([key, value]) => [
          key,
          {
            type: String(value.type || 'string'),
            description: String(value.description || ''),
            enum: Array.isArray(value.enum) ? value.enum : undefined,
            default: value.default,
          },
        ])
      ),
      required: tool.inputSchema.required,
    },
  };
}

/**
 * Create executor for ESP32 tool
 */
function createExecutor(toolName: string): (args: Record<string, any>) => Promise<MCPToolResult> {
  return async (args: Record<string, any>) => {
    const executor = getESP32RobotToolExecutor();
    const result = await executor.execute(toolName, args);

    if (result.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${result.error}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Register all ESP32 robot tools with the MCP registry
 */
export function registerESP32RobotTools(): void {
  const registry = getMCPToolRegistry();

  for (const tool of ESP32_ROBOT_TOOLS) {
    const mcpDefinition = toMCPToolDefinition(tool);
    const executor = createExecutor(tool.name);
    registry.register(mcpDefinition, executor);
  }

  console.log(`[ESP32Tools] Registered ${ESP32_ROBOT_TOOLS.length} ESP32 robot tools`);
}

/**
 * Get all ESP32 tool definitions
 */
export function getESP32ToolDefinitions(): MCPToolDefinition[] {
  return ESP32_ROBOT_TOOLS.map(toMCPToolDefinition);
}

/**
 * Check if a tool is an ESP32 robot tool
 */
export function isESP32Tool(toolName: string): boolean {
  return ESP32_ROBOT_TOOLS.some((t) => t.name === toolName);
}

export default registerESP32RobotTools;
