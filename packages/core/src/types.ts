export type ChaosRules = {
  delayMs: number;
  errorRatePercent: number;
  timeoutRatePercent: number;
  timeoutMs: number;
};

export type ChaosDecision = {
  delayApplied: boolean;
  delayMs: number;
  errorApplied: boolean;
  timeoutApplied: boolean;
  timeoutMs: number;
};

export type ChaosProfileRule = {
  match: string;
  profile: string;
};
