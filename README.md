# Jarvis Voice Sight

Jarvis Voice Sight is a mock-first, real-time voice companion MVP. It proves the v0.1 voice loop and extends it to v0.2 emotion-aware response policy:

```text
User speech → VAD → ASR → LLM → response policy → TTS → audio playback
```

The product metric is `Average Turns Per Session`: whether users keep speaking after the first exchange.

## Quick Start

```bash
npm install
npm run dev
```

Open the web app at `http://localhost:3001`. The orchestrator runs at `http://localhost:3000`.

Use mock mode in the UI when the microphone is unavailable. The full pipeline still runs through `/api/v1/voice-turn`.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run benchmark
npm run real:health
npm run real:preflight
npm run real:convert-asr
npm run real:start-ollama
npm run real:start-asr
npm run real:start-breezyvoice
npm run real:pull-gemma
```

## Architecture

The frontend calls only the orchestrator. The orchestrator owns the workflow and calls replaceable adapters for ASR, LLM, TTS, and Emotion.

```text
apps/web
  ↓
services/orchestrator
  ↓
ASR adapter → LLM adapter → TTS adapter
             ↘ Emotion adapter
```

Implemented design patterns:

1. Hexagonal architecture
2. Adapter pattern
3. Strategy pattern
4. Facade pattern
5. Chain of responsibility
6. Factory pattern
7. Circuit breaker
8. Repository pattern
9. Observer pattern

## API

Main endpoint:

```http
POST /api/v1/voice-turn
```

Example request:

```json
{
  "session_id": "session_abc123",
  "audio_format": "mock",
  "audio_base64": "text:我明天要面試",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Example response:

```json
{
  "session_id": "session_abc123",
  "turn_id": "turn_001",
  "transcript": "我明天要面試",
  "reply": "先拆一題來練。",
  "emotion": {
    "label": "anxious",
    "confidence": 0.87,
    "signals": ["面試"]
  },
  "audio_url": "/mock-audio/turn_001.wav",
  "latency": {
    "vad_ms": 1,
    "asr_ms": 1,
    "emotion_ms": 1,
    "llm_ms": 1,
    "policy_ms": 0,
    "tts_ms": 1,
    "total_ms": 5
  },
  "status": "ok"
}
```

## Roadmap

v0.1:

1. Push-to-talk voice loop
2. VAD
3. ASR
4. LLM reply
5. Response policy
6. TTS
7. In-memory context
8. Latency logging
9. Safe fallbacks

v0.2:

1. Emotion labels
2. Text-based mock emotion classifier
3. Emotion-aware strategy
4. Config flag `ENABLE_EMOTION`
5. Latency report with `emotion_ms`

## Canonical Documents

- [Jarvis v0.1: Ultra-Low Latency Voice Companion](docs/specs/jarvis-v0.1-ultra-low-latency-voice-companion.md)
- [MVP Software Design Document v0.1 to v0.2](docs/SDD_v0.1_to_v0.2.md)
- [API Spec](docs/API_SPEC.md)
- [Prompt Spec](docs/PROMPT_SPEC.md)
- [Latency Budget](docs/LATENCY_BUDGET.md)
- [Latency Optimization Report](docs/LATENCY_OPTIMIZATION_REPORT.md)
- [Context Memory Latency Experiment](docs/CONTEXT_MEMORY_LATENCY_EXPERIMENT.md)
- [UI / UX Specification](docs/UI_UX_SPEC.md)
- [Runbook](docs/RUNBOOK.md)
- [Real Model Integration](docs/REAL_MODEL_INTEGRATION.md)
- [Codex Goal Prompt v0.1 to v0.2](docs/CODEX_GOAL_PROMPT_v0.1_to_v0.2.md)
- [Source brief: 2026-06-10 Jarvis v0.1 complete spec](docs/source-briefs/2026-06-10-jarvis-v0.1-complete-spec.md)

## Real Model Integration

The implementation now supports real model activation while keeping mock mode
available. The selected fast path is:

1. Breeze-ASR-25 through `faster-whisper` with a converted CTranslate2 model.
2. Gemma 4 E2B int4 through Ollama as `gemma4:e2b` on the RTX GPU.
3. BreezyVoice through a warm OpenAI-compatible TTS service on the RTX GPU.

Real model hooks remain separated:

1. `BreezeASRAdapter`
2. `GemmaE2BAdapter`
3. `BreezyVoiceAdapter`
4. `EmotionClassifierAdapter`

Switch providers through `.env` after the real service endpoints expose the same
HTTP contracts. See [Real Model Integration](docs/REAL_MODEL_INTEGRATION.md).

Use `.env.real.example` as the real-model configuration template and run:

```bash
npm run real:health
npm run real:preflight
```
