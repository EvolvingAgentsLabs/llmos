/**
 * Physical Skill Loader
 *
 * Loads and manages "Skill Cartridges" - markdown files that define
 * robot behaviors for physical AI agents. This is the "App Store" model
 * for robotics: download a skill, robot learns new abilities.
 *
 * A Physical Skill includes:
 * - Role/Persona definition
 * - Visual Cortex instructions (what to see, when to investigate)
 * - Motor Cortex protocols (how to move, safety limits)
 * - Evolution history (learned improvements)
 * - Hardware requirements
 *
 * Usage:
 * ```typescript
 * const loader = getPhysicalSkillLoader();
 *
 * // Load a skill
 * const skill = await loader.loadSkill('skills/gardener.md');
 *
 * // Get Gemini-ready prompt
 * const prompt = loader.getGeminiPrompt(skill);
 *
 * // Hot-swap skills based on context
 * const newSkill = await loader.switchSkillByContext('I see plants that need water');
 * ```
 */

import { logger } from '@/lib/debug/logger';
import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

/**
 * Physical skill frontmatter (YAML header)
 */
export interface PhysicalSkillFrontmatter {
  name: string;
  type: 'physical_skill';
  base_model: string;
  agentic_vision?: boolean;
  version: string;
  hardware_profile?: string;
  required_capabilities?: string[];
  optional_capabilities?: string[];
  author?: string;
  license?: string;
  updated_at?: string;
}

/**
 * Visual Cortex configuration (what to see)
 */
export interface VisualCortex {
  /** Objects to actively scan for */
  primaryTargets: Array<{
    name: string;
    description: string;
    attributes?: string[];
  }>;
  /** When to use code execution for deeper analysis */
  investigationTriggers: Array<{
    condition: string;
    action: string;
    detail?: string;
  }>;
  /** Objects to ignore */
  ignoreList: string[];
  /** Special cases requiring immediate action */
  alertConditions: Array<{
    condition: string;
    action: string;
    severity?: 'info' | 'warning' | 'critical';
  }>;
}

/**
 * Motor Cortex configuration (how to move)
 */
export interface MotorCortex {
  /** Available HAL tools for this skill */
  availableTools: string[];
  /** Movement protocols and constraints */
  protocols: Array<{
    name: string;
    description: string;
    constraints?: string[];
  }>;
  /** LED status codes for this skill */
  ledCodes?: Array<{
    state: string;
    color: { r: number; g: number; b: number };
    pattern?: 'solid' | 'blink' | 'pulse';
  }>;
  /** Safety limits */
  safetyLimits?: {
    maxSpeed?: number;
    minConfidence?: number;
    emergencyStopConditions?: string[];
  };
}

/**
 * Evolution history entry
 */
export interface EvolutionEntry {
  version: string;
  date?: string;
  description: string;
  source?: 'dreaming' | 'field' | 'manual';
}

/**
 * Complete parsed physical skill
 */
export interface PhysicalSkill {
  /** Skill metadata */
  frontmatter: PhysicalSkillFrontmatter;
  /** File path */
  path: string;
  /** Role/persona definition */
  role: string;
  /** Primary objective */
  objective: string;
  /** Behavioral context */
  context: string;
  /** Visual Cortex configuration */
  visualCortex: VisualCortex;
  /** Motor Cortex configuration */
  motorCortex: MotorCortex;
  /** Safety protocols */
  safetyProtocols: string[];
  /** Evolution history */
  evolutionHistory: EvolutionEntry[];
  /** Raw markdown content */
  rawContent: string;
  /** Compiled Gemini prompt */
  geminiPrompt?: string;
}

/**
 * Context detection result for skill switching
 */
export interface ContextDetection {
  detectedIntent: string;
  confidence: number;
  suggestedSkills: Array<{
    name: string;
    path: string;
    matchScore: number;
  }>;
}

/**
 * Physical Skill Loader
 *
 * Manages loading, parsing, and hot-swapping of physical skill cartridges.
 */
export class PhysicalSkillLoader {
  private fs: FileSystemStorage;
  private skillCache: Map<string, PhysicalSkill> = new Map();
  private activeSkill: PhysicalSkill | null = null;
  private skillIndex: Map<string, string[]> = new Map(); // keyword -> paths

