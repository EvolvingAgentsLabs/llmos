# Getting Started with LLMos-Lite

This step-by-step tutorial will guide you through setting up and using LLMos-Lite with a **free model**.

## Prerequisites

- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection
- No coding experience required!

---

## Part 1: Setup (5 minutes)

### Step 1: Get a Free OpenRouter API Key

1. **Visit OpenRouter**: Go to https://openrouter.ai/keys
2. **Sign up** (if you don't have an account):
   - Click "Sign in with Google" or "Sign in with GitHub"
   - Or create an account with email
3. **Create API Key**:
   - Click "Create Key" button
   - Give it a name like "llmos-lite"
   - **Copy the key** - it starts with `sk-or-v1-...`
   - ⚠️ **Important**: Save this key somewhere safe, you can't see it again!

4. **Add Free Credits** (Optional but recommended):
   - OpenRouter gives you $1-5 in free credits to start
   - Some models are completely free (no credits needed)

### Step 2: Launch LLMos-Lite

1. Open your browser and navigate to the LLMos-Lite URL
2. You'll see the **Welcome Screen** with a setup form

### Step 3: Complete the Setup Form

Fill in the following information:

#### **Your Information** Section:

1. **Email**: Enter your email address
   - Example: `john@example.com`
   - Used for identification only (stored locally)

2. **Name**: Enter your full name
   - Example: `John Doe`
   - This appears in your profile

3. **Team Name**: Enter a team or project name
   - Example: `personal` or `research` or `engineering`
   - Helps organize your work

#### **API Configuration** Section:

4. **OpenRouter API Key**:
   - Paste the key you copied from Step 1
   - Should start with `sk-or-v1-`
   - You'll see a green checkmark when valid ✓

5. **Model Name**:
   - **Default (Recommended for beginners)**: `tng/deepseek-r1t2-chimera:free`
   - This is a **completely free** reasoning model
   - No credits required, no cost!

**Other Free Model Options**:
- `meta-llama/llama-3.1-8b-instruct:free` - Fast general purpose
- `microsoft/phi-3-mini-128k-instruct:free` - Small but capable
- `google/gemma-2-9b-it:free` - Google's free model

**Premium Models** (require credits):
- `anthropic/claude-opus-4.5` - Best quality
- `openai/gpt-5.2` - Latest OpenAI
- `google/gemini-pro-1.5` - Google's premium

6. **Click "Complete Setup"**
   - All data is saved to your browser (localStorage)
   - Nothing is sent to any server
   - Your API key stays on your device

---

## Part 2: Your First Chat Session (10 minutes)

### Step 4: Understanding the Interface

After setup, you'll see the **LLMos-Lite Terminal** with 3 panels:

**On Desktop (3 panels)**:
```
┌──────────────┬──────────────────┬──────────────┐
│  Volumes     │  Chat/Session    │  Workflow    │
│  Navigator   │  Viewer          │  Editor      │
└──────────────┴──────────────────┴──────────────┘
```

**On Mobile (tabs at bottom)**:
- 📁 Volumes
- 💬 Chat
- 🔗 Workflow

#### Panel 1: Volumes Navigator (Left)
- **VOLUMES**: Switch between system/team/user storage
- **SESSIONS**: Your conversation sessions appear here
- **CRON UPDATES**: Scheduled tasks (click to expand)
- **GIT STATUS**: Version control info (click to expand)

#### Panel 2: Chat Viewer (Center)
- Main conversation interface
- Send messages to the AI
- View responses and traces

#### Panel 3: Workflow Editor (Right)
- Visual workflow graph
- Node details
- Artifacts generated

### Step 5: Start Your First Session

Currently, there are **no sessions**. Let's create one!

1. **Look at the center panel** - you'll see "Select a session to view"
2. **Type your first message** in the chat input at the bottom
3. **Example first message**:
   ```
   Help me create a simple Python script to analyze CSV data
   ```
4. **Click "Send"** or press Enter

### Step 6: Watch the AI Work

1. **New session appears** in the left panel (Volumes Navigator)
   - Session ID auto-generated (e.g., `session_1234567890`)
   - Status: ● Active (green dot)
   - Trace count starts at 0

2. **AI responds** in the center panel
   - Assistant's message appears
   - Trace numbers show (e.g., "✓ Trace #1-3 executed")
   - Any generated artifacts are listed

3. **Workflow visualizes** in the right panel (desktop only)
   - Nodes represent steps taken
   - Edges show relationships
   - Click nodes to see details

### Step 7: Continue the Conversation

Build on the AI's response:

**Example conversation flow**:

```
You: Help me create a simple Python script to analyze CSV data

AI: I'll help you create a Python script for CSV analysis. Here's a
    script that uses pandas...

    [Code appears]
    ✓ Trace #1-2 executed
    ✓ Artifact created: csv_analyzer.py

You: Can you add error handling for missing files?

AI: I'll update the script with error handling...

    [Updated code]
    ✓ Trace #3-4 executed
    ✓ Artifact updated: csv_analyzer.py

You: Now add data visualization with matplotlib

AI: I'll add matplotlib charts to visualize the data...

    [Enhanced code]
    ✓ Trace #5-7 executed
    ✓ Artifact updated: csv_analyzer.py
    ⭐ Pattern detected: Data Analysis
```

---

## Part 3: Advanced Features (15 minutes)

### Step 8: Understanding Sessions

**What is a session?**
- A conversation thread with a specific goal
- Stores all messages, traces, and artifacts
- Can be committed, shared, or promoted

**Session Statuses**:
- ● **Active** (green): Currently working, uncommitted changes
- ✓ **Committed** (green): Saved to version control
- **Patterns detected** (yellow): AI identified reusable patterns

### Step 9: Working with Artifacts

**Types of Artifacts**:
- 📄 **Skills**: Reusable patterns and templates
- 📄 **Code**: Generated scripts and programs
- 🔀 **Workflows**: Process flows and pipelines

**Viewing Artifacts**:
1. Scroll to bottom of chat panel
2. See "SESSION ARTIFACTS" section
3. Click "View" button on any artifact
4. Artifact details appear in right panel (or new tab on mobile)

### Step 10: Session Management

**Committing a Session**:
1. Find your active session in Volumes Navigator (left panel)
2. Click "Commit" button below the session
3. Session gets a commit hash (e.g., `a1b2c3d`)
4. Status changes to ✓ Committed

**Sharing a Session**:
1. Click "Share" button on the session
2. Generate shareable link
3. Others can view (not edit) your session

**Promoting to Team**:
- If a pattern is detected with high confidence (>90%)
- Click "Promote to Team" in Evolution Status
- Pattern becomes available for team members

### Step 11: Evolution & Pattern Detection

LLMos-Lite learns from your work:

**How it works**:
1. You work on similar tasks 2-3 times
2. AI detects patterns (e.g., "Data Analysis", "API Integration")
3. Evolution Status appears showing:
   - Pattern name
   - Occurrence count (1st, 2nd, 3rd time)
   - Confidence level (percentage)
   - Recommendation to promote

**Example**:
```
🧬 EVOLUTION STATUS
VQE Optimization
Occurrence: 3rd time
Confidence: 95%
Recommend: Promote to team

[Promote to Team] [Ignore]
```

### Step 12: Using Workflows (Desktop/Tablet)

**Fullscreen Mode** (especially useful on mobile):
1. Click the ⛶ icon in Workflow Graph header
2. Graph expands to full screen
3. Better view for complex workflows
4. Click ✕ to exit fullscreen

**Interacting with Nodes**:
1. Click any node in the workflow graph
2. Node details appear below (or in side panel)
3. See inputs, outputs, and execution status

---

## Part 4: Mobile Experience

### Step 13: Using on Mobile Devices

**Bottom Navigation** (phones < 768px):
- 📁 **Volumes**: Browse sessions and storage
- 💬 **Chat**: Send messages and view responses
- 🔗 **Workflow**: View and edit workflows

**Touch-Friendly Features**:
- All buttons are 44px minimum (easy to tap)
- Swipe-friendly interfaces
- Collapsible sections to save space

**Mobile Tips**:
1. Start in 💬 Chat tab to send messages
2. Switch to 📁 Volumes to see session list
3. Use 🔗 Workflow in fullscreen mode (⛶ icon)
4. Collapse Cron/Git sections in Volumes to save space

---

## Part 5: Profile & Settings

### Step 14: Viewing Your Profile

1. **Click your username** in the top-right header
   - Desktop: Shows `username@teamname`
   - Mobile: Shows ⚙️ (settings icon)
2. **Profile Settings modal opens**

**What you can see**:
- User ID (read-only)
- Email (editable)
- Name (editable)
- Team Name (editable)
- Account creation date

### Step 15: Editing Your Profile

1. Click "Edit Profile" button
2. Update any field (except User ID)
3. Click "Save Changes"
4. Page reloads to update header

### Step 16: Logging Out

⚠️ **Warning**: This clears ALL local data!

**What gets deleted**:
- Your user profile
- Team information
- API key
- Model selection
- All sessions and chat history
- All localStorage data

**To logout**:
1. Open Profile Settings
2. Click "Logout & Clear Data" (red button)
3. Confirm the warning dialog
4. You'll return to setup screen

---

## Part 6: Tips & Best Practices

### Model Selection Tips

**Free Models** (No cost):
- ✅ Great for: Learning, testing, personal projects
- ✅ `tng/deepseek-r1t2-chimera:free` - Best free reasoning model
- ✅ `meta-llama/llama-3.1-8b-instruct:free` - Fast and reliable
- ⚠️ Limited: May be slower, less capable than premium

**Premium Models** (Requires credits):
- 💎 `anthropic/claude-opus-4.5` - Best quality responses
- 💎 `openai/gpt-5.2` - Latest and greatest
- 💎 Good for: Production, complex tasks, best results

**Changing Models**:
1. Open Profile Settings
2. Click "Logout & Clear Data"
3. Re-setup with new model name
4. (Future: Hot-swap models without logout)

### Chat Best Practices

**1. Be Specific**:
- ❌ Bad: "Help me code"
- ✅ Good: "Help me create a Python script to analyze CSV files with pandas"

**2. Iterative Development**:
- Start simple
- Add features one at a time
- Test at each step

**3. Use Sessions Wisely**:
- One session = one goal/project
- Commit when you reach milestones
- Create new session for new topics

**4. Pattern Detection**:
- Repeat similar tasks 2-3 times
- AI learns your patterns
- Promoted skills save time later

### Storage & Privacy

**Where is data stored?**
- 🔒 **localStorage** in your browser
- 🔒 **Never leaves your device**
- 🔒 **No server, no cloud, no tracking**

**What happens if I clear browser data?**
- ⚠️ All LLMos-Lite data is lost
- ⚠️ You'll need to re-setup
- ⚠️ Sessions won't be recoverable

**Pro tip**: Save important artifacts/code externally!

---

## Troubleshooting

### "Invalid API key format" Error
- Check key starts with `sk-or-v1-`
- No spaces before/after the key
- Get a new key from https://openrouter.ai/keys

### "Please complete your profile setup" Error
- Logout and re-setup
- Make sure all fields filled
- Check email has @ symbol

### "Failed to send message" Error
- Check API key is correct
- Verify model name is valid
- Check OpenRouter credits (for paid models)
- Try a free model: `tng/deepseek-r1t2-chimera:free`

### No sessions appearing
- This is normal on first use!
- Send your first message to create a session
- Session appears in left panel automatically

### Mobile bottom nav not working
- Make sure you're on a phone (<768px width)
- Try refreshing the page
- Check browser compatibility

---

## Example Use Cases

### 1. Code Generation
```
You: Create a REST API with FastAPI for a todo app
AI: [Generates code, creates artifacts]
You: Add authentication with JWT tokens
AI: [Updates code, explains implementation]
You: Add Swagger documentation
AI: [Enhances code, creates workflow]
```

### 2. Data Analysis
```
You: Analyze this sales data and create visualizations
AI: [Creates pandas script, matplotlib charts]
You: Add trend analysis
AI: [Adds statistical analysis]
Pattern detected: "Sales Analysis" (3rd time, 92% confidence)
```

### 3. Learning & Research
```
You: Explain quantum computing basics
AI: [Detailed explanation with examples]
You: Show me a simple quantum circuit in Qiskit
AI: [Code example with explanation]
You: Create a reusable template for VQE optimization
AI: [Generates skill artifact]
```

---

## Next Steps

**After completing this tutorial, you can**:
1. ✅ Create unlimited chat sessions
2. ✅ Generate code and artifacts
3. ✅ Build and visualize workflows
4. ✅ Train the AI on your patterns
5. ✅ Share sessions with team members
6. ✅ Use completely for free (with free models)

**Advanced features to explore**:
- Multi-session workflows
- Team collaboration (when backend is added)
- Custom skill libraries
- Cron scheduling
- Git integration

---

## FAQ

**Q: Is this really free?**
A: Yes! With free models like `tng/deepseek-r1t2-chimera:free`, there's no cost. Premium models require OpenRouter credits.

**Q: Do I need to install anything?**
A: No! It's a web app, runs in your browser.

**Q: Where is my data stored?**
A: Locally in your browser (localStorage). Nothing goes to a server.

**Q: Can I use offline?**
A: No, you need internet to call OpenRouter's API.

**Q: How do I backup my data?**
A: Currently manual (copy artifacts). Future: Export/import feature.

**Q: Can I use my own OpenAI/Anthropic key?**
A: Not yet. Currently OpenRouter only. Future: Multi-provider support.

**Q: What's the difference between user/team/system volumes?**
A:
- **user**: Your personal sessions
- **team**: Shared with team members
- **system**: Global/template skills

**Q: How do I delete a session?**
A: Currently not possible in UI. Future: Session management features.

---

## Getting Help

**Issues or Questions?**
- Check this guide first
- Visit the GitHub repository
- Open an issue with details
- Join the community Discord (if available)

**Contributing**:
- LLMos-Lite is open source!
- Report bugs
- Suggest features
- Submit pull requests

---

## Summary Checklist

Setup completed when you have:
- ✅ OpenRouter API key configured
- ✅ Free model selected (`tng/deepseek-r1t2-chimera:free`)
- ✅ Profile information saved
- ✅ First message sent successfully
- ✅ Session appears in Volumes Navigator
- ✅ AI response received

**You're ready to build! 🚀**

---

*Last updated: 2025-12-15*
*LLMos-Lite Version: 1.0.0*
*Tutorial version: 1.0*
