import { existsSync, readFileSync } from "node:fs";

export function loadCliEnv(file = ".env"): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

export function cliHelp(name: "crawl" | "reindex"): boolean {
  if (!process.argv.includes("--help") && !process.argv.includes("-h")) return false;
  console.log(name === "crawl" ? "Usage: npm run crawl -- [--dry-run]" : "Usage: npm run reindex -- [--dry-run]");
  return true;
}
