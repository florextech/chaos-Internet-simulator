import { createProxySystem } from './app.js';
import { resolveProxyConfig } from './config.js';

const resolvedConfig = resolveProxyConfig();

const { proxyServer, controlServer } = createProxySystem({
  targetBaseUrl: resolvedConfig.targetBaseUrl,
  initialEnabled: resolvedConfig.enabled,
  initialProfileId: resolvedConfig.activeProfile,
  profileRules: resolvedConfig.rules,
  customProfiles: resolvedConfig.customProfiles,
});

const start = async (): Promise<void> => {
  await Promise.all([
    proxyServer.listen({ host: '0.0.0.0', port: resolvedConfig.proxyPort }),
    controlServer.listen({ host: '0.0.0.0', port: resolvedConfig.controlApiPort }),
  ]);
};

start().catch((error) => {
  proxyServer.log.error(error);
  process.exit(1);
});
