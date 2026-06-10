#!/usr/bin/env bash
set -euo pipefail

ASR_MODEL_DIR="${BREEZE_ASR_CT2_MODEL_PATH:-models/breeze-asr-25-ct2}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
OLLAMA_DOCKER_CONTAINER="${OLLAMA_DOCKER_CONTAINER:-jarvis-ollama}"
OLLAMA_RUNTIME="${OLLAMA_RUNTIME:-native}"
OLLAMA_BIN="${OLLAMA_BIN:-.local/ollama/extract/bin/ollama}"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-.local/ollama/models}"
OLLAMA_LOG="${OLLAMA_LOG:-.jarvis-ollama-native.log}"
OPENAI_TTS_BASE_URL="${OPENAI_TTS_BASE_URL:-http://localhost:9003/v1}"
BREEZYVOICE_REPO_PATH="${BREEZYVOICE_REPO_PATH:-../BreezyVoice}"
BREEZYVOICE_PROMPT_AUDIO="${BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH:-.local/voice-prompts/260610_0127_record_prompt_6s.wav}"
BREEZYVOICE_PROMPT_TEXT="${BREEZYVOICE_SPEAKER_PROMPT_TEXT:-}"
BREEZYVOICE_PROMPT_TEXT_FILE="${BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE:-.local/voice-prompts/260610_0127_record_prompt_6s.txt}"
TTS_SERVICE_URL="${TTS_SERVICE_URL:-http://localhost:8003}"

echo "Jarvis real-model preflight"
failures=0

gpu_compute_pids() {
  nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null | tr -d ' ' || true
}

port_pids() {
  local port="$1"
  fuser "${port}/tcp" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true
}

check_port_gpu_process() {
  local label="$1"
  local port="$2"
  local pids gpu_pids pid
  pids="$(port_pids "$port")"
  gpu_pids="$(gpu_compute_pids)"
  if [[ -z "$pids" ]]; then
    echo "MISS $label service is not listening on port $port"
    failures=$((failures + 1))
    return
  fi
  for pid in $pids; do
    if grep -qx "$pid" <<<"$gpu_pids"; then
      echo "OK  $label service PID $pid is using the RTX GPU"
      return
    fi
  done
  echo "MISS $label service is reachable but no port PID is visible in RTX GPU compute processes"
  failures=$((failures + 1))
}

if nvidia-smi >/dev/null 2>&1; then
  echo "OK  NVIDIA RTX GPU visible to host"
else
  echo "MISS NVIDIA RTX GPU is not visible to host"
  failures=$((failures + 1))
fi

if [[ -x .venv-asr/bin/python ]] && .venv-asr/bin/python - <<'PY'
try:
    import torch
    raise SystemExit(0 if torch.cuda.is_available() else 1)
except Exception:
    raise SystemExit(1)
PY
then
  echo "OK  ASR venv torch CUDA is available"
else
  echo "MISS ASR venv torch CUDA is not available"
  failures=$((failures + 1))
fi

if [[ -d "$ASR_MODEL_DIR" ]]; then
  echo "OK  Breeze-ASR-25 CT2 model directory: $ASR_MODEL_DIR"
else
  echo "MISS Breeze-ASR-25 CT2 model directory: $ASR_MODEL_DIR"
  echo "     Run: scripts/convert_breeze_asr_ct2.sh"
  failures=$((failures + 1))
fi

if [[ "${BREEZE_ASR_DEVICE:-cuda}" == "cuda" ]]; then
  echo "OK  ASR device policy: cuda"
else
  echo "MISS ASR must run on cuda, got BREEZE_ASR_DEVICE=${BREEZE_ASR_DEVICE:-unset}"
  failures=$((failures + 1))
fi

if curl -fsS "${ASR_SERVICE_URL:-http://localhost:8001}/health" >/dev/null 2>&1; then
  echo "OK  ASR service reachable: ${ASR_SERVICE_URL:-http://localhost:8001}"
  check_port_gpu_process "ASR" 8001
else
  echo "MISS ASR service not reachable: ${ASR_SERVICE_URL:-http://localhost:8001}"
  failures=$((failures + 1))
fi

if [[ "$OLLAMA_RUNTIME" == "native" ]]; then
  if [[ -x "$OLLAMA_BIN" ]]; then
    echo "OK  Native Ollama binary found: $OLLAMA_BIN"
  else
    echo "MISS Native Ollama binary not found: $OLLAMA_BIN"
    failures=$((failures + 1))
  fi
  if [[ -d "$OLLAMA_MODELS_DIR" ]]; then
    echo "OK  Native Ollama model store: $OLLAMA_MODELS_DIR"
  else
    echo "MISS Native Ollama model store not found: $OLLAMA_MODELS_DIR"
    failures=$((failures + 1))
  fi
  if [[ -f "$OLLAMA_LOG" ]] && grep -q 'library=CUDA' "$OLLAMA_LOG" && grep -q 'RTX' "$OLLAMA_LOG"; then
    echo "OK  Native Ollama detected RTX CUDA backend"
  else
    echo "MISS Native Ollama RTX CUDA backend not confirmed in $OLLAMA_LOG"
    echo "     Run: npm run real:start-ollama and check that the log reports library=CUDA"
    failures=$((failures + 1))
  fi
  if [[ -x "$OLLAMA_BIN" ]] && env OLLAMA_HOST="${OLLAMA_BASE_URL#http://}" OLLAMA_MODELS="$(realpath -m "$OLLAMA_MODELS_DIR")" "$OLLAMA_BIN" list | awk '{print $1}' | grep -qx "$OLLAMA_MODEL"; then
    echo "OK  Native Ollama model found: $OLLAMA_MODEL"
  else
    echo "MISS Native Ollama model not found: $OLLAMA_MODEL"
    echo "     Run: npm run real:pull-gemma"
    failures=$((failures + 1))
  fi
