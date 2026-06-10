#!/usr/bin/env bash
set -euo pipefail

OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
CONTAINER_NAME="${OLLAMA_DOCKER_CONTAINER:-jarvis-ollama}"
RUNTIME="${OLLAMA_RUNTIME:-native}"
OLLAMA_BIN="${OLLAMA_BIN:-.local/ollama/extract/bin/ollama}"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-.local/ollama/models}"

if [[ "$RUNTIME" == "native" ]]; then
  if [[ ! -x "$OLLAMA_BIN" ]]; then
    echo "Native Ollama binary not found: $OLLAMA_BIN" >&2
    echo "Run: npm run real:start-ollama after installing the local Ollama package." >&2
    exit 1
  fi
  mkdir -p "$OLLAMA_MODELS_DIR"
  OLLAMA_BIN_ABS="$(realpath "$OLLAMA_BIN")"
  OLLAMA_BIN_DIR="$(dirname "$OLLAMA_BIN_ABS")"
  OLLAMA_MODELS_ABS="$(realpath -m "$OLLAMA_MODELS_DIR")"
  env \
    OLLAMA_HOST="${OLLAMA_BASE_URL#http://}" \
    OLLAMA_MODELS="$OLLAMA_MODELS_ABS" \
    PATH="$OLLAMA_BIN_DIR:$PATH" \
    "$OLLAMA_BIN_ABS" pull "$OLLAMA_MODEL"
  exit 0
fi

if command -v ollama >/dev/null 2>&1; then
  ollama pull "$OLLAMA_MODEL"
  exit 0
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker exec "$CONTAINER_NAME" ollama pull "$OLLAMA_MODEL"
  exit 0
fi

if curl -fsS "$OLLAMA_BASE_URL/api/tags" >/dev/null 2>&1; then
  curl -fsS "$OLLAMA_BASE_URL/api/pull" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$OLLAMA_MODEL\"}"
  exit 0
fi

echo "No Ollama binary, container, or API server found. Run npm run real:start-ollama first." >&2
exit 1
