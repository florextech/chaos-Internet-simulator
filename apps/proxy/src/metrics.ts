import type { ProxyLogEntry } from './app.js';

export type ProxyMetricsSnapshot = {
  totalRequests: number;
  delayedRequests: number;
  erroredRequests: number;
  timedOutRequests: number;
  throttledRequests: number;
  droppedConnections: number;
  averageResponseTimeMs: number;
  activeProfile: string;
  activeScenario: string | null;
  chaosEnabled: boolean;
};

type RuntimeState = {
  profileId: string;
  enabled: boolean;
  scenario: { name: string } | null;
};

export const createProxyMetricsCollector = () => {
  let totalRequests = 0;
  let delayedRequests = 0;
  let erroredRequests = 0;
  let timedOutRequests = 0;
  let throttledRequests = 0;
  let droppedConnections = 0;
  let totalResponseTimeMs = 0;

  const record = (entry: ProxyLogEntry, responseTimeMs: number): void => {
    totalRequests += 1;
    totalResponseTimeMs += Math.max(0, responseTimeMs);
    if (entry.delayApplied) delayedRequests += 1;
    if (entry.errorApplied) erroredRequests += 1;
    if (entry.timeoutApplied) timedOutRequests += 1;
    if (entry.throttlingApplied) throttledRequests += 1;
    if (entry.droppedConnectionApplied) droppedConnections += 1;
  };

  const snapshot = (state: RuntimeState): ProxyMetricsSnapshot => ({
    totalRequests,
    delayedRequests,
    erroredRequests,
    timedOutRequests,
    throttledRequests,
    droppedConnections,
    averageResponseTimeMs: totalRequests === 0 ? 0 : Number((totalResponseTimeMs / totalRequests).toFixed(2)),
    activeProfile: state.profileId,
    activeScenario: state.scenario?.name ?? null,
    chaosEnabled: state.enabled,
  });

  return {
    record,
    snapshot,
  };
};
