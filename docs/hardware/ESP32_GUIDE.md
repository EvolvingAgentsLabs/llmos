# Building Real Robots with ESP32

**Turn your virtual robots into real ones!**

This guide shows you how to connect an ESP32 board and build actual robots that move in the real world.

## What's an ESP32?

An ESP32 is a tiny computer (about the size of your thumb) that can:
- Control motors
- Read sensors
- Connect to WiFi
- Flash LEDs
- Make sounds

Best part? They cost about $10!

## What You'll Build

By the end of this guide, you'll have a robot that:
- Drives around on wheels
- Avoids obstacles
- Follows lines on the floor
- Responds to your commands

## Shopping List

### Must Have
- **ESP32-S3 board** ($10-15) - The brain of your robot
- **USB cable** ($3) - To connect to your computer
- **Breadboard** ($3) - To connect components without soldering

**Total**: About $20 to get started

### For a Moving Robot
- **2x DC motors with wheels** ($10) - To make it move
- **Motor driver board** ($5) - To control the motors
- **Battery pack** ($8) - Power on the go
- **Jumper wires** ($5) - To connect everything

**Total robot**: About $45-50

### For Sensors (Optional)
- **Ultrasonic sensor** ($3) - Measure distance to objects
- **Line sensor** ($5) - Follow black lines
- **LEDs** ($2) - Add lights!

## Where to Buy

**Online**:
- Amazon - Fast shipping
- eBay - Good prices
- AliExpress - Cheapest (slow shipping)

**Local**:
- Electronics stores
- Maker spaces
- University electronics labs

**Search for**: "ESP32-S3 development kit"

## Quick Test (No Robot Needed!)

Let's make sure your ESP32 works:

### Step 1: Connect ESP32

1. Plug ESP32 into your computer with USB cable
2. Open LLMos Desktop (run `npm run electron:dev` if not already open)
3. In the chat, type:
```
Connect to my ESP32 device
```

The app will show a list of available serial ports. Pick the one that says "CP2102" or "CH340" or "USB Serial".

### Step 2: Test It

Try blinking the built-in LED:

```
Turn on the LED on pin 2
```

Did the LED light up? Success! Your ESP32 is working.

## Building Your First Robot

### What You're Building

A simple 2-wheeled robot that can:
- Drive forward and backward
- Turn left and right
- Detect obstacles
- Respond to commands

### The Parts

```
Battery --> Motor Driver --> Left Motor
                          +-> Right Motor
                          +-> ESP32 --> Sensors
                                    +-> LEDs
```

### Basic Wiring

**Motors** (for movement):
```
ESP32 Pin 16 -> Motor Driver IN1 (Left Motor)
ESP32 Pin 17 -> Motor Driver IN2 (Left Motor)
ESP32 Pin 18 -> Motor Driver IN3 (Right Motor)
ESP32 Pin 19 -> Motor Driver IN4 (Right Motor)
```

**Sensor** (to detect walls):
```
ESP32 Pin 4 -> Sensor TRIG
ESP32 Pin 5 -> Sensor ECHO
```

**LED** (for status):
```
ESP32 Pin 2 -> LED -> Resistor -> Ground
```

**Power**:
```
Battery + -> Motor Driver VCC
Battery - -> Motor Driver GND and ESP32 GND
```

### Step-by-Step Assembly

1. **Mount the motors** on your robot chassis
2. **Connect motor driver** to motors
3. **Wire ESP32 to motor driver** (use the pin numbers above)
4. **Add the sensor** pointing forward
5. **Connect battery**
6. **Test each part** as you go!

## How the ESP32 Connects to the LLMos HAL

The ESP32 is not just a standalone microcontroller -- it is one end of the LLMos Hardware Abstraction Layer (HAL). The HAL physical adapter (`lib/hal/physical-adapter.ts`) creates a bridge between the LLMos NavigationLoop and the real ESP32 hardware.

### Connection protocol

The physical adapter connects to the ESP32 via **serial (USB at 115200 baud)** or **WiFi (WebSocket)**. Communication uses newline-delimited JSON messages:

**Command (LLMos to ESP32)**:
```json
{
  "type": "command",
  "command": "drive",
  "params": { "left": 100, "right": 100, "duration_ms": 500 },
  "timestamp": 1708100000000
}
```

