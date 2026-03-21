/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const FIXTURES = path.resolve(__dirname, 'fixtures');
const LIB = path.resolve(__dirname, '..', '..', 'sprint-mgmt', 'lib');

function runWriter(code) {
  const script = `
import { markTicketDone, updateMetrics, insertBacklogTicket, removeTicket, setSprintStatus, appendDeliveredSprint, replaceLines } from '${LIB.replace(/\\/g, '/')}/md-writer.mjs';
import { parseCurrentSprint, parseBacklog, parseDelivered } from '${LIB.replace(/\\/g, '/')}/md-parser.mjs';
import { readFileSync } from 'fs';
${code}
`;
  return execSync('node --input-type=module', {
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function runWriterJSON(code) {
  return JSON.parse(runWriter(code));
}

describe('md-writer: replaceLines', () => {
  test('replaces a single line', () => {
    const result = runWriter(`
      const content = 'line0\\nline1\\nline2\\nline3';
      const updated = replaceLines(content, 1, 1, ['REPLACED']);
      console.log(updated);
    `);
    expect(result).toBe('line0\nREPLACED\nline2\nline3');
  });

  test('replaces a range of lines', () => {
    const result = runWriter(`
      const content = 'A\\nB\\nC\\nD\\nE';
      const updated = replaceLines(content, 1, 3, ['X', 'Y']);
      console.log(updated);
    `);
    expect(result).toBe('A\nX\nY\nE');
  });
});

describe('md-writer: markTicketDone', () => {
  const fixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');

  test('marks SPIKE-002 as done', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = markTicketDone(content, 'SPIKE-002', { actual: '10h', date: '2026-03-14' });
      // Check the ticket line has [x]
      const ticketLine = updated.split('\\n').find(l => l.includes('SPIKE-002'));
      console.log(ticketLine.includes('[x]') ? 'CHECKED' : 'NOT_CHECKED');
    `);
    expect(result).toBe('CHECKED');
  });

  test('adds completed date', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = markTicketDone(content, 'SPIKE-002', { date: '2026-03-14' });
      const hasDate = updated.includes('**Completed:** 2026-03-14');
      console.log(hasDate ? 'HAS_DATE' : 'NO_DATE');
    `);
    expect(result).toBe('HAS_DATE');
  });

  test('adds actual hours', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = markTicketDone(content, 'SPIKE-002', { actual: '10h', date: '2026-03-14' });
      const hasActual = updated.includes('**Actual:** 10h');
      console.log(hasActual ? 'HAS_ACTUAL' : 'NO_ACTUAL');
    `);
    expect(result).toBe('HAS_ACTUAL');
  });

  test('updates metrics to 100%', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = markTicketDone(content, 'SPIKE-002', { date: '2026-03-14' });
      const has100 = updated.includes('100%');
      const hasCompleted = updated.includes('1/1 tickets');
      console.log(has100 && hasCompleted ? 'METRICS_OK' : 'METRICS_FAIL');
    `);
    expect(result).toBe('METRICS_OK');
  });

  test('throws for nonexistent ticket', () => {
    expect(() => {
      runWriter(`
        const content = readFileSync('${fixture}', 'utf8');
        markTicketDone(content, 'NONEXIST-999', {});
      `);
    }).toThrow();
  });
});

describe('md-writer: insertBacklogTicket', () => {
  const fixture = path.resolve(FIXTURES, 'BACKLOG.md').replace(/\\/g, '/');

  test('inserts ticket into Development Tools', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = insertBacklogTicket(content, 'TEST-001', 'Test Ticket', {
        section: 'Development Tools',
        priority: 'P2',
        hours: '8',
      });
      const hasTicket = updated.includes('**TEST-001**: Test Ticket');
      const hasPriority = updated.includes('**Priority:** P2');
      console.log(hasTicket && hasPriority ? 'INSERTED' : 'FAIL');
    `);
    expect(result).toBe('INSERTED');
  });

  test('throws for nonexistent section', () => {
    expect(() => {
      runWriter(`
        const content = readFileSync('${fixture}', 'utf8');
        insertBacklogTicket(content, 'TEST-002', 'Test', { section: 'Nonexistent Section' });
      `);
    }).toThrow();
  });
});

describe('md-writer: removeTicket', () => {
  const fixture = path.resolve(FIXTURES, 'BACKLOG.md').replace(/\\/g, '/');

  test('removes FEAT-051 from backlog', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const { content: updated, removed } = removeTicket(content, 'FEAT-051');
      const stillHas = updated.includes('**FEAT-051**');
      const removedHas = removed.includes('FEAT-051');
      console.log(!stillHas && removedHas ? 'REMOVED' : 'FAIL');
    `);
    expect(result).toBe('REMOVED');
  });

  test('throws for nonexistent ticket', () => {
    expect(() => {
      runWriter(`
        const content = readFileSync('${fixture}', 'utf8');
        removeTicket(content, 'NONEXIST-999');
      `);
    }).toThrow();
  });
});

describe('md-writer: setSprintStatus', () => {
  const fixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');

  test('sets status to COMPLETE', () => {
    const result = runWriter(`
      const content = readFileSync('${fixture}', 'utf8');
      const updated = setSprintStatus(content, 'COMPLETE');
      const line = updated.split('\\n').find(l => l.startsWith('**Status:**'));
      console.log(line);
    `);
    expect(result).toBe('**Status:** COMPLETE');
  });
});

describe('md-writer: appendDeliveredSprint', () => {
  const deliveredFixture = path.resolve(FIXTURES, 'BACKLOG-DELIVERED.md').replace(/\\/g, '/');
  const currentFixture = path.resolve(FIXTURES, 'CURRENT-SPRINT.md').replace(/\\/g, '/');

  test('appends sprint to delivered', () => {
    const result = runWriter(`
      const deliveredContent = readFileSync('${deliveredFixture}', 'utf8');
      const currentContent = readFileSync('${currentFixture}', 'utf8');
      const sprint = parseCurrentSprint(currentContent);
      // Mark ticket as done for test
      sprint.tickets[0].done = true;
      const updated = appendDeliveredSprint(deliveredContent, sprint, '2026-03-14');
      const hasSprint30 = updated.includes('Sprint 30:');
      const hasComplete = updated.includes('COMPLETE');
      console.log(hasSprint30 && hasComplete ? 'APPENDED' : 'FAIL');
    `);
    expect(result).toBe('APPENDED');
  });

  test('updates total sprints count', () => {
    const result = runWriter(`
      const deliveredContent = readFileSync('${deliveredFixture}', 'utf8');
      const currentContent = readFileSync('${currentFixture}', 'utf8');
      const sprint = parseCurrentSprint(currentContent);
      sprint.tickets[0].done = true;
      const updated = appendDeliveredSprint(deliveredContent, sprint, '2026-03-14');
      const match = updated.match(/Total Sprints Completed:\\*\\*\\s*(\\d+)/);
      console.log(match ? match[1] : 'FAIL');
    `);
    expect(result).toBe('30');
  });
});
