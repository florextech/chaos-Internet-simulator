import fs from 'node:fs';
import path from 'node:path';

import type { ChaosProfileRule } from '@chaos-internet-simulator/core';
import type { ChaosRules } from '@chaos-internet-simulator/core';

type ChaosConfigFile = {
  enabled?: boolean;
  activeProfile?: string;
  targetBaseUrl?: string;
  proxyPort?: number;
  controlApiPort?: number;
  rules?: ChaosProfileRule[];
  customProfiles?: Record<string, ChaosRules>;
};

export type ResolvedProxyConfig = {
  enabled: boolean;
  activeProfile: string;
  targetBaseUrl: string;
  proxyPort: number;
  controlApiPort: number;
  rules: ChaosProfileRule[];
  customProfiles: Record<string, ChaosRules>;
};

const CONFIG_FILE_NAME = 'chaos.config.json';

const findConfigPath = (startDir: string): string | undefined => {
  let current = path.resolve(startDir);
  let reachedRoot = false;

  while (!reachedRoot) {
    const candidate = path.join(current, CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      reachedRoot = true;
    } else {
      current = parent;
    }
  }

  return undefined;
};

const loadConfigFile = (cwd: string): ChaosConfigFile => {
  const filePath = findConfigPath(cwd);
  if (!filePath) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as ChaosConfigFile;
  } catch {
    return {};
  }
};

const envNumber = (name: string): number | undefined => {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isNaN(value) ? undefined : value;
};

export const resolveProxyConfig = (cwd: string = process.cwd()): ResolvedProxyConfig => {
  const fileConfig = loadConfigFile(cwd);

  return {
    enabled: fileConfig.enabled ?? false,
    activeProfile: fileConfig.activeProfile ?? 'slow-3g',
    targetBaseUrl:
      process.env.TARGET_BASE_URL ?? fileConfig.targetBaseUrl ?? 'https://jsonplaceholder.typicode.com',
    proxyPort: envNumber('PROXY_PORT') ?? fileConfig.proxyPort ?? 8080,
    controlApiPort: envNumber('CONTROL_PORT') ?? fileConfig.controlApiPort ?? 8081,
    rules: fileConfig.rules ?? [],
    customProfiles: fileConfig.customProfiles ?? {},
  };
};
