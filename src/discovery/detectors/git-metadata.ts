import type {Detector, DetectorContext, GitMetadataInfo} from '../types.js';

type GitPlatform = GitMetadataInfo['platform'];

/**
 * Infers the hosting platform from a git remote URL.
 */
function inferPlatform(url: string): GitPlatform {
  if (url.includes('github.com')) return 'github';
  if (url.includes('gitlab.com') || url.includes('gitlab')) return 'gitlab';
  if (url.includes('bitbucket.org') || url.includes('bitbucket'))
    return 'bitbucket';
  if (url.includes('dev.azure.com') || url.includes('visualstudio.com'))
    return 'azure-devops';
  if (url.includes('gitea')) return 'gitea';
  return 'unknown';
}

/**
 * Extracts owner and repo from common git remote URL formats:
 *   SSH:   git@github.com:owner/repo.git
 *   HTTPS: https://github.com/owner/repo.git
 *   Azure: https://dev.azure.com/org/project/_git/repo
 */
function extractOwnerRepo(
  url: string,
): {owner: string; repo: string} | undefined {
  // SSH format: git@host:owner/repo.git
  const sshMatch = url.match(
    /[^@]+@[^:]+:([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (sshMatch) {
    return {owner: sshMatch[1], repo: sshMatch[2]};
  }

  // Azure DevOps: https://dev.azure.com/org/project/_git/repo
  const azureMatch = url.match(
    /dev\.azure\.com\/([^/]+)\/[^/]+\/_git\/([^/.]+?)(?:\.git)?$/,
  );
  if (azureMatch) {
    return {owner: azureMatch[1], repo: azureMatch[2]};
  }

  // Standard HTTPS: https://host/owner/repo.git
  const httpsMatch = url.match(
    /https?:\/\/[^/]+\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return {owner: httpsMatch[1], repo: httpsMatch[2]};
  }

  return undefined;
}

export const gitMetadataDetector: Detector<GitMetadataInfo> = {
  name: 'git',

  async detect(ctx: DetectorContext): Promise<GitMetadataInfo> {
    const hasConfig = await ctx.fileExists('.git/config');
    if (!hasConfig) {
      return {hasGit: false};
    }

    const result: GitMetadataInfo = {hasGit: true};

    // ── Parse remote URL from .git/config ──
    const config = await ctx.readFile('.git/config');
    if (config) {
      const urlMatch = config.match(/url\s*=\s*(.+)/);
      if (urlMatch) {
        const remoteUrl = urlMatch[1].trim();
        result.remoteUrl = remoteUrl;
        result.platform = inferPlatform(remoteUrl);

        const ownerRepo = extractOwnerRepo(remoteUrl);
        if (ownerRepo) {
          result.owner = ownerRepo.owner;
          result.repo = ownerRepo.repo;
        }
      }
    }

    // ── Parse default branch from .git/HEAD ──
    const head = await ctx.readFile('.git/HEAD');
    if (head) {
      const refMatch = head.match(/ref:\s*refs\/heads\/(.+)/);
      if (refMatch) {
        result.defaultBranch = refMatch[1].trim();
      }
    }

    return result;
  },
};
