import net from 'node:net';

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

    socket.on('connect', () => {
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n${tail}`,
      );
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
        appliedRule: null,
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
    expect(failed.startsWith('HTTP/1.1 502 Bad Gateway')).toBe(true);

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
    expect(upstreamError.startsWith('HTTP/1.1 502 Bad Gateway')).toBe(true);
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
});
