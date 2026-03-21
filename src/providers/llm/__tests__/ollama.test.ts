import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {LLMMessage} from '../types.js';
import {
  createOllamaProvider,
  OllamaProviderError,
  isAvailable,
} from '../ollama.js';

// Mock global fetch for all tests.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Helper to create a successful Ollama chat response. */
function mockChatResponse(
  content: string,
  promptEvalCount?: number,
  evalCount?: number,
) {
  return {
    ok: true,
    json: async () => ({
      message: {role: 'assistant', content},
      prompt_eval_count: promptEvalCount,
      eval_count: evalCount,
    }),
  };
}

/** Helper to create a failed HTTP response. */
function mockErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    statusText: 'Error',
    text: async () => body,
  };
}

describe('createOllamaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid LLMProvider with correct name and model', () => {
    const provider = createOllamaProvider('llama3');

    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('llama3');
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.analyze).toBe('function');
    expect(typeof provider.analyzeStructured).toBe('function');
  });

  it('sets conservative default capabilities', () => {
    const provider = createOllamaProvider('llama3');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 8192,
      supportsImages: false,
      supportsStructuredOutput: true,
    });
  });

  it('accepts a custom base URL', () => {
    const provider = createOllamaProvider(
      'codellama',
      'http://remote-host:11434',
    );

    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('codellama');
  });

  it('supports various model names', () => {
    for (const modelName of [
      'llama3',
      'codellama',
      'mistral',
      'deepseek-coder',
    ]) {
      const provider = createOllamaProvider(modelName);
      expect(provider.model).toBe(modelName);
    }
  });
});

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(mockChatResponse('Analysis result', 200, 100));
  });

  it('sends messages and returns a well-formed response', async () => {
    const provider = createOllamaProvider('llama3');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'You are a security analyst.'},
      {role: 'user', content: 'Review this code.'},
    ];

    const result = await provider.analyze(messages);

    expect(result.content).toBe('Analysis result');
    expect(result.tokensUsed).toEqual({input: 200, output: 100});
    expect(result.model).toBe('llama3');
    expect(result.role).toBe('analysis');
  });

  it('calls the correct Ollama API endpoint', async () => {
    const provider = createOllamaProvider('llama3');
    await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      }),
    );
  });

  it('uses custom base URL in API calls', async () => {
    const provider = createOllamaProvider('llama3', 'http://remote:8080');
    await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://remote:8080/api/chat',
      expect.anything(),
    );
  });

  it('sends the correct request body with stream: false', async () => {
    const provider = createOllamaProvider('mistral');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System prompt'},
      {role: 'user', content: 'User message'},
    ];

    await provider.analyze(messages);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);

    expect(body).toEqual({
      model: 'mistral',
      messages: [
        {role: 'system', content: 'System prompt'},
        {role: 'user', content: 'User message'},
      ],
      stream: false,
    });
  });

  it('preserves all message roles (system, user, assistant)', async () => {
    const provider = createOllamaProvider('llama3');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System'},
      {role: 'user', content: 'Hello'},
      {role: 'assistant', content: 'Hi there'},
      {role: 'user', content: 'Follow up'},
    ];

    await provider.analyze(messages);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);

    expect(body.messages).toEqual([
      {role: 'system', content: 'System'},
      {role: 'user', content: 'Hello'},
      {role: 'assistant', content: 'Hi there'},
      {role: 'user', content: 'Follow up'},
    ]);
  });

  it('handles missing usage metadata gracefully', async () => {
    mockFetch.mockResolvedValue(
      mockChatResponse('Response without metadata', undefined, undefined),
    );

    const provider = createOllamaProvider('llama3');
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.tokensUsed).toEqual({input: 0, output: 0});
  });

  it('wraps HTTP errors in OllamaProviderError', async () => {
    mockFetch.mockResolvedValue(mockErrorResponse(500, 'Internal server error'));

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow(OllamaProviderError);
    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Ollama API error: HTTP 500: Internal server error');
  });

  it('wraps network errors in OllamaProviderError', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow(OllamaProviderError);
    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Ollama API error: fetch failed');
  });

  it('uses statusText when error body is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
    });

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('HTTP 404: Not Found');
  });
});

