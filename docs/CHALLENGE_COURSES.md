# Standard Challenge Courses

**10 standardized robotics challenges for simulation and real-world testing**

All challenges work in both simulation and real 5m × 5m arenas.

---

## Challenge List

| # | Name | Difficulty | Map | Skills Tested |
|---|------|------------|-----|---------------|
| 1 | Basic Navigation | ⭐ Beginner | `standard5x5Empty` | Motor control, straight driving |
| 2 | Checkpoint Race | ⭐ Beginner | `standard5x5Empty` | Navigation, distance estimation |
| 3 | Obstacle Avoidance | ⭐⭐ Intermediate | `standard5x5Obstacles` | Distance sensors, path planning |
| 4 | Line Following (Oval) | ⭐⭐ Intermediate | `standard5x5LineTrack` | Line sensors, PID control |
| 5 | Maze Solver | ⭐⭐⭐ Advanced | `standard5x5Maze` | Wall following, mapping |
| 6 | Figure-8 Track | ⭐⭐⭐ Advanced | `standard5x5Figure8` | Precise line following |
| 7 | Delivery Mission | ⭐⭐⭐ Advanced | `standard5x5Delivery` | Sequential navigation |
| 8 | Speed Run | ⭐⭐ Intermediate | `standard5x5Empty` | Optimization, speed vs accuracy |
| 9 | Precision Parking | ⭐⭐ Intermediate | `standard5x5Empty` | Fine motor control |
| 10 | Obstacle Race | ⭐⭐⭐ Advanced | `standard5x5Obstacles` | Speed + avoidance |

---

## 1. Basic Navigation ⭐

**Goal**: Drive from center (0,0) to corner (2, 2) in a straight line.

**Map**: `standard5x5Empty`

**Success Criteria**:
- Reach goal within 20cm
- Complete in < 30 seconds
- No collisions with walls

**Scoring**:
- Time bonus: Faster = better
- Accuracy bonus: Closer to (2,2) = better

**Skills**: Basic motor control, odometry

---

## 2. Checkpoint Race ⭐

**Goal**: Visit all 4 checkpoints in sequence, return to center.

**Map**: `standard5x5Empty`

**Checkpoints** (in order):
1. (2.0, 0) - Right
2. (0, 2.0) - Top
3. (-2.0, 0) - Left
4. (0, -2.0) - Bottom
5. (0, 0) - Center (finish)

**Success Criteria**:
- Pass within 20cm of each checkpoint
- Complete all 5 points
- Finish in < 60 seconds

**Scoring**:
- Completion time
- Missed checkpoints: -10s penalty each

**Skills**: Navigation, path planning, odometry

---

## 3. Obstacle Avoidance ⭐⭐

**Goal**: Navigate from start (-2, -2) to goal (2, 2) without hitting obstacles.

**Map**: `standard5x5Obstacles`

**Obstacles**: 11 circular obstacles (see map)

**Success Criteria**:
- Reach goal within 30cm
- Zero collisions
- Complete in < 90 seconds

**Scoring**:
- Collision penalty: -20s each
- Distance from goal: Closer = better

**Skills**: Distance sensors, reactive control, obstacle avoidance

---

## 4. Line Following (Oval) ⭐⭐

**Goal**: Follow black line oval track, complete 3 laps.

**Map**: `standard5x5LineTrack`

**Track**: Smooth oval, 3.6m × 2.4m

**Success Criteria**:
- Complete 3 full laps
- Stay on line (< 5cm deviation)
- Finish in < 120 seconds

**Scoring**:
- Lap time (average)
- Line deviations: -2s penalty per deviation

**Skills**: Line sensors, PID control, smooth turning

---

## 5. Maze Solver ⭐⭐⭐

**Goal**: Find way from start to goal through maze.

**Map**: `standard5x5Maze`

**Start**: (-2, -2) bottom-left
**Goal**: (2, 2) top-right

**Success Criteria**:
- Reach goal within 30cm
- No wall collisions
- Complete in < 180 seconds (first attempt)

**Scoring**:
- First solve time
- Optimal path bonus: Shortest path = +30s bonus
- Memorization bonus: Faster second run = +20s

**Skills**: Wall following, mapping, pathfinding

---

## 6. Figure-8 Track ⭐⭐⭐

**Goal**: Follow figure-8 line track perfectly, 3 laps.

**Map**: `standard5x5Figure8`

**Track**: Figure-8 with crossing point at center

**Success Criteria**:
- Complete 3 laps through both loops
- Navigate crossing correctly
- Stay on line (< 5cm deviation)
- Complete in < 150 seconds

**Scoring**:
- Lap consistency (all 3 laps similar time)
- Line accuracy
- Crossing navigation

**Skills**: Advanced line following, state machine for crossing detection

---

## 7. Delivery Mission ⭐⭐⭐

