#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const versionJsonPath = path.join(root, "public", "version.json");
const packageLockPath = path.join(root, "package-lock.json");

const isDryRun = process.argv.includes("--dry-run");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const bumpPatch = (version) => {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Ongeldige semver-versie: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
};

const packageJson = readJson(packageJsonPath);
const currentVersion = packageJson.version;
const nextVersion = bumpPatch(currentVersion);

if (isDryRun) {
  console.log(`[dry-run] Version bump: ${currentVersion} -> ${nextVersion}`);
  process.exit(0);
}

packageJson.version = nextVersion;
writeJson(packageJsonPath, packageJson);

if (fs.existsSync(versionJsonPath)) {
  const versionJson = readJson(versionJsonPath);
  versionJson.version = nextVersion;
  writeJson(versionJsonPath, versionJson);
}

if (fs.existsSync(packageLockPath)) {
  const lockJson = readJson(packageLockPath);
  lockJson.version = nextVersion;
  if (lockJson.packages && lockJson.packages[""]) {
    lockJson.packages[""].version = nextVersion;
  }
  writeJson(packageLockPath, lockJson);
}

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}`);
