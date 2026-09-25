#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"
TMP_DIR="${TMPDIR:-/tmp}/bend2craft-smoke-$$"
LOG_FILE="$TMP_DIR/dev.log"
INDEX_FILE="$TMP_DIR/index.html"
SERVER_PID=""

run_followup() {
  if [[ "${1:-}" == "--browser" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/browser-smoke.mjs" "$BASE_URL"
  elif [[ "${1:-}" == "--lighting" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/lighting-smoke.mjs" "$BASE_URL"
  elif [[ "${1:-}" == "--streaming" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/streaming-smoke.mjs" "$BASE_URL" 6
  elif [[ "${1:-}" == "--webgpu" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/webgpu-smoke.mjs" "$BASE_URL"
  elif [[ "${1:-}" == "--visual-quality" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/visual-quality-smoke.mjs" "$BASE_URL"
  elif [[ "${1:-}" == "--renderer-benchmark" ]]; then
    bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/renderer-benchmark.mjs" "$BASE_URL"
  fi
}

mkdir -p "$TMP_DIR"

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

if curl --max-time 2 -fsS "$BASE_URL/" -o "$INDEX_FILE" 2>/dev/null; then
  printf 'dev server already ready at %s/\n' "$BASE_URL"
  run_followup "${1:-}"
  exit 0
fi

setsid bash "$ROOT/scripts/run-bun.sh" "$ROOT/scripts/dev-server.ts" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for attempt in $(seq 1 30); do
  if curl --max-time 2 -fsS "$BASE_URL/" -o "$INDEX_FILE" 2>/dev/null; then
    printf 'dev server ready at %s/ on attempt %s\n' "$BASE_URL" "$attempt"
    run_followup "${1:-}"
    exit 0
  fi
  sleep 1
done

printf 'dev server did not become ready within 30 seconds\n' >&2
printf 'server log: %s\n' "$LOG_FILE" >&2
exit 1
