import { VolumeType, VolumeFile, VolumeConfig } from './file-operations';

/**
 * GitOperations - Handles Git commands for volumes
 *
 * Interacts with the GitHub API to perform commits, diffs, etc.
 */
export class GitOperations {
  private getHeaders() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('github_token') : process.env.GITHUB_TOKEN;
    return {
      'Accept': 'application/vnd.github.v3+json',
      ...(token && {
        'Authorization': `token ${token}`
      })
    };
  }

  /**
   * Commit changes to a volume
   */
  async commit(
    config: VolumeConfig,
    message: string,
    files: VolumeFile[]
  ): Promise<void> {
    if (!config.githubRepo) {
      throw new Error(`Volume ${config.type} has no associated GitHub repository.`);
    }
    if (files.length === 0) {
      console.log("No files to commit.");
      return;
    }

    const [owner, repo] = config.githubRepo.split('/');
    const branch = config.branch;

    // 1. Get the latest commit SHA for the branch
    const refResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      headers: this.getHeaders()
    });
    if (!refResponse.ok) throw new Error(`Failed to get ref for ${branch}: ${await refResponse.text()}`);
    const refData = await refResponse.json();
    const latestCommitSha = refData.object.sha;

    // 2. Get the base tree SHA from the latest commit
    const commitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, {
      headers: this.getHeaders()
    });
    if (!commitResponse.ok) throw new Error(`Failed to get commit ${latestCommitSha}: ${await commitResponse.text()}`);
    const commitData = await commitResponse.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create a new tree with the file changes
    const tree = files.map(file => {
      if (file.gitStatus === 'deleted') {
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: null // Deleting a file
        };
      }
      return {
        path: file.path,
        mode: '100644', // file mode
        type: 'blob',
        content: file.content
      };
    });

    const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: tree,
      }),
    });
    if (!treeResponse.ok) throw new Error(`Failed to create tree: ${await treeResponse.text()}`);
    const treeData = await treeResponse.json();
    const newTreeSha = treeData.sha;

    // 4. Create a new commit
    const newCommitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [latestCommitSha],
      }),
    });
    if (!newCommitResponse.ok) throw new Error(`Failed to create commit: ${await newCommitResponse.text()}`);
    const newCommitData = await newCommitResponse.json();
    const newCommitSha = newCommitData.sha;

    // 5. Update the branch reference to point to the new commit
    const updateRefResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({
        sha: newCommitSha,
      }),
    });
    if (!updateRefResponse.ok) throw new Error(`Failed to update ref for ${branch}: ${await updateRefResponse.text()}`);

    console.log(`Successfully committed to ${branch} with SHA: ${newCommitSha}`);
  }

  /**
   * Get diff for a file
   */
  async getDiff(file: VolumeFile): Promise<string> {
    // Implementation to be added
    return `Diff for ${file.path}`;
  }
}

// Singleton instance
let gitOperations: GitOperations | null = null;

export function getGitOperations(): GitOperations {
  if (!gitOperations) {
    gitOperations = new GitOperations();
  }
  return gitOperations;
}
