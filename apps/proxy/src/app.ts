import Fastify from 'fastify';
import cors from '@fastify/cors';
import net from 'node:net';
import path from 'node:path';

import {
  decideChaos,
  findMatchingProfileRule,
  type ChaosProfileRule,
  type ChaosRules,
} from '@chaos-internet-simulator/core';
import {
  getPresetById,
  getScenarioByName,
  PRESETS,
  SCENARIOS,
} from '@chaos-internet-simulator/presets';
import { createProxyMetricsCollector } from './metrics.js';
import { loadLocalPlugins, type PluginResponseContext } from './plugins.js';
import { createRecordingManager } from './recording.js';

export type ProxyLogEntry = {
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
  throttlingApplied: boolean;
  downloadKbpsApplied: number | null;
  droppedConnectionApplied: boolean;
  pluginErrors: string[];
  statusCode: number;
  appliedRule: string | null;
  timestamp: string;
};

export type ProxySystemOptions = {
  targetBaseUrl?: string;
  fetchImpl?: typeof fetch;
  randomProvider?: () => number;
  profileRules?: ChaosProfileRule[];
  initialEnabled?: boolean;
  initialProfileId?: string;
  customProfiles?: Record<string, ChaosRules>;
  pluginDirectory?: string;
  recordingsDirectory?: string;
};

type ChaosState = {
  enabled: boolean;
  profileId: string;
  rules: ChaosRules;
  targetBaseUrl: string;
  profileRules: ChaosProfileRule[];
  customProfiles: Record<string, ChaosRules>;
  scenario: {
    name: string;
    loop: boolean;
    stepIndex: number;
    currentProfile: string;
    stepEndsAt: string;
  } | null;
  recording: {
    enabled: boolean;
    filePath: string | null;
  };
  replay: {
    enabled: boolean;
    filePath: string | null;
  };
};

const createNoChaosDecision = () => ({
  delayApplied: false,
  delayMs: 0,
  errorApplied: false,
  timeoutApplied: false,
  timeoutMs: 0,
  throttlingApplied: false,
  downloadKbps: null,
});

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const sendThrottledResponse = async (
  reply: { hijack: () => void; raw: import('node:http').ServerResponse },
  response: Response,
  payload: Buffer,
  downloadKbps: number,
): Promise<void> => {
  reply.hijack();
  const raw = reply.raw;
  raw.statusCode = response.status;
  response.headers.forEach((value, key) => {
    raw.setHeader(key, value);
  });

  const tickMs = 100;
  const bytesPerSecond = Math.max(1, Math.floor((downloadKbps * 1024) / 8));
  const chunkSize = Math.max(1, Math.floor((bytesPerSecond * tickMs) / 1000));

  let offset = 0;
  while (offset < payload.length) {
    const nextOffset = Math.min(payload.length, offset + chunkSize);
    raw.write(payload.subarray(offset, nextOffset));
    offset = nextOffset;
    if (offset < payload.length) {
      await sleep(tickMs);
    }
  }
  raw.end();
};

export const resolveTargetUrl = (incomingUrl: string, targetBaseUrl: string): string => {
  if (incomingUrl.startsWith('http://') || incomingUrl.startsWith('https://')) {
    return incomingUrl;
  }
  return new URL(incomingUrl, targetBaseUrl).toString();
};

const parseConnectTarget = (rawUrl: string): { host: string; port: number } | null => {
  const [hostPart, rawPort] = rawUrl.split(':');
  if (!hostPart) return null;
  const port = Number(rawPort || 443);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }
  return { host: hostPart, port };
};

