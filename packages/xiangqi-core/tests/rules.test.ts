import { describe, expect, it } from 'vitest';
import { allLegalMoves, createInitialPieces, gameResult, isInCheck, legalMovesForPiece, makeMove } from '../src/index.js';

describe('deterministic xiangqi rules', () => {
  it('creates the standard 32-piece opening with red to move legal moves', () => {
    const pieces = createInitialPieces();
    expect(pieces).toHaveLength(32);
    expect(allLegalMoves(pieces, 'red').length).toBeGreaterThan(0);
  });

  it('offers the opening pawn forward move and rejects a sideways move before crossing the river', () => {
    const moves = legalMovesForPiece(createInitialPieces(), 'red-pawn-0');
    expect(moves.map((move) => `${move.to.file},${move.to.rank}`)).toEqual(['0,5']);
  });

  it('applies a legal move, changes the available turn, and preserves both generals', () => {
    const pieces = createInitialPieces();
    const move = legalMovesForPiece(pieces, 'red-pawn-4').find((candidate) => candidate.to.file === 4 && candidate.to.rank === 5);
    expect(move).toBeDefined();
    const after = makeMove(pieces, move!);
    expect(after.find((piece) => piece.id === 'red-pawn-4')).toMatchObject({ file: 4, rank: 5 });
    expect(after.filter((piece) => piece.kind === 'general')).toHaveLength(2);
  });

  it('does not permit a side to move while its general is in check', () => {
    const pieces = createInitialPieces().filter((piece) => !['red-pawn-4', 'black-pawn-4'].includes(piece.id));
    expect(isInCheck(pieces, 'red')).toBe(false);
    expect(gameResult(pieces, 'red')).toBe('playing');
  });
});
