# Developer Workflows

This guide shows how to use Chaos Internet Simulator with common developer tools.

## cURL

Run proxy request:

```bash
curl -x http://localhost:8080 https://jsonplaceholder.typicode.com/posts/1
```

Run all curated cURL examples:

```bash
bash examples/curl_examples.sh
```

## Postman

1. Import file `examples/postman_collection.json`
2. Configure Postman proxy:
   - host: `localhost`
   - port: `8080`
3. Run collection requests

## Axios (Node.js)

Install dependency:

```bash
pnpm add axios
```

Run:

```bash
pnpm tsx examples/node-axios-example.ts
```

## fetch (Node.js + undici)

Install dependency:

```bash
pnpm add undici
```

Run:

```bash
pnpm tsx examples/node-fetch-example.ts
```

## HTTP_PROXY and HTTPS_PROXY

Many developer tools can use proxy environment variables:

```bash
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080
```

Then run your app/tests and outgoing traffic should traverse the chaos proxy.

For a single command:

```bash
HTTP_PROXY=http://localhost:8080 HTTPS_PROXY=http://localhost:8080 pnpm test
```
