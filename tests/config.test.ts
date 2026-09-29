import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { getConfig } from "../src/lib/config";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  ADMIN_SECRET: "admin-secret",
};

describe("getConfig", () => {
  it("ships placeholder credentials and the locked Node runtime floor", async () => {
    const [example, manifest, lockfile] = await Promise.all([
      readFile(".env.example", "utf8"),
      readFile("package.json", "utf8"),
      readFile("package-lock.json", "utf8"),
    ]);
    expect(example).toContain("SUPABASE_URL=https://your-project.supabase.co");
    expect(example).toContain("SUPABASE_SERVICE_ROLE_KEY=replace-with-your-supabase-service-role-key");
    expect(example).not.toMatch(/sjewuvjqcaugcegddatb|sb_publishable|RRZqLdRv/);
    expect(JSON.parse(manifest).engines.node).toBe(">=22.13.0");
    expect(JSON.parse(lockfile).packages[""]?.engines.node).toBe(">=22.13.0");
  });
  it("requires a Supabase URL", () => {
    expect(() => getConfig({} as NodeJS.ProcessEnv)).toThrow(/SUPABASE_URL/);
  });

  it("uses the official CS department base URL and local-first limits", () => {
    const config = getConfig(validEnv);

    expect(config.baseUrl.href).toBe(
      "https://www.ashoka.edu.in/department/department-of-cs/",
    );
    expect(config.requestsPerSecond).toBe(1);
    expect(config.maxPages).toBe(50);
    expect(config.retrievalLimit).toBe(5);
    expect(config.retrievalMinScore).toBe(0.6);
    expect(config.maxAnswerWords).toBe(250);
    expect(config.embeddingDimensions).toBe(1024);
    expect(config.chatEndpoint).toBe("http://127.0.0.1:11434/api/chat");
    expect(config.embeddingEndpoint).toBe("http://127.0.0.1:11434/api/embed");
    expect(config.providerTimeoutMs).toBe(30_000);
    expect(config.rateLimitSalt).toBe("admin-secret");
  });

  it("uses an explicit rate-limit salt when configured", () => {
    expect(getConfig({ ...validEnv, RATE_LIMIT_SALT: "separate-salt" }).rateLimitSalt).toBe("separate-salt");
  });

  it("rejects hosted development providers until explicitly enabled", () => {
    expect(() => getConfig({ ...validEnv, AI_PROVIDER: "nvidia" })).toThrow(
      /ENABLE_HOSTED_DEV_PROVIDERS/,
    );
  });

  it("rejects embedding dimensions that do not match the database contract", () => {
    expect(() => getConfig({ ...validEnv, EMBEDDING_DIMENSIONS: "1023" })).toThrow(
      /1024/,
    );
  });

  it("rejects answer limits above the immutable 250-word maximum", () => {
    expect(() => getConfig({ ...validEnv, MAX_ANSWER_WORDS: "251" })).toThrow(
      /MAX_ANSWER_WORDS/,
    );
  });

  it.each([
    "http://www.ashoka.edu.in/department/department-of-cs/",
    "https://evil.example/department/department-of-cs/",
    "https://www.ashoka.edu.in/about/",
  ])("rejects an untrusted BASE_URL: %s", (baseUrl) => {
    expect(() => getConfig({ ...validEnv, BASE_URL: baseUrl })).toThrow(/BASE_URL/);
  });

  it("keeps configured HTML prefixes as same-origin paths", () => {
    expect(
      getConfig({
        ...validEnv,
        HTML_PATH_PREFIXES: "/department/department-of-cs/faculty,/academics",
      }).htmlPathPrefixes,
    ).toEqual(["/department/department-of-cs/faculty", "/academics"]);

    expect(() =>
      getConfig({ ...validEnv, HTML_PATH_PREFIXES: "https://evil.example/cs" }),
    ).toThrow(/HTML_PATH_PREFIXES/);
  });
});
