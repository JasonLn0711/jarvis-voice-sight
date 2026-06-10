#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${OLLAMA_DOCKER_CONTAINER:-jarvis-ollama}"
PORT="${OLLAMA_DOCKER_PORT:-11434}"
IMAGE="${OLLAMA_DOCKER_IMAGE:-ollama/ollama:latest}"
USE_GPUS="${OLLAMA_DOCKER_GPUS:-all}"
RUNTIME="${OLLAMA_RUNTIME:-native}"
OLLAMA_BIN="${OLLAMA_BIN:-.local/ollama/extract/bin/ollama}"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-.local/ollama/models}"
OLLAMA_LOG="${OLLAMA_LOG:-.jarvis-ollama-native.log}"

if [[ "$RUNTIME" == "native" ]]; then
  if [[ ! -x "$OLLAMA_BIN" ]]; then
    echo "Native Ollama binary not found: $OLLAMA_BIN" >&2
    echo "Download https://ollama.com/download/ollama-linux-amd64.tar.zst and extract it under .local/ollama/extract." >&2
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1; then
    echo "Native Ollama already reachable on port $PORT"
    exit 0
  fi
  if pgrep -f "$(realpath "$OLLAMA_BIN") serve" >/dev/null 2>&1 || pgrep -f "$OLLAMA_BIN serve" >/dev/null 2>&1; then
    echo "Native Ollama already running with binary: $OLLAMA_BIN"
    exit 0
  fi
  mkdir -p "$OLLAMA_MODELS_DIR"
  OLLAMA_BIN_ABS="$(realpath "$OLLAMA_BIN")"
  OLLAMA_BIN_DIR="$(dirname "$OLLAMA_BIN_ABS")"
  OLLAMA_MODELS_ABS="$(realpath -m "$OLLAMA_MODELS_DIR")"
  setsid env \
    OLLAMA_HOST="127.0.0.1:${PORT}" \
    OLLAMA_MODELS="$OLLAMA_MODELS_ABS" \
    PATH="$OLLAMA_BIN_DIR:$PATH" \
    "$OLLAMA_BIN_ABS" serve > "$OLLAMA_LOG" 2>&1 &
  echo "Started native Ollama on port $PORT using RTX GPU-capable local package"
  exit 0
fi

if [[ "$USE_GPUS" != "all" ]]; then
  echo "GPU-only policy requires OLLAMA_DOCKER_GPUS=all." >&2
  exit 1
fi

if ! docker run --rm --gpus all "$IMAGE" nvidia-smi >/dev/null 2>&1; then
  echo "Docker GPU runtime is unavailable. Install/configure NVIDIA Container Toolkit before starting Ollama." >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  if docker exec "$CONTAINER_NAME" nvidia-smi >/dev/null 2>&1; then
    echo "Ollama Docker GPU container already running: $CONTAINER_NAME"
    exit 0
  fi
  echo "Existing Ollama container is not GPU-capable; recreating: $CONTAINER_NAME"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Removing stopped Ollama container so it can be recreated with --gpus all: $CONTAINER_NAME"
  docker rm "$CONTAINER_NAME" >/dev/null
fi

docker run -d \
  --gpus all \
  -v ollama:/root/.ollama \
  -p "$PORT:11434" \
  --name "$CONTAINER_NAME" \
  "$IMAGE" >/dev/null

echo "Started Ollama Docker container: $CONTAINER_NAME on port $PORT"
