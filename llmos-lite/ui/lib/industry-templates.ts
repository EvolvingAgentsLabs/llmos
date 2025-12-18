/**
 * Industry Template Library
 *
 * Pre-configured skills, tools, and agents for each professional domain.
 * These templates can be loaded into system/team volumes on first use.
 */

import { Industry } from './terminology-config';

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
}

export interface ToolTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
}

export interface IndustryTemplates {
  skills: SkillTemplate[];
  tools: ToolTemplate[];
  agents: AgentTemplate[];
}

/**
 * Legal Practice Templates
 */
const legalTemplates: IndustryTemplates = {
  skills: [
    {
      id: 'contract-review',
      name: 'Contract Review',
      description: 'Systematic contract analysis identifying risks, obligations, and unusual clauses',
      category: 'Legal Analysis',
      content: `---
name: Contract Review
description: Analyze contracts for key clauses, risks, obligations, and missing protections
version: 1.0.0
---

# Contract Review Skill

## Workflow

1. **Document Classification**
   - Identify contract type (M&A, employment, NDA, etc.)
   - Determine governing law and jurisdiction

2. **Key Clause Extraction**
   - Payment terms and milestones
   - Termination provisions
   - Indemnification and liability limits
   - Intellectual property rights
   - Confidentiality obligations

3. **Risk Analysis**
   - Unusual or one-sided provisions
   - Missing standard protections
   - Ambiguous language
   - Compliance issues

4. **Recommendations**
   - Suggested revisions
   - Negotiation priorities
   - Red flags requiring immediate attention

## Tools Used
- citation-validator
- redline-generator
- jurisdiction-checker

## Output Format
- Executive summary
- Clause-by-clause analysis
- Risk matrix
- Redline markup`,
    },
    {
      id: 'precedent-research',
      name: 'Precedent Research',
      description: 'Find and analyze relevant case law with citation validation',
      category: 'Legal Research',
      content: `---
name: Precedent Research
description: Research case law, extract holdings, validate citations
version: 1.0.0
---

# Precedent Research Skill

## Workflow

1. **Query Formulation**
   - Identify key legal issues
   - Determine relevant jurisdiction
   - Set date range filters

2. **Case Search**
   - Search legal databases
   - Filter by relevance and authority
   - Validate citations

3. **Case Analysis**
   - Extract holding and reasoning
   - Identify distinguishing facts
   - Note subsequent treatment

4. **Synthesis**
   - Organize by theme
   - Identify trends
   - Recommend strongest arguments

## Tools Used
- citation-validator
- case-law-search

## Output Format
- Case summaries
- Citation table
- Precedent analysis memo`,
    },
  ],
  tools: [
    {
      id: 'citation-validator',
      name: 'Citation Validator',
      description: 'Verify legal citations and check current status',
      category: 'Legal Research',
      content: `---
name: Citation Validator
description: Validate legal citations and check if cases are still good law
version: 1.0.0
runtime: python
---

def validate_citation(citation: str) -> dict:
    """
    Validate a legal citation and check its current status.

    Args:
        citation: Legal citation (e.g., "410 U.S. 113")

    Returns:
        dict with validation results
    """
    # TODO: Integrate with legal citation API
    return {
        "valid": True,
        "full_citation": citation,
        "status": "good_law",
        "subsequent_history": []
    }`,
    },
  ],
  agents: [
    {
      id: 'contract-analyzer',
      name: 'Contract Analyzer',
      description: 'Autonomous contract analysis with clause extraction and risk identification',
      category: 'Legal Analysis',
      content: `---
name: Contract Analyzer
description: Autonomous agent for comprehensive contract analysis
version: 1.0.0
---

# Contract Analyzer Agent

## Capabilities
- Clause extraction and classification
- Risk identification
- Compliance checking
- Redline generation

## Workflow
1. Parse contract structure
2. Extract key provisions
3. Identify risks and missing clauses
4. Generate analysis report

## Tools
- citation-validator
- redline-generator

## Communication
Can delegate to research-agent for case law lookup`,
    },
  ],
};

/**
 * Financial Services Templates
 */
