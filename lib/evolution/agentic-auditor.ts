/**
 * Agentic Auditor
 *
 * Validates skills and artifacts before promotion in the Knowledge Cascade.
 * Prevents buggy or incomplete code from propagating to Team/System levels.
 *
 * Validation Stages:
 * 1. Structural Validation - Check required sections and format
 * 2. Content Validation - Verify Visual/Motor Cortex completeness
 * 3. Compatibility Validation - Check HAL tools and hardware requirements
 * 4. Safety Validation - Verify safety protocols and constraints
 * 5. Functional Validation - Simulate execution for critical skills
 *
 * Usage:
 * ```typescript
 * const auditor = getAgenticAuditor();
 * const result = await auditor.auditSkill(skill);
 * if (result.approved) {
 *   // Safe to promote
 * } else {
 *   // Block promotion, show issues
 * }
 * ```
 */

import { logger } from '../debug/logger';
import { PhysicalSkill, PhysicalSkillFrontmatter } from '../skills/physical-skill-loader';
import { HAL_TOOL_DEFINITIONS } from '../hal';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AuditCategory = 'structure' | 'content' | 'compatibility' | 'safety' | 'functional' | 'quality';

export interface AuditIssue {
  category: AuditCategory;
  severity: AuditSeverity;
  code: string;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface AuditResult {
  approved: boolean;
  score: number; // 0-100
  skillName: string;
  skillVersion: string;
  auditTimestamp: number;
  issues: AuditIssue[];
  summary: {
    critical: number;
    errors: number;
    warnings: number;
    info: number;
  };
  categories: {
    structure: { passed: boolean; score: number; issues: AuditIssue[] };
    content: { passed: boolean; score: number; issues: AuditIssue[] };
    compatibility: { passed: boolean; score: number; issues: AuditIssue[] };
    safety: { passed: boolean; score: number; issues: AuditIssue[] };
    functional: { passed: boolean; score: number; issues: AuditIssue[] };
    quality: { passed: boolean; score: number; issues: AuditIssue[] };
  };
  recommendations: string[];
  promotionBlocked: boolean;
  blockReason?: string;
}

export interface AuditConfig {
  // Severity thresholds
  blockOnCritical: boolean;
  blockOnError: boolean;
  maxWarningsAllowed: number;

  // Score thresholds for promotion
  minScoreForUserLevel: number;
  minScoreForTeamLevel: number;
  minScoreForSystemLevel: number;

  // Validation toggles
  validateStructure: boolean;
  validateContent: boolean;
  validateCompatibility: boolean;
  validateSafety: boolean;
  validateFunctional: boolean;
  validateQuality: boolean;

  // Functional validation settings
  runSimulation: boolean;
  simulationIterations: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  // Block on critical issues, allow promotion with errors (but warn)
  blockOnCritical: true,
  blockOnError: true,
  maxWarningsAllowed: 10,

  // Score thresholds
  minScoreForUserLevel: 50,
  minScoreForTeamLevel: 70,
  minScoreForSystemLevel: 85,

  // Enable all validations
  validateStructure: true,
  validateContent: true,
  validateCompatibility: true,
  validateSafety: true,
  validateFunctional: true,
  validateQuality: true,

  // Functional validation
  runSimulation: false, // Disabled by default - enable for critical skills
  simulationIterations: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// AGENTIC AUDITOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class AgenticAuditor {
  private config: AuditConfig;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
  }

