# Jarvis Voice Sight API Spec

Status: Canonical API contract

Base URL:

```text
http://localhost:3000
```

## `POST /api/v1/voice-turn`

Runs one full voice interaction turn.

Request:

```json
{
  "session_id": "session_abc123",
  "audio_format": "wav",
  "audio_base64": "mock",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Mock text input is supported:

```json
{
  "session_id": "session_abc123",
  "audio_format": "mock",
  "audio_base64": "text:我明天要面試",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Response:

```json
{
  "session_id": "session_abc123",
  "turn_id": "turn_001",
  "transcript": "我明天要面試",
  "reply": "先拆一題來練。",
  "emotion": {
    "label": "anxious",
    "confidence": 0.87,
    "signals": ["面試"],
    "durationMs": 20
  },
  "audio_url": "/mock-audio/turn_001.wav",
  "latency": {
    "vad_ms": 10,
    "asr_ms": 120,
    "emotion_ms": 20,
    "llm_ms": 180,
    "llm_first_token_ms": 180,
    "llm_total_ms": 180,
    "policy_ms": 5,
    "tts_ms": 160,
    "tts_first_audio_ms": 160,
    "tts_total_ms": 160,
    "playback_ms": 0,
    "playback_delay_ms": 0,
    "playback_start_ms": 0,
    "tts_cache_hit": true,
    "tts_parallel_chunks": 1,
    "total_ms": 495
  },
  "status": "ok"
}
```

Status values:

```text
ok
partial
error
```

## `POST /api/v1/voice-turn-stream`

Runs one voice interaction turn with sentence-level streaming.

The response content type is:

```text
application/x-ndjson
```

Each line is one JSON event. The endpoint keeps the same request body as
`/api/v1/voice-turn`.

Request:

```json
{
  "session_id": "session_abc123",
  "audio_format": "mock",
  "audio_base64": "text:我想先整理一下",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Event sequence:

```text
voice_turn_started
transcript
emotion
sentence
audio_chunk
voice_turn_completed
```

Example NDJSON response:

```jsonl
{"type":"voice_turn_started","session_id":"session_abc123","turn_id":"turn_001"}
{"type":"transcript","turn_id":"turn_001","transcript":"我想先整理一下"}
{"type":"sentence","turn_id":"turn_001","sequence":0,"sentence":"先抓住目標。"}
{"type":"audio_chunk","event":"audio_chunk","turn_id":"turn_001","chunk_id":"turn_001_chunk_0","sequence":0,"sentence":"先抓住目標。","audio_url":"/mock-audio/先抓住目標。.wav","is_final":true,"tts_cache_hit":true,"latency":{"tts_ms":0,"audio_encode_ms":0}}
{"type":"voice_turn_completed","session_id":"session_abc123","turn_id":"turn_001","transcript":"我想先整理一下","reply":"先抓住目標。","latency":{"vad_ms":1,"asr_ms":120,"emotion_ms":20,"llm_ms":180,"policy_ms":1,"tts_ms":0,"audio_encode_ms":0,"playback_delay_ms":0,"perceived_total_ms":322,"total_ms":322},"status":"ok"}
```

Streaming rules:

1. Each audio chunk carries `type`, `event`, `turn_id`, `chunk_id`, `sequence`,
   `audio_url`, and `is_final`.
2. TTS receives only finalized sentence-level text.
3. Stale audio chunks must be discarded by the frontend if `turn_id` is no
   longer active.
4. Token-level TTS is intentionally not used.
5. When `TTS_LONG_FORM_ENABLED=true`, long-form latency may include
   `tts_chunk_count`, `tts_parallelism`, `tts_time_to_first_audio_ms`,
   `tts_total_synthesis_ms`, `tts_merge_ms`, `tts_cache_hit_count`,
   `tts_cache_miss_count`, `tts_first_chunk_cache_hit`, and
   `playback_start_delay_ms`.

Compatibility fields:

1. `/api/v1/voice-turn` keeps top-level `tts_cache_hit`.
2. The same value is also mirrored to `latency.tts_cache_hit` for the v0.2.1
   demo-stability contract.
3. `latency.playback_ms` mirrors `latency.playback_delay_ms` for older prompt
   wording.
4. v0.5 latency aliases include `llm_first_token_ms`, `llm_total_ms`,
   `tts_first_audio_ms`, `tts_total_ms`, `playback_start_ms`, and
   `tts_parallel_chunks`.

## `GET /api/v1/health`

Returns orchestrator and model adapter readiness.

Response:

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
    "asr": "mock",
    "llm": "mock",
    "tts": "mock",
    "emotion": "mock"
  }
}
```

## `POST /api/v1/asr`

Debug endpoint for ASR only.

Request:

```json
{
  "audio_format": "mock",
  "audio_base64": "text:我明天要面試"
}
```

Response:

```json
{
  "text": "我明天要面試",
  "language": "zh-TW",
  "confidence": 0.93,
  "durationMs": 120,
  "segments": [
    {
      "startMs": 0,
      "endMs": 900,
      "text": "我明天要面試"
    }
  ]
}
```

## `POST /api/v1/chat`

Debug endpoint for LLM only.

Request:

```json
{
  "text": "我明天要面試",
  "session_id": "session_abc123"
}
```

Response:

```json
{
  "reply": "先拆一題來練。",
  "tokensUsed": 18,
  "durationMs": 180,
  "finishReason": "stop"
}
```

## `POST /api/v1/tts`

Debug endpoint for TTS only.

Request:

```json
{
  "text": "先拆一題來練。",
  "voiceId": "jarvis_default_zh_tw"
}
```

Response:

```json
{
  "audioUrl": "/mock-audio/先拆一題來練。.wav",
  "durationMs": 160,
  "format": "wav"
}
```

## `POST /api/v1/emotion`

Debug endpoint for emotion classification.

Request:

```json
{
  "text": "我明天要面試",
  "recentMessages": []
}
```

Response:

```json
{
  "label": "anxious",
  "confidence": 0.87,
  "signals": ["面試"],
  "durationMs": 20
}
```

Supported labels:

```text
neutral
anxious
tired
confused
excited
sad
angry
uncertain
```
