#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${TTS_TEST_PYTHON:-.venv-tts/bin/python}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "TTS test Python not found: $PYTHON_BIN" >&2
  echo "Create .venv-tts and install services/tts/requirements.txt before running the full test suite." >&2
  exit 1
fi

"$PYTHON_BIN" -m unittest services.tts.tests.test_cache
