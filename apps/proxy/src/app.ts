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
  throttlingApplied: boolean;
  downloadKbpsApplied: number | null;
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
};

type ChaosState = {
  enabled: boolean;
  profileId: string;
  rules: ChaosRules;
  profileRules: ChaosProfileRule[];
  customProfiles: Record<string, ChaosRules>;
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

export const createProxySystem = (options: ProxySystemOptions = {}) => {
  const targetBaseUrl = options.targetBaseUrl ?? 'https://jsonplaceholder.typicode.com';
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
    profileRules: options.profileRules ?? [],
    customProfiles,
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
    const activeRules = resolveProfileRules(activeProfileId) ?? chaosState.rules;
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
        throttlingApplied: false,
        downloadKbpsApplied: null,
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
        throttlingApplied: false,
        downloadKbpsApplied: null,
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

    const body = Buffer.from(await response.arrayBuffer());

    pushLog({
      method: request.method,
      url: requestUrl,
      profile: activeProfileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: false,
      throttlingApplied: decision.throttlingApplied,
      downloadKbpsApplied: decision.downloadKbps,
      statusCode: response.status,
      appliedRule: matchedRule?.match ?? null,
      timestamp: new Date().toISOString(),
    });

    if (decision.throttlingApplied && decision.downloadKbps) {
      await sendThrottledResponse(reply, response, body, decision.downloadKbps);
      return;
    }

    reply.code(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    return reply.send(body);
  });

  proxyServer.server.on('connect', async (request, clientSocket, head) => {
    const url = request.url ?? '';
    const [host, rawPort] = url.split(':');
    const port = Number(rawPort || 443);
    const targetUrl = `https://${url}`;
    const matchedRule = findMatchingProfileRule(targetUrl, chaosState.profileRules);
    const activeProfileId = matchedRule?.profile ?? chaosState.profileId;
    const activeRules = resolveProfileRules(activeProfileId) ?? chaosState.rules;
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
        throttlingApplied: false,
        downloadKbpsApplied: null,
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
        throttlingApplied: false,
        downloadKbpsApplied: null,
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
        throttlingApplied: false,
        downloadKbpsApplied: null,
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

    const selectedRules = resolveProfileRules(profileId);
    if (!selectedRules) {
      return reply.code(404).send({ error: `profile not found: ${profileId}` });
    }

    chaosState.profileId = profileId;
    chaosState.rules = selectedRules;
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
