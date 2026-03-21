/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * Helper: run a small ESM script that imports the parser, calls a function,
 * and prints the result as JSON. This avoids Jest/ESM interop issues.
 */
function runParser(code) {
  const script = `
import { parseCurrentSprint, parseBacklog, parseGroomed, parseDelivered, findTicket, listTickets } from '${path.resolve(__dirname, '..', '..', 'sprint-mgmt', 'lib', 'md-parser.mjs').replace(/\\/g, '/')}';
import { readFileSync } from 'fs';
${code}
`;
  const result = execSync(`node --input-type=module`, {
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

function runParserJSON(code) {
  return JSON.parse(runParser(code));
}

describe('md-parser: parseCurrentSprint', () => {
  const fixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');

  test('extracts sprint number and title', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const sprint = parseCurrentSprint(content);
      console.log(JSON.stringify({ number: sprint.number, title: sprint.title }));
    `);
    expect(result.number).toBe(30);
    expect(result.title).toBe('Sprint Management Tooling');
  });

  test('extracts sprint metadata', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const sprint = parseCurrentSprint(content);
      console.log(JSON.stringify({ status: sprint.status, startDate: sprint.startDate, planned: sprint.planned, theme: sprint.theme }));
    `);
    expect(result.status).toBe('IN PROGRESS');
    expect(result.startDate).toBe('2026-03-14');
    expect(result.planned).toMatch(/10 hours/);
    expect(result.theme).toMatch(/Developer tooling/);
  });

  test('extracts actual hours from metrics', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const sprint = parseCurrentSprint(content);
      console.log(JSON.stringify({ actual: sprint.actual }));
    `);
    expect(result.actual).toBe('0h');
  });

  test('parses tickets with metadata', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const sprint = parseCurrentSprint(content);
      console.log(JSON.stringify(sprint.tickets));
    `);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('SPIKE-002');
    expect(result[0].done).toBe(false);
    expect(result[0].priority).toBe('P1');
    expect(result[0].effort).toBe('10');
    expect(result[0].status).toBe('IN PROGRESS');
    expect(result[0].branch).toBe('feat/SPIKE-002-sprint-management-cli');
    expect(result[0].scope).toBe('current');
  });

  test('handles empty content', () => {
    const result = runParserJSON(`
      const sprint = parseCurrentSprint('');
      console.log(JSON.stringify(sprint));
    `);
    expect(result.number).toBe(0);
    expect(result.tickets).toEqual([]);
  });
});

describe('md-parser: parseBacklog', () => {
  const fixture = path.resolve(FIXTURES, 'BACKLOG.md').replace(/\\/g, '/');

  test('extracts sections', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const backlog = parseBacklog(content);
      console.log(JSON.stringify(backlog.sections.map(s => s.name)));
    `);
    expect(result).toContain('Messages');
    expect(result).toContain('Development Tools');
    expect(result).toContain('Security');
  });

  test('parses tickets in Messages section', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const backlog = parseBacklog(content);
      const msgs = backlog.sections.find(s => s.name === 'Messages');
      console.log(JSON.stringify(msgs.tickets));
    `);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].id).toBe('FEAT-050-P6');
    expect(result[0].hours).toBe('2');
    expect(result[0].scope).toBe('backlog');
    expect(result[1].id).toBe('FEAT-051');
  });

  test('detects completed tickets', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const backlog = parseBacklog(content);
      const tools = backlog.sections.find(s => s.name === 'Development Tools');
      const proc = tools.tickets.find(t => t.id === 'PROC-001');
      console.log(JSON.stringify({ done: proc.done }));
    `);
    expect(result.done).toBe(true);
  });

  test('assigns section name to tickets', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const backlog = parseBacklog(content);
      const sec = backlog.sections.find(s => s.name === 'Security');
      console.log(JSON.stringify(sec.tickets[0]));
    `);
    expect(result.section).toBe('Security');
    expect(result.id).toBe('SEC-013');
  });
});

