# Dashboard Guide

The dashboard app lives in `apps/dashboard` and provides visual control over the proxy control API.

Default URL:

- `http://localhost:3000`

## Start in Development

From repo root:

```bash
pnpm --filter @chaos-internet-simulator/dashboard dev
```

## E2E Tests

Dashboard includes Playwright E2E tests with mocked Control API responses.

From repo root:

```bash
pnpm --filter @chaos-internet-simulator/dashboard exec playwright install chromium
pnpm --filter @chaos-internet-simulator/dashboard test:e2e
```

## Environment Variable

- `VITE_CONTROL_API_URL` (default: `http://localhost:8081`)

## Main Features

## UI Stack

Dashboard UI uses `@florexlabs/ui` primitives for consistency:

- `Button`
- `Card`
- `Badge`
- `Input`
- `Container`
- `Section`
- `Spinner`
- `EmptyState`

See [UI System Migration](./ui-system.md) for migration scope and remaining local UI pieces.

## Chaos controls

- View control API connection status
- Toggle chaos on/off
- Select active profile
- See active scenario (if running)

## Chaos configuration from web

- Update `targetBaseUrl`
- Add/update/remove URL matching rules
- Create or update custom profiles

## Request visibility

- Recent request table with status, profile, applied rule and throttling info

## Metrics overview

Dashboard includes real-time cards for:

- total requests
- average response time
- delayed/errored/timed out requests
- throttled requests
- dropped HTTPS tunnels
- active profile and scenario
- chaos enabled status

## Recommended Workflow

1. Open dashboard
2. Verify `Control API: connected`
3. Enable chaos
4. Pick a preset profile or save a custom profile
5. Add URL rule if you want selective chaos
6. Generate requests from your app or cURL
7. Watch logs update in dashboard

## Troubleshooting

## Dashboard shows disconnected

- Ensure proxy control API is running on expected port
- Check `VITE_CONTROL_API_URL`

## Profile updates fail

- Ensure profile exists (`GET /profiles`) before selecting it
- For custom profiles, verify numeric fields are valid

## Rules update fails

- Every rule needs:
  - non-empty `match`
  - existing `profile`
