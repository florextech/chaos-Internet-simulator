# Plugin System

Chaos Internet Simulator supports local runtime plugins loaded from:

- `./plugins`

If plugin loading or execution fails, proxy continues running and errors are captured in request logs.

## Contract

Default export object:

```ts
export default {
  name: 'my-plugin',
  onRequest(ctx) {},
  onResponse(ctx) {},
};
```

Supported file extensions:

- `.js`
- `.mjs`
- `.cjs`
- `.ts` (when runtime supports it)

## Hooks

## `onRequest(ctx)`

Available capabilities:

- `ctx.forceError(statusCode?)`
- `ctx.addDelay(ms)`
- `ctx.skipChaos()`
- `ctx.setHeader(name, value)` (request header to upstream)
- `ctx.dropConnection()`

## `onResponse(ctx)`

Available capabilities:

- `ctx.setHeader(name, value)` (response header back to client)

## Safety behavior

- Plugin exceptions are isolated.
- A plugin crash does not stop proxy process.
- Plugin errors are attached to log entries as `pluginErrors`.

## Example Plugin

See:

- `plugins/random-auth-failure.example.ts`
