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
 * Developer Sample Prompts (Original)
 */
const developerPrompts: SamplePrompt[] = [
  {
    title: 'Quantum Cepstral Analysis',
    prompt: 'Create a circuit to perform quantum cepstral analysis of a cardiac pressure wave to detect echoes using 2-stage Fourier quantum transform with 4 qubits',
    description: 'Quantum signal processing with visualization',
    category: 'Quantum Computing',
  },
  {
    title: 'Create REST API',
    prompt: 'Create a FastAPI REST API for a task management system with CRUD operations, authentication, and PostgreSQL integration',
    description: 'Full-stack API with auth and database',
    category: 'Backend Development',
  },
  {
    title: 'React Component',
    prompt: 'Create a reusable React component library for data visualization with charts, tables, and interactive dashboards',
    description: 'Component library with TypeScript',
    category: 'Frontend Development',
  },
  {
    title: 'DevOps Pipeline',
    prompt: 'Set up a CI/CD pipeline using GitHub Actions with automated testing, security scanning, and deployment to AWS',
    description: 'Complete deployment automation',
    category: 'DevOps',
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
 * Financial Services Sample Prompts
 */
const financialPrompts: SamplePrompt[] = [
  {
    title: 'DCF Valuation',
    prompt: 'Perform a discounted cash flow valuation for a mid-cap technology company with 5-year projections, WACC calculation, and sensitivity analysis',
    description: 'Complete equity valuation',
    category: 'Investment Analysis',
  },
  {
    title: 'Portfolio Optimization',
    prompt: 'Optimize a $10M portfolio across equities, bonds, and alternatives targeting 8% return with maximum 15% volatility using modern portfolio theory',
    description: 'Risk-return optimization',
    category: 'Portfolio Management',
  },
  {
    title: 'Credit Analysis',
    prompt: 'Analyze the creditworthiness of a manufacturing company using financial ratios, cash flow analysis, and industry comparisons',
    description: 'Credit risk assessment',
    category: 'Credit Analysis',
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
 * Biology Research Sample Prompts
 */
const biologyPrompts: SamplePrompt[] = [
  {
    title: 'CRISPR Protocol',
    prompt: 'Design a CRISPR-Cas9 gene editing protocol for knockout of BRCA1 in HEK293 cells, including guide RNA design, transfection, and validation',
    description: 'Gene editing experimental design',
    category: 'Molecular Biology',
  },
  {
    title: 'Protein Structure Prediction',
    prompt: 'Predict the 3D structure of a novel enzyme using AlphaFold, identify active sites, and suggest potential ligands for drug development',
    description: 'Computational biology analysis',
    category: 'Structural Biology',
  },
  {
    title: 'RNA-seq Analysis',
    prompt: 'Analyze differential gene expression from RNA-seq data comparing treated vs control samples, with pathway enrichment and visualization',
    description: 'Transcriptomics analysis',
    category: 'Bioinformatics',
  },
];

/**
 * Robotics & Control Sample Prompts
 */
const roboticsPrompts: SamplePrompt[] = [
  {
    title: 'PID Controller Tuning',
    prompt: 'Design and tune a PID controller for a quadcopter altitude control system, with Ziegler-Nichols method and simulation validation',
    description: 'Controller optimization',
    category: 'Control Systems',
  },
  {
    title: 'Path Planning',
    prompt: 'Implement RRT* path planning for a mobile robot navigating a warehouse with dynamic obstacles, including trajectory optimization',
    description: 'Motion planning algorithm',
    category: 'Autonomous Navigation',
  },
  {
    title: 'Robot Simulation',
    prompt: 'Create a Gazebo simulation of a 6-DOF robotic arm with URDF model, joint controllers, and pick-and-place task validation',
    description: 'Robot modeling and simulation',
    category: 'Robotics Simulation',
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
