# LLMos - Build AI Robots with Your Voice

```
    ___
   /   \     "Turn your words into working robots!"
  | o o |
   \ ◡ /     LLMos: AI-Powered Robotics for Makers
   |   |
  _|___|_
 |  ___  |
 | |   | |    ┌──────────────────────────────────┐
 |_|   |_|    │  💬 "Make a wall-avoiding robot" │
  /     \     └──────────────────────────────────┘
 /       \              ↓
└─┘   └─┘         🤖 AI writes code
                       ↓
                  📦 Test in simulator
                       ↓
                  🔌 Upload to ESP32
                       ↓
                  🎉 Real robot!
```

**No coding required (but you can if you want!)**
Build robots that avoid walls, follow lines, navigate mazes, and more.

## What Can You Build?

- **Smart Robots**: Robots that avoid obstacles, follow lines, and navigate mazes
- **ESP32 Devices**: Program tiny computers to control motors, LEDs, and sensors
- **Custom Tools**: Create your own apps and interfaces
- **Interactive Dashboards**: Build control panels for your robots

## Desktop-First Experience

LLMos is a **desktop application** built with Electron for the best performance and full hardware access:
- **Native file system** for your robot projects
- **Direct ESP32 flashing** without browser limitations
- **Full serial port access** for debugging
- **Faster compilation** using native AssemblyScript compiler
- **Offline operation** - no internet required after setup

## How It Works (The Magic)

```
┌─────────────────────────────────────────────────────────────────┐
│                      🖥️  LLMos Desktop                          │
│                                                                 │
│  You: "Make a robot that avoids walls"                         │
│   ↓                                                             │
│  🤖 AI Agent analyzes request                                  │
│   ↓                                                             │
│  📝 Generates C code for ESP32                                 │
│   ↓                                                             │
│  ⚡ Compiles to binary                                         │
│   ↓                                                             │
│  ┌─────────────────┐        ┌─────────────────┐               │
│  │  🎮 Simulator   │   OR   │  🔌 Real ESP32  │               │
│  │                 │        │                 │               │
│  │  Test first!    │   →    │  Flash & run!   │               │
│  └─────────────────┘        └─────────────────┘               │
│                                      ↓                          │
│                              🤖 Robot moves!                    │
└─────────────────────────────────────────────────────────────────┘

✨ Everything happens on YOUR computer
🔒 Your code never leaves your machine
📡 No cloud, no internet required
```

## Quick Start (5 Minutes)

### Try Without Any Hardware

You don't need a robot to get started! Try it with a virtual robot first:

```bash
# 1. Download the code
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos

# 2. Install dependencies (one time only)
npm install

# 3. Start LLMos Desktop
npm run electron:dev

# The desktop app will launch automatically
```

Now type in the chat: **"Create a virtual robot that avoids walls"**

LLMos will:
- Create a robot in a virtual world
- Write the code to make it avoid obstacles
- Show you the robot running

### Ready for Real Hardware?

Want to build a physical robot? Here's what a simple ESP32 robot looks like:

```
        [Distance Sensor]
             |||
        ┌────┴┴┴────┐
        │  ESP32-S3 │  ← Brain ($10)
        │   ┌───┐   │
        │   │USB│   │  ← Connect to computer
        └───┴───┴───┘
         │         │
    ┌────┴─┐   ┌──┴────┐
    │Motor │   │ Motor │  ← Wheels ($10)
    └──────┘   └───────┘
```

**Shopping list:**
- **ESP32 board** (about $10 online)
- **Some motors and sensors** (optional, ~$20)
- **USB cable** to connect to your computer

**Total cost**: $30-40 for a complete robot!

See the [ESP32 Guide](docs/hardware/ESP32_GUIDE.md) for step-by-step instructions.

## What Makes LLMos Special?

### Talk to Your Robot
Instead of writing code, just describe what you want:
- "Make the LED turn red when it sees an obstacle"
- "Follow the black line on the floor"
- "Spin left if the front sensor sees something close"

