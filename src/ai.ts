import { legalMoves, minimax, status, type Board } from './game.js';
export interface MoveChooser { choose(board: Board, legal: readonly number[]): Promise<number> }
export const MOVE_INSTRUCTIONS = `You play O and it is your turn. X is the opponent. Either player may have started.
A win is three identical marks in a row, column, or diagonal. Empty cells are null.
Choose one supplied move using this priority order:
1. Win now if possible, even if X also threatens a win.
2. Otherwise prevent X from winning on its next turn. Prefer moves with no immediateWinningRepliesForX.
3. Create a fork: two different squares where O could win next turn, provided X cannot win immediately.
4. Prevent X from creating a fork. Against opposite X corners with O in the center, play an edge rather than another corner.
5. Otherwise prefer center, then an opposite corner, then any corner, then an edge.
A guaranteed draw is better than a loss. Assume X makes its strongest reply.
Each option includes the exact board after O plays, immediate winning replies for X, and next-turn winning squares for O.
nextTurnWinningSquaresForO are threats, not guaranteed wins: X gets a turn first. If winsNow is true, the game ends immediately.`;

function winningSquares(board: Board, player: 'X' | 'O'): number[] {
  return legalMoves(board).filter(move => {
    const next = [...board]; next[move] = player;
    return status(next) === `${player}_wins`;
  });
}
export function buildJevRequest(board: Board, legal: readonly number[], model: string) {
  return {
    model,
    state: JSON.stringify({
      board: [board.slice(0, 3), board.slice(3, 6), board.slice(6, 9)],
      aiPlayer: 'O', humanPlayer: 'X', nextPlayer: 'O',
      cellIndices: [[0,1,2],[3,4,5],[6,7,8]],
      winningLines: [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    }),
    questions: { move: {
      type: 'choice', instructions: MOVE_INSTRUCTIONS,
      criteria: Object.fromEntries(legal.map(move => {
        const next = [...board]; next[move] = 'O';
        const terminal = status(next) !== 'in_progress';
        return [String(move), {
          action: `Place O at row ${Math.floor(move / 3) + 1}, column ${move % 3 + 1}`,
          boardAfterMove: [next.slice(0,3), next.slice(3,6), next.slice(6,9)],
          winsNow: status(next) === 'O_wins',
          immediateWinningRepliesForX: terminal ? [] : winningSquares(next, 'X'),
          nextTurnWinningSquaresForO: terminal ? [] : winningSquares(next, 'O')
        }];
      }))
    } }
  };
}
export class JevChooser implements MoveChooser {
  constructor(private readonly apiKey: string, private readonly model = 'jev-latest', private readonly fetcher: typeof fetch = fetch) {}
  async choose(board: Board, legal: readonly number[]): Promise<number> {
    const response = await this.fetcher('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildJevRequest(board, legal, this.model))
    });
    if (!response.ok) throw new Error('Jev request failed.');
    const body: unknown = await response.json();
    const choice = (body as { answers?: { move?: { type?: unknown; choice?: unknown } } } | null)?.answers?.move;
    if (choice?.type !== 'choice' || typeof choice.choice !== 'string' || !legal.some(i => String(i) === choice.choice)) throw new Error('Invalid Jev choice.');
    return Number(choice.choice);
  }
}
export async function chooseMove(board: Board, chooser?: MoveChooser): Promise<{ move: number; provider: 'jev' | 'minimax'; fallback: boolean }> {
  if (chooser) {
    try {
      const legal = legalMoves(board);
      const move = await chooser.choose(Object.freeze([...board]), Object.freeze(legal));
      if (!Number.isInteger(move) || !legal.includes(move)) throw new Error('Illegal move.');
      return { move, provider: 'jev', fallback: false };
    } catch { return { move: minimax(board), provider: 'minimax', fallback: true }; }
  }
  return { move: minimax(board), provider: 'minimax', fallback: false };
}
