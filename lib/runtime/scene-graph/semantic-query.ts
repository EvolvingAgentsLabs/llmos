/**
 * Semantic Query System
 *
 * Bridges natural language with the scene graph:
 * - "go to the table near the window"
 * - "find the red object on the shelf"
 * - "what's in the living room?"
 *
 * Provides language grounding for robot commands.
 */

import { SceneGraph } from './scene-graph';
import { TopologyGraph } from './topology';
import {
  SceneNode,
  SemanticQuery,
  Vector3,
  EdgeRelationType,
  ObjectCategory,
  SceneNodeType,
} from './types';

// ============================================================================
// Query Result Types
// ============================================================================

export interface QueryMatch {
  /** Matched node */
  node: SceneNode;

  /** Confidence score (0-1) */
  confidence: number;

  /** Why this matched */
  matchReason: string[];

  /** Distance from reference point (if applicable) */
  distance?: number;

  /** Related nodes that contributed to match */
  relatedNodes: SceneNode[];
}

export interface QueryResult {
  /** All matches, sorted by confidence */
  matches: QueryMatch[];

  /** Total matches found */
  totalMatches: number;

  /** Query interpretation */
  interpretation: QueryInterpretation;

  /** Time taken to execute query (ms) */
  executionTime: number;

  /** Suggestions if no matches found */
  suggestions: string[];
}

export interface QueryInterpretation {
  /** Extracted entity references */
  entities: EntityReference[];

  /** Extracted spatial relations */
  spatialRelations: SpatialRelation[];

  /** Extracted attributes */
  attributes: AttributeFilter[];

  /** Action intent (if any) */
  actionIntent?: string;

  /** Confidence in interpretation */
  confidence: number;
}

export interface EntityReference {
  /** Original text span */
  text: string;

  /** Normalized label */
  normalizedLabel: string;

  /** Possible categories */
  possibleCategories: ObjectCategory[];

  /** Is this the main target? */
  isTarget: boolean;

  /** Is this a reference/anchor? */
  isReference: boolean;
}

export interface SpatialRelation {
  /** Relation type */
  relation: EdgeRelationType;

  /** Subject entity index */
  subjectIndex: number;

  /** Object entity index */
  objectIndex: number;

  /** Original text */
  text: string;
}

export interface AttributeFilter {
  /** Attribute name */
  name: string;

  /** Expected value */
  value: string | number | boolean;

  /** Match type */
  matchType: 'exact' | 'contains' | 'greater' | 'less';
}

// ============================================================================
// Language Patterns
// ============================================================================

const SPATIAL_PATTERNS: { pattern: RegExp; relation: EdgeRelationType }[] = [
  { pattern: /\bnear(?:by)?\s+(?:the\s+)?/i, relation: 'near' },
  { pattern: /\bclose\s+to\s+(?:the\s+)?/i, relation: 'near' },
  { pattern: /\bnext\s+to\s+(?:the\s+)?/i, relation: 'adjacent_to' },
  { pattern: /\bbeside\s+(?:the\s+)?/i, relation: 'adjacent_to' },
  { pattern: /\bon\s+(?:top\s+of\s+)?(?:the\s+)?/i, relation: 'on_top_of' },
  { pattern: /\babove\s+(?:the\s+)?/i, relation: 'on_top_of' },
  { pattern: /\bunder(?:neath)?\s+(?:the\s+)?/i, relation: 'under' },
  { pattern: /\bbelow\s+(?:the\s+)?/i, relation: 'under' },
  { pattern: /\bin(?:side)?\s+(?:the\s+)?/i, relation: 'in' },
  { pattern: /\bwithin\s+(?:the\s+)?/i, relation: 'in' },
  { pattern: /\bconnected\s+to\s+(?:the\s+)?/i, relation: 'connected_to' },
  { pattern: /\bleading\s+to\s+(?:the\s+)?/i, relation: 'connected_to' },
  { pattern: /\bvisible\s+from\s+(?:the\s+)?/i, relation: 'visible_from' },
  { pattern: /\bcan\s+see\s+from\s+(?:the\s+)?/i, relation: 'visible_from' },
];

