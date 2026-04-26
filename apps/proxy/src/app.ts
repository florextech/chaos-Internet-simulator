import Fastify from 'fastify';
import cors from '@fastify/cors';
import net from 'node:net';

import {
  decideChaos,
  findMatchingProfileRule,
  type ChaosProfileRule,
  type ChaosRules,
} from '@chaos-internet-simulator/core';
import { getPresetById, PRESETS } from '@chaos-internet-simulator/presets';

export type ProxyLogEntry = {
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
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
};

type ChaosState = {
  enabled: boolean;
  profileId: string;
  rules: ChaosRules;
  profileRules: ChaosProfileRule[];
};

const createNoChaosDecision = () => ({
  delayApplied: false,
  delayMs: 0,
  errorApplied: false,
  timeoutApplied: false,
  timeoutMs: 0,
});

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const resolveTargetUrl = (incomingUrl: string, targetBaseUrl: string): string => {
  if (incomingUrl.startsWith('http://') || incomingUrl.startsWith('https://')) {
    return incomingUrl;
  }
  return new URL(incomingUrl, targetBaseUrl).toString();
};

export const createProxySystem = (options: ProxySystemOptions = {}) => {
  const targetBaseUrl = options.targetBaseUrl ?? 'https://jsonplaceholder.typicode.com';
  const fetchImpl = options.fetchImpl ?? fetch;
  const randomProvider = options.randomProvider ?? Math.random;

  const activePreset = PRESETS[0];
  const initialProfileId = options.initialProfileId ?? activePreset.id;
  const initialPreset = getPresetById(initialProfileId) ?? activePreset;
  const chaosState: ChaosState = {
    enabled: options.initialEnabled ?? false,
    profileId: initialPreset.id,
    rules: initialPreset.rules,
    profileRules: options.profileRules ?? [],
  };
  const requestLogs: ProxyLogEntry[] = [];

  const pushLog = (entry: ProxyLogEntry): void => {
    requestLogs.unshift(entry);
    if (requestLogs.length > 200) {
      requestLogs.pop();
    }
  };

  const proxyServer = Fastify({ logger: true });
  const controlServer = Fastify({ logger: true });

  proxyServer.get('/health', async () => ({ status: 'ok', service: 'proxy' }));

  proxyServer.all('/*', async (request, reply) => {
    const requestUrl = request.raw.url ?? '/';
    const targetUrl = resolveTargetUrl(requestUrl, targetBaseUrl);
    const matchedRule = findMatchingProfileRule(targetUrl, chaosState.profileRules);
    const activeProfileId = matchedRule?.profile ?? chaosState.profileId;
    const activePreset = getPresetById(activeProfileId);
    const activeRules = activePreset?.rules ?? chaosState.rules;
    const decision = chaosState.enabled
      ? decideChaos(activeRules, randomProvider)
      : createNoChaosDecision();

    if (decision.delayApplied) {
      await sleep(decision.delayMs);
    }

    if (decision.timeoutApplied) {
      await sleep(decision.timeoutMs);
      const statusCode = 504;
      pushLog({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: true,
        statusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      });
      return reply.code(statusCode).send({ error: 'Simulated timeout' });
    }

    if (decision.errorApplied) {
      const statusCode = 502;
      pushLog({
        method: request.method,
        url: requestUrl,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: true,
        timeoutApplied: false,
        statusCode,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      });
      return reply.code(statusCode).send({ error: 'Simulated upstream error' });
    }

    const response = await fetchImpl(targetUrl, {
      method: request.method,
      headers: request.headers as HeadersInit,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : (request.body as BodyInit | undefined),
    });

    const body = await response.arrayBuffer();
    reply.code(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    pushLog({
      method: request.method,
      url: requestUrl,
      profile: activeProfileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: false,
      statusCode: response.status,
      appliedRule: matchedRule?.match ?? null,
      timestamp: new Date().toISOString(),
    });
    return reply.send(Buffer.from(body));
  });

  proxyServer.server.on('connect', async (request, clientSocket, head) => {
    const url = request.url ?? '';
    const [host, rawPort] = url.split(':');
    const port = Number(rawPort || 443);
    const targetUrl = `https://${url}`;
    const matchedRule = findMatchingProfileRule(targetUrl, chaosState.profileRules);
    const activeProfileId = matchedRule?.profile ?? chaosState.profileId;
    const activePreset = getPresetById(activeProfileId);
    const activeRules = activePreset?.rules ?? chaosState.rules;
    const decision = chaosState.enabled
      ? decideChaos(activeRules, randomProvider)
      : createNoChaosDecision();

    if (!host || Number.isNaN(port)) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (decision.delayApplied) {
      await sleep(decision.delayMs);
    }

    if (decision.timeoutApplied) {
      await sleep(decision.timeoutMs);
      pushLog({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: true,
        statusCode: 504,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      });
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    if (decision.errorApplied) {
      pushLog({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: true,
        timeoutApplied: false,
        statusCode: 502,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      });
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    const upstreamSocket = net.connect(port, host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) {
        upstreamSocket.write(head);
      }
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);

      pushLog({
        method: 'CONNECT',
        url,
        profile: activeProfileId,
        chaosEnabled: chaosState.enabled,
        delayApplied: decision.delayApplied,
        errorApplied: false,
        timeoutApplied: false,
        statusCode: 200,
        appliedRule: matchedRule?.match ?? null,
        timestamp: new Date().toISOString(),
      });
    });

    upstreamSocket.on('error', () => {
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
    });
  });

  controlServer.register(cors, { origin: true });

  controlServer.get('/health', async () => ({ status: 'ok', service: 'control' }));
  controlServer.get('/state', async () => chaosState);

  controlServer.post<{ Body: { enabled?: boolean } }>('/state/enabled', async (request, reply) => {
    if (typeof request.body?.enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be boolean' });
    }
    chaosState.enabled = request.body.enabled;
    return { ok: true, state: chaosState };
  });

  controlServer.post<{ Body: { profileId?: string } }>('/state/profile', async (request, reply) => {
    const profileId = request.body?.profileId;
    if (!profileId) {
      return reply.code(400).send({ error: 'profileId is required' });
    }

    const preset = getPresetById(profileId);
    if (!preset) {
      return reply.code(404).send({ error: `profile not found: ${profileId}` });
    }

    chaosState.profileId = preset.id;
    chaosState.rules = preset.rules;
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

    chaosState.profileRules = request.body.rules;
    return { ok: true, state: chaosState };
  });

  controlServer.get('/logs', async () => requestLogs);

  return { proxyServer, controlServer, chaosState, requestLogs };
};
