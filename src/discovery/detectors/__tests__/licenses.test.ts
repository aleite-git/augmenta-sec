import {describe, it, expect} from 'vitest';
import type {DetectorContext} from '../../types.js';
import {licenseDetector} from '../licenses.js';

function createMockContext(
  files: Record<string, string>,
): DetectorContext {
  return {
    rootDir: '/mock',
    findFiles: async (patterns: string[]) => {
      return Object.keys(files).filter(f =>
        patterns.some(p => {
          if (p.startsWith('**/')) {
            const rest = p.slice(3);
            if (rest.startsWith('*.')) {
              return f.endsWith(rest.slice(1));
            }
            return f === rest || f.endsWith('/' + rest);
          }
          return f === p || f.endsWith('/' + p);
        }),
      );
    },
    readFile: async (path: string) => files[path] ?? null,
    readJson: async <T = unknown>(path: string) => {
      const content = files[path];
      if (!content) return null;
      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    },
    readYaml: async <T = unknown>(_path: string) => null as T,
    fileExists: async (path: string) => path in files,
    grep: async () => [],
  };
}

describe('licenseDetector', () => {
  it('detects MIT license from LICENSE file', async () => {
    const ctx = createMockContext({
      LICENSE: [
        'MIT License',
        '',
        'Copyright (c) 2024 Test Corp',
        '',
        'Permission is hereby granted, free of charge, to any person obtaining a copy',
      ].join('\n'),
      'package.json': JSON.stringify({name: 'test', license: 'MIT'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('MIT');
    expect(result.licenseFile).toBe('LICENSE');
  });

  it('detects Apache-2.0 license from content', async () => {
    const ctx = createMockContext({
      LICENSE: [
        'Apache License',
        'Version 2.0, January 2004',
        'http://www.apache.org/licenses/',
      ].join('\n'),
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('Apache-2.0');
  });

  it('detects GPL-3.0 as copyleft', async () => {
    const ctx = createMockContext({
      'LICENSE.md': [
        'GNU GENERAL PUBLIC LICENSE',
        'Version 3, 29 June 2007',
        'Copyright (C) 2007 Free Software Foundation, Inc.',
      ].join('\n'),
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('GPL-3.0');
    expect(result.licenseFile).toBe('LICENSE.md');
  });

  it('falls back to package.json license field', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test-pkg',
        license: 'BSD-3-Clause',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('BSD-3-Clause');
    expect(result.licenseFile).toBeUndefined();
  });

  it('scans dependency licenses from node_modules', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        license: 'MIT',
        dependencies: {
          express: '^4.0.0',
          'gpl-lib': '^1.0.0',
          'unknown-lib': '^1.0.0',
        },
      }),
      'node_modules/express/package.json': JSON.stringify({
        name: 'express',
        license: 'MIT',
      }),
      'node_modules/gpl-lib/package.json': JSON.stringify({
        name: 'gpl-lib',
        license: 'GPL-3.0',
      }),
      'node_modules/unknown-lib/package.json': JSON.stringify({
        name: 'unknown-lib',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.dependencyLicenses).toHaveLength(3);

    const express = result.dependencyLicenses.find(
      d => d.package === 'express',
    );
    expect(express?.license).toBe('MIT');
    expect(express?.risk).toBe('none');

    const gpl = result.dependencyLicenses.find(d => d.package === 'gpl-lib');
    expect(gpl?.license).toBe('GPL-3.0');
    expect(gpl?.risk).toBe('copyleft');

    const unknown = result.dependencyLicenses.find(
      d => d.package === 'unknown-lib',
    );
    expect(unknown?.license).toBe('unknown');
    expect(unknown?.risk).toBe('unknown');
  });

  it('reports no license when nothing found', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({name: 'no-license'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBeUndefined();
    expect(result.licenseFile).toBeUndefined();
    expect(result.dependencyLicenses).toHaveLength(0);
  });

  it('limits dependency scan to 20 packages', async () => {
    const deps: Record<string, string> = {};
    const nodeModules: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      const name = `pkg-${i}`;
      deps[name] = '^1.0.0';
      nodeModules[`node_modules/${name}/package.json`] = JSON.stringify({
        name,
        license: 'MIT',
      });
    }

    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'many-deps',
        dependencies: deps,
      }),
      ...nodeModules,
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.dependencyLicenses.length).toBeLessThanOrEqual(20);
  });

  it('detects LICENSE.txt variant', async () => {
    const ctx = createMockContext({
      'LICENSE.txt':
        'ISC License\n\nCopyright (c) 2024\n\nPermission to use, copy, modify...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.licenseFile).toBe('LICENSE.txt');
    expect(result.projectLicense).toBe('ISC');
  });

  it('classifies restrictive licenses correctly', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: {'sspl-lib': '^1.0.0'},
      }),
      'node_modules/sspl-lib/package.json': JSON.stringify({
        name: 'sspl-lib',
        license: 'SSPL-1.0',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    const sspl = result.dependencyLicenses.find(
      d => d.package === 'sspl-lib',
    );
    expect(sspl?.risk).toBe('restrictive');
  });

  it('detects GPL-2.0 license from content', async () => {
    const ctx = createMockContext({
      LICENSE:
        'GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991\nCopyright...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('GPL-2.0');
  });

  it('detects AGPL-3.0 license from content', async () => {
    const ctx = createMockContext({
      LICENSE:
        'GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007\n...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('AGPL-3.0');
  });

  it('detects LGPL-3.0 license from content', async () => {
    const ctx = createMockContext({
      LICENSE:
        'GNU LESSER GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('LGPL-3.0');
  });

  it('detects BSD-3-Clause from content', async () => {
    const ctx = createMockContext({
      LICENSE: 'BSD 3-Clause License\n\nCopyright (c) 2024...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('BSD-3-Clause');
  });

  it('detects BSD-2-Clause from content', async () => {
    const ctx = createMockContext({
      LICENSE: 'Simplified BSD License\n\nCopyright (c) 2024...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('BSD-2-Clause');
  });

  it('detects MPL-2.0 from content', async () => {
    const ctx = createMockContext({
      LICENSE: 'Mozilla Public License Version 2.0\n...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('MPL-2.0');
  });

  it('detects Unlicense from content', async () => {
    const ctx = createMockContext({
      LICENSE:
        'This is free and unencumbered software released into the public domain.\n\nThe Unlicense...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.projectLicense).toBe('Unlicense');
  });

  it('returns undefined for unrecognized license content', async () => {
    const ctx = createMockContext({
      LICENSE: 'Custom proprietary license. All rights reserved.',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.licenseFile).toBe('LICENSE');
    expect(result.projectLicense).toBeUndefined();
  });

  it('detects LICENCE (British spelling) file', async () => {
    const ctx = createMockContext({
      LICENCE:
        'MIT License\n\nPermission is hereby granted, free of charge...',
      'package.json': JSON.stringify({name: 'test'}),
    });

    const result = await licenseDetector.detect(ctx);
    expect(result.licenseFile).toBe('LICENCE');
    expect(result.projectLicense).toBe('MIT');
  });

  it('classifies non-standard copyleft license via fuzzy matching', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: {'copyleft-lib': '^1.0.0'},
      }),
      'node_modules/copyleft-lib/package.json': JSON.stringify({
        name: 'copyleft-lib',
        license: 'Custom-GPL-Variant',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    const dep = result.dependencyLicenses.find(
      d => d.package === 'copyleft-lib',
    );
    expect(dep?.risk).toBe('copyleft');
  });

  it('classifies non-standard restrictive license via fuzzy matching', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: {'bsl-lib': '^1.0.0'},
      }),
      'node_modules/bsl-lib/package.json': JSON.stringify({
        name: 'bsl-lib',
        license: 'Business Source License (BSL)',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    const dep = result.dependencyLicenses.find(d => d.package === 'bsl-lib');
    expect(dep?.risk).toBe('restrictive');
  });

  it('classifies non-standard permissive license via fuzzy matching', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: {'custom-mit': '^1.0.0'},
      }),
      'node_modules/custom-mit/package.json': JSON.stringify({
        name: 'custom-mit',
        license: 'MIT-like',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    const dep = result.dependencyLicenses.find(
      d => d.package === 'custom-mit',
    );
    expect(dep?.risk).toBe('none');
  });

  it('classifies Elastic license as restrictive via fuzzy matching', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: {'elastic-lib': '^1.0.0'},
      }),
      'node_modules/elastic-lib/package.json': JSON.stringify({
        name: 'elastic-lib',
        license: 'Elastic License 2.0 (Custom)',
      }),
    });

    const result = await licenseDetector.detect(ctx);
    const dep = result.dependencyLicenses.find(
      d => d.package === 'elastic-lib',
    );
    expect(dep?.risk).toBe('restrictive');
  });
});
