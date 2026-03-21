import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
  loadPluginFromFile,
  createScannerRegistry,
} from '../plugin.js';
import type {ScannerPlugin} from '../plugin.js';
import type {SecurityScanner, ScanTarget, ScanResult} from '../types.js';

/** Helper: create a valid ScannerPlugin object for testing. */
function createTestPlugin(overrides?: Partial<ScannerPlugin>): ScannerPlugin {
  return {
    name: 'test-plugin',
    category: 'sast',
    metadata: {
      version: '1.0.0',
      description: 'A test scanner plugin',
      author: 'Test Author',
    },
    async isAvailable() {
      return true;
    },
    async scan(_target: ScanTarget): Promise<ScanResult> {
      return {
        scanner: 'test-plugin',
        category: 'sast',
        findings: [],
        duration: 0,
      };
    },
    ...overrides,
  };
}

/** Helper: create a minimal SecurityScanner for registry tests. */
function createTestScanner(
  name: string,
  category: SecurityScanner['category'] = 'sast',
): SecurityScanner {
  return {
    name,
    category,
    async isAvailable() {
      return true;
    },
    async scan(_target: ScanTarget): Promise<ScanResult> {
      return {scanner: name, category, findings: [], duration: 0};
    },
  };
}

// Mock fs/promises.access for loadPluginFromFile tests
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

import {access} from 'node:fs/promises';

const mockAccess = vi.mocked(access);

describe('loadPluginFromFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(undefined);
  });

  it('loads a plugin from a default export', async () => {
    const plugin = createTestPlugin();
    const mockImport = vi.fn().mockResolvedValue({default: plugin});

    const result = await loadPluginFromFile('/path/to/plugin.js', mockImport);
    expect(result.name).toBe('test-plugin');
    expect(result.metadata.version).toBe('1.0.0');
  });

  it('loads a plugin from a named "plugin" export', async () => {
    const plugin = createTestPlugin({name: 'named-plugin'});
    const mockImport = vi.fn().mockResolvedValue({plugin});

    const result = await loadPluginFromFile('/path/to/plugin.js', mockImport);
    expect(result.name).toBe('named-plugin');
  });

  it('resolves factory function exports', async () => {
    const plugin = createTestPlugin({name: 'factory-plugin'});
    const factory = () => plugin;
    const mockImport = vi.fn().mockResolvedValue({default: factory});

    const result = await loadPluginFromFile('/path/to/plugin.js', mockImport);
    expect(result.name).toBe('factory-plugin');
  });

  it('throws when file does not exist', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    await expect(
      loadPluginFromFile('/nonexistent/plugin.js'),
    ).rejects.toThrow('Plugin file not found: /nonexistent/plugin.js');
  });

  it('throws when module has no default or plugin export', async () => {
    const mockImport = vi.fn().mockResolvedValue({somethingElse: 42});

    await expect(
      loadPluginFromFile('/path/to/bad-plugin.js', mockImport),
    ).rejects.toThrow('does not export a default or named');
  });

  it('throws when export does not satisfy ScannerPlugin interface', async () => {
    const invalidPlugin = {name: 'bad', category: 'sast'};
    const mockImport = vi.fn().mockResolvedValue({default: invalidPlugin});

    await expect(
      loadPluginFromFile('/path/to/invalid.js', mockImport),
    ).rejects.toThrow('does not satisfy the ScannerPlugin interface');
  });

  it('throws for export missing metadata', async () => {
    const noMeta = {
      name: 'no-meta',
      category: 'sast',
      isAvailable: async () => true,
      scan: async () => ({scanner: 'x', category: 'sast' as const, findings: [], duration: 0}),
    };
    const mockImport = vi.fn().mockResolvedValue({default: noMeta});

    await expect(
      loadPluginFromFile('/path/to/no-meta.js', mockImport),
    ).rejects.toThrow('does not satisfy the ScannerPlugin interface');
  });

  it('throws for metadata with missing version', async () => {
    const badMeta = {
      name: 'bad-meta',
      category: 'sast',
      isAvailable: async () => true,
      scan: async () => ({scanner: 'x', category: 'sast' as const, findings: [], duration: 0}),
      metadata: {description: 'desc'},
    };
    const mockImport = vi.fn().mockResolvedValue({default: badMeta});

    await expect(
      loadPluginFromFile('/path/to/bad-meta.js', mockImport),
    ).rejects.toThrow('does not satisfy the ScannerPlugin interface');
  });

  it('throws for metadata with missing description', async () => {
    const badMeta = {
      name: 'bad-meta',
      category: 'sast',
      isAvailable: async () => true,
      scan: async () => ({scanner: 'x', category: 'sast' as const, findings: [], duration: 0}),
      metadata: {version: '1.0.0'},
    };
    const mockImport = vi.fn().mockResolvedValue({default: badMeta});

    await expect(
      loadPluginFromFile('/path/to/bad-meta.js', mockImport),
    ).rejects.toThrow('does not satisfy the ScannerPlugin interface');
  });

  it('converts file path to file URL for import', async () => {
    const plugin = createTestPlugin();
    const mockImport = vi.fn().mockResolvedValue({default: plugin});

    await loadPluginFromFile('/some/path/scanner.js', mockImport);

    const importedUrl = mockImport.mock.calls[0][0] as string;
    expect(importedUrl).toMatch(/^file:\/\//);
    expect(importedUrl).toContain('scanner.js');
  });

  it('prefers default export over named plugin export', async () => {
    const defaultPlugin = createTestPlugin({name: 'from-default'});
    const namedPlugin = createTestPlugin({name: 'from-named'});
    const mockImport = vi.fn().mockResolvedValue({
      default: defaultPlugin,
      plugin: namedPlugin,
    });

    const result = await loadPluginFromFile('/path/to/plugin.js', mockImport);
    expect(result.name).toBe('from-default');
  });
});

