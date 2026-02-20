# LLMos — Cleanup & Incremental Build Plan

**Date**: 2026-02-15
**Branch**: `start-hardware-poc`
**Goal**: Remove old experiments, keep what aligns with the vision, and build toward the first functional POC in small testable steps.

---

## Part 1: What to KEEP vs REMOVE

### Legend
- **KEEP** = Aligned with README/ROADMAP/NEXT_STEPS_POC vision
- **REMOVE** = Old experiment, not part of the physical AI agent OS
- **REVIEW** = Actively imported but not aligned with vision — needs untangling

---

### A. Files to REMOVE (Old Experiments)

#### 1. Quantum Computing (6 skills + supporting files)
Not part of the physical AI agent OS at all.

```
REMOVE  lib/microqiskit.py
REMOVE  public/lib/microqiskit.py
REMOVE  public/volumes/system/skills/quantum-cardiac-cepstrum.md
REMOVE  public/volumes/system/skills/quantum-openqasm-browser.md
REMOVE  public/volumes/system/skills/quantum-qft-openqasm.md
REMOVE  public/volumes/system/skills/quantum-solver.md
REMOVE  public/volumes/system/skills/quantum-vqe-node.md
REMOVE  public/volumes/system/skills/system-quantum-circuit-improver.md
REMOVE  volumes/system/skills/quantum-cardiac-cepstrum.md
REMOVE  volumes/system/skills/quantum-openqasm-browser.md
REMOVE  volumes/system/skills/quantum-qft-openqasm.md
REMOVE  volumes/system/skills/quantum-solver.md
REMOVE  volumes/system/skills/quantum-vqe-node.md
REMOVE  volumes/system/skills/system-quantum-circuit-improver.md
REMOVE  public/system/prompts/runtime/quantum-constraints.md
REMOVE  public/examples/cardiac-cepstral-analysis.md
```

#### 2. WASM/AssemblyScript Runtime (old compilation approach — vision is LLMBytecode)
The vision explicitly moved to LLM-generated structured instructions, not WASM compilation.

```
REMOVE  lib/runtime/assemblyscript-compiler.ts
REMOVE  lib/runtime/wasm-compiler.ts
REMOVE  lib/hardware/esp32-wasm4-vm.ts
REMOVE  lib/hardware/wasm4-runtime.ts
REMOVE  lib/hardware/wasm-deployer.ts
REMOVE  lib/kernel/wasm-runtime.ts
REMOVE  lib/llm-tools/assemblyscript-tools.ts
REMOVE  lib/llm-tools/esp32-wasm4-tools.ts
REMOVE  lib/editor/assemblyscript-intellisense.ts
REMOVE  lib/types/asc-types.ts
REMOVE  electron/services/assemblyscript-compiler.ts
REMOVE  public/sdk/wasi-headers/robot4.h
REMOVE  public/volumes/system/skills/esp32-wasm-development.md
REMOVE  public/volumes/system/skills/esp32-wasm-native-api.md
REMOVE  volumes/system/skills/esp32-wasm-development.md
REMOVE  volumes/system/skills/esp32-wasm-native-api.md
REMOVE  __tests__/integration/wasm-pipeline.test.md
```

**Note**: `esp32-device-manager.ts` imports `esp32-wasm4-vm` — this import needs to be removed/refactored when cleaning up.

#### 3. Pyodide Runtime (Python-in-browser — not part of the vision)
The vision uses TypeScript on host + C++ on ESP32. Python-in-browser is an old experiment.

```
REMOVE  lib/pyodide-preloader.ts
REMOVE  lib/pyodide-runtime.ts
REMOVE  components/PyodidePreloadIndicator.tsx
REMOVE  public/system/prompts/runtime/python-constraints.md
```

**Note**: `lib/tool-executor.ts`, `lib/system-tools.ts`, `lib/mutation-engine.ts` import pyodide — these need cleanup.

#### 4. Applet System (old UI paradigm — not in README/ROADMAP)
The vision is a robot workspace with 3D simulation, not an applet grid.

```
REMOVE  components/applets/          (entire directory — 10 files)
REMOVE  lib/applets/                 (entire directory — 3 files)
REMOVE  lib/runtime/applet-runtime.ts
REMOVE  lib/runtime/speculative-applet.ts
REMOVE  lib/speculative/             (entire directory)
REMOVE  lib/hooks/useAppletIntegration.tsx
REMOVE  lib/hooks/useSpeculativeApplet.tsx
REMOVE  lib/llm-tools/applet-tools.ts
REMOVE  public/system/agents/AppletDebuggerAgent.md
REMOVE  public/system/applets/       (entire directory)
REMOVE  contexts/AppletContext.tsx
```

**Note**: Heavily imported — `FluidLayout.tsx` and `AdaptiveLayout.tsx` import applet code. The main `app/page.tsx` uses `AppletProvider`. This is the biggest untangling job.

#### 5. Artifacts System (old content creation paradigm)
Not part of the physical agent OS vision.

