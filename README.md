# LLMos-Lite

> A Self-Improving AI Workbench with GitHub-Backed Context Memory

**LLMos-Lite** transforms your GitHub commits into AI training data. Every session you create, every prompt you write, becomes context memory that evolves into reusable skills - automatically.

## 🎯 What Makes This Different

Traditional Git commits are for humans. **LLMos-Lite commits are for AI.**

```
session: Quantum Circuit Design

Prompt: Create a Bell state circuit with 2 qubits...

Stats:
- 8 messages
- 3 artifacts generated
- 5 traces executed

🤖 LLMunix Context Memory
```

→ Your AI analyzes these commits → Detects patterns → Generates skills → You get smarter workflows

## 🚀 Quick Start (5 minutes)

### 1. Setup UI

```bash
cd llmos-lite/ui
npm install
cp .env.local.example .env.local
```

### 2. Get Your API Keys

**Required: Anthropic API Key**
- Get it: https://console.anthropic.com/
- Add to UI during onboarding OR set `ANTHROPIC_API_KEY` env var

**Optional but Recommended: GitHub OAuth**
- Create OAuth App: https://github.com/settings/developers
  - Name: `LLMos-Lite Dev`
  - Homepage: `http://localhost:3000`
  - Callback: `http://localhost:3000/api/auth/github/callback`
- Copy Client ID & Secret to `.env.local`:
  ```env
  GITHUB_CLIENT_ID=your_github_client_id
  GITHUB_CLIENT_SECRET=your_github_client_secret
  NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id  # Same as above
  NEXTAUTH_SECRET=$(openssl rand -base64 32)
  NEXTAUTH_URL=http://localhost:3000
  ```

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000

### 4. Try It Out

1. Complete onboarding (add Anthropic API key)
2. **Click "Try Now"** on quantum/3D sample prompts
3. Chat with AI, create sessions
4. **Connect GitHub** (right sidebar → GITHUB section)
5. **Commit Session** (right sidebar → ACTIONS)
6. **Run Evolution Cron** (left sidebar → CRONS → "Run Now")

## 🌟 Key Features

### 1. Clickable Sample Prompts
No more copy-paste. Click **"Try Now"** to send quantum/3D prompts directly to chat.

### 2. GitHub Integration (Optional)
- **Real Git Commits**: Sessions → GitHub repos
- **Cross-Device Sync**: Access anywhere
- **Team Collaboration**: Shared team volumes
- **Context Memory**: Commits embed prompts for AI analysis

### 3. Intelligent Cron Analysis
- Analyzes your commit history
- Detects recurring patterns (e.g., "quantum circuits" x 5 times)
- **Auto-generates skills** from patterns
- Live countdown timers show next execution

### 4. Interactive Artifacts
- **Quantum Circuits**: Qiskit visualizations
- **3D Graphics**: Three.js renders
- **Data Plots**: Convergence graphs
- **Code Execution**: Python/JS in browser (WebAssembly)

### 5. Multi-Volume Architecture
```
System Volume  (Read-Only)  → Global best practices
  ↑
Team Volume    (Shared)     → Team collaboration
  ↑
User Volume    (Private)    → Your experiments
```

## 📁 Project Structure

```
llmos-lite/
├── ui/                           # Next.js Web App (THE MAIN EVENT)
│   ├── components/
│   │   ├── onboarding/           # NEW: Sample prompts with "Try Now"
│   │   ├── settings/             # NEW: GitHub connection UI
│   │   ├── context/              # NEW: Commit sessions
│   │   ├── panel1-volumes/       # NEW: Cron countdown timers
│   │   └── ...
│   ├── lib/
│   │   ├── github-auth.ts        # NEW: GitHub OAuth
│   │   ├── git-service.ts        # NEW: Git operations
│   │   ├── cron-analyzer.ts      # NEW: Pattern detection
│   │   ├── llm-client.ts         # LLM API client
│   │   └── ...
│   ├── app/
│   │   └── api/auth/github/      # NEW: OAuth callback
│   └── .env.local.example        # NEW: Config template
│
├── core/                         # Backend Python (if needed)
│   ├── volumes.py                # Git-backed storage
│   ├── skills.py                 # Skills loader
│   └── evolution.py              # Pattern detection
│
├── api/                          # FastAPI (optional)
│   └── main.py                   # REST endpoints
│
└── volumes/                      # Git Repos (auto-created)
    ├── system/skills/            # Global skills
    ├── teams/{id}/skills/        # Team skills
    └── users/{id}/               # User sessions + skills
        ├── sessions/             # Session JSON files
        └── skills/               # Auto-generated skills
```

