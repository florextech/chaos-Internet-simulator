import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProxySystem, resolveTargetUrl } from '../src/app.js';

const connectThroughProxy = async (
  proxyPort: number,
  targetHost: string,
  targetPort: number,
  tail = '',
): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1');
    let data = '';
    let resolved = false;

    socket.on('connect', () => {
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n${tail}`,
      );
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\r\n\r\n')) {
        resolved = true;
        socket.destroy();
        resolve(data);
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        resolve(data);
      }
    });

    socket.on('error', reject);
  });

describe('proxy app', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const randomProvider = vi.fn<() => number>();
  let app: ReturnType<typeof createProxySystem>;

  beforeEach(async () => {
    app = createProxySystem({
      fetchImpl: fetchMock,
      randomProvider,
      customProfiles: {
        'my-bad-network': {
          delayMs: 3500,
          errorRatePercent: 10,
          timeoutRatePercent: 5,
          timeoutMs: 12000,
        },
      },
    });
    fetchMock.mockReset();
    randomProvider.mockReset();
    app.chaosState.enabled = false;
    app.chaosState.profileId = 'slow-3g';
    app.chaosState.rules = {
      delayMs: 2500,
      errorRatePercent: 2,
      timeoutRatePercent: 1,
      timeoutMs: 10000,
    };
    app.chaosState.profileRules = [];
    app.requestLogs.length = 0;
    if (!app.proxyServer.server.listening) {
      await app.proxyServer.listen({ host: '127.0.0.1', port: 0 });
    }
    if (!app.controlServer.server.listening) {
      await app.controlServer.listen({ host: '127.0.0.1', port: 0 });
    }
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.proxyServer.close();
    await app.controlServer.close();
  });

  it('returns control and proxy health', async () => {
    const control = await app.controlServer.inject({ method: 'GET', url: '/health' });
    const proxy = await app.proxyServer.inject({ method: 'GET', url: '/health' });

    expect(control.statusCode).toBe(200);
    expect(proxy.statusCode).toBe(200);
  });

  it('updates state and profile through control API', async () => {
    const missingProfile = await app.controlServer.inject({
      method: 'POST',
      url: '/state/profile',
      payload: {},
    });
    const badEnabled = await app.controlServer.inject({
      method: 'POST',
      url: '/state/enabled',
      payload: { enabled: 'yes' },
    });
    const enabled = await app.controlServer.inject({
      method: 'POST',
      url: '/state/enabled',
      payload: { enabled: true },
    });
    const badProfile = await app.controlServer.inject({
      method: 'POST',
      url: '/state/profile',
      payload: { profileId: 'missing' },
    });
    const profile = await app.controlServer.inject({
      method: 'POST',
      url: '/state/profile',
      payload: { profileId: 'unstable-api' },
    });
    const customProfile = await app.controlServer.inject({
      method: 'POST',
      url: '/state/profile',
      payload: { profileId: 'my-bad-network' },
    });

    expect(missingProfile.statusCode).toBe(400);
    expect(badEnabled.statusCode).toBe(400);
    expect(enabled.statusCode).toBe(200);
    expect(badProfile.statusCode).toBe(404);
    expect(profile.statusCode).toBe(200);
    expect(customProfile.statusCode).toBe(200);
    expect(app.chaosState.profileId).toBe('my-bad-network');
  });

  it('forwards request to target base url and logs it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'x-proxy-target': 'mock' },
      }),
    );

    const response = await app.proxyServer.inject({ method: 'GET', url: '/posts/1' });
    const logs = await app.controlServer.inject({ method: 'GET', url: '/logs' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://jsonplaceholder.typicode.com/posts/1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(response.statusCode).toBe(201);
    expect(response.headers['x-proxy-target']).toBe('mock');
    expect(logs.json()[0]).toEqual(
      expect.objectContaining({
        method: 'GET',
        url: '/posts/1',
        statusCode: 201,
        chaosEnabled: false,
        throttlingApplied: false,
        downloadKbpsApplied: null,
        appliedRule: null,
      }),
    );
  });

  it('throttles response when downloadKbps is configured', async () => {
    app.chaosState.enabled = true;
    app.chaosState.profileId = 'custom-profile';
    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 0,
      timeoutRatePercent: 0,
      timeoutMs: 1,
      downloadKbps: 10,
    };
    randomProvider.mockReturnValue(0.99);

    const payload = 'x'.repeat(2048);
    fetchMock.mockResolvedValue(new Response(payload, { status: 200 }));

    const startedAt = Date.now();
    const response = await app.proxyServer.inject({ method: 'GET', url: '/slow-body' });
    const elapsedMs = Date.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBe(2048);
    expect(elapsedMs).toBeGreaterThanOrEqual(1000);

    const logs = await app.controlServer.inject({ method: 'GET', url: '/logs' });
    expect(logs.json()[0]).toEqual(
      expect.objectContaining({
        url: '/slow-body',
        throttlingApplied: true,
        downloadKbpsApplied: 10,
      }),
    );
  });

  it('handles absolute target urls and request body forwarding', async () => {
    expect(resolveTargetUrl('https://example.com/submit', 'https://jsonplaceholder.typicode.com')).toBe(
      'https://example.com/submit',
    );

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      }),
    );

    const response = await app.proxyServer.inject({
      method: 'POST',
      url: '/submit',
      payload: { message: 'hello' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://jsonplaceholder.typicode.com/submit',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('applies error and timeout when chaos is enabled', async () => {
    app.chaosState.enabled = true;
    app.chaosState.profileId = 'custom-profile';
    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 100,
      timeoutRatePercent: 0,
      timeoutMs: 1,
    };
    randomProvider.mockReturnValue(0);

    const errorResponse = await app.proxyServer.inject({ method: 'GET', url: '/posts/1' });
    expect(errorResponse.statusCode).toBe(502);

    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 0,
      timeoutRatePercent: 100,
      timeoutMs: 1,
    };
    const timeoutResponse = await app.proxyServer.inject({ method: 'GET', url: '/posts/2' });
    expect(timeoutResponse.statusCode).toBe(504);
  });

  it('handles CONNECT requests through tunnel and chaos failures', async () => {
    const targetServer = net.createServer((socket) => {
      socket.on('data', () => {
        socket.write('HTTP/1.1 200 OK\r\n\r\n');
      });
    });
    await new Promise<void>((resolve) => {
      targetServer.listen(0, '127.0.0.1', () => resolve());
    });
    const targetPort = (targetServer.address() as net.AddressInfo).port;
    const proxyPort = (app.proxyServer.server.address() as net.AddressInfo).port;

    const success = await connectThroughProxy(proxyPort, '127.0.0.1', targetPort, 'ping');
    expect(success.startsWith('HTTP/1.1 200 Connection Established')).toBe(true);

    app.chaosState.enabled = true;
    app.chaosState.profileId = 'custom-profile';
    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 100,
      timeoutRatePercent: 0,
      timeoutMs: 1,
    };
    randomProvider.mockReturnValue(0);
    const failed = await connectThroughProxy(proxyPort, '127.0.0.1', targetPort);
    expect(failed).toBe('');

    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 0,
      timeoutRatePercent: 100,
      timeoutMs: 1,
    };
    const timeout = await connectThroughProxy(proxyPort, '127.0.0.1', targetPort);
    expect(timeout.startsWith('HTTP/1.1 504 Gateway Timeout')).toBe(true);

    const invalid = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(proxyPort, '127.0.0.1');
      let data = '';
      socket.on('connect', () => {
        socket.write('CONNECT :443 HTTP/1.1\r\nHost: :443\r\n\r\n');
      });
      socket.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\r\n\r\n')) {
          socket.destroy();
          resolve(data);
        }
      });
      socket.on('error', reject);
    });
    expect(invalid.startsWith('HTTP/1.1 400 Bad Request')).toBe(true);

    await new Promise<void>((resolve, reject) => {
      targetServer.close((error) => (error ? reject(error) : resolve()));
    });

    app.chaosState.enabled = false;
    const closedPort = targetPort;
    const upstreamError = await connectThroughProxy(proxyPort, '127.0.0.1', closedPort);
    expect(upstreamError).toBe('');
  });

  it('applies matching profile rules per request', async () => {
    app.chaosState.enabled = true;
    app.chaosState.profileId = 'custom-profile';
    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 0,
      timeoutRatePercent: 0,
      timeoutMs: 1,
    };
    app.chaosState.profileRules = [{ match: '/payments', profile: 'unstable-api' }];

    randomProvider
      .mockReturnValueOnce(0.99) // timeout false
      .mockReturnValueOnce(0.1) // error true (25%)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.99);

    const matched = await app.proxyServer.inject({ method: 'GET', url: '/payments/charge' });
    expect(matched.statusCode).toBe(502);

    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const nonMatched = await app.proxyServer.inject({ method: 'GET', url: '/orders' });
    expect(nonMatched.statusCode).toBe(200);

    const logs = await app.controlServer.inject({ method: 'GET', url: '/logs' });
    expect(logs.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: '/payments/charge',
          profile: 'unstable-api',
          appliedRule: '/payments',
        }),
        expect.objectContaining({
          url: '/orders',
          appliedRule: null,
        }),
      ]),
    );
  });

  it('updates rules through control endpoint', async () => {
    const bad = await app.controlServer.inject({
      method: 'POST',
      url: '/state/rules',
      payload: { rules: [{ match: '', profile: 'slow-3g' }] },
    });
    const good = await app.controlServer.inject({
      method: 'POST',
      url: '/state/rules',
      payload: { rules: [{ match: '/posts', profile: 'slow-3g' }] },
    });

    expect(bad.statusCode).toBe(400);
    expect(good.statusCode).toBe(200);
    expect(app.chaosState.profileRules).toEqual([{ match: '/posts', profile: 'slow-3g' }]);
  });

  it('exposes aggregated metrics', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    await app.proxyServer.inject({ method: 'GET', url: '/normal' });

    app.chaosState.enabled = true;
    app.chaosState.profileId = 'custom-profile';
    app.chaosState.rules = {
      delayMs: 0,
      errorRatePercent: 100,
      timeoutRatePercent: 0,
      timeoutMs: 1,
    };
    randomProvider.mockReturnValue(0);
    await app.proxyServer.inject({ method: 'GET', url: '/error' });

    const metrics = await app.controlServer.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toEqual(
      expect.objectContaining({
        totalRequests: 2,
        erroredRequests: 1,
        chaosEnabled: true,
        activeProfile: app.chaosState.profileId,
      }),
    );
  });

  it('updates target base url through control endpoint', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    const bad = await app.controlServer.inject({
      method: 'POST',
      url: '/state/target-base-url',
      payload: { targetBaseUrl: 'notaurl' },
    });
    const good = await app.controlServer.inject({
      method: 'POST',
      url: '/state/target-base-url',
      payload: { targetBaseUrl: 'https://example.com/api' },
    });
    const response = await app.proxyServer.inject({ method: 'GET', url: '/posts/1' });

    expect(bad.statusCode).toBe(400);
    expect(good.statusCode).toBe(200);
    expect(app.chaosState.targetBaseUrl).toBe('https://example.com/api');
    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/posts/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates custom profiles and exposes dynamic profile list', async () => {
    const initialProfiles = await app.controlServer.inject({
      method: 'GET',
      url: '/profiles',
    });
    const badCustom = await app.controlServer.inject({
      method: 'POST',
      url: '/profiles/custom',
      payload: { profileId: 'my-web-profile', rules: { delayMs: -1 } },
    });
    const custom = await app.controlServer.inject({
      method: 'POST',
      url: '/profiles/custom',
      payload: {
        profileId: 'my-web-profile',
        rules: {
          delayMs: 1234,
          errorRatePercent: 15,
          timeoutRatePercent: 5,
          timeoutMs: 9000,
          downloadKbps: 120,
        },
      },
    });

    const profile = await app.controlServer.inject({
      method: 'POST',
      url: '/state/profile',
      payload: { profileId: 'my-web-profile' },
    });
    const rules = await app.controlServer.inject({
      method: 'POST',
      url: '/state/rules',
      payload: { rules: [{ match: '/payments', profile: 'my-web-profile' }] },
    });
    const updatedProfiles = await app.controlServer.inject({
      method: 'GET',
      url: '/profiles',
    });

    expect(initialProfiles.statusCode).toBe(200);
    expect(badCustom.statusCode).toBe(400);
    expect(custom.statusCode).toBe(200);
    expect(profile.statusCode).toBe(200);
    expect(rules.statusCode).toBe(200);
    expect(updatedProfiles.json().profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'slow-3g', source: 'preset' }),
        expect.objectContaining({ id: 'my-web-profile', source: 'custom' }),
      ]),
    );
  });

  it('runs scenario steps and stops at the end for non-loop scenarios', async () => {
    vi.useFakeTimers();

    const started = app.startScenarioRuntime('api-degrading');
    expect(started).toBe(true);
    expect(app.chaosState.enabled).toBe(true);
    expect(app.chaosState.profileId).toBe('normal');
    expect(app.chaosState.scenario?.stepIndex).toBe(0);

    await vi.advanceTimersByTimeAsync(15000);
    expect(app.chaosState.profileId).toBe('unstable-api');
    expect(app.chaosState.scenario?.stepIndex).toBe(1);

    await vi.advanceTimersByTimeAsync(15000);
    expect(app.chaosState.profileId).toBe('total-chaos');
    expect(app.chaosState.scenario?.stepIndex).toBe(2);

    await vi.advanceTimersByTimeAsync(10000);
    expect(app.chaosState.scenario).toBeNull();

    vi.useRealTimers();
  });

  it('supports loop scenarios and can be stopped manually', async () => {
    vi.useFakeTimers();

    const started = app.startScenarioRuntime('bad-mobile-network');
    expect(started).toBe(true);
    expect(app.chaosState.profileId).toBe('normal');

    await vi.advanceTimersByTimeAsync(30000);
    expect(app.chaosState.profileId).toBe('slow-3g');

    app.stopScenarioRuntime();
    expect(app.chaosState.scenario).toBeNull();

    await vi.advanceTimersByTimeAsync(60000);
    expect(app.chaosState.profileId).toBe('slow-3g');

    vi.useRealTimers();
  });

  it('stops active scenario when chaos is disabled', async () => {
    app.startScenarioRuntime('bad-mobile-network');
    expect(app.chaosState.scenario).not.toBeNull();

    const response = await app.controlServer.inject({
      method: 'POST',
      url: '/state/enabled',
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(app.chaosState.scenario).toBeNull();
  });

  it('returns false when trying to start an unknown scenario', () => {
    const started = app.startScenarioRuntime('missing-scenario');
    expect(started).toBe(false);
  });

  it('controls scenarios through API endpoints', async () => {
    const missing = await app.controlServer.inject({
      method: 'POST',
      url: '/scenario',
      payload: {},
    });
    const unknown = await app.controlServer.inject({
      method: 'POST',
      url: '/scenario',
      payload: { name: 'missing' },
    });
    const start = await app.controlServer.inject({
      method: 'POST',
      url: '/scenario',
      payload: { name: 'bad-mobile-network' },
    });
    const scenario = await app.controlServer.inject({
      method: 'GET',
      url: '/scenario',
    });
    const scenarios = await app.controlServer.inject({
      method: 'GET',
      url: '/scenarios',
    });
    const off = await app.controlServer.inject({
      method: 'POST',
      url: '/scenario/off',
    });

    expect(missing.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(404);
    expect(start.statusCode).toBe(200);
    expect(scenario.json().activeScenario).not.toBeNull();
    expect(scenarios.json().scenarios.length).toBeGreaterThan(0);
    expect(off.statusCode).toBe(200);
    expect(app.chaosState.scenario).toBeNull();
  });

  it('loads local plugins safely and applies plugin hooks', async () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-plugins-'));
    fs.writeFileSync(
      path.join(pluginDir, 'plugin-auth.js'),
      `
      export default {
        name: 'random-auth-failure',
        onRequest(ctx) {
          if (ctx.url.includes('/secure')) {
            ctx.forceError(401);
          }
        },
        onResponse(ctx) {
          ctx.setHeader('x-plugin-mark', 'active');
        }
      };
      `,
      'utf8',
    );
    fs.writeFileSync(
      path.join(pluginDir, 'plugin-broken.js'),
      `
      export default {
        name: 'broken-plugin',
        onRequest() {
          throw new Error('plugin crash');
        }
      };
      `,
      'utf8',
    );

    const pluginApp = createProxySystem({
      fetchImpl: fetchMock,
      randomProvider,
      pluginDirectory: pluginDir,
    });
    await pluginApp.proxyServer.listen({ host: '127.0.0.1', port: 0 });
    await pluginApp.controlServer.listen({ host: '127.0.0.1', port: 0 });

    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const secure = await pluginApp.proxyServer.inject({ method: 'GET', url: '/secure' });
    const normal = await pluginApp.proxyServer.inject({ method: 'GET', url: '/public' });
    const logs = await pluginApp.controlServer.inject({ method: 'GET', url: '/logs' });

    expect(secure.statusCode).toBe(401);
    expect(normal.statusCode).toBe(200);
    expect(normal.headers['x-plugin-mark']).toBe('active');
    expect(logs.json()[0].pluginErrors).toEqual(
      expect.arrayContaining([expect.stringContaining('plugin crash')]),
    );

    await pluginApp.proxyServer.close();
    await pluginApp.controlServer.close();
  });

  it('supports plugin request actions for http and connect', async () => {
    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-plugins-actions-'));
    fs.writeFileSync(
      path.join(pluginDir, 'plugin-actions.js'),
      `
      export default {
        name: 'actions',
        onRequest(ctx) {
          if (ctx.method === 'GET' && ctx.url === '/plugin-force') ctx.forceError(418);
          if (ctx.method === 'GET' && ctx.url === '/plugin-drop') ctx.dropConnection();
          if (ctx.method === 'GET' && ctx.url === '/plugin-delay') {
            ctx.addDelay(5);
            ctx.skipChaos();
            ctx.setHeader('x-upstream', 'yes');
          }
          if (ctx.method === 'CONNECT' && ctx.url.startsWith('force.local')) ctx.forceError(429);
          if (ctx.method === 'CONNECT' && ctx.url.startsWith('drop.local')) ctx.dropConnection();
        },
        onResponse(ctx) {
          if (ctx.url === '/plugin-delay') ctx.setHeader('x-response-plugin', 'ok');
        }
      };
      `,
      'utf8',
    );
    fs.writeFileSync(
      path.join(pluginDir, 'plugin-invalid.js'),
      `export default { onRequest() {} };`,
      'utf8',
    );
    fs.writeFileSync(path.join(pluginDir, 'plugin-syntax.js'), 'export default {', 'utf8');

    const pluginApp = createProxySystem({
      fetchImpl: fetchMock,
      randomProvider,
      pluginDirectory: pluginDir,
    });
    await pluginApp.proxyServer.listen({ host: '127.0.0.1', port: 0 });
    await pluginApp.controlServer.listen({ host: '127.0.0.1', port: 0 });

    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
    const forced = await pluginApp.proxyServer.inject({ method: 'GET', url: '/plugin-force' });
    await expect(
      pluginApp.proxyServer.inject({ method: 'GET', url: '/plugin-drop' }),
    ).rejects.toThrow();
    const delayed = await pluginApp.proxyServer.inject({ method: 'GET', url: '/plugin-delay' });
    const proxyPort = (pluginApp.proxyServer.server.address() as net.AddressInfo).port;
    const forcedConnect = await connectThroughProxy(proxyPort, 'force.local', 443);
    const droppedConnect = await connectThroughProxy(proxyPort, 'drop.local', 443);
    const logs = await pluginApp.controlServer.inject({ method: 'GET', url: '/logs' });

    expect(forced.statusCode).toBe(418);
    expect(delayed.statusCode).toBe(200);
    expect(delayed.headers['x-response-plugin']).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://jsonplaceholder.typicode.com/plugin-delay',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-upstream': 'yes' }),
      }),
    );
    expect(forcedConnect.startsWith('HTTP/1.1 429 Forced Error')).toBe(true);
    expect(droppedConnect).toBe('');
    expect(logs.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: '/plugin-drop',
          droppedConnectionApplied: true,
        }),
        expect.objectContaining({
          pluginErrors: expect.arrayContaining([expect.stringContaining('invalid plugin contract')]),
        }),
      ]),
    );

    await pluginApp.proxyServer.close();
    await pluginApp.controlServer.close();
  });

  it('records and replays http traffic from file storage', async () => {
    const recordingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-recordings-'));
    const recordApp = createProxySystem({
      fetchImpl: fetchMock,
      randomProvider,
      recordingsDirectory: recordingsDir,
    });
    await recordApp.proxyServer.listen({ host: '127.0.0.1', port: 0 });
    await recordApp.controlServer.listen({ host: '127.0.0.1', port: 0 });

    const start = await recordApp.controlServer.inject({
      method: 'POST',
      url: '/record/start',
      payload: { fileName: 'sample.json' },
    });
    expect(start.statusCode).toBe(200);

    fetchMock.mockResolvedValue(new Response('from-live', { status: 200, headers: { 'x-src': 'live' } }));
    const live = await recordApp.proxyServer.inject({ method: 'GET', url: '/posts/record-me' });
    expect(live.statusCode).toBe(200);
    expect(live.body).toBe('from-live');

    const stop = await recordApp.controlServer.inject({
      method: 'POST',
      url: '/record/stop',
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().entriesWritten).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(recordingsDir, 'sample.json'))).toBe(true);

    fetchMock.mockResolvedValue(new Response('from-upstream-new', { status: 200 }));
    const replayStart = await recordApp.controlServer.inject({
      method: 'POST',
      url: '/replay/start',
      payload: { recordingFile: 'sample.json' },
    });
    expect(replayStart.statusCode).toBe(200);

    const replayed = await recordApp.proxyServer.inject({ method: 'GET', url: '/posts/record-me' });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.body).toBe('from-live');

    const replayStop = await recordApp.controlServer.inject({
      method: 'POST',
      url: '/replay/stop',
    });
    expect(replayStop.statusCode).toBe(200);

    await recordApp.proxyServer.close();
    await recordApp.controlServer.close();
  });
});
