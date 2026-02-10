/**
 * Domain-Specific Sample Prompts
 *
 * Showcases capabilities for each industry with realistic use cases.
 */

import { Industry } from './terminology-config';

export interface SamplePrompt {
  title: string;
  prompt: string;
  description: string;
  category: string;
}

/**
 * Developer Sample Prompts - Scientific + Generative UI Hybrid
 */
const developerPrompts: SamplePrompt[] = [
  {
    title: 'Create Wall Avoidance AI Agent',
    prompt: `Create an AI robot agent that autonomously explores the 5m × 5m arena while avoiding walls.

The agent should:
- Use LLM reasoning to make navigation decisions
- Read distance sensors continuously
- Turn away when obstacles are detected within 30cm
- Use LED colors: green=exploring, yellow=turning, red=obstacle detected
- Navigate smoothly without collisions

Set it up to run in the simulation with a virtual robot.`,
    description: 'Autonomous wall-avoiding AI agent',
    category: 'AI Robot Agents',
  },
  {
    title: 'Maze-Solving AI Agent',
    prompt: `Build an AI agent that can solve mazes using LLM reasoning.

The agent should:
- Analyze sensor readings to understand its surroundings
- Use LLM to decide which direction to turn at intersections
- Remember where it has been (via conversation history)
- Find the exit of the 5m × 5m maze
- Explain its decision-making process

Test it in the standard maze map.`,
    description: 'Intelligent maze navigation',
    category: 'AI Robot Agents',
  },
  {
    title: 'Adaptive Explorer Agent',
    prompt: `Create an AI agent that learns to explore efficiently.

The agent should:
- Start with random exploration
- Use LLM to analyze which strategies work best
- Adapt its behavior based on sensor feedback
- Maximize arena coverage
- LED shows confidence level (dim=uncertain, bright=confident)

Let it run for 20 iterations to see it improve.`,
    description: 'Self-improving exploration behavior',
    category: 'AI Robot Agents',
  },
  {
    title: 'Multi-Strategy Navigation Agent',
    prompt: `Create an AI agent that uses multiple navigation strategies in the obstacle-filled arena.

Map: standard5x5Obstacles (11 circular obstacles)
Goal: Navigate from (-2, -2) to (2, 2) without collisions

The agent should:
- Try different strategies: wall following, direct path, random exploration
- Use LLM to evaluate which strategy works best in current situation
- Switch strategies dynamically when stuck
- Learn from failures and adapt approach
- LED color indicates strategy: blue=wall-follow, green=direct, yellow=exploring
- Complete challenge using optimal strategy combination

Let the agent experiment and find the best approach.`,
    description: 'Adaptive multi-strategy navigation',
    category: 'AI Robot Agents',
  },
  {
    title: 'Collaborative Maze Team',
    prompt: `Create a team of AI agents that solve mazes through collaboration.

Map: standard5x5Maze
Goal: Find optimal path from (-2, -2) to (2, 2)

The system should:
- Generate 2-3 AI agents with different exploration strategies
- Each agent explores independently and shares findings via LLM
- Agents vote on best path forward using LLM reasoning
- LED colors distinguish agents: red, green, blue
- Compare single-agent vs. multi-agent performance
- Agents explain their reasoning and learn from each other

Watch them collaborate and debate the best path.`,
    description: 'Multi-agent collaborative problem solving',
    category: 'AI Robot Agents',
  },
  {
    title: 'Self-Tuning Line Follower',
    prompt: `Build an AI agent that tunes its own PID controller for line following.

Map: standard5x5LineTrack (3.6m × 2.4m oval)
Goal: Complete 3 laps with self-optimized control

The agent should:
- Start with default PID values
- Use LLM to analyze line sensor patterns and track deviation
- Adjust Kp, Ki, Kd parameters between laps based on performance
- Learn optimal settings through experimentation
- LED brightness shows tuning confidence
- Explain its tuning decisions and reasoning

Watch it improve lap times through intelligent parameter tuning.`,
    description: 'LLM-based PID auto-tuning',
    category: 'AI Robot Agents',
  },
  {
    title: 'Intelligent Delivery Coordinator',
    prompt: `Create an AI agent that plans and optimizes delivery routes.

Map: standard5x5Delivery
Waypoints: (2, -2), (2, 2), (-2, 2), (-2, -2)

The agent should:
- Use LLM to analyze waypoint positions and plan optimal route
- Consider obstacle (0.4m radius at center) in path planning
- Adapt route if obstacles detected during navigation
- Decide when to take shortcuts vs. safe paths
- LED blinks different colors for each waypoint reached
- Explain routing decisions and trade-offs
- Complete mission in minimum time with zero collisions

Let it strategize the best delivery sequence and path.`,
    description: 'LLM-powered route optimization',
    category: 'AI Robot Agents',
  },
  {
    title: 'Real Robot AI Agent',
    prompt: `Create an AI agent that controls a real ESP32-S3 robot connected via WiFi.

The agent should:
- Connect to physical ESP32 robot over WebSocket
- Read real sensor data: ultrasonic distance, IMU, line sensors, camera
- Use LLM to make decisions based on real-world sensor inputs
- Control real motors and LED via robot API
- Handle connection failures gracefully
- Monitor battery level and stop if low
- Log decision-making process and sensor readings
- Compare simulated predictions vs. real-world results

Bridge the gap between simulation and physical hardware.`,
    description: 'LLM control of real ESP32 hardware',
    category: 'AI Robot Agents',
  },
  {
    title: 'Sim-to-Real Transfer Agent',
    prompt: `Build an AI agent that learns in simulation then transfers to real robot.

The agent should:
- Train navigation strategy in 5m × 5m simulation
- Use LLM to analyze performance and refine approach
- Test trained behavior on real ESP32 robot
- Measure sim-to-real gap (position error, time difference)
- Adapt strategy based on real-world feedback
- Explain differences between sim and real behavior
- Auto-tune parameters to minimize transfer gap

Document the complete sim-to-real workflow.`,
    description: 'Simulation to reality AI transfer',
    category: 'AI Robot Agents',
  },
  {
    title: 'Curious Exploration Agent',
    prompt: `Create an AI agent with curiosity-driven exploration behavior.

The agent should:
- Explore 5m × 5m arena driven by curiosity
- Use LLM to identify "interesting" sensor patterns
- Prioritize visiting unexplored areas
- Investigate anomalies or novel observations
- Build internal map of discovered features
- LED brightness shows curiosity level
- Explain what it finds interesting and why
- Generate exploration report with discoveries

Watch it autonomously discover arena features.`,
    description: 'Curiosity-driven autonomous exploration',
    category: 'AI Robot Agents',
  },
  {
    title: 'Behavior Evolution Agent',
    prompt: `Build an AI agent that evolves its behavior through experimentation.

The agent should:
- Start with random movement behavior
- Use LLM to generate behavior variations
- Test each variation and measure success (speed, efficiency, smoothness)
- Select best-performing behaviors
- Combine successful strategies into improved behaviors
- LED color shows generation number (red→yellow→green as it improves)
- Run 10+ generations to see evolution
- Explain fitness function and selection criteria

Observe emergent intelligent behavior through LLM-guided evolution.`,
    description: 'LLM-guided behavior evolution',
    category: 'AI Robot Agents',
  },
  {
    title: 'Camera Scene Analysis Navigator',
    prompt: `Create an AI agent that uses camera vision to analyze the scene and navigate.

The agent should:
- Capture camera frames from the robot's first-person view
- Analyze each frame to describe the scene for robot navigation
- Describe objects including their sizes, direction, and distance from the robot
- Use the floor grid lines as distance reference (grid lines are 0.5m apart, thicker lines every 1.0m)
- Identify obstacles (red-striped cylinders), walls (blue with chevrons), and open spaces
- Estimate object distances by counting grid squares on the floor (each square = 0.5m)
- Make navigation decisions based on the visual scene description
- LED shows: green=clear path, yellow=partially blocked, red=obstacle ahead
- Log detailed scene descriptions including object shapes, colors, textures, and patterns

The vision analysis should produce structured descriptions like:
"A red-and-white striped cylinder obstacle is approximately 1.5m ahead (3 grid squares), center-right.
The floor grid is visible with 0.5m spacing. Blue chevron-patterned wall is 2.0m to the left.
Clear open space extends 3.0m to the right. Recommended: turn right to avoid obstacle."

Navigate the arena using vision-based scene understanding.`,
    description: 'Vision-based scene analysis for navigation',
    category: 'AI Robot Agents',
  },
];

