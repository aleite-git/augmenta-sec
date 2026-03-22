/**
 * Compliance mapping for AugmentaSec findings.
 *
 * Maps findings to OWASP Top 10 (2021), CWE Top 25 (2023), and SANS Top 25
 * frameworks using CWE IDs, category keywords, and rule ID patterns.
 */

import type {Finding} from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported compliance frameworks. */
export type ComplianceFramework = 'owasp-top-10' | 'cwe-top-25' | 'sans-25';

/** A single mapping from a finding to a compliance item. */
export interface ComplianceMapping {
  /** The framework this mapping belongs to. */
  framework: ComplianceFramework;
  /** Framework-specific identifier (e.g. "A01", "CWE-787"). */
  id: string;
  /** Short name of the compliance item. */
  name: string;
  /** Brief description of the compliance item. */
  description: string;
}

/** Compliance report for a set of findings against one or more frameworks. */
export interface ComplianceReport {
  /** The framework this report covers. */
  framework: ComplianceFramework;
  /** Items from the framework that have at least one finding mapped to them. */
  coveredItems: string[];
  /** Items from the framework that have no findings mapped to them. */
  uncoveredItems: string[];
  /** Map from framework item ID to the findings that match it. */
  findingsByItem: Record<string, Finding[]>;
}

// ---------------------------------------------------------------------------
// OWASP Top 10 (2021)
// ---------------------------------------------------------------------------

interface FrameworkItem {
  id: string;
  name: string;
  description: string;
  /** CWE IDs associated with this item. */
  cwes: string[];
  /** Category keywords that map to this item. */
  keywords: string[];
}

