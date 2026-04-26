import { useEffect, useState } from 'react';

const CONTROL_API = import.meta.env.VITE_CONTROL_API_URL ?? 'http://localhost:8081';

type ChaosState = {
  enabled: boolean;
  profileId: string;
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
  };
};

const profiles = [
  { id: 'slow-3g', label: 'Slow 3G' },
  { id: 'airport-wifi', label: 'Airport WiFi' },
  { id: 'unstable-api', label: 'Unstable API' },
  { id: 'total-chaos', label: 'Total Chaos' },
];

export const App = () => {
  const [healthy, setHealthy] = useState<boolean>(false);
  const [state, setState] = useState<ChaosState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadState = async () => {
    const response = await fetch(`${CONTROL_API}/state`);
    const data = (await response.json()) as ChaosState;
    setState(data);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await fetch(`${CONTROL_API}/health`).then((res) => res.json());
        setHealthy(true);
        await loadState();
      } catch {
        setHealthy(false);
      }
    };
    bootstrap();
  }, []);

  const handleToggle = async () => {
    if (!state) return;
    setLoading(true);
    try {
      await fetch(`${CONTROL_API}/state/enabled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !state.enabled }),
      });
      await loadState();
    } finally {
      setLoading(false);
    }
  };

  const handleProfileChange = async (profileId: string) => {
    setLoading(true);
    try {
      await fetch(`${CONTROL_API}/state/profile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      await loadState();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="layout">
      <section className="panel">
        <h1>Chaos Internet Simulator</h1>
        <p className={healthy ? 'ok' : 'error'}>
          Control API: {healthy ? 'connected' : 'disconnected'}
        </p>
        {state && (
          <div className="controls">
            <div className="row">
              <span>Chaos status</span>
              <button onClick={handleToggle} disabled={loading}>
                {state.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
            <div className="row">
              <span>Profile</span>
              <select
                value={state.profileId}
                onChange={(event) => handleProfileChange(event.target.value)}
                disabled={loading}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rule-grid">
              <span>Delay: {state.rules.delayMs} ms</span>
              <span>Error rate: {state.rules.errorRatePercent}%</span>
              <span>Timeout rate: {state.rules.timeoutRatePercent}%</span>
              <span>Timeout: {state.rules.timeoutMs} ms</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};
