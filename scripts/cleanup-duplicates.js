// scripts/cleanup-duplicates.js
// This script removes duplicate Vite configs and ",jsx" typo files in src.
import fs from 'node:fs';
import path from 'node:path';

function deleteIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('Deleted:', filePath);
  }
}

// 1. Remove duplicate vite.config.js if vite.config.ts exists
const jsConfig = path.join(process.cwd(), 'vite.config.js');
const tsConfig = path.join(process.cwd(), 'vite.config.ts');
if (fs.existsSync(jsConfig) && fs.existsSync(tsConfig)) {
  deleteIfExists(jsConfig);
}

// 2. Remove files with typo: ",jsx" in src
function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (file.endsWith(',jsx')) {
      deleteIfExists(fullPath);
    }
  });
}
walkDir(path.join(process.cwd(), 'src'));

// 3. Remove files ending with ".js,.js" or ".ts,.ts" (comma typo)
function removeCommaFiles(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      removeCommaFiles(fullPath);
    } else if (file.match(/\.[jt]sx?,[jt]sx?$/)) {
      deleteIfExists(fullPath);
    }
  });
}
removeCommaFiles(path.join(process.cwd(), 'src'));
