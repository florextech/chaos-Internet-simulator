# CLI Guide

The CLI app lives in `apps/cli` and exposes command `chaos-net`.

## Build

From repo root:

```bash
pnpm --filter @chaos-internet-simulator/cli build
```

## Base Usage

From repo root:

```bash
pnpm --filter @chaos-internet-simulator/cli exec chaos-net <command>
```

## Environment Variable

- `CHAOS_CONTROL_API_URL` (default: `http://localhost:8081`)

## Available Commands

## Health and state

- `chaos-net status`
- `chaos-net start`
- `chaos-net off`

## Profiles and logs

- `chaos-net profile <profileName>`
- `chaos-net logs`

## Scenarios

- `chaos-net scenario <scenarioName>`
- `chaos-net scenario off`

## Examples

```bash
pnpm --filter @chaos-internet-simulator/cli exec chaos-net status
pnpm --filter @chaos-internet-simulator/cli exec chaos-net start
pnpm --filter @chaos-internet-simulator/cli exec chaos-net profile unstable-api
pnpm --filter @chaos-internet-simulator/cli exec chaos-net logs
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario bad-mobile-network
pnpm --filter @chaos-internet-simulator/cli exec chaos-net scenario off
pnpm --filter @chaos-internet-simulator/cli exec chaos-net off
```

## Error Handling

If proxy control API is down, CLI returns clear connection errors.

Typical fixes:

- Start proxy app
- Verify `CHAOS_CONTROL_API_URL`
- Ensure port `8081` is reachable
