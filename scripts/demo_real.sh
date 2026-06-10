#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="${DEMO_LOG_DIR:-.local/demo-real}"
mkdir -p "$LOG_DIR"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

load_env_file ".env.real.example"
load_env_file ".env"
load_env_file ".env.real"

DEMO_LLM_RUNTIME="${LLM_RUNTIME:-ollama}"
if [[ -z "${LLM_RUNTIME+x}" && "${LLM_PROVIDER:-ollama}" == "vllm" ]]; then
  DEMO_LLM_RUNTIME="vllm"
fi

start_bg_once() {
  local name="$1"
  shift
  local pattern="$*"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "OK  $name already running"
    return
  fi
  echo "RUN $name"
  setsid "$@" > "$LOG_DIR/${name}.log" 2>&1 &
}

wait_for_url() {
  local label="$1"
  local url="$2"
  local attempts="${3:-45}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "OK  $label reachable: $url"
      return 0
    fi
    sleep 1
  done
  echo "FAIL $label not reachable: $url" >&2
  return 1
}

start_bg_when_unhealthy() {
  local name="$1"
  local health_url="$2"
  shift 2
  if curl -fsS "$health_url" >/dev/null 2>&1; then
    echo "OK  $name already healthy: $health_url"
    return
  fi
  start_bg_once "$name" "$@"
}

echo "Starting Jarvis real demo services..."

if [[ "$DEMO_LLM_RUNTIME" == "vllm" || "${LLM_PROVIDER:-ollama}" == "vllm" ]]; then
  wait_for_url "vLLM OpenAI-compatible server" "${VLLM_BASE_URL:-http://localhost:8000/v1}/models" 10
else
  npm run real:start-ollama
fi
npm run real:start-asr
npm run real:start-breezyvoice

start_bg_when_unhealthy "llm-wrapper" "http://localhost:8002/health" bash -lc \
  "cd services/llm && exec env LLM_RUNTIME='${DEMO_LLM_RUNTIME}' OLLAMA_BASE_URL='${OLLAMA_BASE_URL:-http://localhost:11434}' OLLAMA_MODEL='${OLLAMA_MODEL:-gemma4:e2b}' VLLM_BASE_URL='${VLLM_BASE_URL:-http://localhost:8000/v1}' VLLM_MODEL='${VLLM_MODEL:-gemma-4-e2b}' ../../.venv-llm/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 8002"

start_bg_when_unhealthy "tts-wrapper" "http://localhost:8003/health" bash -lc \
  "cd services/tts && exec env TTS_RUNTIME='${TTS_RUNTIME:-openai_compatible}' OPENAI_TTS_BASE_URL='${OPENAI_TTS_BASE_URL:-http://localhost:9003/v1}' OPENAI_TTS_MODEL='${OPENAI_TTS_MODEL:-breezyvoice}' BREEZYVOICE_CACHE_DIR='${BREEZYVOICE_CACHE_DIR:-/tmp/jarvis-breezyvoice-audio/cache}' ../../.venv-tts/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 8003"

start_bg_once "orchestrator" npm run dev -w services/orchestrator
start_bg_once "web" npm run dev -w apps/web

echo "Waiting for Jarvis demo services..."
wait_for_url "LLM wrapper" "http://localhost:8002/health"
wait_for_url "TTS wrapper" "http://localhost:8003/health"
wait_for_url "orchestrator" "http://localhost:3000/api/v1/health"
wait_for_url "web UI" "http://localhost:3001"

npm run real:health
npm run real:preflight

echo "Ready for Demo"
echo "Web UI: http://localhost:3001"
echo "Orchestrator: http://localhost:3000"