**Response (ESP32 to LLMos)**:
```json
{
  "success": true,
  "data": { "position": { "x": 0.5, "y": 0.3, "z": 0 } },
  "timestamp": 1708100000000
}
```

The timestamp in the response matches the command's timestamp so the adapter can correlate requests with responses.

### HAL interface subsystems

The HAL exposes five subsystems to the NavigationLoop, all of which the ESP32 firmware must implement:

**Locomotion** -- motor control commands:
- `drive(left, right, durationMs)` -- differential drive with wheel power -255 to 255
- `moveTo(x, y, z, speed)` -- move to absolute position
- `rotate(direction, degrees)` -- rotate in place
- `moveForward(distanceCm)` -- move forward by distance
- `moveBackward(distanceCm)` -- move backward by distance
- `stop()` -- stop all motors immediately
- `get_pose` -- return current position, rotation, and velocity

**Vision** -- camera and sensor data:
- `capture_camera` -- capture a JPEG frame (sent to Qwen3-VL-8B via OpenRouter for processing)
- `read_distance` -- return front, left, right distance sensor values
- `read_line` -- return line sensor array values
- `read_imu` -- return accelerometer, gyroscope, and heading data

**Communication** -- output:
- `speak(text, urgency)` -- play audio message
- `set_led(r, g, b, pattern)` -- control RGB LED (solid, blink, pulse)
- `play_sound(soundId)` -- play a sound effect

**Safety** -- emergency controls:
- `emergency_stop(reason)` -- immediately halt all motion
- `reset_emergency` -- clear emergency stop state

### The full pipeline

When the NavigationLoop runs on a physical robot, the data flows like this:

```
NavigationLoop
  -> NavigationHALBridge
    -> PhysicalHAL (lib/hal/physical-adapter.ts)
      -> PhysicalConnection (serial or WiFi)
        -> ESP32 firmware (JSON commands)
          -> Motors, sensors, LEDs
```

Sensor data flows back up the same chain. Camera frames captured by the ESP32 are sent through the HAL vision interface to the VisionWorldModelBridge, which forwards them to Qwen3-VL-8B (via OpenRouter) for scene understanding. The LLM's response updates the 50x50 occupancy grid world model.

### Setting up the connection

To create a physical HAL connection from TypeScript:

```typescript
import { createPhysicalHAL } from '@/lib/hal';

const hal = createPhysicalHAL({
  deviceId: 'my-esp32-robot',
  connectionType: 'serial',  // or 'wifi'
  baudRate: 115200,
  // host: '192.168.1.100',  // for WiFi mode
});

await hal.initialize();  // opens serial port via Web Serial API
```

The Web Serial API prompts the user to select a serial port in the browser. For WiFi mode, provide the ESP32's IP address.

---

## Programming Your Robot

### Method 1: Let LLMos Do It

Just say what you want:

```
Make my robot drive forward and avoid walls
```

LLMos will:
- Write the code
- Test it in simulation
- Upload it to your ESP32
- Your robot starts moving!

### Method 2: Simple Commands

Control your robot directly:

**Drive forward**:
```
Drive the robot forward at speed 150
```

**Turn left**:
```
Spin the robot left
```

**Check sensors**:
```
What do the robot sensors see?
```

**Stop**:
```
Stop the robot
```

## Testing Your Robot

### Safety First!
- Test on the floor, not a table (robots can drive off!)
- Start with slow speeds
- Have an "off" switch ready
- Keep clear of the wheels

### Your First Drive

1. Place robot on the floor
2. Make sure nothing is in the way
3. In LLMos, type:
```
Drive forward slowly
```

4. Watch it go!
5. To stop:
```
Stop the robot
```

### Making It Smarter

**Avoid obstacles**:
```
Make the robot turn away from walls
```

**Follow a line**:
Put black tape on the floor in a path, then:
```
Make the robot follow the black line
```

## Cool Things to Try

### Beginner
- **LED patterns**: Make lights blink in different colors
- **Remote control**: Control robot from your phone
- **Sound effects**: Add beeps when turning

### Intermediate
- **Wall follower**: Robot stays close to walls
- **Maze solver**: Navigate through obstacles
- **Line follower**: Race on a track

### Advanced
- **LLM-driven navigation**: Run the full NavigationLoop with Qwen3-VL-8B vision
- **Swarm behavior**: Multiple robots with fleet coordination and shared world model merging
- **Autonomous exploration**: Let the NavigationLoop explore and map unknown environments

