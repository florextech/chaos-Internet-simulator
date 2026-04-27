import { useEffect, useState } from 'react';
import { Container, Section } from '@florexlabs/ui';

import { ChaosConfigPanel } from './components/ChaosConfigPanel';
import { ChaosStatePanel } from './components/ChaosStatePanel';
import { DashboardHeader } from './components/DashboardHeader';
import { MetricsPanel } from './components/MetricsPanel';
import { RequestLogsPanel } from './components/RequestLogsPanel';
import type { ChaosState, ProfileOption, ProfileRule, ProxyMetrics, RequestLog } from './types';

const CONTROL_API = import.meta.env.VITE_CONTROL_API_URL ?? 'http://localhost:8081';

export const App = () => {
  const [healthy, setHealthy] = useState<boolean>(false);
  const [state, setState] = useState<ChaosState | null>(null);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [metrics, setMetrics] = useState<ProxyMetrics | null>(null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [targetBaseUrlDraft, setTargetBaseUrlDraft] = useState('');
  const [rulesDraft, setRulesDraft] = useState<ProfileRule[]>([]);
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

  const loadMetrics = async () => {
    const response = await fetch(`${CONTROL_API}/metrics`);
    const data = (await response.json()) as ProxyMetrics;
    setMetrics(data);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await fetch(`${CONTROL_API}/health`).then((res) => res.json());
        setHealthy(true);
        await Promise.all([loadState(), loadLogs(), loadProfiles(), loadMetrics()]);
      } catch {
        setHealthy(false);
      }
    };
    bootstrap();

    const timer = setInterval(() => {
      Promise.all([loadLogs(), loadMetrics()]).catch(() => undefined);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const refreshAll = async () => {
    await Promise.all([loadState(), loadLogs(), loadProfiles(), loadMetrics()]);
  };

  const handleToggle = async () => {
    if (!state) return;
    setLoading(true);
    try {
      await fetch(`${CONTROL_API}/state/enabled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !state.enabled }),
      });
      await refreshAll();
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
      await refreshAll();
    } finally {
      setLoading(false);
    }
  };

  const updateRuleRow = (index: number, key: 'match' | 'profile', value: string) => {
    setRulesDraft((current) =>
      current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, [key]: value } : rule)),
    );
  };

  const addRuleRow = () => {
    setRulesDraft((current) => [...current, { match: '', profile: state?.profileId ?? '' }]);
  };

  const removeRuleRow = (index: number) => {
    setRulesDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
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
    <main className="min-h-screen py-6">
      <Section className="py-0">
        <Container className="max-w-[1080px]">
          <DashboardHeader healthy={healthy} loading={loading} />
          <MetricsPanel metrics={metrics} />
          <ChaosStatePanel
            state={state}
            profiles={profiles}
            loading={loading}
            onToggle={handleToggle}
            onProfileChange={handleProfileChange}
          />
          <ChaosConfigPanel
            loading={loading}
            profiles={profiles}
            targetBaseUrlDraft={targetBaseUrlDraft}
            rulesDraft={rulesDraft}
            customProfileName={customProfileName}
            customDelayMs={customDelayMs}
            customErrorRate={customErrorRate}
            customTimeoutRate={customTimeoutRate}
            customTimeoutMs={customTimeoutMs}
            customDownloadKbps={customDownloadKbps}
            message={message}
            onTargetBaseUrlChange={setTargetBaseUrlDraft}
            onSaveTargetBaseUrl={handleSaveTargetBaseUrl}
            onAddRule={addRuleRow}
            onUpdateRuleRow={updateRuleRow}
            onRemoveRuleRow={removeRuleRow}
            onSaveRules={handleSaveRules}
            onCustomProfileNameChange={setCustomProfileName}
            onCustomDelayMsChange={setCustomDelayMs}
            onCustomErrorRateChange={setCustomErrorRate}
            onCustomTimeoutRateChange={setCustomTimeoutRate}
            onCustomTimeoutMsChange={setCustomTimeoutMs}
            onCustomDownloadKbpsChange={setCustomDownloadKbps}
            onSaveCustomProfile={handleSaveCustomProfile}
          />
          <RequestLogsPanel logs={logs} />
        </Container>
      </Section>
    </main>
  );
};
