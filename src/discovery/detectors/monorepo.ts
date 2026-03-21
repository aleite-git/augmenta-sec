import type {
  Detector,
  DetectorContext,
  MonorepoInfo,
  WorkspaceEntry,
} from '../types.js';

interface PackageJson {
  name?: string;
  workspaces?: string[] | {packages: string[]};
  main?: string;
  bin?: string | Record<string, string>;
}

/**
 * Resolves workspace glob patterns to actual packages found in the project.
 * Classifies each as 'app' (has main/bin), 'library' (no main), or 'package'.
 */
async function resolveWorkspaces(
  ctx: DetectorContext,
  patterns: string[],
): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    // Convert workspace globs (e.g., "packages/*") to package.json search
    const pkgGlob = pattern.endsWith('/*')
      ? `${pattern}/package.json`
      : pattern.endsWith('/**')
        ? `${pattern}/package.json`
        : `${pattern}/package.json`;

    const files = await ctx.findFiles([pkgGlob]);
    for (const file of files) {
      const dir = file.replace(/\/package\.json$/, '');
      if (seen.has(dir)) continue;
      seen.add(dir);

      const pkg = await ctx.readJson<PackageJson>(file);
      const name = pkg?.name ?? dir.split('/').pop() ?? dir;

      let type: WorkspaceEntry['type'] = 'package';
      if (pkg?.main || pkg?.bin) {
        type = 'app';
      } else if (!pkg?.main && !pkg?.bin) {
        type = 'library';
      }

      entries.push({name, path: dir, type});
    }
  }

  return entries;
}

export const monorepoDetector: Detector<MonorepoInfo> = {
  name: 'monorepo',

  async detect(ctx: DetectorContext): Promise<MonorepoInfo> {
    const result: MonorepoInfo = {
      isMonorepo: false,
      workspaces: [],
    };

    // ── Check for Nx ──
    if (await ctx.fileExists('nx.json')) {
      result.isMonorepo = true;
      result.tool = 'nx';
    }

    // ── Check for Turborepo ──
    if (await ctx.fileExists('turbo.json')) {
      result.isMonorepo = true;
      result.tool = 'turborepo';
    }

    // ── Check for Lerna ──
    if (await ctx.fileExists('lerna.json')) {
      result.isMonorepo = true;
      result.tool = result.tool ?? 'lerna';
    }

    // ── Check for pnpm workspaces ──
    if (await ctx.fileExists('pnpm-workspace.yaml')) {
      result.isMonorepo = true;
      result.tool = result.tool ?? 'pnpm';
    }

    // ── Check package.json workspaces (npm/yarn) ──
    const rootPkg = await ctx.readJson<PackageJson>('package.json');
    if (rootPkg?.workspaces) {
      result.isMonorepo = true;
      if (!result.tool) {
        // Distinguish yarn vs npm — check for yarn.lock
        const hasYarnLock = await ctx.fileExists('yarn.lock');
        result.tool = hasYarnLock ? 'yarn-workspaces' : 'npm-workspaces';
      }

      // Resolve workspace patterns
      const patterns = Array.isArray(rootPkg.workspaces)
        ? rootPkg.workspaces
        : rootPkg.workspaces.packages ?? [];
      result.workspaces = await resolveWorkspaces(ctx, patterns);
    }

    // If monorepo detected via other tool but no workspaces resolved yet,
    // try common patterns
    if (result.isMonorepo && result.workspaces.length === 0) {
      result.workspaces = await resolveWorkspaces(ctx, [
        'packages/*',
        'apps/*',
        'libs/*',
      ]);
    }

    return result;
  },
};
