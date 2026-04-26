import type { ChaosRules } from '@chaos-internet-simulator/core';

export type ChaosProfile = {
  id: string;
  label: string;
  rules: ChaosRules;
};

export const PRESETS: ChaosProfile[] = [
  {
    id: 'normal',
    label: 'Normal',
    rules: {
      delayMs: 0,
      errorRatePercent: 0,
      timeoutRatePercent: 0,
      timeoutMs: 1000,
    },
  },
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

export type ChaosScenarioStep = {
  durationMs: number;
  profile: string;
};

export type ChaosScenario = {
  name: string;
  loop: boolean;
  steps: ChaosScenarioStep[];
};

export const SCENARIOS: ChaosScenario[] = [
  {
    name: 'bad-mobile-network',
    loop: true,
    steps: [
      { durationMs: 30000, profile: 'normal' },
      { durationMs: 20000, profile: 'slow-3g' },
      { durationMs: 10000, profile: 'unstable-api' },
      { durationMs: 5000, profile: 'total-chaos' },
    ],
  },
  {
    name: 'api-degrading',
    loop: false,
    steps: [
      { durationMs: 15000, profile: 'normal' },
      { durationMs: 15000, profile: 'unstable-api' },
      { durationMs: 10000, profile: 'total-chaos' },
    ],
  },
];

export const SCENARIOS_MAP = new Map(SCENARIOS.map((scenario) => [scenario.name, scenario]));

export const getScenarioByName = (name: string): ChaosScenario | undefined => SCENARIOS_MAP.get(name);
