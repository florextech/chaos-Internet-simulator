import { describe, expect, it } from 'vitest';

import { decideChaos, shouldApplyRate } from '../src/engine.js';
import type { ChaosRules } from '../src/types.js';

const createRandomProvider = (values: number[]) => {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
};

describe('shouldApplyRate', () => {
  it('returns false for 0 percent', () => {
    expect(shouldApplyRate(0, 0)).toBe(false);
  });

  it('returns true for 100 percent', () => {
    expect(shouldApplyRate(100, 0.99)).toBe(true);
  });

  it('uses random value threshold', () => {
    expect(shouldApplyRate(25, 0.24)).toBe(true);
    expect(shouldApplyRate(25, 0.25)).toBe(false);
  });
});

describe('decideChaos', () => {
  const baseRules: ChaosRules = {
    delayMs: 1500,
    errorRatePercent: 40,
    timeoutRatePercent: 10,
    timeoutMs: 8000,
  };

  it('applies deterministic timeout and error decisions', () => {
    const randomProvider = createRandomProvider([0.05, 0.35]);
    const decision = decideChaos(baseRules, randomProvider);

    expect(decision.timeoutApplied).toBe(true);
    expect(decision.errorApplied).toBe(true);
    expect(decision.delayApplied).toBe(true);
    expect(decision.delayMs).toBe(1500);
    expect(decision.timeoutMs).toBe(8000);
  });

  it('does not apply delay when delay is disabled', () => {
    const randomProvider = createRandomProvider([0.8, 0.8]);
    const decision = decideChaos({ ...baseRules, delayMs: 0 }, randomProvider);

    expect(decision.delayApplied).toBe(false);
    expect(decision.delayMs).toBe(0);
    expect(decision.timeoutApplied).toBe(false);
    expect(decision.errorApplied).toBe(false);
    expect(decision.timeoutMs).toBe(0);
  });
});
