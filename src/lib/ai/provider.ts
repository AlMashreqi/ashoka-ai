export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface EmbeddingProvider {
  embed(inputs: string[]): Promise<number[][]>;
}

export interface ChatProvider {
  complete(request: ChatRequest): Promise<string>;
}

export type ProviderFetch = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

export async function requestJson(fetch: ProviderFetch, url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

export function validatedEmbeddings(value: unknown, inputCount: number, dimensions: number): number[][] {
  if (!Array.isArray(value) || value.length !== inputCount || !value.every((vector) => Array.isArray(vector) && vector.length === dimensions && vector.every(Number.isFinite))) {
    throw new Error(`provider returned malformed embeddings; expected ${inputCount} vectors of ${dimensions} values`);
  }
  return value as number[][];
}
