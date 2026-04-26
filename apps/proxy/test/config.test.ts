import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveProxyConfig } from '../src/config.js';

const createTempDir = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-proxy-config-test-'));

const writeConfig = (dir: string, contents: string): void => {
  fs.writeFileSync(path.join(dir, 'chaos.config.json'), contents, 'utf8');
};

describe('resolveProxyConfig', () => {
  afterEach(() => {
    delete process.env.TARGET_BASE_URL;
    delete process.env.PROXY_PORT;
    delete process.env.CONTROL_PORT;
  });

  it('uses defaults when file does not exist', () => {
    const dir = createTempDir();
    const config = resolveProxyConfig(dir);

    expect(config).toEqual({
      enabled: false,
      activeProfile: 'slow-3g',
      targetBaseUrl: 'https://jsonplaceholder.typicode.com',
      proxyPort: 8080,
      controlApiPort: 8081,
      rules: [],
      customProfiles: {},
    });
  });

  it('loads config from current directory', () => {
    const dir = createTempDir();
    writeConfig(
      dir,
      JSON.stringify({
        enabled: true,
        activeProfile: 'unstable-api',
        targetBaseUrl: 'https://example.com',
        proxyPort: 9090,
        controlApiPort: 9091,
        rules: [{ match: '/payments', profile: 'slow-3g' }],
      }),
    );

    const config = resolveProxyConfig(dir);
    expect(config.enabled).toBe(true);
    expect(config.activeProfile).toBe('unstable-api');
    expect(config.targetBaseUrl).toBe('https://example.com');
    expect(config.proxyPort).toBe(9090);
    expect(config.controlApiPort).toBe(9091);
    expect(config.rules).toEqual([{ match: '/payments', profile: 'slow-3g' }]);
  });

  it('loads config from parent directory when missing in current', () => {
    const root = createTempDir();
    const child = path.join(root, 'apps', 'proxy');
    fs.mkdirSync(child, { recursive: true });
    writeConfig(
      root,
      JSON.stringify({
        activeProfile: 'airport-wifi',
      }),
    );

    const config = resolveProxyConfig(child);
    expect(config.activeProfile).toBe('airport-wifi');
  });

  it('env vars override file values', () => {
    const dir = createTempDir();
    writeConfig(
      dir,
      JSON.stringify({
        targetBaseUrl: 'https://from-file.example',
        proxyPort: 7000,
        controlApiPort: 7001,
      }),
    );

    process.env.TARGET_BASE_URL = 'https://from-env.example';
    process.env.PROXY_PORT = '7100';
    process.env.CONTROL_PORT = '7101';

    const config = resolveProxyConfig(dir);
    expect(config.targetBaseUrl).toBe('https://from-env.example');
    expect(config.proxyPort).toBe(7100);
    expect(config.controlApiPort).toBe(7101);
  });
});
