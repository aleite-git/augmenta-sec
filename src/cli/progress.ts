/**
 * Terminal progress indicators (ASEC-152).
 *
 * No external dependencies — raw ANSI codes only.
 * Auto-disables in quiet mode or non-TTY (CI).
 */

import {isQuiet} from './verbosity.js';

const HIDE_CURSOR = '\x1B[?25l';
const SHOW_CURSOR = '\x1B[?25h';
const CLEAR_LINE = '\x1B[2K\r';

function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY) && !isQuiet();
}

const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const SPINNER_INTERVAL_MS = 80;

export interface Spinner {
  update(text: string): void;
  stop(finalText?: string): void;
}

export function createSpinner(text: string): Spinner {
  if (!isInteractive()) {
    return {update() {}, stop() {}};
  }

  let frameIndex = 0;
  let currentText = text;
  let stopped = false;

  process.stdout.write(HIDE_CURSOR);

  const timer = setInterval(() => {
    if (stopped) return;
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    process.stdout.write(`${CLEAR_LINE}${frame} ${currentText}`);
    frameIndex++;
  }, SPINNER_INTERVAL_MS);

  if (timer.unref) timer.unref();

  return {
    update(newText: string): void {
      currentText = newText;
    },
    stop(finalText?: string): void {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stdout.write(CLEAR_LINE);
      if (finalText) process.stdout.write(`${finalText}\n`);
      process.stdout.write(SHOW_CURSOR);
    },
  };
}

const BAR_WIDTH = 30;
const FILLED_CHAR = '\u2588';
const EMPTY_CHAR = '\u2591';

export interface ProgressBar {
  tick(amount?: number): void;
  set(value: number): void;
  stop(finalText?: string): void;
}

export function createProgressBar(total: number): ProgressBar {
  if (!isInteractive() || total <= 0) {
    return {tick() {}, set() {}, stop() {}};
  }

  let current = 0;
  let stopped = false;

  process.stdout.write(HIDE_CURSOR);

  function render(): void {
    if (stopped) return;
    const ratio = Math.min(current / total, 1);
    const filled = Math.round(ratio * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const percent = Math.round(ratio * 100);
    const bar = FILLED_CHAR.repeat(filled) + EMPTY_CHAR.repeat(empty);
    process.stdout.write(`${CLEAR_LINE}[${bar}] ${percent}% (${current}/${total})`);
  }

  render();

  return {
    tick(amount = 1): void {
      current = Math.min(current + amount, total);
      render();
    },
    set(value: number): void {
      current = Math.min(Math.max(value, 0), total);
      render();
    },
    stop(finalText?: string): void {
      if (stopped) return;
      stopped = true;
      process.stdout.write(CLEAR_LINE);
      if (finalText) process.stdout.write(`${finalText}\n`);
      process.stdout.write(SHOW_CURSOR);
    },
  };
}
