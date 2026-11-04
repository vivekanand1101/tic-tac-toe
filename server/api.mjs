import { playBoard } from '../dist/modules/play.js';
import { ValidationError } from '../dist/modules/game.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// Both the loopback preview and the web Worker use this board-only API.
export async function handleApi(request, env, fetcher = fetch) {
  const { pathname, origin } = new URL(request.url);
  if (pathname === '/api/config' && request.method === 'GET') return json({ jevProxy: true });
  if (pathname !== '/api/play') return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return json({ error: 'Origin not allowed.' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415);
  const authorization = request.headers.get('Authorization') || '';
  const apiKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!apiKey || apiKey.length > 1024 || /[\s\x00-\x1f\x7f]/.test(apiKey)) return json({ error: 'Enter your Jev API key in Key settings.' }, 401);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing board.' }, 400);
    let text = '', size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = JSON.parse(text);
    if (!input || Object.keys(input).some(key => !['board', 'startingPlayer'].includes(key))) return json({ error: 'Send only board and startingPlayer.' }, 400);
    if (env.MOVE_LIMITER) {
      const { success } = await env.MOVE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
      if (!success) return json({ error: 'Too many moves. Wait a minute before retrying.' }, 429);
    }
    return json(await playBoard(input.board, input.startingPlayer, apiKey, request.signal, fetcher));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: 'Invalid game board or starting player.' }, 400);
    if (error?.message === 'Jev rejected this key. Update it in Key settings.') return json({ error: error.message }, 401);
    if (error?.message === 'Jev rate limit reached. Wait before trying again.') return json({ error: error.message }, 429);
    // Never expose upstream bodies, environment values, or exception details.
    return json({ error: 'Jev could not choose a move. Retry, or choose local AI in Key settings.' }, 502);
  }
}
