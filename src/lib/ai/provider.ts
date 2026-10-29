/**
 * AI Provider Abstraction
 * Supports OpenAI-compatible chat completions endpoints.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class AIProvider {
  private config: AIProviderConfig;

  constructor(config?: Partial<AIProviderConfig>) {
    this.config = {
      baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.AI_API_KEY || "",
      model: process.env.AI_MODEL || "gpt-4o-mini",
      embeddingModel: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
      timeoutMs: 60_000,
      maxRetries: 2,
      ...config,
    };
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    if (!this.config.apiKey) {
      throw new Error("AI_API_KEY is not configured");
    }

    const body = {
      model: options.model || this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `AI provider error ${response.status}: ${errText.slice(0, 200)}`
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? "",
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Streaming chat — returns an async iterable of content deltas.
   */
  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.apiKey) {
      throw new Error("AI_API_KEY is not configured");
    }

    const body = {
      model: options.model || this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: true,
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `AI provider error ${response.status}: ${errText.slice(0, 200)}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}

export const aiProvider = new AIProvider();
