#!/usr/bin/env node

type ChaosState = {
  enabled: boolean;
  profileId: string;
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
  };
};

type RequestLog = {
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
  statusCode: number;
  timestamp: string;
};

const CONTROL_API_URL = process.env.CHAOS_CONTROL_API_URL ?? 'http://localhost:8081';

const printHelp = (): void => {
  console.log('Chaos Internet Simulator CLI');
  console.log('');
  console.log('Usage:');
  console.log('  chaos-net <command>');
  console.log('');
  console.log('Commands:');
  console.log('  start');
  console.log('  off');
  console.log('  status');
  console.log('  profile <profileName>');
  console.log('  logs');
};

const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  try {
    const response = await fetch(`${CONTROL_API_URL}${path}`, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const details =
        typeof payload?.error === 'string' ? payload.error : `${response.status} ${response.statusText}`;
      throw new Error(details);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && /(fetch failed|ECONNREFUSED|network)/i.test(error.message)) {
      throw new Error(
        `Control API is unreachable at ${CONTROL_API_URL}. Is the proxy running on port 8081?`,
      );
    }
    throw error;
  }
};

const printStatus = async (): Promise<void> => {
  await requestJson('/health');
  const state = await requestJson<ChaosState>('/state');
  console.log(`Control API: ${CONTROL_API_URL}`);
  console.log(`Chaos enabled: ${state.enabled ? 'yes' : 'no'}`);
  console.log(`Active profile: ${state.profileId}`);
  console.log(
    `Rules: delay=${state.rules.delayMs}ms error=${state.rules.errorRatePercent}% timeout=${state.rules.timeoutRatePercent}% timeoutMs=${state.rules.timeoutMs}`,
  );
};

const setEnabled = async (enabled: boolean): Promise<void> => {
  const result = await requestJson<{ ok: boolean; state: ChaosState }>('/state/enabled', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!result.ok) {
    throw new Error('Failed to update chaos state.');
  }

  console.log(
    enabled
      ? `Chaos enabled with profile "${result.state.profileId}".`
      : `Chaos disabled. Active profile remains "${result.state.profileId}".`,
  );
};

const switchProfile = async (profileId: string | undefined): Promise<void> => {
  if (!profileId) {
    throw new Error('Missing profile name. Usage: chaos-net profile <profileName>');
  }

  const result = await requestJson<{ ok: boolean; state: ChaosState }>('/state/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profileId }),
  });

  if (!result.ok) {
    throw new Error(`Failed to set profile "${profileId}".`);
  }

  console.log(`Profile changed to "${result.state.profileId}".`);
};

const printLogs = async (): Promise<void> => {
  const logs = await requestJson<RequestLog[]>('/logs');
  if (logs.length === 0) {
    console.log('No logs yet.');
    return;
  }

  logs.slice(0, 20).forEach((log) => {
    const flags = [
      `delay:${log.delayApplied ? 'y' : 'n'}`,
      `error:${log.errorApplied ? 'y' : 'n'}`,
      `timeout:${log.timeoutApplied ? 'y' : 'n'}`,
    ].join(' ');

    console.log(
      `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.method} ${log.url} status=${log.statusCode} profile=${log.profile} chaos=${log.chaosEnabled ? 'on' : 'off'} ${flags}`,
    );
  });
};

const main = async (): Promise<void> => {
  const [command, argument] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    if (command === 'status') {
      await printStatus();
      return;
    }
    if (command === 'start') {
      await setEnabled(true);
      return;
    }
    if (command === 'off') {
      await setEnabled(false);
      return;
    }
    if (command === 'profile') {
      await switchProfile(argument);
      return;
    }
    if (command === 'logs') {
      await printLogs();
      return;
    }

    console.log(`Command "${command}" is not implemented yet.`);
    printHelp();
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};

main();
