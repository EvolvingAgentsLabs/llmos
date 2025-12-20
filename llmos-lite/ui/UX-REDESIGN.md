# LLMos-Lite UX Redesign: Claude Code CLI Experience

## Core Philosophy Shift

### ❌ OLD (Chat-Centric Artifact Generation)
- Chat generates "artifacts" as separate entities
- Artifacts live in chat history  
- Canvas shows chat-generated visualizations
- Disconnected from file system

### ✅ NEW (Claude Code CLI Experience)
- Chat **directly modifies files** in volumes (like Claude Code modifies project files)
- Canvas shows **live preview** of files using runtime
- Volumes are **GitHub repositories** (persistent)
- Sub-agents **execute from volume files** (like Claude Code uses custom agents)

---

## 1. Chat Interface = Claude Code CLI

### Chat Behavior

The chat works **exactly like Claude Code CLI**:

```
You: "Create a VQE circuit for H2 molecule"