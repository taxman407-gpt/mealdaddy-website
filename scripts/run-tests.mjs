import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

for (const file of readdirSync("tests").filter((name) => name.endsWith(".mjs")).sort()) {
  const result = spawnSync(process.execPath, [resolve("tests", file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
