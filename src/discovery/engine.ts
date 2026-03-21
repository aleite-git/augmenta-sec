import {basename} from 'node:path';
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
  ];

  // Run all detectors in parallel — each is independent
  const results = await Promise.allSettled(
    detectors.map(async d => {
      const t0 = performance.now();
      logger.debug(`Running ${d.name} detector...`);
      try {
        const result = await d.fn();
        logger.debug(`${d.name} completed in ${Math.round(performance.now() - t0)}ms`);
        return {name: d.name, result};
      } catch (err) {
        const msg = `${d.name} detector failed: ${err instanceof Error ? err.message : String(err)}`;
        warnings.push(msg);
        logger.warn(msg);
        return {name: d.name, result: null};
      }
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
  };

  return {
    profile,
    duration: Math.round(performance.now() - start),
    warnings,
  };
}
