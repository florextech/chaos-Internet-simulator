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

type RequestLog = {
  method: string;
  url: string;
  profile: string;
  chaosEnabled: boolean;
  delayApplied: boolean;
  errorApplied: boolean;
  timeoutApplied: boolean;
  statusCode: number;
  timestamp: string;
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
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadState = async () => {
    const response = await fetch(`${CONTROL_API}/state`);
    const data = (await response.json()) as ChaosState;
    setState(data);
  };

  const loadLogs = async () => {
    const response = await fetch(`${CONTROL_API}/logs`);
    const data = (await response.json()) as RequestLog[];
    setLogs(data.slice(0, 30));
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await fetch(`${CONTROL_API}/health`).then((res) => res.json());
        setHealthy(true);
        await Promise.all([loadState(), loadLogs()]);
      } catch {
        setHealthy(false);
      }
    };
    bootstrap();

    const timer = setInterval(() => {
      loadLogs().catch(() => undefined);
    }, 3000);

    return () => clearInterval(timer);
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
      await Promise.all([loadState(), loadLogs()]);
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
      await Promise.all([loadState(), loadLogs()]);
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
        <div className="logs">
          <h2>Recent Requests</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Method</th>
                  <th>URL</th>
                  <th>Profile</th>
                  <th>Chaos</th>
                  <th>Delay</th>
                  <th>Error</th>
                  <th>Timeout</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={9}>No requests yet.</td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={`${log.timestamp}-${log.method}-${log.url}`}>
                    <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td>{log.method}</td>
                    <td>{log.url}</td>
                    <td>{log.profile}</td>
                    <td>{log.chaosEnabled ? 'on' : 'off'}</td>
                    <td>{log.delayApplied ? 'yes' : 'no'}</td>
                    <td>{log.errorApplied ? 'yes' : 'no'}</td>
                    <td>{log.timeoutApplied ? 'yes' : 'no'}</td>
                    <td>{log.statusCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
};
