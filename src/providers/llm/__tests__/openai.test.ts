import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {LLMMessage} from '../types.js';

// Mock the openai module before importing the provider.
const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

// Import after the mock is set up.
import {createOpenAIProvider, OpenAIProviderError} from '../openai.js';

describe('OpenAIProviderError', () => {
  it('has correct name and provider', () => {
    const err = new OpenAIProviderError('something failed');

    expect(err.name).toBe('OpenAIProviderError');
    expect(err.provider).toBe('openai');
    expect(err.message).toBe('something failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves cause when provided', () => {
    const cause = new Error('original');
    const err = new OpenAIProviderError('wrapped', cause);

    expect(err.cause).toBe(cause);
  });

  it('has no cause when none provided', () => {
    const err = new OpenAIProviderError('no cause');

    expect(err.cause).toBeUndefined();
  });
});

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      choices: [{message: {content: 'Test response'}}],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    });
  });

  it('returns a valid LLMProvider with correct name and model', () => {
    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-4o');
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.analyze).toBe('function');
    expect(typeof provider.analyzeStructured).toBe('function');
  });

  it('sets capabilities correctly for gpt-4o', () => {
    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 128_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for gpt-4o-mini', () => {
    const provider = createOpenAIProvider('gpt-4o-mini', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 128_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for gpt-4-turbo', () => {
    const provider = createOpenAIProvider('gpt-4-turbo', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 128_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets sensible defaults for unknown model names', () => {
    const provider = createOpenAIProvider('gpt-5-ultra', 'test-key');

    expect(provider.capabilities.maxContextTokens).toBe(128_000);
    expect(provider.capabilities.supportsImages).toBe(true);
    expect(provider.capabilities.supportsStructuredOutput).toBe(true);
  });
});

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      choices: [{message: {content: 'Analysis result'}}],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 100,
      },
    });
  });

  it('sends messages and returns a well-formed response', async () => {
    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'You are a security analyst.'},
      {role: 'user', content: 'Review this code.'},
    ];

    const result = await provider.analyze(messages);

    expect(result.content).toBe('Analysis result');
    expect(result.tokensUsed).toEqual({input: 200, output: 100});
    expect(result.model).toBe('gpt-4o');
    expect(result.role).toBe('analysis');
  });

  it('passes messages with roles directly to the OpenAI API', async () => {
    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System prompt'},
      {role: 'user', content: 'User message'},
    ];

    await provider.analyze(messages);

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [
        {role: 'system', content: 'System prompt'},
        {role: 'user', content: 'User message'},
      ],
    });
  });

  it('preserves assistant role as-is for OpenAI', async () => {
    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'user', content: 'Hello'},
      {role: 'assistant', content: 'Hi there'},
      {role: 'user', content: 'Follow up'},
    ];

    await provider.analyze(messages);

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gpt-4o',
      messages: [
        {role: 'user', content: 'Hello'},
        {role: 'assistant', content: 'Hi there'},
        {role: 'user', content: 'Follow up'},
      ],
    });
  });

  it('handles missing usage metadata gracefully', async () => {
    mockCreate.mockResolvedValue({
      choices: [{message: {content: 'Response without metadata'}}],
      usage: undefined,
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.tokensUsed).toEqual({input: 0, output: 0});
  });

  it('handles empty choices array gracefully', async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      usage: {prompt_tokens: 10, completion_tokens: 0},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.content).toBe('');
  });

  it('wraps API errors in OpenAIProviderError', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limited'));

    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('OpenAI API error: API rate limited');
  });

  it('wraps non-Error throwables in OpenAIProviderError', async () => {
    mockCreate.mockRejectedValue('string error');

    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('OpenAI API error: string error');
  });
});

describe('analyzeStructured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON response', async () => {
    const expectedData = {severity: 'high', findings: ['sql-injection']};
    mockCreate.mockResolvedValue({
      choices: [{message: {content: JSON.stringify(expectedData)}}],
      usage: {prompt_tokens: 50, completion_tokens: 30},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    const result = await provider.analyzeStructured<typeof expectedData>(
      [{role: 'user', content: 'Analyze this code'}],
      '{ "severity": "string", "findings": "string[]" }',
    );

    expect(result).toEqual(expectedData);
  });

  it('uses response_format json_object', async () => {
    mockCreate.mockResolvedValue({
      choices: [{message: {content: '{"ok": true}'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Test'}],
      '{}',
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: {type: 'json_object'},
      }),
    );
  });

  it('injects schema hint into existing system message', async () => {
    mockCreate.mockResolvedValue({
      choices: [{message: {content: '{"result": "ok"}'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    await provider.analyzeStructured(
      [
        {role: 'system', content: 'You are a security tool.'},
        {role: 'user', content: 'Analyze'},
      ],
      '{ "result": "string" }',
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const systemMsg = callArgs.messages.find(
      (m: {role: string}) => m.role === 'system',
    );

    expect(systemMsg.content).toContain('You are a security tool.');
    expect(systemMsg.content).toContain(
      'Respond with valid JSON matching this schema:',
    );
    expect(systemMsg.content).toContain('{ "result": "string" }');
  });

  it('creates system message with schema hint when none exists', async () => {
    mockCreate.mockResolvedValue({
      choices: [{message: {content: '{"result": "ok"}'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Analyze'}],
      '{ "result": "string" }',
    );

    const callArgs = mockCreate.mock.calls[0][0];
    const systemMsg = callArgs.messages.find(
      (m: {role: string}) => m.role === 'system',
    );

    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain(
      'Respond with valid JSON matching this schema:',
    );
  });

  it('throws OpenAIProviderError on invalid JSON response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{message: {content: 'not valid json {{{'}}],
      usage: {prompt_tokens: 10, completion_tokens: 5},
    });

    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Failed to parse OpenAI JSON response');
  });

  it('wraps API errors in OpenAIProviderError', async () => {
    mockCreate.mockRejectedValue(new Error('Service unavailable'));

    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('OpenAI API error: Service unavailable');
  });

  it('wraps non-Error throwables in OpenAIProviderError for structured', async () => {
    mockCreate.mockRejectedValue(42);

    const provider = createOpenAIProvider('gpt-4o', 'test-key');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('OpenAI API error: 42');
  });
});
