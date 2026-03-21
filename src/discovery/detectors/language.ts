import {extname} from 'node:path';
import type {Detector, DetectorContext, LanguageInfo, LanguageEntry} from '../types.js';

/** Maps manifest files to their language/ecosystem. */
const MANIFEST_MAP: Record<string, {language: string; ecosystem: string}> = {
  'package.json':     {language: 'javascript', ecosystem: 'node'},
  'tsconfig.json':    {language: 'typescript', ecosystem: 'node'},
  'requirements.txt': {language: 'python', ecosystem: 'python'},
  'pyproject.toml':   {language: 'python', ecosystem: 'python'},
  'Pipfile':          {language: 'python', ecosystem: 'python'},
  'setup.py':         {language: 'python', ecosystem: 'python'},
  'go.mod':           {language: 'go', ecosystem: 'go'},
  'Cargo.toml':       {language: 'rust', ecosystem: 'rust'},
  'pom.xml':          {language: 'java', ecosystem: 'jvm'},
  'build.gradle':     {language: 'java', ecosystem: 'jvm'},
  'build.gradle.kts': {language: 'kotlin', ecosystem: 'jvm'},
  'Gemfile':          {language: 'ruby', ecosystem: 'ruby'},
  'composer.json':    {language: 'php', ecosystem: 'php'},
  'mix.exs':          {language: 'elixir', ecosystem: 'beam'},
  'Package.swift':    {language: 'swift', ecosystem: 'apple'},
  'pubspec.yaml':     {language: 'dart', ecosystem: 'flutter'},
  'CMakeLists.txt':   {language: 'cpp', ecosystem: 'cmake'},
};

/** Maps file extensions to language names. */
const EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.swift': 'swift',
  '.dart': 'dart',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.scala': 'scala',
  '.clj': 'clojure',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

export const languageDetector: Detector<LanguageInfo> = {
  name: 'language',

  async detect(ctx: DetectorContext): Promise<LanguageInfo> {
    // 1. Detect manifests for ecosystem signals
    const ecosystems = new Set<string>();
    for (const [manifest, info] of Object.entries(MANIFEST_MAP)) {
      if (await ctx.fileExists(manifest)) {
        ecosystems.add(info.ecosystem);
      }
    }

    // 2. If TypeScript config exists, promote TS over JS
    const hasTypeScript = await ctx.fileExists('tsconfig.json');

    // 3. Count source files by extension
    const sourceFiles = await ctx.findFiles([
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs',
      '**/*.py', '**/*.go', '**/*.rs', '**/*.java', '**/*.kt',
      '**/*.rb', '**/*.php', '**/*.ex', '**/*.exs', '**/*.swift',
      '**/*.dart', '**/*.cs', '**/*.cpp', '**/*.cc', '**/*.c',
      '**/*.scala', '**/*.clj', '**/*.vue', '**/*.svelte',
    ]);

    const counts = new Map<string, number>();
    for (const file of sourceFiles) {
      const ext = extname(file);
      const lang = EXTENSION_MAP[ext];
      if (lang) {
        counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }

    // If tsconfig exists and there are .ts files, merge JS count into TS
    // since JS files in a TS project are typically config/build files
    if (hasTypeScript && (counts.get('typescript') ?? 0) > 0) {
      // Keep JS count separate but consider TS as primary
    }

    const total = sourceFiles.length || 1;
    const entries: LanguageEntry[] = [...counts.entries()]
      .map(([name, fileCount]) => ({
        name,
        fileCount,
        percentage: Math.round((fileCount / total) * 100),
      }))
      .sort((a, b) => b.fileCount - a.fileCount);

    const primary = entries[0]?.name ?? 'unknown';

    return {primary, all: entries};
  },
};
