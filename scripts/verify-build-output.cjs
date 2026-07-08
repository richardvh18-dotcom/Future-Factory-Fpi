#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, "dist");
const indexPath = path.join(distDir, "index.html");
const versionPath = path.join(distDir, "version.json");

function fail(message) {
  console.error(`\n[verify-build-output] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fail("dist directory is missing. Run build first.");
}

if (!fs.existsSync(indexPath)) {
  fail("dist/index.html is missing. Build output is incomplete.");
}

const indexHtml = fs.readFileSync(indexPath, "utf8");
if (!indexHtml.trim()) {
  fail("dist/index.html is empty.");
}

if (!indexHtml.includes("<div id=\"root\"></div>")) {
  fail("dist/index.html does not look like the app shell output.");
}

const refs = [
  ...indexHtml.matchAll(/(?:src|href)=\"\/(assets\/[^"]+)\"/g),
].map((match) => match[1]);

if (refs.length === 0) {
  fail("No /assets/* references found in dist/index.html.");
}

const missingAssets = refs.filter((assetRelPath) => {
  const assetPath = path.join(distDir, assetRelPath);
  return !fs.existsSync(assetPath);
});

if (missingAssets.length > 0) {
  fail(
    `Missing asset files referenced by index.html: ${missingAssets.join(", ")}`,
  );
}

if (!fs.existsSync(versionPath)) {
  fail("dist/version.json is missing. Versioning output is incomplete.");
}

console.log(
  `[verify-build-output] OK: dist output is complete (${refs.length} assets validated).`,
);