```
REMOVE  lib/artifacts/               (entire directory — 5 files)
REMOVE  lib/artifact-executor.ts
REMOVE  lib/repositories/            (entire directory)
REMOVE  components/artifacts/        (entire directory — 3 files)
REMOVE  components/panels/artifacts/ (entire directory — 6 files)
```

**Note**: `RobotWorkspace.tsx` imports artifact types — needs refactoring.

#### 6. Old Multi-Agent Chat (replaced by Claude Code /llmos + agent system)
The vision uses Claude Code as the development interface, not a chat-based multi-agent UI.

```
REMOVE  lib/chat/multi-agent-chat.ts
REMOVE  lib/chat/participant-manager.ts
REMOVE  lib/chat/solution-proposer.ts
REMOVE  lib/chat/voting-session.ts
REMOVE  lib/chat/demo-messages.ts
REMOVE  lib/multi-agent-chat-orchestrator.ts
REMOVE  components/chat/MultiAgentChatPanel.tsx
REMOVE  components/chat/ParticipantList.tsx
REMOVE  components/chat/SolutionProposal.tsx
REMOVE  components/chat/VotingCard.tsx
```

#### 7. Git/GitHub Integration (old collaboration features)
Not part of the core vision. Git is for version control, not an in-app feature.

```
REMOVE  lib/git-service.ts
REMOVE  lib/git/wasm-git-client.ts
REMOVE  lib/github-auth.ts
REMOVE  lib/github/github-service.ts
REMOVE  lib/llm-tools/git-tools-enhanced.ts
REMOVE  app/api/auth/github/callback/route.ts
REMOVE  app/api/git-proxy/route.ts
REMOVE  components/git/GitStatusWidget.tsx
REMOVE  components/settings/GitHubConnect.tsx
REMOVE  components/settings/GitHubSettings.tsx
REMOVE  components/panels/volumes/GitStatus.tsx
```

#### 8. Python Backend (old, fully decoupled, not referenced)
```
REMOVE  backend/                     (entire directory)
REMOVE  requirements.txt
```

#### 9. Gemini Vision (replaced by Qwen3-VL-8B)
```
REMOVE  lib/llm/gemini-agentic-vision.ts
REMOVE  docs/architecture/GEMINI_AGENTIC_VISION_INTEGRATION.md
```

#### 10. Stale/Generic Skills (not relevant to physical agents)
```
REMOVE  public/volumes/system/skills/circuit-rc-node.md
REMOVE  public/volumes/system/skills/data-analysis.md
REMOVE  public/volumes/system/skills/database-query-node.md
REMOVE  public/volumes/system/skills/weather-analysis-node.md
REMOVE  public/volumes/system/skills/threejs-cube-node.md
REMOVE  volumes/system/skills/circuit-rc-node.md
REMOVE  volumes/system/skills/data-analysis.md
REMOVE  volumes/system/skills/database-query-node.md
REMOVE  volumes/system/skills/weather-analysis-node.md
REMOVE  volumes/system/skills/threejs-cube-node.md
```

#### 11. Old/Stale Documentation
```
REMOVE  docs/CODE_AUDIT_WEEK1.md
REMOVE  docs/WEEK1_SUMMARY.md
REMOVE  docs/WEEK2_DAY1_SUMMARY.md
REMOVE  docs/WEEK2_DAY2_SUMMARY.md
REMOVE  docs/BUILD_OPTIMIZATIONS.md
REMOVE  docs/ELECTRON_100_IMPROVEMENTS.md
REMOVE  docs/REFACTORING.md
REMOVE  docs/PHASE1_IMPLEMENTATION.md
REMOVE  docs/PROJECT_STRUCTURE.md          (README.md covers this)
REMOVE  docs/SIMULATION_TO_REAL_ANALYSIS.md
REMOVE  docs/STANDARD_ARENA_CONCEPT.md
REMOVE  docs/CHALLENGE_COURSES.md
REMOVE  docs/guides/BROWSER_COMPILATION.md  (WASM-related)
```

#### 12. Old UI Components (not in robot workspace vision)
```
REMOVE  components/analytics/AnalyticsDashboard.tsx
REMOVE  components/evolution/SystemEvolutionModal.tsx
REMOVE  components/kernel/BootScreen.tsx
REMOVE  components/kernel/RefinementProgress.tsx
REMOVE  components/loading/LoadingAnimation.tsx
REMOVE  components/media/MediaViewer.tsx
REMOVE  components/onboarding/FirstTimeGuide.tsx
REMOVE  components/onboarding/IndustrySelector.tsx
REMOVE  components/panels/session/CronView.tsx
REMOVE  components/setup/APIKeySetup.tsx
REMOVE  components/system/CoreEntity.tsx
REMOVE  components/system/FloatingJarvis.tsx
REMOVE  components/system/HolographicBackground.tsx
REMOVE  components/system/JarvisAvatar.tsx
REMOVE  components/viewer/TabbedContentViewer.tsx
REMOVE  components/volumes/VolumeBrowser.tsx
REMOVE  components/volumes/VolumeFileTree.tsx
REMOVE  components/subagents/AgentList.tsx
REMOVE  components/visualization/DecisionBranchView.tsx
REMOVE  components/visualization/DecisionFlowGraph.tsx
REMOVE  components/visualization/FlowTimeline.tsx
REMOVE  components/visualization/GitGraphView.tsx
REMOVE  components/visualization/ParticipationBubbleView.tsx
REMOVE  components/visualization/PredictionTimeline.tsx
REMOVE  lib/visualization/decision-graph.ts
```

