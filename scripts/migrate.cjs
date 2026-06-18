const fs = require('fs');
const path = require('path');

const targetFolders = [
  'src/components/ai',
  'src/components/debug',
  'src/components/digitalplanning',
  'src/components/notifications',
  'src/components/personnel',
  'src/components/planning',
  'src/components/printer',
  'src/components/products',
  'src/components/teamleader'
];

function processFolder(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      processFolder(fullPath);
    } else if (entry.isFile() && fullPath.endsWith('.jsx')) {
      const newPath = fullPath.replace(/\.jsx$/, '.tsx');
      
      const content = fs.readFileSync(fullPath, 'utf8');
      const newContent = '// @ts-nocheck\n' + content;
      
      fs.writeFileSync(newPath, newContent, 'utf8');
      fs.unlinkSync(fullPath);
      console.log(`Migrated: ${fullPath} -> ${newPath}`);
    }
  }
}

for (const folder of targetFolders) {
  const fullFolderPath = path.resolve(__dirname, folder);
  if (fs.existsSync(fullFolderPath)) {
    console.log(`Processing folder: ${folder}`);
    processFolder(fullFolderPath);
  } else {
    console.warn(`Folder not found: ${folder}`);
  }
}
