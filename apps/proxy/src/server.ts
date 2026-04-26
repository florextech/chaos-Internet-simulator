import Fastify from 'fastify';

import { decideChaos } from '@chaos-internet-simulator/core';
import { PRESETS } from '@chaos-internet-simulator/presets';

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);
const TARGET_BASE_URL = process.env.TARGET_BASE_URL ?? 'https://jsonplaceholder.typicode.com';

const activePreset = PRESETS[0];
const chaosState = {
  enabled: false,
  profileId: activePreset.id,
  rules: activePreset.rules,
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

proxyServer.get('/health', async () => ({ status: 'ok', service: 'proxy' }));

proxyServer.all('/*', async (request, reply) => {
  const decision = chaosState.enabled
    ? decideChaos(chaosState.rules)
    : {
        delayApplied: false,
        delayMs: 0,
        errorApplied: false,
        timeoutApplied: false,
        timeoutMs: 0,
      };

  if (decision.delayApplied) {
    await sleep(decision.delayMs);
  }

  if (decision.timeoutApplied) {
    await sleep(decision.timeoutMs);
    return reply.code(504).send({ error: 'Simulated timeout' });
  }

  if (decision.errorApplied) {
    return reply.code(502).send({ error: 'Simulated upstream error' });
  }

  const targetUrl = resolveTargetUrl(request.raw.url ?? '/');
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
  return reply.send(Buffer.from(body));
});

const start = async (): Promise<void> => {
  await proxyServer.listen({ host: '0.0.0.0', port: PROXY_PORT });
};

start().catch((error) => {
  proxyServer.log.error(error);
  process.exit(1);
});
