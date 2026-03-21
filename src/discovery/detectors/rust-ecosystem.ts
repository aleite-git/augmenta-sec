import type {Detector, DetectorContext} from '../types.js';
import type {RustEcosystemInfo} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known Rust web / async frameworks. */
const RUST_FRAMEWORKS: Record<string, string> = {
  actix: 'actix-web',
  'actix-web': 'actix-web',
  axum: 'axum',
  rocket: 'rocket',
  warp: 'warp',
  hyper: 'hyper',
  tide: 'tide',
  poem: 'poem',
  tonic: 'tonic',
  tower: 'tower',
  diesel: 'diesel',
  'sea-orm': 'sea-orm',
  sqlx: 'sqlx',
  tokio: 'tokio',
  'async-std': 'async-std',
  serde: 'serde',
  reqwest: 'reqwest',
};

/** Security-related Rust crates. */
const SECURITY_CRATES: Record<string, string> = {
  'cargo-audit': 'cargo-audit',
  'cargo-deny': 'cargo-deny',
  rustls: 'rustls',
  ring: 'ring',
  'rust-crypto': 'rust-crypto',
  sodiumoxide: 'sodiumoxide',
  argon2: 'argon2',
  bcrypt: 'bcrypt',
  jsonwebtoken: 'jsonwebtoken',
  oauth2: 'oauth2',
  openssl: 'openssl',
  'native-tls': 'native-tls',
  secrecy: 'secrecy',
  zeroize: 'zeroize',
  tracing: 'tracing',
  'tower-http': 'tower-http',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CargoTomlParsed {
  edition?: string;
  rustVersion?: string;
  dependencies: string[];
  isWorkspace: boolean;
  workspaceMembers: string[];
}

/**
 * Parses a Cargo.toml for the fields we care about.
 * Not a full TOML parser — handles the subset needed for dependency detection.
 */
function parseCargoToml(content: string): CargoTomlParsed {
  const result: CargoTomlParsed = {
    dependencies: [],
    isWorkspace: false,
    workspaceMembers: [],
  };

  const lines = content.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Section header
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Key-value pairs
    const kvMatch = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    if (currentSection === 'package') {
      if (key === 'edition') {
        result.edition = value.replace(/['"]/g, '');
      }
      if (key === 'rust-version') {
        result.rustVersion = value.replace(/['"]/g, '');
      }
    }

    // Dependencies: [dependencies], [dev-dependencies], [build-dependencies]
    if (currentSection.match(/^(?:dev-)?(?:build-)?dependencies$/)) {
      result.dependencies.push(key);
    }

    // Workspace members
    if (currentSection === 'workspace' && key === 'members') {
      // Handle inline array: members = ["a", "b"]
      if (value.startsWith('[') && value.endsWith(']')) {
        const items = value
          .slice(1, -1)
          .split(',')
          .map(s => s.replace(/['"]/g, '').trim())
          .filter(Boolean);
        result.workspaceMembers.push(...items);
      } else if (value === '[') {
        // Multi-line array
        for (let j = i + 1; j < lines.length; j++) {
          const arrayLine = lines[j].trim();
          if (arrayLine === ']') {
            i = j;
            break;
          }
          const item = arrayLine.replace(/['"`,]/g, '').trim();
          if (item && !item.startsWith('#')) {
            result.workspaceMembers.push(item);
          }
        }
      }
      result.isWorkspace = true;
    }
  }

  // Also check for [workspace] section presence even without members
  if (content.includes('[workspace]')) {
    result.isWorkspace = true;
  }

  return result;
}

/**
 * Counts the number of crates in a Cargo.lock file.
 * Each [[package]] entry is one crate.
 */
function countCrates(lockContent: string): number {
  const matches = lockContent.match(/^\[\[package\]\]/gm);
  return matches?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const rustEcosystemDetector: Detector<RustEcosystemInfo> = {
  name: 'rust-ecosystem',

  async detect(ctx: DetectorContext): Promise<RustEcosystemInfo> {
    const hasCargoToml = await ctx.fileExists('Cargo.toml');

    if (!hasCargoToml) {
      return {
        detected: false,
        hasCargoLock: false,
        crateCount: 0,
        hasUnsafeBlocks: false,
        unsafeFileCount: 0,
        frameworks: [],
        securityDeps: [],
        isWorkspace: false,
        workspaceMembers: [],
      };
    }

    const cargoContent = await ctx.readFile('Cargo.toml');
    const parsed = cargoContent
      ? parseCargoToml(cargoContent)
      : {
          dependencies: [],
          isWorkspace: false,
          workspaceMembers: [] as string[],
        };

    // Check Cargo.lock
    const hasCargoLock = await ctx.fileExists('Cargo.lock');
    let crateCount = 0;
    if (hasCargoLock) {
      const lockContent = await ctx.readFile('Cargo.lock');
      if (lockContent) {
        crateCount = countCrates(lockContent);
      }
    }

    // Grep for unsafe blocks/functions
    const unsafeMatches = await ctx.grep(
      /\bunsafe\s*\{|\bunsafe\s+fn\b/,
      ['**/*.rs'],
      {maxMatches: 200},
    );
    const unsafeFiles = new Set(unsafeMatches.map(m => m.file));

    // Detect frameworks
    const depSet = new Set(parsed.dependencies.map(d => d.toLowerCase()));
    const frameworks: string[] = [];
    for (const [crate, name] of Object.entries(RUST_FRAMEWORKS)) {
      if (depSet.has(crate)) {
        frameworks.push(name);
      }
    }

    // Detect security deps
    const securityDeps: string[] = [];
    for (const [crate, name] of Object.entries(SECURITY_CRATES)) {
      if (depSet.has(crate)) {
        securityDeps.push(name);
      }
    }

    return {
      detected: true,
      cargoTomlFile: 'Cargo.toml',
      edition: parsed.edition,
      rustVersion: parsed.rustVersion,
      hasCargoLock,
      crateCount,
      hasUnsafeBlocks: unsafeFiles.size > 0,
      unsafeFileCount: unsafeFiles.size,
      frameworks,
      securityDeps,
      isWorkspace: parsed.isWorkspace,
      workspaceMembers: parsed.workspaceMembers,
    };
  },
};
