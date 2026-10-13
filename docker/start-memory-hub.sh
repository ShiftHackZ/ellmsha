#!/usr/bin/env bash
set -euo pipefail
# Compatible with the source-stack instance/config and persistent volume layout.
mkdir -p /app/panel/config "${KNOWLEDGE_DATA_DIR:-/data/knowledge}"
export METADATA_INSTANCES_CONFIG=/app/panel/config/metadata-instances.json
if [[ ! -f "$METADATA_INSTANCES_CONFIG" ]]; then
  : "${REMOTE_INSTANCE_URL:?Mount metadata-instances.json or set REMOTE_INSTANCE_URL}"
  : "${REMOTE_INSTANCE_KEY:?Mount metadata-instances.json or set REMOTE_INSTANCE_KEY}"
  node --input-type=module <<'JS'
import fs from 'node:fs';
const e = process.env;
const instance = { id: e.REMOTE_INSTANCE_ID || 'default', name: e.REMOTE_INSTANCE_NAME || 'default', gateway_endpoint: e.REMOTE_INSTANCE_URL, api_key: e.REMOTE_INSTANCE_KEY };
if (e.REMOTE_INSTANCE_PROXY_URL) instance.proxy_endpoint = e.REMOTE_INSTANCE_PROXY_URL;
fs.writeFileSync(e.METADATA_INSTANCES_CONFIG, JSON.stringify({ instances: [instance] }), { mode: 0o600 });
JS
fi
export API_PREFIX="${API_PREFIX:-/v3}"
export KNOWLEDGE_SERVICE_URL="http://127.0.0.1:${KNOWLEDGE_PORT:-8424}"
export KNOWLEDGE_PUBLIC_BASE_URL="${KNOWLEDGE_PUBLIC_BASE_URL:-$KNOWLEDGE_SERVICE_URL/v3}"
export TMC_CALLBACK_URL="${TMC_CALLBACK_URL:-http://127.0.0.1:${PANEL_PORT:-8125}}"
export UI_DIST_DIR=/app/panel/web/dist
pids=()
cleanup() { if ((${#pids[@]})); then kill "${pids[@]}" 2>/dev/null || true; wait "${pids[@]}" 2>/dev/null || true; fi; }
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
(cd /app/knowledge && PORT="${KNOWLEDGE_PORT:-8424}" exec node --import tsx src/server.ts) &
pids+=("$!")
ready=0
for ((i=0; i<120; i++)); do
  if curl -fsS "$KNOWLEDGE_SERVICE_URL/health" >/dev/null; then ready=1; break; fi
  kill -0 "${pids[0]}" 2>/dev/null || exit 1
  sleep 0.5
done
((ready)) || { echo 'Knowledge service readiness timed out' >&2; exit 1; }
(cd /app/panel && HOST=0.0.0.0 PORT="${PANEL_PORT:-8125}" exec node --import tsx src/index.ts) &
pids+=("$!")
# A child exit takes the combined container down; Docker performs its restart.
wait -n "${pids[@]}"
exit 1
