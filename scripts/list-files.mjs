import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const out = process.argv[3];
const lines = [];

function walk(dir, depth = 0) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'release') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1);
    } else {
      lines.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
}

walk(root);
fs.writeFileSync(out, lines.sort().join('\n'), 'utf8');
console.log(`wrote ${lines.length} entries to ${out}`);
