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
    "policy_ms": 5,
    "tts_ms": 160,
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
