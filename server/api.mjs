import { playBoard } from '../dist/modules/play.js';
import { ValidationError } from '../dist/modules/game.js';

const json = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  ...(status === 429 ? { 'Retry-After': '60' } : {})
} });
const unavailable = () => json({ error: 'Game temporarily unavailable. Please try again later.' }, 503);
const limited = () => json({ error: 'Too many requests. Wait a minute before retrying.' }, 429);

async function checkLimit(binding, key) {
  if (!binding) return null; // Local preview has no Cloudflare bindings.
  try {
    const result = await binding.limit({ key });
    if (result?.success === true) return null;
    return result?.success === false ? limited() : unavailable();
  } catch {
    return unavailable();
  }
}

async function readBoard(request) {
  if (Number(request.headers.get('Content-Length')) > 1024) return json({ error: 'Request too large.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Missing board.' }, 400);
  let timer;
  try {
    return await Promise.race([
      (async () => {
        let text = '', size = 0;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024) return json({ error: 'Request too large.' }, 413);
          text += decoder.decode(value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
      })(),
      new Promise(resolve => { timer = setTimeout(() => resolve(json({ error: 'Request body timed out.' }, 408)), 2000); })
    ]);
  } finally {
    clearTimeout(timer);
    // A slow sender must not keep the handler waiting for cancellation either.
    void reader.cancel().catch(() => {});
  }
}

// Both the loopback preview and the web Worker use this board-only API.
export async function handleApi(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const cors = new Headers({ Vary: 'Origin' });
  const allowed = !origin || origin === url.origin || ['https://anandvivek.in', 'https://www.anandvivek.in'].includes(origin);
  if (allowed && origin) cors.set('Access-Control-Allow-Origin', origin);
  const respond = response => {
    const headers = new Headers(response.headers);
    for (const [key, value] of cors) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  };
  if (env.REQUIRE_LIMITS === 'true' && ['REQUEST_LIMITER', 'MOVE_LIMITER', 'KEY_LIMITER'].some(name => !env[name])) return respond(unavailable());
  const ingress = await checkLimit(env.REQUEST_LIMITER, `tic-tac-toe:request:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  if (ingress) return respond(ingress);
  if (!allowed) return respond(json({ error: 'Origin not allowed.' }, 403));
  if (request.method === 'OPTIONS') {
    if (url.pathname !== '/api/play' || request.headers.get('Access-Control-Request-Method') !== 'POST') return respond(json({ error: 'Use POST.' }, 405));
    cors.set('Access-Control-Allow-Methods', 'POST');
    cors.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    cors.set('Access-Control-Max-Age', '600');
    return new Response(null, { status: 204, headers: cors });
  }
  return respond(await routeApi(request, env, fetcher));
}

async function routeApi(request, env, fetcher) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/config' && request.method === 'GET') return json({ jevProxy: true });
  if (pathname !== '/api/play') return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415);
  const authorization = request.headers.get('Authorization') || '';
  const apiKey = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!apiKey || apiKey.length > 1024 || /[\s\x00-\x1f\x7f]/.test(apiKey)) return json({ error: 'Enter your Jev API key in Key settings.' }, 401);
  try {
    const moveLimit = await checkLimit(env.MOVE_LIMITER, `tic-tac-toe:move:${request.headers.get('CF-Connecting-IP') || 'local'}`);
    if (moveLimit) return moveLimit;
    if (env.KEY_LIMITER) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
      const keyHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const keyLimit = await checkLimit(env.KEY_LIMITER, `tic-tac-toe:key:${keyHash}`);
      if (keyLimit) return keyLimit;
    }
    const input = await readBoard(request);
    if (input instanceof Response) return input;
    if (!input || Object.keys(input).some(key => !['board', 'startingPlayer'].includes(key))) return json({ error: 'Send only board and startingPlayer.' }, 400);
    return json(await playBoard(input.board, input.startingPlayer, apiKey, request.signal, fetcher));
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return json({ error: 'Invalid game board or starting player.' }, 400);
    if (error?.message === 'Jev rejected this key. Update it in Key settings.') return json({ error: error.message }, 401);
    if (error?.message === 'Jev rate limit reached. Wait before trying again.') return json({ error: error.message }, 429);
    // Never expose upstream bodies, environment values, or exception details.
    return json({ error: 'Jev could not choose a move. Please try again.' }, 502);
  }
}
