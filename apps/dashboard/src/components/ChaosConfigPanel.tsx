import { Button, Card, Input } from '@florexlabs/ui';

import type { ProfileOption, ProfileRule } from '../types';

type ChaosConfigPanelProps = {
  loading: boolean;
  profiles: ProfileOption[];
  targetBaseUrlDraft: string;
  rulesDraft: ProfileRule[];
  customProfileName: string;
  customDelayMs: string;
  customErrorRate: string;
  customTimeoutRate: string;
  customTimeoutMs: string;
  customDownloadKbps: string;
  message: string | null;
  onTargetBaseUrlChange: (value: string) => void;
  onSaveTargetBaseUrl: () => Promise<void>;
  onAddRule: () => void;
  onUpdateRuleRow: (index: number, key: 'match' | 'profile', value: string) => void;
  onRemoveRuleRow: (index: number) => void;
  onSaveRules: () => Promise<void>;
  onCustomProfileNameChange: (value: string) => void;
  onCustomDelayMsChange: (value: string) => void;
  onCustomErrorRateChange: (value: string) => void;
  onCustomTimeoutRateChange: (value: string) => void;
  onCustomTimeoutMsChange: (value: string) => void;
  onCustomDownloadKbpsChange: (value: string) => void;
  onSaveCustomProfile: () => Promise<void>;
};

export const ChaosConfigPanel = ({
  loading,
  profiles,
  targetBaseUrlDraft,
  rulesDraft,
  customProfileName,
  customDelayMs,
  customErrorRate,
  customTimeoutRate,
  customTimeoutMs,
  customDownloadKbps,
  message,
  onTargetBaseUrlChange,
  onSaveTargetBaseUrl,
  onAddRule,
  onUpdateRuleRow,
  onRemoveRuleRow,
  onSaveRules,
  onCustomProfileNameChange,
  onCustomDelayMsChange,
  onCustomErrorRateChange,
  onCustomTimeoutRateChange,
  onCustomTimeoutMsChange,
  onCustomDownloadKbpsChange,
  onSaveCustomProfile,
}: ChaosConfigPanelProps) => {
  return (
    <Card className="config-panel" padding="sm">
      <div className="logs-head">
        <h2>Chaos Configuration</h2>
      </div>

      <div className="config-block">
        <p className="label">Target base URL</p>
        <div className="inline-form">
          <Input
            value={targetBaseUrlDraft}
            onChange={(event) => onTargetBaseUrlChange(event.target.value)}
            placeholder="https://jsonplaceholder.typicode.com"
            aria-label="Target base URL input"
            disabled={loading}
          />
          <Button variant="secondary" onClick={onSaveTargetBaseUrl} disabled={loading}>
            Save URL
          </Button>
        </div>
      </div>

      <div className="config-block">
        <div className="row row-inline">
          <p className="label">Rules by URL/domain/path</p>
          <Button variant="ghost" onClick={onAddRule} disabled={loading || profiles.length === 0}>
            + Add rule
          </Button>
        </div>
        <div className="rules-editor">
          {rulesDraft.length === 0 && <p className="label">No URL rules configured.</p>}
          {rulesDraft.map((rule, index) => (
            <div key={`${index}-${rule.match}-${rule.profile}`} className="rule-row">
              <Input
                value={rule.match}
                onChange={(event) => onUpdateRuleRow(index, 'match', event.target.value)}
                placeholder="/payments or api.example.com"
                aria-label={`Rule match ${index + 1}`}
                disabled={loading}
              />
              <div className="profile-select-wrap">
                <select
                  className="profile-select"
                  aria-label={`Rule profile ${index + 1}`}
                  value={rule.profile}
                  onChange={(event) => onUpdateRuleRow(index, 'profile', event.target.value)}
                  disabled={loading}
                >
                  {profiles.map((profile) => (
                    <option key={`rule-${index}-${profile.id}`} value={profile.id}>
                      {profile.id}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="ghost" onClick={() => onRemoveRuleRow(index)} disabled={loading}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" onClick={onSaveRules} disabled={loading}>
          Save rules
        </Button>
      </div>

      <div className="config-block">
        <p className="label">Custom profile</p>
        <div className="custom-grid">
          <Input
            value={customProfileName}
            onChange={(event) => onCustomProfileNameChange(event.target.value)}
            placeholder="profile-name"
            aria-label="Custom profile name"
            disabled={loading}
          />
          <Input
            type="number"
            min={0}
            value={customDelayMs}
            onChange={(event) => onCustomDelayMsChange(event.target.value)}
            placeholder="delayMs"
            aria-label="Custom delay ms"
            disabled={loading}
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={customErrorRate}
            onChange={(event) => onCustomErrorRateChange(event.target.value)}
            placeholder="errorRatePercent"
            aria-label="Custom error rate percent"
            disabled={loading}
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={customTimeoutRate}
            onChange={(event) => onCustomTimeoutRateChange(event.target.value)}
            placeholder="timeoutRatePercent"
            aria-label="Custom timeout rate percent"
            disabled={loading}
          />
          <Input
            type="number"
            min={0}
            value={customTimeoutMs}
            onChange={(event) => onCustomTimeoutMsChange(event.target.value)}
            placeholder="timeoutMs"
            aria-label="Custom timeout ms"
            disabled={loading}
          />
          <Input
            type="number"
            min={1}
            value={customDownloadKbps}
            onChange={(event) => onCustomDownloadKbpsChange(event.target.value)}
            placeholder="downloadKbps (optional)"
            aria-label="Custom download kbps"
            disabled={loading}
          />
        </div>
        <Button variant="secondary" onClick={onSaveCustomProfile} disabled={loading}>
          Save custom profile
        </Button>
      </div>

      {message && <p className="config-message">{message}</p>}
    </Card>
  );
};
