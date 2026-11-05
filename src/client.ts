import type { Board } from './game.js';
import type { playBoard } from './play.js';

export const WORKER_API = 'https://tic-tac-toe.vivekanand1101.workers.dev/api/play';
export const KEY_REQUIRED = 'Your Jev key is missing, invalid, or expired. Enter a valid key to continue.';
export class GameServiceError extends Error {
  constructor(message: string, readonly requiresKey = false) { super(message); this.name = 'GameServiceError'; }
}
export function gameApiUrl(pageUrl: string): string {
  const page = new URL(pageUrl);
  // Pages may serve the static game without its same-origin Worker route.
  if (page.origin === 'https://anandvivek.in' || page.origin === 'https://www.anandvivek.in') return WORKER_API;
  return new URL('./api/play', page).href;
}
export async function requestMove(board: Board, startingPlayer: 'X' | 'O', key: string, pageUrl: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Awaited<ReturnType<typeof playBoard>>> {
  if (!key) throw new GameServiceError(KEY_REQUIRED, true);
  let response: Response;
  try {
    response = await fetcher(gameApiUrl(pageUrl), {
      method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ board, startingPlayer }),
      signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])])
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    throw new GameServiceError('Cannot reach the game service. Check your connection and try again.');
  }
  if (response.status === 401 || response.status === 403) throw new GameServiceError(KEY_REQUIRED, true);
  if (response.status === 429) throw new GameServiceError('Too many moves. Wait a minute before trying again.');
  if (!response.ok) throw new GameServiceError('The game service could not choose a move. Try again.');
  try { return await response.json() as Awaited<ReturnType<typeof playBoard>>; }
  catch { throw new GameServiceError('The game service returned an invalid response. Try again.'); }
}
