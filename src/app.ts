import { inferenceLimit, localBrowserSecurity } from './security.js';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import { chooseMove, type MoveChooser } from './ai.js';
import { status, validateBoard, ValidationError } from './game.js';
export function createApp(chooser?: MoveChooser) {
  const app = express();
  app.disable('x-powered-by');
  app.use(localBrowserSecurity());
  app.use('/api', inferenceLimit(60));
  app.use(express.json({ limit: '4kb' }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok', provider: chooser ? 'jev' : 'minimax' }); });
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.post('/api/move', async (req, res) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'Content-Type must be application/json.' }); return; }
    const board = validateBoard(req.body?.board, req.body?.startingPlayer);
    const currentStatus = status(board);
    if (currentStatus !== 'in_progress') {
      res.json({ move: null, board, status: currentStatus, nextPlayer: null, provider: null, fallback: false }); return;
    }
    const decision = await chooseMove(board, chooser);
    const next = [...board]; next[decision.move] = 'O';
    const nextStatus = status(next);
    res.json({ ...decision, board: next, status: nextStatus, nextPlayer: nextStatus === 'in_progress' ? 'X' : null });
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Route not found.' }); });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ValidationError) { res.status(400).json({ error: error.message }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Malformed JSON.' }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request body exceeds 4kb.' }); return; }
    console.error('Unexpected request error');
    res.status(500).json({ error: 'Internal server error.' });
  };
  app.use(errors);
  return app;
}
