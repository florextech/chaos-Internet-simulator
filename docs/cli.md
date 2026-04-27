# CLI Guide

The CLI app lives in `apps/cli` and exposes command `chaos-net`.

## Build

From repo root:

```bash
pnpm --filter @florextech/chaos-net build
```

## Base Usage

From repo root:

```bash
pnpm --filter @florextech/chaos-net exec chaos-net <command>
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

## Record and replay

- `chaos-net record start`
- `chaos-net record stop`
- `chaos-net replay <recordingFile>`
- `chaos-net replay off`

## Examples

```bash
pnpm --filter @florextech/chaos-net exec chaos-net status
pnpm --filter @florextech/chaos-net exec chaos-net start
pnpm --filter @florextech/chaos-net exec chaos-net profile unstable-api
pnpm --filter @florextech/chaos-net exec chaos-net logs
pnpm --filter @florextech/chaos-net exec chaos-net scenario bad-mobile-network
pnpm --filter @florextech/chaos-net exec chaos-net scenario off
pnpm --filter @florextech/chaos-net exec chaos-net record start
pnpm --filter @florextech/chaos-net exec chaos-net record stop
pnpm --filter @florextech/chaos-net exec chaos-net replay sample.json
pnpm --filter @florextech/chaos-net exec chaos-net replay off
pnpm --filter @florextech/chaos-net exec chaos-net off
```

## Error Handling

If proxy control API is down, CLI returns clear connection errors.

Typical fixes:

- Start proxy app
- Verify `CHAOS_CONTROL_API_URL`
- Ensure port `8081` is reachable
