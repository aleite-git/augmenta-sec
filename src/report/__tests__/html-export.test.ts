/**
 * Tests for the offline HTML export (ASEC-155).
 */

import {describe, it, expect} from 'vitest';
import {exportHtml, escapeHtml} from '../html-export.js';
import type {HtmlExportOptions} from '../html-export.js';
import type {Finding, FindingsReport, Severity} from '../../findings/types.js';
import type {SecurityProfile} from '../../discovery/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-id',
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'Test finding',
    description: 'A test finding description.',
    confidence: 0.8,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeReport(overrides: Partial<FindingsReport> = {}): FindingsReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-03-21T12:00:00.000Z',
    target: '/test/project',
    summary: {
      total: 0,
      bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
      byCategory: {},
      bySource: {scanner: 0, llm: 0, manual: 0},
    },
    findings: [],
    ...overrides,
  };
}

function makeMinimalProfile(): SecurityProfile {
  return {
    version: '1.0.0',
    generatedAt: '2026-03-21T12:00:00.000Z',
    target: '/test/project',
    project: {name: 'Test Project', description: 'A test project'},
    languages: {
      primary: 'TypeScript',
      all: [
        {name: 'TypeScript', percentage: 80, fileCount: 100},
        {name: 'JavaScript', percentage: 20, fileCount: 25},
      ],
    },
    frameworks: {
      backend: [{name: 'Express', category: 'backend', confidence: 0.9}],
      frontend: [{name: 'React', category: 'frontend', confidence: 0.8}],
      fullstack: [],
      orm: [{name: 'Drizzle', category: 'orm', confidence: 0.9}],
      testing: [{name: 'Vitest', category: 'testing', confidence: 1.0}],
    },
    auth: {
      providers: [{name: 'Firebase Auth', type: 'third-party', confidence: 0.9, source: 'config'}],
      patterns: [],
    },
    database: {
      databases: [{type: 'PostgreSQL', driver: 'pg', confidence: 0.9}],
    },
    api: {styles: ['REST'], routeCount: 42, endpoints: []},
    securityControls: {
      present: [
        {name: 'Helmet', type: 'middleware', present: true, confidence: 0.9, source: 'package.json'},
        {name: 'Rate limiting', type: 'middleware', present: true, confidence: 0.8, source: 'code'},
      ],
      missing: [],
    },
    ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    docs: {
      hasReadme: true,
      hasContributing: false,
      hasSecurityPolicy: true,
      hasChangelog: true,
      hasLicense: true,
      architectureDocs: [],
      aiConfigs: [],
    },
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: true, platform: 'github'},
    docker: {
      hasDocker: true,
      dockerfiles: ['Dockerfile'],
      hasCompose: false,
      composeFiles: [],
      baseImages: ['node:20-alpine'],
      usesNonRoot: true,
      hasMultiStage: true,
      healthCheck: true,
    },
    iac: {tools: []},
    secrets: {envFiles: [], gitignoresEnv: true, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [], hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false, frameworks: [], securityDeps: []},
    goEcosystem: {detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0, frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false},
    rustEcosystem: {detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false, unsafeFileCount: 0, frameworks: [], securityDeps: [], isWorkspace: false, workspaceMembers: []},
    jvmEcosystem: {detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false, frameworks: [], securityDeps: [], hasGradleLock: false, hasMavenWrapper: false, hasGradleWrapper: false},
  };
}

// ---------------------------------------------------------------------------
// escapeHtml()
// ---------------------------------------------------------------------------

