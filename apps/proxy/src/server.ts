import Fastify from 'fastify';
import cors from '@fastify/cors';
import net from 'node:net';

import { decideChaos } from '@chaos-internet-simulator/core';
import { getPresetById, PRESETS } from '@chaos-internet-simulator/presets';

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);
const CONTROL_PORT = Number(process.env.CONTROL_PORT ?? 8081);
const TARGET_BASE_URL = process.env.TARGET_BASE_URL ?? 'https://jsonplaceholder.typicode.com';

const activePreset = PRESETS[0];
const chaosState = {
  enabled: false,
  profileId: activePreset.id,
  rules: activePreset.rules,
};
const requestLogs: Array<{
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
  statusCode: number;
  timestamp: string;
}> = [];

const pushLog = (entry: (typeof requestLogs)[number]): void => {
  requestLogs.unshift(entry);
  if (requestLogs.length > 200) {
    requestLogs.pop();
  }
};

const getDecision = () =>
  chaosState.enabled
    ? decideChaos(chaosState.rules)
    : {
        delayApplied: false,
        delayMs: 0,
        errorApplied: false,
        timeoutApplied: false,
        timeoutMs: 0,
      };

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const resolveTargetUrl = (incomingUrl: string): string => {
  if (incomingUrl.startsWith('http://') || incomingUrl.startsWith('https://')) {
    return incomingUrl;
  }
  return new URL(incomingUrl, TARGET_BASE_URL).toString();
};

const proxyServer = Fastify({ logger: true });
const controlServer = Fastify({ logger: true });

proxyServer.get('/health', async () => ({ status: 'ok', service: 'proxy' }));

proxyServer.all('/*', async (request, reply) => {
  const requestUrl = request.raw.url ?? '/';
  const decision = getDecision();

  if (decision.delayApplied) {
    await sleep(decision.delayMs);
  }

  if (decision.timeoutApplied) {
    await sleep(decision.timeoutMs);
    const statusCode = 504;
    pushLog({
      method: request.method,
      url: requestUrl,
      profile: chaosState.profileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: true,
      statusCode,
      timestamp: new Date().toISOString(),
    });
    return reply.code(statusCode).send({ error: 'Simulated timeout' });
  }

  if (decision.errorApplied) {
    const statusCode = 502;
    pushLog({
      method: request.method,
      url: requestUrl,
      profile: chaosState.profileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: true,
      timeoutApplied: false,
      statusCode,
      timestamp: new Date().toISOString(),
    });
    return reply.code(statusCode).send({ error: 'Simulated upstream error' });
  }

  const targetUrl = resolveTargetUrl(requestUrl);
  const response = await fetch(targetUrl, {
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
    profile: chaosState.profileId,
    chaosEnabled: chaosState.enabled,
    delayApplied: decision.delayApplied,
    errorApplied: false,
    timeoutApplied: false,
    statusCode: response.status,
    timestamp: new Date().toISOString(),
  });
  return reply.send(Buffer.from(body));
});

proxyServer.server.on('connect', async (request, clientSocket, head) => {
  const decision = getDecision();
  const url = request.url ?? '';
  const [host, rawPort] = url.split(':');
  const port = Number(rawPort || 443);

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
      profile: chaosState.profileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: true,
      statusCode: 504,
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
      profile: chaosState.profileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: true,
      timeoutApplied: false,
      statusCode: 502,
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
      profile: chaosState.profileId,
      chaosEnabled: chaosState.enabled,
      delayApplied: decision.delayApplied,
      errorApplied: false,
      timeoutApplied: false,
      statusCode: 200,
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

controlServer.get('/logs', async () => requestLogs);

const start = async (): Promise<void> => {
  await Promise.all([
    proxyServer.listen({ host: '0.0.0.0', port: PROXY_PORT }),
    controlServer.listen({ host: '0.0.0.0', port: CONTROL_PORT }),
  ]);
};

start().catch((error) => {
  proxyServer.log.error(error);
  process.exit(1);
});
