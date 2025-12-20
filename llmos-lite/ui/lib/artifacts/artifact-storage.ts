/**
 * Artifact Storage
 *
 * Handles persistence of artifacts to GitHub repositories
 */

import { Artifact, ArtifactType, ArtifactVolume, CodeArtifact } from './types';

export interface StorageConfig {
  githubToken?: string;
  repositories: {
    system?: string; // e.g., 'llmunix/system-volume'
    team?: string; // e.g., 'org/team-volume'
    user?: string; // e.g., 'user/llmos-workspace'
  };
}

export class ArtifactStorage {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Get the file path for an artifact within its volume
   */
  getArtifactPath(artifact: Artifact): string {
    const { type, name } = artifact;

    // Sanitize name for filesystem
    const safeName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Determine directory and extension based on type
    let directory: string;
    let extension: string;

    switch (type) {
      case 'agent':
        directory = 'agents';
        extension = 'json';
        break;
      case 'tool':
        directory = 'tools';
        extension = 'py'; // Default to Python, could be determined by codeView
        break;
      case 'skill':
        directory = 'skills';
        extension = 'md';
        break;
      case 'workflow':
        directory = 'workflows';
        extension = 'json';
        break;
      case 'code':
        directory = 'code-artifacts';
        // Determine subdirectory based on render type
        if (artifact.renderView) {
          switch (artifact.renderView.type) {
            case 'quantum-circuit':
              directory += '/circuits';
              break;
            case '3d-scene':
              directory += '/animations';
              break;
            case 'plot':
              directory += '/plots';
              break;
            default:
              directory += '/misc';
          }
        }
        // Type guard for code artifacts
        const codeArtifact = artifact as CodeArtifact;
        extension = codeArtifact.language || 'py';
        break;
      default:
        directory = 'artifacts';
        extension = 'txt';
    }

    return `${directory}/${safeName}.${extension}`;
  }

  /**
   * Serialize artifact for storage
   */
  serializeArtifact(artifact: Artifact): { content: string; metadata: any } {
    const { type, codeView, renderView, ...metadata } = artifact;

    let content = '';

    switch (type) {
      case 'agent':
      case 'workflow':
        // Store as JSON
        content = JSON.stringify(
          {
            ...metadata,
            renderView,
            code: codeView,
          },
          null,
          2
        );
        break;

      case 'tool':
      case 'code':
        // Store code with metadata header
        content = `# Artifact Metadata
# Type: ${type}
# Name: ${artifact.name}
# Created: ${artifact.createdAt}
# Volume: ${artifact.volume}

${codeView || ''}`;
        break;

      case 'skill':
        // Store as markdown with frontmatter
        content = `---
name: ${artifact.name}
type: skill
created: ${artifact.createdAt}
volume: ${artifact.volume}
${artifact.description ? `description: ${artifact.description}` : ''}
${artifact.tags ? `tags: ${artifact.tags.join(', ')}` : ''}
---

${codeView || artifact.description || ''}`;
        break;
    }

    return { content, metadata };
  }

