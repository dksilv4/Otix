import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('frontend/src');
let replacedFiles = 0;
let totalReplacements = 0;

files.forEach(f => {
  // Never touch gameservers - that is multiplayer game servers (e.g. CS2/Palworld)
  if (f.includes('gameservers')) return;

  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('/library/servers')) {
    const newContent = content.replaceAll('/library/servers', '/library/nodes');
    const count = (content.match(/\/library\/servers/g) || []).length;
    fs.writeFileSync(f, newContent, 'utf8');
    console.log(`Updated ${f} (${count} replacements)`);
    replacedFiles++;
    totalReplacements += count;
  }
});

console.log(`\nFinished: ${totalReplacements} replacements across ${replacedFiles} files.`);
