export type ChaosRules = {
  delayMs: number;
  errorRatePercent: number;
  timeoutRatePercent: number;
  timeoutMs: number;
  downloadKbps?: number;
};

export type ProfileRule = { match: string; profile: string };

export type ChaosState = {
  enabled: boolean;
  profileId: string;
  targetBaseUrl: string;
  profileRules: ProfileRule[];
  customProfiles: Record<string, ChaosRules>;
  rules: ChaosRules;
  scenario: {
    name: string;
    loop: boolean;
    stepIndex: number;
    currentProfile: string;
    stepEndsAt: string;
  } | null;
};

export type RequestLog = {
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
  throttlingApplied: boolean;
  downloadKbpsApplied: number | null;
  statusCode: number;
  appliedRule: string | null;
  timestamp: string;
};

export type ProfileOption = {
  id: string;
  source: 'preset' | 'custom';
  rules: ChaosRules;
};

export type ProxyMetrics = {
  totalRequests: number;
  delayedRequests: number;
  erroredRequests: number;
  timedOutRequests: number;
  throttledRequests: number;
  droppedConnections: number;
  averageResponseTimeMs: number;
  activeProfile: string;
  activeScenario: string | null;
  chaosEnabled: boolean;
};
