import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(projectRoot, "dist");
const publicFiles = ["index.html", "faq.html", "instructions.html", "script.js", "styles.css"];
const publicDirectories = ["app", "assets"];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const file of publicFiles) {
  const source = join(projectRoot, file);
  if (!existsSync(source)) throw new Error(`Missing required public file: ${file}`);
  cpSync(source, join(outputRoot, file));
}

for (const directory of publicDirectories) {
  const source = join(projectRoot, directory);
  if (!existsSync(source)) throw new Error(`Missing required public directory: ${directory}`);
  cpSync(source, join(outputRoot, directory), { recursive: true });
}

console.log("Prepared the Netlify public bundle in dist/.");
