// Keep the website's static game entry point in sync with the Worker assets.
import { cp, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const website = process.argv[2];
if (!website) throw new Error('Usage: node scripts/sync-website.mjs /path/to/website-source');
const root = resolve(website);
await access(resolve(root, 'slops/projects.json'));
const target = resolve(root, 'public/slops/tic-tac-toe');
await mkdir(target, { recursive: true });
for (const file of ['index.html', 'game.js', 'style.css', 'key-settings.js', 'key-settings.css', 'favicon-editorial.svg', 'modules']) {
  await cp(resolve('dist', file), resolve(target, file), { recursive: true });
}
console.log('Synced the browser game to the website source. No environment files are copied.');
