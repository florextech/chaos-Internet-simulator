import type { ChaosDecision, ChaosRules } from './types.js';

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

export const shouldApplyRate = (ratePercent: number, randomValue: number): boolean => {
  if (ratePercent <= 0) return false;
  if (ratePercent >= 100) return true;
  return randomValue < clampPercent(ratePercent) / 100;
};

export const decideChaos = (
  rules: ChaosRules,
  randomProvider: () => number = Math.random,
): ChaosDecision => {
  const timeoutApplied = shouldApplyRate(rules.timeoutRatePercent, randomProvider());
  const errorApplied = shouldApplyRate(rules.errorRatePercent, randomProvider());
  const delayApplied = rules.delayMs > 0;
  const throttlingApplied = typeof rules.downloadKbps === 'number' && rules.downloadKbps > 0;

  return {
    delayApplied,
    delayMs: delayApplied ? rules.delayMs : 0,
    errorApplied,
    timeoutApplied,
    timeoutMs: timeoutApplied ? rules.timeoutMs : 0,
    throttlingApplied,
    downloadKbps: throttlingApplied ? rules.downloadKbps ?? null : null,
  };
};
