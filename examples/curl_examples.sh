#!/usr/bin/env bash

set -euo pipefail

CONTROL_API_URL="${CONTROL_API_URL:-http://localhost:8081}"
PROXY_URL="${PROXY_URL:-http://localhost:8080}"
TARGET_URL="${TARGET_URL:-https://jsonplaceholder.typicode.com}"

echo "Health check..."
curl -s "${CONTROL_API_URL}/health"
echo

echo "Enable chaos..."
curl -s -X POST "${CONTROL_API_URL}/state/enabled" \
  -H "content-type: application/json" \
  -d '{"enabled":true}'
echo

echo "Set profile unstable-api..."
curl -s -X POST "${CONTROL_API_URL}/state/profile" \
  -H "content-type: application/json" \
  -d '{"profileId":"unstable-api"}'
echo

echo "Set route rule for /posts..."
curl -s -X POST "${CONTROL_API_URL}/state/rules" \
  -H "content-type: application/json" \
  -d '{"rules":[{"match":"/posts","profile":"slow-3g"}]}'
echo

echo "Proxy request through CONNECT tunnel..."
curl -i -x "${PROXY_URL}" "${TARGET_URL}/posts/1"
echo

echo "Proxy metrics..."
curl -s "${CONTROL_API_URL}/metrics"
echo

echo "Recent logs..."
curl -s "${CONTROL_API_URL}/logs"
echo
