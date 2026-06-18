#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const BASELINE_PATH = path.join(ROOT, "scripts", "ts-js-baseline.json");
const EXT_RE = /\.(js|jsx)$/i;

const ALLOWLIST = [
  "src/lang/",
  "src/components/language/",
];

function isAllowed(filePath) {
  return ALLOWLIST.some((prefix) => filePath.startsWith(prefix));
}

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
    files.push(fullPath);
  }

  return files;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const files = Array.isArray(parsed?.files) ? parsed.files : [];
  return new Set(files);
}

function main() {
  const baseline = loadBaseline();
  if (!baseline) {
    console.log("[enforce:new-ts] Geen baseline gevonden. Check overgeslagen.");
    process.exit(0);
  }

  if (!fs.existsSync(SRC_DIR)) {
    console.log("[enforce:new-ts] Geen src/ map gevonden. Check overgeslagen.");
    process.exit(0);
  }

  const currentJsFiles = walk(SRC_DIR)
    .map((absolutePath) => toPosix(path.relative(ROOT, absolutePath)))
    .filter((relativePath) => !isAllowed(relativePath));

  const offenders = currentJsFiles.filter((file) => !baseline.has(file));

  if (offenders.length === 0) {
    console.log("[enforce:new-ts] OK: geen nieuwe .js/.jsx bestanden in src/.");
    process.exit(0);
  }

  console.error("\n[enforce:new-ts] Nieuwe JavaScript-bestanden gevonden in src/.");
  console.error("Nieuwe functionaliteit moet in .ts/.tsx worden geschreven.\n");
  offenders.sort().forEach((file) => console.error(` - ${file}`));
  console.error("\nLos op door bestanden te hernoemen naar .ts/.tsx.");
  console.error("Als dit bewust legacy is, update scripts/ts-js-baseline.json.");
  process.exit(1);
}

main();
