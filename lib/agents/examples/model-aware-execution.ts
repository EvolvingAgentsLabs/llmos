/**
 * Model-Aware Agent Execution Examples
 *
 * This file demonstrates how to use the new agent compilation and
 * execution system for different LLM models.
 *
 * Key concepts:
 * 1. Model capabilities detection
 * 2. Automatic strategy selection
 * 3. Agent compilation for non-Claude models
 * 4. Enhanced inter-agent messaging
 */

import {
  // Model capabilities
  getModelCapabilities,
  getExecutionStrategy,
  shouldCompileAgents,
  getAgentCapabilityScore,
  analyzeTaskComplexity,

  // Agent compilation
  createAgentCompiler,
  compileAgentForModel,
  loadAgent,

  // Runtime execution
  createRuntime,
  executeAgent,

  // Messaging
  createMessengerHub,
  createAgentIdentity,
} from '../index';

// =============================================================================
// Example 1: Check Model Capabilities
// =============================================================================

export function demonstrateModelCapabilities() {
  const models = [
    'anthropic/claude-opus-4.5',
    'anthropic/claude-sonnet-4.5',
    'google/gemini-2.0-flash',
    'meta-llama/llama-3.3-70b',
    'openai/gpt-4o',
    'mistral/mistral-large',
  ];

  console.log('Model Capabilities Analysis:\n');

  for (const modelId of models) {
    const capabilities = getModelCapabilities(modelId);
    const strategy = getExecutionStrategy(modelId);
    const score = getAgentCapabilityScore(modelId);
    const shouldCompile = shouldCompileAgents(modelId);

    console.log(`Model: ${modelId}`);
    console.log(`  Provider: ${capabilities.provider}`);
    console.log(`  Markdown Following: ${capabilities.markdownInstructionFollowing}`);
    console.log(`  Tool Use: ${capabilities.toolUseAccuracy}`);
    console.log(`  Recommended Strategy: ${strategy}`);
    console.log(`  Agent Capability Score: ${score}/100`);
    console.log(`  Should Compile Agents: ${shouldCompile}`);
    console.log('');
  }
}

// =============================================================================
// Example 2: Compile an Agent for a Specific Model
// =============================================================================

export async function demonstrateAgentCompilation() {
  // Load a markdown agent
  const agent = await loadAgent('system/agents/PlanningAgent.md');

  if (!agent) {
    console.log('Could not load agent');
    return;
  }

  console.log('Original Agent:', agent.frontmatter.name);
  console.log('Original System Prompt Length:', agent.systemPrompt.length, 'chars');
  console.log('');

  // Compile for different models
  const targetModels = [
    'anthropic/claude-opus-4.5',  // Will use markdown strategy
    'google/gemini-2.0-flash',    // Will use compiled strategy
    'meta-llama/llama-3.1-8b',    // Will use simple strategy
  ];

  for (const modelId of targetModels) {
    const compiler = createAgentCompiler(modelId);
    const compiled = compiler.compile(agent);

    console.log(`Compiled for: ${modelId}`);
    console.log(`  Strategy: ${compiled.strategy}`);
    console.log(`  System Prompt Length: ${compiled.systemPrompt.length} chars`);
    console.log(`  Tools: ${compiled.tools.length}`);
    console.log(`  Max Context: ${compiled.contextConfig.maxTokens} tokens`);
    console.log('');
  }
}

// =============================================================================
// Example 3: Execute Agent with Model-Aware Runtime
// =============================================================================

export async function demonstrateRuntimeExecution() {
  // Example: Execute the same task with different models
  const task = 'Analyze the project structure and create a summary';

  // Claude - will use markdown strategy
  console.log('Executing with Claude Opus 4.5...');
  const claudeRuntime = createRuntime('anthropic/claude-opus-4.5', {
    verbose: true,
  });

  console.log(`  Strategy: ${claudeRuntime.getStrategy()}`);

  // Gemini - will use compiled strategy
  console.log('\nExecuting with Gemini 2.0 Flash...');
  const geminiRuntime = createRuntime('google/gemini-2.0-flash', {
    verbose: true,
  });

  console.log(`  Strategy: ${geminiRuntime.getStrategy()}`);

  // The actual execution would be:
  // const result = await claudeRuntime.execute({
  //   agentPath: 'system/agents/PlanningAgent.md',
  //   task: task,
  // });
}

// =============================================================================
// Example 4: Task Complexity Analysis
// =============================================================================

