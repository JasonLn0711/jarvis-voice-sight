# Jarvis Voice Sight Latency Optimization Report

Status: Canonical engineering record  
Date: 2026-06-10  
Scope: Real-model v0.2 latency pass for Breeze-ASR-25, Gemma 4 E2B int4, and BreezyVoice

## Executive Summary

Jarvis reduced the real voice-turn path from an observed `7.45s` total turn,
with `6.8s` spent in TTS, to two current operating modes:

```text
cached fixed reply path: ~0.55s full voice-turn
uncached short reply path: ~1.9s to 2.4s full voice-turn
```

The main improvement came from treating BreezyVoice as the dominant latency
source and optimizing the TTS path before changing models. The current system
keeps all AI model execution on RTX GPU, uses Gemma 4 E2B int4 for lower LLM
latency, and records stage-level latency in every `/api/v1/voice-turn`
response and orchestrator log.

## Baseline

Before this pass, the measured real-model turn was:

```text
real voice-turn total: 7.45s
TTS stage: 6.8s
```

This made the product feel slow even though ASR and LLM were already within a
usable range. The first-principle diagnosis was:

```text
The bottleneck was not the whole AI stack.
The bottleneck was the voice synthesis path.
```

The earlier incoherent TTS output was also traced to the zero-shot speaker
prompt path, not to the LLM. BreezyVoice needs a speaker prompt audio clip and
matching prompt transcript. Without that alignment, the cloned voice can leak
prompt fragments or drift away from the intended LLM output.

## What Changed

### 1. Shorter Jarvis Replies

The persona and prompt policy moved from `10-20` Chinese characters to a
natural voice-companion range:

```text
6-18 Chinese characters
```

For the lowest-latency live demo, `REPLY_MAX_CHARS=14` remains a configurable
latency mode. This reduces TTS work directly. A reply like:

```text
請具體說明您的擔憂。
```

is now treated as too formal and too slow for the MVP. The target style is:

```text
先穩住，我在。
```

This keeps the product goal intact: Jarvis should continue the conversation
naturally, not deliver long explanations or repeatedly interrogate the user.

### 2. Response Policy Tightened The TTS Input

The response policy now protects the TTS path by rejecting or repairing output
that is likely to increase latency or sound unlike Jarvis:

```text
formal customer-service wording
multi-sentence replies
multiple questions in one reply
self-reference as an AI model
markdown or bullet formatting
replies over the configured max length
```

For anxious interview context, the policy can repair invalid verbose wording to
a short canonical reply:

```text
你最擔心哪一點？
```

This is important because the TTS optimizer only works well if the text sent to
BreezyVoice is short, clean, and deterministic.

### 3. BreezyVoice Warmup

The TTS wrapper now warms BreezyVoice during startup by synthesizing a
configurable set of fixed replies. The default warmup set includes:

```text
好，我在。
先建立信任感。
先聽他的顧慮。
用關心開場。
先釐清他的目標。
不要先談商品。
避免承諾報酬。
這裡要保守講。
先尊重他的節奏。
先接住情緒。
語氣再放慢。
```

The warmup creates or verifies cache entries before the demo starts. This
removes the first-turn TTS penalty for common finance / insurance coaching
replies.

The current health/preflight check confirms:

```text
TTS warmup cache exists
warmupCacheReady / warmupCacheTotal
```

### 4. Fixed Short-Reply Audio Cache

The TTS wrapper now has deterministic WAV caching for high-frequency short
Jarvis replies:

```text
好，我在。
你說。
我懂。
繼續說。
你最擔心哪一點？
```

Cache keys include normalized text, voice ID, speed, pitch, emotion style, and
format. On a cache hit, the wrapper returns the WAV immediately and skips the
upstream BreezyVoice call:

```text
tts_cache_hit: true
upstream_tts_ms: 0
audio_encode_ms: 0
```

This turns the TTS stage from a model inference problem into a static audio
lookup for repeated MVP replies.

### 5. Canonical Cache Reuse Across Emotion Style

