import { GitOperations } from './git-operations';
import { VolumeFile, VolumeConfig } from './file-operations';

describe('GitOperations', () => {
  let gitOperations: GitOperations;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    gitOperations = new GitOperations();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    localStorage.setItem('github_token', 'test_token');
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.removeItem('github_token');
  });

  it('should be defined', () => {
    expect(gitOperations).toBeDefined();
  });

  it('should successfully commit files', async () => {
    const config: VolumeConfig = {
      name: 'User Volume',
      type: 'user',
      githubRepo: 'test-owner/test-repo',
      branch: 'main',
    };
    const files: VolumeFile[] = [
      { path: 'test.py', content: 'print("hello")', volume: 'user', gitStatus: 'new', lastModified: '' },
    ];
    const message = 'Test commit';

    // Mock responses for the GitHub API calls
    mockFetch
      // 1. Get ref
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ object: { sha: 'latest-commit-sha' } }),
      })
      // 2. Get commit
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tree: { sha: 'base-tree-sha' } }),
      })
      // 3. Create tree
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sha: 'new-tree-sha' }),
      })
      // 4. Create commit
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sha: 'new-commit-sha' }),
      })
      // 5. Update ref
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    await gitOperations.commit(config, message, files);

    // Verify all fetch calls were made with the correct URLs and options
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.github.com/repos/test-owner/test-repo/git/refs/heads/main', expect.any(Object));
    expect(mockFetch).toHaveBeenNthCalledWith(2, 'https://api.github.com/repos/test-owner/test-repo/git/commits/latest-commit-sha', expect.any(Object));
    expect(mockFetch).toHaveBeenNthCalledWith(3, 'https://api.github.com/repos/test-owner/test-repo/git/trees', expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(4, 'https://api.github.com/repos/test-owner/test-repo/git/commits', expect.objectContaining({ method: 'POST' }));
    expect(mockFetch).toHaveBeenNthCalledWith(5, 'https://api.github.com/repos/test-owner/test-repo/git/refs/heads/main', expect.objectContaining({ method: 'PATCH' }));
  });
});