#### 13. Misc Old Code
```
REMOVE  lib/agent-communication.ts         (old, replaced by agent-messenger)
REMOVE  lib/agent-executor.ts              (old executor)
REMOVE  lib/cron-analyzer.ts               (old cron)
REMOVE  lib/cron-scheduler.ts              (old cron)
REMOVE  lib/execution-policy.ts            (old)
REMOVE  lib/lens-evolution.ts              (old)
REMOVE  lib/llm-client-enhanced.ts         (old, use lib/llm/)
REMOVE  lib/llm-tools/file-tools.ts        (old)
REMOVE  lib/marketplace/                   (stub, not imported)
REMOVE  lib/mcp-client.ts                  (old)
REMOVE  lib/mcp-config.ts                  (old)
REMOVE  lib/prediction/                    (old flow prediction)
REMOVE  lib/pwa-utils.ts                   (old PWA)
REMOVE  lib/sample-prompts.ts              (old)
REMOVE  lib/system-evolution.ts            (old)
REMOVE  lib/system-tools.ts               (old, imports pyodide)
REMOVE  lib/terminology-config.ts          (old)
REMOVE  lib/theme-config.ts               (old)
REMOVE  lib/theme-provider.tsx             (old)
REMOVE  lib/threejs-runtime.ts             (old)
REMOVE  lib/tool-executor.ts              (old, imports pyodide)
REMOVE  lib/virtual-fs.ts                 (old VFS)
REMOVE  lib/workflow-context-manager.ts    (old)
REMOVE  lib/project-context-resolver.ts    (old)
REMOVE  lib/runtime-capabilities.ts        (old)
REMOVE  lib/user-storage.ts               (old)
REMOVE  lib/agents/rust-wasm-tools.ts      (old WASM)
REMOVE  lib/agents/agent-compiler.ts       (old WASM compilation)
REMOVE  lib/agents/compiled-agent-runtime.ts (old compiled agents)
REMOVE  lib/agents/robot-icon-generator.ts  (cosmetic)
REMOVE  lib/agents/mcp-tools.ts            (old, imports pyodide)
REMOVE  contexts/ProjectContext.tsx         (old)
REMOVE  contexts/WorkspaceContext.tsx       (old)
REMOVE  hooks/useCodeExecution.ts           (old)
REMOVE  hooks/useDesktopAppletSync.ts       (old applets)
REMOVE  hooks/useWorkflowExecution.ts       (old)
REMOVE  app/debug-vfs/page.tsx             (old debug)
REMOVE  app/test-system-agent/page.tsx     (old test)
REMOVE  __tests__/integration/test_knowledge_cascade.py (old)
REMOVE  volumes/user/verify-frontend.py    (old)
REMOVE  LINKEDIN_ARTICLE.md               (not code)
REMOVE  public/manifest.json              (old PWA)
REMOVE  public/sw.js                      (old service worker)
REMOVE  .vercelignore                     (not deploying to Vercel now)
REMOVE  vercel.json                       (not deploying to Vercel now)
```

---

### B. Files to KEEP (Aligned with Vision)

#### Core Runtime (NEXT_STEPS_POC direct references)
```
KEEP  lib/runtime/world-model.ts              — 50x50 occupancy grid
KEEP  lib/runtime/world-model/                — Cognitive world model subsystem (5 files)
KEEP  lib/runtime/dual-brain-controller.ts    — Instinct + Planner decision architecture
KEEP  lib/runtime/rsa-engine.ts               — RSA reasoning engine (planner brain)
KEEP  lib/runtime/vision/vlm-vision-detector.ts — Qwen3-VL-8B vision pipeline
KEEP  lib/runtime/vision/vision-test-*.ts     — VLM test fixtures
KEEP  lib/runtime/jepa-mental-model.ts        — JEPA predict-before-act (Phase 4+)
KEEP  lib/runtime/execution-frame.ts          — Execution frame types
KEEP  lib/runtime/llm-bytecode.ts             — LLMBytecode types
KEEP  lib/runtime/robot4-runtime.ts           — 60Hz physics simulation
KEEP  lib/runtime/robot4-examples.ts          — Simulation arena configs
KEEP  lib/runtime/esp32-agent-runtime.ts      — ESP32 agent runtime loop
KEEP  lib/runtime/navigation/                 — Ray navigation (2 files)
KEEP  lib/runtime/scene-graph/                — Symbolic scene graph (6 files)
KEEP  lib/runtime/camera-capture.ts           — Camera capture
KEEP  lib/runtime/camera-vision-model.ts      — Camera vision model
KEEP  lib/runtime/sensors/                    — Sensor subsystem
KEEP  lib/runtime/trajectory-planner.ts       — Path planning
KEEP  lib/runtime/behaviors/                  — Robot behaviors
KEEP  lib/runtime/scene/                      — Scene manager
KEEP  lib/runtime/live-preview.ts             — Live preview
```

