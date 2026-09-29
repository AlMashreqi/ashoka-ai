import type { AppConfig } from "../config";
import type { ChatProvider, EmbeddingProvider } from "./provider";
import { createOllamaProviders } from "./ollama";
import { createOpenAICompatibleProviders } from "./openai-compatible";

export function createProviders(config: AppConfig): { embedder: EmbeddingProvider; chat: ChatProvider } {
  return config.aiProvider === "ollama"
    ? createOllamaProviders(config)
    : createOpenAICompatibleProviders(config);
}
