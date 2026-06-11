#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VLLM_BASE_URL="${VLLM_BASE_URL:-http://localhost:8000/v1}"
VLLM_HOST="${VLLM_HOST:-0.0.0.0}"
VLLM_PORT="${VLLM_PORT:-8000}"
VLLM_MODEL="${VLLM_MODEL:-google/gemma-4-E2B-it}"
VLLM_SERVED_MODEL_NAME="${VLLM_SERVED_MODEL_NAME:-$VLLM_MODEL}"
VLLM_EXTRA_ARGS="${VLLM_EXTRA_ARGS:---max-model-len 8192 --trust-remote-code}"
VLLM_LOG="${VLLM_LOG:-.jarvis-vllm.log}"

if curl -fsS "${VLLM_BASE_URL%/}/models" >/dev/null 2>&1; then
  echo "OK  vLLM OpenAI-compatible server already reachable: $VLLM_BASE_URL"
  exit 0
fi

if [[ -n "${VLLM_START_COMMAND:-}" ]]; then
  echo "RUN vLLM via VLLM_START_COMMAND"
  nohup bash -lc "$VLLM_START_COMMAND" > "$VLLM_LOG" 2>&1 &
elif command -v vllm >/dev/null 2>&1; then
  echo "RUN vLLM OpenAI-compatible server: $VLLM_MODEL"
  # shellcheck disable=SC2086
  nohup vllm serve "$VLLM_MODEL" \
    --host "$VLLM_HOST" \
    --port "$VLLM_PORT" \
    --served-model-name "$VLLM_SERVED_MODEL_NAME" \
    $VLLM_EXTRA_ARGS \
    > "$VLLM_LOG" 2>&1 &
elif [[ -x ".venv-vllm/bin/vllm" ]]; then
  echo "RUN vLLM OpenAI-compatible server from .venv-vllm: $VLLM_MODEL"
  # shellcheck disable=SC2086
  nohup .venv-vllm/bin/vllm serve "$VLLM_MODEL" \
    --host "$VLLM_HOST" \
    --port "$VLLM_PORT" \
    --served-model-name "$VLLM_SERVED_MODEL_NAME" \
    $VLLM_EXTRA_ARGS \
    > "$VLLM_LOG" 2>&1 &
else
  echo "FAIL vLLM runtime is not launchable. Install vllm, create .venv-vllm, or set VLLM_START_COMMAND." >&2
  exit 1
fi

for _ in $(seq 1 90); do
  if curl -fsS "${VLLM_BASE_URL%/}/models" >/dev/null 2>&1; then
    echo "OK  vLLM OpenAI-compatible server reachable: $VLLM_BASE_URL"
    exit 0
  fi
  sleep 2
done

echo "FAIL vLLM did not become reachable at ${VLLM_BASE_URL%/}/models. See $VLLM_LOG" >&2
exit 1
