/**
 * Demo multi-agent chat messages for showcasing the UI
 * These messages simulate interaction between user, system agent, and sub-agents
 */

export interface DemoParticipant {
  id: string;
  name: string;
  type: 'user' | 'assistant' | 'agent' | 'system-agent' | 'sub-agent';
  color: string;
  role?: string;
}

export interface DemoFileReference {
  path: string;
  name: string;
  type: 'code' | 'plan' | 'output';
}

export interface DemoAgentCall {
  agentId: string;
  agentName: string;
  purpose: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
}

export interface DemoAlternative {
  id: string;
  content: string;
  proposer: string;
  proposerType?: DemoParticipant['type'];
  confidence: number;
  votes: number;
  selected?: boolean;
}

export interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  participantId?: string;
  branchId?: number;
  isDecisionPoint?: boolean;
  alternatives?: DemoAlternative[];
  agentCalls?: DemoAgentCall[];
  fileReferences?: DemoFileReference[];
  isSystemMessage?: boolean;
}

// Default participants for multi-agent demo
export const DEMO_PARTICIPANTS: DemoParticipant[] = [
  { id: 'user', name: 'You', type: 'user', color: '#58a6ff' },
  { id: 'system', name: 'System Agent', type: 'system-agent', color: '#a371f7' },
  { id: 'planner', name: 'Planner', type: 'sub-agent', color: '#3fb950', role: 'planner' },
  { id: 'coder', name: 'Coder', type: 'sub-agent', color: '#ffa657', role: 'coder' },
  { id: 'reviewer', name: 'Reviewer', type: 'sub-agent', color: '#f778ba', role: 'reviewer' },
];

// Demo messages showing multi-agent interaction with voting
export const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: 'demo-1',
    role: 'user',
    content: 'Create a Robot4 firmware that follows a line track:\n\nRequirements:\n- Use the 5 line sensors (R4_LINE array)\n- Implement PD control for smooth steering\n- LED color indicates tracking status\n- Maximize speed while staying on track\n\nThe arena should have a figure-8 or complex track pattern. Compile and run in the Robot4 World simulator.',
    timestamp: '09:47',
    participantId: 'user',
  },
  {
    id: 'demo-2',
    role: 'assistant',
    content: 'I\'ll help you create a line-following robot firmware. Let me analyze the requirements and coordinate with the team.',
    timestamp: '09:47',
    participantId: 'system',
    isSystemMessage: true,
    agentCalls: [
      {
        agentId: 'planner',
        agentName: 'Planner Agent',
        purpose: 'Breaking down the task into implementation steps',
        status: 'completed',
        result: 'Created 4-step implementation plan',
      },
    ],
  },
  {
    id: 'demo-3',
    role: 'assistant',
    content: 'Based on the requirements, I\'ve identified multiple approaches for implementing the PD controller. The team has proposed different solutions:',
    timestamp: '09:48',
    participantId: 'system',
    isSystemMessage: true,
    branchId: 0,
    isDecisionPoint: true,
    alternatives: [
      {
        id: 'alt-1',
        content: 'Classic PD Controller with fixed gains (Kp=0.5, Kd=0.2). Simple and reliable, good for standard tracks. May struggle with sharp turns at high speeds.',
        proposer: 'Planner',
        confidence: 0.75,
        votes: 1,
        selected: false,
      },
      {
        id: 'alt-2',
        content: 'Adaptive PD Controller with dynamic gain adjustment based on track curvature detection. Higher complexity but better performance on complex tracks.',
        proposer: 'Coder',
        confidence: 0.85,
        votes: 2,
        selected: false,
      },
      {
        id: 'alt-3',
        content: 'Weighted sensor fusion with PID control. Uses all 5 sensors with weighted average for smoother tracking. Best accuracy but higher computational cost.',
        proposer: 'Reviewer',
        confidence: 0.80,
        votes: 1,
        selected: false,
      },
    ],
  },
  {
    id: 'demo-4',
    role: 'assistant',
    content: 'Based on the voting and confidence levels, I\'ll proceed with Option 2: Adaptive PD Controller. Let me generate the implementation.',
    timestamp: '09:49',
    participantId: 'system',
    isSystemMessage: true,
    branchId: 1,
    agentCalls: [
      {
        agentId: 'coder',
        agentName: 'Coder Agent',
        purpose: 'Implementing adaptive PD controller firmware',
        status: 'completed',
        result: 'Generated robot4_firmware.c',
      },
      {
        agentId: 'reviewer',
        agentName: 'Reviewer Agent',
        purpose: 'Code review and optimization suggestions',
        status: 'completed',
        result: 'Approved with minor optimizations',
      },
    ],
    fileReferences: [
      { path: 'output/robot4_firmware.c', name: 'robot4_firmware.c', type: 'code' },
      { path: 'output/implementation_plan.md', name: 'implementation_plan.md', type: 'plan' },
    ],
  },
  {
    id: 'demo-5',
    role: 'assistant',
    content: 'The firmware has been created with the following features:\n\n**Adaptive PD Controller:**\n- Base gains: Kp=0.5, Kd=0.2\n- Dynamic adjustment based on sensor spread\n- Curvature detection for sharp turns\n\n**LED Status Indicators:**\n- Green: On track, moving forward\n- Yellow: Minor correction needed\n- Red: Major correction or lost track\n\n**Speed Optimization:**\n- Base speed: 200 units\n- Reduces speed in curves\n- Maximum speed on straights\n\nClick the file links above to view the code in the main panel.',
    timestamp: '09:50',
    participantId: 'system',
    isSystemMessage: true,
    branchId: 1,
  },
];

// Function to get demo messages for testing
export function getDemoMessages(): DemoMessage[] {
  return DEMO_MESSAGES;
}

// Function to get demo participants
export function getDemoParticipants(): DemoParticipant[] {
  return DEMO_PARTICIPANTS;
}
