import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {LLMMessage} from '../types.js';

// Mock the @google/generative-ai module before importing the provider.
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Import after the mock is set up.
import {createGeminiProvider} from '../gemini.js';

describe('createGeminiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Test response',
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
        },
      },
    });
  });

  it('returns a valid LLMProvider with correct name and model', () => {
    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');

    expect(provider.name).toBe('gemini');
    expect(provider.model).toBe('gemini-2.5-flash');
    expect(provider.capabilities).toBeDefined();
    expect(typeof provider.analyze).toBe('function');
    expect(typeof provider.analyzeStructured).toBe('function');
  });

  it('sets capabilities correctly for gemini-2.5-pro', () => {
    const provider = createGeminiProvider('gemini-2.5-pro', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 1_000_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for gemini-2.5-flash', () => {
    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 1_000_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets capabilities correctly for gemini-2.5-flash-lite', () => {
    const provider = createGeminiProvider('gemini-2.5-flash-lite', 'test-key');

    expect(provider.capabilities).toEqual({
      maxContextTokens: 1_000_000,
      supportsImages: true,
      supportsStructuredOutput: true,
    });
  });

  it('sets sensible defaults for unknown model names', () => {
    const provider = createGeminiProvider('gemini-3.0-ultra', 'test-key');

    expect(provider.capabilities.maxContextTokens).toBe(1_000_000);
    expect(provider.capabilities.supportsImages).toBe(true);
    expect(provider.capabilities.supportsStructuredOutput).toBe(true);
  });
});

describe('analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Analysis result',
        usageMetadata: {
          promptTokenCount: 200,
          candidatesTokenCount: 100,
        },
      },
    });
  });

  it('sends messages and returns a well-formed response', async () => {
    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'You are a security analyst.'},
      {role: 'user', content: 'Review this code.'},
    ];

    const result = await provider.analyze(messages);

    expect(result.content).toBe('Analysis result');
    expect(result.tokensUsed).toEqual({input: 200, output: 100});
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.role).toBe('analysis');
  });

  it('passes system instruction separately from contents', async () => {
    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'system', content: 'System prompt'},
      {role: 'user', content: 'User message'},
    ];

    await provider.analyze(messages);

    // Verify getGenerativeModel was called with systemInstruction
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        systemInstruction: 'System prompt',
      }),
    );

    // Verify generateContent was called with user content only
    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [{role: 'user', parts: [{text: 'User message'}]}],
    });
  });

  it('maps assistant role to model role for Gemini', async () => {
    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    const messages: LLMMessage[] = [
      {role: 'user', content: 'Hello'},
      {role: 'assistant', content: 'Hi there'},
      {role: 'user', content: 'Follow up'},
    ];

    await provider.analyze(messages);

    expect(mockGenerateContent).toHaveBeenCalledWith({
      contents: [
        {role: 'user', parts: [{text: 'Hello'}]},
        {role: 'model', parts: [{text: 'Hi there'}]},
        {role: 'user', parts: [{text: 'Follow up'}]},
      ],
    });
  });

  it('handles missing usage metadata gracefully', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Response without metadata',
        usageMetadata: undefined,
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    const result = await provider.analyze([{role: 'user', content: 'Test'}]);

    expect(result.tokensUsed).toEqual({input: 0, output: 0});
  });

  it('wraps API errors in GeminiProviderError', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API rate limited'));

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');

    await expect(
      provider.analyze([{role: 'user', content: 'Test'}]),
    ).rejects.toThrow('Gemini API error: API rate limited');
  });
});

describe('analyzeStructured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON response', async () => {
    const expectedData = {severity: 'high', findings: ['sql-injection']};
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(expectedData),
        usageMetadata: {promptTokenCount: 50, candidatesTokenCount: 30},
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    const result = await provider.analyzeStructured<typeof expectedData>(
      [{role: 'user', content: 'Analyze this code'}],
      '{ "severity": "string", "findings": "string[]" }',
    );

    expect(result).toEqual(expectedData);
  });

  it('uses responseMimeType application/json', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"ok": true}',
        usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 5},
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Test'}],
      '{}',
    );

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    );
  });

  it('injects schema hint into existing system message', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"result": "ok"}',
        usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 5},
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    await provider.analyzeStructured(
      [
        {role: 'system', content: 'You are a security tool.'},
        {role: 'user', content: 'Analyze'},
      ],
      '{ "result": "string" }',
    );

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('You are a security tool.'),
      }),
    );
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining(
          'Respond with valid JSON matching this schema:',
        ),
      }),
    );
  });

  it('creates system message with schema hint when none exists', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '{"result": "ok"}',
        usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 5},
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');
    await provider.analyzeStructured(
      [{role: 'user', content: 'Analyze'}],
      '{ "result": "string" }',
    );

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining(
          'Respond with valid JSON matching this schema:',
        ),
      }),
    );
  });

  it('throws GeminiProviderError on invalid JSON response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'not valid json {{{',
        usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 5},
      },
    });

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Failed to parse Gemini JSON response');
  });

  it('wraps API errors in GeminiProviderError', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Service unavailable'));

    const provider = createGeminiProvider('gemini-2.5-flash', 'test-key');

    await expect(
      provider.analyzeStructured([{role: 'user', content: 'Test'}], '{}'),
    ).rejects.toThrow('Gemini API error: Service unavailable');
  });
});
