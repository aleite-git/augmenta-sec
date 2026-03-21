/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI = path.resolve(__dirname, '..', '..', 'sprint-mgmt', 'cli.mjs');
const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * Create a temp directory with copies of fixture files for write tests.
 */
function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprint-cli-'));
  for (const file of ['CURRENT-SPRINT.md', 'BACKLOG.md', 'BACKLOG-GROOMED.md', 'BACKLOG-DELIVERED.md']) {
    fs.copyFileSync(path.join(FIXTURES, file), path.join(dir, file));
  }
  return dir;
}

function run(args) {
  return execSync(`node ${CLI} ${args}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Extract the first ticket ID (e.g. "DEBT-002", "FEAT-050-P6") from CLI output.
 * Skips header lines like [CURRENT] or ---.
 */
function extractFirstTicketId(output) {
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/([A-Z]+-\d+(?:-[A-Z0-9]+)*)/);
    if (match) return match[1];
  }
  return null;
}

describe('CLI: sprint status', () => {
  test('returns concise summary', () => {
    const output = run('sprint status');
    expect(output).toMatch(/Sprint \d+/);
    expect(output).toMatch(/IN PROGRESS|COMPLETE/);
  });

  test('summary is under 10 lines', () => {
    const output = run('sprint status');
    const lines = output.split('\n');
    expect(lines.length).toBeLessThanOrEqual(10);
  });
});

describe('CLI: ticket list', () => {
  test('lists current sprint tickets', () => {
    const output = run('ticket list current');
    expect(output).toContain('[CURRENT]');
    expect(output).toMatch(/[A-Z]+-\d+/);
  });

  test('lists backlog tickets', () => {
    const output = run('ticket list backlog');
    expect(output).toContain('[BACKLOG]');
    expect(output.split('\n').length).toBeGreaterThan(3);
  });

  test('lists delivered tickets', () => {
    const output = run('ticket list delivered');
    expect(output).toContain('[DELIVERED]');
    expect(output).toMatch(/[A-Z]+-\d+/);
  });

  test('rejects invalid scope', () => {
    expect(() => run('ticket list invalid')).toThrow();
  });
});

describe('CLI: ticket show', () => {
  test('shows ticket from current sprint', () => {
    // Dynamically find a ticket in the current sprint
    const listOutput = run('ticket list current');
    const ticketId = extractFirstTicketId(listOutput);
    expect(ticketId).not.toBeNull();

    const output = run(`ticket show ${ticketId}`);
    expect(output).toContain(ticketId);
    expect(output).toMatch(/current/i);
  });

  test('shows ticket from backlog', () => {
    const listOutput = run('ticket list backlog');
    const ticketId = extractFirstTicketId(listOutput);
    expect(ticketId).not.toBeNull();

    const output = run(`ticket show ${ticketId}`);
    expect(output).toContain(ticketId);
    expect(output).toContain('backlog');
  });

  test('handles nonexistent ticket', () => {
    const output = run('ticket show NONEXIST-999');
    expect(output).toContain('not found');
  });

  test('case-insensitive', () => {
    const listOutput = run('ticket list current');
    const ticketId = extractFirstTicketId(listOutput);
    expect(ticketId).not.toBeNull();

    const output = run(`ticket show ${ticketId.toLowerCase()}`);
    expect(output).toContain(ticketId);
  });
});

describe('CLI: ticket done (with temp files)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('marks ticket as done', () => {
    const filePath = path.join(tempDir, 'CURRENT-SPRINT.md');
    const output = execSync(
      `node ${CLI} ticket done SPIKE-002 --actual=10h --file=${filePath}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    expect(output).toContain('DONE');

    const updated = fs.readFileSync(filePath, 'utf8');
    expect(updated).toContain('[x]');
    expect(updated).toContain('COMPLETE');
    expect(updated).toContain('**Actual:** 10h');
  });
});

describe('CLI: ticket create (with temp files)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('adds ticket to backlog', () => {
    const filePath = path.join(tempDir, 'BACKLOG.md');
    const output = execSync(
      `node ${CLI} ticket create FEAT-099 "New Feature" --section="Development Tools" --priority=P2 --hours=8 --file=${filePath}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    expect(output).toContain('FEAT-099');
    expect(output).toContain('BACKLOG.md');

    const updated = fs.readFileSync(filePath, 'utf8');
    expect(updated).toContain('**FEAT-099**: New Feature');
    expect(updated).toContain('**Priority:** P2');
  });
});

describe('CLI: retro scaffold', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('generates retro template', () => {
    // Uses fixture ticket SPIKE-002 with fixture sprint 30
    const output = run('retro scaffold SPIKE-002 --sprint=30');
    expect(output).toContain('retro');
    expect(output).toContain('sprint30');
  });
});

describe('CLI: help and errors', () => {
  test('shows help with --help', () => {
    const output = run('--help');
    expect(output).toContain('Usage:');
    expect(output).toContain('sprint status');
    expect(output).toContain('ticket list');
  });

  test('errors on unknown command', () => {
    expect(() => run('foobar baz')).toThrow();
  });

  test('errors on missing args', () => {
    expect(() => run('ticket show')).toThrow();
  });
});
