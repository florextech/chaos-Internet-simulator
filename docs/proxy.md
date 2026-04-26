# Proxy Guide

The proxy app lives in `apps/proxy` and has two servers:

- Traffic proxy server (default `:8080`)
- Control API server (default `:8081`)

## What It Simulates

For each request, the proxy can apply:

- `delayMs`
- `errorRatePercent`
- `timeoutRatePercent`
- `timeoutMs`
- `downloadKbps` (HTTP response throttling)

Chaos can be globally enabled/disabled and can be overridden by URL matching rules.

## Start in Development

From repo root:

```bash
pnpm --filter @chaos-internet-simulator/proxy dev
```

## Key Environment Variables

- `TARGET_BASE_URL`
- `PROXY_PORT`
- `CONTROL_PORT`

## Traffic Modes

## HTTP proxying

- Standard HTTP proxying is supported.
- Request method, headers, and body are forwarded upstream.
- Chaos decisions are applied before forwarding.

## HTTPS tunneling (CONNECT)

- Basic HTTPS tunneling is supported through `CONNECT`.
- The proxy tunnels encrypted traffic without MITM decryption.
- Viable chaos for `CONNECT`:
  - connection delay
  - simulated timeout
  - simulated connection drop before tunnel is established
- Not available without MITM:
  - per-path rewrite inside HTTPS payload
  - response body throttling at HTTP semantic level

## HTTPS limitations

- HTTPS payload is opaque (encrypted end-to-end).
- Rule matching can only use connect target (`host:port`), not decrypted path.
- Response body modifications are not possible in CONNECT mode.
- If you need per-route HTTPS manipulation, MITM support is required and currently out of scope.

## Control API Endpoints

## Health and state

- `GET /health`
- `GET /state`
- `POST /state/enabled`
- `POST /state/profile`
- `POST /state/target-base-url`

## Rules and profiles

- `POST /state/rules`
- `GET /profiles`
- `POST /profiles/custom`

## Observability and logs

- `GET /logs`
- `GET /metrics`

## Scenarios

- `GET /scenario`
- `GET /scenarios`
- `POST /scenario`
- `POST /scenario/off`

## Request Logs

Each log row includes:

- method
- url
- profile
- chaosEnabled
- delayApplied
- errorApplied
- timeoutApplied
- throttlingApplied
- downloadKbpsApplied
- appliedRule
- statusCode
- timestamp

## Metrics

`GET /metrics` returns:

- totalRequests
- delayedRequests
- erroredRequests
- timedOutRequests
- throttledRequests
- droppedConnections
- averageResponseTimeMs
- activeProfile
- activeScenario
- chaosEnabled

## URL Matching Rules

Rules are simple string matches (no regex):

- full URL contains text
- domain contains text
- path contains text

Example:

```json
{
  "rules": [
    { "match": "jsonplaceholder.typicode.com/posts", "profile": "slow-3g" },
    { "match": "/payments", "profile": "unstable-api" }
  ]
}
```

If no rule matches, global active profile is used.

## Example: Configure via cURL

Enable chaos:

```bash
curl -X POST http://localhost:8081/state/enabled \
  -H "content-type: application/json" \
  -d '{"enabled":true}'
```

Set profile:

```bash
curl -X POST http://localhost:8081/state/profile \
  -H "content-type: application/json" \
  -d '{"profileId":"unstable-api"}'
```

Set target base URL:

```bash
curl -X POST http://localhost:8081/state/target-base-url \
  -H "content-type: application/json" \
  -d '{"targetBaseUrl":"https://jsonplaceholder.typicode.com"}'
```

Make proxied request:

```bash
curl -x http://localhost:8080 https://jsonplaceholder.typicode.com/posts/1
```