/**
 * Legal Practice Sample Prompts
 */
const legalPrompts: SamplePrompt[] = [
  {
    title: 'Contract Analysis',
    prompt: 'Analyze this M&A purchase agreement and identify key clauses, potential risks, unusual provisions, and missing standard protections',
    description: 'Comprehensive contract review',
    category: 'Contract Law',
  },
  {
    title: 'Legal Brief Research',
    prompt: 'Research employment discrimination precedents in the 9th Circuit for wrongful termination cases, focusing on post-2020 decisions',
    description: 'Case law research with citations',
    category: 'Legal Research',
  },
  {
    title: 'Due Diligence Checklist',
    prompt: 'Create a comprehensive due diligence checklist for acquiring a SaaS company, including IP, contracts, compliance, and liabilities',
    description: 'M&A due diligence workflow',
    category: 'Corporate Law',
  },
];

/**
 * Data Science & Analytics Sample Prompts - Interactive Analysis
 */
const financialPrompts: SamplePrompt[] = [
  {
    title: 'Time Series Lab',
    prompt: `Build a time series analysis workbench with:
- Generate or upload data (stock prices, temperatures, etc.)
- Apply moving averages with adjustable window size
- Add Bollinger bands with customizable std deviation
- Detect trends and seasonality
- Run forecasting with Python in background

Show interactive charts that update as I adjust parameters.`,
    description: 'Financial analysis playground',
    category: 'TimeSeries + UI',
  },
  {
    title: 'Regression Playground',
    prompt: `Create a regression analysis tool where I can:
- Generate synthetic data with noise slider
- Choose model type (linear, polynomial, ridge, lasso)
- See fit line update in real-time
- Display R², MSE, and residual plots
- Adjust regularization strength for ridge/lasso

Train models with scikit-learn in background.`,
    description: 'ML regression sandbox',
    category: 'ML + UI',
  },
  {
    title: 'Hypothesis Tester',
    prompt: `Build a statistical hypothesis testing tool with:
- Select test type (t-test, chi-square, ANOVA, correlation)
- Input or generate sample data
- Set significance level (alpha)
- Show test statistic, p-value, and decision
- Visualize the distribution and critical regions

Explain the interpretation in plain language.`,
    description: 'Statistics hypothesis sandbox',
    category: 'Statistics + UI',
  },
];

