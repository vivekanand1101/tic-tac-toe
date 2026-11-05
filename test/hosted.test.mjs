import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../server/api.mjs';
import worker from '../server/worker.mjs';
const board = ['X', null, null, null, null, null, null, null, null];
const request = (body = { board, startingPlayer: 'X' }, headers = {}) => new Request('https://game.example/api/play', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer player-key', ...headers }, body: JSON.stringify(body)
});
test('each player supplies their own key; server environment credentials are never used or exposed', async () => {
  const env = { JEV_API_KEY: 'unused-owner-key' };
  const config = await handleApi(new Request('https://game.example/api/config'), env);
  assert.deepEqual(await config.json(), { jevProxy: true });
  for (const key of ['alice-key', 'bob-key']) {
    const response = await handleApi(request(undefined, { Authorization: `Bearer ${key}` }), env, async (url, options) => {
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.headers.Authorization, `Bearer ${key}`);
      assert.equal(JSON.parse(options.body).model, 'jev-latest');
      return Response.json({ answers: { move: { type: 'choice', choice: '4' } } });
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes(key), false);
    assert.equal(text.includes(env.JEV_API_KEY), false);
    assert.deepEqual(JSON.parse(text).board, ['X', null, null, null, 'O', null, null, null, null]);
  }
});
test('invalid, cross-origin, oversized and arbitrary prompt requests never call Jev', async () => {
  for (const [req, status] of [
    [request({ board: [] }), 400],
    [request({ board, prompt: 'arbitrary' }), 400],
    [request(null), 400],
    [request({}, { Origin: 'https://other.example' }), 403],
    [request({}, { 'Content-Type': 'text/plain' }), 415],
    [request({ board: 'x'.repeat(2000) }), 413],
    [new Request('https://game.example/api/play'), 405],
    [request(undefined, { Authorization: '' }), 401],
    [request(undefined, { Authorization: 'Bearer with space' }), 401]
  ]) {
    const response = await handleApi(req, { JEV_API_KEY: 'never-use-this' }, () => assert.fail('must not call Jev'));
    assert.equal(response.status, status);
  }
});
test('rate limits, rejected keys and provider failures are explicit and redact sensitive details', async () => {
  const limited = { MOVE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await handleApi(request(), limited, () => assert.fail('must not fetch'))).status, 429);
  const rejected = await handleApi(request(), {}, async () => new Response('', { status: 401 }));
  assert.equal(rejected.status, 401);
  assert.match((await rejected.json()).error, /Update it in Key settings/);
  const response = await handleApi(request(), {}, async () => { throw Error('player-key'); });
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('player-key'), false);
});
test('Worker serves static assets and API routes separately', async () => {
  const config = await worker.fetch(new Request('https://game.example/api/config'), {});
  assert.deepEqual(await config.json(), { jevProxy: true });
  const response = await worker.fetch(new Request('https://game.example/'), { ASSETS: { fetch: async () => new Response('game') } });
  assert.equal(await response.text(), 'game');
});
test('personal-site path redirects to a directory and maps assets and API to the same game', async () => {
  const base = 'https://anandvivek.in/slops/tic-tac-toe';
  const redirect = await worker.fetch(new Request(base + '?round=1'), {});
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), base + '/?round=1');
  for (const path of ['/', '/game.js', '/modules/play.js']) {
    const response = await worker.fetch(new Request(base + path), { ASSETS: { fetch: async request => {
      assert.equal(new URL(request.url).pathname, path);
      assert.equal(new URL(request.url).origin, 'https://anandvivek.in');
      return new Response('game asset');
    } } });
    assert.equal(await response.text(), 'game asset');
  }
  const config = await worker.fetch(new Request(base + '/api/config'), {});
  assert.deepEqual(await config.json(), { jevProxy: true });
  const missingKey = await worker.fetch(new Request(base + '/api/play', {
    method: 'POST', headers: { Origin: 'https://anandvivek.in', 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, startingPlayer: 'X' })
  }), {});
  assert.equal(missingKey.status, 401);
});
test('personal website can preflight the Worker API and read rejected-key responses', async () => {
  const url = 'https://tic-tac-toe.vivekanand1101.workers.dev/api/play';
  const origin = 'https://anandvivek.in';
  const preflight = await worker.fetch(new Request(url, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type'
  } }), {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/i);
  const rejected = await worker.fetch(new Request(url, { method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json'
  }, body: '{}' }), {});
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), origin);
});
test('Worker rejects untrusted browser origins without forwarding any key', async () => {
  const response = await handleApi(request(undefined, { Origin: 'https://untrusted.example' }), {}, () => assert.fail('must not call Jev'));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
test('ingress limits include missing-key requests before processing their bodies', async () => {
  let checked = false;
  const req = request({}, { Authorization: '', 'CF-Connecting-IP': '192.0.2.15' });
  const response = await handleApi(req, { REQUEST_LIMITER: { limit: async ({key}) => {
    checked = true;assert.equal(key, 'tic-tac-toe:request:192.0.2.15');return {success:false};
  } } }, () => assert.fail('must not call Jev'));
  assert.equal(response.status, 429);
  assert.equal(checked, true);
  assert.equal(req.bodyUsed, false);
  assert.equal(response.headers.get('Retry-After'), '60');
});

test('move limits run before the body, and key limits use only a stable key hash', async () => {
  const blocked = request();
  assert.equal((await handleApi(blocked, { MOVE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal(blocked.bodyUsed, false);
  const keys = [];
  for (const ip of ['192.0.2.1', '192.0.2.2']) {
    const req = request(undefined, { 'CF-Connecting-IP': ip });
    const response = await handleApi(req, { KEY_LIMITER: { limit: async ({ key }) => {
      keys.push(key);
      assert.match(key, /^tic-tac-toe:key:[a-f0-9]{64}$/);
      assert.equal(key.includes('player-key'), false);
      return { success: false };
    } } }, () => assert.fail('must not call Jev'));
    assert.equal(response.status, 429);
    assert.equal(req.bodyUsed, false);
  }
  assert.equal(keys[0], keys[1]);
});

test('limiter failures or missing production bindings reject requests without calling Jev', async () => {
  for (const env of [
    { REQUIRE_LIMITS: 'true' },
    { REQUEST_LIMITER: { limit: async () => { throw Error('private details'); } } },
    { MOVE_LIMITER: { limit: async () => undefined } },
    { KEY_LIMITER: { limit: async () => { throw Error('player-key'); } } }
  ]) {
    const req = request();
    const response = await handleApi(req, env, () => assert.fail('must not call Jev'));
    assert.equal(response.status, 503);
    assert.equal(req.bodyUsed, false);
    assert.equal((await response.text()).includes('player-key'), false);
  }
});

test('ingress limiting covers preflights and unknown routes with readable CORS errors', async () => {
  for (const req of [
    new Request('https://game.example/api/play', { method: 'OPTIONS', headers: {
      Origin: 'https://anandvivek.in', 'Access-Control-Request-Method': 'POST'
    } }),
    new Request('https://game.example/api/unknown', { headers: { Origin: 'https://anandvivek.in' } })
  ]) {
    const response = await handleApi(req, { REQUEST_LIMITER: { limit: async () => ({ success: false }) } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://anandvivek.in');
  }
});

test('announced oversized and stalled bodies never reach Jev', async () => {
  const oversized = request(undefined, { 'Content-Length': '1000000' });
  assert.equal((await handleApi(oversized, {}, () => assert.fail('must not call Jev'))).status, 413);
  assert.equal(oversized.bodyUsed, false);
  let cancelled = false;
  const slow = new Request('https://game.example/api/play', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-key' },
    body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: 'half'
  });
  const response = await handleApi(slow, {}, () => assert.fail('must not call Jev'));
  assert.equal(response.status, 408);
  assert.equal(cancelled, true);
});
