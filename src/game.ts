export type Cell = 'X' | 'O' | null;
export type Board = readonly Cell[];
export type Status = 'in_progress' | 'X_wins' | 'O_wins' | 'draw';
const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
export const legalMoves = (board: Board): number[] => board.flatMap((cell, i) => cell === null ? [i] : []);
export function status(board: Board): Status {
  for (const [a,b,c] of lines) {
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return board[a] === 'X' ? 'X_wins' : 'O_wins';
  }
  return board.includes(null) ? 'in_progress' : 'draw';
}
const key = (board: Board) => board.map(cell => cell ?? '-').join('');
// Enumerate legal play once, stopping immediately when someone wins.
const reachable = { X: new Set<string>(), O: new Set<string>() };
function visit(board: Cell[], player: 'X' | 'O', starter: 'X' | 'O'): void {
  const id = key(board);
  if (reachable[starter].has(id)) return;
  reachable[starter].add(id);
  if (status(board) !== 'in_progress') return;
  for (const move of legalMoves(board)) {
    const next = [...board]; next[move] = player;
    visit(next, player === 'X' ? 'O' : 'X', starter);
  }
}
visit(Array<Cell>(9).fill(null), 'X', 'X');
visit(Array<Cell>(9).fill(null), 'O', 'O');
export class ValidationError extends Error {}
export function validateBoard(input: unknown, startingPlayer: unknown = 'X'): Board {
  if (startingPlayer !== 'X' && startingPlayer !== 'O') throw new ValidationError('startingPlayer must be X or O.');
  if (!Array.isArray(input) || input.length !== 9 || !Array.from(input).every(cell => cell === null || cell === 'X' || cell === 'O')) {
    throw new ValidationError('board must contain exactly 9 cells: "X", "O", or null (row-major order).');
  }
  const board = input as Cell[];
  if (!reachable[startingPlayer].has(key(board))) throw new ValidationError('board is unreachable for the selected startingPlayer: turns alternate and play stops at a win.');
  if (status(board) === 'in_progress' && board.filter(c => c === 'X').length !== board.filter(c => c === 'O').length + (startingPlayer === 'X' ? 1 : 0)) {
    throw new ValidationError('It must be O\'s turn; submit the board after the human plays X.');
  }
  return [...board];
}
