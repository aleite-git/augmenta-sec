/**
 * Verbosity control for CLI output (ASEC-151).
 */

export type VerbosityLevel = 'quiet' | 'normal' | 'verbose';

let currentVerbosity: VerbosityLevel = 'normal';

export function setVerbosity(level: VerbosityLevel): void {
  currentVerbosity = level;
}

export function getVerbosity(): VerbosityLevel {
  return currentVerbosity;
}

export function isQuiet(): boolean {
  return currentVerbosity === 'quiet';
}

export function isVerbose(): boolean {
  return currentVerbosity === 'verbose';
}

export function resolveVerbosity(options: {verbose?: boolean; quiet?: boolean}): VerbosityLevel {
  if (options.quiet) return 'quiet';
  if (options.verbose) return 'verbose';
  return 'normal';
}

export interface VerbosityAwareLogger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export function createVerbosityLogger(base: {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}): VerbosityAwareLogger {
  return {
    info(msg: string): void {
      if (!isQuiet()) base.info(msg);
    },
    success(msg: string): void {
      if (!isQuiet()) base.success(msg);
    },
    warn(msg: string): void {
      if (!isQuiet()) base.warn(msg);
    },
    error(msg: string): void {
      base.error(msg);
    },
    debug(msg: string): void {
      if (isVerbose()) base.debug(msg);
    },
  };
}