#### HAL (Hardware Abstraction Layer)
```
KEEP  lib/hal/command-validator.ts            — Safety validation
KEEP  lib/hal/hal-tool-executor.ts            — HAL tool execution
KEEP  lib/hal/hal-tool-loader.ts              — Load HAL tools from markdown
KEEP  lib/hal/hal-tools-server.ts             — HAL tools server
KEEP  lib/hal/physical-adapter.ts             — Physical hardware adapter
KEEP  lib/hal/simulation-adapter.ts           — Simulation adapter
KEEP  lib/hal/types.ts                        — HAL types
KEEP  lib/hal/index.ts
```

#### Hardware
```
KEEP  lib/hardware/esp32-device-manager.ts    — Device management (needs WASM import cleanup)
KEEP  lib/hardware/serial-manager.ts          — Serial communication
KEEP  lib/hardware/serial-types.d.ts          — Serial types
KEEP  lib/hardware/cube-robot-simulator.ts    — Cube robot sim
KEEP  lib/hardware/device-cron-handler.ts     — Device scheduling
KEEP  lib/hardware/virtual-esp32.ts           — Virtual ESP32
KEEP  lib/hardware/index.ts
```

#### Evolution Engine
```
KEEP  lib/evolution/black-box-recorder.ts     — Cycle-by-cycle recording
KEEP  lib/evolution/agentic-auditor.ts        — Agent auditing
KEEP  lib/evolution/client-evolution.ts       — Client-side evolution
KEEP  lib/evolution/evolutionary-patcher.ts   — Behavior patching
KEEP  lib/evolution/simulation-replayer.ts    — Replay simulations
KEEP  lib/evolution/index.ts
```

#### Agent System
```
KEEP  lib/agents/agent-loader.ts              — Load markdown agents
KEEP  lib/agents/agent-messenger.ts           — Agent-to-agent messaging
KEEP  lib/agents/multi-agent-validator.ts     — Multi-agent validation
KEEP  lib/agents/model-capabilities.ts        — Dual-LLM model selection
KEEP  lib/agents/model-aware-orchestrator.ts  — Model-aware routing
KEEP  lib/agents/agentic-orchestrator.ts      — Agentic orchestration
KEEP  lib/agents/client-agent-manager.ts      — Client agent management
KEEP  lib/agents/evolution-integration.ts     — Evolution integration
KEEP  lib/agents/llm-pattern-matcher.ts       — Pattern matching
KEEP  lib/agents/examples/                    — Examples
KEEP  lib/agents/index.ts                     — (needs cleanup of removed re-exports)
```

#### Kernel, Skills, Volumes
```
KEEP  lib/kernel/boot.ts                      — Kernel boot
KEEP  lib/kernel/client-kernel.ts             — Client kernel
KEEP  lib/kernel/error-supervisor.ts          — Error supervision
KEEP  lib/kernel/kernel-api.ts                — Kernel API
KEEP  lib/kernel/refinement-service.ts        — Refinement
KEEP  lib/kernel/supervised-execution.ts      — Supervised execution
KEEP  lib/kernel/index.ts
KEEP  lib/skills/                             — All skills files
KEEP  lib/skill-parser.ts                     — Skill parser
KEEP  lib/volumes/                            — All volume files
KEEP  lib/volume-loader.ts                    — Volume loader
```

#### LLM Client
```
KEEP  lib/llm/client.ts                       — LLM client
KEEP  lib/llm/types.ts                        — LLM types
KEEP  lib/llm/storage.ts                      — LLM storage
KEEP  lib/llm/index.ts
KEEP  lib/llm-client.ts                       — Legacy LLM client (may consolidate)
```

#### System Orchestration
```
KEEP  lib/system-agent-orchestrator.ts        — System agent orchestrator
KEEP  lib/prompt-loader.ts                    — Prompt loader
KEEP  lib/mutation-engine.ts                  — Mutation engine (needs pyodide removal)
KEEP  lib/core/                               — Core result types
KEEP  lib/debug/                              — All debug files
KEEP  lib/platform/                           — Platform detection
KEEP  lib/storage/                            — Storage adapter
KEEP  lib/utils/                              — Utilities
```