const OWASP_TOP_10: FrameworkItem[] = [
  {
    id: 'A01',
    name: 'Broken Access Control',
    description:
      'Failures related to access control enforcement, allowing users to act outside intended permissions.',
    cwes: [
      'CWE-22', 'CWE-23', 'CWE-35', 'CWE-59', 'CWE-200', 'CWE-201',
      'CWE-219', 'CWE-264', 'CWE-275', 'CWE-276', 'CWE-284', 'CWE-285',
      'CWE-352', 'CWE-359', 'CWE-377', 'CWE-402', 'CWE-425', 'CWE-441',
      'CWE-497', 'CWE-538', 'CWE-540', 'CWE-548', 'CWE-552', 'CWE-566',
      'CWE-601', 'CWE-639', 'CWE-651', 'CWE-668', 'CWE-706', 'CWE-862',
      'CWE-863', 'CWE-913', 'CWE-922', 'CWE-1275',
    ],
    keywords: ['access control', 'authorization', 'idor', 'path traversal', 'privilege'],
  },
  {
    id: 'A02',
    name: 'Cryptographic Failures',
    description:
      'Failures related to cryptography that lead to sensitive data exposure.',
    cwes: [
      'CWE-261', 'CWE-296', 'CWE-310', 'CWE-319', 'CWE-321', 'CWE-322',
      'CWE-323', 'CWE-324', 'CWE-325', 'CWE-326', 'CWE-327', 'CWE-328',
      'CWE-329', 'CWE-330', 'CWE-331', 'CWE-335', 'CWE-336', 'CWE-337',
      'CWE-338', 'CWE-340', 'CWE-347', 'CWE-523', 'CWE-720', 'CWE-757',
      'CWE-759', 'CWE-760', 'CWE-780', 'CWE-818', 'CWE-916',
    ],
    keywords: ['crypto', 'encryption', 'tls', 'ssl', 'hash', 'cipher', 'key management'],
  },
  {
    id: 'A03',
    name: 'Injection',
    description:
      'Injection flaws such as SQL, NoSQL, OS, and LDAP injection.',
    cwes: [
      'CWE-20', 'CWE-74', 'CWE-75', 'CWE-77', 'CWE-78', 'CWE-79',
      'CWE-80', 'CWE-83', 'CWE-87', 'CWE-88', 'CWE-89', 'CWE-90',
      'CWE-91', 'CWE-93', 'CWE-94', 'CWE-95', 'CWE-96', 'CWE-97',
      'CWE-98', 'CWE-99', 'CWE-100', 'CWE-113', 'CWE-116', 'CWE-138',
      'CWE-184', 'CWE-470', 'CWE-471', 'CWE-564', 'CWE-610', 'CWE-643',
      'CWE-644', 'CWE-652', 'CWE-917',
    ],
    keywords: ['injection', 'sql', 'xss', 'command injection', 'ldap', 'xpath'],
  },
  {
    id: 'A04',
    name: 'Insecure Design',
    description:
      'Risks related to design and architectural flaws.',
    cwes: [
      'CWE-73', 'CWE-183', 'CWE-209', 'CWE-213', 'CWE-235', 'CWE-256',
      'CWE-257', 'CWE-266', 'CWE-269', 'CWE-280', 'CWE-311', 'CWE-312',
      'CWE-313', 'CWE-316', 'CWE-419', 'CWE-430', 'CWE-434', 'CWE-444',
      'CWE-451', 'CWE-472', 'CWE-501', 'CWE-522', 'CWE-525', 'CWE-539',
      'CWE-579', 'CWE-598', 'CWE-602', 'CWE-642', 'CWE-646', 'CWE-650',
      'CWE-653', 'CWE-656', 'CWE-657', 'CWE-799', 'CWE-807', 'CWE-840',
      'CWE-841', 'CWE-927', 'CWE-1021', 'CWE-1173',
    ],
    keywords: ['insecure design', 'design flaw', 'business logic'],
  },
  {
    id: 'A05',
    name: 'Security Misconfiguration',
    description:
      'Missing or incorrect security hardening, default configs, verbose errors.',
    cwes: [
      'CWE-2', 'CWE-11', 'CWE-13', 'CWE-15', 'CWE-16', 'CWE-260',
      'CWE-315', 'CWE-520', 'CWE-526', 'CWE-537', 'CWE-541', 'CWE-547',
      'CWE-611', 'CWE-614', 'CWE-756', 'CWE-776', 'CWE-942', 'CWE-1004',
      'CWE-1032', 'CWE-1174',
    ],
    keywords: ['misconfiguration', 'default', 'hardening', 'cors', 'xxe'],
  },
  {
    id: 'A06',
    name: 'Vulnerable and Outdated Components',
    description:
      'Using components with known vulnerabilities.',
    cwes: ['CWE-1035', 'CWE-1104'],
    keywords: ['dependency', 'outdated', 'vulnerable component', 'cve', 'supply chain'],
  },
  {
    id: 'A07',
    name: 'Identification and Authentication Failures',
    description:
      'Authentication-related flaws including credential stuffing, weak passwords.',
    cwes: [
      'CWE-255', 'CWE-259', 'CWE-287', 'CWE-288', 'CWE-290', 'CWE-294',
      'CWE-295', 'CWE-297', 'CWE-300', 'CWE-302', 'CWE-304', 'CWE-306',
      'CWE-307', 'CWE-346', 'CWE-384', 'CWE-521', 'CWE-613', 'CWE-620',
      'CWE-640', 'CWE-798', 'CWE-940', 'CWE-1216',
    ],
    keywords: ['authentication', 'auth', 'credential', 'session', 'password', 'brute force'],
  },
  {
    id: 'A08',
    name: 'Software and Data Integrity Failures',
    description:
      'Failures related to software updates, CI/CD pipelines, and deserialization.',
    cwes: [
      'CWE-345', 'CWE-353', 'CWE-426', 'CWE-494', 'CWE-502', 'CWE-565',
      'CWE-784', 'CWE-829', 'CWE-830', 'CWE-915',
    ],
    keywords: ['integrity', 'deserialization', 'ci/cd', 'supply chain', 'prototype pollution'],
  },
  {
    id: 'A09',
    name: 'Security Logging and Monitoring Failures',
    description:
      'Insufficient logging, detection, monitoring, and active response.',
    cwes: ['CWE-117', 'CWE-223', 'CWE-532', 'CWE-778'],
    keywords: ['logging', 'monitoring', 'audit', 'log injection'],
  },
  {
    id: 'A10',
    name: 'Server-Side Request Forgery (SSRF)',
    description:
      'SSRF flaws occur when a web app fetches a remote resource without validating the URL.',
    cwes: ['CWE-918'],
    keywords: ['ssrf', 'server-side request forgery'],
  },
];

