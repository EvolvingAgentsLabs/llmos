# Kernel Configuration

Runtime parameters and limits for the LLMos kernel.

---

## Orchestration Limits

```yaml
orchestration:
  maxIterations: 15           # Maximum agentic loop iterations
  maxToolCalls: 50            # Maximum tool calls per task
  planFirst: true             # Always create plan before execution
  queryMemory: true           # Query memory during planning
  updateMemory: true          # Update memory after execution
  verbose: true               # Enable detailed logging
```

---

## Memory Settings

```yaml
memory:
  query:
    limit: 3                  # Maximum memories per query
    minSimilarity: 0.3        # Minimum similarity score
    timeWindowDays: 90        # Default time window for queries

  retention:
    shortTermHours: 24        # Short-term memory retention
    archiveAfterDays: 180     # Archive after 6 months
    compressAfterDays: 365    # Compress after 1 year
    maxSystemEntries: 1000    # Maximum system memory entries
```

---

## Evolution Parameters

```yaml
evolution:
  minPatternCount: 3          # Minimum occurrences to create skill
  minSuccessRate: 0.7         # Minimum 70% success rate
  minConfidence: 0.5          # Minimum confidence to save skill

  promotion:
    userToTeam:
      minUses: 5              # Uses before team promotion
      minSuccessRate: 0.8     # 80% success rate required
    teamToSystem:
      minUses: 10             # Uses before system promotion
      minSuccessRate: 0.9     # 90% success rate required
```

---

## Agent Settings

```yaml
agents:
  minimumPerProject: 3        # Minimum agents per project
  defaultModel: "anthropic/claude-sonnet-4.5"
  maxAgentIterations: 20      # Max iterations per agent
  allowedOrigins:
    - copied                  # Direct copy from system
    - evolved                 # Modified from existing
    - created                 # Built from scratch
```

---

## Tool Limits

```yaml
tools:
  executePhyton:
    timeout: 30000            # 30 second timeout
    maxOutputSize: 1048576    # 1MB max output

  writeFile:
    maxSize: 1048576          # 1MB max file size
    allowedPaths:
      - "projects/*"
      - "system/skills/*"
    forbiddenPaths:
      - "system/kernel/*"     # Kernel requires approval

  generateApplet:
    maxRetries: 3             # Self-healing retries
    compilationTimeout: 5000  # 5 second compilation
```

---

## Model Capabilities

```yaml
models:
  anthropic/claude-opus-4.5:
    strategy: "markdown"
    maxContext: 200000
    supportsNativeAgents: true
    supportsToolUse: true

  anthropic/claude-sonnet-4.5:
    strategy: "markdown"
    maxContext: 200000
    supportsNativeAgents: true
    supportsToolUse: true

  anthropic/claude-haiku:
    strategy: "hybrid"
    maxContext: 100000
    supportsNativeAgents: true
    supportsToolUse: true

  openai/gpt-4o:
    strategy: "compiled"
    maxContext: 128000
    supportsNativeAgents: false
    supportsToolUse: true

  google/gemini-2.0-flash:
    strategy: "compiled"
    maxContext: 1000000
    supportsNativeAgents: false
    supportsToolUse: true
```

---

## Hardware Integration

```yaml
hardware:
  esp32:
    serialBaudRate: 115200
    connectionTimeout: 5000
    retryAttempts: 3

  quantum:
    defaultShots: 1000
    maxQubits: 10
    simulatorBackend: "microqiskit"
```

---

## Logging

```yaml
logging:
  level: "info"               # debug, info, warn, error
  logToolCalls: true
  logPlanSteps: true
  logMemoryQueries: true
  logEvolutionEvents: true

  output:
    console: true
    file: false
    remote: false
```

---

## Safety Settings

```yaml
safety:
  requireApprovalFor:
    - kernelModification      # Editing /system/kernel/*
    - systemAgentDeletion     # Deleting system agents
    - volumePromotion         # Promoting to team/system

  forbiddenOperations:
    - credentials_in_memory   # Never store credentials
    - pii_in_logs             # No PII in logs
    - destructive_git_ops     # No force push, hard reset
```

---

## Feature Flags

```yaml
features:
  enableEvolution: true       # Automatic skill generation
  enableMemoryConsolidation: true
  enableAgentPromotion: true
  enableSelfHealing: true     # Applet retry logic
  enableHardwareIntegration: true
  enableQuantumBackend: true

  experimental:
    llmDrivenEvolution: true  # Use LLM for pattern matching
    selfModifyingKernel: true # AI can edit kernel files (HYBRID ARCHITECTURE)
    multiModelOrchestration: false # Different models per agent
    dynamicAgentCreation: true # Create agents on-the-fly via markdown
    pureMarkdownAgents: true  # Agents are text files, not code
```

---

## Environment

```yaml
environment:
  production:
    storage: "vercel-blob"
    kv: "vercel-kv"
    logging: "info"

  development:
    storage: "local-fs"
    kv: "memory"
    logging: "debug"

  test:
    storage: "memory"
    kv: "memory"
    logging: "warn"
```

---

## Dynamic Agent Creation (Hybrid Architecture)

```yaml
dynamicAgents:
  # Agent creation settings
  creation:
    allowedLocations:
      - "projects/*/agents/*"
      - "projects/*/components/agents/*"
    requiredFrontmatter:
      - name
      - type
      - capabilities
    originTracking: true        # Track copied/evolved/created

  # Agent discovery
  discovery:
    patterns:
      - "**/agents/*.md"
      - "**/components/agents/*.md"
    systemAgentsPath: "/system/agents/"
    cacheDiscovery: true
    refreshIntervalMs: 30000

  # Self-modification rules
  selfModification:
    agentsModifiable: true      # AI can edit agents
    skillsModifiable: true      # AI can edit skills
    kernelModifiable: false     # Kernel requires approval
    memoryCappable: true        # AI can consolidate memory

  # Evolution from pure code to pure text
  hybridMode:
    enabled: true
    pythonAsExecutor: true      # Python backend becomes "dumb executor"
    markdownAsLogic: true       # Markdown files define behavior
    instantEvolution: true      # Changes take effect immediately
```

---

## Claude Code Integration

```yaml
claudeCode:
  slashCommand:
    name: "llmos"
    path: ".claude/commands/llmos.md"
    enabled: true

  toolMappings:
    createAgent: "Write to agents/*.md"
    discoverAgents: "Glob **/agents/*.md"
    queryMemory: "Grep + Read"
    logTrace: "Write to memory/short_term/"
    executeCode: "Bash python3"

  workflowPhases:
    - discovery
    - memoryConsultation
    - planning
    - multiAgentPlanning
    - structureCreation
    - agentCreation
    - execution
    - synthesis
    - validation
    - communication
    - memoryUpdate
```

---

## Notes

This configuration is read by the kernel at startup. Changes take effect on the next task execution.

To modify these settings:
1. Edit this file
2. Save changes (Git commit)
3. Restart the orchestrator (or wait for next task)

For experimental features, enable with caution and monitor for issues.
