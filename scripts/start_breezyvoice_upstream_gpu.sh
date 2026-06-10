#!/usr/bin/env bash
set -euo pipefail

BREEZYVOICE_REPO_PATH="${BREEZYVOICE_REPO_PATH:-../BreezyVoice}"
PORT="${BREEZYVOICE_PORT:-9003}"
PYTHON_BIN="${BREEZYVOICE_PYTHON:-.venv/bin/python}"
MODEL_PATH="${BREEZYVOICE_MODEL_PATH:-MediaTek-Research/BreezyVoice}"
PROMPT_AUDIO="${BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH:-.local/voice-prompts/260610_0127_record_prompt_6s.wav}"
PROMPT_TEXT="${BREEZYVOICE_SPEAKER_PROMPT_TEXT:-}"
PROMPT_TEXT_FILE="${BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE:-}"
REQUIRE_PROMPT_TEXT="${BREEZYVOICE_REQUIRE_PROMPT_TEXT:-true}"
RESTART="${BREEZYVOICE_RESTART:-false}"
LOG_PATH="${BREEZYVOICE_LOG:-.jarvis-breezyvoice-upstream.log}"

if [[ ! -d "$BREEZYVOICE_REPO_PATH" ]]; then
  echo "BreezyVoice repo not found: $BREEZYVOICE_REPO_PATH" >&2
  exit 1
fi

if [[ ! -x "$BREEZYVOICE_REPO_PATH/$PYTHON_BIN" ]]; then
  echo "BreezyVoice Python venv not found: $BREEZYVOICE_REPO_PATH/$PYTHON_BIN" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_AUDIO" ]]; then
  echo "Speaker prompt audio not found: $PROMPT_AUDIO" >&2
  exit 1
fi

if [[ -z "$PROMPT_TEXT" && -n "$PROMPT_TEXT_FILE" ]]; then
  if [[ ! -f "$PROMPT_TEXT_FILE" ]]; then
    echo "Speaker prompt text file not found: $PROMPT_TEXT_FILE" >&2
    exit 1
  fi
  PROMPT_TEXT="$(tr '\n' ' ' < "$PROMPT_TEXT_FILE" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
fi

if [[ -z "$PROMPT_TEXT" && "$REQUIRE_PROMPT_TEXT" == "true" ]]; then
  echo "BREEZYVOICE_SPEAKER_PROMPT_TEXT or BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE is required for coherent zero-shot voice cloning." >&2
  echo "The prompt text must match the speaker prompt audio." >&2
  exit 1
fi

NVRTC_DIR="$BREEZYVOICE_REPO_PATH/.venv/lib/python3.10/site-packages/nvidia/cuda_nvrtc/lib"
if [[ -f "$NVRTC_DIR/libnvrtc.so.11.2" && ! -e "$NVRTC_DIR/libnvrtc.so" ]]; then
  ln -sf libnvrtc.so.11.2 "$NVRTC_DIR/libnvrtc.so"
fi

if ! "$BREEZYVOICE_REPO_PATH/$PYTHON_BIN" - <<'PY'
import torch
raise SystemExit(0 if torch.cuda.is_available() else 1)
PY
then
  echo "GPU-only policy requires CUDA in BreezyVoice venv" >&2
  exit 1
fi

if curl -fsS "http://localhost:${PORT}/v1/models" >/dev/null 2>&1; then
  if [[ "$RESTART" == "true" ]]; then
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
      sleep 1
    else
      echo "BREEZYVOICE_RESTART=true was requested, but fuser is not available." >&2
      exit 1
    fi
  else
    echo "BreezyVoice upstream already reachable on port $PORT"
    exit 0
  fi
fi

LIB_PATHS="$(find "$BREEZYVOICE_REPO_PATH/.venv/lib/python3.10/site-packages/nvidia" -type d -name lib 2>/dev/null | paste -sd: -)"
ROOT_DIR="$(pwd)"
if [[ "$PROMPT_AUDIO" = /* ]]; then
  SERVICE_PROMPT_AUDIO="$PROMPT_AUDIO"
else
  SERVICE_PROMPT_AUDIO="$ROOT_DIR/$PROMPT_AUDIO"
fi

(cd "$BREEZYVOICE_REPO_PATH" && setsid env \
  model_path="$MODEL_PATH" \
  speaker_prompt_audio_path="$SERVICE_PROMPT_AUDIO" \
  speaker_prompt_text_transcription="$PROMPT_TEXT" \
  PYTHONUTF8=1 \
  LD_LIBRARY_PATH="${LIB_PATHS}:${LD_LIBRARY_PATH:-}" \
  "$PYTHON_BIN" -m uvicorn api:app --host 0.0.0.0 --port "$PORT" > "$ROOT_DIR/$LOG_PATH" 2>&1 &)

echo "Started BreezyVoice OpenAI-compatible upstream on port $PORT with CUDA"
