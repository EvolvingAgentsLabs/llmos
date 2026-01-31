# Program Robots with Prompts: The Smartphone Moment for Robotics

**Your robot. Your words. That's it.**

---

> **⚠️ Active Development**: LLMos is being built right now. The code compiles, core features work, but we're shipping fast. Some things may break. Perfect for tinkerers who want to be part of something new.

---

## The Problem

Building a robot today looks like this:

```
1. Learn C++
2. Write 500 lines of code
3. Debug for hours
4. Flash firmware
5. Test, fail, repeat
6. Maybe it works?
```

What if it looked like this instead?

```
You: "Avoid walls and blink green when safe"

Robot: *does exactly that*
```

That's LLMos.

---

## What is LLMos?

LLMos is an operating system for robots where you don't write code—you write prompts.

| Old Way | LLMos Way |
|---------|-----------|
| C++ firmware | English prompts |
| Weeks to build | Minutes to try |
| One robot, one job | One robot, infinite jobs |
| Stuck behavior | Self-improving behavior |

The robot's "brain" is an AI that reads simple markdown files. Change the file, change the robot.

---

## The Simple Demo

**Step 1**: Install LLMos
```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos && npm install && npm run dev
```

**Step 2**: Open your browser at `localhost:3000`

**Step 3**: Type: "Create a robot that avoids walls"

**Step 4**: Watch it work in the 3D simulator

That's it. No C++. No firmware. No debugging. Just words.

---

## Everything is Markdown

Here's the magic: every robot behavior is a simple text file.

### Skills are Markdown

```markdown
---
name: Wall_Avoider
type: physical_skill
version: 1.0.0
---

# Role
You're a robot that avoids walls.

# What to Do
- If wall ahead: turn away
- If clear: drive forward
- Always blink green when safe
```

### Tools are Markdown

```markdown
---
name: hal_drive
type: hal_tool
category: locomotion
---

# HAL Tool: hal_drive

Control wheel motors.

## Parameters
| Param | Range | What it does |
|-------|-------|--------------|
| left  | -255 to 255 | Left wheel power |
| right | -255 to 255 | Right wheel power |

## Evolution History
| Version | Changes | How |
|---------|---------|-----|
| 1.0.0   | Created | Manual |
| 1.1.0   | Added deadband | Dreaming Engine |
```

### Why Markdown?

Because it's:
- **Readable** by humans
- **Readable** by AI
- **Editable** with any text editor
- **Evolvable** automatically

The Dreaming Engine can read these files, improve them, and save the improvements. Your robot gets smarter while you sleep.

---

## Auto-Evolving Robots

This is where it gets interesting.

### The Dreaming Engine

Your robot fails at something. Maybe it hits a wall. LLMos:

1. **Records** the failure to a "BlackBox"
2. **Waits** until the robot is idle
3. **Replays** the failure in simulation
4. **Generates** 100 variations of the approach
5. **Tests** each one in accelerated time
6. **Picks** the winner
7. **Updates** the skill file

Morning comes. Your robot opens its "eyes" and doesn't hit that wall anymore.

**It learned while it slept.**

### Knowledge Sharing

If your robot is part of a fleet, even better:

```
Robot A learns to open a sticky door
        ↓
Skill file updates in shared storage
        ↓
Robot B, C, D all know how to open that door
        ↓
They never tried it themselves
```

Skills spread like software updates. One robot's lesson becomes every robot's knowledge.

---

## The Hardware

You don't need much:

| Part | Cost |
|------|------|
| ESP32-S3 board | ~$10 |
| 2 motors + driver | ~$10 |
| Distance sensor | ~$5 |
| Cardboard chassis | ~$5 |
| **Total** | **~$30** |

Less than dinner for two.

```
[Distance Sensor]
       |
   [ESP32-S3] ----USB---- [Your Computer]
       |
 [Motor Driver]
   /        \
[Left]    [Right]
Motor      Motor
```

Plug it in. Type a prompt. Watch it move.

---

## Safety by Design

We're not crazy. Robots that learn need guardrails.

### Hardware Reflexes

These run on the robot itself, no AI needed:

```
Bumper pressed? → Stop instantly
Too close to wall? → Slow down
Way too close? → Back up
```

The AI doesn't get a vote. These rules always win.

### Command Validator

Every command the AI suggests goes through safety checks:

```
AI: "Drive full speed!"
Validator: "There's a wall 10cm ahead."
Actual command: "Drive slowly."
```

The AI proposes. Safety disposes.

### Agentic Auditor

Before a skill can be shared with other robots, it's automatically checked:

- Does it have safety rules?
- Does it use valid commands?
- Is it complete?

Broken skills don't spread.

---

## The Vision: Download Physical Labor

Today you download apps. Tomorrow you'll download skills.

```
Need a security guard?     → sentry.md
Need a plant waterer?      → gardener.md
Need a package sorter?     → warehouse.md
Need a cat entertainer?    → pet_sitter.md
```

One robot. Infinite jobs. The hardware is just the "screen." The skill is the app.

---

## What's Being Built Right Now

LLMos is in active development. Here's what exists:

### Working Now
- 3D robot simulator
- Prompt-to-skill generation
- HAL (Hardware Abstraction Layer)
- Skills in markdown
- Tools in markdown
- Command validator
- Hardware reflexes
- Physics simulation (motor deadband, inertia)
- Session recording (BlackBox)

### Coming Soon
- Full Dreaming Engine integration
- ESP32 physical hardware support
- Multi-robot coordination
- Camera-based navigation
- Voice control

### The Honesty

Some parts compile but aren't fully wired together yet. If you try it today, expect:
- The simulator to work great
- Prompt-to-skill to work
- Physical hardware integration to be rough
- Some features to be scaffolding

We're building in public. You're seeing the construction site.

---

## Why This Matters

Robotics has been stuck for decades. The barrier isn't hardware—you can buy motors for $5. The barrier is **programming**.

Teaching a robot to do something new traditionally means:
- Hiring expensive engineers
- Writing complex code
- Testing for months
- Maintaining forever

LLMos inverts this:
- Anyone can write a prompt
- AI figures out the implementation
- Simulation tests it instantly
- The robot improves itself

**The App Store for the real world is opening.**

---

## Get Involved

We're building this in the open and we'd love help:

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos && npm install && npm run dev
```

Then:
- Try it
- Break it
- Fix it
- Build skills
- Tell us what's wrong

**GitHub**: [github.com/EvolvingAgentsLabs/llmos](https://github.com/EvolvingAgentsLabs/llmos)

---

## The Simple Pitch

```
You: "Follow the black line"

Robot: *follows the black line*

You: "Actually, stop when you see red"

Robot: *now stops when it sees red*

[That night]

Dreaming Engine: "I noticed the robot struggles with
sharp curves. Testing 50 variations... Found a better
approach. Updating skill file."

[Next morning]

Robot: *handles sharp curves smoothly*

You: *didn't do anything*
```

This is the future we're building:

**Robots that understand you.**
**Robots that improve themselves.**
**Robots anyone can program.**

One prompt at a time.

---

## Start Now

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos && npm install && npm run dev
```

Open `localhost:3000`

Type: **"Create a robot that avoids walls"**

Welcome to the smartphone moment for robotics.

---

*Built by makers, for makers.*

*Part of the LLMos project. Apache 2.0 licensed.*

**Tags**: #LLMos #Robotics #AI #OpenSource #PhysicalAI #AutoEvolution #Makers
