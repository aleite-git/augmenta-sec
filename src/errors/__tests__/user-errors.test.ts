import {describe, it, expect} from 'vitest';
import {formatUserError} from '../user-errors.js';
import {ConfigError, DetectorError, FileSystemError, ProviderError} from '../types.js';

describe('formatUserError', () => {
  it('categorizes ConfigError as config', () => {
    const result = formatUserError(new ConfigError('missing key'));
    expect(result.category).toBe('config');
    expect(result.message).toContain('Configuration error');
    expect(result.suggestion).toContain('config.yaml');
  });

  it('categorizes FileSystemError as filesystem', () => {
    const result = formatUserError(new FileSystemError('/foo', 'ENOENT: no such file'));
    expect(result.category).toBe('filesystem');
    expect(result.suggestion).toContain('does not exist');
  });

  it('suggests permission fix for EACCES', () => {
    const result = formatUserError(new FileSystemError('/etc/shadow', 'EACCES: permission denied'));
    expect(result.suggestion).toContain('Permission denied');
  });

  it('detects semgrep not found', () => {
    const result = formatUserError(new ProviderError('semgrep', 'semgrep: command not found'));
    expect(result.category).toBe('scanner');
    expect(result.suggestion).toContain('pip install semgrep');
  });

  it('detects trivy not found', () => {
    const result = formatUserError(new ProviderError('trivy', 'trivy scanner failed'));
    expect(result.category).toBe('scanner');
    expect(result.suggestion).toContain('brew install trivy');
  });

  it('categorizes DetectorError as scanner', () => {
    const result = formatUserError(new DetectorError('language', 'parse failed'));
    expect(result.category).toBe('scanner');
    expect(result.suggestion).toContain('non-fatal');
  });

  it('detects API key errors', () => {
    const result = formatUserError(new ProviderError('openai', 'unauthorized: invalid API key'));
    expect(result.category).toBe('llm');
    expect(result.suggestion).toContain('API key');
  });

  it('detects rate limit errors', () => {
    const result = formatUserError(new ProviderError('anthropic', 'HTTP 429: too many requests'));
    expect(result.category).toBe('llm');
    expect(result.suggestion).toContain('rate limit');
  });

  it('detects connection refused for Ollama', () => {
    const result = formatUserError(new ProviderError('ollama', 'ECONNREFUSED'));
    expect(result.category).toBe('llm');
    expect(result.suggestion).toContain('ollama serve');
  });

  it('detects model not found', () => {
    const result = formatUserError(new ProviderError('gemini', 'model does not exist'));
    expect(result.category).toBe('llm');
    expect(result.suggestion).toContain('model name');
  });

  it('detects scanner patterns in plain Error', () => {
    const result = formatUserError(new Error('semgrep scan crashed'));
    expect(result.category).toBe('scanner');
  });

  it('returns unknown for unrecognized errors', () => {
    const result = formatUserError(new Error('something unexpected'));
    expect(result.category).toBe('unknown');
    expect(result.suggestion).toContain('ASEC_DEBUG');
  });

  it('handles non-Error values', () => {
    expect(formatUserError('string error').category).toBe('unknown');
    expect(formatUserError(null).category).toBe('unknown');
  });
});
