import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameApiUrl, requestMove, GameServiceError, KEY_REQUIRED, WORKER_API } from '../dist/modules/client.js';
const board = ['X', null, null, null, null, null, null, null, null];
const site = 'https://anandvivek.in/slops/tic-tac-toe/';
test('the personal site always uses its Worker, without API discovery or direct Jev requests', async () => {
  assert.equal(gameApiUrl(site), WORKER_API);
  assert.equal(gameApiUrl('https://www.anandvivek.in/slops/tic-tac-toe/'), WORKER_API);
  assert.equal(gameApiUrl('http://127.0.0.1:3039/'), 'http://127.0.0.1:3039/api/play');
  assert.equal(gameApiUrl('https://tic-tac-toe.vivekanand1101.workers.dev/'), WORKER_API);
  const expected = { board: ['X', null, null, null, 'O', null, null, null, null], provider: 'jev' };
  const result = await requestMove(board, 'X', 'player-key', site, undefined, async (url, options) => {
    assert.equal(url, WORKER_API);
    assert.equal(options.headers.Authorization, 'Bearer player-key');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), { board, startingPlayer: 'X' });
    return Response.json(expected);
  });
  assert.deepEqual(result, expected);
});
test('missing, rejected and expired keys signal that the frontend must ask for a key', async () => {
  await assert.rejects(requestMove(board, 'X', '', site, undefined, () => assert.fail('must not request without a key')), error => error.requiresKey && error.message === KEY_REQUIRED);
  for (const status of [401, 403]) await assert.rejects(requestMove(board, 'X', 'expired-key', site, undefined, async () => new Response('private provider detail', { status })), error => error instanceof GameServiceError && error.requiresKey && error.message === KEY_REQUIRED);
});
test('network, rate and invalid-response errors do not misidentify the key or switch to direct Jev', async () => {
  for (const fetcher of [async () => { throw Error('player-key'); }, async () => new Response('', { status: 429 }), async () => new Response('<html>Pages fallback</html>')]) {
    await assert.rejects(requestMove(board, 'X', 'player-key', site, undefined, fetcher), error => error instanceof GameServiceError && !error.requiresKey && !error.message.includes('player-key'));
  }
});
test('cancelling a request preserves cancellation instead of requesting another key', async () => {
  const controller = new AbortController();controller.abort();
  await assert.rejects(requestMove(board, 'X', 'player-key', site, controller.signal, async () => { throw Error('cancelled'); }), { name: 'AbortError' });
});
