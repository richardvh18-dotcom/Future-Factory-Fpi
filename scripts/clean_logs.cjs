const fs = require('fs');
const path = require('path');

const directories = ['src', 'functions/src', 'functions/index.js'];
const extensions = ['.js', '.jsx', '.ts', '.tsx'];

function processPath(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(targetPath);
    for (const file of files) {
      processPath(path.join(targetPath, file));
    }
  } else if (stat.isFile()) {
    const ext = path.extname(targetPath);
    if (extensions.includes(ext)) {
      cleanFile(targetPath);
    }
  }
}

function cleanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // We only replace lines that have nothing else but console.log(...) or console.debug(...)
  const regex = /^[ \t]*console\.(log|debug)\(.*?\);?[ \t]*\r?\n/gm;

  content = content.replace(regex, '');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Cleaned: ${filePath}`);
  }
}

for (const dir of directories) {
  const fullPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(fullPath)) {
    processPath(fullPath);
  }
}
