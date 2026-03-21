import {basename} from 'node:path';
import {DetectorError, withGracefulDegradation} from '../errors/index.js';
import {createDetectorContext} from '../utils/file-utils.js';
import {logger} from '../utils/logger.js';
import type {SecurityProfile} from './types.js';
import {
  languageDetector,
  frameworkDetector,
  authDetector,
  databaseDetector,
  apiDetector,
  securityControlsDetector,
  ciDetector,
  docsDetector,
  pythonEcosystemDetector,
  goEcosystemDetector,
  rustEcosystemDetector,
  jvmEcosystemDetector,
} from './detectors/index.js';

interface DiscoveryResult {
  profile: SecurityProfile;
  duration: number;
  warnings: string[];
}

/**
 * Runs all detectors against a target directory and assembles
 * a complete SecurityProfile.
 */
export async function runDiscovery(rootDir: string): Promise<DiscoveryResult> {
  const start = performance.now();
  const warnings: string[] = [];
  const ctx = createDetectorContext(rootDir);

  const detectors = [
    {name: languageDetector.name, fn: () => languageDetector.detect(ctx)},
    {name: frameworkDetector.name, fn: () => frameworkDetector.detect(ctx)},
    {name: authDetector.name, fn: () => authDetector.detect(ctx)},
    {name: databaseDetector.name, fn: () => databaseDetector.detect(ctx)},
    {name: apiDetector.name, fn: () => apiDetector.detect(ctx)},
    {name: securityControlsDetector.name, fn: () => securityControlsDetector.detect(ctx)},
    {name: ciDetector.name, fn: () => ciDetector.detect(ctx)},
    {name: docsDetector.name, fn: () => docsDetector.detect(ctx)},
    {name: pythonEcosystemDetector.name, fn: () => pythonEcosystemDetector.detect(ctx)},
    {name: goEcosystemDetector.name, fn: () => goEcosystemDetector.detect(ctx)},
    {name: rustEcosystemDetector.name, fn: () => rustEcosystemDetector.detect(ctx)},
    {name: jvmEcosystemDetector.name, fn: () => jvmEcosystemDetector.detect(ctx)},
  ];

  // Run all detectors in parallel — each is independent
  const results = await Promise.allSettled(
    detectors.map(async d => {
      const t0 = performance.now();
      logger.debug(`Running ${d.name} detector...`);
      const result = await withGracefulDegradation(
        async () => {
          try {
            return await d.fn();
          } catch (err) {
            throw new DetectorError(
              d.name,
              err instanceof Error ? err.message : String(err),
              err instanceof Error ? err : undefined,
            );
          }
        },
        null,
        `${d.name} detector failed`,
      );
      if (result === null) {
        warnings.push(`${d.name} detector failed`);
      } else {
        logger.debug(`${d.name} completed in ${Math.round(performance.now() - t0)}ms`);
      }
      return {name: d.name, result};
    }),
  );

  // Extract results (with fallbacks for failed detectors)
  const resultMap = new Map<string, unknown>();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.result !== null) {
      resultMap.set(r.value.name, r.value.result);
    }
  }

  const profile: SecurityProfile = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    target: rootDir,
    project: {
      name: basename(rootDir),
    },
    languages: (resultMap.get('language') as SecurityProfile['languages']) ?? {
      primary: 'unknown', all: [],
    },
    frameworks: (resultMap.get('framework') as SecurityProfile['frameworks']) ?? {
      backend: [], frontend: [], fullstack: [], orm: [], testing: [],
    },
    auth: (resultMap.get('auth') as SecurityProfile['auth']) ?? {
      providers: [], patterns: [],
    },
    database: (resultMap.get('database') as SecurityProfile['database']) ?? {
      databases: [],
    },
    api: (resultMap.get('api') as SecurityProfile['api']) ?? {
      styles: ['unknown'], routeCount: 0, endpoints: [],
    },
    securityControls: (resultMap.get('security-controls') as SecurityProfile['securityControls']) ?? {
      present: [], missing: [],
    },
    ci: (resultMap.get('ci') as SecurityProfile['ci']) ?? {
      platform: 'none', workflows: [], securityChecks: [],
    },
    docs: (resultMap.get('docs') as SecurityProfile['docs']) ?? {
      hasReadme: false, hasContributing: false, hasSecurityPolicy: false,
      hasChangelog: false, hasLicense: false, architectureDocs: [], aiConfigs: [],
    },
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    pythonEcosystem: (resultMap.get('python-ecosystem') as SecurityProfile['pythonEcosystem']) ?? {
      detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [],
      hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false,
      frameworks: [], securityDeps: [],
    },
    goEcosystem: (resultMap.get('go-ecosystem') as SecurityProfile['goEcosystem']) ?? {
      detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0,
      frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false,
    },
    rustEcosystem: (resultMap.get('rust-ecosystem') as SecurityProfile['rustEcosystem']) ?? {
      detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false,
      unsafeFileCount: 0, frameworks: [], securityDeps: [],
      isWorkspace: false, workspaceMembers: [],
    },
    jvmEcosystem: (resultMap.get('jvm-ecosystem') as SecurityProfile['jvmEcosystem']) ?? {
      detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false,
      frameworks: [], securityDeps: [], hasGradleLock: false,
      hasMavenWrapper: false, hasGradleWrapper: false,
    },
  };

  return {
    profile,
    duration: Math.round(performance.now() - start),
    warnings,
  };
}
