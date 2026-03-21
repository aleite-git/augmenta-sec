/**
 * Progress indicators for long-running CLI operations.
 *
 * Uses simple ANSI escape sequences — no external dependencies.
 * All operations become no-ops in quiet mode or when stdout is not a TTY.
 */

import type {Verbosity} from './verbosity.js';

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export interface Spinner {
  start(): void;
  update(text: string): void;
  succeed(text: string): void;
  fail(text: string): void;
  stop(): void;
}

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
const SPINNER_INTERVAL_MS = 80;

/**
 * Creates a spinner with animated frames.
 *
 * Returns a no-op spinner when the terminal does not support it
 * (non-TTY or quiet mode).
 */
export function createSpinner(
  text: string,
  options?: {verbosity?: Verbosity},
): Spinner {
  const isTTY = process.stdout.isTTY === true;
  const isQuiet = options?.verbosity === 'quiet';

  if (!isTTY || isQuiet) {
    return createNoopSpinner();
  }

  return createRealSpinner(text);
}

function createNoopSpinner(): Spinner {
  return {
    start() {},
    update() {},
    succeed() {},
    fail() {},
    stop() {},
  };
}

function createRealSpinner(initialText: string): Spinner {
  let text = initialText;
  let frameIdx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }

  function render(): void {
    clearLine();
    const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length];
    process.stdout.write(`  ${frame} ${text}`);
    frameIdx++;
  }

  return {
    start() {
      render();
      timer = setInterval(render, SPINNER_INTERVAL_MS);
    },

    update(newText: string) {
      text = newText;
    },

    succeed(successText: string) {
      this.stop();
      clearLine();
      process.stdout.write(`  \x1b[32m\u2714\x1b[0m ${successText}\n`);
    },

    fail(failText: string) {
      this.stop();
      clearLine();
      process.stdout.write(`  \x1b[31m\u2718\x1b[0m ${failText}\n`);
    },

    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      clearLine();
    },
  };
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

export interface ProgressBar {
  increment(): void;
  done(): void;
}

const BAR_WIDTH = 30;

/**
 * Creates a simple progress bar.
 *
 * Returns a no-op bar when the terminal does not support it
 * (non-TTY or quiet mode).
 */
export function createProgressBar(
  total: number,
  label: string,
  options?: {verbosity?: Verbosity},
): ProgressBar {
  const isTTY = process.stdout.isTTY === true;
  const isQuiet = options?.verbosity === 'quiet';

  if (!isTTY || isQuiet || total <= 0) {
    return createNoopProgressBar();
  }

  return createRealProgressBar(total, label);
}

function createNoopProgressBar(): ProgressBar {
  return {
    increment() {},
    done() {},
  };
}

function createRealProgressBar(total: number, label: string): ProgressBar {
  let current = 0;

  function render(): void {
    const pct = Math.min(current / total, 1);
    const filled = Math.round(BAR_WIDTH * pct);
    const empty = BAR_WIDTH - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    const percent = `${Math.round(pct * 100)}%`.padStart(4);
    process.stdout.write(`\r  ${label} ${bar} ${percent} (${current}/${total})`);
  }

  return {
    increment() {
      current = Math.min(current + 1, total);
      render();
    },

    done() {
      current = total;
      render();
      process.stdout.write('\n');
    },
  };
}
