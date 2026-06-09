# Jarvis Voice Sight Latency Budget

Status: Canonical latency target and benchmark guide

## v0.1 Target

```text
P50 total latency < 1.5 seconds
P95 total latency < 2.5 seconds
```

## v0.2 Target

```text
P50 total latency < 1.8 seconds
P95 total latency < 3.0 seconds
```

Emotion detection must run as a bounded step and remain non-blocking on failure.

## Stage Timeouts

```text
TOTAL_TIMEOUT_MS=3000
ASR_TIMEOUT_MS=1000
LLM_TIMEOUT_MS=800
TTS_TIMEOUT_MS=1200
EMOTION_TIMEOUT_MS=300
```

## Latency Report

Every `/api/v1/voice-turn` response includes:

```text
vad_ms
asr_ms
emotion_ms
llm_ms
policy_ms
tts_ms
total_ms
```

## Benchmark

Run:

```bash
npm run benchmark
```

The benchmark sends repeated mock turns through the full orchestrator pipeline and reports:

```text
P50 total latency
P95 total latency
P50 ASR latency
P95 ASR latency
P50 LLM latency
P95 LLM latency
P50 TTS latency
P95 TTS latency
```

The mock benchmark validates orchestration overhead, fallback plumbing, and stage-level timing. Real model latency must be re-measured after Breeze-ASR-25, Gemma 4 E4B, and BreezyVoice are attached.
