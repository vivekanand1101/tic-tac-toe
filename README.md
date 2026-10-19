# Tic-tac-toe

A browser game and stateless Express API. You play X; the AI plays O. Minimax works offline, with optional Jev decisions and a minimax fallback. No database is needed.

## Run

Use Node.js 24 LTS (see `.nvmrc`; Node 22.9+ also works).

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open http://127.0.0.1:3039. Choose a square or let the AI start. The server binds only to your computer. `npm run dev` starts the development watcher; `npm test` builds and runs the tests.

For Jev, copy `.env.example` to `.env`, set `TYPESAFE_API_KEY`, and restart. `.env` loads automatically. `JEV_API_KEY` is an alias, `JEV_MODEL` defaults to `jev-latest`, and `PORT` defaults to `3039`. No key is included. Provider requests may incur costs; without a key the game makes no external API calls.

## API

`GET /health` returns `{"status":"ok","provider":"minimax"}` without a Jev key, or provider `jev` when configured.

```sh
curl http://127.0.0.1:3039/api/move \
  -H 'Content-Type: application/json' \
  -d '{"board":["X",null,null,null,null,null,null,null,null]}'
```

With minimax the exact response is:

```json
{"move":4,"provider":"minimax","fallback":false,"board":["X",null,null,null,"O",null,null,null,null],"status":"in_progress","nextPlayer":"X"}
```

Use a flat nine-cell board (`X`, `O`, or null), indexed in row-major order. Include `startingPlayer: "O"` throughout an AI-first round. Validation rejects unreachable boards, invalid symbols, and wrong turns. Terminal boards return `move: null`. Status is `in_progress`, `X_wins`, `O_wins`, or `draw`.

Invalid boards/JSON return 400, wrong content type 415, bodies above 4kb 413, and request limits 429. At most 60 API requests per minute and two in flight are allowed per process. Foreign browser origins and Host names are rejected with 403.

The Jev adapter calls a fixed HTTPS endpoint and validates the selected move. Provider errors, invalid choices, or its three-second timeout fall back to minimax. Tests use mocked provider responses; recovery verification made no paid API calls. Only minimax guarantees optimal play.

See `SECURITY.md` for local security assumptions and `RECOVERY.md` for recovery details.
