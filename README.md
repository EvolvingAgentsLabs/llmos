# LLMos - Program Robots with Prompts

<div align="center">

**Tell your robot what to do. In plain English. That's it.**

<br/>

```
You: "Avoid walls and blink green when safe"

Robot: *does exactly that*
```

<br/>

[![Try LLMos Online](https://img.shields.io/badge/🚀_Try_LLMos_Online-Vercel-black?style=for-the-badge&logo=vercel)](https://llmos.vercel.app)
[![GitHub Stars](https://img.shields.io/github/stars/EvolvingAgentsLabs/llmos?style=for-the-badge&logo=github&color=yellow)](https://github.com/EvolvingAgentsLabs/llmos)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](LICENSE)

</div>

---

> **⚠️ Active Development**: LLMos is in active development. The code compiles and core features work, but some functionality may be incomplete or change rapidly. Perfect for experimenters and early adopters!

---

## The Simple Truth

**Old way**: Learn C++, write 500 lines of code, debug for hours, maybe your robot works.

**LLMos way**: Say what you want. Robot does it. Done.

```
"Follow the black line on the floor"
"Turn left when you see something close"
"Patrol the room and stop if you see movement"
"Water the plants that look dry"
```

No coding required. But if you want to code, you can.

---

## Quick Start (5 Minutes)

### 1. Install LLMos

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos
npm install
npm run dev
```

### 2. Open Your Browser

Go to `http://localhost:3000`

### 3. Talk to Your Robot

Type in the chat: **"Create a robot that avoids walls"**

That's it. You have a working robot.

---

## What Makes This Different?

### Everything is Markdown

In LLMos, robot behaviors are defined in simple text files anyone can read and edit:

| What | Format | Can Be Evolved |
|------|--------|----------------|
| Robot Skills | Markdown | ✅ Yes |
| Robot Tools (HAL) | Markdown | ✅ Yes |
| Agents | Markdown | ✅ Yes |

This means:
- **Humans** can read and understand how the robot works
- **LLMs** can evaluate and improve behaviors
- **The Dreaming Engine** can automatically evolve skills overnight

### You Don't Need Hardware to Start

LLMos includes a 3D simulator. Your robot runs in a virtual world first:
- Test your ideas for free
- See exactly what the robot sees
- Fix problems before building anything

When you're ready, the same code runs on real ESP32 hardware.

### Your Robot Learns (Auto-Evolution)

Made a mistake? Hit a wall? LLMos remembers:

1. **Records** what went wrong
2. **Dreams** about it (yes, really - while idle)
3. **Improves** the behavior automatically
4. **Wakes up** smarter

This is called the **Dreaming Engine**. Your robot literally learns while it sleeps.

### Safety Built In

LLMos includes multiple safety layers:

- **Hardware Reflexes** - Local safety rules that work even without AI
- **Command Validation** - Every motor command is checked before execution
- **Automatic Speed Reduction** - Robot slows down near obstacles
- **Emergency Stop** - One command to stop everything immediately

---

## For Makers: Build Your First Robot

### What You Need

| Item | Cost | Where |
|------|------|-------|
| ESP32-S3 board | ~$10 | Amazon, AliExpress |
| 2 DC motors + driver | ~$10 | Amazon, AliExpress |
| Distance sensor | ~$5 | Amazon, AliExpress |
| Chassis (or cardboard!) | ~$5 | Anywhere |
| **Total** | **~$30** | |

That's it. Less than a nice dinner.

### The Simplest Robot

```
[Distance Sensor]
       |
   [ESP32-S3] ----[USB]---- [Your Computer]
       |
 [Motor Driver]
   /        \
[Left]    [Right]
Motor      Motor
```

1. Connect the parts
2. Plug USB into your computer
3. Type: "Avoid walls"
4. Watch it go

### Example Prompts That Work

**Beginner:**
```
"Blink the LED red"
"Drive forward for 2 seconds"
"Stop when something is close"
```

**Intermediate:**
```
"Follow the black line on the floor"
"Explore the room and avoid obstacles"
"Go to the corner and come back"
```

**Advanced:**
```
"Map the room and remember where obstacles are"
"Find the red ball and push it to the corner"
"Patrol between three waypoints"
```

---

## How LLMos Works (The Magic Explained)

### Step 1: You Talk

```
You: "Make the robot follow walls"
```

### Step 2: AI Understands

LLMos uses Gemini to understand what you want and creates a **Skill Cartridge**:

```markdown
# Wall Following Skill

## Visual Cortex
- Watch for walls on the right side
- Keep wall at 20-30cm distance

## Motor Cortex
- If wall too close: turn left slightly
- If wall too far: turn right slightly
- Otherwise: drive forward

## Safety
- Stop if front obstacle < 10cm
```

### Step 3: Robot Executes

The robot runs this at 5 times per second:
1. Read sensors
2. Ask AI what to do
3. Execute command
4. Repeat

### Step 4: Robot Improves

If something goes wrong, LLMos:
1. Saves the failure to the **BlackBox**
2. Analyzes what happened
3. Generates better approaches
4. Tests them in simulation
5. Updates the skill automatically

---

## The Building Blocks

### Skill Cartridges (Markdown)

Think of them like apps for your robot:

```markdown
---
name: Plant_Waterer
type: physical_skill
version: 1.0.0
---

# Role
You're a plant care robot.

# What to Look For
- Dry soil (lighter color)
- Wilting leaves
- Empty water trays

# What to Do
1. Find a dry plant
2. Navigate to it
3. Water it
4. Move to next plant
```

Load different skills = Different robot behaviors. Same hardware.

### HAL Tools (Markdown)

Robot commands are also defined in markdown for easy evolution:

```markdown
---
name: hal_drive
type: hal_tool
category: locomotion
safety_critical: true
---

# HAL Tool: hal_drive

Control wheel motors for differential drive.

## Parameters
| Param | Type | Range | Description |
|-------|------|-------|-------------|
| left | number | -255 to 255 | Left wheel power |
| right | number | -255 to 255 | Right wheel power |

## Examples
### Drive forward
{"name": "hal_drive", "args": {"left": 100, "right": 100}}

## Evolution History
| Version | Changes | Source |
|---------|---------|--------|
| 1.0.0 | Initial | Created |
| 1.1.0 | Added deadband | Dreaming Engine |
```

The Dreaming Engine can update these tools with learned improvements!

### Available HAL Commands

| Command | What It Does |
|---------|--------------|
| `hal_drive(left, right)` | Set wheel speeds (-255 to 255) |
| `hal_stop()` | Stop moving |
| `hal_set_led(r, g, b)` | Set LED color |
| `hal_get_distance()` | Read distance sensors |
| `hal_vision_scan()` | Scan for objects |
| `hal_speak(text)` | Say something |
| `hal_emergency_stop()` | STOP EVERYTHING NOW |

These work identically in simulation and on real hardware.

### The Dreaming Engine

Your robot's improvement cycle:

```
         ┌─────────────────┐
         │   Robot runs    │
         │   (maybe fails) │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  BlackBox saves │
         │   the failure   │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  Dreaming runs  │
         │   (while idle)  │
         └────────┬────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
┌───▼───┐    ┌───────┐    ┌────▼────┐
│Replay │ → │Mutate │ → │Evaluate│
│failure│    │skills │    │variants│
└───────┘    └───────┘    └────┬────┘
                               │
         ┌────────────────────▼─────┐
         │  Best variant becomes   │
         │  the new skill          │
         └─────────────────────────┘
```

---

## Safety Features

### Hardware Reflexes

These run on the robot itself, no AI needed:

```typescript
// Emergency stop if bumper pressed
if (bumper.pressed) {
  motors.stop();  // Instant, no waiting for AI
}

// Automatic slowdown near obstacles
if (distance.front < 15cm) {
  speed = min(speed, 30%);  // Force slow speed
}

// Emergency distance threshold
if (distance.front < 8cm) {
  motors.stop();
  motors.reverse();  // Back up automatically
}
```

### Command Validator

Every motor command goes through safety checks:

```
LLM says: "drive(255, 255)"  ← Full speed ahead!

Validator checks:
  ✗ Front obstacle at 12cm
  ✗ Speed too high near obstacle

Validator adjusts: "drive(60, 60)"  ← Safe speed
```

### Agentic Auditor

Before a skill is shared with others, it's automatically validated:

- Does it have safety protocols?
- Are all the required sections present?
- Does it use valid HAL commands?
- Score must be high enough to share

This prevents buggy skills from spreading.

---

## Physics Simulation

The simulator now has realistic physics:

### Motor Deadband
Real motors don't move at very low power. LLMos simulates this:
- PWM < 40 = no movement (just like real life)
- Helps catch bugs before hardware testing

### Momentum and Inertia
Robots don't stop instantly:
- Acceleration and deceleration are realistic
- Turning has rotational inertia
- Helps you write smooth navigation

### Trajectory Prediction
LLMos predicts where your robot will be:
- Warns about collisions before they happen
- Automatically adjusts speed
- Shows predicted path in debug mode

---

## Session Analysis

Every robot session is recorded and analyzed:

### Failure Patterns
```
Session Analysis:
- 3 collisions detected
- All occurred when turning right
- Recommendation: Reduce speed during right turns
```

### Performance Metrics
```
Performance:
- Average speed: 45 cm/s
- Average confidence: 87%
- Distance traveled: 12.3 meters
- Emergency stops: 0
```

### Session Comparison
Compare two runs to see improvement:
```
Session A vs Session B:
- Failures: 5 → 1 (80% improvement!)
- Confidence: 72% → 89%
- Better session: B
```

### CSV Export
Export sessions for external analysis in Excel, Python, etc.

---

## Project Structure

```
llmos/
├── lib/
│   ├── hal/                       # Hardware Abstraction Layer
│   │   ├── types.ts               # HAL interfaces
│   │   ├── command-validator.ts   # Safety validation
│   │   ├── hal-tool-loader.ts     # Markdown tool loader
│   │   ├── simulation-adapter.ts
│   │   └── physical-adapter.ts
│   │
│   ├── evolution/                 # Dreaming Engine
│   │   ├── black-box-recorder.ts  # Session recording
│   │   ├── simulation-replayer.ts # Physics simulation
│   │   ├── evolutionary-patcher.ts
│   │   └── agentic-auditor.ts     # Skill validation
│   │
│   ├── runtime/                   # Robot control
│   │   └── esp32-agent-runtime.ts
│   │
│   └── skills/                    # Skill loading
│       └── physical-skill-loader.ts
│
├── volumes/
│   ├── system/
│   │   ├── skills/                # Built-in skills (markdown)
│   │   ├── hal-tools/             # HAL commands (markdown)
│   │   ├── agents/                # Agent definitions (markdown)
│   │   └── tools/                 # Tool specs (markdown)
│   ├── team/skills/               # Shared skills
│   └── user/skills/               # Your skills
│
├── app/api/hal-tools/             # HAL tools API
└── components/                    # UI components
```

---

## Examples

### Wall-Following Robot

Type: `"Create a robot that follows walls on its right side"`

LLMos generates:
```markdown
# Wall Follower

Keep the right wall at 25cm distance.

## Behavior
- Wall too close (< 20cm): Turn left gently
- Wall too far (> 30cm): Turn right gently
- Wall just right: Go straight
- Front blocked: Turn left until clear
```

### Light-Seeking Robot

Type: `"Make a robot that goes toward bright light"`

LLMos generates:
```markdown
# Light Seeker

Move toward the brightest area.

## Behavior
- Compare left and right light sensors
- Turn toward brighter side
- Move forward when facing light
- Stop when light is very bright (found it!)
```

### Patrol Robot

Type: `"Create a security robot that patrols between corners"`

LLMos generates:
```markdown
# Security Patrol

Visit each corner of the room repeatedly.

## Waypoints
1. Front-left corner
2. Front-right corner
3. Back-right corner
4. Back-left corner
5. Return to 1

## Behavior
- Navigate to next waypoint
- Avoid obstacles en route
- Flash LED at each waypoint
- Pause 2 seconds, then continue
```

---

## Tips for Success

### Start Simple
```
Good first prompt: "Drive forward and stop when close to something"
Bad first prompt: "Build an autonomous warehouse robot with inventory management"
```

### Be Specific About What You See
```
Good: "Turn left when the front sensor reads less than 30cm"
Vague: "Avoid stuff"
```

### Use the Simulator First
Test everything virtually before uploading to hardware. It's free and fast.

### Let It Learn
Don't manually fix every problem. Let the Dreaming Engine improve things overnight.

### Check the Debug Console
The robot navigation debugger shows exactly what the robot sees and decides:
```
[SENSORS] front=45cm left=80cm right=30cm
[DECISION] Wall on right, maintaining distance
[COMMAND] drive(60, 65) - slight right turn
```

---

## Hardware Guide

### Recommended: ESP32-S3

Why ESP32-S3?
- Built-in WiFi and Bluetooth
- Camera support
- Enough power for real AI
- Very cheap (~$10)
- Huge community

### Wiring Basics

**Motors:**
```
ESP32 GPIO12 → Motor Driver IN1
ESP32 GPIO13 → Motor Driver IN2
ESP32 GPIO14 → Motor Driver IN3
ESP32 GPIO15 → Motor Driver IN4
ESP32 5V → Motor Driver VCC
ESP32 GND → Motor Driver GND
```

**Distance Sensor (HC-SR04):**
```
ESP32 GPIO16 → Trigger
ESP32 GPIO17 → Echo
ESP32 5V → VCC
ESP32 GND → GND
```

**LED (optional):**
```
ESP32 GPIO48 → LED Data In (WS2812B)
ESP32 5V → LED VCC
ESP32 GND → LED GND
```

### Full Build Guide
See [docs/hardware/HARDWARE_SHOPPING_LIST.md](docs/hardware/HARDWARE_SHOPPING_LIST.md)

---

## FAQ

**Q: Do I need to code?**

No. Describe what you want in English.

**Q: Do I need hardware?**

No. Start with the simulator. Get hardware later if you want.

**Q: What AI model does it use?**

Gemini 2.0 Flash by default. Fast and capable.

**Q: Is it free?**

LLMos is free and open source. You'll need a Gemini API key (free tier available).

**Q: Can I use other robots?**

Any ESP32-based robot works. The HAL adapts to different hardware configurations.

**Q: What if my robot hits a wall?**

The Dreaming Engine will analyze the failure and improve the skill automatically.

**Q: Can multiple robots work together?**

Coming soon! Multi-robot swarms are on the roadmap.

**Q: Is this production-ready?**

Not yet! LLMos is in active development. Great for experiments and learning, but expect rough edges.

---

## What's Next: Auto-Evolving Physical AI

LLMos is building toward **autonomous physical AI** that:

1. **Self-improves** - Robots that get better at their jobs without human intervention
2. **Knowledge sharing** - Learned skills spread across robot fleets
3. **Simulation-first** - Test 1000 approaches overnight, deploy the best one
4. **Human-readable** - Every behavior is a markdown file you can inspect

This is the future: robots that evolve like software, not hardware.

---

## Get Help

- **GitHub Issues**: [Report bugs](https://github.com/EvolvingAgentsLabs/llmos/issues)
- **Discussions**: [Ask questions](https://github.com/EvolvingAgentsLabs/llmos/discussions)
- **Docs**: [Read the guides](docs/)

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's coming:
- Multi-robot swarms
- Camera-based navigation
- Voice control
- Mobile app
- More sensor support

---

## Contributing

We love contributions! See [CONTRIBUTING.md](CONTRIBUTING.md).

Ways to help:
- Report bugs
- Suggest features
- Write documentation
- Share your robot builds
- Create skill cartridges

---

## License

Apache 2.0 - Free for everyone.

---

<div align="center">

## Ready?

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos && npm install && npm run dev
```

Then type: **"Create a robot that avoids walls"**

---

**Built by makers, for makers.**

[![Try LLMos](https://img.shields.io/badge/🚀_Try_Now-llmos.vercel.app-58a6ff?style=for-the-badge)](https://llmos.vercel.app)

</div>
