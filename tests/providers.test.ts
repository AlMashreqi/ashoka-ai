import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../src/lib/config";
import { createProviders } from "../src/lib/ai/factory";
import { createOllamaProviders } from "../src/lib/ai/ollama";
import { createOpenAICompatibleProviders } from "../src/lib/ai/openai-compatible";

const config: AppConfig = {
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "service",
  adminSecret: "secret",
  baseUrl: new URL("https://www.ashoka.edu.in/department/department-of-cs/"),
  htmlPathPrefixes: ["/department/department-of-cs/"],
  aiProvider: "ollama",
  hostedDevProvidersEnabled: false,
  chatModel: "llama3.2",
  embeddingModel: "nomic-embed-text",
  chatEndpoint: "http://127.0.0.1:11434/api/chat",
  embeddingEndpoint: "http://127.0.0.1:11434/api/embed",
  requestsPerSecond: 1,
  maxPages: 50,
  crawlTimeoutMs: 15_000,
  maxResponseBytes: 2_000_000,
  maxRetries: 2,
  retrievalLimit: 5,
  retrievalMinScore: 0,
  maxAnswerWords: 250,
  embeddingDimensions: 768,
  rateLimitRequests: 10,
  rateLimitWindowSeconds: 60,
  cacheTtlSeconds: 86_400,
  rateLimitSalt: "rate-limit-salt",
  providerTimeoutMs: 30_000,
};

const vector = Array.from({ length: 768 }, () => 0);

describe("Ollama providers", () => {
  it("maps embed and chat requests through native fetch with a timeout", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return requests.length === 1
        ? Response.json({ embeddings: [vector] })
        : Response.json({ message: { content: "Grounded answer" } });
    };
    const providers = createOllamaProviders(config, fetch);

    await expect(providers.embedder.embed(["department text"])).resolves.toEqual([vector]);
    await expect(providers.chat.complete({ messages: [{ role: "user", content: "Question" }] })).resolves.toBe("Grounded answer");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ model: "nomic-embed-text", input: ["department text"] });
    expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ model: "llama3.2", stream: false });
    expect(requests.every((request) => request.init?.signal instanceof AbortSignal)).toBe(true);
  });

  it("rejects HTTP, malformed, and wrong-dimension embedding responses", async () => {
    await expect(createOllamaProviders(config, async () => new Response("bad", { status: 500 })).embedder.embed(["x"])).rejects.toThrow(/500/);
    await expect(createOllamaProviders(config, async () => Response.json({ embeddings: "bad" })).embedder.embed(["x"])).rejects.toThrow(/malformed/);
    await expect(createOllamaProviders(config, async () => Response.json({ embeddings: [[0]] })).embedder.embed(["x"])).rejects.toThrow(/768/);
  });

  it("uses the configured provider timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await createOllamaProviders({ ...config, providerTimeoutMs: 123 }, async () => Response.json({ embeddings: [vector] }))
        .embedder.embed(["department text"]);
      expect(timeout).toHaveBeenCalledWith(123);
    } finally {
      timeout.mockRestore();
    }
  });
});

describe("OpenAI-compatible providers", () => {
  it("maps embeddings and chat responses with bearer authorization", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const hosted = { ...config, aiProvider: "nvidia" as const, hostedDevProvidersEnabled: true, providerApiKey: "key", providerTimeoutMs: 456, embeddingEndpoint: "https://provider.example/v1/embeddings", chatEndpoint: "https://provider.example/v1/chat/completions" };
    const fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return requests.length === 1
        ? Response.json({ data: [{ embedding: vector }] })
        : Response.json({ choices: [{ message: { content: "Compatible answer" } }] });
    };
    const providers = createOpenAICompatibleProviders(hosted, fetch);
    const timeout = vi.spyOn(AbortSignal, "timeout");

    try {
      await expect(providers.embedder.embed(["official text"])).resolves.toEqual([vector]);
      await expect(providers.chat.complete({ messages: [{ role: "user", content: "Question" }] })).resolves.toBe("Compatible answer");
      expect(JSON.parse(String(requests[0].init?.body))).toEqual({ model: "nomic-embed-text", input: ["official text"] });
      expect(new Headers(requests[1].init?.headers).get("authorization")).toBe("Bearer key");
      expect(requests.every((request) => request.init?.signal instanceof AbortSignal)).toBe(true);
      expect(timeout).toHaveBeenCalledWith(456);
    } finally {
      timeout.mockRestore();
    }
  });

  it("refuses hosted construction without the explicit config gate and key", () => {
    expect(() => createProviders({ ...config, aiProvider: "openrouter", providerApiKey: "key" })).toThrow(/ENABLE_HOSTED_DEV_PROVIDERS/);
    expect(() => createOpenAICompatibleProviders({ ...config, aiProvider: "nvidia", hostedDevProvidersEnabled: true })).toThrow(/API key/);
  });
});
