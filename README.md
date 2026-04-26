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

## Detailed docs

For detailed guides, see:

- `docs/README.md`
- `docs/proxy.md`
- `docs/dashboard.md`
- `docs/cli.md`
- `docs/configuration.md`

## Monorepo structure

```text
chaos-Internet-simulator/
├── apps/
│   ├── cli/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── dashboard/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── vitest.config.ts
│   └── proxy/
│       ├── src/
│       ├── test/
│       ├── package.json
│       ├── Dockerfile
│       └── vitest.config.ts
├── packages/
│   ├── core/
│   │   ├── src/
│   │   └── test/
│   └── presets/
│       └── src/
├── examples/
│   └── chaos.config.example.json
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
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
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario bad-mobile-network
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario off
```

Optional CLI env var:

- `CHAOS_CONTROL_API_URL` (default: `http://localhost:8081`)

## Example with curl

```bash
curl -x http://localhost:8080 https://jsonplaceholder.typicode.com/posts
```

More ready-to-run examples:

- `examples/curl_examples.sh`
- `examples/postman_collection.json`
- `examples/node-axios-example.ts`
- `examples/node-fetch-example.ts`
- `docs/developer-workflows.md`

Proxy environment variables:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
```

## Control API

- `GET /health`
- `GET /state`
- `POST /state/enabled`
- `POST /state/profile`
- `POST /state/rules`
- `POST /state/target-base-url`
- `GET /logs`
- `GET /metrics`
- `GET /profiles`
- `POST /profiles/custom`
- `GET /scenario`
- `GET /scenarios`
- `POST /scenario`
- `POST /scenario/off`

The dashboard can now configure:

- active target base URL
- per-route rules (domain/path/URL contains)
- custom profiles (create/update) without restarting proxy

## HTTPS support (basic)

- CONNECT tunneling is supported for HTTPS traffic.
- Chaos can apply delay, timeout, and connection drop before tunnel establishment.
- MITM is not implemented, so encrypted HTTPS payload cannot be inspected or rewritten.

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

### Network scenarios

Scenarios execute profile steps over time.

Available presets:

- `bad-mobile-network` (loop)
- `api-degrading` (non-loop)

Start scenario:

```bash
curl -X POST http://localhost:8081/scenario \
  -H "content-type: application/json" \
  -d '{"name":"bad-mobile-network"}'
```

Stop scenario:

```bash
curl -X POST http://localhost:8081/scenario/off
```

CLI:

```bash
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario bad-mobile-network
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario off
```

## Environment variables

- `TARGET_BASE_URL` (default: `https://jsonplaceholder.typicode.com`)
- `PROXY_PORT` (default: `8080`)
- `CONTROL_PORT` (default: `8081`)
- `VITE_CONTROL_API_URL` (default: `http://localhost:8081`)
- `CHAOS_CONTROL_API_URL` (default: `http://localhost:8081`)

## chaos.config.json

Proxy startup supports `chaos.config.json` loaded from current directory or nearest parent directory.

See full example at:

- `examples/chaos.config.example.json`

Supported fields:

- `enabled`
- `activeProfile`
- `targetBaseUrl`
- `proxyPort`
- `controlApiPort`
- `rules`
- `customProfiles`

Example:

```json
{
  "enabled": true,
  "activeProfile": "slow-3g",
  "targetBaseUrl": "https://jsonplaceholder.typicode.com",
  "proxyPort": 8080,
  "controlApiPort": 8081,
  "rules": [{ "match": "/posts", "profile": "slow-3g" }],
  "customProfiles": {
    "my-bad-network": {
      "delayMs": 3500,
      "errorRatePercent": 10,
      "timeoutRatePercent": 5,
      "timeoutMs": 12000
    }
  }
}
```

Priority for overlapping values:

1. Environment variables
2. `chaos.config.json`
3. Internal defaults

## Available presets

- `slow-3g`
  - delayMs: 2500
  - errorRatePercent: 2
  - timeoutRatePercent: 1
  - timeoutMs: 10000
  - downloadKbps: 50
- `airport-wifi`
  - delayMs: 4000
  - errorRatePercent: 8
  - timeoutRatePercent: 5
  - timeoutMs: 12000
  - downloadKbps: 120
- `unstable-api`
  - delayMs: 1200
  - errorRatePercent: 25
  - timeoutRatePercent: 10
  - timeoutMs: 8000
  - downloadKbps: 200
- `total-chaos`
  - delayMs: 5000
  - errorRatePercent: 40
  - timeoutRatePercent: 25
  - timeoutMs: 15000
  - downloadKbps: 40

## Bandwidth throttling

Profiles support `downloadKbps`.

When enabled, proxied HTTP responses are streamed slower to simulate low download bandwidth.

Current limitation:

- Throttling is applied to normal proxied HTTP responses.
- `CONNECT` HTTPS tunnels are not throttled at byte-stream level in this MVP; only delay/error/timeout rules apply there.

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
