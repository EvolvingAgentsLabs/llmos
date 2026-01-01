# LLMos-Lite: Hello World End-to-End Test Case

This document provides a comprehensive "Hello World" test suite to verify that all components of the LLMos-Lite system are working correctly. Execute these tests in sequence to validate the entire system.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Test 1: System Boot Sequence](#test-1-system-boot-sequence)
3. [Test 2: Basic Chat Interaction](#test-2-basic-chat-interaction)
4. [Test 3: File System Operations](#test-3-file-system-operations)
5. [Test 4: Applet Generation & Execution](#test-4-applet-generation--execution)
6. [Test 5: Python Code Execution](#test-5-python-code-execution)
7. [Test 6: Multi-Agent Orchestration](#test-6-multi-agent-orchestration)
8. [Test 7: Git Integration](#test-7-git-integration)
9. [Test 8: Context & Memory System](#test-8-context--memory-system)
10. [Quick Validation Checklist](#quick-validation-checklist)
11. [Troubleshooting](#troubleshooting)

---

## 1. Prerequisites

Before running these tests, ensure the following are configured:

### Required Configuration

| Component | Requirement | How to Verify |
|-----------|-------------|---------------|
| **OpenRouter API Key** | Valid API key | Settings panel shows "API Connected" |
| **GitHub Token** | Personal access token with repo scope | Can browse volumes in VolumeExplorer |
| **Team Volume** | GitHub repo configured | `NEXT_PUBLIC_TEAM_VOLUME_REPO` is set |
| **User Volume** | GitHub repo configured | `NEXT_PUBLIC_USER_VOLUME_REPO` is set |
| **Node.js** | v18+ | `node --version` |
| **Browser** | Chrome/Firefox/Safari | Modern ES2020+ support |

### Starting the Application

```bash
# From the project root
cd llmos-lite/ui
npm install
npm run dev
```

The application should be available at `http://localhost:3000`

---

## Test 1: System Boot Sequence

**Objective**: Verify the kernel boots correctly and initializes all subsystems.

### Steps

1. Open the application in a fresh browser tab
2. Observe the boot screen with progress indicators
3. Wait for the system to reach "Ready" state

### Expected Boot Stages

| Stage | Duration | What It Does | Success Indicator |
|-------|----------|--------------|-------------------|
| `init` | ~500ms | Initialize system state | "Initializing..." displayed |
| `auth` | ~1000ms | Verify API keys | No auth errors |
| `vfs` | ~1500ms | Initialize virtual file system | Volume icons appear |
| `kernel` | ~3000ms | Load Pyodide/Babel runtimes | "Loading runtimes..." |
| `ready` | ~500ms | System ready | Main UI displayed |

### Validation Criteria

- [ ] Boot screen appears with logo
- [ ] Progress bar advances through all stages
- [ ] No JavaScript console errors
- [ ] Main chat interface loads
- [ ] Avatar/JARVIS element visible (if using FluidLayout)

### Console Check

Open browser DevTools (F12) and verify:
```javascript
// No red errors
// Look for: "[Kernel] Boot complete"
// Look for: "[VFS] Volumes initialized"
```

---

## Test 2: Basic Chat Interaction

**Objective**: Verify the core chat functionality and LLM integration.

### Test 2.1: Simple Greeting

**Input**:
```
Hello! Can you tell me what you are?
```

**Expected Output**:
- Agent responds within 5-10 seconds
- Response describes LLMos capabilities
- Message appears in chat history
- Loading indicator shows during processing

### Test 2.2: Simple Calculation

**Input**:
```
What is 42 * 17 + 123?
```

**Expected Output**:
- Correct answer: **837**
- Response formatted clearly
- No tool calls required

### Test 2.3: Tool Discovery

**Input**:
```
What tools do you have available?
```

**Expected Output**:
Agent should list available tools including:

| Tool | Description |
|------|-------------|
| `write-file` | Write content to files in the virtual file system |
| `read-file` | Read content from files |
| `list-directory` | List files and subdirectories |
| `execute-python` | Execute Python code in browser (Pyodide) |
| `invoke-subagent` | Execute code via a markdown sub-agent (tracks usage) |
| `discover-subagents` | Discover available agent definitions |
| `validate-project-agents` | Validate minimum 3-agent requirement |
| `generate-applet` | Generate interactive React applets |

**Note**: Tool names use kebab-case (e.g., `write-file` not `write_file`).

### Validation Criteria

- [ ] Chat input field accepts text
- [ ] Send button triggers request
- [ ] Loading spinner appears
- [ ] Response renders properly
- [ ] Markdown formatting works
- [ ] Code blocks render with syntax highlighting

---

## Test 3: File System Operations

**Objective**: Verify the Git-backed volume file system works correctly.

### Understanding the File System Structure

> **IMPORTANT**: The LLMos file system has a structured layout:
> ```
> /                        ← Root (contains only directories)
> ├── system/              ← System files (read-only for users)
> │   ├── agents/          ← System agent definitions
> │   ├── memory_log.md    ← System memory
> │   └── workflow_history/← Execution logs
> └── projects/            ← USER FILES GO HERE
>     └── [your files]     ← All user-created files
> ```
>
> When you create files in the "user volume", they are stored in `/projects/`, not the literal root.

### Test 3.1: Read File

**Input**:
```
Read the file at /system/memory_log.md and show me its contents.
```

**Expected Behavior**:
1. Agent calls `read-file` tool
2. Tool execution shown in chat
3. File content displayed (system memory log)

**Alternative** (if memory_log.md doesn't exist):
```
List the files in /system/ and read any available file.
```

**Note**: On a fresh installation, some files may not exist yet. The test passes if the `read-file` tool executes correctly, even if the file is not found.

### Test 3.2: Write File (Hello World)

**Input**:
```
Create a new file called "hello-world-test.txt" in the user volume with the content:
"Hello, World! This is a test file created at [current timestamp]."
```

**Expected Behavior**:
1. Agent calls `write-file` tool
2. Confirmation message displayed with path, size, and content
3. File created at `/projects/hello-world-test.txt`

**Verification**:
```bash
# File will be created at: /projects/hello-world-test.txt
# Check GitHub repo for user volume under the projects/ directory
```

### Test 3.3: List Files

**Input**:
```
List all files in the /projects/ directory.
```

**Expected Behavior**:
1. Agent calls `list-directory` tool
2. File listing displayed
3. Shows the `hello-world-test.txt` we just created

**Note**: Listing `/` (root) will only show directories (`/system/`, `/projects/`). To see user files, always list `/projects/`.

### Test 3.4: Edit File

**Input**:
```
Edit the file at /projects/hello-world-test.txt. Find "Hello, World!" and replace it with "Hello, LLMos!"
```

**Expected Behavior**:
1. Agent reads the file, modifies content, and writes it back
2. Confirmation shown with updated content
3. File updated in GitHub

**Note**: The system may use `read-file` + `write-file` instead of a dedicated `edit-file` tool.

### Test 3.5: Delete File

**Input**:
```
Delete the file at /projects/hello-world-test.txt from the user volume.
```

**Expected Behavior**:
1. Agent removes the file (or overwrites with empty content)
2. Confirmation shown
3. File removed/emptied in GitHub

**Known Limitations**:
- No native `delete-file` tool exists - the agent uses `write-file` with empty content as a workaround
- File entry may remain in VFS with 0 bytes rather than being truly deleted

**Note**: If delete is not available, you can verify by listing `/projects/` to confirm file operations work.

### Validation Criteria

- [ ] Read operations return correct content
- [ ] Write operations create files in `/projects/`
- [ ] Edit operations modify files correctly
- [ ] List operations show files in correct directories
- [ ] VolumeExplorer reflects changes
- [ ] GitHub commits have proper messages

---

## Test 4: Applet Generation & Execution

**Objective**: Verify the generative UI system can create and run React applets.

### Test 4.1: Simple Button Applet

**Input**:
```
Create a simple applet with a blue button that says "Click Me!" and shows an alert with "Hello, World!" when clicked.
```

**Expected Behavior**:
1. Agent generates TSX code
2. Applet compiles via Babel
3. Preview renders in UI
4. Button is clickable
5. Alert appears on click

### Test 4.2: Counter Applet with State

**Input**:
```
Create an applet with a counter. It should have:
- A number display starting at 0
- A "+" button to increment
- A "-" button to decrement
- A "Reset" button to go back to 0
Style it nicely with Tailwind CSS.
```

**Expected Behavior**:
1. Applet renders with three buttons
2. Counter increments/decrements correctly
3. Reset works
4. Styling applied

### Test 4.3: Data Display Applet

**Input**:
```
Create an applet that displays a table with 3 columns: Name, Role, Status.
Include sample data for 3 team members.
Make it look professional with alternating row colors.
```

**Expected Behavior**:
1. Table renders correctly
2. Data displayed in rows
3. Alternating colors visible
4. Responsive layout

### Validation Criteria

- [ ] TSX code generated correctly
- [ ] Babel compilation succeeds
- [ ] Applet renders in preview/modal
- [ ] State management works (React hooks)
- [ ] Tailwind classes applied
- [ ] No console errors during execution
- [ ] Applet appears in recent applets

---

## Test 5: Python Code Execution

**Objective**: Verify the Pyodide runtime executes Python code correctly.

### Test 5.1: Basic Python

**Input**:
```
Run this Python code and show the output:

```python
def greet(name):
    return f"Hello, {name}! Welcome to LLMos."

print(greet("World"))
print(greet("Developer"))
```
```

**Expected Output**:
```
Hello, World! Welcome to LLMos.
Hello, Developer! Welcome to LLMos.
```

### Test 5.2: Mathematical Computation

**Input**:
```
Run Python code to:
1. Calculate the first 10 Fibonacci numbers
2. Calculate the factorial of 10
3. Print both results
```

**Expected Output**:
```
Fibonacci: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
Factorial of 10: 3628800
```

### Test 5.3: Data Visualization (Matplotlib)

**Input**:
```
Run Python code to create a simple bar chart showing:
- Categories: A, B, C, D, E
- Values: 23, 45, 56, 78, 32
Use matplotlib and show the chart.
```

**Expected Behavior**:
1. Pyodide loads matplotlib
2. Chart generated
3. Base64 image displayed in output
4. Chart visible to user

### Test 5.4: Package Installation

**Input**:
```
Run Python code that uses numpy to create a 3x3 random matrix and calculate its determinant.
```

**Expected Behavior**:
1. numpy auto-installed via micropip
2. Matrix created
3. Determinant calculated and displayed

### Validation Criteria

- [ ] Pyodide runtime initializes
- [ ] Basic Python executes correctly
- [ ] Packages auto-install
- [ ] stdout/stderr captured
- [ ] Matplotlib plots render as images
- [ ] Execution time reasonable (<10s for simple code)

---

## Test 6: Multi-Agent Orchestration

**Objective**: Verify multi-agent coordination and minimum agent requirements.

### Test 6.1: Create Multi-Agent Project

**Input**:
```
Create a new project called "hello-world-project" that requires coordination between multiple agents.
The project should have at least 3 agents:
1. A Planner agent that designs the architecture
2. A Developer agent that writes code
3. A Reviewer agent that validates the output

Just create the agent definitions, don't execute them yet.
```

**Expected Behavior**:
1. Agent creates project structure
2. Three agent definition files created
3. Multi-agent validator confirms 3+ agents
4. Files saved to user volume

### Test 6.2: Agent Definition Verification

**Input**:
```
List the agents in the hello-world-project and verify their configurations.
```

**Expected Behavior**:
1. Lists all three agents
2. Shows each agent's tools and capabilities
3. Confirms valid configuration

### Test 6.3: Agent Execution

**Input**:
```
Using the hello-world-project agents, have them collaborate to create a simple "Hello World" Python script with:
- Planner designs the approach
- Developer writes the code
- Reviewer validates it
Show me the conversation between agents.
```

**Expected Behavior**:
1. Agents execute in sequence
2. Inter-agent communication visible
3. Final output produced
4. Execution trace logged

### Validation Criteria

- [ ] Minimum 3-agent requirement enforced
- [ ] Agent definitions follow markdown format
- [ ] Tools correctly assigned to agents
- [ ] Agent communication works
- [ ] Execution traces captured
- [ ] Results aggregated properly

---

## Test 7: Git Integration

**Objective**: Verify Git operations work with GitHub repositories.

### Test 7.1: View Git Status

**Input**:
```
Show me the current git status of the user volume - any uncommitted changes?
```

**Expected Behavior**:
1. Agent queries git status
2. Status displayed (clean or with changes)

### Test 7.2: Create and Commit Changes

**Input**:
```
1. Create a file called "git-test.md" with "# Git Integration Test" in the user volume
2. Commit it with message "test: Add git integration test file"
3. Show me the commit SHA
```

**Expected Behavior**:
1. File created
2. Git commit made
3. Commit SHA returned
4. Change visible in GitHub

### Test 7.3: View Commit History

**Input**:
```
Show me the last 5 commits in the user volume.
```

**Expected Behavior**:
1. Recent commits listed
2. Shows SHA, message, author, date
3. Our test commit visible

### Validation Criteria

- [ ] Git status accurately reflects state
- [ ] Commits created with proper messages
- [ ] Commit SHAs returned
- [ ] GitHub repo updated
- [ ] Commit history accessible

---

## Test 8: Context & Memory System

**Objective**: Verify context management and evolution system.

### Test 8.1: Context Retention

**Input (Message 1)**:
```
Remember this: My favorite number is 42 and my favorite color is blue.
```

**Input (Message 2 - same session)**:
```
What is my favorite number and color?
```

**Expected Behavior**:
1. Agent remembers from earlier in conversation
2. Correctly states: 42 and blue
3. Context maintained across messages

### Test 8.2: Long Conversation Handling

**Input**:
```
Tell me a very detailed story about a robot learning to code. Make it at least 5 paragraphs.
```

Then continue with 5-10 more messages to test context window management.

**Expected Behavior**:
1. Long responses handled correctly
2. Context summarized if needed
3. No truncation errors
4. Earlier context still accessible

### Test 8.3: System Memory Query

**Input**:
```
What have you learned from our conversation today? Any patterns or preferences?
```

**Expected Behavior**:
1. Agent summarizes conversation
2. May reference evolution/memory system
3. Shows awareness of interaction patterns

### Validation Criteria

- [ ] Context retained within session
- [ ] Long conversations don't crash
- [ ] Summarization triggers when needed
- [ ] Memory system captures patterns
- [ ] Evolution trace created

---

## Quick Validation Checklist

Use this for rapid system validation:

### Core Functionality
- [ ] App loads without errors
- [ ] Chat accepts input and returns responses
- [ ] Files can be created in user volume
- [ ] Applets compile and render
- [ ] Python code executes in Pyodide

### Infrastructure
- [ ] OpenRouter API connected
- [ ] GitHub API connected
- [ ] localStorage persists data
- [ ] Volumes accessible
- [ ] Runtimes load (Babel, Pyodide)

### Agent System
- [ ] SystemAgentOrchestrator processes messages
- [ ] Tools execute correctly
- [ ] Multi-agent validation works
- [ ] Execution traces logged

### UI Components
- [ ] ChatPanel renders
- [ ] VolumeExplorer shows files
- [ ] Canvas/Editor works
- [ ] Applet modals appear
- [ ] Settings accessible

---

## Troubleshooting

### Common Issues

#### Boot Fails at "auth" stage
**Cause**: Invalid API keys
**Fix**: Check OpenRouter and GitHub tokens in settings

#### Files not persisting
**Cause**: GitHub token lacks repo scope
**Fix**: Generate new token with `repo` scope

#### Applets don't render
**Cause**: Babel compilation error
**Fix**: Check console for TSX syntax errors

#### Python code times out
**Cause**: Pyodide not loaded
**Fix**: Wait for kernel to fully initialize, check network

#### "Multi-agent validation failed"
**Cause**: Project has fewer than 3 agents
**Fix**: Ensure project includes at least 3 agent definitions

#### Multi-agent validation triggers on file operations (FIXED in v1.2)
**Cause**: Previously, any file write to `/projects/` would trigger multi-agent validation, even for simple file operations like creating or deleting a single file.
**Fix**: Fixed in `system-agent-orchestrator.ts` - validation now only triggers when creating proper project structures (directories with `components/`, `agents/`, `output/`, etc.)

#### Applets generated but not displayed (FIXED in v1.4)
**Cause**: The `generate-applet` tool completed successfully but applets didn't appear in the Applets panel. Two issues:
1. The applet callback was only registered in `SimpleLayout`, not in `FluidLayout` (JARVIS) or `AdaptiveLayout`
2. Applets were added to `AppletStore` but not to `DesktopAppletManager` (which populates the UI regions)

**Fix**:
- Added `setAppletGeneratedCallback` registration to `FluidLayout.tsx` and `AdaptiveLayout.tsx`
- Also added `DesktopAppletManager.addApplet()` call so applets appear in the "Personal Applets" region

#### Applets displayed but not launching on click (FIXED in v1.5)
**Cause**: After v1.4 fix, applets appeared in the "Personal Applets" region but clicking on them had no effect. The issue was a mismatch between how applets were stored:
1. `createApplet()` was called WITHOUT a `filePath` parameter
2. `DesktopAppletManager.addApplet()` was called WITH `filePath: 'generated/${applet.id}'`
3. When clicking an applet, `handleOpenDesktopApplet` tried to match by `filePath` or `metadata.id`, but the AppletStore entry had no `filePath`

**Fix**:
- In `FluidLayout.tsx` and `AdaptiveLayout.tsx`: Pass consistent `filePath` to both `createApplet()` and `DesktopAppletManager.addApplet()`
- In `AppletGrid.tsx`: Improved matching logic to also check `a.id === desktopApplet.id`
- Added debug logging to trace applet opening flow

### Debug Commands

Open browser console and run:

```javascript
// Check kernel status
window.__LLMOS_DEBUG?.kernelStatus

// Check storage
localStorage.getItem('llmos_lvm_config')

// Check volumes
window.__LLMOS_DEBUG?.volumes

// Force reload runtimes
window.__LLMOS_DEBUG?.reloadRuntimes()
```

### Log Locations

| Log Type | Location |
|----------|----------|
| Browser Console | F12 → Console tab |
| Network Requests | F12 → Network tab |
| React State | React DevTools extension |
| API Calls | Network tab, filter by `openrouter.ai` |

---

## Automated Test Script (Future)

For automated testing, the following Playwright script could be used:

```typescript
// tests/e2e/hello-world.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Hello World E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for boot complete
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
  });

  test('should boot successfully', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
  });

  test('should respond to hello world', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]', 'Hello World!');
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('.chat-message.assistant')).toBeVisible({ timeout: 15000 });
  });

  test('should create file', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]',
      'Create a file called test.txt with content "Hello" in user volume');
    await page.click('[data-testid="send-button"]');
    await expect(page.getByText('File created')).toBeVisible({ timeout: 15000 });
  });
});
```

---

## Summary

This Hello World test suite covers the essential functionality of LLMos-Lite:

| Component | Tests | Criticality |
|-----------|-------|-------------|
| Boot Sequence | 1 | Critical |
| Chat/LLM | 3 | Critical |
| File System | 5 | Critical |
| Applets | 3 | High |
| Python Runtime | 4 | High |
| Multi-Agent | 3 | Medium |
| Git Integration | 3 | Medium |
| Context/Memory | 3 | Medium |

**Total Tests**: 25+

**Estimated Time**: 30-45 minutes for full manual execution

By completing all tests successfully, you can confirm that LLMos-Lite is fully operational and ready for use.

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-01 | Initial document |
| 1.1 | 2026-01-01 | Updated file system tests with correct paths (`/projects/`), corrected tool names to kebab-case, added file system structure documentation |
| 1.2 | 2026-01-01 | Added Test 3.5 known limitations (no delete-file tool), documented and fixed multi-agent validation bug that incorrectly triggered on simple file operations |
| 1.3 | 2026-01-01 | Fixed applet callback registration for FluidLayout and AdaptiveLayout |
| 1.4 | 2026-01-01 | Complete applet fix - also add to DesktopAppletManager so applets appear in Personal Applets region |
| 1.5 | 2026-01-01 | Fixed applet click/launch - ensure filePath is passed to createApplet() and improve matching in handleOpenDesktopApplet |

---

*Document Version: 1.5*
*Last Updated: 2026-01-01*
*For LLMos-Lite v1.x*
