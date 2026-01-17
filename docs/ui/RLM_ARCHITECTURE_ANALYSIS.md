# Recursive Language Models (RLM) Architecture Analysis for LLMos

**Last Updated:** January 2026

## Executive Summary

This document analyzes the Recursive Language Models (RLM) paper and its implications for LLMos architecture. The RLM paradigm offers significant advantages for handling long-context tasks by treating prompts as external environment objects rather than direct neural network inputs.

## Key Insights from the RLM Paper

### 1. Core RLM Concept

**Traditional Approach:**
```
User Prompt → LLM (all in context) → Response
```

**RLM Approach:**
```
User Prompt → REPL Environment (prompt as variable)
                     ↓
              LLM writes code to:
              - Peek into prompt
              - Decompose prompt
              - Recursively call sub-LLMs
                     ↓
              Final Response
```

### 2. Why This Matters for LLMos

LLMos currently suffers from several limitations that RLM directly addresses:

| Current Issue | RLM Solution |
|--------------|--------------|
| Context rot at 180K tokens | Prompt stored externally, accessed programmatically |
| Sequential API calls | Sub-LM calls can be parallelized |
| Full context per request | Selective context viewing |
| Hard iteration limits | Confidence-based termination |

### 3. Performance Improvements from Paper

From the paper's empirical results:

- **10M+ token handling**: RLMs handle inputs 2 orders of magnitude beyond context windows
- **28-33% improvement**: On OOLONG benchmark vs base models
- **Comparable costs**: Median RLM cost equals or beats base model cost
- **Task complexity scaling**: RLM degrades much slower on complex tasks

## Proposed LLMos-RLM Architecture

### Phase 1: REPL-Based Context Management

```typescript
interface RLMContext {
  // Prompt stored as environment variable
  prompt: string;

  // REPL state
  variables: Map<string, unknown>;

  // Sub-LM query function
  llmQuery: (subPrompt: string, context?: string) => Promise<string>;

  // Execution history
  codeHistory: Array<{
    code: string;
    output: string;
    timestamp: number;
  }>;
}
```

### Phase 2: Recursive Sub-Agent Calls

Instead of loading full context into each agent:

```typescript
// Current approach (problematic)
async function executeAgent(fullContext: string) {
  // All 180K tokens sent to LLM
  return await llm.chat(fullContext);
}

// RLM approach (proposed)
async function executeAgentRLM(contextRef: ContextReference) {
  // Only metadata sent to LLM
  const llm = new RLMAgent({
    contextVar: contextRef.id,
    contextLength: contextRef.length,
    peekFunction: (start, end) => contextRef.slice(start, end),
    subQuery: (prompt, snippet) => this.querySubLLM(prompt, snippet),
  });

  return await llm.execute();
}
```

### Phase 3: Integration Points in LLMos

#### 3.1 System Agent Orchestrator Changes

```typescript
// Current: system-agent-orchestrator.ts:384-385
const llmResponse = await llmClient.chatDirect(contextResult.messages);

// Proposed RLM enhancement:
const rlmContext = createRLMContext(userGoal, workspaceContext);
const llmResponse = await rlmClient.executeWithREPL(rlmContext, {
  maxSubCalls: 10,
  chunkSize: 50000, // chars per sub-call
  parallelSubCalls: true,
});
```

#### 3.2 Workflow Context Manager Changes

```typescript
// Current: workflow-context-manager.ts summarizes when over limit

// Proposed: Never summarize, use RLM pattern instead
class RLMContextManager {
  private contextStore: Map<string, string> = new Map();

  // Store context externally
  storeContext(id: string, content: string): void {
    this.contextStore.set(id, content);
  }

  // Generate REPL-aware prompt
  buildRLMPrompt(contextId: string, query: string): string {
    const length = this.contextStore.get(contextId)?.length || 0;

    return `
You have access to a context variable with ${length} characters.
Use the following functions to interact with it:

- peek(start, end): View characters from start to end
- chunk(size): Get iterator of size-character chunks
- search(pattern): Find all matches of regex pattern
- subQuery(prompt, context): Query a sub-LLM with specific context

Query: ${query}

Write code to analyze the context and answer the query.
`;
  }
}
```

## Implementation Roadmap

### Immediate (Can Do Now)

1. **Smart Token Estimation** ✅ (Implemented)
   - `lib/utils/smart-token-estimator.ts`
   - Content-aware token ratios

2. **Parallel Tool Execution** ✅ (Implemented)
   - `lib/utils/parallel-tool-executor.ts`
   - Dependency analysis and batching

3. **Confidence-Based Stopping** ✅ (Implemented)
   - `lib/utils/confidence-based-stopping.ts`
   - Pattern-based completion detection

4. **Lazy Skill Loading** ✅ (Implemented)
   - `lib/utils/lazy-skill-loader.ts`
   - On-demand skill fetching

### Short-Term (1-2 Weeks)

1. **External Context Store**
   - Store long contexts in VFS
   - Provide peek/search APIs
   - Reduce per-request token usage

2. **Sub-LM Query System**
   - Implement `llm_query()` function
   - Support for GPT-5-mini style sub-calls
   - Automatic chunking strategies

### Medium-Term (1-2 Months)

1. **Full REPL Integration**
   - Python REPL with context variable
   - Code execution feedback loop
   - Variable persistence across iterations

2. **Recursive Agent Framework**
   - Agents can spawn sub-agents
   - Hierarchical task decomposition
   - Result aggregation patterns

## Cost-Benefit Analysis

### Current LLMos Costs (per complex task)

| Operation | Tokens | Cost (Claude Sonnet) |
|-----------|--------|---------------------|
| System prompt | ~5K | $0.015 |
| Context (180K max) | ~180K | $0.54 |
| Tool results (10 calls) | ~50K | $0.15 |
| Response | ~4K | $0.06 |
| **Total** | **~239K** | **$0.765** |

### Proposed RLM Costs (same task)

| Operation | Tokens | Cost |
|-----------|--------|------|
| Root prompt + REPL setup | ~3K | $0.009 |
| Peek operations (5x) | ~25K total | $0.075 |
| Sub-LM calls (3x, using mini) | ~45K | $0.045 |
| Tool execution | ~20K | $0.06 |
| Final synthesis | ~5K | $0.075 |
| **Total** | **~98K** | **$0.264** |

**Estimated Savings: 65% cost reduction**

## Risks and Mitigations

### Risk 1: Increased Latency from Sub-Calls

**Mitigation:** Parallel sub-LM calls where dependencies allow (already implemented in `parallel-tool-executor.ts`)

### Risk 2: Loss of Context Coherence

**Mitigation:** Maintain summary buffers for critical information, similar to paper's approach

### Risk 3: Code Execution Failures

**Mitigation:** Sandboxed REPL with error recovery, already have Python execution infrastructure

### Risk 4: Model Capability Requirements

**Mitigation:** Use frontier models (Claude Sonnet/Opus) for root agent, smaller models for sub-calls

## Conclusion

The RLM paradigm represents a fundamental shift in how LLMos should handle long-context tasks. By treating prompts as external objects and enabling recursive sub-queries, we can:

1. **Handle 10M+ token contexts** - Currently limited to 180K
2. **Reduce costs by ~65%** - Selective context viewing
3. **Improve accuracy** - Avoid context rot
4. **Scale task complexity** - Quadratic-complexity tasks become tractable

The implementations in this commit provide the foundation for this transformation:
- Smart token estimation for better resource planning
- Parallel execution for performance
- Confidence-based stopping for efficiency
- Lazy skill loading for reduced initial context

The next step is implementing the full REPL-based context management system.

## References

- Zhang, A.L., Kraska, T., & Khattab, O. (2025). Recursive Language Models. MIT CSAIL.
- LLMos System Architecture: `/lib/system-agent-orchestrator.ts`
- Context Management: `/lib/workflow-context-manager.ts`