/**
 * Management Consulting Sample Prompts
 */
const consultingPrompts: SamplePrompt[] = [
  {
    title: 'Market Entry Strategy',
    prompt: 'Develop a market entry strategy for a US retailer expanding to Southeast Asia, including market sizing, competitive analysis, and go-to-market plan',
    description: 'International expansion strategy',
    category: 'Strategy Consulting',
  },
  {
    title: 'Business Case',
    prompt: 'Build a business case for implementing AI-powered customer service, including NPV analysis, implementation roadmap, and change management plan',
    description: 'Investment justification',
    category: 'Operations Consulting',
  },
  {
    title: 'Stakeholder Mapping',
    prompt: 'Create a stakeholder influence map for a large-scale organizational restructuring, identify key concerns, and develop communication strategy',
    description: 'Change management planning',
    category: 'Organizational Design',
  },
];

/**
 * 3D Animation & Visualization Sample Prompts
 */
const biologyPrompts: SamplePrompt[] = [
  {
    title: '3D Parametric Surface',
    prompt: 'Create an animated 3D parametric surface showing a torus morphing into a sphere using matplotlib animation',
    description: 'Mathematical surface animation',
    category: '3D Visualization',
  },
  {
    title: 'Particle System',
    prompt: 'Simulate a 3D particle system with gravity and collisions, visualize trajectories with matplotlib scatter plot animation',
    description: 'Physics-based animation',
    category: 'Simulation',
  },
  {
    title: 'Fourier Epicycles',
    prompt: 'Animate Fourier epicycles drawing a complex shape in 2D, showing how circular motions combine to create patterns',
    description: 'Mathematical animation',
    category: 'Mathematics',
  },
];

/**
 * Robotics & Control Sample Prompts - Interactive Simulations
 */
