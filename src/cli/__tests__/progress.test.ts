import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createSpinner, createProgressBar} from '../progress.js';

describe('createSpinner', () => {
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  it('returns a no-op spinner when not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...');
    spinner.start();
    spinner.update('Still loading...');
    spinner.succeed('Done');
    spinner.stop();
    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('returns a no-op spinner in quiet mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...', {verbosity: 'quiet'});
    spinner.start();
    spinner.update('Still loading...');
    spinner.fail('Failed');
    spinner.stop();
    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('writes to stdout when TTY and not quiet', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...');
    spinner.start();
    expect(process.stdout.write).toHaveBeenCalled();
    spinner.stop();
  });

  it('succeed() prints a checkmark', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...');
    spinner.start();
    spinner.succeed('Done!');
    const calls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    const hasCheckmark = calls.some((c: string) => c.includes('\u2714') && c.includes('Done!'));
    expect(hasCheckmark).toBe(true);
  });

  it('fail() prints a cross mark', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...');
    spinner.start();
    spinner.fail('Error!');
    const calls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    const hasCross = calls.some((c: string) => c.includes('\u2718') && c.includes('Error!'));
    expect(hasCross).toBe(true);
  });

  it('stop() clears the interval without error', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const spinner = createSpinner('Loading...');
    spinner.start();
    spinner.stop();
    spinner.stop(); // Double-stop should not throw
    expect(true).toBe(true);
  });
});

describe('createProgressBar', () => {
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY, writable: true, configurable: true,
    });
  });

  it('returns a no-op bar when not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false, writable: true, configurable: true,
    });
    const bar = createProgressBar(10, 'Test');
    bar.increment();
    bar.done();
    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('returns a no-op bar in quiet mode', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const bar = createProgressBar(10, 'Test', {verbosity: 'quiet'});
    bar.increment();
    bar.done();
    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('returns a no-op bar when total is 0', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const bar = createProgressBar(0, 'Test');
    bar.increment();
    bar.done();
    expect(process.stdout.write).not.toHaveBeenCalled();
  });

  it('writes progress to stdout when TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const bar = createProgressBar(3, 'Files');
    bar.increment();
    expect(process.stdout.write).toHaveBeenCalled();
    const output = String((process.stdout.write as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(output).toContain('Files');
    expect(output).toContain('1/3');
  });

  it('done() shows 100%', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const bar = createProgressBar(5, 'Files');
    bar.done();
    const calls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    const hasComplete = calls.some((c: string) => c.includes('100%') && c.includes('5/5'));
    expect(hasComplete).toBe(true);
  });

  it('increment does not exceed total', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true, writable: true, configurable: true,
    });
    const bar = createProgressBar(2, 'Items');
    bar.increment();
    bar.increment();
    bar.increment();
    bar.increment();
    const calls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    const lastRender = calls[calls.length - 1];
    expect(lastRender).toContain('2/2');
  });
});
