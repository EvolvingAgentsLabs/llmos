import { OpenRouterInference, createOpenRouterInference, createOpenRouterAdapter } from '../../../lib/runtime/openrouter-inference';

// =============================================================================
// Mock fetch
// =============================================================================

const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, status: number = 200): jest.Mock {
  const mock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// =============================================================================
// Tests
// =============================================================================

describe('OpenRouterInference', () => {
  describe('basic inference', () => {
    it('makes API call and returns content', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: '{"action":{"type":"STOP"},"fallback":{"if_failed":"STOP"},"explanation":"Done."}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key' });
      const result = await adapter.infer('System prompt', 'Navigate to goal');

      expect(result).toContain('STOP');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Check request body
      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('anthropic/claude-sonnet-4-5-20250929');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('sends authorization header', async () => {
      mockFetch({
        choices: [{ message: { content: 'OK' } }],
      });

      const adapter = new OpenRouterInference({ apiKey: 'sk-or-test-123' });
      await adapter.infer('System', 'User');

      const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].headers.Authorization).toBe('Bearer sk-or-test-123');
    });
  });

  describe('vision support', () => {
    it('includes images as multimodal content', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: 'Result' } }],
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key', supportsVision: true });
      await adapter.infer('System', 'Navigate', ['data:image/png;base64,abc123']);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const userMsg = body.messages[1];

      // User message should be array (multimodal)
      expect(Array.isArray(userMsg.content)).toBe(true);
      expect(userMsg.content).toHaveLength(2);
      expect(userMsg.content[0].type).toBe('text');
      expect(userMsg.content[1].type).toBe('image_url');
    });

    it('skips images when vision disabled', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: 'Result' } }],
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key', supportsVision: false });
      await adapter.infer('System', 'Navigate', ['data:image/png;base64,abc123']);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const userMsg = body.messages[1];

      // Should be plain string, not multimodal
      expect(typeof userMsg.content).toBe('string');
    });

    it('adds data URL prefix to raw base64', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: 'Result' } }],
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key' });
      await adapter.infer('System', 'Navigate', ['raw_base64_content']);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const imageUrl = body.messages[1].content[1].image_url.url;
      expect(imageUrl).toBe('data:image/png;base64,raw_base64_content');
    });
  });

  describe('error handling', () => {
    it('throws on API error', async () => {
      mockFetch({ error: 'Unauthorized' }, 401);

      const adapter = new OpenRouterInference({
        apiKey: 'bad-key',
        maxRetries: 0,
      });

      await expect(adapter.infer('System', 'User')).rejects.toThrow('OpenRouter API error 401');
    });

    it('throws on empty response', async () => {
      mockFetch({ choices: [{ message: {} }] });

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        maxRetries: 0,
      });

      await expect(adapter.infer('System', 'User')).rejects.toThrow('Empty response');
    });

    it('retries on failure', async () => {
      let callCount = 0;
      globalThis.fetch = jest.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            text: async () => 'Server Error',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Success on retry' } }],
          }),
        };
      }) as unknown as typeof fetch;

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        maxRetries: 1,
      });

      const result = await adapter.infer('System', 'User');
      expect(result).toBe('Success on retry');
      expect(callCount).toBe(2);
    });
  });

  describe('statistics tracking', () => {
    it('tracks successful calls', async () => {
      mockFetch({
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key' });
      await adapter.infer('System', 'User');
      await adapter.infer('System', 'User');

      const stats = adapter.getStats();
      expect(stats.totalCalls).toBe(2);
      expect(stats.successfulCalls).toBe(2);
      expect(stats.failedCalls).toBe(0);
      expect(stats.totalTokens).toBe(300);
      expect(stats.promptTokens).toBe(200);
      expect(stats.completionTokens).toBe(100);
      expect(stats.averageLatencyMs).toBeGreaterThan(0);
    });

    it('tracks failed calls', async () => {
      mockFetch({ error: 'fail' }, 500);

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        maxRetries: 0,
      });

      await adapter.infer('System', 'User').catch(() => {});

      const stats = adapter.getStats();
      expect(stats.failedCalls).toBe(1);
    });

    it('resets stats', async () => {
      mockFetch({
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const adapter = new OpenRouterInference({ apiKey: 'test-key' });
      await adapter.infer('System', 'User');

      adapter.resetStats();
      const stats = adapter.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });
  });

  describe('configuration', () => {
    it('uses custom model', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: 'OK' } }],
      });

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        model: 'google/gemini-pro',
      });
      await adapter.infer('System', 'User');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('google/gemini-pro');
    });

    it('uses custom temperature and max tokens', async () => {
      const fetchMock = mockFetch({
        choices: [{ message: { content: 'OK' } }],
      });

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 1024,
      });
      await adapter.infer('System', 'User');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(1024);
    });

    it('sends site URL and name headers', async () => {
      mockFetch({
        choices: [{ message: { content: 'OK' } }],
      });

      const adapter = new OpenRouterInference({
        apiKey: 'test-key',
        siteUrl: 'https://llmos.dev',
        siteName: 'LLMos',
      });
      await adapter.infer('System', 'User');

      const callArgs = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[1].headers['HTTP-Referer']).toBe('https://llmos.dev');
      expect(callArgs[1].headers['X-Title']).toBe('LLMos');
    });
  });

  describe('factory functions', () => {
    it('createOpenRouterInference returns InferenceFunction', async () => {
      mockFetch({
        choices: [{ message: { content: '{"action":{"type":"STOP"}}' } }],
      });

      const infer = createOpenRouterInference({ apiKey: 'test-key' });
      const result = await infer('System', 'User');

      expect(result).toContain('STOP');
    });

    it('createOpenRouterAdapter returns adapter with stats', async () => {
      mockFetch({
        choices: [{ message: { content: 'OK' } }],
        usage: { total_tokens: 42 },
      });

      const adapter = createOpenRouterAdapter({ apiKey: 'test-key' });
      await adapter.infer('System', 'User');

      expect(adapter.getStats().totalTokens).toBe(42);
    });
  });
});
