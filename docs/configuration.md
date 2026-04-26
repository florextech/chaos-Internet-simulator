# Configuration Guide

Chaos Internet Simulator supports config from:

1. environment variables
2. `chaos.config.json`
3. internal defaults

Priority order:

1. Environment variables
2. `chaos.config.json`
3. Internal defaults

## chaos.config.json

The proxy looks for `chaos.config.json` in current directory and parent directories.

Example file:

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
      "timeoutMs": 12000,
      "downloadKbps": 100
    }
  }
}
```

You can copy from:

- `examples/chaos.config.example.json`

## Environment Variables

- `TARGET_BASE_URL`
- `PROXY_PORT`
- `CONTROL_PORT`
- `VITE_CONTROL_API_URL`
- `CHAOS_CONTROL_API_URL`

## Presets vs Custom Profiles

- Presets come from `packages/presets`
- Custom profiles are user-defined
- Dashboard and API can create/update custom profiles at runtime

## URL Rule Tips

Keep rules simple:

- Match domain string when needed
- Match path prefix (like `/payments`)
- Avoid very broad match values unless intended

## Good Local Setup

1. Create `.env` from `.env.example`
2. Create `chaos.config.json` from example
3. Run `pnpm dev`
4. Validate state via `GET /state`