// ---------------------------------------------------------------------------
// CWE Top 25 (2023)
// ---------------------------------------------------------------------------

const CWE_TOP_25: FrameworkItem[] = [
  {id: 'CWE-787', name: 'Out-of-bounds Write', description: 'Writing data past the end or before the beginning of a buffer.', cwes: ['CWE-787'], keywords: ['buffer overflow', 'out-of-bounds write']},
  {id: 'CWE-79', name: 'Cross-site Scripting (XSS)', description: 'Improper neutralization of input during web page generation.', cwes: ['CWE-79'], keywords: ['xss', 'cross-site scripting']},
  {id: 'CWE-89', name: 'SQL Injection', description: 'Improper neutralization of special elements used in an SQL command.', cwes: ['CWE-89'], keywords: ['sql injection']},
  {id: 'CWE-416', name: 'Use After Free', description: 'Referencing memory after it has been freed.', cwes: ['CWE-416'], keywords: ['use after free']},
  {id: 'CWE-78', name: 'OS Command Injection', description: 'Improper neutralization of special elements used in an OS command.', cwes: ['CWE-78'], keywords: ['command injection', 'os command']},
  {id: 'CWE-20', name: 'Improper Input Validation', description: 'Not validating or incorrectly validating input.', cwes: ['CWE-20'], keywords: ['input validation']},
  {id: 'CWE-125', name: 'Out-of-bounds Read', description: 'Reading data past the end or before the beginning of a buffer.', cwes: ['CWE-125'], keywords: ['buffer over-read', 'out-of-bounds read']},
  {id: 'CWE-22', name: 'Path Traversal', description: 'Improper limitation of a pathname to a restricted directory.', cwes: ['CWE-22'], keywords: ['path traversal', 'directory traversal']},
  {id: 'CWE-352', name: 'Cross-Site Request Forgery (CSRF)', description: 'Not verifying that a request was intentionally sent by the user.', cwes: ['CWE-352'], keywords: ['csrf', 'cross-site request forgery']},
  {id: 'CWE-434', name: 'Unrestricted Upload of File with Dangerous Type', description: 'Allowing upload of files with dangerous types.', cwes: ['CWE-434'], keywords: ['file upload', 'unrestricted upload']},
  {id: 'CWE-862', name: 'Missing Authorization', description: 'Not performing authorization check on an actor.', cwes: ['CWE-862'], keywords: ['missing authorization', 'authorization bypass']},
  {id: 'CWE-476', name: 'NULL Pointer Dereference', description: 'Dereferencing a pointer that is NULL.', cwes: ['CWE-476'], keywords: ['null pointer', 'null dereference']},
  {id: 'CWE-287', name: 'Improper Authentication', description: 'Not correctly verifying the identity of an actor.', cwes: ['CWE-287'], keywords: ['authentication bypass', 'improper authentication']},
  {id: 'CWE-190', name: 'Integer Overflow or Wraparound', description: 'Integer computation that can overflow or wrap around.', cwes: ['CWE-190'], keywords: ['integer overflow', 'integer wraparound']},
  {id: 'CWE-502', name: 'Deserialization of Untrusted Data', description: 'Deserializing untrusted data without verification.', cwes: ['CWE-502'], keywords: ['deserialization', 'insecure deserialization']},
  {id: 'CWE-77', name: 'Command Injection', description: 'Improper neutralization of special elements used in a command.', cwes: ['CWE-77'], keywords: ['command injection']},
  {id: 'CWE-119', name: 'Improper Restriction of Operations within the Bounds of a Memory Buffer', description: 'Operations on a memory buffer without proper bounds checking.', cwes: ['CWE-119'], keywords: ['buffer overflow', 'memory corruption']},
  {id: 'CWE-798', name: 'Use of Hard-coded Credentials', description: 'Hard-coded credentials in source code.', cwes: ['CWE-798'], keywords: ['hardcoded credential', 'hard-coded password', 'secret']},
  {id: 'CWE-918', name: 'Server-Side Request Forgery (SSRF)', description: 'Server-side request forgery.', cwes: ['CWE-918'], keywords: ['ssrf']},
  {id: 'CWE-306', name: 'Missing Authentication for Critical Function', description: 'Not authenticating users for critical functions.', cwes: ['CWE-306'], keywords: ['missing authentication']},
  {id: 'CWE-362', name: 'Concurrent Execution Using Shared Resource with Improper Synchronization', description: 'Race condition.', cwes: ['CWE-362'], keywords: ['race condition', 'toctou']},
  {id: 'CWE-269', name: 'Improper Privilege Management', description: 'Not properly managing privileges.', cwes: ['CWE-269'], keywords: ['privilege escalation', 'privilege management']},
  {id: 'CWE-94', name: 'Improper Control of Generation of Code', description: 'Code injection.', cwes: ['CWE-94'], keywords: ['code injection', 'eval']},
  {id: 'CWE-863', name: 'Incorrect Authorization', description: 'Authorization check that is incorrect.', cwes: ['CWE-863'], keywords: ['incorrect authorization']},
  {id: 'CWE-276', name: 'Incorrect Default Permissions', description: 'Setting incorrect default permissions.', cwes: ['CWE-276'], keywords: ['default permissions', 'file permissions']},
];

