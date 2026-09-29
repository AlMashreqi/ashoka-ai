import type { AppConfig } from "../config";
import type { ChatProvider, EmbeddingProvider, ProviderFetch } from "./provider";
import { validatedEmbeddings } from "./provider";

async function requestCompatibleJson(fetch: ProviderFetch, url: string, key: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`provider request failed: ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error("provider returned malformed JSON");
  }
}

export function createOpenAICompatibleProviders(config: AppConfig, fetch: ProviderFetch = globalThis.fetch): { embedder: EmbeddingProvider; chat: ChatProvider } {
  if (!config.hostedDevProvidersEnabled) throw new Error("ENABLE_HOSTED_DEV_PROVIDERS=true is required for hosted development providers");
  if (!config.providerApiKey) throw new Error("hosted provider API key is required");
  const key = config.providerApiKey;
  return {
    embedder: {
      async embed(inputs) {
        const response = await requestCompatibleJson(fetch, config.embeddingEndpoint, key, { model: config.embeddingModel, input: inputs }, config.providerTimeoutMs) as { data?: Array<{ embedding?: unknown }> };
        return validatedEmbeddings(response.data?.map((item) => item.embedding), inputs.length, config.embeddingDimensions);
      },
    },
    chat: {
      async complete(request) {
        const response = await requestCompatibleJson(fetch, config.chatEndpoint, key, {
          model: config.chatModel,
          messages: request.messages,
          ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        }, config.providerTimeoutMs) as { choices?: Array<{ message?: { content?: unknown } }> };
        const content = response.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new Error("provider returned malformed chat response");
        return content;
      },
    },
  };
}