  constructor(fs?: FileSystemStorage) {
    this.fs = fs || getFileSystem();
  }

  /**
   * Load a physical skill from path
   */
  async loadSkill(path: string): Promise<Result<PhysicalSkill, AppError>> {
    // Check cache
    if (this.skillCache.has(path)) {
      return ok(this.skillCache.get(path)!);
    }

    try {
      const contentResult = await this.fs.read(path);
      if (!contentResult.ok) {
        return contentResult as Result<PhysicalSkill, AppError>;
      }
      if (!contentResult.value) {
        return err(appError(ErrorCodes.NOT_FOUND, `Skill not found: ${path}`));
      }

      const skill = this.parsePhysicalSkill(path, contentResult.value);
      if (!skill) {
        return err(appError(ErrorCodes.INVALID_INPUT, `Failed to parse skill: ${path}`));
      }

      // Compile Gemini prompt
      skill.geminiPrompt = this.compileGeminiPrompt(skill);

      // Cache the skill
      this.skillCache.set(path, skill);

      // Index keywords
      this.indexSkill(skill);

      logger.success('skills', `Loaded physical skill: ${skill.frontmatter.name}`, {
        version: skill.frontmatter.version,
        agenticVision: skill.frontmatter.agentic_vision,
      });

      return ok(skill);
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to load skill', error));
    }
  }

  /**
   * Load all physical skills from a directory
   */
  async loadSkillsFromDirectory(directory: string = 'skills'): Promise<Result<PhysicalSkill[], AppError>> {
    const skills: PhysicalSkill[] = [];

    try {
      const patterns = [
        `${directory}/**/*.md`,
        `volumes/system/skills/**/*.md`,
        `volumes/user/skills/**/*.md`,
      ];

      for (const pattern of patterns) {
        const filesResult = await this.fs.glob(pattern);
        if (!filesResult.ok) continue;

        for (const path of filesResult.value) {
          if (path.endsWith('.gitkeep')) continue;

          const skillResult = await this.loadSkill(path);
          if (skillResult.ok && this.isPhysicalSkill(skillResult.value)) {
            skills.push(skillResult.value);
          }
        }
      }

      return ok(skills);
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to load skills directory', error));
    }
  }

  /**
   * Check if a skill is a physical skill (vs general skill)
   */
  private isPhysicalSkill(skill: PhysicalSkill): boolean {
    return skill.frontmatter.type === 'physical_skill';
  }

  /**
   * Set the active skill
   */
  setActiveSkill(skill: PhysicalSkill): void {
    const previousSkill = this.activeSkill;
    this.activeSkill = skill;

    logger.info('skills', 'Skill switched', {
      from: previousSkill?.frontmatter.name,
      to: skill.frontmatter.name,
    });
  }

  /**
   * Get the active skill
   */
  getActiveSkill(): PhysicalSkill | null {
    return this.activeSkill;
  }

  /**
   * Switch skill based on detected context
   */
  async switchSkillByContext(context: string): Promise<Result<PhysicalSkill | null, AppError>> {
    const detection = this.detectContext(context);

    if (detection.suggestedSkills.length === 0) {
      return ok(null);
    }

    // Load the best matching skill
    const bestMatch = detection.suggestedSkills[0];
    const skillResult = await this.loadSkill(bestMatch.path);

    if (skillResult.ok) {
      this.setActiveSkill(skillResult.value);
    }

    return skillResult;
  }

