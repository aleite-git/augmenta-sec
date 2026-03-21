import type {
  Detector,
  DetectorContext,
  LicenseInfo,
  DependencyLicense,
} from '../types.js';

interface PackageJson {
  name?: string;
  license?: string;
  dependencies?: Record<string, string>;
}

/** Maps license identifiers to risk classification. */
const LICENSE_RISK_MAP: Record<string, DependencyLicense['risk']> = {
  'MIT': 'none',
  'ISC': 'none',
  'BSD-2-Clause': 'none',
  'BSD-3-Clause': 'none',
  'Apache-2.0': 'none',
  '0BSD': 'none',
  'Unlicense': 'none',
  'CC0-1.0': 'none',
  'Zlib': 'none',
  'BlueOak-1.0.0': 'none',

  'GPL-2.0': 'copyleft',
  'GPL-2.0-only': 'copyleft',
  'GPL-2.0-or-later': 'copyleft',
  'GPL-3.0': 'copyleft',
  'GPL-3.0-only': 'copyleft',
  'GPL-3.0-or-later': 'copyleft',
  'AGPL-3.0': 'copyleft',
  'AGPL-3.0-only': 'copyleft',
  'AGPL-3.0-or-later': 'copyleft',
  'LGPL-2.1': 'copyleft',
  'LGPL-2.1-only': 'copyleft',
  'LGPL-2.1-or-later': 'copyleft',
  'LGPL-3.0': 'copyleft',
  'LGPL-3.0-only': 'copyleft',
  'LGPL-3.0-or-later': 'copyleft',
  'MPL-2.0': 'copyleft',
  'EPL-1.0': 'copyleft',
  'EPL-2.0': 'copyleft',

  'SSPL-1.0': 'restrictive',
  'BSL-1.1': 'restrictive',
  'Elastic-2.0': 'restrictive',
  'Commons-Clause': 'restrictive',
};

/** Identifies a license type from the content of a LICENSE file. */
function identifyLicenseFromContent(content: string): string | undefined {
  const upper = content.toUpperCase();
  const first500 = upper.slice(0, 500);

  if (first500.includes('MIT LICENSE') || first500.includes('PERMISSION IS HEREBY GRANTED, FREE OF CHARGE')) {
    return 'MIT';
  }
  if (first500.includes('APACHE LICENSE') && first500.includes('VERSION 2.0')) {
    return 'Apache-2.0';
  }
  if (first500.includes('GNU GENERAL PUBLIC LICENSE') && upper.includes('VERSION 3')) {
    return 'GPL-3.0';
  }
  if (first500.includes('GNU GENERAL PUBLIC LICENSE') && upper.includes('VERSION 2')) {
    return 'GPL-2.0';
  }
  if (first500.includes('GNU AFFERO GENERAL PUBLIC LICENSE')) {
    return 'AGPL-3.0';
  }
  if (first500.includes('GNU LESSER GENERAL PUBLIC LICENSE')) {
    return 'LGPL-3.0';
  }
  if (first500.includes('BSD 3-CLAUSE') || first500.includes('THREE CLAUSE')) {
    return 'BSD-3-Clause';
  }
  if (first500.includes('BSD 2-CLAUSE') || first500.includes('TWO CLAUSE') || first500.includes('SIMPLIFIED BSD')) {
    return 'BSD-2-Clause';
  }
  if (first500.includes('ISC LICENSE')) {
    return 'ISC';
  }
  if (first500.includes('MOZILLA PUBLIC LICENSE')) {
    return 'MPL-2.0';
  }
  if (first500.includes('THE UNLICENSE') || first500.includes('UNLICENSE')) {
    return 'Unlicense';
  }

  return undefined;
}

/** Classifies a license string into a risk level. */
function classifyLicense(license: string): DependencyLicense['risk'] {
  // Direct lookup
  const risk = LICENSE_RISK_MAP[license];
  if (risk) return risk;

  // Fuzzy matching for common variations
  const upper = license.toUpperCase();
  if (upper.includes('MIT') || upper.includes('ISC') || upper.includes('BSD') || upper.includes('APACHE')) {
    return 'none';
  }
  if (upper.includes('GPL') || upper.includes('LGPL') || upper.includes('AGPL') || upper.includes('MPL')) {
    return 'copyleft';
  }
  if (upper.includes('SSPL') || upper.includes('BSL') || upper.includes('ELASTIC')) {
    return 'restrictive';
  }

  return 'unknown';
}

export const licenseDetector: Detector<LicenseInfo> = {
  name: 'licenses',

  async detect(ctx: DetectorContext): Promise<LicenseInfo> {
    const result: LicenseInfo = {
      dependencyLicenses: [],
    };

    // ── Detect project license from file ──
    const licenseFileNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt'];
    for (const name of licenseFileNames) {
      if (await ctx.fileExists(name)) {
        result.licenseFile = name;
        const content = await ctx.readFile(name);
        if (content) {
          const identified = identifyLicenseFromContent(content);
          if (identified) {
            result.projectLicense = identified;
          }
        }
        break;
      }
    }

    // ── Check package.json for license field ──
    const rootPkg = await ctx.readJson<PackageJson>('package.json');
    if (rootPkg?.license && !result.projectLicense) {
      result.projectLicense = rootPkg.license;
    }

    // ── Scan top-level dependencies for license info ──
    if (rootPkg?.dependencies) {
      const depNames = Object.keys(rootPkg.dependencies).slice(0, 20);

      for (const dep of depNames) {
        // node_modules path — handle scoped packages
        const depPath = `node_modules/${dep}/package.json`;
        const depPkg = await ctx.readJson<PackageJson>(depPath);

        if (depPkg) {
          const license = depPkg.license ?? 'unknown';
          result.dependencyLicenses.push({
            package: dep,
            license,
            risk: classifyLicense(license),
          });
        }
      }
    }

    return result;
  },
};
