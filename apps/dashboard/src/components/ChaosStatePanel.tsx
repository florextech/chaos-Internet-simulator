import { Button, Card } from '@florexlabs/ui';

import type { ChaosState, ProfileOption } from '../types';

type ChaosStatePanelProps = {
  state: ChaosState | null;
  profiles: ProfileOption[];
  loading: boolean;
  onToggle: () => Promise<void>;
  onProfileChange: (profileId: string) => Promise<void>;
};

export const ChaosStatePanel = ({
  state,
  profiles,
  loading,
  onToggle,
  onProfileChange,
}: ChaosStatePanelProps) => {
  if (!state) return null;

  return (
    <Card className="panel-top" padding="sm">
      <div className="row row-top">
        <div className="status-block">
          <p className="label">Chaos status</p>
          <p className={state.enabled ? 'state-on' : 'state-off'}>
            {state.enabled ? 'Enabled' : 'Disabled'}
          </p>
          {state.scenario && <p className="label">Scenario: {state.scenario.name}</p>}
        </div>
        <Button variant="primary" onClick={onToggle} disabled={loading}>
          {state.enabled ? 'Disable chaos' : 'Enable chaos'}
        </Button>
      </div>
      <div className="row">
        <p className="label">Profile</p>
        <div className="profile-select-wrap">
          <select
            className="profile-select"
            aria-label="Active chaos profile"
            value={state.profileId}
            onChange={(event) => onProfileChange(event.target.value)}
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
    </Card>
  );
};