## 💡 How It Works

### The Self-Improvement Loop

```
Day 1-7: You Work
  ├─> Create sessions (chat, code, analyze)
  ├─> Each session committed to GitHub
  └─> Commit messages embed prompts + artifacts

Night 7: AI Evolves
  ├─> Cron runs (or manual trigger)
  ├─> Fetches commit history from GitHub
  ├─> Extracts prompts: "quantum circuit" x 5
  ├─> LLM detects pattern (92% confidence)
  └─> Generates skill: quantum-circuit-design.md

Day 8+: You Benefit
  ├─> New skill auto-loaded in context
  ├─> AI gives better guidance
  └─> Faster workflows
```

### Commit as Context Memory

Every commit you make:
```
session: VQE Optimization

Prompt: Create VQE circuit for H2 molecule...

Stats:
- 12 messages
- 3 artifacts: code, circuit, plot
- 8 traces executed

Artifacts:
- quantum-circuit: bell_state
- code: vqe_h2.py
- skill: quantum-optimization.md

🤖 LLMunix Context Memory
```

This structured format allows:
- **Pattern Detection**: "User created 5 quantum circuits → pattern"
- **Skill Generation**: "Generate skill from pattern"
- **Team Learning**: "Team created 20 API endpoints → team skill"

## 🔧 Configuration

### Environment Variables

**UI (.env.local):**
```env
# Required for chat
ANTHROPIC_API_KEY=sk-ant-...         # Or set during onboarding

# Optional: GitHub Integration
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_secret
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_client_id
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
```

**Backend (if using Python API):**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export LLMOS_VOLUMES_PATH=./volumes
```

## 📖 Developer Guide

### Architecture Overview

```
┌────────────────────────────────────────────────┐
│  Browser (Next.js + React)                    │
│  ┌──────────────┐  ┌─────────────────┐        │
│  │ Chat UI      │  │ Workflow Canvas │        │
│  │ + Artifacts  │  │ (React Flow)    │        │
│  └──────┬───────┘  └────────┬────────┘        │
└─────────┼──────────────────────┼───────────────┘
          │                      │
    ┌─────▼──────┐      ┌───────▼────────┐
    │ LLM Client │      │ GitHub Service │
    └─────┬──────┘      └───────┬────────┘
          │                     │
    ┌─────▼─────────────────────▼─────┐
    │   Anthropic Claude API           │
    │   GitHub REST API                │
    └──────────────────────────────────┘
```

**Key Components:**
- `lib/llm-client.ts` - Anthropic/OpenRouter client
- `lib/github-auth.ts` - OAuth flow
- `lib/git-service.ts` - Commit/fetch operations
- `lib/cron-analyzer.ts` - Pattern detection engine
- `contexts/SessionContext.tsx` - Session state management

### Adding Features

**1. Add a New Artifact Type**

```typescript
// components/panel3-artifacts/ArtifactViewer.tsx

// Define type
type MyArtifact = {
  type: 'my-artifact';
  data: { /* your data */ };
};

// Add renderer
case 'my-artifact':
  return <MyArtifactRenderer data={artifact.data} />;
```

**2. Customize Evolution Pattern**

```typescript
// lib/cron-analyzer.ts

// Adjust thresholds
CronAnalyzer.analyzeVolume(volume, {
  minOccurrences: 3,    // Pattern needs 3+ instances
  minConfidence: 0.85,   // 85% confidence required
});
```

**3. Add Custom Cron Job**

```typescript
// components/panel1-volumes/CronList.tsx

const crons: CronJob[] = [
  {
    id: 'my-custom-cron',
    name: 'My Analysis',
    status: 'scheduled',
    nextRunSeconds: 3600,  // 1 hour
    intervalSeconds: 86400, // 24 hours
  },
  // ...
];
```

### Testing

```bash
# Run tests (when available)
npm test

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

## 🎨 UI Components

### Terminal Theme
- **Background**: `#0a0e14` (dark)
- **Accent Green**: `#00ff88` (success, active)
- **Accent Blue**: `#00d4ff` (info)
- **Accent Yellow**: `#ffcc00` (warning)
- **Font**: JetBrains Mono (monospace)