const financialTemplates: IndustryTemplates = {
  skills: [
    {
      id: 'dcf-analysis',
      name: 'DCF Valuation',
      description: 'Discounted cash flow valuation with WACC and sensitivity analysis',
      category: 'Valuation',
      content: `---
name: DCF Analysis
description: Complete discounted cash flow valuation workflow
version: 1.0.0
---

# DCF Valuation Skill

## Workflow

1. **Historical Analysis**
   - Gather 5 years of financials
   - Calculate growth rates
   - Analyze margins and efficiency

2. **Projection Model**
   - Revenue projections (5 years)
   - Operating expense assumptions
   - Working capital changes
   - Capital expenditures

3. **WACC Calculation**
   - Cost of equity (CAPM)
   - Cost of debt (after-tax)
   - Capital structure weighting

4. **Valuation**
   - Discount free cash flows
   - Calculate terminal value
   - Compute enterprise and equity value

5. **Sensitivity Analysis**
   - Growth rate scenarios
   - WACC variations
   - Terminal multiple ranges

## Tools Used
- financial-calculator
- data-fetcher
- sensitivity-analyzer

## Output Format
- Valuation summary
- Financial model (spreadsheet)
- Sensitivity tables
- Investment memo`,
    },
  ],
  tools: [
    {
      id: 'financial-calculator',
      name: 'Financial Calculator',
      description: 'NPV, IRR, WACC, and other financial calculations',
      category: 'Analytics',
      content: `---
name: Financial Calculator
description: Core financial calculations for valuation and analysis
version: 1.0.0
runtime: python
---

def calculate_npv(cash_flows: list, discount_rate: float) -> float:
    """Calculate Net Present Value"""
    npv = 0
    for t, cf in enumerate(cash_flows):
        npv += cf / (1 + discount_rate) ** t
    return npv

def calculate_wacc(cost_of_equity: float, cost_of_debt: float,
                   equity_weight: float, debt_weight: float,
                   tax_rate: float) -> float:
    """Calculate Weighted Average Cost of Capital"""
    return (equity_weight * cost_of_equity +
            debt_weight * cost_of_debt * (1 - tax_rate))`,
    },
  ],
  agents: [
    {
      id: 'equity-analyst',
      name: 'Equity Analyst',
      description: 'Autonomous equity research with valuation and recommendations',
      category: 'Investment Analysis',
      content: `---
name: Equity Analyst
description: AI equity analyst for company research and valuation
version: 1.0.0
---

# Equity Analyst Agent

## Capabilities
- Financial statement analysis
- Valuation modeling (DCF, comps)
- Industry research
- Investment thesis development

## Workflow
1. Gather company financials
2. Analyze business model and competitive position
3. Build valuation model
4. Develop investment recommendation

## Tools
- financial-calculator
- data-fetcher
- sensitivity-analyzer`,
    },
  ],
};

/**
 * Biology Research Templates
 */
const biologyTemplates: IndustryTemplates = {
  skills: [
    {
      id: 'protocol-design',
      name: 'Experimental Protocol Design',
      description: 'Design rigorous experimental protocols with controls and validation',
      category: 'Experimental Design',
      content: `---
name: Protocol Design
description: Design experiments with proper controls, variables, and validation
version: 1.0.0
---

# Experimental Protocol Design Skill

## Workflow

1. **Hypothesis Definition**
   - State testable hypothesis
   - Define independent/dependent variables
   - Identify potential confounds

2. **Experimental Design**
   - Choose experimental model
   - Design control groups
   - Determine sample size
   - Establish replication strategy

3. **Protocol Development**
   - Detailed step-by-step procedure
   - Material and reagent lists
   - Equipment requirements
   - Safety considerations

4. **Validation Plan**
   - Positive/negative controls
   - Quality control checkpoints
   - Expected results
   - Statistical analysis plan

## Tools Used
- stats-calculator
- plot-generator

## Output Format
- Complete protocol document
- Materials list
- Timeline
- Analysis plan`,
    },
  ],
  tools: [
    {
      id: 'sequence-aligner',
      name: 'Sequence Aligner',
      description: 'Multiple sequence alignment using BLAST/Clustal algorithms',
      category: 'Bioinformatics',
      content: `---
name: Sequence Aligner
description: Align DNA/protein sequences and identify conserved regions
version: 1.0.0
runtime: python
---

def align_sequences(sequences: list, algorithm: str = "clustal") -> dict:
    """
    Perform multiple sequence alignment.

    Args:
        sequences: List of sequences to align
        algorithm: "blast" or "clustal"

    Returns:
        dict with alignment results
    """
    # TODO: Integrate with BioPython
    return {
        "alignment": [],
        "conserved_regions": [],
        "similarity_score": 0.0
    }`,
    },
  ],
  agents: [
    {
      id: 'research-assistant',
      name: 'Research Assistant',
      description: 'AI assistant for protocol design and literature search',
      category: 'Research Support',
      content: `---
name: Research Assistant
description: Help design experiments and search literature
version: 1.0.0
---

# Research Assistant Agent

## Capabilities
- Protocol design and optimization
- Literature search and synthesis
- Experimental troubleshooting
- Data analysis guidance

## Workflow
1. Understand research question
2. Design experimental approach
3. Search relevant literature
4. Generate detailed protocol

## Tools
- sequence-aligner
- stats-calculator`,
    },
  ],
};

