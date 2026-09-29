import { z } from "zod";

const DEFAULT_BASE_URL = "https://www.ashoka.edu.in/department/department-of-cs/";
const OFFICIAL_ORIGIN = "https://www.ashoka.edu.in";
const CS_BASE_PATH = "/department/department-of-cs/";
const LOCAL_OLLAMA_CHAT_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const LOCAL_OLLAMA_EMBEDDING_ENDPOINT = "http://127.0.0.1:11434/api/embed";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_SECRET: z.string().min(1),
  BASE_URL: z.string().url().optional(),
  HTML_PATH_PREFIXES: z.string().optional(),
  AI_PROVIDER: z.enum(["ollama", "nvidia", "openrouter"]).default("ollama"),
  ENABLE_HOSTED_DEV_PROVIDERS: z.enum(["true", "false"]).default("false"),
  OLLAMA_CHAT_MODEL: z.string().min(1).default("llama3.2"),
  OLLAMA_EMBEDDING_MODEL: z.string().min(1).default("nomic-embed-text"),
  OLLAMA_CHAT_ENDPOINT: z.string().url().default(LOCAL_OLLAMA_CHAT_ENDPOINT),
  OLLAMA_EMBEDDING_ENDPOINT: z.string().url().default(LOCAL_OLLAMA_EMBEDDING_ENDPOINT),
  NVIDIA_BASE_URL: z.string().url().optional(),
  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_CHAT_MODEL: z.string().min(1).optional(),
  NVIDIA_EMBEDDING_MODEL: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_CHAT_MODEL: z.string().min(1).optional(),
  OPENROUTER_EMBEDDING_MODEL: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_COMPLETION_TOKENS: z.coerce.number().int().positive().optional(),
  CRAWL_REQUESTS_PER_SECOND: z.coerce.number().positive().default(1),
  CRAWL_MAX_PAGES: z.coerce.number().int().positive().default(50),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CRAWL_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(2_000_000),
  CRAWL_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  RETRIEVAL_LIMIT: z.coerce.number().int().positive().max(5).default(5),
  RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.60),
  MAX_ANSWER_WORDS: z.coerce.number().int().positive().max(250).default(250),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  RATE_LIMIT_REQUESTS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  RATE_LIMIT_SALT: z.string().min(1).optional(),
  TRUSTED_IP_HEADER: z.string().min(1).optional(),
});

export type ProviderName = "ollama" | "nvidia" | "openrouter";

export interface AppConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminSecret: string;
  baseUrl: URL;
  htmlPathPrefixes: string[];
  aiProvider: ProviderName;
  hostedDevProvidersEnabled: boolean;
  chatModel: string;
  embeddingModel: string;
  chatEndpoint: string;
  embeddingEndpoint: string;
  providerApiKey?: string;
  requestsPerSecond: number;
  maxPages: number;
  crawlTimeoutMs: number;
  maxResponseBytes: number;
  maxRetries: number;
  retrievalLimit: number;
  retrievalMinScore: number;
  maxAnswerWords: number;
  embeddingDimensions: number;
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  cacheTtlSeconds: number;
  rateLimitSalt: string;
  providerTimeoutMs: number;
  maxCompletionTokens?: number;
  trustedIpHeader?: string;
}

function providerSettings(env: z.infer<typeof envSchema>): Pick<AppConfig, "chatModel" | "embeddingModel" | "chatEndpoint" | "embeddingEndpoint" | "providerApiKey"> {
  if (env.AI_PROVIDER === "ollama") {
    return {
      chatModel: env.OLLAMA_CHAT_MODEL,
      embeddingModel: env.OLLAMA_EMBEDDING_MODEL,
      chatEndpoint: env.OLLAMA_CHAT_ENDPOINT,
      embeddingEndpoint: env.OLLAMA_EMBEDDING_ENDPOINT,
    };
  }

  if (env.ENABLE_HOSTED_DEV_PROVIDERS !== "true") {
    throw new Error("ENABLE_HOSTED_DEV_PROVIDERS=true is required for hosted development providers");
  }

  const isNvidia = env.AI_PROVIDER === "nvidia";
  const apiKey = isNvidia ? env.NVIDIA_API_KEY : env.OPENROUTER_API_KEY;
  const endpoint = isNvidia ? env.NVIDIA_BASE_URL : env.OPENROUTER_BASE_URL;
  const chatModel = isNvidia ? env.NVIDIA_CHAT_MODEL : env.OPENROUTER_CHAT_MODEL;
  const embeddingModel = isNvidia ? env.NVIDIA_EMBEDDING_MODEL : env.OPENROUTER_EMBEDDING_MODEL;

  if (!apiKey || !endpoint || !chatModel || !embeddingModel) {
    throw new Error(`${env.AI_PROVIDER.toUpperCase()}_API_KEY, base URL, chat model, and embedding model are required`);
  }

  return {
    chatModel,
    embeddingModel,
    chatEndpoint: `${endpoint.replace(/\/$/, "")}/chat/completions`,
    embeddingEndpoint: `${endpoint.replace(/\/$/, "")}/embeddings`,
    providerApiKey: apiKey,
  };
}

