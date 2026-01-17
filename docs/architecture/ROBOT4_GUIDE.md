# Robot Programming Made Easy

**Make your robot smart!**

This guide teaches you how robots think and how to program them to do cool things.

## What is Robot4?

Robot4 is a simple way to program robots. Think of it like giving your robot a brain that runs 60 times per second.

Every 60th of a second, your robot:
1. **Looks** at its sensors (what's around me?)
2. **Thinks** with your program (what should I do?)
3. **Acts** by moving motors (let's do it!)

## The Two Functions You Need

Every robot program has just two functions:

### start()
Runs once when the robot turns on:
```c
void start() {
    // This runs ONE TIME when robot starts
    led(0, 255, 0);  // Turn LED green
}
```

### update()
Runs 60 times every second:
```c
void update() {
    // This runs 60 TIMES PER SECOND
    // This is where the robot makes decisions
}
```

That's it! Everything your robot does goes in these two functions.

## Making Things Move

### Drive Forward
```c
drive(120, 120);  // Both motors at speed 120
```

### Turn Left
```c
drive(-80, 80);  // Left motor backward, right forward
```

### Turn Right
```c
drive(80, -80);  // Right motor backward, left forward
```

### Go Backward
```c
drive(-120, -120);  // Both motors backward
```

### Stop
```c
stop();  // Stop all motors
```

**Speed**: Numbers from -255 (full reverse) to +255 (full forward)

## Reading Sensors

### Check Distance
```c
int front = distance(0);  // How far to the wall ahead?
```

Returns distance in centimeters (cm):
- `10` = 10cm away (very close!)
- `60` = 60cm away (comfortable distance)
- `255` = Nothing detected (clear path)

**Sensor positions**:
- `0` = Front
- `1` = Front-left
- `2` = Front-right
- `3` = Left side
- `4` = Right side

### Check Line Sensors
```c
int value = line(2);  // Check center line sensor
```

Returns 0-255:
- `0` = White (no line)
- `255` = Black (on the line)

**Sensor positions** (left to right):
- `0` = Far left
- `1` = Left
- `2` = Center
- `3` = Right
- `4` = Far right

## Controlling LEDs

### Set Any Color
```c
led(255, 0, 0);    // Red
led(0, 255, 0);    // Green
led(0, 0, 255);    // Blue
led(255, 255, 0);  // Yellow
led(255, 0, 255);  // Purple
```

### Turn Off
```c
led(0, 0, 0);  // LED off
```

## Example Programs

### Super Simple: Blink the LED

```c
void start() {
    // Runs once at startup
}

void update() {
    // Every second, toggle LED
    led(255, 0, 0);   // Red
    delay_ms(500);    // Wait half second
    led(0, 0, 0);     // Off
    delay_ms(500);    // Wait half second
}
```

### Beginner: Drive Until Wall

```c
void start() {
    led(0, 255, 0);  // Green = ready
}

void update() {
    int front = distance(0);  // Check front

    if (front < 30) {
        // Wall is close - STOP!
        stop();
        led(255, 0, 0);  // Red = stopped
    } else {
        // Path is clear - GO!
        drive(100, 100);
        led(0, 255, 0);  // Green = moving
    }
}
```

### Intermediate: Wall Avoider

```c
void start() {
    led(0, 255, 0);  // Start with green
}

void update() {
    int front = distance(0);

    if (front < 60) {
        // Wall ahead - which way is more open?
        int left = distance(3);
        int right = distance(4);

        if (left > right) {
            // More space on left - turn left
            drive(-100, 100);
            led(255, 255, 0);  // Yellow when turning
        } else {
            // More space on right - turn right
            drive(100, -100);
            led(0, 255, 255);  // Cyan when turning
        }
    } else {
        // Clear ahead - go forward
        drive(120, 120);
        led(0, 255, 0);  // Green when driving
    }
}
```

### Advanced: Line Follower

```c
void start() {
    led(0, 0, 255);  // Blue = line follower mode
}

void update() {
    // Read line sensors
    int leftSide = line(0) + line(1);
    int rightSide = line(3) + line(4);
    int center = line(2);

    // Calculate how far off-center we are
    int error = leftSide - rightSide;

    // Adjust motor speeds based on error
    int baseSpeed = 100;
    int correction = error / 4;  // Tune this number!

    if (center > 100 || leftSide > 100 || rightSide > 100) {
        // We see the line - follow it!
        drive(baseSpeed - correction, baseSpeed + correction);
        led(0, 255, 0);  // Green
    } else {
        // Lost the line - spin to find it
        drive(-50, 50);
        led(255, 0, 0);  // Red
    }
}
```

## Understanding "Thinking" in Robots

Robots make decisions using `if` statements:

```c
if (something_is_true) {
    // Do this
} else {
    // Do that instead
}
```

### Example: Traffic Light
```c
int front = distance(0);

if (front > 100) {
    led(0, 255, 0);   // Green = all clear
} else if (front > 50) {
    led(255, 255, 0); // Yellow = getting close
} else {
    led(255, 0, 0);   // Red = too close!
}
```

## Making Robots Smarter with States

Sometimes robots need to remember what they're doing:

```c
// Remember what the robot is doing
int state = 0;  // 0 = driving, 1 = turning

void update() {
    if (state == 0) {
        // Currently driving forward
        drive(120, 120);

        if (distance(0) < 40) {
            state = 1;  // Switch to turning
        }
    } else {
        // Currently turning
        drive(-100, 100);

        if (distance(0) > 80) {
            state = 0;  // Switch back to driving
        }
    }
}
```

## Debugging Your Robot

### Print Messages
```c
trace("Hello! Robot started!");
```

This shows up in LLMos so you can see what's happening.

### Check Values
```c
int d = distance(0);
trace("Distance is: ");
// See the distance value in LLMos
```

## Common Patterns

### Avoid Obstacles
```c
if (distance(0) < 30) {
    // Turn away!
    drive(-80, 80);
} else {
    // Go forward
    drive(120, 120);
}
```

### Follow a Wall
```c
int side = distance(3);  // Left wall

if (side < 20) {
    // Too close to wall - steer right
    drive(140, 100);
} else if (side > 40) {
    // Too far from wall - steer left
    drive(100, 140);
} else {
    // Perfect distance - go straight
    drive(120, 120);
}
```

### Stay in Bounds
```c
if (line(0) > 200 || line(4) > 200) {
    // Detected boundary line - back up!
    drive(-120, -120);
    delay_ms(500);
    drive(100, -100);  // Turn
}
```

## Let LLMos Help!

Don't want to write code? Just tell LLMos what you want:

```
"Make my robot drive forward and turn left when it sees a wall"
```

LLMos will write the code for you!

Then you can ask:
- "Explain how this code works"
- "Make it turn right instead"
- "Make it go faster"
- "Add a beep sound when turning"

## Testing Your Code

### In Simulation
Always test in a virtual robot first:
```
Create a virtual robot
Load my wall avoider code
Start the robot
```

Watch it run in the virtual world. If it works there, it'll work on real hardware!

### On Real Robot
When ready for the real thing:
```
Upload code to my ESP32
```

LLMos handles all the compilation and uploading!

## Tips for Writing Good Robot Code

1. **Start simple** - Get basic movement working first
2. **Add one feature at a time** - Don't try to do everything at once
3. **Test often** - Check each new feature before adding the next
4. **Use clear names** - `frontDistance` is better than `fd`
5. **Add comments** - Explain why you did something
6. **Use LEDs for feedback** - See what the robot is thinking!

## Common Mistakes

### Forgetting to Call Functions
```c
// WRONG - just sets a number, doesn't drive
int left = 120;

// RIGHT - actually tells motors to move
drive(120, 120);
```

### Using = Instead of ==
```c
// WRONG - sets value (assignment)
if (distance(0) = 30) { }

// RIGHT - checks value (comparison)
if (distance(0) == 30) { }
```

### Infinite Delays
```c
// WRONG - robot freezes!
delay_ms(99999);

// RIGHT - keep delays short
delay_ms(100);
```

## Next Steps

### Try These Challenges

**Beginner**:
- Make LED change color based on distance
- Drive in a square pattern
- Avoid a single obstacle

**Intermediate**:
- Follow a circular track
- Navigate a maze
- Detect and count objects

**Advanced**:
- Map a room
- Return to starting position
- Coordinate with another robot

### Learn More

Want to understand the details?
- Ask LLMos: "Explain how robot sensors work"
- Ask LLMos: "Show me PID control for line following"
- Ask LLMos: "How do I make my robot draw shapes?"

## You're a Robot Programmer!

You now know:
- ✅ The two main functions (start and update)
- ✅ How to read sensors
- ✅ How to control motors
- ✅ How to make decisions with `if`
- ✅ How to debug your code

## What's Next?

Build something amazing!

**Ideas**:
- Sumo robot that pushes opponents
- Delivery robot that carries objects
- Art robot that draws patterns
- Security robot that patrols

---

**Now go make your robot smart!**
