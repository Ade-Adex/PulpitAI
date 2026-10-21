import fs from 'node:fs';

const [file, startArg, endArg, out] = process.argv.slice(2);
const start = Number(startArg);
const end = Number(endArg);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const slice = lines
  .slice(Math.max(0, start - 1), end)
  .map((line, i) => `${start + i} | ${line}`)
  .join('\n');
fs.writeFileSync(out, slice, 'utf8');
console.log('ok');