  /**
   * Detect context and suggest skills
   */
  detectContext(context: string): ContextDetection {
    const contextLower = context.toLowerCase();
    const matches: Array<{ name: string; path: string; matchScore: number }> = [];

    // Check keyword index
    for (const [keyword, paths] of this.skillIndex.entries()) {
      if (contextLower.includes(keyword.toLowerCase())) {
        for (const path of paths) {
          const skill = this.skillCache.get(path);
          if (skill) {
            const existing = matches.find((m) => m.path === path);
            if (existing) {
              existing.matchScore += 1;
            } else {
              matches.push({
                name: skill.frontmatter.name,
                path,
                matchScore: 1,
              });
            }
          }
        }
      }
    }

    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    // Determine detected intent
    let detectedIntent = 'unknown';
    if (contextLower.includes('plant') || contextLower.includes('water') || contextLower.includes('garden')) {
      detectedIntent = 'plant_care';
    } else if (contextLower.includes('sort') || contextLower.includes('organize') || contextLower.includes('pick')) {
      detectedIntent = 'sorting';
    } else if (contextLower.includes('inspect') || contextLower.includes('check') || contextLower.includes('quality')) {
      detectedIntent = 'inspection';
    } else if (contextLower.includes('navigate') || contextLower.includes('explore') || contextLower.includes('map')) {
      detectedIntent = 'navigation';
    }

    return {
      detectedIntent,
      confidence: matches.length > 0 ? Math.min(1, matches[0].matchScore / 5) : 0,
      suggestedSkills: matches.slice(0, 3),
    };
  }

  /**
   * Get Gemini-ready prompt for a skill
   */
  getGeminiPrompt(skill: PhysicalSkill): string {
    return skill.geminiPrompt || this.compileGeminiPrompt(skill);
  }

  /**
   * Get Visual Cortex prompt section
   */
  getVisualCortexPrompt(skill: PhysicalSkill): string {
    const vc = skill.visualCortex;

    let prompt = '# Visual Cortex Instructions\n\n';

    prompt += '## Primary Targets\nObjects to actively scan for:\n';
    for (const target of vc.primaryTargets) {
      prompt += `- \`${target.name}\`: ${target.description}`;
      if (target.attributes) {
        prompt += ` (check: ${target.attributes.join(', ')})`;
      }
      prompt += '\n';
    }

    prompt += '\n## Investigation Triggers\nWhen to use code execution for deeper analysis:\n';
    for (const trigger of vc.investigationTriggers) {
      prompt += `- **${trigger.condition}**: ${trigger.action}`;
      if (trigger.detail) {
        prompt += ` (${trigger.detail})`;
      }
      prompt += '\n';
    }

    prompt += '\n## Ignore List\nObjects to exclude from analysis:\n';
    for (const item of vc.ignoreList) {
      prompt += `- ${item}\n`;
    }

    prompt += '\n## Alert Conditions\nSpecial cases requiring immediate action:\n';
    for (const alert of vc.alertConditions) {
      const severity = alert.severity || 'info';
      prompt += `- \`${alert.condition}\` → [${severity.toUpperCase()}] ${alert.action}\n`;
    }

    return prompt;
  }

  /**
   * Get Motor Cortex prompt section
   */
  getMotorCortexPrompt(skill: PhysicalSkill): string {
    const mc = skill.motorCortex;

    let prompt = '# Motor Cortex Protocols\n\n';

    prompt += '## Available HAL Tools\n';
    for (const tool of mc.availableTools) {
      prompt += `- \`${tool}\`\n`;
    }

    prompt += '\n## Movement Protocols\n';
    for (const protocol of mc.protocols) {
      prompt += `### ${protocol.name}\n${protocol.description}\n`;
      if (protocol.constraints) {
        prompt += 'Constraints:\n';
        for (const constraint of protocol.constraints) {
          prompt += `- ${constraint}\n`;
        }
      }
      prompt += '\n';
    }

    if (mc.ledCodes && mc.ledCodes.length > 0) {
      prompt += '## LED Status Codes\n';
      for (const led of mc.ledCodes) {
        prompt += `- ${led.state}: RGB(${led.color.r}, ${led.color.g}, ${led.color.b})`;
        if (led.pattern) {
          prompt += ` [${led.pattern}]`;
        }
        prompt += '\n';
      }
    }

    if (mc.safetyLimits) {
      prompt += '\n## Safety Limits\n';
      if (mc.safetyLimits.maxSpeed !== undefined) {
        prompt += `- Max speed: ${mc.safetyLimits.maxSpeed}%\n`;
      }
      if (mc.safetyLimits.minConfidence !== undefined) {
        prompt += `- Min confidence for action: ${mc.safetyLimits.minConfidence * 100}%\n`;
      }
      if (mc.safetyLimits.emergencyStopConditions) {
        prompt += '- Emergency stop conditions:\n';
        for (const condition of mc.safetyLimits.emergencyStopConditions) {
          prompt += `  - ${condition}\n`;
        }
      }
    }

    return prompt;
  }

