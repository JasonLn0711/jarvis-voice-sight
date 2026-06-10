#!/usr/bin/env bash
set -euo pipefail

MODEL_ID="${BREEZE_ASR_MODEL_ID:-MediaTek-Research/Breeze-ASR-25}"
OUTPUT_DIR="${BREEZE_ASR_CT2_MODEL_PATH:-models/breeze-asr-25-ct2}"
QUANTIZATION="${BREEZE_ASR_CT2_QUANTIZATION:-float16}"

mkdir -p "$(dirname "$OUTPUT_DIR")"

ct2-transformers-converter \
  --model "$MODEL_ID" \
  --output_dir "$OUTPUT_DIR" \
  --copy_files tokenizer.json preprocessor_config.json \
  --quantization "$QUANTIZATION"

echo "Converted $MODEL_ID to $OUTPUT_DIR with quantization=$QUANTIZATION"
