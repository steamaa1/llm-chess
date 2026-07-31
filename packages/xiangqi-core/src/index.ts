/** Deterministic, browser-safe Xiangqi rules for standard 9×10 Chinese chess. */
export type Side = 'red' | 'black';
export type PieceKind = 'rook' | 'horse' | 'elephant' | 'advisor' | 'general' | 'cannon' | 'pawn';
export type Position = { file: number; rank: number };
export type GamePiece = Position & { id: string; side: Side; kind: PieceKind; label: string };
export type Move = { from: Position; to: Position; pieceId: string; captureId?: string; notation: string; givesCheck: boolean };
export type GameResult = 'playing' | 'red_wins_checkmate' | 'black_wins_checkmate' | 'red_wins_stalemate' | 'black_wins_stalemate';

const FILES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const LABELS: Record<Side, Record<PieceKind, string>> = {
  red: { rook: '车', horse: '马', elephant: '相', advisor: '仕', general: '帅', cannon: '炮', pawn: '兵' },
  black: { rook: '車', horse: '馬', elephant: '象', advisor: '士', general: '將', cannon: '砲', pawn: '卒' }
};
const BACK_RANK: PieceKind[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];

const inside = ({ file, rank }: Position) => file >= 0 && file <= 8 && rank >= 0 && rank <= 9;
const same = (a: Position, b: Position) => a.file === b.file && a.rank === b.rank;
const other = (side: Side): Side => side === 'red' ? 'black' : 'red';
const inPalace = (side: Side, p: Position) => p.file >= 3 && p.file <= 5 && (side === 'red' ? p.rank >= 7 && p.rank <= 9 : p.rank >= 0 && p.rank <= 2);
const crossedRiver = (side: Side, rank: number) => side === 'red' ? rank <= 4 : rank >= 5;

export function createInitialPieces(): GamePiece[] {
  const pieces: GamePiece[] = [];
  (['red', 'black'] as Side[]).forEach((side) => {
    const backRank = side === 'red' ? 9 : 0;
    const cannonRank = side === 'red' ? 7 : 2;
    const pawnRank = side === 'red' ? 6 : 3;
    BACK_RANK.forEach((kind, file) => pieces.push({ id: `${side}-${kind}-${file}`, side, kind, label: LABELS[side][kind], file, rank: backRank }));
    [1, 7].forEach((file) => pieces.push({ id: `${side}-cannon-${file}`, side, kind: 'cannon', label: LABELS[side].cannon, file, rank: cannonRank }));
    [0, 2, 4, 6, 8].forEach((file) => pieces.push({ id: `${side}-pawn-${file}`, side, kind: 'pawn', label: LABELS[side].pawn, file, rank: pawnRank }));
  });
  return pieces;
}

