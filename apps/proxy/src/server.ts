import { createProxySystem } from './app.js';

const proxyPort = Number(process.env.PROXY_PORT ?? 8080);
const controlPort = Number(process.env.CONTROL_PORT ?? 8081);
const targetBaseUrl = process.env.TARGET_BASE_URL ?? 'https://jsonplaceholder.typicode.com';

const { proxyServer, controlServer } = createProxySystem({ targetBaseUrl });

const start = async (): Promise<void> => {
  await Promise.all([
    proxyServer.listen({ host: '0.0.0.0', port: proxyPort }),
    controlServer.listen({ host: '0.0.0.0', port: controlPort }),
  ]);
};

start().catch((error) => {
  proxyServer.log.error(error);
  process.exit(1);
});