describe('analyzeStructured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON response', async () => {
    const expectedData = {severity: 'high', findings: ['sql-injection']};
    mockFetch.mockResolvedValue(
      mockChatResponse(JSON.stringify(expectedData), 50, 30),
    );

    const provider = createOllamaProvider('llama3');
    const result = await provider.analyzeStructured<typeof expectedData>(
      [{role: 'user', content: 'Analyze this code'}],
      '{ "severity": "string", "findings": "string[]" }',
    );

    expect(result).toEqual(expectedData);
  });

  it('sets format: "json" in the request body', async () => {
    mockFetch.mockResolvedValue(mockChatResponse('{"ok": true}', 10, 5));

    const provider = createOllamaProvider('llama3');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Test'}],
      '{}',
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);

    expect(body.format).toBe('json');
    expect(body.stream).toBe(false);
  });

  it('injects schema hint into existing system message', async () => {
    mockFetch.mockResolvedValue(
      mockChatResponse('{"result": "ok"}', 10, 5),
    );

    const provider = createOllamaProvider('llama3');
    await provider.analyzeStructured(
      [
        {role: 'system', content: 'You are a security tool.'},
        {role: 'user', content: 'Analyze'},
      ],
      '{ "result": "string" }',
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    const systemMsg = body.messages.find(
      (m: {role: string}) => m.role === 'system',
    );

    expect(systemMsg.content).toContain('You are a security tool.');
    expect(systemMsg.content).toContain(
      'Respond with valid JSON matching this schema:',
    );
    expect(systemMsg.content).toContain('{ "result": "string" }');
  });

  it('creates system message with schema hint when none exists', async () => {
    mockFetch.mockResolvedValue(
      mockChatResponse('{"result": "ok"}', 10, 5),
    );

    const provider = createOllamaProvider('llama3');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Analyze'}],
      '{ "result": "string" }',
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);

    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain(
      'Respond with valid JSON matching this schema:',
    );
    expect(body.messages[0].content).toContain('{ "result": "string" }');
  });

  it('throws OllamaProviderError on invalid JSON response', async () => {
    mockFetch.mockResolvedValue(
      mockChatResponse('not valid json {{{', 10, 5),
    );

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Failed to parse Ollama JSON response');
  });

  it('wraps HTTP errors in OllamaProviderError', async () => {
    mockFetch.mockResolvedValue(
      mockErrorResponse(503, 'Service unavailable'),
    );

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Ollama API error: HTTP 503: Service unavailable');
  });

  it('wraps network errors in OllamaProviderError', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const provider = createOllamaProvider('llama3');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Ollama API error: Connection refused');
  });
});

describe('OllamaProviderError', () => {
  it('has the correct name and provider', () => {
    const error = new OllamaProviderError('test error');

    expect(error.name).toBe('OllamaProviderError');
    expect(error.provider).toBe('ollama');
    expect(error.message).toBe('test error');
  });

  it('preserves the cause when provided', () => {
    const cause = new Error('root cause');
    const error = new OllamaProviderError('wrapper', cause);

    expect(error.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const error = new OllamaProviderError('test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OllamaProviderError);
  });
});

describe('isAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when Ollama server responds with models', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({models: [{name: 'llama3'}]}),
    });

    const result = await isAvailable();

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
    );
  });

  it('returns true with custom base URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({models: []}),
    });

    const result = await isAvailable('http://remote:8080');

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('http://remote:8080/api/tags');
  });

  it('returns false when server returns non-OK status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await isAvailable();

    expect(result).toBe(false);
  });

  it('returns false when fetch throws (server not running)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await isAvailable();

    expect(result).toBe(false);
  });

  it('returns false when response has unexpected shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({unexpected: 'data'}),
    });

    const result = await isAvailable();

    expect(result).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