  /**
   * Parse physical skill from markdown content
   */
  private parsePhysicalSkill(path: string, content: string): PhysicalSkill | null {
    try {
      const { frontmatter, body } = this.parseFrontmatter(content);

      // Validate this is a physical skill
      if (frontmatter.type !== 'physical_skill') {
        return null;
      }

      // Parse sections from body
      const sections = this.parseSections(body);

      return {
        frontmatter: frontmatter as unknown as PhysicalSkillFrontmatter,
        path,
        role: sections.role || '',
        objective: sections.objective || '',
        context: sections.context || '',
        visualCortex: this.parseVisualCortex(sections.visualCortex || ''),
        motorCortex: this.parseMotorCortex(sections.motorCortex || ''),
        safetyProtocols: this.parseSafetyProtocols(sections.safety || ''),
        evolutionHistory: this.parseEvolutionHistory(sections.evolution || ''),
        rawContent: content,
      };
    } catch (error) {
      logger.error('skills', 'Failed to parse skill', { path, error });
      return null;
    }
  }

  /**
   * Parse YAML frontmatter
   */
  private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterStr = match[1];
    const body = match[2];

    const frontmatter: Record<string, unknown> = {};
    const lines = frontmatterStr.split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      let value: unknown = line.slice(colonIdx + 1).trim();

