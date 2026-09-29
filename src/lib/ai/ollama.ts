import type { AppConfig } from "../config";
import type { ChatProvider, EmbeddingProvider, ProviderFetch } from "./provider";
import { requestJson, validatedEmbeddings } from "./provider";

export function createOllamaProviders(config: AppConfig, fetch: ProviderFetch = globalThis.fetch): { embedder: EmbeddingProvider; chat: ChatProvider } {
  return {
    embedder: {
      async embed(inputs) {
        const response = await requestJson(fetch, config.embeddingEndpoint, { model: config.embeddingModel, input: inputs }, config.providerTimeoutMs) as { embeddings?: unknown };
        return validatedEmbeddings(response.embeddings, inputs.length, config.embeddingDimensions);
      },
    },
    chat: {
      async complete(request) {
        const response = await requestJson(fetch, config.chatEndpoint, { model: config.chatModel, messages: request.messages, stream: false, ...(request.maxTokens ? { options: { num_predict: request.maxTokens } } : {}) }, config.providerTimeoutMs) as { message?: { content?: unknown } };
        if (typeof response.message?.content !== "string") throw new Error("provider returned malformed chat response");
        return response.message.content;
      },
    },
  };
}