export function demonstrateTaskAnalysis() {
  const tasks = [
    'Fix the typo in README',
    'Create a multi-agent system for data analysis with visualization',
    'Add a new function to calculate averages',
    'Architect a distributed system with microservices and event sourcing',
  ];

  console.log('Task Complexity Analysis:\n');

  for (const task of tasks) {
    const analysis = analyzeTaskComplexity(task);
    console.log(`Task: "${task.substring(0, 50)}..."`);
    console.log(`  Complexity: ${analysis.complexity}`);
    if (analysis.suggestedStrategyAdjustment) {
      console.log(`  Suggested adjustments:`, analysis.suggestedStrategyAdjustment);
    }
    console.log('');
  }
}

// =============================================================================
// Example 5: Inter-Agent Messaging
// =============================================================================

export async function demonstrateMessaging() {
  // Create a messenger hub for a specific model
  const hub = createMessengerHub('google/gemini-2.0-flash');

  // Create agent identities
  const controller = createAgentIdentity({
    id: 'controller',
    name: 'Controller',
  }, 'controller');

  const dataAgent = createAgentIdentity({
    id: 'data-agent',
    name: 'DataAnalystAgent',
  }, 'subagent');

  const vizAgent = createAgentIdentity({
    id: 'viz-agent',
    name: 'VisualizationAgent',
  }, 'subagent');

  // Subscribe to messages
  hub.subscribe('data-agent', (msg) => {
    console.log(`DataAgent received: ${msg.type} from ${msg.from.name}`);
  });

  hub.subscribe('viz-agent', (msg) => {
    console.log(`VizAgent received: ${msg.type} from ${msg.from.name}`);
  });

  // Send a message
  await hub.sendMessage({
    from: controller,
    to: dataAgent,
    type: 'task_request',
    content: {
      text: 'Analyze the sales data',
      task: {
        description: 'Load and analyze sales_data.csv',
        expectedOutput: 'Summary statistics and trends',
      },
    },
    priority: 'high',
  });

  // Broadcast to all
  await hub.broadcast(controller, {
    text: 'Starting analysis workflow',
  });

  // Delegate a task
  const result = await hub.delegateTask(
    controller,
    dataAgent,
    {
      description: 'Calculate monthly averages',
      expectedOutput: 'JSON with monthly values',
    },
    5000  // 5 second timeout
  );

  console.log('Delegation result:', result);
}

// =============================================================================
// Example 6: Full Workflow with Strategy Selection
// =============================================================================

export async function demonstrateFullWorkflow() {
  const modelId = 'google/gemini-2.0-flash'; // Could be any model
  const task = 'Create a signal processing visualization with FFT analysis';

  console.log('=== Full Workflow Demo ===\n');

  // 1. Check model capabilities
  const capabilities = getModelCapabilities(modelId);
  console.log(`1. Model: ${modelId}`);
  console.log(`   Markdown capability: ${capabilities.markdownInstructionFollowing}`);

  // 2. Determine strategy
  const strategy = getExecutionStrategy(modelId);
  console.log(`\n2. Selected strategy: ${strategy}`);

  // 3. Analyze task
  const taskAnalysis = analyzeTaskComplexity(task);
  console.log(`\n3. Task complexity: ${taskAnalysis.complexity}`);

  // 4. Create runtime
  const runtime = createRuntime(modelId, {
    verbose: true,
    enableMessaging: true,
  });

  console.log(`\n4. Runtime created with strategy: ${runtime.getStrategy()}`);

  // 5. Execute (placeholder - would actually call LLM)
  console.log('\n5. Ready for execution...');
  console.log(`   Would compile agents: ${shouldCompileAgents(modelId)}`);
  console.log(`   Context budget: ${capabilities.contextWindowSize} tokens`);

  // The actual execution:
  // const result = await runtime.execute({
  //   agentPath: 'system/agents/SystemAgent.md',
  //   task: task,
  //   context: { projectPath: 'projects/signal_analysis' },
  // });
}

// =============================================================================
// Run Examples
// =============================================================================

export async function runAllExamples() {
  console.log('========================================');
  console.log('Model-Aware Agent Execution Examples');
  console.log('========================================\n');

  console.log('--- Example 1: Model Capabilities ---\n');
  demonstrateModelCapabilities();

  console.log('\n--- Example 2: Agent Compilation ---\n');
  await demonstrateAgentCompilation();

  console.log('\n--- Example 3: Runtime Execution ---\n');
  await demonstrateRuntimeExecution();

  console.log('\n--- Example 4: Task Analysis ---\n');
  demonstrateTaskAnalysis();

  console.log('\n--- Example 5: Agent Messaging ---\n');
  await demonstrateMessaging();

  console.log('\n--- Example 6: Full Workflow ---\n');
  await demonstrateFullWorkflow();
}

// Usage: Import and call runAllExamples() to see demos
