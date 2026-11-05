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
