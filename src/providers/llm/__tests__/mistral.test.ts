import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {LLMMessage} from '../types.js';

// Mock the @mistralai/mistralai module before importing the provider.
const mockChatComplete = vi.fn();

vi.mock('@mistralai/mistralai', () => ({
  Mistral: vi.fn(() => ({
    chat: {
      complete: mockChatComplete,
    },
  })),
}));

// Import after the mock is set up.
import {createMistralProvider, MistralProviderError} from '../mistral.js';

describe('MistralProviderError', () => {
  it('has the correct name and provider', () => {
    const error = new MistralProviderError('test error');

    expect(error.name).toBe('MistralProviderError');
    expect(error.provider).toBe('mistral');
    expect(error.message).toBe('test error');
  });

  it('preserves the cause when provided', () => {
    const cause = new Error('original');
    const error = new MistralProviderError('wrapped', cause);

    expect(error.cause).toBe(cause);
  });

  it('does not set cause when omitted', () => {
    const error = new MistralProviderError('no cause');

    expect(error.cause).toBeUndefined();
  });
});

describe('createMistralProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: 'Test response'},
          finishReason: 'stop',
        },
      ],
      usage: {
        promptTokens: 100,
        completionTokens: 50,
      },
    });
  });

  it('returns a valid LLMProvider with correct name and model', () => {
    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    expect(provider.name).toBe('mistral');
    expect(provider.model).toBe('mistral-large-latest');
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.analyze).toBe('function');
    expect(typeof provider.analyzeStructured).toBe('function');
  });

  it('sets capabilities correctly for mistral-large-latest', () => {
    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    expect(provider.capabilities).toEqual({
      maxContextTokens: 128_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for mistral-medium-latest', () => {
    const provider = createMistralProvider(
      'mistral-medium-latest',
      'test-key',
    );

    expect(provider.capabilities).toEqual({
      maxContextTokens: 128_000,
      supportsImages: false,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for codestral-latest', () => {
    const provider = createMistralProvider('codestral-latest', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 32_000,
      supportsImages: false,
      supportsStructuredOutput: true,
    });
  });

  it('sets sensible defaults for unknown model names', () => {
    const provider = createMistralProvider('mistral-next-gen', 'test-key');

    expect(provider.capabilities.maxContextTokens).toBe(128_000);
    expect(provider.capabilities.supportsImages).toBe(false);
    expect(provider.capabilities.supportsStructuredOutput).toBe(true);
  });
});

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: 'Analysis result'},
          finishReason: 'stop',
        },
      ],
      usage: {
        promptTokens: 200,
        completionTokens: 100,
      },
    });
  });

  it('sends messages and returns a well-formed response', async () => {
    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'system', content: 'You are a security analyst.'},
      {role: 'user', content: 'Review this code.'},
    ];

    const result = await provider.analyze(messages);

    expect(result.content).toBe('Analysis result');
    expect(result.tokensUsed).toEqual({input: 200, output: 100});
    expect(result.model).toBe('mistral-large-latest');
    expect(result.role).toBe('analysis');
  });

  it('passes messages with correct roles to the Mistral SDK', async () => {
    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System prompt'},
      {role: 'user', content: 'User message'},
      {role: 'assistant', content: 'Previous response'},
      {role: 'user', content: 'Follow up'},
    ];

    await provider.analyze(messages);

    expect(mockChatComplete).toHaveBeenCalledWith({
      model: 'mistral-large-latest',
      messages: [
        {role: 'system', content: 'System prompt'},
        {role: 'user', content: 'User message'},
        {role: 'assistant', content: 'Previous response'},
        {role: 'user', content: 'Follow up'},
      ],
    });
  });

  it('handles missing usage metadata gracefully', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: 'Response without metadata'},
          finishReason: 'stop',
        },
      ],
      usage: undefined,
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.tokensUsed).toEqual({input: 0, output: 0});
  });

  it('handles non-string content gracefully', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: [{type: 'text', text: 'chunk'}]},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 10, completionTokens: 5},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    // Non-string content should fall back to empty string.
    expect(result.content).toBe('');
  });

  it('handles empty choices array gracefully', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [],
      usage: {promptTokens: 10, completionTokens: 0},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.content).toBe('');
  });

  it('wraps API errors in MistralProviderError', async () => {
    mockChatComplete.mockRejectedValue(new Error('API rate limited'));

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Mistral API error: API rate limited');
  });

  it('wraps non-Error API failures in MistralProviderError', async () => {
    mockChatComplete.mockRejectedValue('string error');

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Mistral API error: string error');
  });
});

describe('analyzeStructured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON response', async () => {
    const expectedData = {severity: 'high', findings: ['sql-injection']};
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: JSON.stringify(expectedData)},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 50, completionTokens: 30},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    const result = await provider.analyzeStructured<typeof expectedData>(
      [{role: 'user', content: 'Analyze this code'}],
      '{ "severity": "string", "findings": "string[]" }',
    );

    expect(result).toEqual(expectedData);
  });

  it('uses responseFormat json_object', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: '{"ok": true}'},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 10, completionTokens: 5},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    await provider.analyzeStructured(
      [{role: 'user', content: 'Test'}],
      '{}',
    );

    expect(mockChatComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: {type: 'json_object'},
      }),
    );
  });

  it('injects schema hint into existing system message', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: '{"result": "ok"}'},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 10, completionTokens: 5},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    await provider.analyzeStructured(
      [
        {role: 'system', content: 'You are a security tool.'},
        {role: 'user', content: 'Analyze'},
      ],
      '{ "result": "string" }',
    );

    const call = mockChatComplete.mock.calls[0]![0];
    const systemMsg = call.messages.find(
      (m: {role: string}) => m.role === 'system',
    );
    expect(systemMsg.content).toContain('You are a security tool.');
    expect(systemMsg.content).toContain(
      'Respond with valid JSON matching this schema:',
    );
    expect(systemMsg.content).toContain('{ "result": "string" }');
  });

  it('creates system message with schema hint when none exists', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: '{"result": "ok"}'},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 10, completionTokens: 5},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );
    await provider.analyzeStructured(
      [{role: 'user', content: 'Analyze'}],
      '{ "result": "string" }',
    );

    const call = mockChatComplete.mock.calls[0]![0];
    const systemMsg = call.messages.find(
      (m: {role: string}) => m.role === 'system',
    );
    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toContain(
      'Respond with valid JSON matching this schema:',
    );
  });

  it('throws MistralProviderError on invalid JSON response', async () => {
    mockChatComplete.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: {content: 'not valid json {{{'},
          finishReason: 'stop',
        },
      ],
      usage: {promptTokens: 10, completionTokens: 5},
    });

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Failed to parse Mistral JSON response');
  });

  it('wraps API errors in MistralProviderError', async () => {
    mockChatComplete.mockRejectedValue(new Error('Service unavailable'));

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Mistral API error: Service unavailable');
  });

  it('wraps non-Error API failures in MistralProviderError', async () => {
    mockChatComplete.mockRejectedValue(42);

    const provider = createMistralProvider(
      'mistral-large-latest',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Mistral API error: 42');
  });
});
