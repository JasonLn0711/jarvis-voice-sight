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
audio_encode_ms
playback_delay_ms
perceived_total_ms
total_ms
```

`total_ms` is the real pipeline latency. `perceived_total_ms` includes optional
demo pacing that tops up cached responses to the configured playback target.

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
P50 audio encode latency
P95 audio encode latency
```

The mock benchmark validates orchestration overhead, fallback plumbing, and stage-level timing. Real model latency must be re-measured after Breeze-ASR-25, Gemma 4 E4B int4, and BreezyVoice are attached.

See [Latency Optimization Report](LATENCY_OPTIMIZATION_REPORT.md) for the
2026-06-10 real-model pass that reduced the observed real turn from `7.45s` to
sub-second cached replies and about `2s` uncached short replies.

See [Context Memory Latency Experiment](CONTEXT_MEMORY_LATENCY_EXPERIMENT.md)
for the 2026-06-10 comparison between 5-turn memory and 10-turn memory.

## Current Real-Model Measurement

Status: measured after real model activation and BreezyVoice prompt-text
alignment fix.

```text
real voice-turn total: 7.45s
TTS stage: 6.8s
target v0.2 real turn: 2.5s to 4s
```

Diagnosis:

```text
The prior incoherent TTS output was not an LLM issue.
It was a zero-shot speaker prompt alignment issue caused by missing prompt
transcription for the cloned voice reference.
```

The next latency pass should focus on BreezyVoice TTS latency before changing
models.

## v0.2 TTS Latency Optimization Plan

Priority:

1. Keep Jarvis replies in the 6-18 character voice range; use `REPLY_MAX_CHARS=14` for latency-critical demos.
2. Warm up BreezyVoice with `好，我在。` after startup.
3. Cache repeated short replies as deterministic WAV files.
4. Defer sentence-level streaming until cache and warmup are measured.
5. Add structured latency logs for every real turn.

Preferred short reply style:

```text
你最擔心哪一點？
```

Avoid formal support-style wording:

```text
請具體說明您的擔憂。
```

Fixed short replies to cache first:

```text
好，我在。
你說。
我懂。
繼續說。
你最擔心哪一點？
```

Every real turn should report and log:

```text
asr_ms
llm_ms
tts_ms
audio_encode_ms
playback_delay_ms
perceived_total_ms
total_ms
```

Keep existing latency fields:

```text
vad_ms
emotion_ms
policy_ms
```

Latency acceptance for this pass:

```text
cached TTS reply < 500ms
uncached real turn includes full latency breakdown
real AI model runtimes remain RTX GPU only
```

Current measured operating modes:

```text
cached fixed reply path: ~0.55s full voice-turn
uncached short reply path: ~1.9s to 2.4s full voice-turn
```
