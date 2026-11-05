// Package the same browser build and board-only API for Sites' Worker ESM runtime.
import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const destination = resolve('.sites/tic-tac-toe/worker/index.js');
const assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function collect(directory, prefix = '') {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (file.name.startsWith('_') || file.name.startsWith('.')) continue;
    const path = `${directory}/${file.name}`, route = `${prefix}/${file.name}`;
    if (file.isDirectory()) await collect(path, route);
    else assets[route] = { body: await readFile(path, 'utf8'), type: types[extname(file.name)] || 'text/plain; charset=utf-8' };
  }
}
await collect('dist');
const { outputFiles } = await build({
  stdin: { contents: `import {handleApi} from './server/api.mjs';\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request, env) {\nconst url=new URL(request.url);\nif(url.pathname.startsWith('/api/')) return handleApi(request, {});\nif(request.method!=='GET'&&request.method!=='HEAD') return new Response('Use GET',{status:405});\nconst asset=assets[url.pathname==='/'?'/index.html':url.pathname];\nif(!asset)return new Response('Not found',{status:404});\nreturn new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':\"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.typesafe.ai; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\"}});\n}};`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false
});
await writeFile(destination, outputFiles[0].text);
console.log('Prepared Sites Worker with player-supplied keys only.');