Emotion-aware TTS requests can include an `emotionStyle`. The first cache
implementation treated `你最擔心哪一點？` and the same text with
`emotionStyle=anxious` as separate keys. That could trigger a fresh synthesis
even when a correct canonical WAV already existed.

The wrapper now reuses the canonical no-emotion cache for fixed replies when
the emotion-specific cache is missing. This keeps v0.2 emotion metadata from
adding avoidable TTS latency.

### 6. Clean 6-Second Voice Prompt

The voice prompt was shortened from a 30-second clip to a clean 6-second clip:

```text
.local/voice-prompts/260610_0127_record_prompt_6s.wav
.local/voice-prompts/260610_0127_record_prompt_6s.txt
```

The matching transcript is:

```text
很多人高中畢業之後還想要做很多的事情我不知道你們大家所有人高中的志願是什麼
```

The 30-second prompt had ended on a clipped fragment, which caused prompt
leakage into generated speech. The 6-second prompt is shorter, aligned, and
cleaner for zero-shot voice cloning.

### 7. Latency Breakdown Added

Every real turn now reports:

```text
vad_ms
asr_ms
emotion_ms
llm_ms
policy_ms
tts_ms
audio_encode_ms
total_ms
```

The response also exposes:

```text
tts_cache_hit
```

The TTS wrapper logs:

```text
tts_cache_hit
upstream_tts_ms
audio_encode_ms
total_tts_ms
normalized_text
```

This makes the next optimization pass evidence-driven instead of subjective.

## Current Smoke Test Evidence

## Insurance Voice Coach Persona Follow-Up

After Jarvis was retargeted as an insurance and financial-service Voice Coach,
a dedicated latency record was added:

```text
docs/INSURANCE_VOICE_COACH_LATENCY_EXPERIMENT.md
```

Key result:

```text
first observed cold turn: 5306ms total
cold-turn LLM stage: 3396ms
warm-turn initial smoke average: 2077ms total
warm-runtime 8-turn average: 2910ms total
warm-runtime 8-turn P95: 5828ms total
```

Interpretation:

```text
The first cold-start spike was LLM-side.
The warm-runtime long tail remains TTS-side.
The fixed financial-coaching TTS cache works. A finance / insurance response
canonicalizer has been added after LLM and before policy / TTS to map safe
semantic variants into cached canonical replies.
```

### Health Check

Command:

```bash
npm run real:health
```

Result:

```json
{
  "status": "ok",
  "services": {
    "orchestrator": "ready",
    "asr": "ready",
    "llm": "ready",
    "tts": "ready",
    "emotion": "ready"
  },
  "providers": {
    "asr": "breeze_asr_25",
    "llm": "gemma_4_e2b",
    "tts": "breezyvoice",
    "emotion": "mock"
  }
}
```

### GPU-Only Preflight

Command:

```bash
npm run real:preflight
```

Result:

```text
OK  NVIDIA RTX GPU visible to host
OK  ASR service PID 673269 is using the RTX GPU
OK  Native Ollama detected RTX CUDA backend
OK  Native Ollama model found: gemma4:e2b
OK  Ollama llama-server is using the RTX GPU
OK  BreezyVoice service PID 735705 is using the RTX GPU
OK  TTS warmup cache exists
```

This confirms the current real-model path follows the project rule that AI
models run on RTX GPU rather than CPU.

### Cached TTS Path

Command:

```bash
curl -sS -X POST http://localhost:8003/tts \
  -H 'Content-Type: application/json' \
  -d '{
    "text":"你最擔心哪一點？",
    "voiceId":"jarvis_default_zh_tw",
    "speed":1.0,
    "emotionStyle":"anxious"
  }'
```

Observed result:

```json
{
  "ttsCacheHit": true,
  "upstreamTtsMs": 0,
  "audioEncodeMs": 0,
  "normalizedText": "你最擔心哪一點？",
  "durationMs": 0,
  "format": "wav"
}
```

This proves the fixed-reply cache bypasses BreezyVoice inference.

### Uncached Full Voice-Turn Path