  /**
   * Deserialize artifact from storage
   */
  deserializeArtifact(
    filePath: string,
    content: string,
    volume: ArtifactVolume
  ): Partial<Artifact> {
    const fileName = filePath.split('/').pop() || '';
    const extension = fileName.split('.').pop() || '';

    let artifact: Partial<Artifact> = {
      volume,
      filePath,
    };

    // Determine type from file path
    if (filePath.startsWith('agents/')) {
      artifact.type = 'agent';
    } else if (filePath.startsWith('tools/')) {
      artifact.type = 'tool';
    } else if (filePath.startsWith('skills/')) {
      artifact.type = 'skill';
    } else if (filePath.startsWith('workflows/')) {
      artifact.type = 'workflow';
    } else if (filePath.startsWith('code-artifacts/')) {
      artifact.type = 'code';
    }

    // Parse content based on extension
    if (extension === 'json') {
      try {
        const data = JSON.parse(content);
        artifact = { ...artifact, ...data };
        if (data.code) {
          artifact.codeView = data.code;
        }
      } catch (error) {
        console.error('Failed to parse JSON artifact:', error);
      }
    } else if (extension === 'md') {
      // Parse markdown frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const [, frontmatter, body] = frontmatterMatch;
        // Parse frontmatter (simple key: value)
        frontmatter.split('\n').forEach((line) => {
          const [key, ...valueParts] = line.split(':');
          const value = valueParts.join(':').trim();
          if (key && value) {
            (artifact as any)[key.trim()] = value;
          }
        });
        artifact.codeView = body.trim();
      } else {
        artifact.codeView = content;
      }
    } else {
      // Code file
      artifact.codeView = content;
      // Extract metadata from header comments if present
      const metadataMatch = content.match(/^# Artifact Metadata\n(# .*\n)+/);
      if (metadataMatch) {
        const lines = metadataMatch[0].split('\n');
        lines.forEach((line) => {
          const match = line.match(/^# (.*?): (.*)$/);
          if (match) {
            const [, key, value] = match;
            (artifact as any)[key.toLowerCase()] = value;
          }
        });
        // Remove metadata header from code
        artifact.codeView = content.replace(metadataMatch[0], '').trim();
      }
    }

    return artifact;
  }

  /**
   * Save artifact to GitHub repository
   */
  async saveToGitHub(artifact: Artifact): Promise<{ commitHash: string; filePath: string }> {
    const { volume } = artifact;
    const repo = this.config.repositories[volume];

    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    if (!this.config.githubToken) {
      throw new Error('GitHub token not configured');
    }

    const filePath = this.getArtifactPath(artifact);
    const { content } = this.serializeArtifact(artifact);

    // Use GitHub API to create/update file
    const [owner, repoName] = repo.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;

    try {
      // Check if file exists
      const existingResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      let sha: string | undefined;
      if (existingResponse.ok) {
        const existingFile = await existingResponse.json();
        sha = existingFile.sha;
      }

      // Create or update file
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `${sha ? 'Update' : 'Add'} ${artifact.type}: ${artifact.name}`,
          content: Buffer.from(content).toString('base64'),
          ...(sha && { sha }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub API error: ${error.message}`);
      }

      const result = await response.json();
      return {
        commitHash: result.commit.sha,
        filePath,
      };
    } catch (error) {
      console.error('Failed to save artifact to GitHub:', error);
      throw error;
    }
  }

  /**
   * Load artifacts from GitHub repository
   */
  async loadFromGitHub(volume: ArtifactVolume): Promise<Partial<Artifact>[]> {
    const repo = this.config.repositories[volume];

    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    if (!this.config.githubToken) {
      throw new Error('GitHub token not configured');
    }

    const [owner, repoName] = repo.split('/');

    try {
      // Get repository tree
      const treeUrl = `https://api.github.com/repos/${owner}/${repoName}/git/trees/main?recursive=1`;
      const treeResponse = await fetch(treeUrl, {
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!treeResponse.ok) {
        throw new Error('Failed to fetch repository tree');
      }

      const treeData = await treeResponse.json();
      const files = treeData.tree.filter(
        (item: any) =>
          item.type === 'blob' &&
          (item.path.startsWith('agents/') ||
            item.path.startsWith('tools/') ||
            item.path.startsWith('skills/') ||
            item.path.startsWith('workflows/') ||
            item.path.startsWith('code-artifacts/'))
      );

      // Load each file
      const artifacts: Partial<Artifact>[] = [];
      for (const file of files) {
        const contentUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}`;
        const contentResponse = await fetch(contentUrl, {
          headers: {
            Authorization: `Bearer ${this.config.githubToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
          const artifact = this.deserializeArtifact(file.path, content, volume);
          artifact.status = 'committed';
          artifacts.push(artifact);
        }
      }

      return artifacts;
    } catch (error) {
      console.error(`Failed to load artifacts from GitHub (${volume}):`, error);
      throw error;
    }
  }

  /**
   * Delete artifact from GitHub repository
   */
  async deleteFromGitHub(artifact: Artifact): Promise<void> {
    const { volume, filePath } = artifact;

    if (!filePath) {
      throw new Error('Artifact has no file path');
    }

    const repo = this.config.repositories[volume];
    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    if (!this.config.githubToken) {
      throw new Error('GitHub token not configured');
    }

    const [owner, repoName] = repo.split('/');
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;

    try {
      // Get current file SHA
      const fileResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!fileResponse.ok) {
        throw new Error('File not found in repository');
      }

      const fileData = await fileResponse.json();

      // Delete file
      const deleteResponse = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.config.githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Delete ${artifact.type}: ${artifact.name}`,
          sha: fileData.sha,
        }),
      });

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(`GitHub API error: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to delete artifact from GitHub:', error);
      throw error;
    }
  }
}
