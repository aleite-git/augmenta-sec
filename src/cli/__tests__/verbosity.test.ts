import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createVerbosityLogger, getVerbosity, isQuiet, isVerbose,
  resolveVerbosity, setVerbosity,
} from '../verbosity.js';

describe('verbosity', () => {
  afterEach(() => { setVerbosity('normal'); });

  describe('setVerbosity / getVerbosity', () => {
    it('defaults to normal', () => { expect(getVerbosity()).toBe('normal'); });
    it('can be set to quiet', () => { setVerbosity('quiet'); expect(getVerbosity()).toBe('quiet'); });
    it('can be set to verbose', () => { setVerbosity('verbose'); expect(getVerbosity()).toBe('verbose'); });
    it('can be reset', () => { setVerbosity('verbose'); setVerbosity('normal'); expect(getVerbosity()).toBe('normal'); });
  });

  describe('isQuiet', () => {
    it('true when quiet', () => { setVerbosity('quiet'); expect(isQuiet()).toBe(true); });
    it('false when normal', () => { expect(isQuiet()).toBe(false); });
    it('false when verbose', () => { setVerbosity('verbose'); expect(isQuiet()).toBe(false); });
  });

  describe('isVerbose', () => {
    it('true when verbose', () => { setVerbosity('verbose'); expect(isVerbose()).toBe(true); });
    it('false when normal', () => { expect(isVerbose()).toBe(false); });
    it('false when quiet', () => { setVerbosity('quiet'); expect(isVerbose()).toBe(false); });
  });

  describe('resolveVerbosity', () => {
    it('quiet flag', () => { expect(resolveVerbosity({quiet: true})).toBe('quiet'); });
    it('verbose flag', () => { expect(resolveVerbosity({verbose: true})).toBe('verbose'); });
    it('no flags', () => { expect(resolveVerbosity({})).toBe('normal'); });
    it('quiet beats verbose', () => { expect(resolveVerbosity({quiet: true, verbose: true})).toBe('quiet'); });
    it('handles undefined', () => { expect(resolveVerbosity({quiet: undefined, verbose: undefined})).toBe('normal'); });
  });

  describe('createVerbosityLogger', () => {
    function mockBase() {
      return {info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()};
    }
    it('passes messages in normal mode', () => {
      const b = mockBase(); const l = createVerbosityLogger(b);
      l.info('i'); l.success('s'); l.warn('w'); l.error('e');
      expect(b.info).toHaveBeenCalledWith('i');
      expect(b.success).toHaveBeenCalledWith('s');
      expect(b.warn).toHaveBeenCalledWith('w');
      expect(b.error).toHaveBeenCalledWith('e');
    });
    it('suppresses debug in normal mode', () => {
      const b = mockBase(); createVerbosityLogger(b).debug('d');
      expect(b.debug).not.toHaveBeenCalled();
    });
    it('passes debug in verbose mode', () => {
      setVerbosity('verbose'); const b = mockBase(); createVerbosityLogger(b).debug('d');
      expect(b.debug).toHaveBeenCalledWith('d');
    });
    it('suppresses non-error in quiet mode', () => {
      setVerbosity('quiet'); const b = mockBase(); const l = createVerbosityLogger(b);
      l.info('i'); l.success('s'); l.warn('w'); l.debug('d');
      expect(b.info).not.toHaveBeenCalled();
      expect(b.success).not.toHaveBeenCalled();
      expect(b.warn).not.toHaveBeenCalled();
      expect(b.debug).not.toHaveBeenCalled();
    });
    it('error always passes in quiet mode', () => {
      setVerbosity('quiet'); const b = mockBase(); createVerbosityLogger(b).error('e');
      expect(b.error).toHaveBeenCalledWith('e');
    });
  });
});