describe('createScannerRegistry', () => {
  describe('initialization', () => {
    it('creates empty registry when no builtins provided', () => {
      const registry = createScannerRegistry();
      expect(registry.getAll()).toHaveLength(0);
    });

    it('creates empty registry with empty array', () => {
      const registry = createScannerRegistry([]);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('pre-populates with built-in scanners', () => {
      const builtins = [
        createTestScanner('semgrep', 'sast'),
        createTestScanner('trivy', 'sca'),
      ];
      const registry = createScannerRegistry(builtins);
      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe('register', () => {
    it('adds a new scanner', () => {
      const registry = createScannerRegistry();
      const scanner = createTestScanner('new-scanner');
      registry.register(scanner);
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getByName('new-scanner')).toBe(scanner);
    });

    it('throws when registering a duplicate name', () => {
      const registry = createScannerRegistry([
        createTestScanner('existing'),
      ]);
      expect(() => {
        registry.register(createTestScanner('existing'));
      }).toThrow("Scanner 'existing' is already registered");
    });
  });

  describe('unregister', () => {
    it('removes a scanner and returns true', () => {
      const registry = createScannerRegistry([
        createTestScanner('to-remove'),
      ]);
      const removed = registry.unregister('to-remove');
      expect(removed).toBe(true);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('returns false when scanner not found', () => {
      const registry = createScannerRegistry();
      const removed = registry.unregister('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all registered scanners', () => {
      const scanners = [
        createTestScanner('a'),
        createTestScanner('b'),
        createTestScanner('c'),
      ];
      const registry = createScannerRegistry(scanners);
      const all = registry.getAll();
      expect(all).toHaveLength(3);
    });

    it('returns a new array each time', () => {
      const registry = createScannerRegistry([createTestScanner('x')]);
      const a = registry.getAll();
      const b = registry.getAll();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getByName', () => {
    it('finds scanner by exact name', () => {
      const scanner = createTestScanner('target');
      const registry = createScannerRegistry([
        createTestScanner('other'),
        scanner,
      ]);
      expect(registry.getByName('target')).toBe(scanner);
    });

    it('returns undefined when name not found', () => {
      const registry = createScannerRegistry([createTestScanner('a')]);
      expect(registry.getByName('missing')).toBeUndefined();
    });
  });

  describe('getByCategory', () => {
    it('returns all scanners in a category', () => {
      const registry = createScannerRegistry([
        createTestScanner('s1', 'sast'),
        createTestScanner('s2', 'sast'),
        createTestScanner('t1', 'sca'),
        createTestScanner('d1', 'dast'),
      ]);

      const sast = registry.getByCategory('sast');
      expect(sast).toHaveLength(2);
      expect(sast.map(s => s.name).sort()).toEqual(['s1', 's2']);
    });

    it('returns empty array when no scanners match category', () => {
      const registry = createScannerRegistry([
        createTestScanner('s1', 'sast'),
      ]);
      expect(registry.getByCategory('dast')).toHaveLength(0);
    });

    it('includes dynamically registered scanners', () => {
      const registry = createScannerRegistry([
        createTestScanner('builtin', 'sast'),
      ]);
      registry.register(createTestScanner('dynamic', 'sast'));
      expect(registry.getByCategory('sast')).toHaveLength(2);
    });

    it('excludes unregistered scanners', () => {
      const registry = createScannerRegistry([
        createTestScanner('a', 'sast'),
        createTestScanner('b', 'sast'),
      ]);
      registry.unregister('a');
      expect(registry.getByCategory('sast')).toHaveLength(1);
    });
  });

  describe('combined workflows', () => {
    it('register then unregister then re-register', () => {
      const registry = createScannerRegistry();
      const scanner = createTestScanner('reuse');

      registry.register(scanner);
      expect(registry.getByName('reuse')).toBe(scanner);

      registry.unregister('reuse');
      expect(registry.getByName('reuse')).toBeUndefined();

      // Re-register should work after unregister
      registry.register(scanner);
      expect(registry.getByName('reuse')).toBe(scanner);
    });

    it('supports mixed categories in a single registry', () => {
      const registry = createScannerRegistry();
      registry.register(createTestScanner('zap', 'dast'));
      registry.register(createTestScanner('semgrep', 'sast'));
      registry.register(createTestScanner('trivy', 'sca'));
      registry.register(createTestScanner('gitleaks', 'secrets'));
      registry.register(createTestScanner('docker-scan', 'container'));

      expect(registry.getAll()).toHaveLength(5);
      expect(registry.getByCategory('dast')).toHaveLength(1);
      expect(registry.getByCategory('secrets')).toHaveLength(1);
      expect(registry.getByCategory('container')).toHaveLength(1);
    });
  });
});
