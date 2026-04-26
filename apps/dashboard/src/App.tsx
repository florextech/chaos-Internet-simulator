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
  throttlingApplied: boolean;
  downloadKbpsApplied: number | null;
  statusCode: number;
  appliedRule: string | null;
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
      <section className="shell">
        <header className="header">
          <div>
            <p className="eyebrow">Florex Labs</p>
            <h1>Chaos Internet Simulator</h1>
          </div>
          <span className={healthy ? 'pill pill-ok' : 'pill pill-error'}>
            Control API: {healthy ? 'connected' : 'disconnected'}
          </span>
        </header>

        {state && (
          <div className="panel panel-top">
            <div className="row row-top">
              <div className="status-block">
                <p className="label">Chaos status</p>
                <p className={state.enabled ? 'state-on' : 'state-off'}>
                  {state.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <button className="btn btn-primary" onClick={handleToggle} disabled={loading}>
                {state.enabled ? 'Disable chaos' : 'Enable chaos'}
              </button>
            </div>
            <div className="row">
              <p className="label">Profile</p>
              <div className="profile-select-wrap">
                <select
                  className="profile-select"
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
            </div>
            <div className="rule-grid">
              <div className="rule-item">
                <p className="rule-label">Delay</p>
                <p>{state.rules.delayMs} ms</p>
              </div>
              <div className="rule-item">
                <p className="rule-label">Error rate</p>
                <p>{state.rules.errorRatePercent}%</p>
              </div>
              <div className="rule-item">
                <p className="rule-label">Timeout rate</p>
                <p>{state.rules.timeoutRatePercent}%</p>
              </div>
              <div className="rule-item">
                <p className="rule-label">Timeout</p>
                <p>{state.rules.timeoutMs} ms</p>
              </div>
            </div>
          </div>
        )}

        <div className="panel logs">
          <div className="logs-head">
            <h2>Recent Requests</h2>
            <span className="pill">{logs.length} rows</span>
          </div>
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
                  <th>Throttle</th>
                  <th>Rule</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td className="empty-cell" colSpan={11}>
                      No requests yet.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={`${log.timestamp}-${log.method}-${log.url}`}>
                    <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td>{log.method}</td>
                    <td className="url-cell">{log.url}</td>
                    <td>{log.profile}</td>
                    <td>{log.chaosEnabled ? 'on' : 'off'}</td>
                    <td>{log.delayApplied ? 'yes' : 'no'}</td>
                    <td>{log.errorApplied ? 'yes' : 'no'}</td>
                    <td>{log.timeoutApplied ? 'yes' : 'no'}</td>
                    <td>{log.throttlingApplied ? `${log.downloadKbpsApplied} kbps` : '-'}</td>
                    <td>{log.appliedRule ?? '-'}</td>
                    <td>
                      <span className={log.statusCode >= 400 ? 'status bad' : 'status good'}>
                        {log.statusCode}
                      </span>
                    </td>
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
