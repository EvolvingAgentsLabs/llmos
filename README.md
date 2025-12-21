# LLMos-Lite 🚀

**An AI Operating System That Actually Learns**

LLMos-Lite isn't just another AI coding assistant—it's a **self-evolving operating system** that learns from every interaction, builds institutional knowledge, and gets smarter over time. Optimized for WebAssembly-compatible scientific computing, data science, and 3D visualization, expanding to any domain you teach it.

---

## 🎯 What Makes LLMos Different?

### 🧠 It Has Memory

Unlike traditional AI assistants that forget everything after each conversation:

- ✅ **Learns from every execution** - Successful patterns become system knowledge
- ✅ **Queries past experiences** - Consults memory before planning new tasks
- ✅ **Improves over time** - Each run makes the next one better
- ✅ **Never forgets** - Persistent memory across all sessions

```
First Time:  "Create FFT analysis" → Takes 5 mins, requires guidance
Third Time:  "Analyze audio spectrum" → 30 seconds, applies learned patterns
Tenth Time:  "Process signal data" → Instant, uses refined techniques
```

### 📁 It's File-First (The Claude Code Way)

Everything is **real files in persistent storage**, not chat artifacts:

- 📁 All outputs saved to organized project structures
- 🌳 Complete file tree showing every file and folder
- 💾 Virtual file system with localStorage persistence
- 🔄 Auto-refreshing tree (picks up new files in <2 seconds)

### 🔄 It's Self-Improving

The system doesn't stay static—it **evolves**:

- 🧠 **Memory System**: Short-term execution logs + long-term learnings
- 📊 **Pattern Recognition**: Identifies what works, what doesn't
- 🔄 **Continuous Learning**: Every task updates system knowledge
- 📈 **Compound Intelligence**: Gets better with use

```
Traditional Tools                LLMos-Lite (Evolving OS)
────────────────                ─────────────────────────
Static features                 Self-improving capabilities
Manual workflows                Learned automation
Generic templates               Domain-specific expertise
Starts fresh each time          Continuous knowledge growth
```

---

## 🎨 What You Can Build

### WebAssembly-Compatible Domains

**🎵 Signal Processing & Audio Analysis**
- FFT spectrum analysis for audio signals
- Digital filter design (low-pass, high-pass, band-pass)
- Wavelet transforms and time-frequency analysis
- Noise reduction and signal enhancement
- Spectrograms and audio feature extraction

**📊 Data Science & Machine Learning**
- Classification models (SVM, Random Forest, Decision Trees)
- Regression analysis and predictive modeling
- Clustering algorithms (K-means, DBSCAN, hierarchical)
- Principal Component Analysis (PCA) and dimensionality reduction
- Time series analysis and forecasting
- Interactive data visualizations with matplotlib

**🔬 Scientific Computing & Simulation**
- Numerical integration and differentiation
- Solving differential equations (ODEs, PDEs)
- Linear algebra operations and matrix decomposition
- Optimization problems (linear, nonlinear, constrained)
- Monte Carlo simulations
- Statistical distributions and hypothesis testing

**🎨 3D Visualization & Modeling**
- 3D surface plots and contour maps
- Parametric curves and surfaces
- Vector field visualization
- Molecular structure visualization
- Terrain modeling and topographic maps
- Interactive 3D scatter plots

**🤖 Robotics & Control Systems**
- Forward and inverse kinematics
- Trajectory planning and path optimization
- PID controller tuning and simulation
- Motion planning algorithms
- Sensor fusion and Kalman filtering
- Robot arm workspace analysis

**🌐 Network & Graph Analysis**
- Social network analysis
- Graph algorithms (shortest path, centrality, clustering)
- Network topology visualization
- Flow optimization problems
- Community detection

### Available Libraries (Browser-Compatible)

✅ **numpy** - Numerical computing
✅ **scipy** - Scientific computing
✅ **matplotlib** - Visualization
✅ **pandas** - Data analysis
✅ **scikit-learn** - Machine learning
✅ **networkx** - Graph analysis
✅ **sympy** - Symbolic mathematics

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos.git
cd llmos/llmos-lite
npm install
npm run dev
```

Open http://localhost:3000

### 2. Setup

1. Enter your OpenRouter API key
2. Select your use case (Signal Processing, Data Science, 3D Visualization, Robotics)
3. Start chatting - the system learns your field

### 3. Your First Task

```
You: "Create a sine wave signal, add noise, then apply FFT to show frequency spectrum"

