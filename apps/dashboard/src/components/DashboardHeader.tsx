import { Badge, Spinner } from '@florexlabs/ui';

type DashboardHeaderProps = {
  healthy: boolean;
  loading: boolean;
};

export const DashboardHeader = ({ healthy, loading }: DashboardHeaderProps) => {
  return (
    <header className="header">
      <div>
        <p className="eyebrow">Florex Labs</p>
        <h1>Chaos Internet Simulator</h1>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={healthy ? 'success' : 'danger'}>
          Control API: {healthy ? 'connected' : 'disconnected'}
        </Badge>
        {loading && <Spinner className="size-4 text-(--brand-700)" />}
      </div>
    </header>
  );
};
