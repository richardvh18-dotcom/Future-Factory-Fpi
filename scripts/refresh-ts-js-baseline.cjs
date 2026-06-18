#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const BASELINE_PATH = path.join(ROOT, "scripts", "ts-js-baseline.json");
const EXT_RE = /\.(js|jsx)$/i;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!EXT_RE.test(entry.name)) continue;
    files.push(toPosix(path.relative(ROOT, fullPath)));
  }

  return files;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error("src/ map niet gevonden.");
    process.exit(1);
  }

  const files = walk(SRC_DIR).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    files,
  };

  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[refresh-ts-js-baseline] baseline geupdate met ${files.length} bestanden.`);
}

main();
