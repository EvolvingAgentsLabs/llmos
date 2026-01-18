# 5m x 5m Arena Setup Guide

**Build a real-world testing arena that matches the simulation**

---

## Overview

This guide shows you how to create a physical 5m x 5m arena that exactly matches the virtual simulation environment. This allows you to:
- Test robots in simulation first
- Deploy same code to real hardware
- Compare sim vs real performance
- Run standardized challenges

**Time Required**: 30-60 minutes
**Cost**: $10-30 (tape, markers, cardboard)
**Space Needed**: 5m x 5m flat floor (garage, gym, classroom)

---

## Materials Needed

### Essential
- [ ] **Measuring tape** (at least 5m long)
- [ ] **White tape** (2-3 rolls, 25mm wide) - for boundaries
- [ ] **Black tape** (1-2 rolls, 25mm wide) - for line tracks
- [ ] **Marker or chalk** - for center point
- [ ] **Pencil and notepad** - for measurements

**Cost**: ~$10-15

### Optional
- [ ] **Colored tape** (red, blue) - for axes
- [ ] **Grid markers** - for coordinate grid
- [ ] **Cardboard boxes** - for obstacles (various sizes)
- [ ] **Rope/string** - for perfect straight lines
- [ ] **Level** - to check floor flatness

**Cost**: ~$5-15 additional

---

## Step-by-Step Setup

### Step 1: Choose Location

**Requirements**:
- Flat, level floor (concrete, vinyl, or smooth tile preferred)
- At least 5.5m x 5.5m clear space (extra 0.5m margin)
- Good lighting (for line sensors)
- No obstructions overhead
- Dry surface (not wet or dusty)

**Good locations**:
- Garage (clear cars first)
- Gym or multipurpose room
- Warehouse space
- Large classroom
- Basement (if flat and dry)

**Avoid**:
- Carpet (absorbs ultrasonic signals, wheels slip)
- Uneven surfaces (concrete with cracks OK, but level)
- Areas with lots of foot traffic
- Very dusty or dirty floors

---

### Step 2: Mark the Center Point

The arena coordinate system uses (0, 0) at the center.

```
    5m x 5m Arena

       ┌─────────────┐
       │             │
       │             │
       │      ●      │  ← Center (0,0)
       │   (0,0)     │
       │             │
       └─────────────┘

    Mark center first, then measure outward
```

**How to find center**:

1. **Measure your space**
   - Find a clear 5m x 5m area
   - Mark rough corners with tape

2. **Find center using diagonals**
   ```
   A ───────────── B
   │ \           / │
   │   \       /   │
   │     \   /     │
   │       X       │  ← X = Center
   │     /   \     │
   │   /       \   │
   │ /           \ │
   D ───────────── C

   Measure diagonals AC and BD
   They cross at center point X
   ```

3. **Mark center point**
   - Use marker or chalk
   - Draw small circle (10cm diameter)
   - Write "(0,0)" next to it
   - This is your robot's starting position

---

### Step 3: Mark Coordinate Axes

Create X and Y axes to define the coordinate system.

```
         Y axis (North)
              ↑
              │
              │
   ───────────┼───────────  X axis (East)
              │
              │
            (0,0)
```

**X Axis (East-West)**:
1. From center (0,0), measure 2.5m to the RIGHT
   - Mark with tape
   - Label "+2.5m" or "East"

2. From center (0,0), measure 2.5m to the LEFT
   - Mark with tape
   - Label "-2.5m" or "West"

