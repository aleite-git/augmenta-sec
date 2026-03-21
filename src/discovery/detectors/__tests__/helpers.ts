/**
 * Shared test helper for detector unit tests.
 *
 * Creates a mock DetectorContext backed by an in-memory virtual filesystem,
 * so that detector tests never touch the real filesystem.
 */
import {vi} from 'vitest';
import type {DetectorContext, GrepMatch, GrepOptions} from '../../types.js';

/**
 * Virtual filesystem definition: maps relative paths to file contents.
 * Use `null` to represent a file that exists but cannot be read.
 */
export type VirtualFs = Record<string, string | null>;

/**
 * Matches a file path against a glob pattern.
 * Supports basic glob features: *, **, ?, {a,b}.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexStr = '^';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches any number of directories
        if (pattern[i + 2] === '/') {
          regexStr += '(?:.+/)?';
          i += 3;
        } else {
          regexStr += '.*';
          i += 2;
        }
      } else {
        // * matches anything except /
        regexStr += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      regexStr += '[^/]';
      i += 1;
    } else if (char === '{') {
      // {a,b,c} alternation
      const closeBrace = pattern.indexOf('}', i);
      if (closeBrace !== -1) {
        const alternatives = pattern.slice(i + 1, closeBrace).split(',');
        regexStr += '(?:' + alternatives.map(escapeRegex).join('|') + ')';
        i = closeBrace + 1;
      } else {
        regexStr += '\\{';
        i += 1;
      }
    } else if (char === '.') {
      regexStr += '\\.';
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr).test(filePath);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates a mock DetectorContext from a virtual filesystem definition.
 */
export function createMockContext(vfs: VirtualFs): DetectorContext {
  const files = Object.keys(vfs);

  const ctx: DetectorContext = {
    rootDir: '/mock-project',

    findFiles: vi.fn(async (patterns: string[]): Promise<string[]> => {
      const matched = new Set<string>();
      for (const pattern of patterns) {
        for (const file of files) {
          if (matchGlob(file, pattern)) {
            matched.add(file);
          }
        }
      }
      return [...matched].sort();
    }),

    readFile: vi.fn(async (relativePath: string): Promise<string | null> => {
      if (relativePath in vfs) {
        return vfs[relativePath];
      }
      return null;
    }),

    readJson: vi.fn(async (relativePath: string) => {
      const content = vfs[relativePath];
      if (content == null) return null;
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }) as DetectorContext['readJson'],

    readYaml: vi.fn(async (relativePath: string) => {
      const content = vfs[relativePath];
      if (content == null) return null;
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }) as DetectorContext['readYaml'],

    fileExists: vi.fn(async (relativePath: string): Promise<boolean> => {
      return relativePath in vfs;
    }),

    grep: vi.fn(async (
      pattern: RegExp,
      filePatterns: string[],
      options?: GrepOptions,
    ): Promise<GrepMatch[]> => {
      const {maxMatches = 200} = options ?? {};
      const matches: GrepMatch[] = [];

      // First, find matching files
      const matchedFiles = new Set<string>();
      for (const fp of filePatterns) {
        for (const file of files) {
          if (matchGlob(file, fp)) {
            matchedFiles.add(file);
          }
        }
      }

      for (const file of matchedFiles) {
        if (matches.length >= maxMatches) break;
        const content = vfs[file];
        if (content == null) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(pattern);
          if (m) {
            matches.push({
              file,
              line: i + 1,
              content: lines[i].trim(),
              match: m[0],
            });
            if (matches.length >= maxMatches) break;
          }
        }
      }

      return matches;
    }),
  };

  return ctx;
}
