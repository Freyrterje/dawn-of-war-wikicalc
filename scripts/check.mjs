import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(path, e.name)) : [join(path, e.name)]);
}
const files = ['server.mjs', ...['lib', 'scripts', 'public', 'tests'].flatMap(walk)].filter(f => /\.(mjs|js)$/.test(f));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
