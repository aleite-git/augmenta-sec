import type {Detector, DetectorContext, DockerInfo} from '../types.js';

/**
 * Parses a Dockerfile's content for security-relevant information:
 * base images, multi-stage builds, non-root USER, HEALTHCHECK.
 */
function parseDockerfile(content: string): {
  baseImages: string[];
  hasMultiStage: boolean;
  usesNonRoot: boolean;
  healthCheck: boolean;
} {
  const lines = content.split('\n');
  const baseImages: string[] = [];
  let usesNonRoot = false;
  let healthCheck = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // FROM directives — extract base image (ignore "AS alias")
    const fromMatch = trimmed.match(/^FROM\s+(\S+)/i);
    if (fromMatch) {
      const image = fromMatch[1];
      // Skip ARG-based variable references like ${BASE_IMAGE}
      if (!image.startsWith('$')) {
        baseImages.push(image);
      }
    }

    // USER directive — check for non-root
    const userMatch = trimmed.match(/^USER\s+(\S+)/i);
    if (userMatch) {
      const user = userMatch[1];
      if (user !== 'root' && user !== '0') {
        usesNonRoot = true;
      }
    }

    // HEALTHCHECK directive
    if (/^HEALTHCHECK\s/i.test(trimmed)) {
      healthCheck = true;
    }
  }

  const hasMultiStage = baseImages.length > 1;

  return {baseImages, hasMultiStage, usesNonRoot, healthCheck};
}

export const dockerDetector: Detector<DockerInfo> = {
  name: 'docker',

  async detect(ctx: DetectorContext): Promise<DockerInfo> {
    // ── Find Dockerfiles ──
    const dockerfilePatterns = ['**/Dockerfile', '**/Dockerfile.*', '**/*.dockerfile'];
    const dockerfiles = await ctx.findFiles(dockerfilePatterns);

    // ── Find compose files ──
    const composePatterns = [
      '**/docker-compose.yml',
      '**/docker-compose.yaml',
      '**/docker-compose.*.yml',
      '**/docker-compose.*.yaml',
      '**/compose.yaml',
      '**/compose.yml',
    ];
    const composeFiles = await ctx.findFiles(composePatterns);

    const hasDocker = dockerfiles.length > 0;
    const hasCompose = composeFiles.length > 0;

    if (!hasDocker) {
      return {
        hasDocker: false,
        dockerfiles: [],
        hasCompose,
        composeFiles,
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: false,
      };
    }

    // ── Parse all Dockerfiles ──
    const allBaseImages = new Set<string>();
    let anyNonRoot = false;
    let anyMultiStage = false;
    let anyHealthCheck = false;

    for (const df of dockerfiles) {
      const content = await ctx.readFile(df);
      if (!content) continue;

      const parsed = parseDockerfile(content);
      for (const img of parsed.baseImages) {
        allBaseImages.add(img);
      }
      if (parsed.usesNonRoot) anyNonRoot = true;
      if (parsed.hasMultiStage) anyMultiStage = true;
      if (parsed.healthCheck) anyHealthCheck = true;
    }

    return {
      hasDocker: true,
      dockerfiles,
      hasCompose,
      composeFiles,
      baseImages: [...allBaseImages],
      usesNonRoot: anyNonRoot,
      hasMultiStage: anyMultiStage,
      healthCheck: anyHealthCheck,
    };
  },
};