      // Handle arrays
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        value = arrayContent.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
      } else if (typeof value === 'string' && (value.startsWith('"') || value.startsWith("'"))) {
        value = value.slice(1, -1);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (typeof value === 'string' && !isNaN(Number(value))) {
        value = Number(value);
      }

      frontmatter[key] = value;
    }

    return { frontmatter, body };
  }

  /**
   * Parse markdown sections by headers
   */
  private parseSections(body: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const headerPattern = /^#+\s+(.+)$/gm;

    let currentSection = 'intro';
    let currentContent: string[] = [];
    let lastIndex = 0;

    let match;
    while ((match = headerPattern.exec(body)) !== null) {
      // Save previous section
      if (lastIndex > 0 || currentContent.length > 0) {
        sections[currentSection.toLowerCase().replace(/\s+/g, '_')] =
          body.slice(lastIndex, match.index).trim();
      }

      // Start new section
      currentSection = match[1].toLowerCase().replace(/\s+/g, '_');
      lastIndex = match.index + match[0].length;
    }

    // Save last section
    if (lastIndex < body.length) {
      sections[currentSection] = body.slice(lastIndex).trim();
    }

    return sections;
  }

  /**
   * Parse Visual Cortex section
   */
  private parseVisualCortex(content: string): VisualCortex {
    const vc: VisualCortex = {
      primaryTargets: [],
      investigationTriggers: [],
      ignoreList: [],
      alertConditions: [],
    };

    // Parse primary targets
    const targetsMatch = content.match(/Primary Targets[\s\S]*?(?=##|$)/i);
    if (targetsMatch) {
      const lines = targetsMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*`?([^`:]+)`?:?\s*(.*)$/);
        if (match) {
          vc.primaryTargets.push({
            name: match[1].trim(),
            description: match[2].trim(),
          });
        }
      }
    }

    // Parse investigation triggers
    const triggersMatch = content.match(/Investigation Triggers[\s\S]*?(?=##|$)/i);
    if (triggersMatch) {
      const lines = triggersMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*\*\*([^*]+)\*\*:?\s*(.*)$/);
        if (match) {
          vc.investigationTriggers.push({
            condition: match[1].trim(),
            action: match[2].trim(),
          });
        }
      }
    }

    // Parse ignore list
    const ignoreMatch = content.match(/Ignore List[\s\S]*?(?=##|$)/i);
    if (ignoreMatch) {
      const lines = ignoreMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*(.+)$/);
        if (match) {
          vc.ignoreList.push(match[1].trim());
        }
      }
    }

    // Parse alert conditions
    const alertsMatch = content.match(/Alert Conditions[\s\S]*?(?=##|$)/i);
    if (alertsMatch) {
      const lines = alertsMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*`?([^`→]+)`?\s*→\s*(.*)$/);
        if (match) {
          vc.alertConditions.push({
            condition: match[1].trim(),
            action: match[2].trim(),
          });
        }
      }
    }

    return vc;
  }

  /**
   * Parse Motor Cortex section
   */
  private parseMotorCortex(content: string): MotorCortex {
    const mc: MotorCortex = {
      availableTools: [],
      protocols: [],
    };

    // Parse available tools
    const toolsMatch = content.match(/Available.*Tools[\s\S]*?(?=##|$)/i);
    if (toolsMatch) {
      const lines = toolsMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*`?([^`\s]+)`?/);
        if (match) {
          mc.availableTools.push(match[1].trim());
        }
      }
    }

    // Parse protocols
    const protocolsMatch = content.match(/Protocols?[\s\S]*?(?=##|$)/i);
    if (protocolsMatch) {
      const lines = protocolsMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^-\s*(.+)$/);
        if (match) {
          mc.protocols.push({
            name: 'protocol',
            description: match[1].trim(),
          });
        }
      }
    }

    return mc;
  }

  /**
   * Parse safety protocols
   */
  private parseSafetyProtocols(content: string): string[] {
    const protocols: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^-\s*(.+)$/);
      if (match) {
        protocols.push(match[1].trim());
      }
    }

    return protocols;
  }

  /**
   * Parse evolution history
   */
  private parseEvolutionHistory(content: string): EvolutionEntry[] {
    const history: EvolutionEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^-\s*v?([\d.]+):?\s*(.+)$/);
      if (match) {
        history.push({
          version: match[1],
          description: match[2].trim(),
        });
      }
    }

    return history;
  }

  /**
   * Compile complete Gemini prompt from skill
   */
  private compileGeminiPrompt(skill: PhysicalSkill): string {
    const parts: string[] = [];

    // Role and objective
    parts.push(`# Role\n${skill.role}\n`);
    parts.push(`# Objective\n${skill.objective}\n`);

    if (skill.context) {
      parts.push(`# Context\n${skill.context}\n`);
    }

    // Visual Cortex
    parts.push(this.getVisualCortexPrompt(skill));

    // Motor Cortex
    parts.push(this.getMotorCortexPrompt(skill));

    // Safety protocols
    if (skill.safetyProtocols.length > 0) {
      parts.push('# Safety Protocols\n');
      for (const protocol of skill.safetyProtocols) {
        parts.push(`- ${protocol}\n`);
      }
    }

    // Agentic Vision note
    if (skill.frontmatter.agentic_vision) {
      parts.push(`
# Agentic Vision Enabled

You have access to code execution for visual investigation. When confidence is low or details are unclear:
1. Use Python to crop/zoom regions of interest
2. Annotate images with bounding boxes for verification
3. Measure angles, distances, or colors programmatically
4. Verify conclusions with pixel-level evidence before acting
`);
    }

    return parts.join('\n');
  }

  /**
   * Index skill by keywords for fast lookup
   */
  private indexSkill(skill: PhysicalSkill): void {
    const keywords: string[] = [];

    // Extract from name
    keywords.push(...skill.frontmatter.name.toLowerCase().split(/[\s_-]+/));

    // Extract from visual cortex targets
    for (const target of skill.visualCortex.primaryTargets) {
      keywords.push(target.name.toLowerCase());
      keywords.push(...target.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    }

    // Add to index
    for (const keyword of keywords) {
      if (!this.skillIndex.has(keyword)) {
        this.skillIndex.set(keyword, []);
      }
      if (!this.skillIndex.get(keyword)!.includes(skill.path)) {
        this.skillIndex.get(keyword)!.push(skill.path);
      }
    }
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.skillCache.clear();
    this.skillIndex.clear();
  }
}

// Singleton instance
let loaderInstance: PhysicalSkillLoader | null = null;

/**
 * Get the physical skill loader instance
 */
export function getPhysicalSkillLoader(): PhysicalSkillLoader {
  if (!loaderInstance) {
    loaderInstance = new PhysicalSkillLoader();
  }
  return loaderInstance;
}
