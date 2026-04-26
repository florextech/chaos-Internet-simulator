import axios from 'axios';

const PROXY_HOST = process.env.CHAOS_PROXY_HOST ?? 'localhost';
const PROXY_PORT = Number(process.env.CHAOS_PROXY_PORT ?? '8080');
const TARGET_URL = process.env.CHAOS_TARGET_URL ?? 'https://jsonplaceholder.typicode.com/posts/1';

const main = async (): Promise<void> => {
  const response = await axios.get(TARGET_URL, {
    proxy: {
      protocol: 'http',
      host: PROXY_HOST,
      port: PROXY_PORT,
    },
    timeout: 20000,
  });

  console.log('Status:', response.status);
  console.log('Data:', response.data);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Request failed:', message);
  process.exitCode = 1;
});
