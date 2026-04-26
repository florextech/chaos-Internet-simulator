import { useEffect, useState } from 'react';

const CONTROL_API = import.meta.env.VITE_CONTROL_API_URL ?? 'http://localhost:8081';

export const App = () => {
  const [healthy, setHealthy] = useState<boolean>(false);

  useEffect(() => {
    fetch(`${CONTROL_API}/health`)
      .then((res) => res.json())
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  return (
    <main className="layout">
      <section className="panel">
        <h1>Chaos Internet Simulator</h1>
        <p className={healthy ? 'ok' : 'error'}>
          Control API: {healthy ? 'connected' : 'disconnected'}
        </p>
      </section>
    </main>
  );
};