### Test Before Building
See your robot work in a virtual world before you build the physical version. No wasted parts!

### Same Code, Anywhere
The code that runs in simulation works on your real ESP32 robot. No changes needed!

### Build and Improve
LLMos remembers what worked and learns from mistakes. Your robots get smarter over time.

## Example: Wall-Avoiding Robot

Here's what happens when you say: "Create a wall-avoiding robot"

```
┌─────────────────────────────────────────────────────────┐
│ 💬 You: "Make a robot that avoids walls"               │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 🤖 LLMos AI Agent:                                      │
│  ✓ Creates virtual robot                                │
│  ✓ Writes the program                                   │
│  ✓ Tests in simulation                                  │
│  ✓ Ready to deploy!                                     │
└─────────────────────────────────────────────────────────┘
                         ↓
              ┌──────────────────┐
              │   Simulator      │
              │                  │
              │   🤖 →  🧱       │  Robot turns away!
              │                  │
              │   → → → →        │  Path clear!
              └──────────────────┘
                         ↓
              Your robot now:
              ✓ Drives forward when path is clear
              ✓ Detects walls with sensors
              ✓ Turns away from obstacles
              ✓ Never crashes!
```

The program is simple:
```c
void update() {
    int front = distance(0);  // Check front sensor

    if (front < 60) {
        // Wall detected - turn!
        drive(-80, 80);  // Spin left
        led(255, 0, 0);  // Red light
    } else {
        // Path clear - go forward
        drive(120, 120);
        led(0, 255, 0);  // Green light
    }
}
```

## Cool Things You Can Build

```
┌─────────────────┬─────────────────┬─────────────────┐
│   🟢 BEGINNER   │ 🟡 INTERMEDIATE │   🔴 ADVANCED   │
├─────────────────┼─────────────────┼─────────────────┤
│                 │                 │                 │
│  💡 Blink Bot   │  ═══🤖═══      │  🤖  🤖  🤖     │
│     * * *       │  Line Follower  │  Swarm Robots   │
│                 │                 │                 │
│  📏 Distance    │    🤖           │  📷🤖           │
│     Detector    │   /│\           │  Camera Vision  │
│                 │  Wall Avoider   │                 │
│  🌈 Light       │                 │  📱→🤖          │
│     Show        │  🤖→🔄→🚪       │  Remote Control │
│                 │  Maze Solver    │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

**Start simple, build complex!**

## 🎮 Simulation-to-Real Platform

LLMos includes a physics-based simulator that lets you test robots before building them!

### Standard 5m x 5m Arena

Test in a virtual 5m × 5m arena, then build the same arena in real life:

```
   Virtual Arena              Real Arena
