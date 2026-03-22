import {describe, it, expect} from 'vitest';
import {
  parseSprintFile,
  filterOpenBranches,
  detectFreeze,
  getTeamActivity,
  getLocalBranches,
} from '../activity.js';
import type {SprintInfo, BranchInfo} from '../activity.js';

// ---------------------------------------------------------------------------
// parseSprintFile
// ---------------------------------------------------------------------------

describe('parseSprintFile', () => {
  it('parses a sprint file with mixed statuses', () => {
    const content = `# Sprint 5

- [x] **SEC-001** — Fix XSS vulnerability (P1, 4h)
- [ ] **SEC-002** — Add rate limiting (P2, 8h) 🔄
- [ ] **SEC-003** — Update dependencies (P3, 2h)
`;

    const result = parseSprintFile(content);

    expect(result.number).toBe(5);
    expect(result.totalTickets).toBe(3);
    expect(result.doneCount).toBe(1);
    expect(result.inProgressCount).toBe(1);
    expect(result.todoCount).toBe(1);
  });

  it('extracts ticket IDs and priorities', () => {
    const content = `# Sprint 10

- [x] **ASEC-100** — CodeQL adapter (P1, 8h)
- [ ] **ASEC-101** — Trivy adapter (P2, 4h)
`;

    const result = parseSprintFile(content);

    expect(result.tickets).toHaveLength(2);
    expect(result.tickets[0].id).toBe('ASEC-100');
    expect(result.tickets[0].status).toBe('done');
    expect(result.tickets[0].priority).toBe('P1');
    expect(result.tickets[1].id).toBe('ASEC-101');
    expect(result.tickets[1].status).toBe('todo');
    expect(result.tickets[1].priority).toBe('P2');
  });

  it('returns sprint number 0 when heading has no number', () => {
    const content = `# Current Work

- [x] **BUG-001** — Fix crash
`;
    const result = parseSprintFile(content);
    expect(result.number).toBe(0);
  });

  it('handles empty content', () => {
    const result = parseSprintFile('');
    expect(result.totalTickets).toBe(0);
    expect(result.doneCount).toBe(0);
  });

  it('detects in-progress via WIP keyword', () => {
    const content = `# Sprint 1

- [ ] **SEC-010** — WIP: implement auth (P1)
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].status).toBe('in-progress');
  });

  it('detects in-progress via "in progress" keyword', () => {
    const content = `# Sprint 1

- [ ] **SEC-010** — implement auth in progress (P1)
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].status).toBe('in-progress');
  });

  it('extracts estimate hours', () => {
    const content = `# Sprint 2

- [ ] **FEAT-001** — Build dashboard (P2, 12h)
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].estimate).toBe('12h');
  });

  it('handles uppercase X in checkbox', () => {
    const content = `# Sprint 1

- [X] **BUG-002** — Fix login
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].status).toBe('done');
  });

  it('handles asterisk bullets', () => {
    const content = `# Sprint 3

* [x] **SEC-050** — Patch dependency
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].id).toBe('SEC-050');
    expect(result.tickets[0].status).toBe('done');
  });

  it('handles tickets without bold formatting', () => {
    const content = `# Sprint 4

- [x] SEC-099 — Simple fix
`;
    const result = parseSprintFile(content);
    expect(result.tickets[0].id).toBe('SEC-099');
  });
});

// ---------------------------------------------------------------------------
// filterOpenBranches
// ---------------------------------------------------------------------------

describe('filterOpenBranches', () => {
  const branches: BranchInfo[] = [
    {name: 'main', lastCommit: '2026-03-01', daysSinceLastCommit: 0},
    {name: 'master', lastCommit: '2026-03-01', daysSinceLastCommit: 0},
    {name: 'develop', lastCommit: '2026-03-01', daysSinceLastCommit: 0},
    {name: 'feat/new-scanner', lastCommit: '2026-03-01', daysSinceLastCommit: 2},
    {name: 'fix/bug-123', lastCommit: '2026-02-01', daysSinceLastCommit: 20},
  ];

  it('filters out default branches', () => {
    const result = filterOpenBranches(branches);
    expect(result).toHaveLength(2);
    expect(result.map(b => b.name)).toEqual(['feat/new-scanner', 'fix/bug-123']);
  });

  it('returns empty array for only default branches', () => {
    const defaults: BranchInfo[] = [
      {name: 'main', lastCommit: '2026-03-01', daysSinceLastCommit: 0},
      {name: 'dev', lastCommit: '2026-03-01', daysSinceLastCommit: 0},
    ];
    const result = filterOpenBranches(defaults);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterOpenBranches([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectFreeze
// ---------------------------------------------------------------------------

describe('detectFreeze', () => {
  it('detects freeze when sprint has zero progress', () => {
    const sprint: SprintInfo = {
      number: 5,
      tickets: [
        {id: 'A-1', title: 'Task', status: 'todo'},
        {id: 'A-2', title: 'Task 2', status: 'todo'},
      ],
      totalTickets: 2,
      doneCount: 0,
      inProgressCount: 0,
      todoCount: 2,
    };

    const result = detectFreeze(sprint, []);
    expect(result.detected).toBe(true);
    expect(result.reason).toContain('none are in-progress or done');
  });

  it('does not detect freeze when sprint has progress', () => {
    const sprint: SprintInfo = {
      number: 5,
      tickets: [
        {id: 'A-1', title: 'Task', status: 'done'},
        {id: 'A-2', title: 'Task 2', status: 'in-progress'},
      ],
      totalTickets: 2,
      doneCount: 1,
      inProgressCount: 1,
      todoCount: 0,
    };

    const result = detectFreeze(sprint, []);
    expect(result.detected).toBe(false);
  });

  it('detects freeze when all open branches are stale', () => {
    const stale: BranchInfo[] = [
      {name: 'feat/a', lastCommit: '2026-01-01', daysSinceLastCommit: 30},
      {name: 'feat/b', lastCommit: '2026-01-01', daysSinceLastCommit: 30},
      {name: 'feat/c', lastCommit: '2026-01-01', daysSinceLastCommit: 30},
    ];

    const result = detectFreeze(null, stale);
    expect(result.detected).toBe(true);
    expect(result.reason).toContain('All 3 open branches are stale');
  });

  it('detects freeze when 3+ branches are stale (partial)', () => {
    const branches: BranchInfo[] = [
      {name: 'feat/a', lastCommit: '2026-01-01', daysSinceLastCommit: 30},
      {name: 'feat/b', lastCommit: '2026-01-01', daysSinceLastCommit: 20},
      {name: 'feat/c', lastCommit: '2026-01-01', daysSinceLastCommit: 15},
      {name: 'feat/d', lastCommit: '2026-03-20', daysSinceLastCommit: 1},
    ];

    const result = detectFreeze(null, branches);
    expect(result.detected).toBe(true);
    expect(result.staleBranches).toHaveLength(3);
  });

  it('does not detect freeze with only 2 stale branches', () => {
    const branches: BranchInfo[] = [
      {name: 'feat/a', lastCommit: '2026-01-01', daysSinceLastCommit: 30},
      {name: 'feat/b', lastCommit: '2026-01-01', daysSinceLastCommit: 20},
      {name: 'feat/c', lastCommit: '2026-03-20', daysSinceLastCommit: 1},
    ];

    const result = detectFreeze(null, branches);
    expect(result.detected).toBe(false);
    expect(result.staleBranches).toHaveLength(2);
  });

  it('does not detect freeze with no branches and no sprint', () => {
    const result = detectFreeze(null, []);
    expect(result.detected).toBe(false);
  });

  it('does not detect freeze for sprint with zero tickets', () => {
    const sprint: SprintInfo = {
      number: 1,
      tickets: [],
      totalTickets: 0,
      doneCount: 0,
      inProgressCount: 0,
      todoCount: 0,
    };
    const result = detectFreeze(sprint, []);
    expect(result.detected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getTeamActivity (integration)
// ---------------------------------------------------------------------------

describe('getTeamActivity', () => {
  it('returns activity with null sprint for non-existent path', async () => {
    const activity = await getTeamActivity('/tmp/nonexistent-repo-12345');
    expect(activity.sprint).toBeNull();
    expect(activity.openBranches).toEqual([]);
    expect(activity.freeze.detected).toBe(false);
    expect(activity.generatedAt).toBeDefined();
  });

  it('accepts a platform parameter', async () => {
    const activity = await getTeamActivity('/tmp/nonexistent-repo-12345', 'gitlab');
    expect(activity).toBeDefined();
    expect(activity.generatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getLocalBranches
// ---------------------------------------------------------------------------

describe('getLocalBranches', () => {
  it('returns empty array for non-git directory', async () => {
    const branches = await getLocalBranches('/tmp');
    expect(branches).toEqual([]);
  });
});
