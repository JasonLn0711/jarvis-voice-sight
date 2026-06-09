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

LLM_PROVIDER=gemma_4_e4b
LLM_SERVICE_URL=http://localhost:8002

TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003
```

The real services must preserve the same HTTP contracts documented in `docs/API_SPEC.md`.

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
