# Getting Started with LLMos

**Your first robot in 10 minutes!**

This guide will help you create your first AI-powered robot. No hardware needed to start!

## What You'll Do

1. Install LLMos
2. Create a virtual robot
3. Make it move and avoid walls
4. Celebrate!

## Before You Start

You'll need:
- A computer (Mac, Windows, or Linux)
- Internet connection
- 15 minutes of time

That's it! No robot parts required.

## Step 1: Install LLMos (5 minutes)

Open your terminal (Command Prompt on Windows) and type:

```bash
# Download LLMos
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos

# Install it (this takes a few minutes)
npm install

# Start LLMos
npm run dev
```

You should see something like:
```
Ready! Open http://localhost:3000
```

## Step 2: Open LLMos

1. Open your web browser
2. Go to: http://localhost:3000
3. You should see a chat interface

## Step 3: Create Your First Robot

In the chat, type:

```
Create a virtual robot that avoids walls
```

Press Enter and watch the magic! LLMos will:
- Create a virtual robot in a 3D world
- Write the code to make it avoid obstacles
- Show you the robot moving around

## What Just Happened?

LLMos did several things:
1. Created a "virtual ESP32" (a simulated robot)
2. Wrote a program in C language
3. Started the robot in a virtual arena
4. Made it smart enough to avoid walls!

## Step 4: Talk to Your Robot

Try these commands:

### Make it move
```
Drive the robot forward at speed 150
```

### Turn left
```
Spin the robot left
```

### Change the LED color
```
Set the robot LED to blue
```

### Check its location
```
Where is my robot?
```

## Step 5: Try Different Environments

Change the world your robot lives in:

```
Set the floor map to maze
```

Now your robot is in a maze! Watch how it navigates.

Other maps to try:
- `ovalTrack` - A racing track with a black line
- `obstacleArena` - A room full of obstacles
- `figure8` - A figure-8 shaped track

## Step 6: Load Pre-Made Games

LLMos comes with ready-to-go robot programs:

### Line Follower
```
Load the line follower game on my robot
```
Your robot will now follow the black line on the track!

### Maze Solver
```
Set the floor map to maze
Load the maze runner game
```
Watch your robot find its way out!

## Understanding the Code

Want to see what the robot is actually doing? Ask:

```
Show me the code for the wall avoider
```

You'll see something like:
```c
void update() {
    int front = distance(0);  // How far to the wall ahead?

    if (front < 60) {
        // Too close! Turn left
        drive(-80, 80);
    } else {
        // Path clear, go forward
        drive(120, 120);
    }
}
```

Don't worry if you don't understand it all yet. The important part:
- `distance(0)` checks how far ahead the wall is
- If close, the robot turns
- If far, the robot goes forward

## Next Steps

### Experiment!
Try asking LLMos:
- "Make the robot go faster"
- "Change the LED to purple when turning"
- "Make the robot beep when it sees a wall"

### Learn More
- **[ESP32 Guide](../hardware/ESP32_GUIDE.md)** - Connect real hardware
- **[Robot Programming](ROBOT4_GUIDE.md)** - Understand how robots think

### Build Something Cool
Ideas for your next project:
- A robot that draws patterns
- A robot that finds objects
- A robot race against the clock

## Troubleshooting

### LLMos Won't Start
**Problem**: Error when running `npm run dev`
**Fix**: Make sure you have Node.js installed. Download from nodejs.org

### Can't See the Robot
**Problem**: Robot created but not visible
**Fix**: Refresh the browser page and try again

### Robot Doesn't Move
**Problem**: Commands sent but robot stays still
**Fix**: Make sure you started the robot with "start the robot device"

### Something Else Wrong?
Ask on our [GitHub Discussions](https://github.com/EvolvingAgentsLabs/llmos/discussions) - we're here to help!

## What You Learned

In just 10 minutes, you:
- ✅ Installed LLMos
- ✅ Created a virtual robot
- ✅ Made it avoid walls
- ✅ Tried different environments
- ✅ Loaded pre-made games

## Ready for Real Hardware?

Want to build an actual robot you can hold? Check out the [ESP32 Guide](../hardware/ESP32_GUIDE.md).

For about $30, you can build a real robot that:
- Drives around your room
- Avoids furniture
- Follows lines on the floor
- Responds to commands

## Tips for Success

1. **Start simple** - Master one thing before adding complexity
2. **Ask questions** - LLMos can explain anything
3. **Experiment** - Try changing things and see what happens
4. **Share** - Show others what you built!

## The Magic of LLMos

The cool part? You didn't write any code. You just described what you wanted, and LLMos made it happen.

That's the power of AI-assisted robotics!

---

**Ready to build more? Try the ESP32 hardware guide next!**

[➡️ ESP32 Hardware Guide](../hardware/ESP32_GUIDE.md)
