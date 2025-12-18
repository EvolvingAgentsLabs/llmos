/**
 * Terminology Configuration System
 *
 * Adapts UI language to different professional contexts.
 * Supports domain-specific terminology while maintaining
 * the same underlying functionality.
 */

export type Industry =
  | 'developer'
  | 'legal'
  | 'financial'
  | 'consulting'
  | 'political'
  | 'audit'
  | 'general';

export interface Terminology {
  // Core concepts
  workspace: string;
  workspaces: string;
  artifact: string;
  artifacts: string;
  skill: string;
  skills: string;
  tool: string;
  tools: string;
  agent: string;
  agents: string;
  cron: string;
  crons: string;

  // Actions
  commit: string;
  committing: string;
  evolve: string;
  evolving: string;
  execute: string;
  executing: string;

  // Descriptive terms
  learningCycle: string;
  methodology: string;
  methodologies: string;
  deliverable: string;
  deliverables: string;
  specialist: string;
  specialists: string;
  utility: string;
  utilities: string;

  // Process terms
  patternDetection: string;
  knowledgeEvolution: string;
  contextMemory: string;
  workflowAutomation: string;
}

/**
 * Developer Terminology (Original)
 */
const developerTerms: Terminology = {
  workspace: 'Volume',
  workspaces: 'Volumes',
  artifact: 'Artifact',
  artifacts: 'Artifacts',
  skill: 'Skill',
  skills: 'Skills',
  tool: 'Tool',
  tools: 'Tools',
  agent: 'Agent',
  agents: 'Agents',
  cron: 'Cron',
  crons: 'Crons',
  commit: 'Commit',
  committing: 'Committing',
  evolve: 'Evolve',
  evolving: 'Evolving',
  execute: 'Execute',
  executing: 'Executing',
  learningCycle: 'Learning Cycle',
  methodology: 'Methodology',
  methodologies: 'Methodologies',
  deliverable: 'Deliverable',
  deliverables: 'Deliverables',
  specialist: 'Specialist',
  specialists: 'Specialists',
  utility: 'Utility',
  utilities: 'Utilities',
  patternDetection: 'Pattern Detection',
  knowledgeEvolution: 'Knowledge Evolution',
  contextMemory: 'Context Memory',
  workflowAutomation: 'Workflow Automation',
};

/**
 * Legal Terminology
 */
const legalTerms: Terminology = {
  workspace: 'Matter',
  workspaces: 'Matters',
  artifact: 'Document',
  artifacts: 'Documents',
  skill: 'Procedure',
  skills: 'Procedures',
  tool: 'Research Tool',
  tools: 'Research Tools',
  agent: 'Legal Assistant',
  agents: 'Legal Assistants',
  cron: 'Knowledge Update',
  crons: 'Knowledge Updates',
  commit: 'File',
  committing: 'Filing',
  evolve: 'Refine',
  evolving: 'Refining',
  execute: 'Perform',
  executing: 'Performing',
  learningCycle: 'Practice Review',
  methodology: 'Legal Framework',
  methodologies: 'Legal Frameworks',
  deliverable: 'Work Product',
  deliverables: 'Work Products',
  specialist: 'Expert',
  specialists: 'Experts',
  utility: 'Legal Utility',
  utilities: 'Legal Utilities',
  patternDetection: 'Precedent Analysis',
  knowledgeEvolution: 'Practice Development',
  contextMemory: 'Case Memory',
  workflowAutomation: 'Process Standardization',
};

/**
 * Financial Terminology
 */
const financialTerms: Terminology = {
  workspace: 'Portfolio',
  workspaces: 'Portfolios',
  artifact: 'Report',
  artifacts: 'Reports',
  skill: 'Methodology',
  skills: 'Methodologies',
  tool: 'Analytical Tool',
  tools: 'Analytical Tools',
  agent: 'Analyst',
  agents: 'Analysts',
  cron: 'Review Cycle',
  crons: 'Review Cycles',
  commit: 'Archive',
  committing: 'Archiving',
  evolve: 'Optimize',
  evolving: 'Optimizing',
  execute: 'Calculate',
  executing: 'Calculating',
  learningCycle: 'Performance Review',
  methodology: 'Investment Strategy',
  methodologies: 'Investment Strategies',
  deliverable: 'Analysis',
  deliverables: 'Analyses',
  specialist: 'Advisor',
  specialists: 'Advisors',
  utility: 'Calculator',
  utilities: 'Calculators',
  patternDetection: 'Trend Analysis',
  knowledgeEvolution: 'Strategy Refinement',
  contextMemory: 'Historical Context',
  workflowAutomation: 'Process Standardization',
};

/**
 * Consulting Terminology
 */
const consultingTerms: Terminology = {
  workspace: 'Engagement',
  workspaces: 'Engagements',
  artifact: 'Deliverable',
  artifacts: 'Deliverables',
  skill: 'Framework',
  skills: 'Frameworks',
  tool: 'Analysis Tool',
  tools: 'Analysis Tools',
  agent: 'Consultant',
  agents: 'Consultants',
  cron: 'Knowledge Synthesis',
  crons: 'Knowledge Syntheses',
  commit: 'Package',
  committing: 'Packaging',
  evolve: 'Improve',
  evolving: 'Improving',
  execute: 'Apply',
  executing: 'Applying',
  learningCycle: 'Engagement Review',
  methodology: 'Consulting Framework',
  methodologies: 'Consulting Frameworks',
  deliverable: 'Client Deliverable',
  deliverables: 'Client Deliverables',
  specialist: 'Subject Matter Expert',
  specialists: 'Subject Matter Experts',
  utility: 'Diagnostic Tool',
  utilities: 'Diagnostic Tools',
  patternDetection: 'Best Practice Identification',
  knowledgeEvolution: 'Methodology Refinement',
  contextMemory: 'Institutional Knowledge',
  workflowAutomation: 'Efficiency Enhancement',
};

