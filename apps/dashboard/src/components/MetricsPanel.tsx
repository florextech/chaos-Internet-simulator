import { Card } from '@florexlabs/ui';

import type { ProxyMetrics } from '../types';

type MetricsPanelProps = {
  metrics: ProxyMetrics | null;
};

const metricRows: Array<{ key: keyof ProxyMetrics; label: string }> = [
  { key: 'totalRequests', label: 'Total requests' },
  { key: 'averageResponseTimeMs', label: 'Avg response' },
  { key: 'erroredRequests', label: 'Errors' },
  { key: 'timedOutRequests', label: 'Timeouts' },
  { key: 'throttledRequests', label: 'Throttled' },
  { key: 'droppedConnections', label: 'Dropped tunnels' },
  { key: 'chaosEnabled', label: 'Chaos enabled' },
  { key: 'activeProfile', label: 'Active profile' },
  { key: 'activeScenario', label: 'Active scenario' },
];

export const MetricsPanel = ({ metrics }: MetricsPanelProps) => {
  if (!metrics) return null;

  return (
    <Card className="metrics-panel" padding="sm">
      <div className="logs-head">
        <h2>Metrics</h2>
      </div>
      <div className="metrics-grid">
        {metricRows.map(({ key, label }) => {
          const rawValue = metrics[key];
          let value: string | number = '-';

          if (key === 'averageResponseTimeMs') value = `${rawValue} ms`;
          else if (key === 'chaosEnabled') value = rawValue ? 'yes' : 'no';
          else if (rawValue === null) value = 'none';
          else value = rawValue as string | number;

          return (
            <div key={String(key)} className="metric-card">
              <p className="rule-label">{label}</p>
              <p>{value}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