  /**
   * Audit a physical skill for promotion readiness
   */
  async auditSkill(skill: PhysicalSkill, targetLevel: 'user' | 'team' | 'system' = 'team'): Promise<AuditResult> {
    const startTime = Date.now();
    const issues: AuditIssue[] = [];

    logger.info('evolution', `🔍 Auditing skill: ${skill.frontmatter.name} for ${targetLevel} promotion`);

    // Run validation stages
    const structureResult = this.config.validateStructure
      ? this.validateStructure(skill)
      : { passed: true, score: 100, issues: [] };

    const contentResult = this.config.validateContent
      ? this.validateContent(skill)
      : { passed: true, score: 100, issues: [] };

    const compatibilityResult = this.config.validateCompatibility
      ? this.validateCompatibility(skill)
      : { passed: true, score: 100, issues: [] };

    const safetyResult = this.config.validateSafety
      ? this.validateSafety(skill)
      : { passed: true, score: 100, issues: [] };

    const functionalResult = this.config.validateFunctional
      ? await this.validateFunctional(skill)
      : { passed: true, score: 100, issues: [] };

    const qualityResult = this.config.validateQuality
      ? this.validateQuality(skill)
      : { passed: true, score: 100, issues: [] };

    // Collect all issues
    issues.push(
      ...structureResult.issues,
      ...contentResult.issues,
      ...compatibilityResult.issues,
      ...safetyResult.issues,
      ...functionalResult.issues,
      ...qualityResult.issues
    );

    // Count by severity
    const summary = {
      critical: issues.filter(i => i.severity === 'critical').length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    };

    // Calculate overall score
    const categoryScores = [
      structureResult.score,
      contentResult.score,
      compatibilityResult.score,
      safetyResult.score * 1.5, // Safety weighted higher
      functionalResult.score,
      qualityResult.score * 0.5, // Quality weighted lower
    ];
    const totalWeight = 1 + 1 + 1 + 1.5 + 1 + 0.5;
    const score = Math.round(categoryScores.reduce((a, b) => a + b, 0) / totalWeight);

    // Determine if promotion should be blocked
    let promotionBlocked = false;
    let blockReason: string | undefined;

    if (this.config.blockOnCritical && summary.critical > 0) {
      promotionBlocked = true;
      blockReason = `${summary.critical} critical issue(s) found`;
    } else if (this.config.blockOnError && summary.errors > 0) {
      promotionBlocked = true;
      blockReason = `${summary.errors} error(s) found`;
    } else if (summary.warnings > this.config.maxWarningsAllowed) {
      promotionBlocked = true;
      blockReason = `Too many warnings (${summary.warnings} > ${this.config.maxWarningsAllowed})`;
    }

    // Check score threshold for target level
    const minScore = targetLevel === 'system'
      ? this.config.minScoreForSystemLevel
      : targetLevel === 'team'
        ? this.config.minScoreForTeamLevel
        : this.config.minScoreForUserLevel;

    if (score < minScore) {
      promotionBlocked = true;
      blockReason = `Score ${score} below threshold ${minScore} for ${targetLevel} level`;
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, score, targetLevel);

    const result: AuditResult = {
      approved: !promotionBlocked,
      score,
      skillName: skill.frontmatter.name,
      skillVersion: skill.frontmatter.version,
      auditTimestamp: startTime,
      issues,
      summary,
      categories: {
        structure: structureResult,
        content: contentResult,
        compatibility: compatibilityResult,
        safety: safetyResult,
        functional: functionalResult,
        quality: qualityResult,
      },
      recommendations,
      promotionBlocked,
      blockReason,
    };

    // Log result
    if (promotionBlocked) {
      logger.warn('evolution', `❌ Audit FAILED: ${skill.frontmatter.name}`, {
        score,
        blockReason,
        criticalIssues: summary.critical,
        errors: summary.errors,
      });
    } else {
      logger.success('evolution', `✓ Audit PASSED: ${skill.frontmatter.name}`, {
        score,
        warnings: summary.warnings,
      });
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private validateStructure(skill: PhysicalSkill): { passed: boolean; score: number; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let score = 100;

    // Check frontmatter
    const fm = skill.frontmatter;

    if (!fm.name || fm.name.trim() === '') {
      issues.push({
        category: 'structure',
        severity: 'critical',
        code: 'STRUCT_001',
        message: 'Skill name is missing',
        location: 'frontmatter.name',
        suggestion: 'Add a descriptive name in frontmatter',
      });
      score -= 30;
    }

    if (fm.type !== 'physical_skill') {
      issues.push({
        category: 'structure',
        severity: 'error',
        code: 'STRUCT_002',
        message: `Invalid skill type: ${fm.type}`,
        location: 'frontmatter.type',
        suggestion: 'Set type to "physical_skill"',
      });
      score -= 20;
    }

    if (!fm.version || !/^\d+\.\d+\.\d+$/.test(fm.version)) {
      issues.push({
        category: 'structure',
        severity: 'warning',
        code: 'STRUCT_003',
        message: `Invalid version format: ${fm.version}`,
        location: 'frontmatter.version',
        suggestion: 'Use semantic versioning (e.g., 1.0.0)',
      });
      score -= 5;
    }

    if (!fm.base_model) {
      issues.push({
        category: 'structure',
        severity: 'warning',
        code: 'STRUCT_004',
        message: 'Base model not specified',
        location: 'frontmatter.base_model',
        suggestion: 'Specify base_model (e.g., gemini-2.0-flash)',
      });
      score -= 5;
    }

    // Check core sections
    if (!skill.role || skill.role.trim() === '') {
      issues.push({
        category: 'structure',
        severity: 'error',
        code: 'STRUCT_010',
        message: 'Role section is missing or empty',
        suggestion: 'Define the skill\'s role and persona',
      });
      score -= 15;
    }

    if (!skill.objective || skill.objective.trim() === '') {
      issues.push({
        category: 'structure',
        severity: 'error',
        code: 'STRUCT_011',
        message: 'Objective section is missing or empty',
        suggestion: 'Define the primary objective',
      });
      score -= 15;
    }

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private validateContent(skill: PhysicalSkill): { passed: boolean; score: number; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let score = 100;

    // Visual Cortex validation
    const vc = skill.visualCortex;
    if (!vc) {
      issues.push({
        category: 'content',
        severity: 'error',
        code: 'CONTENT_001',
        message: 'Visual Cortex section is missing',
        suggestion: 'Add Visual Cortex with primaryTargets and investigationTriggers',
      });
      score -= 25;
    } else {
      if (!vc.primaryTargets || vc.primaryTargets.length === 0) {
        issues.push({
          category: 'content',
          severity: 'warning',
          code: 'CONTENT_002',
          message: 'No primary targets defined in Visual Cortex',
          location: 'visualCortex.primaryTargets',
          suggestion: 'Define what the robot should look for',
        });
        score -= 10;
      }

      if (!vc.alertConditions || vc.alertConditions.length === 0) {
        issues.push({
          category: 'content',
          severity: 'warning',
          code: 'CONTENT_003',
          message: 'No alert conditions defined',
          location: 'visualCortex.alertConditions',
          suggestion: 'Define emergency conditions that require immediate attention',
        });
        score -= 5;
      }
    }

    // Motor Cortex validation
    const mc = skill.motorCortex;
    if (!mc) {
      issues.push({
        category: 'content',
        severity: 'error',
        code: 'CONTENT_010',
        message: 'Motor Cortex section is missing',
        suggestion: 'Add Motor Cortex with availableTools and protocols',
      });
      score -= 25;
    } else {
      if (!mc.availableTools || mc.availableTools.length === 0) {
        issues.push({
          category: 'content',
          severity: 'error',
          code: 'CONTENT_011',
          message: 'No available tools defined in Motor Cortex',
          location: 'motorCortex.availableTools',
          suggestion: 'Define HAL tools the skill can use',
        });
        score -= 15;
      }

      if (!mc.protocols || mc.protocols.length === 0) {
        issues.push({
          category: 'content',
          severity: 'warning',
          code: 'CONTENT_012',
          message: 'No movement protocols defined',
          location: 'motorCortex.protocols',
          suggestion: 'Define how the robot should move in different situations',
        });
        score -= 10;
      }
    }

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPATIBILITY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private validateCompatibility(skill: PhysicalSkill): { passed: boolean; score: number; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let score = 100;

    // Check if all referenced HAL tools exist
    const mc = skill.motorCortex;
    if (mc?.availableTools) {
      const halToolNames = HAL_TOOL_DEFINITIONS.map(t => t.name);

      for (const tool of mc.availableTools) {
        // Normalize tool name (handle both 'drive' and 'hal_drive' formats)
        const normalizedTool = tool.startsWith('hal_') ? tool : `hal_${tool}`;
        const simpleTool = tool.replace(/^hal_/, '');

        const exists = halToolNames.includes(tool) ||
          halToolNames.includes(normalizedTool) ||
          halToolNames.includes(simpleTool);

        if (!exists) {
          issues.push({
            category: 'compatibility',
            severity: 'error',
            code: 'COMPAT_001',
            message: `Unknown HAL tool: ${tool}`,
            location: 'motorCortex.availableTools',
            suggestion: `Available tools: ${halToolNames.join(', ')}`,
          });
          score -= 10;
        }
      }
    }

    // Check hardware requirements
    const fm = skill.frontmatter;
    if (fm.required_capabilities) {
      const validCapabilities = ['camera', 'locomotion', 'distance_sensors', 'line_sensors', 'led', 'communication'];

      for (const cap of fm.required_capabilities) {
        if (!validCapabilities.includes(cap)) {
          issues.push({
            category: 'compatibility',
            severity: 'warning',
            code: 'COMPAT_002',
            message: `Unknown capability requirement: ${cap}`,
            location: 'frontmatter.required_capabilities',
            suggestion: `Valid capabilities: ${validCapabilities.join(', ')}`,
          });
          score -= 5;
        }
      }
    }

    // Check hardware profile
    if (fm.hardware_profile) {
      const validProfiles = ['standard_robot_v1', 'advanced_robot_v1', 'minimal_robot'];
      if (!validProfiles.includes(fm.hardware_profile)) {
        issues.push({
          category: 'compatibility',
          severity: 'info',
          code: 'COMPAT_003',
          message: `Non-standard hardware profile: ${fm.hardware_profile}`,
          location: 'frontmatter.hardware_profile',
        });
      }
    }

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private validateSafety(skill: PhysicalSkill): { passed: boolean; score: number; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let score = 100;

    // Check safety protocols
    if (!skill.safetyProtocols || skill.safetyProtocols.length === 0) {
      issues.push({
        category: 'safety',
        severity: 'critical',
        code: 'SAFETY_001',
        message: 'No safety protocols defined',
        suggestion: 'Add safety protocols for emergency handling',
      });
      score -= 40;
    } else {
      // Check for essential safety protocols
      const hasEmergencyStop = skill.safetyProtocols.some(p =>
        p.toLowerCase().includes('emergency') || p.toLowerCase().includes('stop')
      );
      const hasCollisionHandling = skill.safetyProtocols.some(p =>
        p.toLowerCase().includes('collision') || p.toLowerCase().includes('obstacle')
      );
      const hasConfidenceThreshold = skill.safetyProtocols.some(p =>
        p.toLowerCase().includes('confidence') || p.toLowerCase().includes('uncertainty')
      );

      if (!hasEmergencyStop) {
        issues.push({
          category: 'safety',
          severity: 'error',
          code: 'SAFETY_002',
          message: 'No emergency stop protocol defined',
          suggestion: 'Add a protocol for emergency stopping',
        });
        score -= 20;
      }

      if (!hasCollisionHandling) {
        issues.push({
          category: 'safety',
          severity: 'warning',
          code: 'SAFETY_003',
          message: 'No collision handling protocol defined',
          suggestion: 'Add a protocol for obstacle detection and avoidance',
        });
        score -= 10;
      }

      if (!hasConfidenceThreshold) {
        issues.push({
          category: 'safety',
          severity: 'info',
          code: 'SAFETY_004',
          message: 'No confidence threshold handling defined',
          suggestion: 'Add protocol for handling low-confidence situations',
        });
        score -= 5;
      }
    }

    // Check Motor Cortex safety limits
    const mc = skill.motorCortex;
    if (mc?.safetyLimits) {
      if (mc.safetyLimits.maxSpeed !== undefined && mc.safetyLimits.maxSpeed > 100) {
        issues.push({
          category: 'safety',
          severity: 'warning',
          code: 'SAFETY_010',
          message: `Max speed ${mc.safetyLimits.maxSpeed} exceeds safe limit (100)`,
          location: 'motorCortex.safetyLimits.maxSpeed',
          suggestion: 'Consider reducing max speed for safer operation',
        });
        score -= 10;
      }

      if (!mc.safetyLimits.emergencyStopConditions || mc.safetyLimits.emergencyStopConditions.length === 0) {
        issues.push({
          category: 'safety',
          severity: 'warning',
          code: 'SAFETY_011',
          message: 'No emergency stop conditions defined in Motor Cortex',
          location: 'motorCortex.safetyLimits.emergencyStopConditions',
          suggestion: 'Define conditions that trigger emergency stop',
        });
        score -= 10;
      }
    } else {
      issues.push({
        category: 'safety',
        severity: 'warning',
        code: 'SAFETY_012',
        message: 'No safety limits defined in Motor Cortex',
        suggestion: 'Add safetyLimits with maxSpeed, minConfidence, and emergencyStopConditions',
      });
      score -= 15;
    }

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNCTIONAL VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private async validateFunctional(skill: PhysicalSkill): Promise<{ passed: boolean; score: number; issues: AuditIssue[] }> {
    const issues: AuditIssue[] = [];
    let score = 100;

    // Check if Gemini prompt can be compiled
    if (!skill.geminiPrompt && !skill.rawContent) {
      issues.push({
        category: 'functional',
        severity: 'error',
        code: 'FUNC_001',
        message: 'Cannot compile Gemini prompt - no content available',
        suggestion: 'Ensure skill has valid rawContent or geminiPrompt',
      });
      score -= 30;
    }

    // Check for common prompt issues
    if (skill.geminiPrompt || skill.rawContent) {
      const content = skill.geminiPrompt || skill.rawContent;

      // Check for placeholder text
      if (content.includes('[TODO]') || content.includes('[PLACEHOLDER]')) {
        issues.push({
          category: 'functional',
          severity: 'error',
          code: 'FUNC_002',
          message: 'Skill contains unresolved placeholder text',
          suggestion: 'Replace all [TODO] and [PLACEHOLDER] markers with actual content',
        });
        score -= 20;
      }

      // Check for empty sections
      const emptyPatterns = [
        /## [A-Z][^#]*\n\s*\n(?=##|$)/,
        /### [A-Z][^#]*\n\s*\n(?=###|##|$)/,
      ];

      for (const pattern of emptyPatterns) {
        if (pattern.test(content)) {
          issues.push({
            category: 'functional',
            severity: 'warning',
            code: 'FUNC_003',
            message: 'Skill contains empty sections',
            suggestion: 'Fill in all sections with relevant content',
          });
          score -= 10;
          break;
        }
      }

      // Check prompt length
      if (content.length < 500) {
        issues.push({
          category: 'functional',
          severity: 'warning',
          code: 'FUNC_004',
          message: 'Skill content is very short - may lack detail',
          suggestion: 'Add more detailed instructions and context',
        });
        score -= 10;
      }
    }

    // Simulation testing (if enabled)
    if (this.config.runSimulation) {
      // TODO: Implement actual simulation testing
      // This would run the skill in a sandbox environment
      issues.push({
        category: 'functional',
        severity: 'info',
        code: 'FUNC_010',
        message: 'Simulation testing not yet implemented',
      });
    }

    return {
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'error').length === 0,
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  private validateQuality(skill: PhysicalSkill): { passed: boolean; score: number; issues: AuditIssue[] } {
    const issues: AuditIssue[] = [];
    let score = 100;

    const fm = skill.frontmatter;

    // Check for author
    if (!fm.author) {
      issues.push({
        category: 'quality',
        severity: 'info',
        code: 'QUAL_001',
        message: 'No author specified',
        location: 'frontmatter.author',
        suggestion: 'Add author for attribution',
      });
      score -= 5;
    }

    // Check for license
    if (!fm.license) {
      issues.push({
        category: 'quality',
        severity: 'info',
        code: 'QUAL_002',
        message: 'No license specified',
        location: 'frontmatter.license',
        suggestion: 'Add license for clarity on usage rights',
      });
      score -= 5;
    }

    // Check for updated_at
    if (!fm.updated_at) {
      issues.push({
        category: 'quality',
        severity: 'info',
        code: 'QUAL_003',
        message: 'No last updated date',
        location: 'frontmatter.updated_at',
        suggestion: 'Add updated_at timestamp',
      });
      score -= 5;
    }

    // Check evolution history
    if (!skill.evolutionHistory || skill.evolutionHistory.length === 0) {
      issues.push({
        category: 'quality',
        severity: 'info',
        code: 'QUAL_010',
        message: 'No evolution history recorded',
        suggestion: 'Add evolution history for version tracking',
      });
      score -= 5;
    }

    // Check context completeness
    if (!skill.context || skill.context.length < 100) {
      issues.push({
        category: 'quality',
        severity: 'info',
        code: 'QUAL_011',
        message: 'Context section is brief or missing',
        suggestion: 'Add detailed behavioral context',
      });
      score -= 5;
    }

    return {
      passed: true, // Quality issues don't block promotion
      score: Math.max(0, score),
      issues,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private generateRecommendations(issues: AuditIssue[], score: number, targetLevel: string): string[] {
    const recommendations: string[] = [];

    // Critical issues
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      recommendations.push(`Fix ${criticalIssues.length} critical issue(s) before promotion`);
      for (const issue of criticalIssues) {
        if (issue.suggestion) {
          recommendations.push(`  - ${issue.code}: ${issue.suggestion}`);
        }
      }
    }

    // Safety issues
    const safetyIssues = issues.filter(i => i.category === 'safety' && i.severity !== 'info');
    if (safetyIssues.length > 0) {
      recommendations.push('Address safety concerns:');
      for (const issue of safetyIssues) {
        recommendations.push(`  - ${issue.message}`);
      }
    }

    // Score-based recommendations
    if (score < 50) {
      recommendations.push('Skill needs significant improvements before any promotion');
    } else if (score < 70) {
      recommendations.push('Skill is ready for user-level use but needs work for team promotion');
    } else if (score < 85) {
      recommendations.push('Skill is ready for team-level promotion');
    } else {
      recommendations.push('Skill is ready for system-level promotion');
    }

    // Target level specific
    if (targetLevel === 'system' && score < 85) {
      recommendations.push(`Score must be ≥85 for system promotion (current: ${score})`);
    } else if (targetLevel === 'team' && score < 70) {
      recommendations.push(`Score must be ≥70 for team promotion (current: ${score})`);
    }

    return recommendations;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AuditConfig {
    return { ...this.config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let auditorInstance: AgenticAuditor | null = null;

export function getAgenticAuditor(config?: Partial<AuditConfig>): AgenticAuditor {
  if (!auditorInstance) {
    auditorInstance = new AgenticAuditor(config);
  } else if (config) {
    auditorInstance.updateConfig(config);
  }
  return auditorInstance;
}

export function createAgenticAuditor(config?: Partial<AuditConfig>): AgenticAuditor {
  return new AgenticAuditor(config);
}
