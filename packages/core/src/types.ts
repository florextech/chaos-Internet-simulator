export type ChaosRules = {
  delayMs: number;
  errorRatePercent: number;
  timeoutRatePercent: number;
  timeoutMs: number;
  downloadKbps?: number;
};

export type ChaosDecision = {
  delayApplied: boolean;
  delayMs: number;
  errorApplied: boolean;
  timeoutApplied: boolean;
  timeoutMs: number;
  throttlingApplied: boolean;
  downloadKbps: number | null;
};

export type ChaosProfileRule = {
  match: string;
  profile: string;
};