#### Pure Markdown Architecture
```
KEEP  public/system/kernel/                   — All kernel markdown files
KEEP  public/system/agents/SystemAgent.md
KEEP  public/system/agents/PlanningAgent.md
KEEP  public/system/agents/ProjectAgentPlanner.md
KEEP  public/system/agents/MemoryAnalysisAgent.md
KEEP  public/system/agents/MemoryConsolidationAgent.md
KEEP  public/system/agents/MutationAgent.md
KEEP  public/system/agents/PatternMatcherAgent.md
KEEP  public/system/agents/ExecutionStrategyAgent.md
KEEP  public/system/agents/LensSelectorAgent.md
KEEP  public/system/agents/ReactiveRobotAgent.md
KEEP  public/system/agents/RobotAIAgent.md
KEEP  public/system/agents/StructuredRobotAgent.md
KEEP  public/system/agents/UXDesigner.md      — (review: still useful for UI generation?)
KEEP  public/system/domains/                  — All domain metaphors
KEEP  public/system/prompts/                  — (minus quantum/python constraints)
KEEP  public/system/tools/                    — Tool specs
KEEP  public/system/memory_log.md
KEEP  public/volumes/system/agents/
KEEP  public/volumes/system/manifest.json
KEEP  public/volumes/system/project-templates/
KEEP  public/volumes/system/tools/
```

#### Skills to Keep
```
KEEP  */skills/esp32-cube-robot.md
KEEP  */skills/esp32-json-protocol.md
KEEP  */skills/hardware-flight-controller.md
KEEP  */skills/plan-first-execution.md
KEEP  */skills/python-coding.md               — (general coding support)
KEEP  */skills/semantic-pattern-matching.md
KEEP  volumes/system/skills/physical-plantcare-specialist.md  — (emerging physical agent skill)
```

#### UI Components to Keep
```
KEEP  components/robot/                       — All robot components (7 files)
KEEP  components/canvas/                      — Three.js canvas (3 files)
KEEP  components/chat/ChatPanel.tsx            — Basic chat
KEEP  components/chat/MarkdownRenderer.tsx     — Markdown rendering
KEEP  components/chat/UnifiedChat.tsx          — Unified chat
KEEP  components/chat/AgentActivityDisplay.tsx
KEEP  components/chat/ArtifactAutocomplete.tsx — (review)
KEEP  components/chat/ArtifactReferenceCard.tsx — (review)
KEEP  components/chat/CanvasModal.tsx
KEEP  components/chat/ModelSelector.tsx
KEEP  components/chat/ToolUseDisplay.tsx
KEEP  components/common/                      — Common utilities
KEEP  components/debug/                       — Debug console
KEEP  components/layout/                      — Layout (Header, SimpleLayout)
KEEP  components/settings/LLMSettings.tsx      — LLM settings
KEEP  components/settings/ProfileSettings.tsx  — Profile
KEEP  components/shared/                      — Error boundary
KEEP  components/sidebar/SidebarPanel.tsx
KEEP  components/system/PlatformIndicator.tsx
KEEP  components/workspace/RobotWorkspace.tsx  — (needs artifact import cleanup)
KEEP  components/workspace/CommandPalette.tsx
KEEP  components/workspace/ResizablePanel.tsx
KEEP  components/workspace/ViewManager.tsx
KEEP  components/workspace/index.ts
KEEP  components/panels/session/              — (minus CronView)
KEEP  components/panels/volumes/VolumeTree.tsx
KEEP  components/panels/volumes/VSCodeFileTree.tsx
KEEP  components/panels/volumes/icons.tsx
KEEP  components/panels/volumes/CronList.tsx   — (review)
```

#### App, Electron, Firmware, Config
```
KEEP  app/layout.tsx
KEEP  app/page.tsx                            — (needs major refactor to remove applet/artifact providers)
KEEP  app/api/device/llm-request/route.ts
KEEP  app/api/hal-tools/route.ts
KEEP  app/api/robot-llm/route.ts
KEEP  electron/main.ts
KEEP  electron/preload.ts
KEEP  electron/services/serial-manager.ts
KEEP  electron/services/native-fs.ts
KEEP  electron/services/index.ts              — (remove assemblyscript-compiler re-export)
KEEP  electron/tsconfig.json
KEEP  electron/types.d.ts
KEEP  firmware/                               — ESP32 firmware
KEEP  Agent_Robot_Model/                      — Physical robot 3D models
KEEP  .claude/commands/llmos.md               — /llmos slash command
KEEP  tests/vision-prompts/                   — VLM test data
```

#### Documentation to Keep
```
KEEP  README.md
KEEP  ROADMAP.md
KEEP  NEXT_STEPS_POC.md
KEEP  CONTRIBUTING.md
KEEP  LICENSE
KEEP  docs/architecture/ARCHITECTURE.md
KEEP  docs/architecture/ROBOT_AI_AGENT_PARADIGM.md
KEEP  docs/architecture/WORLD_MODEL_SYSTEM.md
KEEP  docs/architecture/ROBOT4_GUIDE.md
KEEP  docs/architecture/ROBOT_WORLD_IMPLEMENTATION_STATUS.md
KEEP  docs/architecture/HELLO_WORLD_TUTORIAL.md
KEEP  docs/architecture/ADAPTIVE_PHYSICAL_INTELLIGENCE.md
KEEP  docs/hardware/                          — All hardware docs
KEEP  docs/guides/DESKTOP.md
KEEP  docs/LLM_CONFIGURATION.md
KEEP  docs/jepa-*.md                          — JEPA documentation
KEEP  docs/README.md
KEEP  docs/development/                       — Dev logs (reference)
```