function officialBaseUrl(value: string): URL {
  const baseUrl = new URL(value);
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.origin !== OFFICIAL_ORIGIN ||
    !baseUrl.pathname.startsWith(CS_BASE_PATH) ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error(`BASE_URL must be an HTTPS ${OFFICIAL_ORIGIN} URL under ${CS_BASE_PATH}`);
  }
  return baseUrl;
}

function parseHtmlPathPrefixes(value: string | undefined, baseUrl: URL): string[] {
  const prefixes = (value?.split(",") ?? [baseUrl.pathname]).map((prefix) => prefix.trim());
  if (!prefixes.length || prefixes.some((prefix) => !prefix.startsWith("/"))) {
    throw new Error("HTML_PATH_PREFIXES must contain one or more same-origin paths");
  }

  return prefixes.map((prefix) => {
    const url = new URL(prefix, baseUrl.origin);
    if (url.origin !== baseUrl.origin || url.search || url.hash) {
      throw new Error("HTML_PATH_PREFIXES must contain one or more same-origin paths");
    }
    return url.pathname;
  });
}

export function getConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
  }

  if (parsed.data.EMBEDDING_DIMENSIONS !== 1024) {
    throw new Error("EMBEDDING_DIMENSIONS must be 1024 to match the database vector contract");
  }

  const baseUrl = officialBaseUrl(parsed.data.BASE_URL ?? DEFAULT_BASE_URL);
  const htmlPathPrefixes = parseHtmlPathPrefixes(parsed.data.HTML_PATH_PREFIXES, baseUrl);

  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    adminSecret: parsed.data.ADMIN_SECRET,
    baseUrl,
    htmlPathPrefixes,
    aiProvider: parsed.data.AI_PROVIDER,
    hostedDevProvidersEnabled: parsed.data.ENABLE_HOSTED_DEV_PROVIDERS === "true",
    ...providerSettings(parsed.data),
    requestsPerSecond: parsed.data.CRAWL_REQUESTS_PER_SECOND,
    maxPages: parsed.data.CRAWL_MAX_PAGES,
    crawlTimeoutMs: parsed.data.CRAWL_TIMEOUT_MS,
    maxResponseBytes: parsed.data.CRAWL_MAX_RESPONSE_BYTES,
    maxRetries: parsed.data.CRAWL_MAX_RETRIES,
    retrievalLimit: parsed.data.RETRIEVAL_LIMIT,
    retrievalMinScore: parsed.data.RETRIEVAL_MIN_SCORE,
    maxAnswerWords: parsed.data.MAX_ANSWER_WORDS,
    embeddingDimensions: parsed.data.EMBEDDING_DIMENSIONS,
    rateLimitRequests: parsed.data.RATE_LIMIT_REQUESTS,
    rateLimitWindowSeconds: parsed.data.RATE_LIMIT_WINDOW_SECONDS,
    cacheTtlSeconds: parsed.data.CACHE_TTL_SECONDS,
    rateLimitSalt: parsed.data.RATE_LIMIT_SALT ?? parsed.data.ADMIN_SECRET,
    providerTimeoutMs: parsed.data.AI_TIMEOUT_MS,
    maxCompletionTokens: parsed.data.AI_MAX_COMPLETION_TOKENS,
    trustedIpHeader: parsed.data.TRUSTED_IP_HEADER,
  };
}