else
  if docker run --rm --gpus all ollama/ollama:latest nvidia-smi >/dev/null 2>&1; then
    echo "OK  Docker GPU runtime available"
  else
    echo "MISS Docker GPU runtime unavailable"
    failures=$((failures + 1))
  fi

  if docker ps --format '{{.Names}}' | grep -qx "$OLLAMA_DOCKER_CONTAINER"; then
    echo "OK  Ollama Docker container running: $OLLAMA_DOCKER_CONTAINER"
    if docker exec "$OLLAMA_DOCKER_CONTAINER" nvidia-smi >/dev/null 2>&1; then
      echo "OK  Ollama Docker container has RTX GPU access"
    else
      echo "MISS Ollama Docker container does not have GPU access"
      failures=$((failures + 1))
    fi
    if docker exec "$OLLAMA_DOCKER_CONTAINER" ollama list | awk '{print $1}' | grep -qx "$OLLAMA_MODEL"; then
      echo "OK  Ollama Docker model found: $OLLAMA_MODEL"
    else
      echo "MISS Ollama Docker model not found: $OLLAMA_MODEL"
      echo "     Run: npm run real:pull-gemma"
      failures=$((failures + 1))
    fi
  else
    echo "MISS Ollama Docker container not found: $OLLAMA_DOCKER_CONTAINER"
    failures=$((failures + 1))
  fi
fi

if curl -fsS "$OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
  echo "OK  Ollama server reachable: $OLLAMA_BASE_URL"
  if gpu_compute_pids | while read -r pid; do ps -p "$pid" -o args= 2>/dev/null; done | grep -q 'ollama/.*/llama-server\|ollama/llama-server\|llama-server'; then
    echo "OK  Ollama llama-server is using the RTX GPU"
  else
    echo "WARN Ollama runner is not currently loaded; running a short GPU warmup generation"
    if curl -fsS --max-time 120 "${OLLAMA_BASE_URL%/}/api/chat" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"$OLLAMA_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"請用繁中回一句短句。\"}],\"stream\":false,\"think\":false,\"options\":{\"num_predict\":8}}" >/dev/null 2>&1 &&
      gpu_compute_pids | while read -r pid; do ps -p "$pid" -o args= 2>/dev/null; done | grep -q 'ollama/.*/llama-server\|ollama/llama-server\|llama-server'; then
      echo "OK  Ollama llama-server is using the RTX GPU after warmup"
    else
      echo "MISS Ollama server reachable but no llama-server is visible in RTX GPU compute processes"
      failures=$((failures + 1))
    fi
  fi
else
  echo "MISS Ollama server not reachable: $OLLAMA_BASE_URL"
  echo "     Run: ollama serve or npm run real:start-ollama"
  failures=$((failures + 1))
fi

if [[ -x "$BREEZYVOICE_REPO_PATH/.venv/bin/python" ]] && "$BREEZYVOICE_REPO_PATH/.venv/bin/python" - <<'PY'
import torch
raise SystemExit(0 if torch.cuda.is_available() else 1)
PY
then
  echo "OK  BreezyVoice venv torch CUDA is available"
else
  echo "MISS BreezyVoice venv torch CUDA is not available"
  failures=$((failures + 1))
fi

if [[ -f "$BREEZYVOICE_PROMPT_AUDIO" ]]; then
  echo "OK  BreezyVoice prompt audio found: $BREEZYVOICE_PROMPT_AUDIO"
else
  echo "MISS BreezyVoice prompt audio not found: $BREEZYVOICE_PROMPT_AUDIO"
  failures=$((failures + 1))
fi

if [[ -n "$BREEZYVOICE_PROMPT_TEXT" ]]; then
  echo "OK  BreezyVoice prompt text provided through BREEZYVOICE_SPEAKER_PROMPT_TEXT"
elif [[ -s "$BREEZYVOICE_PROMPT_TEXT_FILE" ]]; then
  echo "OK  BreezyVoice prompt text file found: $BREEZYVOICE_PROMPT_TEXT_FILE"
else
  echo "MISS BreezyVoice prompt text is required for coherent zero-shot voice cloning"
  echo "     Set BREEZYVOICE_SPEAKER_PROMPT_TEXT or BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE."
  failures=$((failures + 1))
fi

if curl -fsS "${OPENAI_TTS_BASE_URL%/}/models" >/dev/null 2>&1; then
  echo "OK  BreezyVoice OpenAI-compatible upstream reachable: $OPENAI_TTS_BASE_URL"
  check_port_gpu_process "BreezyVoice" 9003
else
  echo "MISS BreezyVoice upstream not confirmed at: $OPENAI_TTS_BASE_URL"
  echo "     Start BreezyVoice's OpenAI-compatible service and expose it on this base URL."
  failures=$((failures + 1))
fi

if tts_health="$(curl -fsS "${TTS_SERVICE_URL%/}/health" 2>/dev/null)"; then
  if grep -q '"warmupCacheExists":true' <<<"$tts_health"; then
    echo "OK  TTS warmup cache exists"
  else
    echo "WARN TTS warmup cache is not present yet"
  fi
else
  echo "WARN TTS wrapper health not reachable for warmup cache check: $TTS_SERVICE_URL"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Preflight failed with $failures GPU-only readiness issue(s)."
  exit 1
fi