---

## Part 2: Cleanup Dependency Map

Removing files isn't just deleting — imports need to be untangled. Here's the order:

### Phase 1: Easy Removals (no import dependencies)
1. Delete `backend/`, `requirements.txt`
2. Delete all quantum skills + `microqiskit.py` files
3. Delete stale generic skills (circuit-rc, weather, database, threejs-cube, data-analysis)
4. Delete stale docs
5. Delete `LINKEDIN_ARTICLE.md`
6. Delete `public/manifest.json`, `public/sw.js`, `.vercelignore`, `vercel.json`
7. Delete `__tests__/integration/test_knowledge_cascade.py`
8. Delete `volumes/user/verify-frontend.py`

### Phase 2: Remove self-contained old systems
1. Delete `lib/git-service.ts`, `lib/git/`, `lib/github-auth.ts`, `lib/github/`
2. Delete git/GitHub UI components
3. Delete `app/api/auth/`, `app/api/git-proxy/`
4. Delete `lib/marketplace/`
5. Delete `lib/prediction/`, `lib/visualization/`, old visualization components
6. Delete old misc files (`lib/cron-*.ts`, `lib/execution-policy.ts`, etc.)

### Phase 3: Untangle Pyodide
1. Remove pyodide imports from `lib/tool-executor.ts`, `lib/system-tools.ts`, `lib/mutation-engine.ts`, `lib/agents/mcp-tools.ts`, `components/chat/MarkdownRenderer.tsx`
2. Delete `lib/pyodide-preloader.ts`, `lib/pyodide-runtime.ts`, `components/PyodidePreloadIndicator.tsx`
3. Simplify or remove `lib/tool-executor.ts` and `lib/system-tools.ts` if they become empty

### Phase 4: Untangle WASM
1. Remove WASM imports from `lib/hardware/esp32-device-manager.ts`
2. Remove WASM re-exports from `lib/hardware/index.ts`, `electron/services/index.ts`
3. Clean `lib/agents/index.ts` of WASM-related re-exports
4. Delete all WASM/AssemblyScript files

### Phase 5: Untangle Applets + Artifacts (biggest job)
1. Refactor `app/page.tsx` to remove `AppletProvider`, simplify to robot workspace
2. Remove applet imports from `components/workspace/FluidLayout.tsx`, `AdaptiveLayout.tsx`
3. Remove artifact imports from `components/workspace/RobotWorkspace.tsx`
4. Delete `contexts/AppletContext.tsx`, `contexts/ProjectContext.tsx`, `contexts/WorkspaceContext.tsx`
5. Delete all applet components and lib
6. Delete all artifact components and lib
7. Simplify the layout system to just `SimpleLayout` → robot workspace

### Phase 6: Verify build
1. Run `npm run build` — fix any broken imports
2. Run `npm run dev` — verify the app loads
3. Run existing tests

---

## Part 3: Incremental Build Plan (Small Testable Steps)

Each step has clear success criteria that can be tested independently.

### Step 0: Codebase Cleanup
**Goal**: Remove old experiments, get a clean buildable codebase.

| Task | Description | Test |
|------|-------------|------|
| 0.1 | Easy removals (Phase 1-2 above) | `npm run build` passes |
| 0.2 | Untangle pyodide | `npm run build` passes |
| 0.3 | Untangle WASM | `npm run build` passes |
| 0.4 | Untangle applets/artifacts, simplify UI | `npm run dev` shows robot workspace |
| 0.5 | Verify /llmos command still works in Claude Code | Run `/llmos hello` |

**Deliverable**: Clean repo with ~40% fewer files, building and running.

---

### Step 1: World Model Serialization
**Goal**: The existing WorldModel can serialize itself into formats the LLM will consume.

| Task | Description | Test |
|------|-------------|------|
| 1.1 | `world-model-serializer.ts` — RLE JSON encoding | Unit test: serialize 50x50 grid, verify RLE output |
| 1.2 | `world-model-serializer.ts` — ASCII grid (25x25 downsampled) | Unit test: print ASCII grid, visually verify |
| 1.3 | `WorldModel.serialize()` method | Unit test: call on a grid with known obstacles |
| 1.4 | `SceneGraph.serializeForLLM()` method | Unit test: serialize objects + topology |
| 1.5 | `map-renderer.ts` — Top-down PNG rendering | Unit test: render grid to canvas, save as PNG |

**Deliverable**: `WorldModel` can produce RLE JSON, ASCII, and PNG map representations. All unit-tested.

---

### Step 2: Ground-Truth World Model Bridge
**Goal**: The Three.js simulation state feeds into the world model automatically.