**Goal**: Visit 4 corner "delivery points" in sequence, avoiding obstacles.

**Map**: `standard5x5Delivery`

**Delivery Points** (in order):
1. (2.0, -2.0) - Bottom-right
2. (2.0, 2.0) - Top-right
3. (-2.0, 2.0) - Top-left
4. (-2.0, -2.0) - Bottom-left

**Obstacles**: 5 obstacles (including large center obstacle)

**Success Criteria**:
- Visit all 4 points in order (within 30cm)
- No collisions
- Complete in < 120 seconds

**Scoring**:
- Total time
- Delivery accuracy
- Path efficiency

**Skills**: Sequential navigation, obstacle avoidance, path planning

---

## 8. Speed Run ⭐⭐

**Goal**: Complete checkpoint race as fast as possible.

**Map**: `standard5x5Empty`

**Same as Challenge #2**, but optimized for speed:
- No accuracy requirement (must pass within 50cm)
- Focus on maximum speed
- Aggressive turning allowed

**Success Criteria**:
- Complete all checkpoints
- Finish in < 30 seconds (vs 60s in Challenge #2)

**Scoring**:
- Time only (fastest wins)
- Collision with wall: DNF

**Skills**: Speed optimization, acceleration/deceleration, aggressive driving

---

## 9. Precision Parking ⭐⭐

**Goal**: Park robot at exact position with exact orientation.

**Map**: `standard5x5Empty`

**Parking Spot**:
- Position: (1.5, 1.5)
- Orientation: 45 degrees (northeast)
- Tolerance: ±5cm position, ±10° rotation

**Success Criteria**:
- Final position within ±5cm of (1.5, 1.5)
- Final rotation within ±10° of 45°
- Complete in < 45 seconds

**Scoring**:
- Position error (closer = better)
- Rotation error (closer = better)
- Time bonus

**Skills**: Fine motor control, precise odometry, rotation control

---

## 10. Obstacle Race ⭐⭐⭐

**Goal**: Same as Challenge #3, but optimized for speed.

**Map**: `standard5x5Obstacles`

**Modified Rules**:
- Navigate from (-2, -2) to (2, 2)
- Avoid obstacles
- **Speed matters**: Finish in < 45 seconds (vs 90s in Challenge #3)

**Success Criteria**:
- Reach goal within 50cm
- Maximum 2 collisions allowed (penalty)
- Complete in < 45 seconds

**Scoring**:
- Time (fastest wins)
- Collision penalty: +10s each
- Perfect run bonus (0 collisions): -15s

**Skills**: Fast obstacle avoidance, real-time decisions, risk management

---

## How to Run Challenges

### In Simulation

```bash
# 1. Start LLMos Desktop
npm run electron:dev

# 2. In chat, select a challenge:
"Set map to standard5x5Empty"
"Run Challenge 1: Basic Navigation"

# 3. LLMos will:
- Load the correct map
- Position robot at start
- Run your code
- Measure results
- Report score
```

### On Real Robot

```bash
# 1. Set up physical arena matching the map
# 2. Flash your code to ESP32
# 3. Place robot at starting position
# 4. Start robot
# 5. Manually time and measure results
# 6. Compare to simulation!
```

---

## Leaderboard Format

Example leaderboard entry:

```
Challenge: #1 Basic Navigation
User: @alice
Time: 12.4s
Accuracy: 3cm from goal
Platform: Simulation
Code: github.com/alice/llmos-challenge1
```

Post your results to GitHub Discussions!

---

## Difficulty Progression

**Beginner Path**:
1. Basic Navigation (#1)
2. Checkpoint Race (#2)

**Intermediate Path**:
3. Obstacle Avoidance (#3)
4. Line Following (#4)
8. Speed Run (#8)
9. Precision Parking (#9)

**Advanced Path**:
5. Maze Solver (#5)
6. Figure-8 Track (#6)
7. Delivery Mission (#7)
10. Obstacle Race (#10)

---

## Creating Custom Challenges

Want to create your own challenge?

1. **Design in simulator first**
   - Create custom map or use existing
   - Define start, goal, obstacles
   - Set success criteria

2. **Test and refine**
   - Run multiple times
   - Adjust difficulty
   - Balance time limits

3. **Create physical version**
   - Mark positions on floor
   - Add obstacles/lines
   - Measure and verify

4. **Share with community**
   - Post challenge description
   - Include map coordinates
   - Share solution code (optional)

---

## Next Steps

1. **Try Challenge #1** in simulation
2. **Build your robot** (see STANDARD_ROBOT_V1.md)
3. **Set up arena** (see ARENA_SETUP_GUIDE.md)
4. **Run challenges** on real robot
5. **Compare sim vs real** performance
6. **Share results** on GitHub Discussions!

---

**Ready to compete? Start with Challenge #1!**
