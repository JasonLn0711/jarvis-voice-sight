# Jarvis Voice Sight Runbook

Status: Local demo and operations guide

## Local Mock Demo

Install dependencies:

```bash
npm install
```

Start the local demo:

```bash
npm run dev
```

Open:

```text
http://localhost:3001
```

The orchestrator runs at:

```text
http://localhost:3000
```

Use mock mode in the UI if microphone permission is unavailable.

## Health Check

```bash
curl http://localhost:3000/api/v1/health
```

## Run One Mock Turn

```bash
curl -s http://localhost:3000/api/v1/voice-turn \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "session_demo",
    "audio_format": "mock",
    "audio_base64": "text:我明天要面試",
    "client_timestamp": "2026-06-10T23:50:00+08:00"
  }'
```

## Tests And Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run benchmark
```

## Docker Compose

```bash
docker compose -f docker/docker-compose.dev.yml up --build
```

## Switch To Real Model Adapters

The real model adapter files are already present:

```text
services/orchestrator/src/adapters/RealModelAdapters.ts
```

Use environment variables to switch providers:

```env
ASR_PROVIDER=breeze_asr_25
ASR_SERVICE_URL=http://localhost:8001
ASR_RUNTIME=breeze_asr_25
BREEZE_ASR_CT2_MODEL_PATH=models/breeze-asr-25-ct2

LLM_PROVIDER=gemma_4_e2b
LLM_SERVICE_URL=http://localhost:8002
LLM_RUNTIME=ollama
OLLAMA_MODEL=gemma4:e2b

TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003
TTS_RUNTIME=openai_compatible
OPENAI_TTS_BASE_URL=http://localhost:9003/v1
```

Selected fast path:

1. Breeze-ASR-25 runs through `faster-whisper` after conversion to CTranslate2.
2. Gemma 4 E2B int4 runs through Ollama as `gemma4:e2b` with RTX GPU acceleration.
3. BreezyVoice runs as a warm OpenAI-compatible TTS service with RTX GPU
   acceleration.

Current real-demo bottleneck:

```text
real voice-turn total: 7.45s
TTS stage: 6.8s
target v0.2 real turn: 2.5s to 4s
```

The next optimization pass should reduce BreezyVoice latency before changing
models:

1. Keep Jarvis replies in the 6-18 character voice range; use `REPLY_MAX_CHARS=14` for latency-critical demos.
2. Warm up TTS with the default finance / insurance canonical reply set, or override it with `BREEZYVOICE_WARMUP_TEXTS`.
3. Cache fixed short replies such as `你說。`, `我懂。`, `繼續說。`, and
   `你最擔心哪一點？`.
4. Add `audio_encode_ms` and structured latency logs.

See `docs/REAL_MODEL_INTEGRATION.md` for conversion and startup commands.

Quick preflight:

```bash
npm run real:health
npm run real:start-ollama
npm run real:pull-gemma
npm run real:start-asr
npm run real:start-breezyvoice
npm run real:preflight
```

Convert Breeze-ASR-25 for `faster-whisper`:

```bash
npm run real:convert-asr
```

## Troubleshooting

Microphone unavailable:

```text
Enable mock mode and type a phrase.
```

Orchestrator unavailable:

```text
Check npm run dev output and confirm port 3000 is free.
```

Web cannot call API:

```text
Confirm NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:3000.
```

Emotion should be disabled:

```env
ENABLE_EMOTION=false
```

TTS unavailable:

```text
The orchestrator returns a text-only partial response instead of crashing.
```