describe('md-parser: parseGroomed', () => {
  const fixture = path.resolve(FIXTURES, 'BACKLOG-GROOMED.md').replace(/\\/g, '/');

  test('extracts sprint plans', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const groomed = parseGroomed(content);
      console.log(JSON.stringify(groomed.sprints.map(s => ({ n: s.number, count: s.tickets.length }))));
    `);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const s28 = result.find(s => s.n === 28);
    expect(s28).toBeDefined();
    expect(s28.count).toBe(3);
    const s29 = result.find(s => s.n === 29);
    expect(s29).toBeDefined();
    expect(s29.count).toBe(2);
  });

  test('parses table-format tickets', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const groomed = parseGroomed(content);
      const s29 = groomed.sprints.find(s => s.number === 29);
      console.log(JSON.stringify(s29.tickets));
    `);
    expect(result[0].id).toBe('INFRA-005');
    expect(result[1].id).toBe('INFRA-002');
    expect(result[0].scope).toBe('groomed');
  });

  test('extracts remaining backlog categories', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const groomed = parseGroomed(content);
      console.log(JSON.stringify(groomed.remaining.categories.map(c => ({ name: c.name, count: c.tickets.length }))));
    `);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const infra = result.find(c => c.name.includes('Infrastructure'));
    expect(infra).toBeDefined();
    expect(infra.count).toBe(2);
  });
});

describe('md-parser: parseDelivered', () => {
  const fixture = path.resolve(FIXTURES, 'BACKLOG-DELIVERED.md').replace(/\\/g, '/');

  test('extracts total counts', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const delivered = parseDelivered(content);
      console.log(JSON.stringify({ totalSprints: delivered.totalSprints, totalTickets: delivered.totalTickets }));
    `);
    expect(result.totalSprints).toBe(29);
    expect(result.totalTickets).toMatch(/259/);
  });

  test('extracts sprint 29 tickets', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const delivered = parseDelivered(content);
      const s29 = delivered.sprints.find(s => s.number === 29);
      console.log(JSON.stringify(s29.tickets.map(t => t.id)));
    `);
    expect(result).toContain('INFRA-002');
    expect(result).toContain('INFRA-005');
    expect(result).toContain('QUAL-022');
    expect(result).toContain('INFRA-003');
  });

  test('all delivered tickets are marked done', () => {
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const delivered = parseDelivered(content);
      const allDone = delivered.sprints.flatMap(s => s.tickets).every(t => t.done);
      console.log(JSON.stringify({ allDone }));
    `);
    expect(result.allDone).toBe(true);
  });
});

describe('md-parser: findTicket', () => {
  test('finds ticket in current sprint', () => {
    const currentFixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const files = { current: readFileSync('${currentFixture}', 'utf8') };
      const ticket = findTicket('SPIKE-002', files);
      console.log(JSON.stringify(ticket));
    `);
    expect(result).not.toBeNull();
    expect(result.id).toBe('SPIKE-002');
    expect(result.scope).toBe('current');
  });

  test('finds ticket in backlog', () => {
    const backlogFixture = path.resolve(FIXTURES, 'BACKLOG.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const files = { backlog: readFileSync('${backlogFixture}', 'utf8') };
      const ticket = findTicket('FEAT-051', files);
      console.log(JSON.stringify(ticket));
    `);
    expect(result).not.toBeNull();
    expect(result.id).toBe('FEAT-051');
    expect(result.scope).toBe('backlog');
  });

  test('finds ticket in delivered', () => {
    const deliveredFixture = path.resolve(FIXTURES, 'BACKLOG-DELIVERED.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const files = { delivered: readFileSync('${deliveredFixture}', 'utf8') };
      const ticket = findTicket('INFRA-005', files);
      console.log(JSON.stringify(ticket));
    `);
    expect(result).not.toBeNull();
    expect(result.id).toBe('INFRA-005');
    expect(result.scope).toBe('delivered');
  });

  test('returns null for nonexistent ticket', () => {
    const result = runParser(`
      const ticket = findTicket('NONEXIST-999', {});
      console.log(JSON.stringify(ticket));
    `);
    expect(result).toBe('null');
  });

  test('case-insensitive search', () => {
    const currentFixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const files = { current: readFileSync('${currentFixture}', 'utf8') };
      const ticket = findTicket('spike-002', files);
      console.log(JSON.stringify({ id: ticket.id }));
    `);
    expect(result.id).toBe('SPIKE-002');
  });
});

describe('md-parser: listTickets', () => {
  test('lists current sprint tickets', () => {
    const fixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const tickets = listTickets('current', content);
      console.log(JSON.stringify(tickets.map(t => t.id)));
    `);
    expect(result).toContain('SPIKE-002');
  });

  test('lists backlog tickets', () => {
    const fixture = path.resolve(FIXTURES, 'BACKLOG.md').replace(/\\/g, '/');
    const result = runParserJSON(`
      const content = readFileSync('${fixture}', 'utf8');
      const tickets = listTickets('backlog', content);
      console.log(JSON.stringify(tickets.map(t => t.id)));
    `);
    expect(result).toContain('FEAT-050-P6');
    expect(result).toContain('FEAT-051');
    expect(result).toContain('SPIKE-002');
  });

  test('returns empty for unknown scope', () => {
    const result = runParserJSON(`
      const tickets = listTickets('invalid', '');
      console.log(JSON.stringify(tickets));
    `);
    expect(result).toEqual([]);
  });
});
