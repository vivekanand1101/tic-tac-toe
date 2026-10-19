import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { JevChooser, chooseMove, buildJevRequest } from '../src/ai.js';
import { minimax, legalMoves, status, type Cell } from '../src/game.js';

test('API wins immediately and blocks an immediate X win', async () => {
  for (const board of [['O','O',null,'X','X',null,'X',null,null], ['X','X',null,null,'O',null,null,null,null]]) {
    const result = await request(createApp()).post('/api/move').send({ board });
    assert.equal(result.status, 200);
    assert.equal(result.body.move, 2);
    assert.equal(result.body.board[2], 'O');
    assert.equal(result.body.provider, 'minimax');
  }
});

test('validation rejects malformed, wrong-turn, and unreachable boards', async () => {
  const app = createApp();
  for (const board of [[], Array(9).fill(null), ['x',null,null,null,null,null,null,null,null], ['X','X','X','O','O','O',null,null,null], ['X','X','X','O','O',null,'O',null,null]]) {
    const result = await request(app).post('/api/move').send({ board });
    assert.equal(result.status, 400);
    assert.equal(typeof result.body.error, 'string');
  }
  assert.equal((await request(app).post('/api/move').set('Content-Type','application/json').send('{')).status, 400);
  assert.equal((await request(app).post('/api/move').send('hello')).status, 415);
});

test('terminal boards return no move and never call Jev', async () => {
  const app = createApp({ choose: async () => { throw new Error('must not be called'); } });
  for (const [board, expected] of [
    [['X','X','X','O','O',null,null,null,null], 'X_wins'],
    [['X','X','O','X','O',null,'O',null,null], 'O_wins'],
    [['X','O','X','X','O','O','O','X','X'], 'draw']
  ] as const) {
    const result = await request(app).post('/api/move').send({ board });
    assert.equal(result.status, 200);
    assert.equal(result.body.move, null);
    assert.equal(result.body.status, expected);
  }
});

test('Jev adapter sends only legal criteria and parses a valid choice', async () => {
  const board: Cell[] = ['X',null,null,null,null,null,null,null,null];
  const fakeFetch: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(options!.body as string);
    assert.equal(body.questions.move.type, 'choice');
    assert.deepEqual(Object.keys(body.questions.move.criteria), ['1','2','3','4','5','6','7','8']);
    assert.ok(options!.signal);
    return Response.json({ answers: { move: { type: 'choice', choice: '4' } } });
  };
  assert.deepEqual(await chooseMove(board, new JevChooser('test-key', 'jev-latest', fakeFetch)), { move: 4, provider: 'jev', fallback: false });
});

test('provider failures and illegal choices fall back to minimax', async () => {
  const board: Cell[] = ['X',null,null,null,null,null,null,null,null];
  const choosers = [
    { choose: async () => { throw new Error('network failure'); } },
    { choose: async () => 0 },
    new JevChooser('test', 'jev-latest', async () => new Response('', { status: 503 })),
    new JevChooser('test', 'jev-latest', async () => Response.json({ answers: { move: { type: 'choice', choice: '0' } } })),
    new JevChooser('test', 'jev-latest', async () => Response.json(null))
  ];
  for (const chooser of choosers) assert.deepEqual(await chooseMove(board, chooser), { move: 4, provider: 'minimax', fallback: true });
});

test('minimax never loses against any human move sequence', () => {
  function play(board: Cell[]): void {
    const current = status(board);
    assert.notEqual(current, 'X_wins');
    if (current !== 'in_progress') return;
    for (const human of legalMoves(board)) {
      const next = [...board]; next[human] = 'X';
      assert.notEqual(status(next), 'X_wins');
      if (status(next) === 'in_progress') { next[minimax(next)] = 'O'; play(next); }
    }
  }
  play(Array<Cell>(9).fill(null));
});

 test('O can start; starter controls legal turn validation', async () => {
 const app = createApp();
 const opening = await request(app).post('/api/move').send({board: Array(9).fill(null), startingPlayer:'O'});
 assert.equal(opening.status,200);
 assert.equal(opening.body.board.filter((c: unknown)=>c==='O').length,1);
 assert.equal(opening.body.nextPlayer,'X');
 const board = opening.body.board;
 board[board.indexOf(null)]='X';
 assert.equal((await request(app).post('/api/move').send({board,startingPlayer:'O'})).status,200);
 assert.equal((await request(app).post('/api/move').send({board,startingPlayer:'X'})).status,400);
 assert.equal((await request(app).post('/api/move').send({board,startingPlayer:'Z'})).status,400);
 });

 test('Jev receives correct immediate wins, threats, and fork information', () => {
 const win = buildJevRequest(['O','O',null,'X','X',null,'X',null,null], [2,5,7,8], 'jev-latest');
 assert.equal(win.questions.move.criteria['2'].winsNow, true);
 assert.deepEqual(win.questions.move.criteria['2'].immediateWinningRepliesForX, []);
 const block = buildJevRequest(['X','X',null,null,'O',null,null,null,null], [2,3,5,6,7,8], 'jev-latest');
 assert.deepEqual(block.questions.move.criteria['2'].immediateWinningRepliesForX, []);
 assert.deepEqual(block.questions.move.criteria['3'].immediateWinningRepliesForX, [2]);
 const fork = buildJevRequest(['O','X',null,'X','O',null,null,null,null], [2,5,6,7,8], 'jev-latest');
 assert.deepEqual(fork.questions.move.criteria['2'].nextTurnWinningSquaresForO, [6,8]);
 });
