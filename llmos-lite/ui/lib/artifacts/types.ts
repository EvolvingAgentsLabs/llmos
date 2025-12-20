/**
 * Unified Artifact Type System
 *
 * All artifacts (agents, tools, skills, workflows, code) follow this unified structure
 */

export type ArtifactType = 'agent' | 'tool' | 'skill' | 'workflow' | 'code';
export type ArtifactVolume = 'system' | 'team' | 'user';
export type ArtifactStatus = 'temporal' | 'committed';

/**
 * Render data types for visual representations
 */
export type RenderType =
  | 'quantum-circuit'
  | '3d-scene'
  | 'plot'
  | 'interactive'
  | 'agent-profile'
  | 'workflow-graph'
  | 'markdown';

export interface RenderData {
  type: RenderType;
  data: any; // Type-specific render data
}

/**
 * Quantum Circuit Render Data
 */
export interface QuantumCircuitRenderData extends RenderData {
  type: 'quantum-circuit';
  data: {
    numQubits: number;
    gates: Array<{
      type: string;
      target: number;
      control?: number;
      time: number;
      params?: number[];
    }>;
    measurements?: number[];
    title?: string;
  };
}

/**
 * 3D Scene Render Data
 */
export interface ThreeSceneRenderData extends RenderData {
  type: '3d-scene';
  data: {
    objects: Array<{
      type: 'sphere' | 'cube' | 'cylinder' | 'custom';
      position: [number, number, number];
      scale: [number, number, number];
      rotation?: [number, number, number];
      color: string;
      wireframe?: boolean;
    }>;
    camera?: {
      position: [number, number, number];
      lookAt: [number, number, number];
    };
    title?: string;
  };
}

/**
 * Plot Render Data
 */
export interface PlotRenderData extends RenderData {
  type: 'plot';
  data: {
    type: 'line' | 'bar' | 'scatter' | 'histogram';
    title?: string;
    data: Array<Record<string, any>>;
    xKey: string;
    yKey: string;
    color?: string;
  };
}

/**
 * Agent Profile Render Data
 */
export interface AgentProfileRenderData extends RenderData {
  type: 'agent-profile';
  data: {
    name: string;
    role: string;
    capabilities: string[];
    model?: string;
    systemPrompt?: string;
    tools?: string[];
  };
}

/**
 * Workflow Graph Render Data
 */
export interface WorkflowGraphRenderData extends RenderData {
  type: 'workflow-graph';
  data: {
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      label?: string;
    }>;
  };
}

/**
 * Core Artifact Interface
 */
export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  volume: ArtifactVolume;
  status: ArtifactStatus;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Session tracking
  createdBy: string; // session ID

  // Content
  codeView?: string; // Source code (for code artifacts and executable artifacts)
  renderView?: RenderData; // Visual representation

  // Metadata
  description?: string;
  tags?: string[];
  dependencies?: string[]; // References to other artifact IDs

  // File info (for GitHub persistence)
  filePath?: string; // Path within volume repo
  commitHash?: string; // Git commit hash when saved

  // Versioning
  version?: string;
  parentId?: string; // For forks
}

/**
 * Artifact Reference (used in messages)
 */
export interface ArtifactReference {
  id: string;
  name: string;
  type: ArtifactType;
  volume: ArtifactVolume;
  version?: string;
}

/**
 * Type-specific artifact interfaces
 */
export interface AgentArtifact extends Artifact {
  type: 'agent';
  codeView: string; // Agent definition/configuration
  renderView: AgentProfileRenderData;
}

export interface ToolArtifact extends Artifact {
  type: 'tool';
  codeView: string; // Tool implementation
  description: string;
}

export interface SkillArtifact extends Artifact {
  type: 'skill';
  codeView: string; // Skill pattern/implementation
  description: string;
  confidence?: number; // For cron-detected patterns
}

export interface WorkflowArtifact extends Artifact {
  type: 'workflow';
  codeView?: string; // Workflow definition (JSON/YAML)
  renderView: WorkflowGraphRenderData;
}

export interface CodeArtifact extends Artifact {
  type: 'code';
  codeView: string; // Source code
  renderView?: QuantumCircuitRenderData | ThreeSceneRenderData | PlotRenderData;
  language?: 'python' | 'javascript' | 'typescript' | 'julia' | 'markdown';
}

/**
 * Artifact creation parameters (omits auto-generated fields)
 */
export type CreateArtifactParams = Omit<
  Artifact,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'commitHash'
> & {
  status?: ArtifactStatus;
};

/**
 * Artifact update parameters
 */
export type UpdateArtifactParams = Partial<
  Omit<Artifact, 'id' | 'createdAt' | 'type'>
>;

/**
 * Artifact filter options
 */
export interface ArtifactFilterOptions {
  type?: ArtifactType | ArtifactType[];
  volume?: ArtifactVolume | ArtifactVolume[];
  status?: ArtifactStatus | ArtifactStatus[];
  tags?: string[];
  search?: string; // Search in name, description
  createdBy?: string; // session ID
}

/**
 * Artifact sort options
 */
export type ArtifactSortBy = 'createdAt' | 'updatedAt' | 'name' | 'type';
export type ArtifactSortOrder = 'asc' | 'desc';

export interface ArtifactSortOptions {
  by: ArtifactSortBy;
  order: ArtifactSortOrder;
}