function at(pieces: GamePiece[], p: Position) { return pieces.find((piece) => same(piece, p)); }
function blocked(pieces: GamePiece[], from: Position, to: Position) {
  const dx = Math.sign(to.file - from.file); const dy = Math.sign(to.rank - from.rank);
  let file = from.file + dx; let rank = from.rank + dy; let count = 0;
  while (file !== to.file || rank !== to.rank) { if (at(pieces, { file, rank })) count += 1; file += dx; rank += dy; }
  return count;
}
function candidateMoves(pieces: GamePiece[], piece: GamePiece): Position[] {
  const move = (file: number, rank: number) => ({ file, rank });
  const positions: Position[] = [];
  const add = (p: Position) => { if (inside(p) && at(pieces, p)?.side !== piece.side) positions.push(p); };
  if (piece.kind === 'rook' || piece.kind === 'cannon') {
    const directions: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    directions.forEach(([dx, dy]) => {
      let p = move(piece.file + dx, piece.rank + dy); let screen = false;
      while (inside(p)) {
        const target = at(pieces, p);
        if (piece.kind === 'rook') { if (!target) add(p); else { if (target.side !== piece.side) add(p); break; } }
        else if (!screen) { if (!target) add(p); else screen = true; }
        else if (target) { if (target.side !== piece.side) add(p); break; }
        p = move(p.file + dx, p.rank + dy);
      }
    });
  } else if (piece.kind === 'horse') {
    const horseSteps: Array<[number, number, number, number]> = [[1, 2, 0, 1], [2, 1, 1, 0], [2, -1, 1, 0], [1, -2, 0, -1], [-1, -2, 0, -1], [-2, -1, -1, 0], [-2, 1, -1, 0], [-1, 2, 0, 1]];
    horseSteps.forEach(([dx, dy, lx, ly]) => { if (!at(pieces, move(piece.file + lx, piece.rank + ly))) add(move(piece.file + dx, piece.rank + dy)); });
  } else if (piece.kind === 'elephant') {
    const elephantSteps: Array<[number, number]> = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    elephantSteps.forEach(([dx, dy]) => { const p = move(piece.file + dx, piece.rank + dy); const eye = move(piece.file + dx / 2, piece.rank + dy / 2); if (!at(pieces, eye) && (piece.side === 'red' ? p.rank >= 5 : p.rank <= 4)) add(p); });
  } else if (piece.kind === 'advisor') {
    const advisorSteps: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    advisorSteps.forEach(([dx, dy]) => { const p = move(piece.file + dx, piece.rank + dy); if (inPalace(piece.side, p)) add(p); });
  } else if (piece.kind === 'general') {
    const generalSteps: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    generalSteps.forEach(([dx, dy]) => { const p = move(piece.file + dx, piece.rank + dy); if (inPalace(piece.side, p)) add(p); });
    const enemyGeneral = pieces.find((p) => p.kind === 'general' && p.side !== piece.side);
    if (enemyGeneral && enemyGeneral.file === piece.file && blocked(pieces, piece, enemyGeneral) === 0) add(enemyGeneral);
  } else {
    const forward = piece.side === 'red' ? -1 : 1;
    add(move(piece.file, piece.rank + forward));
    if (crossedRiver(piece.side, piece.rank)) { add(move(piece.file - 1, piece.rank)); add(move(piece.file + 1, piece.rank)); }
  }
  return positions;
}
function apply(pieces: GamePiece[], piece: GamePiece, to: Position) { return pieces.filter((p) => p.id !== piece.id && !same(p, to)).concat({ ...piece, ...to }); }

export function isInCheck(pieces: GamePiece[], side: Side) {
  const general = pieces.find((piece) => piece.side === side && piece.kind === 'general');
  if (!general) return true;
  return pieces.filter((piece) => piece.side === other(side)).some((piece) => candidateMoves(pieces, piece).some((target) => same(target, general)));
}
export function legalMovesForPiece(pieces: GamePiece[], pieceId: string): Move[] {
  const piece = pieces.find((p) => p.id === pieceId); if (!piece) return [];
  return candidateMoves(pieces, piece).filter((to) => !isInCheck(apply(pieces, piece, to), piece.side)).map((to) => {
    const capture = at(pieces, to); const after = apply(pieces, piece, to);
    return { from: { file: piece.file, rank: piece.rank }, to, pieceId: piece.id, captureId: capture?.id, notation: `${piece.label}${FILES[piece.file]}${to.file === piece.file ? (to.rank < piece.rank ? '进' : '退') : '平'}${FILES[to.file]}`, givesCheck: isInCheck(after, other(piece.side)) };
  });
}
export function allLegalMoves(pieces: GamePiece[], side: Side) { return pieces.filter((piece) => piece.side === side).flatMap((piece) => legalMovesForPiece(pieces, piece.id)); }
export function makeMove(pieces: GamePiece[], move: Move) { const piece = pieces.find((p) => p.id === move.pieceId); return piece ? apply(pieces, piece, move.to) : pieces; }
export function gameResult(pieces: GamePiece[], sideToMove: Side): GameResult {
  const moves = allLegalMoves(pieces, sideToMove); if (moves.length) return 'playing';
  const winner = other(sideToMove); return isInCheck(pieces, sideToMove) ? `${winner}_wins_checkmate` as GameResult : `${winner}_wins_stalemate` as GameResult;
}