| Task | Description | Test |
|------|-------------|------|
| 2.1 | `world-model-bridge.ts` — Read `Robot4World` state | Unit test: create known arena, bridge produces correct grid |
| 2.2 | Rasterize wall segments onto 50x50 grid | Unit test: walls appear as occupied cells |
| 2.3 | Rasterize obstacle circles onto grid | Unit test: obstacles appear correctly |
| 2.4 | Generate waypoint graph from free space | Unit test: waypoints are in free cells, edges don't cross walls |
| 2.5 | Integration: Simulation → Bridge → Serializer → JSON | Integration test: full pipeline produces valid output |

**Deliverable**: Running simulation auto-populates the world model. Verified with ASCII grid printout.

---

### Step 3: Candidate Generator
**Goal**: Given a world model and goal, generate 3-5 ranked navigation subgoals.

| Task | Description | Test |
|------|-------------|------|
| 3.1 | `candidate-generator.ts` — Frontier detection | Unit test: find frontier cells between explored/unknown |
| 3.2 | A* pathfinding on occupancy grid | Unit test: find path around obstacles |
| 3.3 | Candidate scoring (distance + clearance + novelty) | Unit test: score 5 candidates, verify ranking |
| 3.4 | Top-K candidate selection with diversity | Unit test: candidates are spatially distributed |

**Deliverable**: `CandidateGenerator.generate(worldModel, robotPose, goal)` returns ranked subgoals.

---

### Step 4: Local LLM Integration (Qwen3-VL-8B)
**Goal**: Send a world model + camera frame to Qwen3-VL-8B and get a structured navigation decision back.

| Task | Description | Test |
|------|-------------|------|
| 4.1 | Set up llama.cpp/vLLM server with Qwen3-VL-8B | Manual: model loads, responds to test query |
| 4.2 | Create `LLMNavigationDecision` JSON schema + validator | Unit test: validate good/bad responses |
| 4.3 | Create navigation prompt template (world model + map + candidates) | Manual: send prompt, verify coherent response |
| 4.4 | `RuntimeLLMClient` — wrapper for local/OpenRouter inference | Unit test: mock LLM returns valid decision |
| 4.5 | Test with ASCII world model first (no image) | Manual: LLM picks reasonable candidate from ASCII map |
| 4.6 | Test with map image + ASCII (multimodal) | Manual: LLM picks better candidate with visual input |

**Deliverable**: `RuntimeLLMClient.decide(executionFrame)` returns a validated `LLMNavigationDecision`.

---

### Step 5: Local Planner (A* Path Execution)
**Goal**: The LLM's MOVE_TO decision gets executed via classical A* pathfinding to the selected subgoal.

| Task | Description | Test |
|------|-------------|------|
| 5.1 | `local-planner.ts` — A* on occupancy grid | Unit test: plan path around obstacles |
| 5.2 | Waypoint-following controller | Unit test: follow path, report progress |
| 5.3 | Path blocked detection + failure reporting | Unit test: detect blocked path, return failure |
| 5.4 | Connect planner → HAL (simulation adapter) | Integration test: robot moves toward subgoal in sim |

**Deliverable**: LLM decision → A* path → robot moves toward subgoal. Verified in simulation.

---

### Step 6: Runtime Loop (One Cycle)
**Goal**: Complete one perception-decision-action cycle: sensors → world model → LLM → planner → HAL → actuators.

| Task | Description | Test |
|------|-------------|------|
| 6.1 | Assemble `ExecutionFrame` with all layers | Unit test: frame contains grid + objects + candidates + history |
| 6.2 | Wire: Simulation → Bridge → Serializer → LLM → Planner → HAL | Integration test: one cycle executes, robot moves |
| 6.3 | Update world model from execution results | Unit test: visited cells marked, obstacle confidence updated |
| 6.4 | Cycle logging to black-box recorder | Unit test: cycle data captured (frame + decision + result) |

**Deliverable**: Single cycle works end-to-end. Log shows: frame sent → decision received → action taken → world model updated.

---

### Step 7: Multi-Cycle Navigation Loop
**Goal**: Robot autonomously navigates from start to goal across multiple cycles.

| Task | Description | Test |
|------|-------------|------|
| 7.1 | Loop controller: repeat cycles until goal reached or timeout | Integration test: robot reaches goal in <30 cycles |
| 7.2 | History tracking: pass last 3-5 cycles to LLM | Verify: LLM sees recent history in prompt |
| 7.3 | Stuck detection: same cells visited >3 times | Unit test: detect stuck condition |
| 7.4 | **Test scenario**: Navigate to goal in 5x5 arena with 3 obstacles | Success: goal reached, 0 collisions, <60s sim time |

**Deliverable**: Robot navigates from (0.5, 0.5) to (4.0, 4.0) avoiding obstacles. 30-second Three.js video.

---

### Step 8: Dual-Brain Integration
**Goal**: Instinct brain handles normal navigation, planner brain activates for complex situations.