/**
 * Robotics & Control Templates
 */
const roboticsTemplates: IndustryTemplates = {
  skills: [
    {
      id: 'pid-tuning',
      name: 'PID Controller Tuning',
      description: 'Systematic PID parameter optimization with simulation validation',
      category: 'Control Systems',
      content: `---
name: PID Controller Tuning
description: Tune PID controllers using Ziegler-Nichols and other methods
version: 1.0.0
---

# PID Controller Tuning Skill

## Workflow

1. **System Identification**
   - Measure step response
   - Identify system dynamics
   - Determine system type (1st order, 2nd order, etc.)

2. **Initial Parameter Selection**
   - Apply Ziegler-Nichols method
   - Or use Cohen-Coon method
   - Set initial Kp, Ki, Kd values

3. **Simulation Testing**
   - Test in simulation environment
   - Evaluate step response
   - Check stability margins

4. **Fine Tuning**
   - Adjust for overshoot/settling time
   - Optimize disturbance rejection
   - Validate robustness

## Tools Used
- pid-tuner
- sim-runner

## Output Format
- Tuned PID parameters
- Performance metrics
- Simulation plots`,
    },
  ],
  tools: [
    {
      id: 'pid-tuner',
      name: 'PID Auto-Tuner',
      description: 'Automatic PID parameter optimization',
      category: 'Control Design',
      content: `---
name: PID Auto-Tuner
description: Automatically tune PID controller parameters
version: 1.0.0
runtime: python
---

def tune_pid(step_response: list, method: str = "ziegler-nichols") -> dict:
    """
    Auto-tune PID controller from step response.

    Args:
        step_response: System step response data
        method: Tuning method to use

    Returns:
        dict with tuned Kp, Ki, Kd parameters
    """
    # TODO: Implement tuning algorithms
    return {
        "Kp": 1.0,
        "Ki": 0.1,
        "Kd": 0.01,
        "method": method
    }`,
    },
  ],
  agents: [
    {
      id: 'control-engineer',
      name: 'Control Engineer',
      description: 'AI control engineer for controller design and tuning',
      category: 'Control Systems',
      content: `---
name: Control Engineer
description: Design and tune control systems
version: 1.0.0
---

# Control Engineer Agent

## Capabilities
- PID controller tuning
- State space control design
- Stability analysis
- Performance optimization

## Workflow
1. Analyze system dynamics
2. Select control strategy
3. Design controller
4. Validate in simulation

## Tools
- pid-tuner
- sim-runner`,
    },
  ],
};

/**
 * Templates by Industry
 */
export const industryTemplates: Record<Industry, IndustryTemplates> = {
  developer: {
    skills: [],
    tools: [],
    agents: [],
  }, // Developer keeps original templates
  legal: legalTemplates,
  financial: financialTemplates,
  consulting: {
    skills: [],
    tools: [],
    agents: [],
  }, // TODO: Add consulting templates
  biology: biologyTemplates,
  robotics: roboticsTemplates,
  audit: {
    skills: [],
    tools: [],
    agents: [],
  }, // TODO: Add audit templates
  general: {
    skills: [],
    tools: [],
    agents: [],
  },
};

/**
 * Get templates for industry
 */
export function getIndustryTemplates(industry: Industry): IndustryTemplates {
  return industryTemplates[industry] || industryTemplates.general;
}

/**
 * Load templates into system volume
 * This would be called after industry selection during onboarding
 */
export async function loadIndustryTemplates(industry: Industry): Promise<void> {
  const templates = getIndustryTemplates(industry);

  // TODO: Integrate with VolumeLoader to write templates to system volume
  // For now, just store in localStorage as a flag
  if (typeof window !== 'undefined') {
    localStorage.setItem(`templates-loaded-${industry}`, 'true');
    localStorage.setItem('templates-loaded-at', new Date().toISOString());
  }

  console.log(`Loaded ${templates.skills.length} skills, ${templates.tools.length} tools, ${templates.agents.length} agents for ${industry}`);
}

/**
 * Check if templates are already loaded
 */
export function areTemplatesLoaded(industry: Industry): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`templates-loaded-${industry}`) === 'true';
}
