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
    title: 'Quantum Circuit Playground',
    prompt: `Build an interactive quantum circuit designer applet where I can:
- Drag and drop quantum gates (H, X, Y, Z, CNOT, T, S)
- Add up to 5 qubits
- See the circuit diagram update in real-time
- View the state vector and probability amplitudes
- Export to Qiskit code for IBM Quantum execution

Make it visual with gate icons and qubit wire lines.`,
    description: 'Interactive quantum computing sandbox',
    category: 'Quantum + UI',
  },
  {
    title: 'Signal Analyzer Studio',
    prompt: `Create a signal processing applet with:
- Sliders for frequency, amplitude, and phase of a sine wave
- Option to add noise (adjustable SNR)
- Real-time FFT visualization showing frequency spectrum
- Time domain and frequency domain side-by-side
- Run the analysis with Python/NumPy in background

I want to explore Fourier transforms interactively.`,
    description: 'Live signal analysis with Python backend',
    category: 'DSP + UI',
  },
  {
    title: '3D Function Plotter',
    prompt: `Build an interactive 3D surface plotter where I can:
- Enter a mathematical function z = f(x, y)
- Adjust x and y range with sliders
- Choose colormap (viridis, plasma, coolwarm)
- Rotate and zoom the 3D view
- Execute with matplotlib and display the result

Start with z = sin(sqrt(x² + y²)) as default.`,
    description: '3D math visualization with live rendering',
    category: 'Visualization + UI',
  },
  {
    title: 'Robot Arm Simulator',
    prompt: `Create a 2-link robot arm control panel with:
- Sliders for joint angles θ1 and θ2
- Input fields for target (x, y) position
- Visual display of arm configuration
- Forward and inverse kinematics calculations
- Animate trajectory from current to target position

Show the workspace boundary and joint limits.`,
    description: 'Robotics kinematics playground',
    category: 'Robotics + UI',
  },
  {
    title: 'Neural Network Visualizer',
    prompt: `Build a neural network architecture designer with:
- Add/remove layers (input, hidden, output)
- Adjust neurons per layer with sliders
- Choose activation functions (ReLU, Sigmoid, Tanh)
- Visualize network topology as a graph
- Generate PyTorch/TensorFlow code for the architecture

Show parameter count and network depth.`,
    description: 'ML architecture design tool',
    category: 'ML + UI',
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
