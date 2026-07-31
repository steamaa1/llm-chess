import { describe, expect, it } from 'vitest';
import { gameRecordV1Schema, legalMoveSchema, moveLimitSchema } from '../src/index.js';

const validRecord = {
  schemaVersion: 1,
  gameMode: 'human-vs-llm',
  initialPosition: 'xiangqi-initial-position-placeholder',
  moveLimit: 200,
  red: { kind: 'human', displayName: '玩家' },
  black: { kind: 'llm', displayName: '棋手模型' },
  moves: [
    { moveId: 'red-pawn-a3-a4', side: 'red', notation: '兵九进一' },
    { moveId: 'black-pawn-a6-a5', side: 'black', notation: '卒１进１', commentary: '稳健地推进边兵。' }
  ],
  outcome: 'in_progress',
  createdAt: '2026-07-31T12:00:00.000Z'
};

describe('GameRecordV1 draft contract', () => {
  it('accepts a versioned non-sensitive record', () => {
    expect(gameRecordV1Schema.parse(validRecord)).toEqual(validRecord);
  });

  it('rejects an unknown future record version', () => {
    expect(() => gameRecordV1Schema.parse({ ...validRecord, schemaVersion: 2 })).toThrow();
  });

  it('rejects unexpected secret-like fields instead of retaining them', () => {
    expect(() => gameRecordV1Schema.parse({ ...validRecord, apiKey: 'must-never-be-stored' })).toThrow();
  });

  it('rejects an invalid move limit', () => {
    expect(() => moveLimitSchema.parse(401)).toThrow();
  });

  it('requires the engine-provided move identifier and coordinates', () => {
    expect(legalMoveSchema.parse({
      moveId: 'red-cannon-b2-e2',
      from: { file: 'b', rank: 2 },
      to: { file: 'e', rank: 2 },
      notation: '炮二平五',
      givesCheck: false
    }).notation).toBe('炮二平五');
  });
});
