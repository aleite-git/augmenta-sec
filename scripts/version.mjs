#!/usr/bin/env node

/**
 * Version bump script for augmenta-sec.
 *
 * Usage:
 *   node scripts/version.mjs bump <major|minor|patch|prerelease> [--preid=alpha]
 *
 * Reads package.json, bumps the version, and prepends a new section in CHANGELOG.md.
 */

import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * Parse a semver string into its components.
 * Supports optional prerelease suffix: MAJOR.MINOR.PATCH[-PREID.N]
 */
function parseSemver(version) {
  const match = version.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)\.(\d+))?$/
  );
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    preid: match[4] ?? null,
    preNum: match[5] != null ? parseInt(match[5], 10) : null,
  };
}

/** Format a parsed semver back to a string. */
function formatSemver({major, minor, patch, preid, preNum}) {
  const base = `${major}.${minor}.${patch}`;
  if (preid != null && preNum != null) {
    return `${base}-${preid}.${preNum}`;
  }
  return base;
}

/**
 * Bump a version string according to the release type.
 *
 * @param {string} current - Current version (e.g. "0.1.0")
 * @param {'major'|'minor'|'patch'|'prerelease'} type - Bump type
 * @param {string|undefined} preid - Prerelease identifier (e.g. "alpha")
 * @returns {string} The new version string
 */
function bumpVersion(current, type, preid) {
  const v = parseSemver(current);

  switch (type) {
    case 'major':
      return formatSemver({
        major: v.major + 1,
        minor: 0,
        patch: 0,
        preid: null,
        preNum: null,
      });

    case 'minor':
      return formatSemver({
        major: v.major,
        minor: v.minor + 1,
        patch: 0,
        preid: null,
        preNum: null,
      });

    case 'patch':
      // If currently a prerelease, just drop the prerelease suffix
      if (v.preid != null) {
        return formatSemver({...v, preid: null, preNum: null});
      }
      return formatSemver({
        major: v.major,
        minor: v.minor,
        patch: v.patch + 1,
        preid: null,
        preNum: null,
      });

    case 'prerelease': {
      const id = preid ?? v.preid ?? 'alpha';
      // If already a prerelease with same preid, increment the number
      if (v.preid === id && v.preNum != null) {
        return formatSemver({...v, preid: id, preNum: v.preNum + 1});
      }
      // Otherwise start a new prerelease on next patch
      const nextPatch = v.preid != null ? v.patch : v.patch + 1;
      return formatSemver({
        major: v.major,
        minor: v.minor,
        patch: nextPatch,
        preid: id,
        preNum: 0,
      });
    }

    default:
      throw new Error(
        `Unknown bump type: ${type}. Use major, minor, patch, or prerelease.`
      );
  }
}

/** Prepend a new unreleased section in CHANGELOG.md. */
function updateChangelog(newVersion) {
  const changelogPath = resolve(ROOT, 'CHANGELOG.md');
  const content = readFileSync(changelogPath, 'utf8');

  const today = new Date().toISOString().slice(0, 10);
  const newSection = [
    `## [${newVersion}] - ${today}`,
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Fixed',
    '',
    '',
  ].join('\n');

  // Insert after the first "# Changelog" heading and any preamble
  const insertPoint = content.indexOf('\n## ');
  if (insertPoint === -1) {
    // No existing version section -- append to end
    writeFileSync(changelogPath, content + '\n' + newSection, 'utf8');
  } else {
    const before = content.slice(0, insertPoint + 1);
    const after = content.slice(insertPoint + 1);
    writeFileSync(changelogPath, before + newSection + after, 'utf8');
  }

  return changelogPath;
}

/** Update version in package.json (and package-lock.json if present). */
function updatePackageJson(newVersion) {
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // Also update package-lock.json root version if it exists
  const lockPath = resolve(ROOT, 'package-lock.json');
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = newVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = newVersion;
    }
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  } catch {
    // package-lock.json may not exist; that's fine
  }

  return pkgPath;
}

// --- CLI entry point ---

function printUsage() {
  console.log(
    'Usage: node scripts/version.mjs bump <major|minor|patch|prerelease> [--preid=<id>]'
  );
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/version.mjs bump patch');
  console.log('  node scripts/version.mjs bump minor');
  console.log('  node scripts/version.mjs bump major');
  console.log('  node scripts/version.mjs bump prerelease --preid=alpha');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] !== 'bump') {
    printUsage();
    process.exit(1);
  }

  const type = args[1];
  if (!type || !['major', 'minor', 'patch', 'prerelease'].includes(type)) {
    console.error(`Error: Invalid bump type "${type}".`);
    printUsage();
    process.exit(1);
  }

  // Parse --preid=xxx
  let preid;
  for (const arg of args.slice(2)) {
    if (arg.startsWith('--preid=')) {
      preid = arg.slice('--preid='.length);
    }
  }

  if (type === 'prerelease' && !preid) {
    preid = 'alpha';
  }

  // Read current version
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  // Compute new version
  const newVersion = bumpVersion(currentVersion, type, preid);

  console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

  // Update files
  updatePackageJson(newVersion);
  console.log(`  Updated package.json`);

  updateChangelog(newVersion);
  console.log(`  Updated CHANGELOG.md`);

  console.log('');
  console.log(`Next steps:`);
  console.log(`  git add package.json package-lock.json CHANGELOG.md`);
  console.log(`  git commit -m "chore(release): v${newVersion}"`);
  console.log(`  git tag v${newVersion}`);
  console.log(`  git push origin main --tags`);
}

main();
