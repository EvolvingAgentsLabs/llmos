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
 * Developer Sample Prompts - Showcasing Infinite App Store
 */
const developerPrompts: SamplePrompt[] = [
  {
    title: 'Generate a Budget Calculator',
    prompt: `Create an interactive budget calculator applet where I can:
- Add multiple income sources
- Track expenses by category (Housing, Food, Transport, etc.)
- Set a savings goal percentage
- See a visual breakdown of my spending

Make it beautiful with a dark theme and real-time calculations.`,
    description: 'Interactive financial tool generated on demand',
    category: 'Generative UI',
  },
  {
    title: 'Build an NDA Generator',
    prompt: `Help me create a Non-Disclosure Agreement. Build a wizard that walks me through:
1. Party information (disclosing and receiving)
2. Purpose of disclosure
3. Jurisdiction and duration
4. Optional clauses (non-compete, non-solicitation)
5. Review and generate

Make it a multi-step form with progress indicator.`,
    description: 'Legal document wizard with form validation',
    category: 'Generative UI',
  },
  {
    title: 'Color Palette Generator',
    prompt: `Create a color palette generator applet with:
- A base hue slider (0-360)
- Harmony modes (complementary, analogous, triadic, tetradic)
- Saturation and lightness controls
- Click-to-copy hex values
- Visual preview of all colors

I want to use it for designing my website.`,
    description: 'Design tool with live color harmonies',
    category: 'Generative UI',
  },
  {
    title: 'Unit Converter Dashboard',
    prompt: `Build a universal unit converter with tabs for:
- Length (meters, feet, inches, km, miles)
- Weight (kg, lbs, oz, grams)
- Temperature (C, F, K)
- Volume (liters, gallons, cups)

Each tab should have input fields and instant conversion.`,
    description: 'Multi-purpose conversion tool',
    category: 'Generative UI',
  },
  {
    title: 'Password Generator',
    prompt: `Create a secure password generator with:
- Length slider (8-64 characters)
- Toggles for: uppercase, lowercase, numbers, symbols
- Password strength indicator
- One-click copy button
- Generate multiple passwords at once

Show visual strength meter (weak/medium/strong).`,
    description: 'Security tool with strength analysis',
    category: 'Generative UI',
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
 * Data Science & Analytics Sample Prompts
 */
const financialPrompts: SamplePrompt[] = [
  {
    title: 'Time Series Analysis',
    prompt: 'Generate synthetic stock price data, calculate moving averages and Bollinger bands, visualize with matplotlib',
    description: 'Financial time series visualization',
    category: 'Time Series',
  },
  {
    title: 'Statistical Analysis',
    prompt: 'Create a dataset with normal and outlier distributions, perform statistical tests and visualize with box plots and histograms',
    description: 'Exploratory data analysis',
    category: 'Statistics',
  },
  {
    title: 'Linear Regression Model',
    prompt: 'Train a linear regression model on synthetic data, plot predictions vs actuals, and show residual analysis with scikit-learn',
    description: 'Predictive modeling with visualization',
    category: 'Machine Learning',
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
 * Robotics & Control Sample Prompts (WebAssembly-compatible)
 */
const roboticsPrompts: SamplePrompt[] = [
  {
    title: 'Quantum Circuit Designer',
    prompt: `Design a quantum computing experiment: Generate Qiskit code for a 4-qubit Quantum Fourier Transform (QFT) that I can run on IBM Quantum. Include:
1. The complete Python code with proper imports
2. Circuit analysis (depth, gate count, connectivity)
3. Export to OpenQASM 2.0 format
4. Instructions for running on IBM Quantum hardware

Don't execute the code - just generate it for download and external execution.`,
    description: 'Design quantum circuits for external execution on real hardware',
    category: 'Quantum Computing',
  },
  {
    title: 'Forward Kinematics',
    prompt: 'Calculate and visualize forward kinematics for a 3-link planar robot arm, showing workspace and joint configurations with matplotlib',
    description: 'Kinematics analysis and visualization',
    category: 'Kinematics',
  },
  {
    title: 'Trajectory Planning',
    prompt: 'Generate a smooth trajectory for a robot end-effector using cubic splines, plot position, velocity, and acceleration profiles',
    description: 'Motion planning with visualization',
    category: 'Path Planning',
  },
  {
    title: 'PID Controller Simulation',
    prompt: 'Simulate a PID controller for position control, plot step response and tune gains using scipy optimization',
    description: 'Control system design',
    category: 'Control Systems',
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
 * General Professional Sample Prompts - Infinite App Store Focus
 */
const generalPrompts: SamplePrompt[] = [
  {
    title: 'Invoice Generator',
    prompt: `Build an invoice generator where I can:
- Enter my business details and logo
- Add client information
- List items with quantity, rate, and tax
- Auto-calculate totals and tax
- Add payment terms and notes
- Export to PDF format

Make it look professional with clean typography.`,
    description: 'Professional billing tool',
    category: 'Generative UI',
  },
  {
    title: 'Meeting Scheduler',
    prompt: `Create a meeting time finder tool where:
- I can add multiple participants with their timezones
- Show overlapping available hours visually
- Suggest optimal meeting times
- Handle daylight saving differences
- Copy formatted meeting invite

Help me schedule with my international team.`,
    description: 'Timezone-aware scheduling',
    category: 'Generative UI',
  },
  {
    title: 'Expense Tracker',
    prompt: `Build an expense tracking dashboard with:
- Quick expense entry form
- Category breakdown (pie chart)
- Monthly spending trend (line chart)
- Budget vs actual comparison
- Export data functionality

I want to track my monthly spending habits.`,
    description: 'Personal finance dashboard',
    category: 'Generative UI',
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