| Task | Description | Test |
|------|-------------|------|
| 8.1 | Instinct prompt: compact world model (position + goal + top 3 candidates) | Unit test: instinct responds in <500ms |
| 8.2 | Planner prompt: full execution frame with RSA | Unit test: planner responds in <8s with richer reasoning |
| 8.3 | Escalation triggers: stuck, frontier exhaustion, novel situation | Unit test: correct brain activated for each trigger |
| 8.4 | Wire RSA engine with map image as multimodal input | Integration test: RSA uses map for spatial reasoning |
| 8.5 | **Test scenario**: Dead-end recovery | Success: robot recognizes dead end, escalates to planner, retreats and reroutes |

**Deliverable**: Dual-brain navigation with visible brain-switching in UI. Planner activates for hard problems.

---

### Step 9: Exploration Mode
**Goal**: Robot can explore an unknown arena using frontier-based exploration.

| Task | Description | Test |
|------|-------------|------|
| 9.1 | Frontier-based candidate generation (bias toward unexplored areas) | Unit test: candidates target frontiers |
| 9.2 | Exploration progress tracking (% cells explored) | Unit test: accurate exploration counter |
| 9.3 | **Test scenario**: Explore >80% of 5x5 arena | Success: >80% explored, no infinite loops |

**Deliverable**: Robot systematically explores arena. Map fills in over time.

---

### Step 10: UI Integration
**Goal**: Three.js simulation shows the full runtime in real-time.

| Task | Description | Test |
|------|-------------|------|
| 10.1 | Top-down map overlay in 3D canvas | Visual: map renders alongside 3D view |
| 10.2 | Candidate subgoals as colored dots | Visual: dots appear on map |
| 10.3 | Active brain indicator (instinct vs planner) | Visual: UI shows which brain is active |
| 10.4 | LLM explanation panel | Visual: shows LLM reasoning each cycle |
| 10.5 | Cycle-by-cycle replay from black-box recorder | Visual: can step through past cycles |

**Deliverable**: Full visual dashboard showing the robot's reasoning in real-time.

---

### Step 11: ESP32 Hardware Bridge
**Goal**: Same code runs on physical ESP32 robot via serial.

| Task | Description | Test |
|------|-------------|------|
| 11.1 | Local planner → serial command protocol | Unit test: A* path → serial motor commands |
| 11.2 | Sensor readings → world model update | Unit test: distance sensor → occupied cell |
| 11.3 | Camera frame from ESP32-CAM → VLM | Integration test: real image → VLM detection |
| 11.4 | **Test**: Run navigation loop on physical robot | Success: physical robot navigates to goal |

**Deliverable**: Physical robot running the same reasoning loop as simulation.

---

### Step 12: Observation-Based World Model (Phase 4 from NEXT_STEPS)
**Goal**: Replace ground-truth world model with sensor + VLM observations.

| Task | Description | Test |
|------|-------------|------|
| 12.1 | Abstract `WorldModelBridge` interface | Unit test: swap ground truth ↔ sensor bridge |
| 12.2 | Sensor-only grid updates (`updateFromSensors`) | Unit test: grid builds from distance sensors only |
| 12.3 | VLM observation → symbolic object layer | Integration test: VLM sees "table" → object added |
| 12.4 | Temporal coherence for persistent objects | Unit test: object persists across frames |
| 12.5 | World model accuracy metrics vs. ground truth | Report: accuracy % per cell |

**Deliverable**: Robot navigates with sensor-only world model. Accuracy compared to ground truth.

---

## Summary

| Phase | Steps | What You Get | Status |
|-------|-------|-------------|--------|
| **Cleanup** | 0.1-0.5 | Clean buildable repo, ~40% fewer files | Partial |
| **Foundation** | 1.1-2.5 | World model serialization + ground truth bridge | **DONE** |
| **Intelligence** | 3.1-4.6 | Candidate generation + LLM integration | **DONE** |
| **Execution** | 5.1-6.4 | Single-cycle runtime loop working | **DONE** |
| **Navigation** | 7.1-7.4 | **First POC**: Robot navigates to goal autonomously | **DONE** |
| **Dual Brain** | 8.1-8.5 | Instinct + Planner with escalation | **DONE** |
| **Exploration** | 9.1-9.3 | Frontier-based exploration | **DONE** |
| **Dashboard** | 10.1-10.5 | Full visual debugging UI | Partial |
| **Hardware** | 11.1-11.4 | Physical robot running the same loop | **Software DONE** |
| **Autonomy** | 12.1-12.5 | Observation-based world model | **DONE** |
| **V1 Deploy** | NEW | Physical V1 Stepper Cube Robot deployment | Pending |

> **Note**: Steps 1-9 and 12 are fully implemented with 346+ tests. Step 10 (Dashboard) is partial — RobotWorldPanel exists but not all overlays. Step 11 (Hardware) software layer is complete — firmware, kinematics, WiFi transport, HAL bridge all built. Physical assembly and validation is the next milestone.

Every step is independently testable. Every step builds on the previous one. No step requires more than ~1-2 days of focused work.
