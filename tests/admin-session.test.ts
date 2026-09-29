import { timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createAdminSession, hasAdminSession, secretsMatch, sessionCookie } from "../src/lib/admin-session";
import { createAdminCrawlHandler, createAdminReindexHandler } from "../src/lib/admin-actions";

describe("admin session", () => {
  it("compares the submitted secret through a timing-safe comparator", () => {
    let comparisons = 0;
    const compare = (left: Uint8Array, right: Uint8Array) => {
      comparisons += 1;
      return timingSafeEqual(left, right);
    };

    expect(secretsMatch("correct-secret", "correct-secret", compare)).toBe(true);
    expect(secretsMatch("incorrect-key", "correct-secret", compare)).toBe(false);
    expect(comparisons).toBe(2);
  });

  it("signs HttpOnly session values and rejects expiry or tampering", () => {
    const issuedAt = 1_700_000_000_000;
    const token = createAdminSession("admin-secret", issuedAt, 60);

    expect(hasAdminSession(token, "admin-secret", issuedAt + 59_000)).toBe(true);
    expect(hasAdminSession(token, "admin-secret", issuedAt + 60_001)).toBe(false);
    expect(hasAdminSession(`${token}x`, "admin-secret", issuedAt + 1)).toBe(false);
  });

  it("allows the admin cookie over local HTTP but marks HTTPS cookies Secure", () => {
    expect(sessionCookie("token", new Request("http://localhost:3000/api/admin/login"), 60)).toContain("HttpOnly; Path=/; SameSite=Lax; Max-Age=60");
    expect(sessionCookie("token", new Request("http://localhost:3000/api/admin/login"), 60)).not.toContain("; Secure");
    expect(sessionCookie("token", new Request("https://assistant.example/api/admin/login"), 60)).toContain("; Secure");
  });

  it("rejects every admin mutation before work begins without a valid session", async () => {
    let crawlCalls = 0;
    let reindexCalls = 0;
    const crawl = createAdminCrawlHandler({ isAuthorized: () => false, run: async () => { crawlCalls += 1; return { attempted: 0 }; } });
    const reindex = createAdminReindexHandler({ isAuthorized: () => false, run: async () => { reindexCalls += 1; return { indexed: 0 }; } });

    expect((await crawl(new Request("https://local/api/admin/crawl", { method: "POST" }))).status).toBe(401);
    expect((await reindex(new Request("https://local/api/admin/reindex", { method: "POST" }))).status).toBe(401);
    expect(crawlCalls).toBe(0);
    expect(reindexCalls).toBe(0);
  });

  it("passes the configured page limit to an authorized crawl", async () => {
    let limit: number | undefined;
    const handler = createAdminCrawlHandler({ isAuthorized: () => true, maxPages: 3, run: async (value) => { limit = value; return { attempted: value }; } });

    await expect((await handler(new Request("https://local/api/admin/crawl", { method: "POST" }))).json()).resolves.toEqual({ attempted: 3 });
    expect(limit).toBe(3);
  });

  it("requires a same-origin Origin before admin work", async () => {
    let calls = 0;
    const handler = createAdminCrawlHandler({ isAuthorized: () => true, origin: "https://local", run: async () => { calls += 1; return {}; } });
    expect((await handler(new Request("https://local/api/admin/crawl", { method: "POST" }))).status).toBe(403);
    expect((await handler(new Request("https://local/api/admin/crawl", { method: "POST", headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await handler(new Request("https://local/api/admin/crawl", { method: "POST", headers: { origin: "https://local" } }))).status).toBe(200);
    expect(calls).toBe(1);
    const reindex = createAdminReindexHandler({ isAuthorized: () => true, origin: "https://local", run: async () => ({}) });
    expect((await reindex(new Request("https://local/api/admin/reindex", { method: "POST", headers: { origin: "https://evil.example" } }))).status).toBe(403);
  });
});
