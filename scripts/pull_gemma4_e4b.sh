#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e4b}"
exec "$SCRIPT_DIR/pull_gemma4_e2b.sh" "$@"
