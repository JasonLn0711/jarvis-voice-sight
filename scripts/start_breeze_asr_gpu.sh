#!/usr/bin/env bash
set -euo pipefail

PORT="${ASR_PORT:-8001}"
PYTHON_BIN="${ASR_PYTHON:-.venv-asr/bin/python}"
MODEL_PATH="${BREEZE_ASR_CT2_MODEL_PATH:-models/breeze-asr-25-ct2}"
LOG_PATH="${ASR_LOG:-.jarvis-asr-real.log}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "ASR Python venv not found: $PYTHON_BIN" >&2
  exit 1
fi

if [[ ! -d "$MODEL_PATH" ]]; then
  echo "Breeze-ASR-25 CT2 model directory not found: $MODEL_PATH" >&2
  echo "Run: npm run real:convert-asr" >&2
  exit 1
fi

if ! "$PYTHON_BIN" - <<'PY'
import torch
raise SystemExit(0 if torch.cuda.is_available() else 1)
PY
then
  echo "GPU-only policy requires CUDA in $PYTHON_BIN" >&2
  exit 1
fi

if curl -fsS "http://localhost:${PORT}/health" >/dev/null 2>&1; then
  echo "Breeze-ASR-25 service already reachable on port $PORT"
  exit 0
fi

LIB_PATHS="$(find "$(dirname "$PYTHON_BIN")/../lib" -path '*/site-packages/nvidia/*/lib' -type d 2>/dev/null | paste -sd: -)"
if [[ "$MODEL_PATH" = /* ]]; then
  SERVICE_MODEL_PATH="$MODEL_PATH"
else
  SERVICE_MODEL_PATH="../../${MODEL_PATH}"
fi

(cd services/asr && setsid env \
  ASR_RUNTIME=breeze_asr_25 \
  BREEZE_ASR_CT2_MODEL_PATH="$SERVICE_MODEL_PATH" \
  BREEZE_ASR_DEVICE=cuda \
  BREEZE_ASR_COMPUTE_TYPE="${BREEZE_ASR_COMPUTE_TYPE:-int8_float16}" \
  LD_LIBRARY_PATH="${LIB_PATHS}:${LD_LIBRARY_PATH:-}" \
  "../../${PYTHON_BIN}" -m uvicorn src.server:app --host 0.0.0.0 --port "$PORT" > "../../${LOG_PATH}" 2>&1 &)

echo "Started Breeze-ASR-25 faster-whisper service on port $PORT with CUDA"
