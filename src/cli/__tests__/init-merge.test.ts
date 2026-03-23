import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {initCommand} from '../commands/init.js';

vi.mock('../../discovery/engine.js', () => ({
  runDiscovery: vi.fn(),
}));
vi.mock('../../discovery/profile-writer.js', () => ({
  writeProfile: vi.fn(),
}));
vi.mock('../../discovery/profile-merge.js', () => ({
  mergeProfiles: vi.fn(),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));
vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

import {runDiscovery} from '../../discovery/engine.js';
import {writeProfile} from '../../discovery/profile-writer.js';
import {mergeProfiles} from '../../discovery/profile-merge.js';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {parse as parseYaml} from 'yaml';
import type {SecurityProfile} from '../../discovery/types.js';

const mockRunDiscovery = vi.mocked(runDiscovery);
const mockWriteProfile = vi.mocked(writeProfile);
const mockMergeProfiles = vi.mocked(mergeProfiles);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockParseYaml = vi.mocked(parseYaml);

function makeProfile(overrides: Partial<SecurityProfile> = {}): SecurityProfile {
  return {
    project: {name: 'test', description: ''},
    languages: {primary: 'typescript', all: [{name: 'typescript', percentage: 100, files: 10}]},
    frameworks: {backend: [], frontend: [], fullstack: [], orm: [], testing: []},
    auth: {providers: [], mfaSupported: false, sessionManagement: 'unknown'},
    database: {databases: []},
    api: {styles: [], endpoints: [], routeCount: 0},
    securityControls: {present: [], missing: []},
    ci: {platform: 'unknown', workflows: [], securityChecks: []},
    docs: {hasReadme: false, hasSecurityPolicy: false, hasChangelog: false, hasLicense: false, hasContributing: false, architectureDocs: [], aiConfigs: []},
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    ...overrides,
  } as SecurityProfile;
}

describe('initCommand merge behavior', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const origExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = origExitCode;
  });

  it('writes fresh profile when no existing profile exists', async () => {
    const fresh = makeProfile();
    mockExistsSync.mockImplementation((p) => {
      if (String(p).includes('profile.yaml')) return false;
      return true;
    });
    mockRunDiscovery.mockResolvedValue({profile: fresh, duration: 100, warnings: []});
    mockWriteProfile.mockResolvedValue('/test/.augmenta-sec/profile.yaml');

    await initCommand('/test');

    expect(mockMergeProfiles).not.toHaveBeenCalled();
    expect(mockWriteProfile).toHaveBeenCalledWith(fresh, '/test');
  });

  it('merges with existing profile when present', async () => {
    const existing = makeProfile({project: {name: 'test', description: 'My project'}});
    const fresh = makeProfile();
    const merged = makeProfile({project: {name: 'test', description: 'My project'}});

    mockExistsSync.mockReturnValue(true);
    mockRunDiscovery.mockResolvedValue({profile: fresh, duration: 100, warnings: []});
    mockReadFile.mockResolvedValue('yaml-content' as never);
    mockParseYaml.mockReturnValue(existing);
    mockMergeProfiles.mockReturnValue({profile: merged, conflicts: []});
    mockWriteProfile.mockResolvedValue('/test/.augmenta-sec/profile.yaml');

    await initCommand('/test');

    expect(mockMergeProfiles).toHaveBeenCalledWith(existing, fresh);
    expect(mockWriteProfile).toHaveBeenCalledWith(merged, '/test');
  });

  it('displays merge conflicts', async () => {
    const existing = makeProfile();
    const fresh = makeProfile();

    mockExistsSync.mockReturnValue(true);
    mockRunDiscovery.mockResolvedValue({profile: fresh, duration: 100, warnings: []});
    mockReadFile.mockResolvedValue('yaml' as never);
    mockParseYaml.mockReturnValue(existing);
    mockMergeProfiles.mockReturnValue({
      profile: fresh,
      conflicts: [{
        path: 'trustBoundaries.candidates[auth-gate]',
        existingValue: {name: 'auth-gate'},
        freshValue: {name: 'auth-gate'},
        resolution: 'kept-existing' as const,
        reason: 'Manual annotation preserved',
      }],
    });
    mockWriteProfile.mockResolvedValue('/test/.augmenta-sec/profile.yaml');

    await initCommand('/test');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('Merge Conflicts');
  });

  it('sets exitCode on error without crashing', async () => {
    mockExistsSync.mockReturnValue(true);
    mockRunDiscovery.mockRejectedValue(new Error('detector crashed'));

    await initCommand('/test');

    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode when target dir does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await initCommand('/nonexistent');

    expect(process.exitCode).toBe(1);
  });
});
