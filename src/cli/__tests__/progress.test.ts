import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as verbosity from '../verbosity.js';
import {createProgressBar, createSpinner} from '../progress.js';

describe('progress indicators', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalIsTTY = process.stdout.isTTY;
  });
  afterEach(() => {
    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', {value: originalIsTTY, writable: true});
    verbosity.setVerbosity('normal');
  });

  describe('createSpinner', () => {
    it('no-op when not TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: false, writable: true});
      const s = createSpinner('Loading...');
      expect(writeSpy).not.toHaveBeenCalled();
      s.update('new'); s.stop('done');
      expect(writeSpy).not.toHaveBeenCalled();
    });
    it('no-op in quiet mode', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      verbosity.setVerbosity('quiet');
      const s = createSpinner('Loading...');
      expect(writeSpy).not.toHaveBeenCalled();
      s.stop();
    });
    it('writes when TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const s = createSpinner('Scanning...');
      await new Promise((r) => setTimeout(r, 150));
      s.stop('Done!');
      expect(writeSpy).toHaveBeenCalled();
      const writes = writeSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(writes.some((w: string) => w.includes('\x1B[?25l'))).toBe(true);
      expect(writes.some((w: string) => w.includes('Scanning...'))).toBe(true);
      expect(writes.some((w: string) => w.includes('Done!'))).toBe(true);
      expect(writes.some((w: string) => w.includes('\x1B[?25h'))).toBe(true);
    });
    it('update changes text', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const s = createSpinner('Step 1');
      s.update('Step 2');
      await new Promise((r) => setTimeout(r, 150));
      s.stop();
      const writes = writeSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(writes.some((w: string) => w.includes('Step 2'))).toBe(true);
    });
    it('stop is idempotent', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const s = createSpinner('test');
      await new Promise((r) => setTimeout(r, 100));
      s.stop('done');
      const n = writeSpy.mock.calls.length;
      s.stop('again');
      expect(writeSpy.mock.calls.length).toBe(n);
    });
  });

  describe('createProgressBar', () => {
    it('no-op when not TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: false, writable: true});
      const b = createProgressBar(100);
      expect(writeSpy).not.toHaveBeenCalled();
      b.tick(10); b.set(50); b.stop('done');
      expect(writeSpy).not.toHaveBeenCalled();
    });
    it('no-op in quiet mode', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      verbosity.setVerbosity('quiet');
      const b = createProgressBar(100);
      b.tick(); b.stop();
      expect(writeSpy).not.toHaveBeenCalled();
    });
    it('no-op when total is zero', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const b = createProgressBar(0);
      b.tick(); b.stop();
      expect(writeSpy).not.toHaveBeenCalled();
    });
    it('renders progress', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const b = createProgressBar(10);
      expect(writeSpy).toHaveBeenCalled();
      const init = String(writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0]);
      expect(init).toContain('0%');
      b.tick(5);
      const mid = String(writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0]);
      expect(mid).toContain('50%');
      b.tick(5);
      const full = String(writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0]);
      expect(full).toContain('100%');
      b.stop('Complete');
      const writes = writeSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(writes.some((w: string) => w.includes('Complete'))).toBe(true);
    });
    it('set changes value', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const b = createProgressBar(100);
      b.set(75);
      const latest = String(writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0]);
      expect(latest).toContain('75%');
      b.stop();
    });
    it('does not exceed total', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const b = createProgressBar(10);
      b.tick(20);
      const latest = String(writeSpy.mock.calls[writeSpy.mock.calls.length - 1][0]);
      expect(latest).toContain('100%');
      expect(latest).toContain('10/10');
      b.stop();
    });
    it('stop is idempotent', () => {
      Object.defineProperty(process.stdout, 'isTTY', {value: true, writable: true});
      const b = createProgressBar(10);
      b.stop('done');
      const n = writeSpy.mock.calls.length;
      b.stop('again');
      expect(writeSpy.mock.calls.length).toBe(n);
    });
  });
});
