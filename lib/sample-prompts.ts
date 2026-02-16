/**
 * Sample Prompts - Stub
 * Original implementation removed during cleanup.
 */

export interface SamplePrompt {
  title: string;
  description: string;
  prompt: string;
}

export function getCurrentSamplePrompts(): SamplePrompt[] {
  return [
    {
      title: 'Get started',
      description: 'Learn what LLMos can help you with',
      prompt: 'What can you help me with?',
    },
    {
      title: 'Create a robot behavior',
      description: 'Design an autonomous behavior for a robot',
      prompt: 'Help me create a robot behavior that navigates obstacles',
    },
    {
      title: 'Explore the system',
      description: 'Browse system volumes and available tools',
      prompt: 'Show me what tools and agents are available in the system',
    },
  ];
}
