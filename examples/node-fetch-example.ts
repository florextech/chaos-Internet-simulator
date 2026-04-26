import { ProxyAgent, fetch } from 'undici';

const PROXY_URL = process.env.CHAOS_PROXY_URL ?? 'http://localhost:8080';
const TARGET_URL = process.env.CHAOS_TARGET_URL ?? 'https://jsonplaceholder.typicode.com/posts/1';

const main = async (): Promise<void> => {
  const dispatcher = new ProxyAgent(PROXY_URL);
  const response = await fetch(TARGET_URL, {
    dispatcher,
  });

  const body = await response.text();
  console.log('Status:', response.status);
  console.log('Body:', body);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Request failed:', message);
  process.exitCode = 1;
});