describe('escapeHtml (html-export)', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than and greater-than', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('handles empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles strings with no special characters', () => {
    expect(escapeHtml('normal text')).toBe('normal text');
  });

  it('escapes multiple special characters together', () => {
    expect(escapeHtml('a < b & c > d "e" \'f\'')).toBe(
      'a &lt; b &amp; c &gt; d &quot;e&quot; &#039;f&#039;',
    );
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — HTML structure
// ---------------------------------------------------------------------------

describe('exportHtml — HTML structure', () => {
  it('returns a complete HTML5 document', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('includes meta charset and viewport', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('viewport');
  });

  it('has inline CSS (no external stylesheets)', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('href="http');
  });

  it('has no external script references', () => {
    const html = exportHtml(makeReport());
    // Should not contain external script src
    expect(html).not.toMatch(/<script\s+src=/);
  });

  it('includes inline script for interactivity', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<script>');
    expect(html).toContain('</script>');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — metadata
// ---------------------------------------------------------------------------

describe('exportHtml — scan metadata', () => {
  it('includes the report target', () => {
    const html = exportHtml(makeReport({target: '/my/codebase'}));
    expect(html).toContain('/my/codebase');
  });

  it('includes the generation timestamp', () => {
    const html = exportHtml(
      makeReport({generatedAt: '2026-03-21T15:00:00Z'}),
    );
    expect(html).toContain('2026-03-21T15:00:00Z');
  });

  it('includes the report version in the footer', () => {
    const html = exportHtml(makeReport({version: '3.2.1'}));
    expect(html).toContain('AugmentaSec v3.2.1');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — title option
// ---------------------------------------------------------------------------

describe('exportHtml — title option', () => {
  it('uses default title when not specified', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('AugmentaSec Security Report');
  });

  it('uses custom title when specified', () => {
    const html = exportHtml(makeReport(), {title: 'My Custom Report'});
    expect(html).toContain('My Custom Report');
  });

  it('escapes HTML in custom title', () => {
    const html = exportHtml(makeReport(), {title: '<img onerror=alert(1)>'});
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — severity chart
// ---------------------------------------------------------------------------

describe('exportHtml — severity chart', () => {
  it('includes SVG chart', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');
  });

  it('includes all severity labels in chart', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('critical');
    expect(html).toContain('high');
    expect(html).toContain('medium');
    expect(html).toContain('low');
    expect(html).toContain('informational');
  });

  it('includes accessibility attributes on SVG', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label=');
    expect(html).toContain('<title>');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — executive summary
// ---------------------------------------------------------------------------

describe('exportHtml — executive summary', () => {
  it('shows total findings count', () => {
    const report = makeReport({
      summary: {
        total: 42,
        bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 42, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('>42</div>');
  });

  it('shows Critical risk level for critical findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 1, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('>Critical</div>');
  });

  it('shows High risk level when no critical findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('>High</div>');
  });

  it('shows None risk level when no findings', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('>None</div>');
  });

  it('shows categories', () => {
    const report = makeReport({
      summary: {
        total: 3,
        bySeverity: {critical: 0, high: 3, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 2, auth: 1},
        bySource: {scanner: 3, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('injection: 2');
    expect(html).toContain('auth: 1');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — findings table
// ---------------------------------------------------------------------------

describe('exportHtml — findings table', () => {
  it('includes table headers', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('<th>Severity</th>');
    expect(html).toContain('<th>Title</th>');
    expect(html).toContain('<th>Category</th>');
    expect(html).toContain('<th>Location</th>');
    expect(html).toContain('<th>Source</th>');
    expect(html).toContain('<th>CWE</th>');
    expect(html).toContain('<th>OWASP</th>');
  });

  it('renders finding rows with correct data', () => {
    const finding = makeFinding({
      severity: 'critical',
      title: 'SQL Injection',
      category: 'injection',
      file: 'src/db.ts',
      line: 42,
      source: 'scanner',
      scanner: 'semgrep',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
    });
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 1, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });

    const html = exportHtml(report);
    expect(html).toContain('SQL Injection');
    expect(html).toContain('src/db.ts:42');
    expect(html).toContain('semgrep');
    expect(html).toContain('CWE-89');
    expect(html).toContain('A03:2021-Injection');
  });

  it('shows "No findings" when findings array is empty', () => {
    const html = exportHtml(makeReport());
    expect(html).toContain('No findings');
  });

  it('sorts findings by severity (critical first)', () => {
    const findings = [
      makeFinding({id: '1', severity: 'low', title: 'Low finding'}),
      makeFinding({id: '2', severity: 'critical', title: 'Critical finding'}),
      makeFinding({id: '3', severity: 'medium', title: 'Medium finding'}),
    ];
    const report = makeReport({findings});
    const html = exportHtml(report);

    const critIdx = html.indexOf('Critical finding');
    const medIdx = html.indexOf('Medium finding');
    const lowIdx = html.indexOf('Low finding');

    expect(critIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('renders dash for missing location', () => {
    const finding = makeFinding({file: undefined, line: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('\u2014');
  });

  it('renders dash for missing CWE', () => {
    const finding = makeFinding({cweId: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    // Should have a dash for CWE
    expect(html).toMatch(/\u2014/);
  });

  it('renders dash for missing OWASP', () => {
    const finding = makeFinding({owaspCategory: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toMatch(/\u2014/);
  });

  it('includes finding detail rows (hidden by default)', () => {
    const finding = makeFinding({description: 'Detailed description here.'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('detail-0');
    expect(html).toContain('display:none');
    expect(html).toContain('Detailed description here.');
  });

  it('includes suggested fix in detail row', () => {
    const finding = makeFinding({suggestedFix: 'Use parameterized queries.'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).toContain('Suggested fix:');
    expect(html).toContain('Use parameterized queries.');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — XSS prevention
// ---------------------------------------------------------------------------

describe('exportHtml — XSS prevention', () => {
  it('escapes HTML in finding titles', () => {
    const finding = makeFinding({title: '<script>alert("xss")</script>'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in target name', () => {
    const report = makeReport({target: '<img onerror=alert(1)>'});
    const html = exportHtml(report);
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img');
  });

  it('escapes HTML in file paths', () => {
    const finding = makeFinding({file: '"><script>alert(1)</script>'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('escapes HTML in descriptions', () => {
    const finding = makeFinding({
      description: 'Contains <b>bold</b> and <script>evil</script>',
    });
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });

  it('escapes HTML in categories', () => {
    const finding = makeFinding({category: '<img src=x>'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {'<img src=x>': 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).not.toContain('<img src=x>');
  });

  it('escapes HTML in scanner names', () => {
    const finding = makeFinding({scanner: '"><script>x</script>'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const html = exportHtml(report);
    expect(html).not.toContain('"><script>x</script>');
  });
});

// ---------------------------------------------------------------------------
// exportHtml() — profile section
// ---------------------------------------------------------------------------

describe('exportHtml — includeProfile option', () => {
  it('does not include profile section by default', () => {
    const html = exportHtml(makeReport());
    expect(html).not.toContain('Profile Summary');
  });

  it('does not include profile section when includeProfile is false', () => {
    const html = exportHtml(makeReport(), {includeProfile: false});
    expect(html).not.toContain('Profile Summary');
  });

  it('does not include profile section when includeProfile is true but no profile provided', () => {
    const html = exportHtml(makeReport(), {includeProfile: true});
    expect(html).not.toContain('Profile Summary');
  });

  it('includes profile section when includeProfile is true and profile provided', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('Profile Summary');
  });

  it('shows languages in profile section', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('TypeScript');
    expect(html).toContain('80%');
  });

  it('shows frameworks in profile section', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('Express');
    expect(html).toContain('React');
  });

  it('shows auth providers in profile section', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('Firebase Auth');
  });

  it('shows databases in profile section', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('PostgreSQL');
  });

  it('shows security controls in profile section', () => {
    const profile = makeMinimalProfile();
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('Helmet');
    expect(html).toContain('Rate limiting');
  });

  it('shows "None detected" for empty profile fields', () => {
    const profile = makeMinimalProfile();
    profile.frameworks = {backend: [], frontend: [], fullstack: [], orm: [], testing: []};
    profile.auth.providers = [];
    profile.database.databases = [];
    profile.securityControls.present = [];
    const html = exportHtml(makeReport(), {
      includeProfile: true,
      profile,
    });
    expect(html).toContain('None detected');
  });
});