SystemAgent:
📝 Creating project: signal_fft_analysis
📝 Generating Python code with scipy.fft
✅ Executing in browser...
📊 FFT peak detected at 50 Hz
📁 Saved to output/visualizations/
📝 Logged to memory/short_term/

Your project is ready in User > projects > signal_fft_analysis
```

**What just happened?**
- Created organized project structure (9 files)
- Generated Python code with WebAssembly-compatible libraries
- Executed in your browser (no server needed)
- Saved all outputs to persistent VFS
- Logged execution for future learning
- **System now knows how to do FFT analysis**

---

## 🏗️ The LLMunix Architecture

### Complete Implementation

✅ **SystemAgent** - Memory-aware master orchestrator
✅ **Virtual File System (VFS)** - Browser-based persistent storage
✅ **Memory Analysis Agent** - Queries past experiences
✅ **Memory Consolidation Agent** - Transforms traces into learnings
✅ **System Memory Log** - Repository of all execution experiences
✅ **Enhanced File Tree** - Shows complete hierarchies recursively
✅ **Read-Only System Volume** - Immutable system artifacts

### How It Works

```
1. Planning Phase
   └─ SystemAgent reads /system/memory_log.md
   └─ Searches for similar past tasks
   └─ Extracts successful patterns
   └─ Incorporates learnings into plan

2. Execution Phase
   └─ Creates organized project structure
   └─ Generates all required directories
   └─ Executes Python code in browser
   └─ Saves outputs to structured folders

3. Memory Recording
   └─ Writes execution log to memory/short_term/
   └─ Appends experience to system memory
   └─ Includes: goal, outcome, learnings

4. Future Executions
   └─ Next similar task consults memory
   └─ Reuses successful patterns
   └─ Avoids past mistakes
   └─ Improves automatically
```

---

## 📁 Project Structure

Every SystemAgent execution creates:

```
projects/[project_name]/
├── components/
│   └── agents/          # Agent definitions
├── output/
│   ├── code/           # Generated Python files
│   ├── data/           # Data files
│   └── visualizations/ # Matplotlib plots
└── memory/
    ├── short_term/     # Execution logs
    └── long_term/      # Consolidated learnings
```

**All visible in the file tree. All persistent. All organized.**

---

## 🧠 The Memory System

### System-Wide Learning

**Location:** `/system/memory_log.md` (visible in System volume)

Every execution creates a structured experience entry:

```yaml
---
experience_id: exp_001
project_name: signal_fft_analysis
primary_goal: Create sine wave and apply FFT
final_outcome: success
components_used: [SystemAgent, scipy, matplotlib]
files_created: 9
execution_time_ms: 12500
learnings_or_issues: |
  scipy.fft + matplotlib works reliably in browser.
  Organized output/ structure improves clarity.
  Creating .gitkeep files ensures directory persistence.
timestamp: 2025-12-21T18:30:45Z
---
```

### Memory-Informed Planning

Next time you run a similar task:

```
You: "Analyze audio frequency spectrum"

SystemAgent:
👁️ Reading /system/memory_log.md
📖 Found: exp_001 - FFT analysis with scipy.fft
✅ Applying learned pattern...
⚡ Completed in 3 seconds (vs 12 seconds first time)
```

The system **remembers** and **reuses** successful patterns.

---

## 🔧 File-First Development (The Claude Code Way)

### Real Files, Real Persistence

LLMos doesn't show code in chat—it **creates actual files**:

```
Traditional Chatbot              LLMos-Lite
───────────────                 ─────────────
Bot: "Here's the code:          AI: 📝 Write File
     ```python                      projects/analysis/fft.py
     def analyze():
       ...                      ✓ File created in VFS
     ```
     [Copy and paste this]"     [File persists across sessions,
                                 visible in file tree]

User: Copy → Paste → Save       User: File already exists,
      Create new file                 ready to run
      Lose chat history              Stored in browser forever
