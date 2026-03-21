import {readFile as fsReadFile} from 'node:fs/promises';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import fg from 'fast-glob';
import YAML from 'yaml';
import type {DetectorContext, GrepMatch, GrepOptions} from '../discovery/types.js';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/target/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.augmenta-sec/**',
];

export async function findFiles(
  rootDir: string,
  patterns: string[],
  ignore: string[] = DEFAULT_IGNORE,
): Promise<string[]> {
  return fg(patterns, {cwd: rootDir, ignore, dot: true, onlyFiles: true});
}

export async function readTextFile(
  filePath: string,
): Promise<string | null> {
  try {
    return await fsReadFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function readJsonFile<T = unknown>(
  filePath: string,
): Promise<T | null> {
  const content = await readTextFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function readYamlFile<T = unknown>(
  filePath: string,
): Promise<T | null> {
  const content = await readTextFile(filePath);
  if (!content) return null;
  try {
    return YAML.parse(content) as T;
  } catch {
    return null;
  }
}

export async function grep(
  rootDir: string,
  pattern: RegExp,
  filePatterns: string[],
  options: GrepOptions = {},
): Promise<GrepMatch[]> {
  const {maxFiles = 500, maxMatches = 200} = options;
  const files = await findFiles(rootDir, filePatterns);
  const limited = files.slice(0, maxFiles);
  const matches: GrepMatch[] = [];

  for (const file of limited) {
    if (matches.length >= maxMatches) break;
    const content = await readTextFile(join(rootDir, file));
    if (!content) continue;

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
}

export function createDetectorContext(rootDir: string): DetectorContext {
  return {
    rootDir,
    findFiles: (patterns: string[]) => findFiles(rootDir, patterns),
    readFile: (relativePath: string) =>
      readTextFile(join(rootDir, relativePath)),
    readJson: <T = unknown>(relativePath: string) =>
      readJsonFile<T>(join(rootDir, relativePath)),
    readYaml: <T = unknown>(relativePath: string) =>
      readYamlFile<T>(join(rootDir, relativePath)),
    fileExists: async (relativePath: string) =>
      existsSync(join(rootDir, relativePath)),
    grep: (p: RegExp, fp: string[], o?: GrepOptions) =>
      grep(rootDir, p, fp, o),
  };
}
