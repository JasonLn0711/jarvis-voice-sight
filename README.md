# Jarvis Voice Sight

Jarvis Voice Sight is a mock-first realtime voice agent prototype. The v0.5 path consolidates always-listening voice interaction, VAD state management, barge-in, turn isolation, sentence-level streaming TTS, bounded parallel long-form synthesis, and configurable Ollama / vLLM LLM runtime support:

```text
User speech → VAD → ASR → LLM → response policy → TTS → audio playback
```

The v0.3.1/v0.4 path adds continuous listening, barge-in cancellation, ordered
`audio_chunk` streaming, and optional long-form sentence chunking behind feature
flags.

The next VOISS-driven design path is v0.3.1 realtime hardening followed by
v0.4 long-form TTS: keep listening, support interruption, and split longer
speech into cancellable sentence chunks instead of relying only on short replies.

The product metric is `Average Turns Per Session`: whether users keep speaking after the first exchange.

## Quick Start

```bash
npm install
npm run dev
```

Open the web app at `http://localhost:3001`. The orchestrator runs at `http://localhost:3000`.

Use mock mode in the UI when the microphone is unavailable. The full pipeline still runs through `/api/v1/voice-turn`.

Realtime mode:

```bash
npm run dev
```

Open `http://localhost:3001`, then use `enable realtime mode`. Push-to-talk
remains available when realtime mode is off.

Long-form TTS mode:

```bash
TTS_LONG_FORM_ENABLED=true \
MAX_PARALLEL_TTS_WORKERS=3 \
TTS_MAX_PARALLEL_CHUNKS=3 \
TTS_TARGET_CHUNK_SECONDS=4 \
TTS_SENTENCE_SILENCE_MS=160 \
npm run dev
```

In long-form mode, `/api/v1/voice-turn-stream` plans the final reply into
sentence chunks, synthesizes chunks with bounded parallelism, streams ordered
`audio_chunk` events, and reports time-to-first-audio metrics.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run benchmark
npm run smoke:realtime
npm run real:health
npm run real:preflight
npm run real:convert-asr
npm run real:start-ollama
npm run real:start-asr
npm run real:start-breezyvoice
npm run real:pull-gemma
npm run demo:real
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

Realtime preview endpoint:

```http
POST /api/v1/voice-turn-stream
```

`/api/v1/voice-turn-stream` returns NDJSON events so the client can play
sentence-level TTS chunks while preserving `turn_id` cancellation. Audio events
use this contract:

```json
{
  "type": "audio_chunk",
  "event": "audio_chunk",
  "turn_id": "turn_001",
  "chunk_id": "turn_001_chunk_0",
  "sequence": 0,
  "audio_url": "/mock-audio/先抓住目標。.wav",
  "is_final": false
}
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

v0.3 preview:

1. Realtime UI toggle
2. Browser-side VAD state manager
3. Barge-in cancellation
4. Stale audio discard by `turn_id`
5. Sentence-level LLM-to-TTS streaming endpoint
6. Push-to-talk fallback remains available

v0.3.1:

1. Always-listening mode as a stable runtime path
2. Hardened VAD state manager
3. Barge-in stop within 500ms target
4. Turn-scoped stale audio discard
5. Cancellable TTS queue
6. 50-turn realtime smoke coverage

v0.4:

1. Long-form TTS sentence splitter
2. Chunk planner targeting 3-5 second speech chunks
3. Bounded parallel BreezyVoice synthesis
4. Ordered streaming audio chunks
5. Chunk-level TTS cache
6. Time-to-first-audio latency metrics
7. Taiwan Mandarin voice-quality data plan

## Environment Variables Added For v0.4

```text
TTS_LONG_FORM_ENABLED=false
TTS_MAX_PARALLEL_CHUNKS=3
MAX_PARALLEL_TTS_WORKERS=3
TTS_TARGET_CHUNK_SECONDS=4
TTS_SENTENCE_SILENCE_MS=160
CHUNK_TARGET_SECONDS=4
SILENCE_PADDING_MS=120
TTS_MODEL_VERSION=breezyvoice-default
```

Current implementation limits:

1. Long-form mode uses sentence-level chunks, not token-level TTS.
2. Barge-in aborts the active browser stream and the orchestrator stops yielding
   or starting additional chunks after the response stream closes.
3. Audio normalization and silence padding are represented as merge metadata in
   the orchestrator; real WAV-level merging should be validated against
   BreezyVoice sample-rate output before production packaging.
4. Taiwan Mandarin voice quality remains a governed planning track requiring
   licensed or consented data.

Realtime browser smoke:

```bash
npm run smoke:realtime
```

This verifies the page renders, the realtime mode toggle enters listening
state, and the browser can consume `/api/v1/voice-turn-stream` NDJSON events with
turn-scoped audio chunks.

## Canonical Documents

- [Product Specification v0.1 to v0.2](docs/PRODUCT_SPEC_v0.1_to_v0.2.md)
- [Enterprise Software Design Document v0.1 to v0.2](docs/SDD_ENTERPRISE_v0.1_to_v0.2.md)
- [VOISS Feedback Roadmap v0.2.1 to v0.3](docs/VOISS_FEEDBACK_ROADMAP_v0.2.1_to_v0.3.md)
- [Codex Goal Prompt v0.2.1 to v0.3](docs/CODEX_GOAL_PROMPT_v0.2.1_to_v0.3.md)
- [VOISS Next Version Design v0.3.1 to v0.4](docs/VOISS_NEXT_VERSION_DESIGN_v0.3.1_to_v0.4.md)
- [Codex Goal Prompt v0.3.1 to v0.4](docs/CODEX_GOAL_PROMPT_v0.3.1_to_v0.4.md)
- [Software Design Document v0.5](docs/SDD_v0.5.md)
- [Codex Goal Prompt v0.4 to v0.5](docs/CODEX_GOAL_PROMPT_v0.4_to_v0.5.md)
- [Implementation Status v0.4 to v0.5](docs/IMPLEMENTATION_STATUS_v0.4_to_v0.5.md)
- [v0.5 Completion Audit](docs/V0.5_COMPLETION_AUDIT.md)
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
2. Configurable LLM runtime through Ollama or vLLM, with `gemma4:e2b` as the v0.5 Ollama default.
3. BreezyVoice through a warm OpenAI-compatible TTS service on the RTX GPU.

Real model hooks remain separated:

1. `BreezeASRAdapter`
2. `HttpLLMAdapter` through the Jarvis LLM wrapper
3. `GemmaE2BAdapter` / `GemmaE4BAdapter` legacy compatibility aliases
4. `BreezyVoiceAdapter`
5. `EmotionClassifierAdapter`

Switch providers through `.env` after the real service endpoints expose the same
HTTP contracts. See [Real Model Integration](docs/REAL_MODEL_INTEGRATION.md).

Use `.env.real.example` as the real-model configuration template and run:

```bash
npm run real:health
npm run real:preflight
```
