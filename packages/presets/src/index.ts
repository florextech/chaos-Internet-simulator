import type { ChaosRules } from '@chaos-internet-simulator/core';

export type ChaosProfile = {
  id: string;
  label: string;
  rules: ChaosRules;
};

export const PRESETS: ChaosProfile[] = [
  {
    id: 'slow-3g',
    label: 'Slow 3G',
    rules: {
      delayMs: 2500,
      errorRatePercent: 2,
      timeoutRatePercent: 1,
      timeoutMs: 10000,
      downloadKbps: 50,
    },
  },
  {
    id: 'airport-wifi',
    label: 'Airport WiFi',
    rules: {
      delayMs: 4000,
      errorRatePercent: 8,
      timeoutRatePercent: 5,
      timeoutMs: 12000,
      downloadKbps: 120,
    },
  },
  {
    id: 'unstable-api',
    label: 'Unstable API',
    rules: {
      delayMs: 1200,
      errorRatePercent: 25,
      timeoutRatePercent: 10,
      timeoutMs: 8000,
      downloadKbps: 200,
    },
  },
  {
    id: 'total-chaos',
    label: 'Total Chaos',
    rules: {
      delayMs: 5000,
      errorRatePercent: 40,
      timeoutRatePercent: 25,
      timeoutMs: 15000,
      downloadKbps: 40,
    },
  },
];

export const PRESETS_MAP = new Map(PRESETS.map((profile) => [profile.id, profile]));

export const getPresetById = (id: string): ChaosProfile | undefined => PRESETS_MAP.get(id);
