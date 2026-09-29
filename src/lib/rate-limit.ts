import { createHash } from "node:crypto";

export interface RateLimitDependencies {
  database: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
  salt: string;
  trustedIpHeader?: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult { allowed: boolean; remaining: number; resetAt: string }

export async function checkRateLimit(request: Request, deps: RateLimitDependencies): Promise<RateLimitResult> {
  const identity = deps.trustedIpHeader ? request.headers.get(deps.trustedIpHeader) ?? "local" : "local";
  const bucket = createHash("sha256").update(`${deps.salt}:${identity}`).digest("hex");
  const { data, error } = await deps.database.rpc("check_rate_limit", { p_bucket_key: bucket, p_max_requests: deps.maxRequests, p_window_seconds: deps.windowSeconds });
  if (error || !Array.isArray(data) || !data[0]) throw new Error(error instanceof Error ? error.message : "rate limit unavailable");
  const row = data[0] as { allowed: boolean; remaining: number; reset_at: string };
  return { allowed: row.allowed, remaining: row.remaining, resetAt: row.reset_at };
}