/**
 * Political Terminology
 */
const politicalTerms: Terminology = {
  workspace: 'Campaign',
  workspaces: 'Campaigns',
  artifact: 'Brief',
  artifacts: 'Briefs',
  skill: 'Playbook',
  skills: 'Playbooks',
  tool: 'Research Tool',
  tools: 'Research Tools',
  agent: 'Strategist',
  agents: 'Strategists',
  cron: 'Strategic Review',
  crons: 'Strategic Reviews',
  commit: 'Publish',
  committing: 'Publishing',
  evolve: 'Adapt',
  evolving: 'Adapting',
  execute: 'Deploy',
  executing: 'Deploying',
  learningCycle: 'Campaign Review',
  methodology: 'Strategy',
  methodologies: 'Strategies',
  deliverable: 'Talking Point',
  deliverables: 'Talking Points',
  specialist: 'Policy Expert',
  specialists: 'Policy Experts',
  utility: 'Opposition Research',
  utilities: 'Opposition Research',
  patternDetection: 'Voter Trend Analysis',
  knowledgeEvolution: 'Message Refinement',
  contextMemory: 'Campaign History',
  workflowAutomation: 'Rapid Response',
};

/**
 * Audit Terminology
 */
const auditTerms: Terminology = {
  workspace: 'Audit',
  workspaces: 'Audits',
  artifact: 'Workpaper',
  artifacts: 'Workpapers',
  skill: 'Procedure',
  skills: 'Procedures',
  tool: 'Test Tool',
  tools: 'Test Tools',
  agent: 'Auditor',
  agents: 'Auditors',
  cron: 'Quality Review',
  crons: 'Quality Reviews',
  commit: 'Archive',
  committing: 'Archiving',
  evolve: 'Enhance',
  evolving: 'Enhancing',
  execute: 'Test',
  executing: 'Testing',
  learningCycle: 'Audit Review',
  methodology: 'Audit Procedure',
  methodologies: 'Audit Procedures',
  deliverable: 'Finding',
  deliverables: 'Findings',
  specialist: 'Subject Matter Expert',
  specialists: 'Subject Matter Experts',
  utility: 'Audit Tool',
  utilities: 'Audit Tools',
  patternDetection: 'Control Assessment',
  knowledgeEvolution: 'Procedure Enhancement',
  contextMemory: 'Audit History',
  workflowAutomation: 'Test Automation',
};

/**
 * General/Professional Terminology (Default for unknown industries)
 */
const generalTerms: Terminology = {
  workspace: 'Workspace',
  workspaces: 'Workspaces',
  artifact: 'Document',
  artifacts: 'Documents',
  skill: 'Playbook',
  skills: 'Playbooks',
  tool: 'Tool',
  tools: 'Tools',
  agent: 'Assistant',
  agents: 'Assistants',
  cron: 'Learning Cycle',
  crons: 'Learning Cycles',
  commit: 'Save',
  committing: 'Saving',
  evolve: 'Improve',
  evolving: 'Improving',
  execute: 'Run',
  executing: 'Running',
  learningCycle: 'Review Cycle',
  methodology: 'Methodology',
  methodologies: 'Methodologies',
  deliverable: 'Deliverable',
  deliverables: 'Deliverables',
  specialist: 'Specialist',
  specialists: 'Specialists',
  utility: 'Utility',
  utilities: 'Utilities',
  patternDetection: 'Pattern Recognition',
  knowledgeEvolution: 'Knowledge Growth',
  contextMemory: 'Historical Context',
  workflowAutomation: 'Process Automation',
};

/**
 * Terminology Registry
 */
export const terminologies: Record<Industry, Terminology> = {
  developer: developerTerms,
  legal: legalTerms,
  financial: financialTerms,
  consulting: consultingTerms,
  political: politicalTerms,
  audit: auditTerms,
  general: generalTerms,
};

/**
 * Get terminology for industry
 */
export function getTerminology(industry: Industry): Terminology {
  return terminologies[industry] || generalTerms;
}

/**
 * Get current terminology from storage
 */
export function getCurrentTerminology(): Terminology {
  if (typeof window === 'undefined') return developerTerms;

  const industry = (localStorage.getItem('user-industry') as Industry) || 'general';
  return getTerminology(industry);
}

/**
 * Set industry and update terminology
 */
export function setIndustry(industry: Industry): void {
  localStorage.setItem('user-industry', industry);
}

/**
 * Terminology helper hook for React components
 */
export function useTerminology(): Terminology {
  if (typeof window === 'undefined') return developerTerms;

  const industry = (localStorage.getItem('user-industry') as Industry) || 'general';
  return getTerminology(industry);
}

/**
 * Industry display names
 */
export const industryNames: Record<Industry, string> = {
  developer: 'Software Development',
  legal: 'Legal Practice',
  financial: 'Financial Services',
  consulting: 'Management Consulting',
  political: 'Political Campaigns',
  audit: 'Audit & Assurance',
  general: 'General Professional',
};

/**
 * Industry descriptions
 */
export const industryDescriptions: Record<Industry, string> = {
  developer: 'Build software, manage code, automate workflows',
  legal: 'Legal research, contract analysis, case management',
  financial: 'Financial analysis, investment research, portfolio management',
  consulting: 'Strategic planning, market analysis, business transformation',
  political: 'Campaign strategy, policy research, voter outreach',
  audit: 'Financial audits, compliance testing, risk assessment',
  general: 'General knowledge work and professional services',
};
