/**
 * Kernel Module
 *
 * The unified client-side kernel that orchestrates all components.
 * This replaces the Python backend entirely - everything runs in the browser.
 *
 * ## Architecture
 *
 * ```
 * ClientKernel
 * ├── FileSystemStorage     (IndexedDB-backed filesystem)
 * ├── ClientSkillsManager   (skill loading and filtering)
 * ├── ClientEvolutionEngine (pattern detection and skill generation)
 * └── ClientAgentManager    (agent discovery and invocation)
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { getKernel } from '@/lib/kernel';
 *
 * // Initialize with LLM callback
 * const kernel = getKernel(async (messages) => {
 *   return await llmClient.chat(messages);
 * });
 *
 * // Create a project
 * const project = await kernel.createProject('my-project', 'Build a data analyzer');
 *
 * // Ensure agents exist
 * await kernel.ensureProjectAgents(project.path, project.goal);
 *
 * // Invoke an agent
 * const result = await kernel.invokeAgent(
 *   'projects/my-project/agents/AnalyzerAgent.md',
 *   'Analyze this dataset',
 *   project.path
 * );
 *
 * // Run evolution to generate skills
 * await kernel.runEvolution(project.path);
 * ```
 */

export {
  type KernelConfig,
  type ProjectContext,
  type ExecutionPlan,
  type ExecutionPhase,
  type ExecutionResult,
  type MemoryQuery,
  type MemoryMatch,
  ClientKernel,
  getKernel,
  resetKernel
} from './client-kernel';