```

### The AI Uses Tools, Not Text

Watch the AI work transparently:

```
You: "Add noise filtering to my signal analysis"

AI: 👁️ Read File
    projects/signal_analysis/fft.py

    [AI analyzes the code]

    ✏️ Edit File
    projects/signal_analysis/fft.py

    + from scipy.signal import butter, filtfilt
    + b, a = butter(4, 0.125)
    + filtered_signal = filtfilt(b, a, noisy_signal)

    ✓ Added low-pass Butterworth filter

    📝 Write File
    projects/signal_analysis/README.md

    ✓ Created documentation explaining the filter design
```

Every operation is **visible** and **traceable**.

---

## 💻 Live Execution: Your Browser is the Computer

### Split View: Code ↔ Results

Open any Python file and see:

```
┌─────────────────────┬─────────────────────┐
│   CODE EDITOR       │   LIVE PREVIEW      │
├─────────────────────┼─────────────────────┤
│ import numpy as np  │ ✓ Executed 0.8s    │
│ from scipy.fft      │                     │
│   import fft        │ Output:             │
│                     │                     │
│ # FFT Analysis      │ FFT Results:        │
│ signal = np.sin(    │ Peak at 50 Hz       │
│   2*np.pi*50*t)     │ Amplitude: 1.0      │
│                     │                     │
│ spectrum = fft(     │ [Frequency Plot]    │
│   signal)           │  📊 [Graph]        │
│                     │                     │
│ plt.plot(freq,      │ [Time Domain]       │
│   np.abs(spectrum)) │  📈 [Graph]        │
│                     │                     │
│ [Auto-run: ON]      │ Done in 847ms      │
└─────────────────────┴─────────────────────┘
```

**Everything runs in your browser:**
- ⚡ Python via Pyodide (no server)
- 📊 Matplotlib plots captured as images
- 📝 Full stdout/stderr capture
- 🎯 30-second timeout protection
- 📦 Auto-install missing packages

### Instant Feedback Loop

```
Edit code → Save (Cmd+S) → Auto-run → See results
                  ↓
              < 1 second
                  ↓
              Iterate rapidly
```

No context switching. No deployment. **Pure flow state.**

---

## 📊 Example Workflows

### 1. Signal Processing

```
You: "Analyze audio file with spectrogram"

AI: Setting up audio spectrogram analysis

    📝 projects/audio_analysis/spectrogram.py
    📝 projects/audio_analysis/output/README.md

    [Runs automatically]

    ✓ Generated spectrogram (0-5000 Hz range)
    ✓ Identified dominant frequencies: 440Hz, 880Hz
    ✓ Saved visualization: output/visualizations/spectrogram.png

    [Shows time-frequency plot]

    This is a musical note A4 (440 Hz) with its first harmonic.
```

### 2. Machine Learning

```
You: "Build a classification model for iris dataset"

AI: Creating scikit-learn classification pipeline

    📝 projects/iris_classification/train_model.py
    📝 projects/iris_classification/evaluate.py

    [Trains model in browser]

    ✓ Model: Random Forest (100 trees)
    ✓ Accuracy: 96.7%
    ✓ Cross-validation: 95.3% ± 2.1%

    [Shows confusion matrix]

    Model ready. Predictions:
    - Setosa: 100% accuracy
    - Versicolor: 93% accuracy
    - Virginica: 97% accuracy
```

### 3. Robotics Simulation

```
You: "Calculate inverse kinematics for 3-DOF robot arm"

AI: Setting up robotic arm kinematics solver

    📝 projects/robot_arm/kinematics.py
    📝 projects/robot_arm/visualization.py

    [Executes simulation]

    ✓ Solved inverse kinematics
    ✓ Joint angles: [45°, 30°, -15°]
    ✓ End effector position: (0.5, 0.3, 0.2)

    [Shows 3D arm configuration]

    Solution found in 12 iterations using Jacobian method.
```

---

## 🔄 How Knowledge Compounds

### The Learning Loop

```
Week 1
──────
You: Manually create FFT analyses
     Learn filter design
     Experiment with window functions

System: Observes patterns
        Tracks successful approaches
        Notes failure modes

Week 2
──────
You: Continue signal processing work
     Try different audio files
     Refine techniques