3. Connect with **red tape** (or white if you don't have colored)
   - Lay tape from West (-2.5, 0) to East (+2.5, 0)
   - Goes through center point
   - Total length: 5 meters

**Y Axis (North-South)**:
1. From center (0,0), measure 2.5m FORWARD (away from you)
   - Mark with tape
   - Label "+2.5m" or "North"

2. From center (0,0), measure 2.5m BACKWARD (toward you)
   - Mark with tape
   - Label "-2.5m" or "South"

3. Connect with **blue tape** (or white)
   - Lay tape from South (0, -2.5) to North (0, +2.5)
   - Goes through center point
   - Perpendicular to X axis

**Check**: Axes should form a perfect cross (+) at center.

---

### Step 4: Mark Boundaries (Walls)

The arena has 4 walls forming a 5m x 5m square.

```
    (-2.5, +2.5)          (+2.5, +2.5)
         ┌─────────────────────┐
         │                     │
         │                     │
         │        (0,0)        │
         │                     │
         │                     │
         └─────────────────────┘
    (-2.5, -2.5)          (+2.5, -2.5)
```

**Mark corners**:
1. **Bottom-left**: (-2.5, -2.5)
   - From center: 2.5m left, 2.5m down
   - Mark with tape or chalk

2. **Bottom-right**: (+2.5, -2.5)
   - From center: 2.5m right, 2.5m down
   - Mark with tape or chalk

3. **Top-right**: (+2.5, +2.5)
   - From center: 2.5m right, 2.5m up
   - Mark with tape or chalk

4. **Top-left**: (-2.5, +2.5)
   - From center: 2.5m left, 2.5m up
   - Mark with tape or chalk

**Connect corners with white tape**:
- Bottom edge: (-2.5, -2.5) to (+2.5, -2.5)
- Right edge: (+2.5, -2.5) to (+2.5, +2.5)
- Top edge: (+2.5, +2.5) to (-2.5, +2.5)
- Left edge: (-2.5, +2.5) to (-2.5, -2.5)

**Pro tip**: Use string to ensure straight lines:
1. Tie string between two corners
2. Lay tape along string
3. Remove string

---

### Step 5: Add Coordinate Grid (Optional)

For more precise positioning, add a grid with 0.5m spacing.

```
    11 x 11 grid (0.5m spacing)

     ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─●┼─┼─┼─┼─┼─┤  ← Center
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     ├─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┤
     └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘

    Every 0.5m in both directions
```

**Grid lines**:
- X direction: Every 0.5m from -2.5 to +2.5 (11 lines)
- Y direction: Every 0.5m from -2.5 to +2.5 (11 lines)
- Use thin white tape or chalk
- Label key intersections with coordinates

**Example labels**:
- (0, 0) - Center
- (1.0, 0) - Right of center
- (0, 1.0) - Above center
- (2.0, 2.0) - Near top-right corner

---

### Step 6: Verify Measurements

**Check list**:
- [ ] Center point is clearly marked
- [ ] All 4 corners are exactly 2.5m from center
- [ ] Opposite sides are parallel
- [ ] All sides are exactly 5m long
- [ ] Diagonals are equal (~7.07m, or 5 × √2)
- [ ] Floor is relatively flat
- [ ] Tape is secure and won't peel up

**Measuring diagonal**:
```
From (-2.5, -2.5) to (+2.5, +2.5):
Distance = √[(5)² + (5)²] = √50 ≈ 7.07m

If your diagonal is ≠ 7.07m, check your measurements!
```

---

## Adding Challenge Elements

Now that you have a basic arena, add elements for specific challenges.

### 1. Empty Arena (Default)

Already complete! Your arena is ready for basic navigation testing.

**Use for**:
- Motor control testing
- Straight-line driving
- Turning accuracy
- Speed tests

---

### 2. Obstacle Course

Add circular obstacles using cardboard boxes or cylinders.

**Materials**:
- Cardboard boxes (various sizes)
- Cans, buckets, or cones
- Tape to secure

**Placement** (matches `standard5x5Obstacles` map):
```
Obstacle positions (x, y, radius in cm):

(-1.5, -1.5, 25cm)   (-1.5, +1.5, 20cm)
       🔴                    🔴

(-1.8, 0, 18cm)          🔴 (0, +1.8, 18cm)
     🔴

         (0, 0, 30cm)
              🔴🔴

(+1.8, 0, 18cm)          🔴 (0, -1.8, 18cm)
     🔴

(+1.5, -1.5, 20cm)   (+1.5, +1.5, 25cm)
       🔴                    🔴
```

**How to create obstacles**:
1. Measure and mark positions on floor
2. Cut cardboard to make cylinders (or use cans/buckets)
3. Secure with tape
4. Verify robot's distance sensor can detect them

**Goal**: Navigate from (-2.0, -2.0) to (+2.0, +2.0) without hitting obstacles

---

### 3. Line Following Track

Use black tape to create a line for the robot to follow.

**Materials**:
- Black electrical tape (or duct tape), 25-30mm wide
- Ruler or straight edge

**Oval Track** (matches `standard5x5LineTrack` map):
```
         ╔═══════════╗
         ║           ║
         ║           ║
    ═════╝           ╚═════

    3.6m wide × 2.4m tall oval
```

**How to make it**:
1. Mark oval path on floor (use string as guide)
2. Lay black tape following the path
3. Make smooth curves (no sharp angles)
4. Ensure tape is 3cm wide and flat
5. No gaps or overlaps

**Oval measurements**:
- Semi-major axis (X): 1.8m
- Semi-minor axis (Y): 1.2m
- Use parametric equation or template

**Pro tip**: Print oval template, scale it up, use as guide.

---

### 4. Maze Challenge

Create maze using cardboard walls.

**Materials**:
- Cardboard sheets (60cm × 40cm panels work well)
- Tape or stands to hold walls upright
- Weights to keep walls stable

**Maze Layout** (matches `standard5x5Maze` map):
```
┌─────────────────────┐
│  │     │        🏁  │
│  │     │            │
│  │  │  │  │         │
│     │     │      │  │
│  ───   ──────    │  │
│                  │  │
│ 🤖               │  │
└─────────────────────┘

Start: (-2.0, -2.0)
Goal:  (+2.0, +2.0)
```

**Wall positions** (from simulator code):
- Vertical walls at X = -1.5, -0.5, +0.5, +1.5
- Horizontal walls at Y = -1.5, -0.5, +0.5, +1.5
- Gaps for passages

**Assembly**:
1. Cut cardboard to match wall lengths
2. Secure to floor with tape
3. Add weights if needed
4. Verify robot can detect walls with sensors

---

### 5. Figure-8 Track

Advanced line following challenge.

**Black tape in figure-8 pattern**:
```
    ╔═╗
    ║ ║
    ╚═╬═╗
      │ ║
    ╔═╬═╝
    ║ ║
    ╚═╝
```

**Measurements** (matches `standard5x5Figure8` map):
- Uses parametric equations for smooth curves
- Width: 3m (±1.5m from center)
- Height: 2m (±1.0m from center)

**How to create**:
1. Plot points on floor using coordinates from simulator
2. Connect points with smooth curves
3. Lay black tape following the curve
4. Ensure crossing point is clear

---

## Calibration and Testing

### Robot Placement

**Starting position for most challenges**:
- Coordinates: (0, 0)
- Facing: 0 degrees (East, toward +X axis)
- Orientation: Front of robot faces right on your grid

**How to align robot**:
1. Place robot center at (0,0) marker
2. Align robot parallel to X axis
3. Front facing toward (+X) direction
4. Use ruler to verify alignment

---

### Coordinate Verification

**Test accuracy** with manual measurements:

1. **Place robot at known position**
   - Example: (1.0, 1.0)

2. **Run simple navigation code**
   ```c
   // Drive to (2.0, 0)
   // Measure final position
   ```

3. **Compare expected vs actual**
   - Expected: (2.0, 0)
   - Actual: (measure with tape)
   - Calculate error

**Acceptable error**: ±10cm for 5m arena

---

### Surface Calibration

Different floor types affect robot behavior:

| Surface | Wheel Traction | Ultrasonic | Line Sensors |
|---------|----------------|------------|--------------|
| Smooth concrete | Excellent | Excellent | Excellent |
| Vinyl/linoleum | Good | Good | Good |
| Tile | Good | Good | May reflect |
| Carpet (low) | Poor | Poor | Won't work |
| Wood (smooth) | Good | Good | Good |

**Adjustments**:
- Slippery surface → Lower speed, gradual turns
- Soft surface → Increase motor power
- Dark floor → Adjust line sensor calibration

---

## Maintenance

### Daily (Before Each Use)
- [ ] Check tape is secure (re-stick if peeling)
- [ ] Clean floor (remove dust, debris)
- [ ] Verify obstacles haven't moved
- [ ] Check measurements if arena was disturbed

### Weekly
- [ ] Re-measure key points
- [ ] Replace worn tape
- [ ] Clean line tracks
- [ ] Document any changes

### Monthly
- [ ] Full measurement verification
- [ ] Replace all tape if needed
- [ ] Level check (floor may settle)

---

## Advanced Features

### AprilTags for Localization

Add AprilTags at known positions for camera-based localization.

**Positions**:
- Four corners: (-2, -2), (+2, -2), (+2, +2), (-2, +2)
- Center: (0, 0)
- Along walls every 1m

**Benefits**:
- Robot can self-localize using camera
- More accurate position tracking
- Verify odometry accuracy

### Overhead Camera

Mount camera above arena to record robot paths.

**Setup**:
- Camera height: 3-4m above arena
- Field of view: Entire 5m × 5m area
- Use for: Path visualization, performance analysis

---

## Challenge Courses

See [CHALLENGE_COURSES.md](CHALLENGE_COURSES.md) for detailed setup instructions for:
1. Empty Navigation
2. Obstacle Avoidance
3. Line Following
4. Maze Solving
5. Figure-8 Track
6. Delivery Challenge
7-10. Additional challenges

---

## Troubleshooting

### Tape Won't Stick
- **Clean floor** with damp cloth, let dry
- **Use better tape** (masking tape or gaffer tape)
- **Warm tape** slightly before application

### Uneven Floor
- **Shim low spots** with thin cardboard
- **Accept variance** ±5mm is usually OK
- **Choose different location** if too uneven

### Robot Can't Detect Tape
- **Line too thin**: Use wider tape (30-50mm)
- **Poor contrast**: Ensure black on white/light surface
- **Sensor height**: Adjust line sensors 4-8mm above floor
- **Calibrate sensors**: Re-run calibration routine

### Robot Drifts Off Course
- **Floor slope**: Use level to check, relocate if needed
- **Motor imbalance**: Calibrate motor speeds
- **Wheel slip**: Check traction, clean wheels
- **Sensor error**: Verify sensor accuracy

---

## Cost Summary

**Minimum Setup** (basic arena only):
- White tape (2 rolls): $6
- Black tape (1 roll): $3
- Measuring tape: $5
- Marker: $1
- **Total**: ~$15

**Full Setup** (with challenges):
- White tape (3 rolls): $9
- Black tape (2 rolls): $6
- Colored tape (2 rolls): $6
- Cardboard boxes (10): Free (or $5)
- Measuring tape: $5
- Markers/chalk: $3
- **Total**: ~$30

---

## Next Steps

1. ✅ Build your 5m × 5m arena
2. ✅ Calibrate and test with robot
3. ✅ Try challenges (start with empty arena)
4. Share your setup! Post photos to GitHub Discussions
5. Measure sim-to-real accuracy and report results

---

**Ready to test your robot? Let's build!**
