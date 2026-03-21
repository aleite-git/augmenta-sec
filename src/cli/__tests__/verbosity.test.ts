import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createLogger} from '../verbosity.js';
import type {Verbosity} from '../verbosity.js';

describe('createLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('verbose mode', () => {
    it('logs debug messages', () => {
      const log = createLogger('verbose');
      log.debug('debug msg');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs info messages', () => {
      const log = createLogger('verbose');
      log.info('info msg');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs warn messages', () => {
      const log = createLogger('verbose');
      log.warn('warn msg');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs error messages', () => {
      const log = createLogger('verbose');
      log.error('error msg');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs errorDetail', () => {
      const log = createLogger('verbose');
      log.errorDetail(new Error('test'));
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs success messages', () => {
      const log = createLogger('verbose');
      log.success('done');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs headers', () => {
      const log = createLogger('verbose');
      log.header('Title');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs details', () => {
      const log = createLogger('verbose');
      log.detail('key', 'value');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs badges', () => {
      const log = createLogger('verbose');
      log.badge(true, 'Feature', 'present');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('normal mode', () => {
    it('does NOT log debug messages', () => {
      const log = createLogger('normal');
      log.debug('debug msg');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('logs info messages', () => {
      const log = createLogger('normal');
      log.info('info msg');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs warn messages', () => {
      const log = createLogger('normal');
      log.warn('warn msg');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs error messages', () => {
      const log = createLogger('normal');
      log.error('error msg');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('logs success messages', () => {
      const log = createLogger('normal');
      log.success('done');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('quiet mode', () => {
    it('does NOT log debug messages', () => {
      const log = createLogger('quiet');
      log.debug('debug msg');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('does NOT log info messages', () => {
      const log = createLogger('quiet');
      log.info('info msg');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('does NOT log warn messages', () => {
      const log = createLogger('quiet');
      log.warn('warn msg');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('logs error messages (always)', () => {
      const log = createLogger('quiet');
      log.error('error msg');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does NOT log success messages', () => {
      const log = createLogger('quiet');
      log.success('done');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('does NOT log headers', () => {
      const log = createLogger('quiet');
      log.header('Title');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('does NOT log details', () => {
      const log = createLogger('quiet');
      log.detail('key', 'value');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('does NOT log badges', () => {
      const log = createLogger('quiet');
      log.badge(true, 'Feature');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  it('accepts all valid verbosity levels', () => {
    const levels: Verbosity[] = ['quiet', 'normal', 'verbose'];
    for (const level of levels) {
      const log = createLogger(level);
      log.error('test');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockClear();
    }
  });
});
