import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {LLMMessage} from '../types.js';

// Mock the @anthropic-ai/sdk module before importing the provider.
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

// Import after the mock is set up.
import {
  createAnthropicProvider,
  AnthropicProviderError,
} from '../anthropic.js';

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: 'Test response'}],
      usage: {input_tokens: 100, output_tokens: 50},
    });
  });

  it('returns a valid LLMProvider with correct name and model', () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    expect(provider.name).toBe('anthropic');
    expect(provider.model).toBe('claude-sonnet-4-20250514');
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.analyze).toBe('function');
    expect(typeof provider.analyzeStructured).toBe('function');
  });

  it('sets capabilities correctly for claude-sonnet-4-20250514', () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    expect(provider.capabilities).toEqual({
      maxContextTokens: 200_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for claude-haiku-4-20250414', () => {
    const provider = createAnthropicProvider(
      'claude-haiku-4-20250414',
      'test-key',
    );

    expect(provider.capabilities).toEqual({
      maxContextTokens: 200_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for claude-opus-4-20250514', () => {
    const provider = createAnthropicProvider(
      'claude-opus-4-20250514',
      'test-key',
    );

    expect(provider.capabilities).toEqual({
      maxContextTokens: 200_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets sensible defaults for unknown model names', () => {
    const provider = createAnthropicProvider('claude-next-5.0', 'test-key');

    expect(provider.capabilities.maxContextTokens).toBe(200_000);
    expect(provider.capabilities.supportsImages).toBe(true);
    expect(provider.capabilities.supportsStructuredOutput).toBe(true);
  });
});

describe('AnthropicProviderError', () => {
  it('has the correct name and provider', () => {
    const error = new AnthropicProviderError('test error');
    expect(error.name).toBe('AnthropicProviderError');
    expect(error.provider).toBe('anthropic');
    expect(error.message).toBe('test error');
  });

  it('preserves the cause when provided', () => {
    const cause = new Error('root cause');
    const error = new AnthropicProviderError('wrapper', cause);
    expect(error.cause).toBe(cause);
  });

  it('has no cause when not provided', () => {
    const error = new AnthropicProviderError('no cause');
    expect(error.cause).toBeUndefined();
  });
});

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: 'Analysis result'}],
      usage: {input_tokens: 200, output_tokens: 100},
    });
  });

  it('sends messages and returns a well-formed response', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'system', content: 'You are a security analyst.'},
      {role: 'user', content: 'Review this code.'},
    ];

    const result = await provider.analyze(messages);

    expect(result.content).toBe('Analysis result');
    expect(result.tokensUsed).toEqual({input: 200, output: 100});
    expect(result.model).toBe('claude-sonnet-4-20250514');
    expect(result.role).toBe('analysis');
  });

  it('passes system instruction as separate parameter', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System prompt'},
      {role: 'user', content: 'User message'},
    ];

    await provider.analyze(messages);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-20250514',
        system: 'System prompt',
        messages: [{role: 'user', content: 'User message'}],
      }),
    );
  });

  it('does not include system key when no system message exists', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const messages: LLMMessage[] = [{role: 'user', content: 'User message'}];

    await provider.analyze(messages);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBeUndefined();
    expect(callArgs.messages).toEqual([
      {role: 'user', content: 'User message'},
    ]);
  });

  it('concatenates multiple system messages', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'system', content: 'First system'},
      {role: 'system', content: 'Second system'},
      {role: 'user', content: 'User message'},
    ];

    await provider.analyze(messages);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'First system\n\nSecond system',
      }),
    );
  });

  it('preserves assistant role in messages', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const messages: LLMMessage[] = [
      {role: 'user', content: 'Hello'},
      {role: 'assistant', content: 'Hi there'},
      {role: 'user', content: 'Follow up'},
    ];

    await provider.analyze(messages);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {role: 'user', content: 'Hello'},
          {role: 'assistant', content: 'Hi there'},
          {role: 'user', content: 'Follow up'},
        ],
      }),
    );
  });

  it('concatenates multiple text content blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {type: 'text', text: 'Part one'},
        {type: 'text', text: ' Part two'},
      ],
      usage: {input_tokens: 50, output_tokens: 30},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const result = await provider.analyze([
      {role: 'user', content: 'Test'},
    ]);

    expect(result.content).toBe('Part one Part two');
  });

  it('ignores non-text content blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {type: 'text', text: 'Text block'},
        {type: 'tool_use', id: 'tool-1', name: 'some_tool', input: {}},
      ],
      usage: {input_tokens: 50, output_tokens: 30},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const result = await provider.analyze([
      {role: 'user', content: 'Test'},
    ]);

    expect(result.content).toBe('Text block');
  });

  it('wraps API errors in AnthropicProviderError', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limited'));

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Anthropic API error: API rate limited');
  });

  it('handles non-Error thrown values', async () => {
    mockCreate.mockRejectedValue('string error');

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Anthropic API error: string error');
  });

  it('sets max_tokens in the request', async () => {
    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 4096,
      }),
    );
  });
});

describe('analyzeStructured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON response', async () => {
    const expectedData = {severity: 'high', findings: ['sql-injection']};
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: JSON.stringify(expectedData)}],
      usage: {input_tokens: 50, output_tokens: 30},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    const result = await provider.analyzeStructured<typeof expectedData>(
      [{role: 'user', content: 'Analyze this code'}],
      '{ "severity": "string", "findings": "string[]" }',
    );

    expect(result).toEqual(expectedData);
  });

  it('injects schema hint into existing system message', async () => {
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: '{"result": "ok"}'}],
      usage: {input_tokens: 10, output_tokens: 5},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    await provider.analyzeStructured(
      [
        {role: 'system', content: 'You are a security tool.'},
        {role: 'user', content: 'Analyze'},
      ],
      '{ "result": "string" }',
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('You are a security tool.'),
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Respond with valid JSON matching this schema:',
        ),
      }),
    );
  });

  it('creates system message with schema hint when none exists', async () => {
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: '{"result": "ok"}'}],
      usage: {input_tokens: 10, output_tokens: 5},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );
    await provider.analyzeStructured(
      [{role: 'user', content: 'Analyze'}],
      '{ "result": "string" }',
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Respond with valid JSON matching this schema:',
        ),
      }),
    );
  });

  it('throws AnthropicProviderError on invalid JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [{type: 'text', text: 'not valid json {{{'}],
      usage: {input_tokens: 10, output_tokens: 5},
    });

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Failed to parse Anthropic JSON response');
  });

  it('wraps API errors in AnthropicProviderError', async () => {
    mockCreate.mockRejectedValue(new Error('Service unavailable'));

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Anthropic API error: Service unavailable');
  });

  it('handles non-Error thrown values in analyzeStructured', async () => {
    mockCreate.mockRejectedValue(42);

    const provider = createAnthropicProvider(
      'claude-sonnet-4-20250514',
      'test-key',
    );

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Anthropic API error: 42');
  });
});
