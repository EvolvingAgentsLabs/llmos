/**
 * Skill Marketplace Client
 *
 * Browse, search, and install skills, tools, and agents from the community marketplace.
 */

export interface MarketplaceItem {
  id: string;
  type: 'skill' | 'tool' | 'agent';
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  version: string;
  downloads: number;
  rating: number;
  reviews: number;
  category: string;
  tags: string[];
  content: string;
  readme: string;
  license: string;
  repository?: string;
  createdAt: string;
  updatedAt: string;
  dependencies?: string[];
  screenshots?: string[];
}

export interface MarketplaceFilter {
  type?: 'skill' | 'tool' | 'agent';
  category?: string;
  tags?: string[];
  minRating?: number;
  author?: string;
  sortBy?: 'popular' | 'recent' | 'rating' | 'downloads';
  limit?: number;
  offset?: number;
}

export interface MarketplaceStats {
  totalItems: number;
  totalDownloads: number;
  categories: Array<{ name: string; count: number }>;
  topAuthors: Array<{ name: string; items: number }>;
}

export class MarketplaceClient {
  constructor(
    private apiUrl: string = '/api/marketplace',
  ) {}

  /**
   * Search marketplace
   */
  async search(query: string, filter?: MarketplaceFilter): Promise<MarketplaceItem[]> {
    const params = new URLSearchParams({
      q: query,
      ...this.filterToParams(filter),
    });

    const response = await fetch(`${this.apiUrl}/search?${params}`);

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Browse marketplace with filters
   */
  async browse(filter?: MarketplaceFilter): Promise<MarketplaceItem[]> {
    const params = new URLSearchParams(this.filterToParams(filter));
    const response = await fetch(`${this.apiUrl}/browse?${params}`);

    if (!response.ok) {
      throw new Error(`Browse failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get item details
   */
  async getItem(id: string): Promise<MarketplaceItem> {
    const response = await fetch(`${this.apiUrl}/items/${id}`);

    if (!response.ok) {
      throw new Error(`Get item failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Install item to user volume
   */
  async install(itemId: string, volumeType: 'user' | 'team' = 'user'): Promise<void> {
    const response = await fetch(`${this.apiUrl}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, volumeType }),
    });

    if (!response.ok) {
      throw new Error(`Install failed: ${response.statusText}`);
    }
  }

  /**
   * Publish item to marketplace
   */
  async publish(item: Partial<MarketplaceItem>): Promise<MarketplaceItem> {
    const response = await fetch(`${this.apiUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      throw new Error(`Publish failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Update published item
   */
  async update(itemId: string, updates: Partial<MarketplaceItem>): Promise<MarketplaceItem> {
    const response = await fetch(`${this.apiUrl}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Update failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete item from marketplace
   */
  async delete(itemId: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/items/${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }
  }

  /**
   * Rate item
   */
  async rate(itemId: string, rating: number, review?: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/items/${itemId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, review }),
    });

    if (!response.ok) {
      throw new Error(`Rate failed: ${response.statusText}`);
    }
  }

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<MarketplaceStats> {
    const response = await fetch(`${this.apiUrl}/stats`);

    if (!response.ok) {
      throw new Error(`Get stats failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user's published items
   */
  async getMyItems(): Promise<MarketplaceItem[]> {
    const response = await fetch(`${this.apiUrl}/my-items`);

    if (!response.ok) {
      throw new Error(`Get my items failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user's installed items
   */
  async getInstalled(): Promise<MarketplaceItem[]> {
    const response = await fetch(`${this.apiUrl}/installed`);

    if (!response.ok) {
      throw new Error(`Get installed failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check for updates
   */
  async checkUpdates(): Promise<Array<{ itemId: string; currentVersion: string; latestVersion: string }>> {
    const response = await fetch(`${this.apiUrl}/check-updates`);

    if (!response.ok) {
      throw new Error(`Check updates failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Convert filter to URL params
   */
  private filterToParams(filter?: MarketplaceFilter): Record<string, string> {
    if (!filter) return {};

    const params: Record<string, string> = {};

    if (filter.type) params.type = filter.type;
    if (filter.category) params.category = filter.category;
    if (filter.tags) params.tags = filter.tags.join(',');
    if (filter.minRating) params.minRating = filter.minRating.toString();
    if (filter.author) params.author = filter.author;
    if (filter.sortBy) params.sortBy = filter.sortBy;
    if (filter.limit) params.limit = filter.limit.toString();
    if (filter.offset) params.offset = filter.offset.toString();

    return params;
  }
}

/**
 * Global marketplace client instance
 */
let globalMarketplaceClient: MarketplaceClient | null = null;

/**
 * Get or create marketplace client
 */
export function getMarketplaceClient(): MarketplaceClient {
  if (!globalMarketplaceClient) {
    globalMarketplaceClient = new MarketplaceClient();
  }
  return globalMarketplaceClient;
}

/**
 * Featured marketplace categories
 */
export const MARKETPLACE_CATEGORIES = [
  { id: 'data-analysis', name: 'Data Analysis', icon: '📊' },
  { id: 'web-dev', name: 'Web Development', icon: '🌐' },
  { id: 'machine-learning', name: 'Machine Learning', icon: '🤖' },
  { id: 'automation', name: 'Automation', icon: '⚙️' },
  { id: 'security', name: 'Security', icon: '🔒' },
  { id: 'testing', name: 'Testing', icon: '✅' },
  { id: 'documentation', name: 'Documentation', icon: '📝' },
  { id: 'deployment', name: 'Deployment', icon: '🚀' },
  { id: 'legal', name: 'Legal', icon: '⚖️' },
  { id: 'financial', name: 'Financial', icon: '💰' },
  { id: 'research', name: 'Research', icon: '🔬' },
  { id: 'design', name: 'Design', icon: '🎨' },
];

/**
 * Mock marketplace data for development
 */
export const MOCK_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: 'dcf-valuation',
    type: 'skill',
    name: 'DCF Valuation',
    description: 'Complete discounted cash flow valuation with WACC and sensitivity analysis',
    author: { id: 'user1', name: 'Financial Analyst Pro' },
    version: '2.1.0',
    downloads: 1524,
    rating: 4.8,
    reviews: 127,
    category: 'financial',
    tags: ['valuation', 'finance', 'dcf', 'investment'],
    content: '...',
    readme: '# DCF Valuation\n\nA comprehensive skill for performing DCF valuations...',
    license: 'MIT',
    repository: 'https://github.com/example/dcf-valuation',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2025-11-20T15:30:00Z',
    dependencies: ['financial-calculator', 'data-fetcher'],
    screenshots: ['/screenshots/dcf-1.png'],
  },
  {
    id: 'contract-analyzer',
    type: 'agent',
    name: 'Contract Analyzer',
    description: 'AI agent that analyzes legal contracts for risks and missing clauses',
    author: { id: 'user2', name: 'LegalTech Solutions' },
    version: '1.5.0',
    downloads: 892,
    rating: 4.6,
    reviews: 73,
    category: 'legal',
    tags: ['contract', 'legal', 'analysis', 'risk'],
    content: '...',
    readme: '# Contract Analyzer\n\nAutonomous agent for contract analysis...',
    license: 'Apache-2.0',
    createdAt: '2024-03-10T14:00:00Z',
    updatedAt: '2025-10-05T09:15:00Z',
    dependencies: ['citation-validator'],
  },
  {
    id: 'sequence-aligner',
    type: 'tool',
    name: 'Sequence Aligner',
    description: 'Multiple sequence alignment using BLAST and Clustal algorithms',
    author: { id: 'user3', name: 'BioInformatics Lab' },
    version: '3.2.1',
    downloads: 2341,
    rating: 4.9,
    reviews: 198,
    category: 'research',
    tags: ['bioinformatics', 'sequence', 'alignment', 'blast'],
    content: '...',
    readme: '# Sequence Aligner\n\nHigh-performance sequence alignment tool...',
    license: 'GPL-3.0',
    repository: 'https://github.com/example/sequence-aligner',
    createdAt: '2023-11-20T08:00:00Z',
    updatedAt: '2025-09-12T16:45:00Z',
  },
];
