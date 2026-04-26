# Chaos Internet Simulator

Chaos Internet Simulator is a local open source tool to simulate real network failures while developing and testing apps.

## Problem it solves

Local development usually runs on perfect internet. Production does not.

This project helps you reproduce:

- slow navigation
- unstable APIs
- intermittent failures
- high latency
- random upstream errors
- timeouts
- airport-like WiFi behavior
- slow mobile-like connectivity

## Monorepo structure

```text
chaos-Internet-simulator/
├── apps/
│   ├── proxy/
│   └── dashboard/
├── packages/
│   ├── core/
│   └── presets/
├── examples/
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── LICENSE
├── CONTRIBUTING.md
└── README.md
```

## Installation

```bash
pnpm install
```

## Local usage

1. Copy env vars:

```bash
cp .env.example .env
```

2. Run all apps in dev:

```bash
pnpm dev
```

3. Open:

- Dashboard: `http://localhost:3000`
- Proxy: `http://localhost:8080`
- Control API: `http://localhost:8081`

## Docker usage

```bash
docker compose up --build
```

## CLI usage

The workspace includes a CLI app at `apps/cli` with command name `chaos-net`.

Build it:

```bash
pnpm --filter @chaos-internet-simulator/cli build
```

Run from workspace:

```bash
pnpm --filter @chaos-internet-simulator/cli exec chaos-net status
pnpm --filter @chaos-internet-simulator/cli exec chaos-net start
pnpm --filter @chaos-internet-simulator/cli exec chaos-net off
pnpm --filter @chaos-internet-simulator/cli exec chaos-net profile unstable-api
pnpm --filter @chaos-internet-simulator/cli exec chaos-net logs
```

Optional CLI env var:

- `CHAOS_CONTROL_API_URL` (default: `http://localhost:8081`)

## Example with curl

```bash
curl -x http://localhost:8080 https://jsonplaceholder.typicode.com/posts
```

## Control API

- `GET /health`
- `GET /state`
- `POST /state/enabled`
- `POST /state/profile`
- `POST /state/rules`
- `GET /logs`

### Per-route chaos rules

You can define profile rules that match a request URL. If a rule matches, that profile is used; if not,
the global active profile is used.

Example:

```json
{
  "rules": [
    {
      "match": "jsonplaceholder.typicode.com/posts",
      "profile": "slow-3g"
    },
    {
      "match": "/payments",
      "profile": "unstable-api"
    }
  ]
}
```

Update rules at runtime:

```bash
curl -X POST http://localhost:8081/state/rules \
  -H "content-type: application/json" \
  -d '{"rules":[{"match":"jsonplaceholder.typicode.com/posts","profile":"slow-3g"},{"match":"/payments","profile":"unstable-api"}]}'
```

Matching mode is simple string matching (no regex): domain, path, or substring in full URL.

## Environment variables

- `TARGET_BASE_URL` (default: `https://jsonplaceholder.typicode.com`)
- `PROXY_PORT` (default: `8080`)
- `CONTROL_PORT` (default: `8081`)
- `VITE_CONTROL_API_URL` (default: `http://localhost:8081`)
- `CHAOS_CONTROL_API_URL` (default: `http://localhost:8081`)

## Available presets

- `slow-3g`
  - delayMs: 2500
  - errorRatePercent: 2
  - timeoutRatePercent: 1
  - timeoutMs: 10000
- `airport-wifi`
  - delayMs: 4000
  - errorRatePercent: 8
  - timeoutRatePercent: 5
  - timeoutMs: 12000
- `unstable-api`
  - delayMs: 1200
  - errorRatePercent: 25
  - timeoutRatePercent: 10
  - timeoutMs: 8000
- `total-chaos`
  - delayMs: 5000
  - errorRatePercent: 40
  - timeoutRatePercent: 25
  - timeoutMs: 15000

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm format`

## Roadmap

- Per-route chaos rules
- Traffic recording and replay
- Team-shared chaos profiles
- Auth + API keys for remote environments
- More mobile/network presets

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