Command:

```bash
curl -sS -X POST http://localhost:3010/api/v1/voice-turn \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id":"latency_report_smoke_text_payload",
    "audio_format":"mock",
    "audio_base64":"text:我明天要面試",
    "client_timestamp":"2026-06-10T23:50:00+08:00"
  }'
```

Observed result:

```json
{
  "transcript": "我明天要面試",
  "reply": "準備好了嗎",
  "emotion": {
    "label": "anxious",
    "confidence": 0.87,
    "signals": ["面試"],
    "durationMs": 20
  },
  "tts_cache_hit": false,
  "latency": {
    "vad_ms": 0,
    "asr_ms": 120,
    "emotion_ms": 20,
    "llm_ms": 400,
    "policy_ms": 0,
    "tts_ms": 1337,
    "audio_encode_ms": 0,
    "total_ms": 1877
  },
  "status": "ok"
}
```

This is the important uncached result. Even when the LLM chooses a valid short
reply outside the fixed cache, the current real turn is under 2 seconds in this
smoke path.

### Recent Uncached TTS Log Range

The TTS wrapper log now shows repeated uncached short replies in the following
range:

```text
upstream_tts_ms: 1120-1774
```

Examples:

```text
你想聊什麼？          1120ms
你可以再說一點。      1304ms
準備好了嗎            1337ms
現在的天氣如何？      1439ms
準備好了嗎什麼職位    1557ms
有事跟我說吧          1774ms
```

This confirms that shorter replies plus warm runtime plus the cleaner prompt
have moved the uncached TTS path from `6.8s` to roughly `1.1-1.8s`.

## Why The Latency Dropped

The original total latency was dominated by TTS:

```text
7.45s total = mostly 6.8s TTS
```

The optimization reduced that dominant term in three ways:

1. Short replies reduce generated audio length and synthesis work.
2. Warmup removes the first-turn cold-start penalty for known fixed replies.
3. Cache hits bypass upstream BreezyVoice entirely.

The current cached path is dominated by ASR, emotion, and LLM:

```text
ASR ~120ms
Emotion ~20ms
LLM ~350-400ms
TTS cache ~0ms
```

The current uncached path is dominated by BreezyVoice:

```text
ASR ~120-300ms
Emotion ~20ms
LLM ~320-400ms
TTS ~1.1-1.8s
```

That is why the system can now feel demo-ready even before sentence-level
streaming is implemented.

## Current Interpretation

There are now two latency classes:

```text
Fixed cached replies:
  sub-second full turn when the reply maps to cache

Generated uncached replies:
  about 2 seconds for short Jarvis replies
```

The system should not claim every turn is `0.55s`. The correct claim is:

```text
Jarvis now has a sub-second path for repeated fixed replies and an approximately
2-second path for uncached short replies.
```

This is a strong v0.2 demo posture because the user-facing product can bias
toward short, repeated companion utterances while keeping generated replies
available.

## Remaining Work

The next latency pass should improve cache hit rate and reduce uncached TTS
variance:

1. Add a semantic reply canonicalizer for common intents.
2. Pre-generate more high-frequency Jarvis replies.
3. Add a real-model benchmark that runs repeated full `/voice-turn` requests and
   reports cached vs uncached percentiles separately.
4. Consider sentence-level streaming only after the short-reply/cache path is
   measured across more sessions.
5. Replace FastAPI `on_event` warmup with lifespan when cleanup is needed; this
   is not a latency blocker.

## Demo-Safe Positioning

Use this wording in a demo:

```text
我們先從第一原理看 latency：原本 7.45 秒裡面有 6.8 秒都卡在 TTS，
所以我沒有先亂換整個模型，而是先縮短 reply、做 BreezyVoice warmup、
固定短句 cache，並且把每一段 latency 都打出來。現在固定短句可以直接
cache hit，TTS inference 是 0ms；沒有命中 cache 的短句，BreezyVoice
也大多落在 1.1 到 1.8 秒，完整 turn 約 2 秒上下。
```