const roboticsPrompts: SamplePrompt[] = [
  {
    title: 'PID Tuning Dashboard',
    prompt: `Build an interactive PID controller tuner with:
- Sliders for Kp, Ki, Kd gains
- System type selector (first order, second order, with delay)
- Real-time step response plot
- Show overshoot, settling time, steady-state error
- Auto-tune button using Ziegler-Nichols method

Run the simulation with Python/SciPy in background.`,
    description: 'Control systems tuning playground',
    category: 'Controls + UI',
  },
  {
    title: 'Trajectory Planner',
    prompt: `Create a motion trajectory designer with:
- Click to add waypoints on a 2D canvas
- Select interpolation (linear, cubic spline, quintic)
- Velocity and acceleration limits
- Visualize position, velocity, acceleration profiles
- Export trajectory as CSV or Python code

Animate the path traversal in real-time.`,
    description: 'Path planning visualization tool',
    category: 'Motion + UI',
  },
  {
    title: 'State Space Explorer',
    prompt: `Build a linear system analyzer where I can:
- Enter state matrices A, B, C, D
- Compute and display eigenvalues and stability
- Plot pole-zero diagram
- Show Bode plot and step response
- Check controllability and observability

Color-code stable vs unstable poles.`,
    description: 'Control theory analysis tool',
    category: 'Systems + UI',
  },
  {
    title: 'Sensor Fusion Simulator',
    prompt: `Create a Kalman filter visualization with:
- Simulated noisy GPS and accelerometer data
- Adjustable process and measurement noise
- Show raw vs filtered estimates
- Display estimation error over time
- Animate a moving object with true vs estimated position

Explain the Kalman equations alongside.`,
    description: 'Estimation and filtering sandbox',
    category: 'Estimation + UI',
  },
];

/**
 * Audit & Assurance Sample Prompts
 */
const auditPrompts: SamplePrompt[] = [
  {
    title: 'Internal Control Testing',
    prompt: 'Design test procedures for evaluating SOX compliance of revenue recognition controls, including sample selection and documentation requirements',
    description: 'Control testing methodology',
    category: 'Financial Audit',
  },
  {
    title: 'Fraud Detection',
    prompt: 'Analyze accounts payable transactions for fraud indicators using Benford\'s Law, duplicate detection, and anomaly identification',
    description: 'Forensic accounting analysis',
    category: 'Fraud Investigation',
  },
  {
    title: 'IT Security Audit',
    prompt: 'Conduct a cybersecurity audit of cloud infrastructure, including access controls, encryption, vulnerability assessment, and GDPR compliance',
    description: 'Technical control assessment',
    category: 'IT Audit',
  },
];

/**
 * General Professional Sample Prompts - Hybrid Scientific + Practical
 */
const generalPrompts: SamplePrompt[] = [
  {
    title: 'Data Distribution Explorer',
    prompt: `Build a statistical distribution explorer with:
- Dropdown to select distribution (Normal, Poisson, Exponential, Uniform)
- Sliders for distribution parameters (mean, std, lambda, etc.)
- Live histogram visualization
- Show key statistics (mean, median, std, skewness)
- Generate random samples and run Python analysis

Help me understand probability distributions visually.`,
    description: 'Interactive statistics playground',
    category: 'Statistics + UI',
  },
  {
    title: 'Physics Simulator',
    prompt: `Create a projectile motion simulator where I can:
- Set initial velocity and launch angle with sliders
- Toggle air resistance on/off
- Adjust gravity (Earth, Moon, Mars presets)
- See trajectory path update in real-time
- Display max height, range, and flight time

Show the physics equations alongside the visualization.`,
    description: 'Interactive physics sandbox',
    category: 'Physics + UI',
  },
  {
    title: 'Color Science Lab',
    prompt: `Build a color space converter and analyzer with:
- Input color in any format (HEX, RGB, HSL, CMYK)
- Show all color space representations
- Display complementary, analogous, triadic harmonies
- Visualize on color wheel
- Check WCAG contrast ratios against backgrounds

I want to understand color theory for my designs.`,
    description: 'Color theory exploration tool',
    category: 'Design + UI',
  },
];

/**
 * Sample Prompts by Industry
 */
export const samplePromptsByIndustry: Record<Industry, SamplePrompt[]> = {
  developer: developerPrompts,
  legal: legalPrompts,
  financial: financialPrompts,
  consulting: consultingPrompts,
  biology: biologyPrompts,
  robotics: roboticsPrompts,
  audit: auditPrompts,
  general: generalPrompts,
};

/**
 * Get sample prompts for current industry
 */
export function getSamplePromptsForIndustry(industry: Industry): SamplePrompt[] {
  return samplePromptsByIndustry[industry] || generalPrompts;
}

/**
 * Get current industry from localStorage
 */
export function getCurrentIndustry(): Industry {
  if (typeof window === 'undefined') return 'developer';
  return (localStorage.getItem('user-industry') as Industry) || 'developer';
}

/**
 * Get sample prompts for current user's industry
 */
export function getCurrentSamplePrompts(): SamplePrompt[] {
  const industry = getCurrentIndustry();
  return getSamplePromptsForIndustry(industry);
}
