# Orchestration Rules

These rules define how LLMos decomposes and executes tasks.

---

## Agentic Loop

The core execution pattern follows four phases:

### 1. PLAN
- Analyze the task requirements
- Query memory for similar past tasks
- Create a step-by-step execution plan
- Identify required tools and sub-agents

### 2. EXECUTE
- Run plan steps sequentially
- Make tool calls as needed
- Track results and progress
- Handle errors with retry logic

### 3. REFLECT
- Evaluate execution results
- Determine if task is complete
- Identify lessons learned
- Decide if iteration is needed

### 4. ITERATE
- If task incomplete, return to PLAN
- Adjust approach based on results
- Continue until success or max iterations

---

## Planning Phase Rules

### Memory Consultation
- **Always query memory first** before planning
- Look for similar tasks with >30% similarity
- Extract successful patterns from past executions
- Maximum 3 relevant memories per query

### Plan Structure
A valid plan must include:
1. Task analysis (what the task requires)
2. Approach (high-level strategy)
3. Steps (specific, actionable items)
4. Tool hints (suggested tools per step)
5. Confidence score (0.0 - 1.0)

### Confidence Thresholds
- **>0.8**: Execute with minimal iteration
- **0.5-0.8**: Execute with reflection checkpoints
- **<0.5**: Request user clarification before proceeding

---

## Execution Phase Rules

### Tool Call Protocol
1. Parse tool calls from ```tool blocks
2. Validate against registered tools
3. Execute sequentially (respecting dependencies)
4. Capture results for context
5. Track files created

### Error Handling
- **Transient errors**: Retry up to 3 times
- **Validation errors**: Adjust parameters and retry
- **Fatal errors**: Log, update memory, report to user

### Progress Tracking
- Update step status (pending → in_progress → completed/failed)
- Emit progress events for UI updates
- Log tool call durations

---

## Reflection Phase Rules

### Success Criteria
- All planned steps completed
- No unresolved errors
- User goal addressed
- Output artifacts created

### Memory Update
On completion (success or failure):
1. Create execution trace with metadata
2. Append to system memory log
3. Update pattern matcher index
4. Record tools used and duration

---

## Iteration Limits

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxIterations` | 15 | Maximum agentic loop iterations |
| `maxToolCalls` | 50 | Maximum tool calls per task |
| `maxRetries` | 3 | Maximum retries per tool call |
| `planTimeout` | 30s | Maximum time for planning phase |

---

## Sub-Agent Delegation

### When to Create Sub-Agents
- Task requires specialized domain knowledge
- Task can be parallelized
- Task exceeds single-agent complexity

### Sub-Agent Protocol
1. Define agent in markdown (frontmatter + prompt)
2. Save to `projects/*/components/agents/`
3. Invoke using `invoke-subagent` tool
4. Track usage for evolution

### Minimum Agent Requirement
Every project must have at least 3 markdown sub-agents:
- **COPIED**: Reused from system agents (80%+ match)
- **EVOLVED**: Modified from existing agent
- **CREATED**: Built from scratch

---

## Model-Aware Execution

Different LLM models require different strategies:

| Model Type | Strategy | Notes |
|------------|----------|-------|
| Claude Opus/Sonnet | `markdown` | Full markdown agents work directly |
| Claude Haiku, GPT-4o | `hybrid` | Markdown + structured tools |
| Gemini, Llama, Mistral | `compiled` | Compile to structured format |
| Small models (<8B) | `simple` | Minimal, explicit instructions |

The orchestrator should detect the model and adjust accordingly.
