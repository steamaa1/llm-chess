import { describe, expect, it } from 'vitest';
import { gameModeSchema, sideSchema } from '../src/index.js';

describe('shared game schemas', () => {
  it('accepts human versus LLM mode', () => expect(gameModeSchema.parse('human-vs-llm')).toBe('human-vs-llm'));
  it('accepts red side', () => expect(sideSchema.parse('red')).toBe('red'));
  it('rejects an unknown game mode', () => expect(() => gameModeSchema.parse('spectator')).toThrow());
});