const CATEGORY_KEYWORDS: Record<string, ObjectCategory> = {
  table: 'furniture',
  chair: 'furniture',
  desk: 'furniture',
  sofa: 'furniture',
  couch: 'furniture',
  bed: 'furniture',
  shelf: 'furniture',
  cabinet: 'furniture',
  wall: 'wall',
  door: 'door',
  window: 'decoration',
  gem: 'collectible',
  coin: 'collectible',
  item: 'collectible',
  object: 'unknown',
  thing: 'unknown',
  obstacle: 'obstacle',
  box: 'container',
  crate: 'container',
  surface: 'surface',
};

const ACTION_PATTERNS: { pattern: RegExp; action: string }[] = [
  { pattern: /\bgo\s+to\b/i, action: 'navigate' },
  { pattern: /\bmove\s+to\b/i, action: 'navigate' },
  { pattern: /\bnavigate\s+to\b/i, action: 'navigate' },
  { pattern: /\bfind\b/i, action: 'search' },
  { pattern: /\blocate\b/i, action: 'search' },
  { pattern: /\bsearch\s+for\b/i, action: 'search' },
  { pattern: /\blook\s+for\b/i, action: 'search' },
  { pattern: /\bwhat(?:'s|\s+is)\b/i, action: 'query' },
  { pattern: /\bwhere(?:'s|\s+is)\b/i, action: 'query' },
  { pattern: /\bpick\s+up\b/i, action: 'collect' },
  { pattern: /\bcollect\b/i, action: 'collect' },
  { pattern: /\bgrab\b/i, action: 'collect' },
  { pattern: /\bavoid\b/i, action: 'avoid' },
  { pattern: /\bstay\s+away\s+from\b/i, action: 'avoid' },
];

const COLOR_KEYWORDS = [
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'black',
  'white',
  'gray',
  'grey',
  'brown',
];

const SIZE_KEYWORDS = ['big', 'large', 'small', 'tiny', 'huge', 'medium'];

// ============================================================================
// Semantic Query Engine
// ============================================================================

export class SemanticQueryEngine {
  private sceneGraph: SceneGraph;
  private topology: TopologyGraph;

  // Label synonyms for fuzzy matching
  private synonyms: Map<string, string[]> = new Map([
    ['table', ['desk', 'workbench', 'surface']],
    ['chair', ['seat', 'stool']],
    ['wall', ['barrier', 'partition']],
    ['door', ['entrance', 'exit', 'doorway']],
    ['gem', ['crystal', 'jewel', 'stone', 'collectible']],
    ['robot', ['bot', 'agent', 'rover']],
    ['room', ['area', 'space', 'chamber']],
    ['waypoint', ['point', 'marker', 'node']],
  ]);

  constructor(sceneGraph: SceneGraph, topology: TopologyGraph) {
    this.sceneGraph = sceneGraph;
    this.topology = topology;
  }

  // ==========================================================================
  // Main Query Interface
  // ==========================================================================

  /**
   * Execute a natural language query
   */
  query(naturalLanguageQuery: string): QueryResult {
    const startTime = Date.now();

    // Parse the query
    const interpretation = this.interpretQuery(naturalLanguageQuery);

    // Execute based on interpretation
    let matches: QueryMatch[] = [];

    if (interpretation.entities.length > 0) {
      // Find target entity
      const targetEntity = interpretation.entities.find((e) => e.isTarget);
      const referenceEntities = interpretation.entities.filter((e) => e.isReference);

      if (targetEntity) {
        // Find nodes matching target
        matches = this.findMatchingNodes(targetEntity, interpretation);

        // Apply spatial constraints
        if (referenceEntities.length > 0 && interpretation.spatialRelations.length > 0) {
          matches = this.applySpatialConstraints(
            matches,
            referenceEntities,
            interpretation.spatialRelations
          );
        }

        // Apply attribute filters
        if (interpretation.attributes.length > 0) {
          matches = this.applyAttributeFilters(matches, interpretation.attributes);
        }
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Generate suggestions if no matches
    const suggestions =
      matches.length === 0
        ? this.generateSuggestions(interpretation)
        : [];

    return {
      matches,
      totalMatches: matches.length,
      interpretation,
      executionTime: Date.now() - startTime,
      suggestions,
    };
  }

  /**
   * Execute a structured semantic query
   */
  queryStructured(query: SemanticQuery): QueryResult {
    const startTime = Date.now();
    const matches: QueryMatch[] = [];

    // Search by keywords
    const candidates = query.keywords
      ? this.findByKeywords(query.keywords)
      : this.sceneGraph.getAllNodes();

    // Filter by category
    const filtered = query.categories
      ? candidates.filter((n) => query.categories!.includes(n.semantics.category))
      : candidates;

    // Apply spatial constraint
    let spatialFiltered = filtered;
    if (query.spatialConstraint) {
      const inRadius = this.sceneGraph.findNodesInRadius(query.spatialConstraint);
      const inRadiusIds = new Set(inRadius.map((n) => n.id));
      spatialFiltered = filtered.filter((n) => inRadiusIds.has(n.id));
    }

    // Apply relation constraints
    let relationFiltered = spatialFiltered;
    if (query.relationConstraints && query.relationConstraints.length > 0) {
      relationFiltered = this.applyRelationConstraints(
        spatialFiltered,
        query.relationConstraints
      );
    }

    // Build matches
    for (const node of relationFiltered) {
      const confidence = this.computeQueryConfidence(node, query);
      matches.push({
        node,
        confidence,
        matchReason: this.getMatchReasons(node, query),
        relatedNodes: [],
      });
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    return {
      matches,
      totalMatches: matches.length,
      interpretation: {
        entities: [],
        spatialRelations: [],
        attributes: [],
        confidence: 1.0,
      },
      executionTime: Date.now() - startTime,
      suggestions: [],
    };
  }

  // ==========================================================================
  // Query Interpretation
  // ==========================================================================

  /**
   * Interpret a natural language query
   */
  interpretQuery(query: string): QueryInterpretation {
    const normalizedQuery = query.toLowerCase().trim();
    const entities: EntityReference[] = [];
    const spatialRelations: SpatialRelation[] = [];
    const attributes: AttributeFilter[] = [];
    let actionIntent: string | undefined;

    // Extract action intent
    for (const { pattern, action } of ACTION_PATTERNS) {
      if (pattern.test(normalizedQuery)) {
        actionIntent = action;
        break;
      }
    }

    // Extract spatial relations and split query
    let remainingQuery = normalizedQuery;
    for (const { pattern, relation } of SPATIAL_PATTERNS) {
      const match = remainingQuery.match(pattern);
      if (match) {
        spatialRelations.push({
          relation,
          subjectIndex: 0,
          objectIndex: entities.length + 1, // Will be adjusted
          text: match[0],
        });

        // Split into before/after spatial relation
        const parts = remainingQuery.split(pattern);
        if (parts[0]) {
          const entity = this.extractEntity(parts[0], true);
          if (entity) entities.push(entity);
        }
        remainingQuery = parts[1] || '';
      }
    }

    // Extract remaining entity
    if (remainingQuery) {
      const entity = this.extractEntity(remainingQuery, entities.length === 0);
      if (entity) {
        // If we have spatial relations, this is the reference
        if (spatialRelations.length > 0 && entities.length > 0) {
          entity.isReference = true;
          entity.isTarget = false;
        }
        entities.push(entity);
      }
    }

    // Update spatial relation indices
    if (spatialRelations.length > 0 && entities.length >= 2) {
      spatialRelations[0].subjectIndex = 0;
      spatialRelations[0].objectIndex = 1;
    }

    // Extract color attributes
    for (const color of COLOR_KEYWORDS) {
      if (normalizedQuery.includes(color)) {
        attributes.push({
          name: 'color',
          value: color,
          matchType: 'exact',
        });
      }
    }

    // Extract size attributes
    for (const size of SIZE_KEYWORDS) {
      if (normalizedQuery.includes(size)) {
        attributes.push({
          name: 'size',
          value: size,
          matchType: 'exact',
        });
      }
    }

    // Compute interpretation confidence
    const confidence = this.computeInterpretationConfidence(
      entities,
      spatialRelations,
      attributes,
      actionIntent
    );

    return {
      entities,
      spatialRelations,
      attributes,
      actionIntent,
      confidence,
    };
  }

  /**
   * Extract entity reference from text
   */
  private extractEntity(text: string, isTarget: boolean): EntityReference | null {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;

    // Remove common articles and words
    const cleaned = normalized
      .replace(/^(the|a|an|some|any)\s+/i, '')
      .replace(/\s+(please|now|here|there)$/i, '')
      .trim();

    if (!cleaned) return null;

    // Try to match known categories
    const possibleCategories: ObjectCategory[] = [];
    for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
      if (cleaned.includes(keyword)) {
        possibleCategories.push(category);
      }
    }

    return {
      text,
      normalizedLabel: cleaned,
      possibleCategories:
        possibleCategories.length > 0 ? possibleCategories : ['unknown'],
      isTarget,
      isReference: !isTarget,
    };
  }

  // ==========================================================================
  // Node Matching
  // ==========================================================================

  /**
   * Find nodes matching an entity reference
   */
  private findMatchingNodes(
    entity: EntityReference,
    interpretation: QueryInterpretation
  ): QueryMatch[] {
    const matches: QueryMatch[] = [];

    for (const node of this.sceneGraph.getAllNodes()) {
      const score = this.computeEntityMatchScore(node, entity);

      if (score > 0.1) {
        matches.push({
          node,
          confidence: score,
          matchReason: this.getEntityMatchReasons(node, entity),
          relatedNodes: [],
        });
      }
    }

    return matches;
  }

  /**
   * Compute match score between a node and entity reference
   */
  private computeEntityMatchScore(
    node: SceneNode,
    entity: EntityReference
  ): number {
    let score = 0;
    const label = node.semantics.label.toLowerCase();
    const query = entity.normalizedLabel;

    // Exact label match
    if (label === query) {
      score += 1.0;
    }
    // Label contains query
    else if (label.includes(query)) {
      score += 0.8;
    }
    // Query contains label
    else if (query.includes(label)) {
      score += 0.6;
    }
    // Check aliases
    else if (
      node.semantics.aliases.some(
        (a) => a.toLowerCase().includes(query) || query.includes(a.toLowerCase())
      )
    ) {
      score += 0.7;
    }
    // Check synonyms
    else if (this.matchesSynonym(label, query)) {
      score += 0.6;
    }

    // Category match bonus
    if (entity.possibleCategories.includes(node.semantics.category)) {
      score += 0.2;
    }

    // Confidence penalty
    score *= node.timeStats.confidence;

    // Active bonus
    if (node.isActive) {
      score *= 1.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * Check if two labels match via synonyms
   */
  private matchesSynonym(label: string, query: string): boolean {
    for (const [key, synonyms] of this.synonyms) {
      if (
        (label.includes(key) || synonyms.some((s) => label.includes(s))) &&
        (query.includes(key) || synonyms.some((s) => query.includes(s)))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get reasons why a node matched an entity
   */
  private getEntityMatchReasons(
    node: SceneNode,
    entity: EntityReference
  ): string[] {
    const reasons: string[] = [];
    const label = node.semantics.label.toLowerCase();
    const query = entity.normalizedLabel;

    if (label === query) {
      reasons.push(`Exact label match: "${node.semantics.label}"`);
    } else if (label.includes(query)) {
      reasons.push(`Label contains "${query}"`);
    } else if (query.includes(label)) {
      reasons.push(`Query contains label "${node.semantics.label}"`);
    }

    if (entity.possibleCategories.includes(node.semantics.category)) {
      reasons.push(`Category match: ${node.semantics.category}`);
    }

    return reasons;
  }

  // ==========================================================================
  // Spatial Constraints
  // ==========================================================================

  /**
   * Apply spatial constraints to filter matches
   */
  private applySpatialConstraints(
    matches: QueryMatch[],
    referenceEntities: EntityReference[],
    spatialRelations: SpatialRelation[]
  ): QueryMatch[] {
    // Find reference nodes
    const referenceNodes: SceneNode[] = [];
    for (const refEntity of referenceEntities) {
      const refMatches = this.findMatchingNodes(refEntity, {
        entities: [refEntity],
        spatialRelations: [],
        attributes: [],
        confidence: 1.0,
      });

      if (refMatches.length > 0) {
        referenceNodes.push(refMatches[0].node);
      }
    }

    if (referenceNodes.length === 0) {
      return matches; // No reference found, return original
    }

    const filtered: QueryMatch[] = [];

    for (const match of matches) {
      let satisfiesConstraints = true;
      const relatedNodes: SceneNode[] = [];

      for (const relation of spatialRelations) {
        const refNode = referenceNodes[0]; // Use first reference
        const satisfies = this.checkSpatialRelation(
          match.node,
          refNode,
          relation.relation
        );

        if (!satisfies) {
          satisfiesConstraints = false;
          break;
        }

        relatedNodes.push(refNode);
      }

      if (satisfiesConstraints) {
        match.relatedNodes = relatedNodes;
        match.matchReason.push(
          `Spatial relation: ${spatialRelations[0].relation} "${referenceNodes[0].semantics.label}"`
        );

        // Add distance info
        const dist = this.distance3D(
          match.node.geometry.pose.position,
          referenceNodes[0].geometry.pose.position
        );
        match.distance = dist;

        filtered.push(match);
      }
    }

    return filtered;
  }

  /**
   * Check if spatial relation holds between two nodes
   */
  private checkSpatialRelation(
    subject: SceneNode,
    object: SceneNode,
    relation: EdgeRelationType
  ): boolean {
    const subjectPos = subject.geometry.pose.position;
    const objectPos = object.geometry.pose.position;

    switch (relation) {
      case 'near':
      case 'adjacent_to':
        return this.distance3D(subjectPos, objectPos) < 1.0;

      case 'on_top_of':
        return (
          subjectPos.y > objectPos.y &&
          this.distance2D(subjectPos, objectPos) < 0.5
        );

      case 'under':
        return (
          subjectPos.y < objectPos.y &&
          this.distance2D(subjectPos, objectPos) < 0.5
        );

      case 'in':
        // Check if subject is inside object's bounding box
        const bbox = object.geometry.boundingBox;
        if (!bbox) return false;
        return (
          subjectPos.x >= bbox.min.x &&
          subjectPos.x <= bbox.max.x &&
          subjectPos.y >= bbox.min.y &&
          subjectPos.y <= bbox.max.y &&
          subjectPos.z >= bbox.min.z &&
          subjectPos.z <= bbox.max.z
        );

      case 'visible_from':
        // Simple line-of-sight check (could be enhanced with raycast)
        return this.distance3D(subjectPos, objectPos) < 5.0;

      case 'connected_to':
        // Check graph connectivity
        const edge = this.sceneGraph.findEdge(subject.id, object.id, 'connected_to');
        return edge !== undefined;

      default:
        return false;
    }
  }

  // ==========================================================================
  // Attribute Filters
  // ==========================================================================

  /**
   * Apply attribute filters to matches
   */
  private applyAttributeFilters(
    matches: QueryMatch[],
    attributes: AttributeFilter[]
  ): QueryMatch[] {
    return matches.filter((match) => {
      for (const attr of attributes) {
        const nodeAttr = match.node.semantics.attributes[attr.name];
        if (nodeAttr === undefined) continue;

        switch (attr.matchType) {
          case 'exact':
            if (nodeAttr !== attr.value) return false;
            break;
          case 'contains':
            if (
              typeof nodeAttr === 'string' &&
              typeof attr.value === 'string' &&
              !nodeAttr.includes(attr.value)
            ) {
              return false;
            }
            break;
          case 'greater':
            if (typeof nodeAttr === 'number' && typeof attr.value === 'number') {
              if (nodeAttr <= attr.value) return false;
            }
            break;
          case 'less':
            if (typeof nodeAttr === 'number' && typeof attr.value === 'number') {
              if (nodeAttr >= attr.value) return false;
            }
            break;
        }
      }
      return true;
    });
  }

  // ==========================================================================
  // Relation Constraints
  // ==========================================================================

  /**
   * Apply relation constraints from structured query
   */
  private applyRelationConstraints(
    nodes: SceneNode[],
    constraints: { relation: EdgeRelationType; targetLabel?: string }[]
  ): SceneNode[] {
    return nodes.filter((node) => {
      for (const constraint of constraints) {
        const edges = this.sceneGraph.getEdgesFrom(node.id);
        const hasRelation = edges.some((e) => {
          if (e.relation !== constraint.relation) return false;
          if (constraint.targetLabel) {
            const target = this.sceneGraph.getNode(e.targetId);
            if (!target) return false;
            return target.semantics.label
              .toLowerCase()
              .includes(constraint.targetLabel.toLowerCase());
          }
          return true;
        });
        if (!hasRelation) return false;
      }
      return true;
    });
  }

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  /**
   * Find nodes by keywords
   */
  private findByKeywords(keywords: string[]): SceneNode[] {
    const results = new Set<SceneNode>();

    for (const keyword of keywords) {
      const matches = this.sceneGraph.findNodesByLabel(keyword, true);
      for (const match of matches) {
        results.add(match);
      }
    }

    return Array.from(results);
  }

  /**
   * Compute confidence for structured query match
   */
  private computeQueryConfidence(node: SceneNode, query: SemanticQuery): number {
    let score = 0.5;

    // Keyword match
    if (query.keywords) {
      const label = node.semantics.label.toLowerCase();
      for (const kw of query.keywords) {
        if (label.includes(kw.toLowerCase())) {
          score += 0.2;
        }
      }
    }

    // Category match
    if (query.categories?.includes(node.semantics.category)) {
      score += 0.2;
    }

    // Node confidence
    score *= node.timeStats.confidence;

    return Math.min(1.0, score);
  }

  /**
   * Get match reasons for structured query
   */
  private getMatchReasons(node: SceneNode, query: SemanticQuery): string[] {
    const reasons: string[] = [];

    if (query.keywords) {
      const label = node.semantics.label.toLowerCase();
      for (const kw of query.keywords) {
        if (label.includes(kw.toLowerCase())) {
          reasons.push(`Keyword match: "${kw}"`);
        }
      }
    }

    if (query.categories?.includes(node.semantics.category)) {
      reasons.push(`Category: ${node.semantics.category}`);
    }

    return reasons;
  }

  /**
   * Compute confidence in query interpretation
   */
  private computeInterpretationConfidence(
    entities: EntityReference[],
    spatialRelations: SpatialRelation[],
    attributes: AttributeFilter[],
    actionIntent?: string
  ): number {
    let score = 0;

    // Has target entity
    if (entities.some((e) => e.isTarget)) score += 0.4;

    // Has spatial relations
    if (spatialRelations.length > 0) score += 0.2;

    // Has reference entity
    if (entities.some((e) => e.isReference)) score += 0.2;

    // Has action intent
    if (actionIntent) score += 0.1;

    // Has attributes
    if (attributes.length > 0) score += 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Generate suggestions when no matches found
   */
  private generateSuggestions(interpretation: QueryInterpretation): string[] {
    const suggestions: string[] = [];

    // Suggest available objects
    const objects = this.sceneGraph.getNodesByType('object');
    if (objects.length > 0) {
      const labels = objects.slice(0, 3).map((o) => o.semantics.label);
      suggestions.push(`Try searching for: ${labels.join(', ')}`);
    }

    // Suggest checking exploration
    const waypoints = this.topology.getAllWaypoints();
    if (waypoints.length < 5) {
      suggestions.push('Explore more of the environment to discover objects');
    }

    // Suggest similar entities
    if (interpretation.entities.length > 0) {
      const target = interpretation.entities.find((e) => e.isTarget);
      if (target) {
        const allLabels = this.sceneGraph
          .getAllNodes()
          .map((n) => n.semantics.label.toLowerCase());
        const similar = allLabels.filter(
          (l) =>
            l.includes(target.normalizedLabel.slice(0, 3)) ||
            target.normalizedLabel.includes(l.slice(0, 3))
        );
        if (similar.length > 0) {
          suggestions.push(`Did you mean: ${similar.slice(0, 3).join(', ')}?`);
        }
      }
    }

    return suggestions;
  }

  /**
   * Distance between two 3D points
   */
  private distance3D(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * 2D distance (x-z plane)
   */
  private distance2D(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  /**
   * Quick search by label
   */
  findByLabel(label: string): QueryMatch[] {
    return this.query(label).matches;
  }

  /**
   * Find objects near a position
   */
  findNear(
    position: Vector3,
    radius: number = 1.0,
    category?: ObjectCategory
  ): QueryMatch[] {
    const nodes = this.sceneGraph.findNodesInRadius({
      center: position,
      radius,
      categories: category ? [category] : undefined,
    });

    return nodes.map((node) => ({
      node,
      confidence: node.timeStats.confidence,
      matchReason: [`Within ${radius}m radius`],
      distance: this.distance3D(position, node.geometry.pose.position),
      relatedNodes: [],
    }));
  }

  /**
   * Get all objects in a region
   */
  findInRegion(regionId: string): QueryMatch[] {
    const region = this.topology.getRegion(regionId);
    if (!region) return [];

    return region.containedObjects
      .map((id) => this.sceneGraph.getNode(id))
      .filter((n): n is SceneNode => n !== undefined)
      .map((node) => ({
        node,
        confidence: node.timeStats.confidence,
        matchReason: [`In region "${region.semantics.label}"`],
        relatedNodes: [],
      }));
  }
}
