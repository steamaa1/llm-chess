import { describe, expect, it } from 'vitest';
import { XiangqiEngineNotConfiguredError } from '../src/index.js';

describe('xiangqi core draft boundary', () => {
  it('makes missing engine configuration explicit', () => {
    const error = new XiangqiEngineNotConfiguredError();
    expect(error.name).toBe('XiangqiEngineNotConfiguredError');
    expect(error.message).toContain('尚未完成审查');
  });
});