System: "I've noticed you prefer Hamming windows"
        "You always normalize signals first"
        "Your frequency range is typically 0-5000 Hz"

Week 3
──────
System: Creates skills:
        - projects/skills/audio-preprocessing.py
        - projects/skills/fft-with-windowing.py

        Updates memory:
        - Remembers your preferred parameters
        - Applies normalization automatically

Week 4
──────
You: "Analyze this new audio sample"

AI: I'll use your audio analysis workflows
    [Automatically applies all your learned patterns]
    [Uses Hamming window]
    [Normalizes signal]
    [Sets 0-5000 Hz range]

    ✓ Done in 2 seconds (would have taken 15 minutes in Week 1)

The system has become **your signal processing assistant**.
```

---

## 🎯 Test Pages

### SystemAgent Test Interface

**URL:** http://localhost:3000/test-system-agent

Test the LLMunix orchestrator with:
- Sample prompts (signal processing, 3D plots, robotics)
- View execution results
- Browse created files
- Inspect tool calls

### VFS Debug Page

**URL:** http://localhost:3000/debug-vfs

Inspect the Virtual File System:
- View all stored files
- Check file metadata
- Inspect localStorage contents
- Debug path normalization

---

## 📚 Documentation

- **README.md** (this file) - Overview and quick start
- **llmos-lite/README.md** - Detailed feature documentation
- **llmos-lite/ARCHITECTURE.md** - Technical architecture
- **llmos-lite/LLMUNIX_COMPLETE.md** - Complete LLMunix implementation guide

---

## 🚀 What's Next

### Immediate Future

- **Memory Query UI** - Browse system memory visually
- **Pattern Visualization** - Charts showing learning patterns
- **Session Replay** - Replay past executions
- **Cross-Project Learning** - Share learnings between projects

### Long-Term Vision

**The Self-Improving OS:**
- System that adapts to any technical domain
- Agents that rewrite themselves based on success
- Skills that merge and evolve automatically
- Community knowledge marketplace

**The Research Accelerator:**
- Paper → Implementation in minutes
- Automated literature review
- Experiment design assistance
- Reproducibility by default

---

## 🤝 Contributing

LLMos-Lite is open source and actively developed. Contributions welcome!

### Areas for Contribution

- **Domain Packs**: Add support for new technical domains
- **Memory Algorithms**: Improve pattern recognition
- **Tool Development**: Create new system tools
- **UI Improvements**: Enhance file tree, canvas, chat

### Getting Started

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/llmos.git
cd llmos/llmos-lite

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

See **llmos-lite/CONTRIBUTING.md** for guidelines.

---

## 📖 Philosophy

### File-First, Browser-Native

Inspired by Claude Code:
- Files are the source of truth (not chat)
- Everything is persistent
- Operations are transparent
- No server needed—runs in your browser

### Self-Evolving Intelligence

Unlike static tools:
- Learns from every execution
- Builds institutional knowledge
- Improves continuously
- Never forgets successful patterns

### Domain-Ready, Not Domain-Specific

Built to adapt:
- Start with WebAssembly-compatible computing
- Teach it your domain through use
- System becomes fluent over time
- Knowledge compounds through doing

---

## 💬 Community

- **GitHub Repository**: https://github.com/EvolvingAgentsLabs/llmos
- **Issues & Bug Reports**: https://github.com/EvolvingAgentsLabs/llmos/issues
- **Discussions**: https://github.com/EvolvingAgentsLabs/llmos/discussions
- **Documentation**: See `/llmos-lite/` folder in the repository

---

## 🔒 Security & Privacy

- **API Keys**: Stored in browser localStorage only
- **Code Execution**: Sandboxed in Pyodide (browser-based Python)
- **File Storage**: All in browser localStorage (no server storage)
- **Network Access**: Disabled from Python runtime

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- **Claude Code** - Inspiration for file-first architecture
- **LLMunix** - Original LLMunix pattern and memory system
- **Pyodide** - Python in the browser
- **OpenRouter** - LLM API access

---

**Ready to build an AI that actually learns?** 🧠

**Ready for organized, persistent outputs?** 📁

**Ready for a system that gets smarter over time?** 📈

```bash
cd llmos-lite
npm run dev
```

**Watch the system evolve.** 🚀