export const createProxySystem = (options: ProxySystemOptions = {}) => {
  let targetBaseUrl = options.targetBaseUrl ?? 'https://jsonplaceholder.typicode.com';
  const pluginDirectory = options.pluginDirectory ?? path.resolve(process.cwd(), 'plugins');
  const recordingsDirectory = options.recordingsDirectory ?? path.resolve(process.cwd(), 'recordings');
  const fetchImpl = options.fetchImpl ?? fetch;
  const randomProvider = options.randomProvider ?? Math.random;
  const customProfiles = options.customProfiles ?? {};

  const activePreset = PRESETS[0];
  const resolveProfileRules = (profileId: string): ChaosRules | undefined =>
    getPresetById(profileId)?.rules ?? customProfiles[profileId];

  const initialProfileId = options.initialProfileId ?? activePreset.id;
  const initialRules = resolveProfileRules(initialProfileId) ?? activePreset.rules;
  const effectiveInitialProfileId = resolveProfileRules(initialProfileId)
    ? initialProfileId
    : activePreset.id;
  const chaosState: ChaosState = {
    enabled: options.initialEnabled ?? false,
    profileId: effectiveInitialProfileId,
    rules: initialRules,
    targetBaseUrl,
    profileRules: options.profileRules ?? [],
    customProfiles,
    scenario: null,
    recording: {
      enabled: false,
      filePath: null,
    },
    replay: {
      enabled: false,
      filePath: null,
    },
  };
  const requestLogs: ProxyLogEntry[] = [];
  const metricsCollector = createProxyMetricsCollector();
  const loadedPluginsPromise = loadLocalPlugins(pluginDirectory);
  const recordingManager = createRecordingManager(recordingsDirectory);
  let scenarioTimer: NodeJS.Timeout | undefined;

  const pushLog = (entry: ProxyLogEntry): void => {
    requestLogs.unshift(entry);
    if (requestLogs.length > 200) {
      requestLogs.pop();
    }
  };

  const pushLogWithMetrics = (entry: ProxyLogEntry, startedAt: number): void => {
    pushLog(entry);
    metricsCollector.record(entry, Date.now() - startedAt);
  };

  const applyResponsePluginHooks = async (
    method: string,
    url: string,
    profileId: string,
    statusCode: number,
    headers: Record<string, string>,
    pluginErrors: string[],
  ): Promise<void> => {
    const { plugins, errors } = await loadedPluginsPromise;
    pluginErrors.push(...errors);
    for (const plugin of plugins) {
      if (!plugin.onResponse) continue;
      const context: PluginResponseContext = {
        method,
        url,
        profileId,
        statusCode,
        setHeader: (name, value) => {
          headers[name.toLowerCase()] = value;
        },
      };
      try {
        await plugin.onResponse(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pluginErrors.push(`${plugin.name}.onResponse: ${message}`);
      }
    }
  };

  const clearScenarioTimer = (): void => {
    if (scenarioTimer) {
      clearTimeout(scenarioTimer);
      scenarioTimer = undefined;
    }
  };

  const stopScenarioRuntime = (): void => {
    clearScenarioTimer();
    chaosState.scenario = null;
  };

  const applyProfile = (profileId: string): boolean => {
    const selectedRules = resolveProfileRules(profileId);
    if (!selectedRules) return false;
    chaosState.profileId = profileId;
    chaosState.rules = selectedRules;
    return true;
  };

  const getAvailableProfiles = (): Array<{ id: string; source: 'preset' | 'custom'; rules: ChaosRules }> => [
    ...PRESETS.map((preset) => ({ id: preset.id, source: 'preset' as const, rules: preset.rules })),
    ...Object.entries(chaosState.customProfiles).map(([id, rules]) => ({
      id,
      source: 'custom' as const,
      rules,
    })),
  ];

  const isValidChaosRules = (rules: ChaosRules): boolean => {
    const hasValidNumber = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);

    return (
      hasValidNumber(rules.delayMs) &&
      rules.delayMs >= 0 &&
      hasValidNumber(rules.errorRatePercent) &&
      rules.errorRatePercent >= 0 &&
      rules.errorRatePercent <= 100 &&
      hasValidNumber(rules.timeoutRatePercent) &&
      rules.timeoutRatePercent >= 0 &&
      rules.timeoutRatePercent <= 100 &&
      hasValidNumber(rules.timeoutMs) &&
      rules.timeoutMs >= 0 &&
      (rules.downloadKbps === undefined ||
        (hasValidNumber(rules.downloadKbps) && rules.downloadKbps > 0))
    );
  };

  const startScenarioRuntime = (scenarioName: string): boolean => {
    const scenario = getScenarioByName(scenarioName);
    if (!scenario) {
      return false;
    }

    clearScenarioTimer();
    chaosState.enabled = true;

    const runStep = (index: number): void => {
      const step = scenario.steps[index];
      if (!step) {
        if (scenario.loop) {
          runStep(0);
        } else {
          stopScenarioRuntime();
        }
        return;
      }

      if (applyProfile(step.profile)) {
        chaosState.scenario = {
          name: scenario.name,
          loop: scenario.loop,
          stepIndex: index,
          currentProfile: step.profile,
          stepEndsAt: new Date(Date.now() + step.durationMs).toISOString(),
        };
      }

      scenarioTimer = setTimeout(() => {
        const nextIndex = index + 1;
        if (nextIndex >= scenario.steps.length) {
          if (scenario.loop) {
            runStep(0);
          } else {
            stopScenarioRuntime();
          }
          return;
        }
        runStep(nextIndex);
      }, step.durationMs);
    };

    runStep(0);
    return true;
  };

  const proxyServer = Fastify({ logger: true });
  const controlServer = Fastify({ logger: true });

  proxyServer.get('/health', async () => ({ status: 'ok', service: 'proxy' }));

  proxyServer.all('/*', async (request, reply) => {
    const startedAt = Date.now();
    const requestUrl = request.raw.url ?? '/';
    const targetUrl = resolveTargetUrl(requestUrl, targetBaseUrl);
    const matchedRule = findMatchingProfileRule(targetUrl, chaosState.profileRules);
    const activeProfileId = matchedRule?.profile ?? chaosState.profileId;
    const activeRules = resolveProfileRules(activeProfileId) ?? chaosState.rules;
    const requestHeaders: Record<string, string> = {};
    const pluginErrors: string[] = [];
    let forcedErrorStatusCode: number | null = null;
    let extraDelayMs = 0;
    let skipChaos = false;
    let dropConnection = false;

    const { plugins, errors } = await loadedPluginsPromise;
    pluginErrors.push(...errors);

    for (const plugin of plugins) {
      if (!plugin.onRequest) continue;
      try {
        await plugin.onRequest({
          method: request.method,
          url: requestUrl,
          profileId: activeProfileId,
          chaosEnabled: chaosState.enabled,
          forceError: (statusCode = 502) => {
            forcedErrorStatusCode = statusCode;
          },
          addDelay: (ms) => {
            extraDelayMs += Math.max(0, Math.floor(ms));
          },
          skipChaos: () => {
            skipChaos = true;
          },
          setHeader: (name, value) => {
            requestHeaders[name.toLowerCase()] = value;
          },
          dropConnection: () => {
            dropConnection = true;
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pluginErrors.push(`${plugin.name}.onRequest: ${message}`);
      }
    }

    const decision = chaosState.enabled && !skipChaos
      ? decideChaos(activeRules, randomProvider)
      : createNoChaosDecision();

    if (decision.delayApplied) {
      await sleep(decision.delayMs);
    }
    if (extraDelayMs > 0) {
      await sleep(extraDelayMs);
    }

    if (dropConnection) {
      pushLogWithMetrics({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied || extraDelayMs > 0,
        errorApplied: false,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: true,
        pluginErrors,
        statusCode: 0,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      reply.hijack();
      reply.raw.destroy();
      return;
    }

    if (forcedErrorStatusCode) {
      const forcedBody = { error: 'Forced by plugin' };
      recordingManager.appendRecord({
        method: request.method,
        url: requestUrl,
        statusCode: forcedErrorStatusCode,
        headers: { 'content-type': 'application/json' },
        bodyBase64: Buffer.from(JSON.stringify(forcedBody)).toString('base64'),
        timestamp: new Date().toISOString(),
      });
      pushLogWithMetrics({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied || extraDelayMs > 0,
        errorApplied: true,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode: forcedErrorStatusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      return reply.code(forcedErrorStatusCode).send(forcedBody);
    }

    if (decision.timeoutApplied) {
      await sleep(decision.timeoutMs);
      const statusCode = 504;
      const timeoutBody = { error: 'Simulated timeout' };
      recordingManager.appendRecord({
        method: request.method,
        url: requestUrl,
        statusCode,
        headers: { 'content-type': 'application/json' },
        bodyBase64: Buffer.from(JSON.stringify(timeoutBody)).toString('base64'),
        timestamp: new Date().toISOString(),
      });
      pushLogWithMetrics({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: true,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      return reply.code(statusCode).send(timeoutBody);
    }

    if (decision.errorApplied) {
      const statusCode = 502;
      const errorBody = { error: 'Simulated upstream error' };
      recordingManager.appendRecord({
        method: request.method,
        url: requestUrl,
        statusCode,
        headers: { 'content-type': 'application/json' },
        bodyBase64: Buffer.from(JSON.stringify(errorBody)).toString('base64'),
        timestamp: new Date().toISOString(),
      });
      pushLogWithMetrics({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: true,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      return reply.code(statusCode).send(errorBody);
    }

    const replayEntry = recordingManager.nextReplayEntry(request.method, requestUrl);
    const response = replayEntry
      ? new Response(Buffer.from(replayEntry.bodyBase64, 'base64'), {
          status: replayEntry.statusCode,
          headers: replayEntry.headers,
        })
      : await fetchImpl(targetUrl, {
          method: request.method,
          headers: {
            ...(request.headers as HeadersInit),
            ...requestHeaders,
          },
          body:
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : (request.body as BodyInit | undefined),
        });

    const body = Buffer.from(await response.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    recordingManager.appendRecord({
      method: request.method,
      url: requestUrl,
      statusCode: response.status,
      headers: responseHeaders,
      bodyBase64: body.toString('base64'),
      timestamp: new Date().toISOString(),
    });

    pushLogWithMetrics({
      method: request.method,
      url: requestUrl,
      profile: activeProfileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: false,
      throttlingApplied: decision.throttlingApplied,
      downloadKbpsApplied: decision.downloadKbps,
      droppedConnectionApplied: false,
      pluginErrors,
      statusCode: response.status,
      appliedRule: matchedRule?.match ?? null,
      timestamp: new Date().toISOString(),
    }, startedAt);

    const responsePluginHeaders: Record<string, string> = {};
    await applyResponsePluginHooks(
      request.method,
      requestUrl,
      activeProfileId,
      response.status,
      responsePluginHeaders,
      pluginErrors,
    );

    if (decision.throttlingApplied && decision.downloadKbps) {
      await sendThrottledResponse(reply, response, body, decision.downloadKbps);
      return;
    }

    reply.code(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    for (const [name, value] of Object.entries(responsePluginHeaders)) {
      reply.header(name, value);
    }
    return reply.send(body);
  });

  proxyServer.server.on('connect', async (request, clientSocket, head) => {
    const startedAt = Date.now();
    const url = request.url ?? '';
    const target = parseConnectTarget(url);
    const targetUrl = `https://${url}`;
    const matchedRule = findMatchingProfileRule(targetUrl, chaosState.profileRules);
    const activeProfileId = matchedRule?.profile ?? chaosState.profileId;
    const activeRules = resolveProfileRules(activeProfileId) ?? chaosState.rules;
    const pluginErrors: string[] = [];
    let forcedErrorStatusCode: number | null = null;
    let extraDelayMs = 0;
    let skipChaos = false;
    let dropConnection = false;

    const { plugins, errors } = await loadedPluginsPromise;
    pluginErrors.push(...errors);

    for (const plugin of plugins) {
      if (!plugin.onRequest) continue;
      try {
        await plugin.onRequest({
          method: 'CONNECT',
          url,
          profileId: activeProfileId,
          chaosEnabled: chaosState.enabled,
          forceError: (statusCode = 502) => {
            forcedErrorStatusCode = statusCode;
          },
          addDelay: (ms) => {
            extraDelayMs += Math.max(0, Math.floor(ms));
          },
          skipChaos: () => {
            skipChaos = true;
          },
          setHeader: () => {},
          dropConnection: () => {
            dropConnection = true;
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pluginErrors.push(`${plugin.name}.onRequest: ${message}`);
      }
    }

    const decision = chaosState.enabled && !skipChaos
      ? decideChaos(activeRules, randomProvider)
      : createNoChaosDecision();

    if (!target) {
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: false,
        errorApplied: false,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode: 400,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (decision.delayApplied) {
      await sleep(decision.delayMs);
    }
    if (extraDelayMs > 0) {
      await sleep(extraDelayMs);
    }

    if (dropConnection) {
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied || extraDelayMs > 0,
        errorApplied: false,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: true,
        pluginErrors,
        statusCode: 0,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.destroy();
      return;
    }

    if (forcedErrorStatusCode) {
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied || extraDelayMs > 0,
        errorApplied: true,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode: forcedErrorStatusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.write(`HTTP/1.1 ${forcedErrorStatusCode} Forced Error\r\n\r\n`);
      clientSocket.destroy();
      return;
    }

    if (decision.timeoutApplied) {
      await sleep(decision.timeoutMs);
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: true,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode: 504,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (decision.errorApplied) {
      // HTTPS drop simulation: close tunnel connection before establishing upstream.
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: true,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: true,
        pluginErrors,
        statusCode: 0,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.destroy();
      return;
    }

    const upstreamSocket = net.connect(target.port, target.host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);

      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: false,
        pluginErrors,
        statusCode: 200,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
    });

    upstreamSocket.on('error', () => {
      pushLogWithMetrics({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        droppedConnectionApplied: true,
        pluginErrors,
        statusCode: 0,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      }, startedAt);
      clientSocket.destroy();
    });
  });

  controlServer.register(cors, { origin: true });

  controlServer.get('/health', async () => ({ status: 'ok', service: 'control' }));
  controlServer.get('/state', async () => chaosState);
  controlServer.get('/profiles', async () => ({ profiles: getAvailableProfiles() }));

  controlServer.post<{ Body: { enabled?: boolean } }>('/state/enabled', async (request, reply) => {
    if (typeof request.body?.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be boolean' });
    }
    chaosState.enabled = request.body.enabled;
    if (!chaosState.enabled) {
      stopScenarioRuntime();
    }
    return { ok: true, state: chaosState };
  });

  controlServer.post<{ Body: { profileId?: string } }>('/state/profile', async (request, reply) => {
    const profileId = request.body?.profileId;
    if (!profileId) {
      return reply.code(400).send({ error: 'profileId is required' });
    }

    const updated = applyProfile(profileId);
    if (!updated) {
      return reply.code(404).send({ error: `profile not found: ${profileId}` });
    }
    stopScenarioRuntime();
    return { ok: true, state: chaosState };
  });

  controlServer.post<{ Body: { rules?: ChaosProfileRule[] } }>('/state/rules', async (request, reply) => {
    if (!Array.isArray(request.body?.rules)) {
      return reply.code(400).send({ error: 'rules must be an array' });
    }

    const hasInvalidRule = request.body.rules.some(
      (rule) =>
        !rule ||
        typeof rule.match !== 'string' ||
        rule.match.trim().length === 0 ||
        typeof rule.profile !== 'string' ||
        rule.profile.trim().length === 0,
    );
    if (hasInvalidRule) {
      return reply.code(400).send({ error: 'each rule must contain non-empty match and profile' });
    }

    const hasUnknownProfile = request.body.rules.some((rule) => !resolveProfileRules(rule.profile));
    if (hasUnknownProfile) {
      return reply.code(400).send({ error: 'each rule profile must exist in preset or custom profiles' });
    }

    chaosState.profileRules = request.body.rules;
    return { ok: true, state: chaosState };
  });

  controlServer.post<{ Body: { targetBaseUrl?: string } }>(
    '/state/target-base-url',
    async (request, reply) => {
      const nextTargetBaseUrl = request.body?.targetBaseUrl;
      if (!nextTargetBaseUrl || typeof nextTargetBaseUrl !== 'string') {
        return reply.code(400).send({ error: 'targetBaseUrl is required' });
      }

      try {
        const parsed = new URL(nextTargetBaseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return reply.code(400).send({ error: 'targetBaseUrl must start with http:// or https://' });
        }
      } catch {
        return reply.code(400).send({ error: 'targetBaseUrl must be a valid URL' });
      }

      targetBaseUrl = nextTargetBaseUrl;
      chaosState.targetBaseUrl = targetBaseUrl;
      return { ok: true, state: chaosState };
    },
  );

  controlServer.post<{ Body: { profileId?: string; rules?: ChaosRules } }>(
    '/profiles/custom',
    async (request, reply) => {
      const profileId = request.body?.profileId?.trim();
      const rules = request.body?.rules;

      if (!profileId) {
        return reply.code(400).send({ error: 'profileId is required' });
      }
      if (!rules || !isValidChaosRules(rules)) {
        return reply.code(400).send({ error: 'rules are invalid' });
      }

      chaosState.customProfiles[profileId] = rules;
      if (chaosState.profileId === profileId) {
        chaosState.rules = rules;
      }

      return {
        ok: true,
        profile: { id: profileId, source: 'custom', rules },
        state: chaosState,
      };
    },
  );

  controlServer.get('/logs', async () => requestLogs);
  controlServer.get('/metrics', async () => metricsCollector.snapshot(chaosState));
  controlServer.get('/scenario', async () => ({ activeScenario: chaosState.scenario }));
  controlServer.get('/scenarios', async () => ({ scenarios: SCENARIOS }));

  controlServer.post<{ Body: { name?: string } }>('/scenario', async (request, reply) => {
    const scenarioName = request.body?.name;
    if (!scenarioName) {
      return reply.code(400).send({ error: 'scenario name is required' });
    }

    const started = startScenarioRuntime(scenarioName);
    if (!started) {
      return reply.code(404).send({ error: `scenario not found: ${scenarioName}` });
    }

    return { ok: true, state: chaosState };
  });

  controlServer.post('/scenario/off', async () => {
    stopScenarioRuntime();
    return { ok: true, state: chaosState };
  });

  controlServer.post<{ Body: { fileName?: string } }>('/record/start', async (request) => {
    const started = recordingManager.startRecording(request.body?.fileName);
    chaosState.recording = recordingManager.state().recording;
    return { ok: true, recording: chaosState.recording, filePath: started.filePath };
  });

  controlServer.post('/record/stop', async () => {
    const result = recordingManager.stopRecording();
    chaosState.recording = recordingManager.state().recording;
    return { ok: true, recording: chaosState.recording, ...result };
  });

  controlServer.post<{ Body: { recordingFile?: string } }>('/replay/start', async (request, reply) => {
    const recordingFile = request.body?.recordingFile;
    if (!recordingFile) {
      return reply.code(400).send({ error: 'recordingFile is required' });
    }

    try {
      const started = recordingManager.startReplay(recordingFile);
      chaosState.replay = recordingManager.state().replay;
      return { ok: true, replay: chaosState.replay, ...started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }
  });

  controlServer.post('/replay/stop', async () => {
    const result = recordingManager.stopReplay();
    chaosState.replay = recordingManager.state().replay;
    return { ok: true, replay: chaosState.replay, ...result };
  });

  return {
    proxyServer,
    controlServer,
    chaosState,
    requestLogs,
    startScenarioRuntime,
    stopScenarioRuntime,
  };
};