## Troubleshooting

### ESP32 Not Connecting

**Problem**: Computer doesn't see the ESP32

**Fixes**:
- Try a different USB cable (must be a data cable, not just power)
- Install drivers from: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
- Try a different USB port
- Press the "Boot" button on ESP32 when connecting

### Robot Won't Move

**Problem**: Motors don't spin

**Check**:
- Is battery charged?
- Are wires connected firmly?
- Is motor driver getting power?
- Try typing: "Check robot motor status"

### Robot Goes Crazy

**Problem**: Drives in wrong direction or won't stop

**Fixes**:
- Stop it: Type "emergency stop the robot"
- Check motor wires (might be reversed)
- Lower the speed: "Set robot speed to 50"
- Reset: "Reset the robot"

### Sensor Not Working

**Problem**: Robot doesn't detect obstacles

**Check**:
- Sensor wires connected?
- Sensor pointing forward?
- Type: "Read distance sensor"
- If shows "255" constantly, sensor might be disconnected

## Understanding the Code

When you say "make a wall-avoiding robot", LLMos creates code like:

```c
void update() {
    // Read the distance sensor
    int distance = checkSensor();

    // If something is close (less than 30cm)
    if (distance < 30) {
        // Turn left to avoid it
        turnLeft();
        setLED(red);  // Red light when turning
    } else {
        // Path is clear, go straight
        goForward();
        setLED(green);  // Green light when safe
    }
}
```

You can ask LLMos to:
- "Explain this code to me"
- "Make it turn right instead"
- "Make it go faster"
- "Add a beep sound"

## Tips for Success

1. **Test parts separately** - Make sure LED works before adding motors
2. **Start slow** - Use low speeds until you're confident
3. **Secure wires** - Loose connections cause random behavior
4. **Charge batteries** - Low battery = weird behavior
5. **Ask for help** - The maker community is friendly!

## Next Steps

### Build More Complex Robots

**Robotic Arm**:
- Add servo motors
- Pick up small objects
- Stack blocks

**Smart Plant Waterer**:
- Moisture sensor
- Water pump
- Auto-watering schedule

**Security Robot**:
- Camera module
- Motion detection
- Send alerts

### Learn More

- **[Robot Programming Guide](../architecture/ROBOT4_GUIDE.md)** - Deep dive into robot code and how Robot4 connects to the NavigationLoop
- **[Standard Robot v1](STANDARD_ROBOT_V1.md)** - Official hardware specification with HAL integration
- **[Arena Setup Guide](ARENA_SETUP_GUIDE.md)** - Build a physical 5m x 5m arena matching the simulation

## Common Projects

### Line-Following Race Car

**What you need**:
- Robot with line sensor
- Black tape for track

**How**:
1. Make a track with black tape on light floor
2. Say: "Make my robot follow the black line"
3. Test and adjust speed
4. Race against friends!

### Obstacle Course Navigator

**What you need**:
- Robot with distance sensor
- Boxes and obstacles

**How**:
1. Set up obstacle course
2. Say: "Navigate through the obstacles"
3. Watch robot find its way
4. Make course harder!

### Drawing Robot

**What you need**:
- Robot
- Marker attached to bottom

**How**:
1. Attach marker to robot
2. Say: "Draw a square"
3. Robot draws!
4. Try circles, stars, your name

## Getting Help

**Something not working?**
- Check our [GitHub Issues](https://github.com/EvolvingAgentsLabs/llmos/issues)
- Ask on [Discussions](https://github.com/EvolvingAgentsLabs/llmos/discussions)
- Share photos of your setup - easier to help!

**Want to share your robot?**
- Post videos on GitHub Discussions
- Help other makers
- Inspire the community!

## Safety Notes

- **Batteries**: Don't overcharge, don't short circuit
- **Motors**: Can pinch fingers - be careful!
- **Testing**: Start on the floor, not on tables
- **Wiring**: Double-check before powering on

## You Did It!

You now know how to:
- Buy and connect an ESP32
- Wire up motors and sensors
- Connect to LLMos via the HAL physical adapter
- Program a real robot
- Make it do cool things

## What's Next?

Build something amazing and share it with the world!

**Ideas**:
- Modified design that's better than the basic one
- New sensor combinations
- Unique robot behaviors
- Helpful robots for real problems

---

**Now go build! The world needs more robot makers!**