### Key Components
- `components/onboarding/FirstTimeGuide.tsx` - Onboarding wizard with sample prompts
- `components/context/ContextPanel.tsx` - Right sidebar (GitHub, actions)
- `components/panel1-volumes/CronList.tsx` - Cron countdown timers
- `components/chat/ChatPanel.tsx` - Main chat interface
- `components/panel3-artifacts/` - Artifact renderers (quantum, 3D, plots)

## 🔐 Security

### GitHub OAuth
- Client secret **never exposed** to browser
- OAuth callback handled server-side (Next.js API route)
- Access tokens stored in localStorage (client-side only)
- Private repos by default

### Execution Safety
- Python/JS code runs in browser via WebAssembly (Pyodide)
- Sandboxed execution environment
- No server-side code execution
- Resource limits enforced

## 🚧 Roadmap

### ✅ Completed (v0.1)
- [x] Sample prompts with "Try Now" buttons
- [x] GitHub OAuth integration
- [x] Real Git commits with context
- [x] Cron countdown timers
- [x] AI pattern detection
- [x] Auto skill generation
- [x] Multi-volume architecture

### 🔄 In Progress (v0.2)
- [ ] React Flow workflow canvas
- [ ] Drag-and-drop node editor
- [ ] Real-time collaboration
- [ ] Mobile PWA

### 📋 Planned (v0.3)
- [ ] Vector DB for semantic skill search
- [ ] Skill marketplace
- [ ] Multi-LLM support (GPT-4, Gemini)
- [ ] Webhook integration for GitHub
- [ ] Advanced analytics dashboard

## 📚 Documentation

- **ARCHITECTURE.md** - Technical deep-dive
- **ui/.env.local.example** - Configuration template
- **IMPLEMENTATION_SUMMARY.md** - Recent changes (in ui/)

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork the repo**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** (follow existing code style)
4. **Test thoroughly** (ensure `npm run build` succeeds)
5. **Commit with context**: Use descriptive messages
6. **Push and create PR**

### Code Style
- TypeScript for UI code
- Functional React components
- Terminal-themed design
- Clear variable names
- Comments for complex logic

### Where to Contribute
- **New artifact types** (quantum, ML, data viz)
- **Evolution algorithms** (better pattern detection)
- **UI improvements** (mobile, accessibility)
- **Documentation** (tutorials, examples)
- **Tests** (unit, integration, E2E)

## 🐛 Troubleshooting

### "OAuth popup blocked"
→ Allow popups for localhost in browser settings

### "Not authenticated with GitHub"
→ Click "Connect with GitHub" in right sidebar
→ Check `.env.local` has correct credentials
→ Restart dev server after adding env vars

### "Commit failed"
→ Check browser console for errors
→ Verify GitHub token still valid
→ Ensure repo exists and is accessible

### "No patterns detected"
→ Need at least 2 similar sessions committed
→ Check commit messages include prompts
→ Try manually running cron with "Run Now"

### "Cron countdown stuck"
→ Refresh page (client-side timer resets)
→ Expected behavior, not a bug

## 📄 License

Apache 2.0

## 🙏 Credits

Built on insights from the original `llmos` architecture, reimagined for the GitHub-native AI era.

**Core Innovation**: Treating Git commits as AI training data, enabling:
- Self-improving workflows
- Team knowledge sharing
- Automated skill evolution
- Zero-cost execution (browser-based)

---

## Quick Reference Card

| Want to... | Do this... |
|-----------|-----------|
| Start dev server | `cd llmos-lite/ui && npm run dev` |
| Try sample prompts | Onboarding wizard → "Try Now" |
| Connect GitHub | Right sidebar → GITHUB → "Connect" |
| Commit session | Right sidebar → ACTIONS → "Commit" |
| Run evolution | Left sidebar → CRONS → "Run Now" |
| Add API key | Settings (gear icon) |
| View artifacts | Chat panel → artifact previews |
| Check cron status | Left sidebar → countdown timers |

## Getting Help

- **Issues**: https://github.com/llmunix/llmos-lite/issues
- **Discord**: (coming soon)
- **Docs**: See ARCHITECTURE.md for technical details
- **Browser console**: Check for error messages

---

**Remember**: The more you use it, the smarter it gets. Commit early, commit often! 🚀
