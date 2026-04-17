#!/usr/bin/env node

/**
 * Prevalidate helper.
 *
 * This script intentionally avoids auto-deleting files during validation.
 * It reports known historical duplicate/legacy paths and exits successfully.
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const knownLegacyPaths = [
  'src/components/ai/AiCenterView,jsx',
  'src/components/AiAssistantView.jsx',
  'src/components/admin/AdminDrillingView.jsx',
  'vite.config.js',
  'src/services/aiServiceTest.js',
  'testGemini.js',
  'src/utils/lotPlaceholder.jsx',
  'functions/functions',
];

const existingLegacyPaths = knownLegacyPaths.filter((relPath) => {
  const absPath = path.join(rootDir, relPath);
  return fs.existsSync(absPath);
});

console.log('Prevalidate: duplicate/legacy scan complete.');

if (existingLegacyPaths.length > 0) {
  console.log('Found legacy entries (not auto-removed):');
  for (const relPath of existingLegacyPaths) {
    console.log(`- ${relPath}`);
  }
  console.log('Tip: run cleanup.sh or cleanup_pilot.sh if cleanup is desired.');
} else {
  console.log('No known duplicate/legacy entries detected.');
}
