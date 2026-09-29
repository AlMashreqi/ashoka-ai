import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadCliEnv } from "../src/lib/cli-env";

describe("CLI environment loading", () => {
  it("loads a local env file without overwriting deployment values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cs-cli-"));
    const file = join(directory, ".env");
    const before = process.env.CS_TEST_LOCAL_ENV;
    await writeFile(file, "CS_TEST_LOCAL_ENV=from-file\nCS_TEST_QUOTED='quoted value'\n");
    process.env.CS_TEST_LOCAL_ENV = "from-process";
    try {
      loadCliEnv(file);
      expect(process.env.CS_TEST_LOCAL_ENV).toBe("from-process");
      expect(process.env.CS_TEST_QUOTED).toBe("quoted value");
    } finally {
      if (before === undefined) delete process.env.CS_TEST_LOCAL_ENV;
      else process.env.CS_TEST_LOCAL_ENV = before;
      delete process.env.CS_TEST_QUOTED;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
