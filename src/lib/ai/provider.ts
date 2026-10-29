/**
 * AI Provider Abstraction
 * Supports OpenAI-compatible chat completions endpoints (OpenAI, RunPod vLLM
 * serverless `/openai/v1`, Ollama, LM Studio, …).
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

/**
 * Why an AI call failed. Lets API routes give the user an honest message and
 * gives server logs enough to diagnose (status, provider body, latency).
 */
export type AIErrorKind =
  | "config" // missing key / bad base URL
  | "timeout" // provider didn't answer within AI_TIMEOUT_MS (e.g. RunPod cold start)
  | "network" // DNS / TLS / connection refused from the server to the provider
  | "http" // provider returned non-2xx
  | "bad_response" // 2xx but not parseable / provider-level error object
  | "empty"; // 2xx but no assistant text

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: AIErrorKind,
    public readonly details: {
      status?: number;
      body?: string;
      url?: string;
      model?: string;
      attempt?: number;
      elapsedMs?: number;
    } = {}
  ) {
    super(message);
    this.name = "AIProviderError";
  }

  /** Safe, secret-free summary for logs. */
  toLog() {
    return { kind: this.kind, message: this.message, ...this.details };
  }
}

/**
 * Normalise AI_BASE_URL so `${base}/chat/completions` is always correct:
 *  - trims whitespace and trailing slashes
 *  - strips an accidentally pasted `/chat/completions`
 *  - RunPod serverless: `https://api.runpod.ai/v2/<id>` or `.../openai` → `.../openai/v1`
 */
export function normalizeAiBaseUrl(raw: string | undefined): string {
  let url = (raw || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  url = url.replace(/\/chat\/completions$/, "").replace(/\/embeddings$/, "");
  if (/api\.runpod\.ai\/v2\/[^/]+$/.test(url)) url += "/openai/v1";
  else if (/api\.runpod\.ai\/v2\/[^/]+\/openai$/.test(url)) url += "/v1";
  return url;
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Remove reasoning blocks some open models (DeepSeek-R1, Qwen3…) emit inline. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AIProvider {
  private config: AIProviderConfig;

  constructor(config?: Partial<AIProviderConfig>) {
    this.config = {
      baseUrl: normalizeAiBaseUrl(process.env.AI_BASE_URL),
      apiKey: (process.env.AI_API_KEY || "").trim(),
      model: (process.env.AI_MODEL || "gpt-4o-mini").trim(),
      embeddingModel: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
      // RunPod serverless cold starts can take well over a minute.
      timeoutMs: envInt("AI_TIMEOUT_MS", 120_000),
      // Only connection failures / 502-504 are retried; never timeouts (would double-bill).
      maxRetries: envInt("AI_MAX_RETRIES", 1),
      ...config,
    };
  }

  /** Non-secret description of the configured endpoint (for logs / health). */
  describe() {
    let host = "invalid-url";
    try {
      host = new URL(this.config.baseUrl).host;
    } catch {}
    return {
      host,
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      apiKeySet: Boolean(this.config.apiKey),
      timeoutMs: this.config.timeoutMs,
    };
  }

  private assertConfigured() {
    if (!this.config.apiKey) {
      throw new AIProviderError("AI_API_KEY is not configured", "config", { url: this.config.baseUrl });
    }
    try {
      new URL(this.config.baseUrl);
    } catch {
      throw new AIProviderError(`AI_BASE_URL is not a valid URL`, "config", { url: this.config.baseUrl });
    }
  }

  /** POST with timeout, typed errors and a small retry for transient failures. */
  private async post(body: unknown, model: string): Promise<Response> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const maxAttempts = 1 + (this.config.maxRetries ?? 0);
    let lastErr: AIProviderError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
        });
        if (response.ok) return response;

        const errText = await response.text().catch(() => "");
        lastErr = new AIProviderError(`AI provider returned HTTP ${response.status}`, "http", {
          status: response.status,
          body: errText.slice(0, 500),
          url,
          model,
          attempt,
          elapsedMs: Date.now() - started,
        });
        if (!RETRYABLE_STATUS.has(response.status)) throw lastErr;
      } catch (err) {
        if (err instanceof AIProviderError) {
          if (err.kind !== "http" || !RETRYABLE_STATUS.has(err.details.status ?? 0)) throw err;
        } else {
          const e = err as Error & { cause?: { code?: string; message?: string } };
          const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
          lastErr = new AIProviderError(
            isTimeout
              ? `AI provider did not respond within ${this.config.timeoutMs}ms`
              : `Could not reach AI provider: ${e?.cause?.code || e?.cause?.message || e?.message}`,
            isTimeout ? "timeout" : "network",
            { url, model, attempt, elapsedMs: Date.now() - started }
          );
          if (isTimeout) throw lastErr;
        }
      }
      if (attempt < maxAttempts) {
        console.warn("[ai] transient failure, retrying", lastErr?.toLog());
        await sleep(800 * attempt);
      }
    }
    throw lastErr ?? new AIProviderError("AI request failed", "network", { url, model });
  }

  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    this.assertConfigured();
    const model = options.model || this.config.model;
    const started = Date.now();

    const response = await this.post(
      {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        stream: false,
      },
      model
    );

    const raw = await response.text();
    let data: {
      model?: string;
      error?: unknown;
      choices?: { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      // RunPod native (non-OpenAI) shape
      status?: string;
      output?: unknown;
    };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new AIProviderError("AI provider returned non-JSON", "bad_response", {
        status: response.status,
        body: raw.slice(0, 500),
        model,
        elapsedMs: Date.now() - started,
      });
    }

    if (data.error) {
      throw new AIProviderError("AI provider returned an error object", "bad_response", {
        status: response.status,
        body: JSON.stringify(data.error).slice(0, 500),
        model,
        elapsedMs: Date.now() - started,
      });
    }

    const choice = data.choices?.[0];
    const content = stripReasoning(choice?.message?.content ?? "");
    if (!content) {
      throw new AIProviderError("AI provider returned an empty reply", "empty", {
        status: response.status,
        body: JSON.stringify({
          finish_reason: choice?.finish_reason,
          hasReasoning: Boolean(choice?.message?.reasoning_content),
          runpodStatus: data.status,
          keys: Object.keys(data),
        }),
        model,
        elapsedMs: Date.now() - started,
      });
    }

    return {
      content,
      model: data.model || model,
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
  async *chatStream(options: ChatCompletionOptions): AsyncGenerator<string, void, unknown> {
    this.assertConfigured();
    const model = options.model || this.config.model;

    const response = await this.post(
      {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1024,
        stream: true,
      },
      model
    );

    const reader = response.body?.getReader();
    if (!reader) throw new AIProviderError("No response body", "bad_response", { model });

    const decoder = new TextDecoder();
    let buffer = "";
    let yielded = false;

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
        if (data === "[DONE]") {
          if (!yielded) throw new AIProviderError("AI provider stream was empty", "empty", { model });
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            yielded = true;
            yield delta;
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    if (!yielded) throw new AIProviderError("AI provider stream was empty", "empty", { model });
  }
}

export const aiProvider = new AIProvider();
