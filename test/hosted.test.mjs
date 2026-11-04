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
