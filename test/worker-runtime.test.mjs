import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
// Use the same workerd runtime version as the project's deployment tool.
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler'))('miniflare');

test('Cloudflare runtime can construct the Jev request and report an expired key', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const bundle = await build({ stdin: {
    contents: `import {requestJev} from './dist/modules/jev.js';
      export default {async fetch() {
        try {
          await requestJev('runtime-test-key', {}, undefined, async (url, init) => {
            // This constructor must accept the exact options in workerd, not just Node.
            const request = new Request(url, init);
            if (request.redirect !== 'manual') throw new Error('Redirects must not be followed');
            return new Response('', {status:401});
          });
        } catch (error) { return Response.json({message:error.message}); }
        return new Response('Expected rejected key', {status:500});
      }};`, resolveDir: process.cwd()
  }, bundle: true, format: 'esm', platform: 'browser', write: false });
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags || [], telemetry: { enabled: false }
  }));
  try {
    const response = await runtime.dispatchFetch('http://runtime.test/');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: 'Jev rejected this key. Update it in Key settings.' });
  } finally { await runtime.dispose(); }
});

test('production API works with real limiter bindings and limits requests without keys', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
  assert.deepEqual(config.routes, []);
  const bundle = await build({ stdin: {
    contents: `import {handleApi} from './server/api.mjs';
      export default {fetch(request,env) {
        return handleApi(request,env,async () => Response.json({answers:{move:{type:'choice',choice:'4'}}}));
      }};`, resolveDir: process.cwd()
  }, bundle: true, format: 'esm', platform: 'browser', write: false });
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: config.vars,
    ratelimits: Object.fromEntries(config.ratelimits.map(({name,...settings}) => [name,settings])),
    telemetry: { enabled: false }
  }));
  try {
    const move = await runtime.dispatchFetch('https://game.example/api/play', {
      method: 'POST', headers: { 'Content-Type':'application/json', Authorization:'Bearer runtime-fake-key' },
      body: JSON.stringify({board:['X',null,null,null,null,null,null,null,null],startingPlayer:'X'})
    });
    assert.equal(move.status,200);
    assert.equal((await move.json()).board[4],'O');
    const statuses = [];
    for (let attempt=0; attempt<32; attempt++) {
      const response = await runtime.dispatchFetch('https://game.example/api/play', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'
      });
      statuses.push(response.status);
      if (response.status === 429) assert.equal(response.headers.get('Retry-After'),'60');
      await response.text();
    }
    assert.equal(statuses[0],401);
    assert.ok(statuses.includes(429));
    assert.ok(statuses.every(status => status===401 || status===429));
  } finally { await runtime.dispose(); }
});