// ---------------------------------------------------------------------------
// SANS Top 25 — same CWEs as CWE Top 25 (SANS uses the CWE list)
// ---------------------------------------------------------------------------

const SANS_TOP_25: FrameworkItem[] = CWE_TOP_25.map((item) => ({
  ...item,
}));

// ---------------------------------------------------------------------------
// Framework registry
// ---------------------------------------------------------------------------

function getFrameworkItems(framework: ComplianceFramework): FrameworkItem[] {
  switch (framework) {
    case 'owasp-top-10':
      return OWASP_TOP_10;
    case 'cwe-top-25':
      return CWE_TOP_25;
    case 'sans-25':
      return SANS_TOP_25;
  }
}

/** Returns all item IDs for a framework. */
function getAllItemIds(framework: ComplianceFramework): string[] {
  return getFrameworkItems(framework).map((item) => item.id);
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/** Checks if a finding matches a framework item by CWE ID. */
function matchesByCwe(finding: Finding, item: FrameworkItem): boolean {
  if (!finding.cweId) return false;
  return item.cwes.includes(finding.cweId);
}

/**
 * Checks if a finding matches a framework item by OWASP category.
 * E.g. `owaspCategory: 'A03:2021-Injection'` matches item with id `A03`.
 */
function matchesByOwaspCategory(
  finding: Finding,
  item: FrameworkItem,
  framework: ComplianceFramework,
): boolean {
  if (framework !== 'owasp-top-10') return false;
  if (!finding.owaspCategory) return false;
  const prefix = finding.owaspCategory.split(':')[0];
  return prefix === item.id;
}

/** Checks if a finding matches a framework item by category keywords. */
function matchesByKeyword(finding: Finding, item: FrameworkItem): boolean {
  const searchText = `${finding.title} ${finding.description} ${finding.category}`.toLowerCase();
  return item.keywords.some((kw) => searchText.includes(kw));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a single finding to all applicable compliance items across all frameworks.
 *
 * Matching is performed by:
 * 1. CWE ID -- direct match against framework CWE lists
 * 2. OWASP category field -- parsed from `owaspCategory` on the finding
 * 3. Category/title keyword -- keyword-based fallback
 *
 * @param finding - The finding to map.
 * @returns An array of {@link ComplianceMapping} entries (may be empty).
 */
export function mapFindingToCompliance(finding: Finding): ComplianceMapping[] {
  const mappings: ComplianceMapping[] = [];
  const seen = new Set<string>();

  const frameworks: ComplianceFramework[] = [
    'owasp-top-10',
    'cwe-top-25',
    'sans-25',
  ];

  for (const framework of frameworks) {
    const items = getFrameworkItems(framework);
    for (const item of items) {
      const key = `${framework}:${item.id}`;
      if (seen.has(key)) continue;

      if (
        matchesByCwe(finding, item) ||
        matchesByOwaspCategory(finding, item, framework) ||
        matchesByKeyword(finding, item)
      ) {
        seen.add(key);
        mappings.push({
          framework,
          id: item.id,
          name: item.name,
          description: item.description,
        });
      }
    }
  }

  return mappings;
}

/**
 * Generates a compliance report for a set of findings against specified frameworks.
 *
 * For each framework, reports which items are covered (have at least one
 * finding mapped) and which are uncovered, along with the findings per item.
 *
 * @param findings - All findings to analyze.
 * @param frameworks - Which frameworks to report on.
 * @returns One {@link ComplianceReport} per requested framework.
 */
export function generateComplianceReport(
  findings: Finding[],
  frameworks: ComplianceFramework[],
): ComplianceReport[] {
  return frameworks.map((framework) => {
    const allIds = getAllItemIds(framework);
    const findingsByItem: Record<string, Finding[]> = {};
    const items = getFrameworkItems(framework);

    // Initialize all items to empty arrays
    for (const id of allIds) {
      findingsByItem[id] = [];
    }

    // Map each finding to framework items
    for (const finding of findings) {
      for (const item of items) {
        if (
          matchesByCwe(finding, item) ||
          matchesByOwaspCategory(finding, item, framework) ||
          matchesByKeyword(finding, item)
        ) {
          findingsByItem[item.id].push(finding);
        }
      }
    }

    const coveredItems = allIds.filter(
      (id) => findingsByItem[id].length > 0,
    );
    const uncoveredItems = allIds.filter(
      (id) => findingsByItem[id].length === 0,
    );

    return {
      framework,
      coveredItems,
      uncoveredItems,
      findingsByItem,
    };
  });
}

// ASEC-019
export function mapToOWASP(finding: Finding): ComplianceMapping[] { return _mapForFw(finding, 'owasp-top-10'); }
export function mapToCWE(finding: Finding): ComplianceMapping[] { return _mapForFw(finding, 'cwe-top-25'); }
export function mapToSANS25(finding: Finding): ComplianceMapping[] { return _mapForFw(finding, 'sans-25'); }
function _mapForFw(finding: Finding, framework: ComplianceFramework): ComplianceMapping[] {
  const mappings: ComplianceMapping[] = [];
  for (const item of getFrameworkItems(framework)) {
    if (matchesByCwe(finding, item) || matchesByOwaspCategory(finding, item, framework) || matchesByKeyword(finding, item)) {
      mappings.push({framework, id: item.id, name: item.name, description: item.description});
    }
  }
  return mappings;
}
export interface ComplianceSummary { reports: ComplianceReport[]; totalFindings: number; totalCovered: number; totalItems: number; coveragePercent: number; }
export function complianceReport(findings: Finding[]): ComplianceSummary {
  const frameworks: ComplianceFramework[] = ['owasp-top-10', 'cwe-top-25', 'sans-25'];
  const reports = generateComplianceReport(findings, frameworks);
  let totalCovered = 0, totalItems = 0;
  for (const r of reports) { totalCovered += r.coveredItems.length; totalItems += r.coveredItems.length + r.uncoveredItems.length; }
  return {reports, totalFindings: findings.length, totalCovered, totalItems, coveragePercent: totalItems > 0 ? Math.round((totalCovered / totalItems) * 100) : 0};
}
