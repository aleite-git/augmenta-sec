import type {Detector, DetectorContext, DocsInfo} from '../types.js';

/** Standard documentation files to check for. */
const STANDARD_DOCS: Array<{key: keyof Pick<DocsInfo,
  'hasReadme' | 'hasContributing' | 'hasSecurityPolicy' | 'hasChangelog' | 'hasLicense'
>; patterns: string[]}> = [
  {key: 'hasReadme', patterns: ['README.md', 'README.rst', 'README.txt', 'README']},
  {key: 'hasContributing', patterns: ['CONTRIBUTING.md', 'CONTRIBUTING.rst', '.github/CONTRIBUTING.md']},
  {key: 'hasSecurityPolicy', patterns: ['SECURITY.md', '.github/SECURITY.md', 'security.md']},
  {key: 'hasChangelog', patterns: ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md', 'RELEASE_NOTES.md']},
  {key: 'hasLicense', patterns: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md']},
];

/** Patterns for architecture / design documents. */
const ARCH_DOC_PATTERNS = [
  'docs/**/*.md',
  'doc/**/*.md',
  'architecture/**/*.md',
  'design/**/*.md',
  'specs/**/*.md',
  'ADR/**/*.md',
  'adr/**/*.md',
  'decisions/**/*.md',
];

/** AI assistant configuration files. */
const AI_CONFIG_PATTERNS = [
  'CLAUDE.md',
  '.claude/**/*.md',
  '.cursorrules',
  '.cursor/**/*.md',
  '.github/copilot-instructions.md',
  'copilot-instructions.md',
  '.aider*',
  '.continue/**/*',
  'cline_docs/**/*',
  '.clinerules',
];

export const docsDetector: Detector<DocsInfo> = {
  name: 'docs',

  async detect(ctx: DetectorContext): Promise<DocsInfo> {
    const result: DocsInfo = {
      hasReadme: false,
      hasContributing: false,
      hasSecurityPolicy: false,
      hasChangelog: false,
      hasLicense: false,
      architectureDocs: [],
      aiConfigs: [],
    };

    // ── Standard docs ──
    for (const doc of STANDARD_DOCS) {
      for (const pattern of doc.patterns) {
        if (await ctx.fileExists(pattern)) {
          result[doc.key] = true;
          break;
        }
      }
    }

    // ── Architecture / design docs ──
    const archFiles = await ctx.findFiles(ARCH_DOC_PATTERNS);
    result.architectureDocs = archFiles.slice(0, 50); // cap to avoid noise

    // ── AI assistant configs ──
    const aiFiles = await ctx.findFiles(AI_CONFIG_PATTERNS);
    result.aiConfigs = aiFiles;

    return result;
  },
};
