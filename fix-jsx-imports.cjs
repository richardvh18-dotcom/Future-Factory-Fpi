const fs = require('fs');
const path = require('path');

function processFolder(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      processFolder(fullPath);
    } else if (entry.isFile() && (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      let newContent = content.replace(/from\s+['"]([^'"]+)\.jsx['"]/g, 'from \'$1\'');
      newContent = newContent.replace(/import\s*\(\s*['"]([^'"]+)\.jsx['"]\s*\)/g, 'import(\'$1\')');
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log('Fixed imports in', fullPath);
      }
    }
  }
}

processFolder('src');
