import { Badge, Card, EmptyState } from '@florexlabs/ui';

import type { RequestLog } from '../types';

type RequestLogsPanelProps = {
  logs: RequestLog[];
};

export const RequestLogsPanel = ({ logs }: RequestLogsPanelProps) => {
  return (
    <Card className="logs" padding="sm">
      <div className="logs-head">
        <h2>Recent Requests</h2>
        <Badge tone="brand">{logs.length} rows</Badge>
      </div>
      {logs.length === 0 ? (
        <EmptyState
          title="No requests yet."
          description="Send traffic through the proxy to inspect live request logs."
          className="py-10"
        />
      ) : (
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
                    <Badge tone={log.statusCode >= 400 ? 'danger' : 'success'}>
                      {log.statusCode}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
