import { describe, expect, it } from "vitest";

import { checkRateLimit } from "../src/lib/rate-limit";

describe("rate limiting", () => {
  it("hashes only the configured trusted header and uses the atomic RPC boundaries", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const database = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: [{ allowed: false, remaining: 0, reset_at: "2026-01-01T00:00:00Z" }], error: null }; } };
    await expect(checkRateLimit(new Request("https://local", { headers: { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "forged" } }), { database, salt: "salt", trustedIpHeader: "cf-connecting-ip", maxRequests: 10, windowSeconds: 60 })).resolves.toEqual({ allowed: false, remaining: 0, resetAt: "2026-01-01T00:00:00Z" });
    await checkRateLimit(new Request("https://local", { headers: { "x-forwarded-for": "attacker-a" } }), { database, salt: "salt", maxRequests: 10, windowSeconds: 60 });
    await checkRateLimit(new Request("https://local", { headers: { "x-forwarded-for": "attacker-b" } }), { database, salt: "salt", maxRequests: 10, windowSeconds: 60 });
    expect(calls[0]).toMatchObject({ name: "check_rate_limit", args: { p_max_requests: 10, p_window_seconds: 60 } });
    expect(calls[1].args.p_bucket_key).toBe(calls[2].args.p_bucket_key);
    expect(calls[0].args.p_bucket_key).not.toBe(calls[1].args.p_bucket_key);
  });
});
