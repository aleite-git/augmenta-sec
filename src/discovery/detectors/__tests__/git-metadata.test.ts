import {describe, it, expect} from 'vitest';
import type {DetectorContext} from '../../types.js';
import {gitMetadataDetector} from '../git-metadata.js';

function createMockContext(
  files: Record<string, string>,
): DetectorContext {
  return {
    rootDir: '/mock',
    findFiles: async (patterns: string[]) => {
      return Object.keys(files).filter(f =>
        patterns.some(p => {
          if (p.startsWith('**/')) {
            const rest = p.slice(3);
            if (rest.startsWith('*.')) {
              return f.endsWith(rest.slice(1));
            }
            return f.includes(rest);
          }
          return f === p || f.endsWith('/' + p);
        }),
      );
    },
    readFile: async (path: string) => files[path] ?? null,
    readJson: async <T = unknown>(path: string) => {
      const content = files[path];
      if (!content) return null;
      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    },
    readYaml: async <T = unknown>(_path: string) => null as T,
    fileExists: async (path: string) => path in files,
    grep: async () => [],
  };
}

describe('gitMetadataDetector', () => {
  it('detects GitHub SSH remote', async () => {
    const ctx = createMockContext({
      '.git/config': [
        '[remote "origin"]',
        '\turl = git@github.com:acme/my-repo.git',
        '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      ].join('\n'),
      '.git/HEAD': 'ref: refs/heads/main',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('github');
    expect(result.owner).toBe('acme');
    expect(result.repo).toBe('my-repo');
    expect(result.defaultBranch).toBe('main');
    expect(result.remoteUrl).toBe('git@github.com:acme/my-repo.git');
  });

  it('detects GitHub HTTPS remote', async () => {
    const ctx = createMockContext({
      '.git/config': [
        '[remote "origin"]',
        '\turl = https://github.com/org/project.git',
      ].join('\n'),
      '.git/HEAD': 'ref: refs/heads/develop',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('github');
    expect(result.owner).toBe('org');
    expect(result.repo).toBe('project');
    expect(result.defaultBranch).toBe('develop');
  });

  it('detects GitLab remote', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = git@gitlab.com:team/service.git\n',
      '.git/HEAD': 'ref: refs/heads/main',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('gitlab');
    expect(result.owner).toBe('team');
    expect(result.repo).toBe('service');
  });

  it('detects Bitbucket remote', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = git@bitbucket.org:myteam/backend.git\n',
      '.git/HEAD': 'ref: refs/heads/master',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('bitbucket');
    expect(result.owner).toBe('myteam');
    expect(result.repo).toBe('backend');
    expect(result.defaultBranch).toBe('master');
  });

  it('detects Azure DevOps remote', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = https://dev.azure.com/myorg/myproject/_git/myrepo\n',
      '.git/HEAD': 'ref: refs/heads/main',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('azure-devops');
    expect(result.owner).toBe('myorg');
    expect(result.repo).toBe('myrepo');
  });

  it('returns hasGit=false when no .git directory', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(false);
    expect(result.platform).toBeUndefined();
    expect(result.owner).toBeUndefined();
    expect(result.repo).toBeUndefined();
  });

  it('handles HTTPS remote without .git suffix', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = https://github.com/user/repo\n',
      '.git/HEAD': 'ref: refs/heads/main',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.owner).toBe('user');
    expect(result.repo).toBe('repo');
  });

  it('handles unknown platform', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = https://self-hosted.example.com/team/repo.git\n',
      '.git/HEAD': 'ref: refs/heads/main',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.platform).toBe('unknown');
    expect(result.owner).toBe('team');
    expect(result.repo).toBe('repo');
  });

  it('handles detached HEAD', async () => {
    const ctx = createMockContext({
      '.git/config':
        '[remote "origin"]\n\turl = git@github.com:org/repo.git\n',
      '.git/HEAD': 'abc123def456789',
    });

    const result = await gitMetadataDetector.detect(ctx);
    expect(result.hasGit).toBe(true);
    expect(result.defaultBranch).toBeUndefined();
  });
});
