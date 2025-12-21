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
 * Developer Sample Prompts (WebAssembly-compatible)
 */
const developerPrompts: SamplePrompt[] = [
  {
    title: 'Signal Processing & FFT',
    prompt: 'Create a sine wave signal, add noise, then apply FFT to show frequency spectrum. Plot both time and frequency domains.',
    description: 'Signal analysis with visualization',
    category: 'Data Science',
  },
  {
    title: '3D Surface Plot',
    prompt: 'Create a 3D surface plot of z = sin(sqrt(x^2 + y^2)) using matplotlib with a colorful gradient',
    description: 'Interactive 3D visualization',
    category: 'Visualization',
  },
  {
    title: 'Robot Kinematics',
    prompt: 'Simulate a 2-link robot arm trajectory from (0,2) to (2,0) and animate it with matplotlib',
    description: 'Robotics simulation and animation',
    category: 'Robotics',
  },
  {
    title: 'Machine Learning Model',
    prompt: 'Train a K-means clustering model on synthetic 2D data and visualize the clusters with matplotlib',
    description: 'ML with scikit-learn visualization',
    category: 'Machine Learning',
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
 * General Professional Sample Prompts
 */
const generalPrompts: SamplePrompt[] = [
  {
    title: 'Project Plan',
    prompt: 'Create a comprehensive project plan for launching a new product, including timeline, milestones, resource allocation, and risk management',
    description: 'Project management framework',
    category: 'Project Management',
  },
  {
    title: 'Data Analysis',
    prompt: 'Analyze customer survey data to identify trends, segment customers, and generate actionable insights with visualizations',
    description: 'Exploratory data analysis',
    category: 'Data Analytics',
  },
  {
    title: 'Process Documentation',
    prompt: 'Document a complex business process with flowcharts, decision trees, and step-by-step procedures for training purposes',
    description: 'Workflow documentation',
    category: 'Process Improvement',
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
