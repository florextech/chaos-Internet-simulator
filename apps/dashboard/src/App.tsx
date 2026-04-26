import { useEffect, useState } from 'react';

const CONTROL_API = import.meta.env.VITE_CONTROL_API_URL ?? 'http://localhost:8081';

type ChaosState = {
  enabled: boolean;
  profileId: string;
  targetBaseUrl: string;
  profileRules: Array<{ match: string; profile: string }>;
  customProfiles: Record<
    string,
    {
      delayMs: number;
      errorRatePercent: number;
      timeoutRatePercent: number;
      timeoutMs: number;
      downloadKbps?: number;
    }
  >;
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
    downloadKbps?: number;
  };
  scenario: {
    name: string;
    loop: boolean;
    stepIndex: number;
    currentProfile: string;
    stepEndsAt: string;
  } | null;
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

type ProfileOption = {
  id: string;
  source: 'preset' | 'custom';
  rules: {
    delayMs: number;
    errorRatePercent: number;
    timeoutRatePercent: number;
    timeoutMs: number;
    downloadKbps?: number;
  };
};

export const App = () => {
  const [healthy, setHealthy] = useState<boolean>(false);
  const [state, setState] = useState<ChaosState | null>(null);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [targetBaseUrlDraft, setTargetBaseUrlDraft] = useState('');
  const [rulesDraft, setRulesDraft] = useState<Array<{ match: string; profile: string }>>([]);
  const [customProfileName, setCustomProfileName] = useState('');
  const [customDelayMs, setCustomDelayMs] = useState('2500');
  const [customErrorRate, setCustomErrorRate] = useState('5');
  const [customTimeoutRate, setCustomTimeoutRate] = useState('2');
  const [customTimeoutMs, setCustomTimeoutMs] = useState('8000');
  const [customDownloadKbps, setCustomDownloadKbps] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadState = async () => {
    const response = await fetch(`${CONTROL_API}/state`);
    const data = (await response.json()) as ChaosState;
    setState(data);
    setTargetBaseUrlDraft(data.targetBaseUrl);
    setRulesDraft(data.profileRules ?? []);
  };

  const loadProfiles = async () => {
    const response = await fetch(`${CONTROL_API}/profiles`);
    const data = (await response.json()) as { profiles: ProfileOption[] };
    setProfiles(data.profiles);
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
        await Promise.all([loadState(), loadLogs(), loadProfiles()]);
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
      await Promise.all([loadState(), loadLogs(), loadProfiles()]);
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
      await Promise.all([loadState(), loadLogs(), loadProfiles()]);
    } finally {
      setLoading(false);
    }
  };

  const updateRuleRow = (index: number, key: 'match' | 'profile', value: string) => {
    setRulesDraft((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [key]: value } : rule)),
    );
  };

  const handleSaveTargetBaseUrl = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${CONTROL_API}/state/target-base-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetBaseUrl: targetBaseUrlDraft }),
      });
      if (!response.ok) {
        throw new Error('Could not update target URL');
      }
      setMessage('Target URL updated');
      await loadState();
    } catch {
      setMessage('Invalid target URL or control API unavailable');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRules = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const cleanRules = rulesDraft
        .map((rule) => ({ match: rule.match.trim(), profile: rule.profile }))
        .filter((rule) => rule.match.length > 0 && rule.profile.length > 0);
      const response = await fetch(`${CONTROL_API}/state/rules`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: cleanRules }),
      });
      if (!response.ok) {
        throw new Error('Could not update URL rules');
      }
      setMessage('URL rules updated');
      await loadState();
    } catch {
      setMessage('Failed to update URL rules');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomProfile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        profileId: customProfileName.trim(),
        rules: {
          delayMs: Number(customDelayMs),
          errorRatePercent: Number(customErrorRate),
          timeoutRatePercent: Number(customTimeoutRate),
          timeoutMs: Number(customTimeoutMs),
          ...(customDownloadKbps.trim()
            ? { downloadKbps: Number(customDownloadKbps.trim()) }
            : {}),
        },
      };

      const response = await fetch(`${CONTROL_API}/profiles/custom`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('Could not save custom profile');
      }
      setMessage(`Custom profile "${payload.profileId}" saved`);
      await Promise.all([loadState(), loadProfiles()]);
    } catch {
      setMessage('Failed to save custom profile');
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
                {state.scenario && (
                  <p className="label">Scenario: {state.scenario.name}</p>
                )}
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
                      {profile.id}
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
              <div className="rule-item">
                <p className="rule-label">Download</p>
                <p>{state.rules.downloadKbps ? `${state.rules.downloadKbps} kbps` : 'none'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="panel config-panel">
          <div className="logs-head">
            <h2>Chaos Configuration</h2>
          </div>

          <div className="config-block">
            <p className="label">Target base URL</p>
            <div className="inline-form">
              <input
                className="text-input"
                value={targetBaseUrlDraft}
                onChange={(event) => setTargetBaseUrlDraft(event.target.value)}
                placeholder="https://jsonplaceholder.typicode.com"
                disabled={loading}
              />
              <button className="btn btn-secondary" onClick={handleSaveTargetBaseUrl} disabled={loading}>
                Save URL
              </button>
            </div>
          </div>

          <div className="config-block">
            <div className="row row-inline">
              <p className="label">Rules by URL/domain/path</p>
              <button
                className="btn btn-ghost"
                onClick={() => setRulesDraft((current) => [...current, { match: '', profile: state?.profileId ?? '' }])}
                disabled={loading || profiles.length === 0}
              >
                + Add rule
              </button>
            </div>
            <div className="rules-editor">
              {rulesDraft.length === 0 && <p className="label">No URL rules configured.</p>}
              {rulesDraft.map((rule, index) => (
                <div key={`${index}-${rule.match}-${rule.profile}`} className="rule-row">
                  <input
                    className="text-input"
                    value={rule.match}
                    onChange={(event) => updateRuleRow(index, 'match', event.target.value)}
                    placeholder="/payments or api.example.com"
                    disabled={loading}
                  />
                  <div className="profile-select-wrap">
                    <select
                      className="profile-select"
                      value={rule.profile}
                      onChange={(event) => updateRuleRow(index, 'profile', event.target.value)}
                      disabled={loading}
                    >
                      {profiles.map((profile) => (
                        <option key={`rule-${index}-${profile.id}`} value={profile.id}>
                          {profile.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setRulesDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index))
                    }
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={handleSaveRules} disabled={loading}>
              Save rules
            </button>
          </div>

          <div className="config-block">
            <p className="label">Custom profile</p>
            <div className="custom-grid">
              <input
                className="text-input"
                value={customProfileName}
                onChange={(event) => setCustomProfileName(event.target.value)}
                placeholder="profile-name"
                disabled={loading}
              />
              <input
                className="text-input"
                type="number"
                min={0}
                value={customDelayMs}
                onChange={(event) => setCustomDelayMs(event.target.value)}
                placeholder="delayMs"
                disabled={loading}
              />
              <input
                className="text-input"
                type="number"
                min={0}
                max={100}
                value={customErrorRate}
                onChange={(event) => setCustomErrorRate(event.target.value)}
                placeholder="errorRatePercent"
                disabled={loading}
              />
              <input
                className="text-input"
                type="number"
                min={0}
                max={100}
                value={customTimeoutRate}
                onChange={(event) => setCustomTimeoutRate(event.target.value)}
                placeholder="timeoutRatePercent"
                disabled={loading}
              />
              <input
                className="text-input"
                type="number"
                min={0}
                value={customTimeoutMs}
                onChange={(event) => setCustomTimeoutMs(event.target.value)}
                placeholder="timeoutMs"
                disabled={loading}
              />
              <input
                className="text-input"
                type="number"
                min={1}
                value={customDownloadKbps}
                onChange={(event) => setCustomDownloadKbps(event.target.value)}
                placeholder="downloadKbps (optional)"
                disabled={loading}
              />
            </div>
            <button className="btn btn-secondary" onClick={handleSaveCustomProfile} disabled={loading}>
              Save custom profile
            </button>
          </div>

          {message && <p className="config-message">{message}</p>}
        </div>

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