┌─────────────────┐       ┌─────────────────┐
│  🎮 Simulator   │  ═══► │  🏗️  Physical   │
│                 │ SAME  │                 │
│  5m x 5m        │ CODE  │  5m x 5m        │
│                 │  ═══► │                 │
│  FREE, INSTANT  │       │  $30-40 ROBOT   │
└─────────────────┘       └─────────────────┘
```

**6 Standard Maps** (simulation → real world):
- `standard5x5Empty` - Basic navigation
- `standard5x5Obstacles` - Obstacle avoidance (11 obstacles)
- `standard5x5LineTrack` - Line following (oval)
- `standard5x5Maze` - Path planning challenge
- `standard5x5Figure8` - Advanced line following
- `standard5x5Delivery` - Sequential navigation

**10 Challenge Courses**:
From beginner (basic navigation) to advanced (maze solving, obstacle racing)

**See**:
- **[Standard Robot v1.0](docs/hardware/STANDARD_ROBOT_V1.md)** - Official hardware spec (~$80)
- **[Arena Setup Guide](docs/hardware/ARENA_SETUP_GUIDE.md)** - Build 5m × 5m real arena
- **[Challenge Courses](docs/CHALLENGE_COURSES.md)** - 10 standard challenges

## Getting Help

### Documentation for Makers
- **[Getting Started Guide](docs/architecture/HELLO_WORLD_TUTORIAL.md)** - Your first robot
- **[ESP32 Setup](docs/hardware/ESP32_GUIDE.md)** - Connect your hardware
- **[Robot Programming](docs/architecture/ROBOT4_GUIDE.md)** - Make your robot do cool stuff

### Need Help?
- **GitHub Issues**: https://github.com/EvolvingAgentsLabs/llmos/issues
- **Discussions**: https://github.com/EvolvingAgentsLabs/llmos/discussions

## How to Get Your Own ESP32

Don't have an ESP32 yet? Here's what to look for:

**Recommended Board**: ESP32-S3 DevKit
- **Where**: Amazon, eBay, AliExpress, local electronics store
- **Price**: $8-$15
- **What to search**: "ESP32-S3 development board"

**What Else You Might Want**:
- Breadboard and jumper wires ($5)
- LED lights ($2)
- Motors and motor driver ($10)
- Distance sensors ($5)

**Total starter kit**: About $30-$40

## The Simple Version

```
1. Install LLMos on your computer
2. Say what you want your robot to do
3. Watch it work in simulation
4. Upload to your ESP32 (if you have one)
5. Watch your robot come to life!
```

## Why Makers Love LLMos

- **No coding required** (but you can code if you want)
- **Test without hardware** (virtual robots are free!)
- **Learn by doing** (see how robots work)
- **Share your creations** (help other makers)
- **Keep improving** (robots get smarter over time)

## Tips for Success

1. **Start Small**: Begin with simple projects like blinking LEDs
2. **Test in Simulation**: Make sure it works virtually first
3. **Ask Questions**: LLMos can explain what the code does
4. **Experiment**: Try changing things and see what happens
5. **Share**: Show other makers what you built!

## What's Inside

### For Virtual Robots
Test your ideas in simulation - no hardware needed:
- Create robots in different environments
- Test obstacle avoidance
- Try line following
- Build maze solvers

### For Real Robots
Connect to ESP32 hardware:
- Control motors
- Read sensors
- Flash LEDs
- Make sounds
- Take pictures (with camera module)
- **One-click flashing** directly from the desktop app

## Next Steps

1. **Install LLMos** (see Quick Start above)
2. **Try a Virtual Robot** (no hardware needed!)
3. **Read the Getting Started Guide** (link above)
4. **Order an ESP32** (if you want real hardware)
5. **Build Your First Robot** (follow the tutorials)

## Questions?

**Q: Do I need to know how to code?**
A: Nope! Just describe what you want.

**Q: Do I need to buy anything?**
A: Not to start! Try virtual robots first. ESP32 boards are cheap if you want hardware later.

**Q: What if something doesn't work?**
A: Ask LLMos to fix it! Or check our GitHub issues for help.

**Q: Can I build my own robot design?**
A: Yes! LLMos works with any ESP32-based robot.

**Q: Is this for kids?**
A: Great for anyone interested in robotics - kids, students, hobbyists, makers!

## 🚀 Project Roadmap

Want to see where LLMos is heading? Check out our **[ROADMAP.md](ROADMAP.md)** for:
- Development phases and milestones
- Feature timeline
- How to contribute
- Community goals

**Current Phase**: Foundation (Desktop + ESP32)
**Next Up**: Plugin architecture for community extensions

## 🤝 Contributing

We're building this in the open! Whether you're a developer, maker, or just enthusiastic about robots, you can help:

- **Build plugins** for new hardware
- **Report bugs** and suggest features
- **Share projects** you've built
- **Help others** in Discussions
- **Improve docs** and tutorials

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines.

## License

Free to use and modify (Apache 2.0 License).

## Ready to Build?

```bash
npm install
npm run electron:dev
```

Then type: **"Create a robot that avoids walls"**

Watch the magic happen in your desktop app!

---

**Build something amazing. Share it with the world.**

Made with love by makers, for makers.
