# Jarvis Voice Sight Implementation Status

Version: v0.2.1 to v0.3

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

Owner: Jason Lin, NYCU

## 1. Current Status

Jarvis Voice Sight now has the v0.2.1 demo-stability layer implemented and a
v0.3 realtime interaction layer that maps to the current repo's v0.3 preview /
v0.3.1 hardening line.

The current demo path remains push-to-talk compatible. The realtime preview adds
continuous microphone listening, lightweight browser-side VAD state management,
barge-in cancellation, stale playback protection, and runtime state display.

## 2. v0.2.1 Implemented

### 2.1 Natural Persona Path

The orchestrator now keeps the Jarvis response path aligned to the current
persona direction:

```text
Traditional Chinese
natural Taiwanese Mandarin
short spoken reply
not always a question
acknowledgement, reflection, or light guidance first
finance and insurance safety controls
```

### 2.2 TTS Text Finalizer

Added:

```text
services/orchestrator/src/policy/TtsTextFinalizer.ts
```

The finalizer prepares text before TTS by removing markdown, JSON fragments, role
tags, URLs, emojis, excess punctuation, and overlong spoken text. It prefers a
short natural clause when the first generated sentence is too long.

### 2.3 Turn ID Propagation

Every voice turn now carries one `turn_id` across:

```text
VAD
ASR
Emotion
LLM
Response policy
TTS
Frontend playback guard
Logs
```

The HTTP adapters pass `turn_id` to model services as `turn_id`. Python service
request schemas now accept the field.

### 2.4 Stale Playback Protection

Frontend playback now uses a turn playback guard. Audio playback is skipped or
stopped when the audio belongs to an older turn.

Core behavior:

```typescript
if (!canPlay(turnId)) {
  stop();
  return false;
}
```

### 2.5 TTS Cache And Warmup

The TTS service keeps deterministic cache behavior by normalized spoken text.
`turn_id` is logged but is not part of the cache key, so repeated short replies
can still hit cache across turns.

The finance / insurance canonical replies are included in the warmup set.

### 2.6 One-Command Demo Boot

Added:

```bash
npm run demo:real
```

This delegates to:

```text
scripts/demo_real.sh
```

The script starts the real-model stack, waits for local services, runs health and
preflight checks, and prints `Ready for Demo`.

## 3. v0.3 Preview Implemented

### 3.1 Shared Realtime Primitives

Added:

```text
packages/shared/src/types/realtime.ts
```

Implemented primitives:

```text
VadStateManager
TtsQueue
SentenceBuffer
TurnPlaybackGuard
```

Runtime states:

```text
idle
listening
user_speaking
asr_processing
thinking
speaking
interrupted
error_recovery
```

Default VAD thresholds:

```text
START_SPEECH_PROB = 0.6
END_SPEECH_PROB = 0.3
MIN_SPEECH_MS = 200
END_SILENCE_MS = 700
BARGE_IN_MS = 300
```

### 3.2 Realtime Frontend Controller

Added:

```text
apps/web/src/hooks/useRealtimeVoiceController.ts
```

The hook opens the microphone continuously, estimates a lightweight RMS speech
probability, feeds the VAD state manager, emits utterances automatically, and
detects barge-in while Jarvis is speaking.

When barge-in is detected:

```text
audio playback stops
active turn is cancelled
queued chunks from stale turns are ignored
state returns to listening
```

### 3.3 Runtime State Display

The premium UI remains voice-first. Realtime state is shown quietly in the status
strip:

```text
realtime listening
realtime user speaking
realtime asr processing
```

Push-to-talk remains available when realtime preview is disabled.

### 3.4 Sentence-Level Streaming Endpoint

Added:

```text
POST /api/v1/voice-turn-stream
```

The endpoint returns `application/x-ndjson` events. It runs:

```text
VAD
ASR
context load
emotion classification
LLM token stream
SentenceBuffer
TtsTextFinalizer
TtsQueue
TTS synthesis
turn-scoped audio events
```

The frontend realtime path now uses this endpoint. Push-to-talk remains on
`/api/v1/voice-turn`.

## 4. Verification Results

### 4.1 Typecheck

Command:

```bash
npm run typecheck
```

Result:

```text
passed
```

### 4.2 Lint

Command:

```bash
npm run lint
```

Result:

```text
passed
```

### 4.3 Tests

Command:

```bash
npm run test
```

Result:

```text
orchestrator tests: 50 passed
TTS cache tests: 6 passed
```

Covered:

```text
response policy
response repair
TTS text finalizer
VAD state transitions
barge-in detection
TTS queue cancellation
sentence buffering
sentence-level streaming endpoint
stale playback guard
50-turn duplicate playback prevention
voice-turn integration
turn_id propagation
TTS cache hit and miss behavior
```

### 4.4 Real Health

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
    "llm": "gemma_4_e4b",
    "tts": "breezyvoice",
    "emotion": "mock"
  }
}
```

### 4.5 Real Preflight

Command:

```bash
npm run real:preflight
```

Result:

```text
passed
```

Confirmed:

```text
NVIDIA RTX GPU visible
Breeze-ASR-25 ASR service uses RTX GPU
Ollama Gemma 4 E4B uses RTX GPU after warmup
BreezyVoice service uses RTX GPU
TTS warmup cache exists
```

### 4.6 Benchmark

Command:

```bash
npm run benchmark
```

Result:

```text
P50/P95 total latency: 480ms / 480ms
P50/P95 ASR latency: 120ms / 120ms
P50/P95 LLM latency: 180ms / 180ms
P50/P95 TTS latency: 160ms / 160ms
P50/P95 audio encode latency: 0ms / 0ms
TTS cache hits: 16/40
P50/P95 cached TTS endpoint latency: 0ms / 1ms
Cached TTS endpoint hits: 20/20
```

### 4.7 Realtime Browser Smoke

Command:

```bash
npm run smoke:realtime
```

Result:

```json
{
  "status": "ok",
  "web": "http://localhost:3001",
  "orchestrator": "http://127.0.0.1:3000",
  "streamEvents": [
    "voice_turn_started",
    "transcript",
    "emotion",
    "sentence",
    "audio_chunk",
    "voice_turn_completed"
  ],
  "audioChunks": 1,
  "bargeIn": "interrupted_then_listening"
}
```

Confirmed:

```text
premium UI renders
realtime preview toggle enters listening state
barge-in displays Interrupted and returns to Listening
browser can consume voice-turn-stream NDJSON
audio_chunk events carry the active turn_id
```

Compatibility fields now carried by `/api/v1/voice-turn`:

```text
latency.playback_ms mirrors latency.playback_delay_ms
latency.tts_cache_hit mirrors top-level tts_cache_hit
```

### 4.8 Demo Real Boot

Command:

```bash
npm run demo:real
```

Result:

```text
Ready for Demo
Web UI: http://localhost:3001
Orchestrator: http://localhost:3000
```

Confirmed:

```text
ASR service reachable
Ollama/Gemma service reachable
BreezyVoice upstream reachable
orchestrator running
web UI running
real health passed
real preflight passed
```

## 5. Current Limitations

The v0.3 path is a realtime preview, not the final production realtime agent.

Current limits:

```text
browser VAD uses lightweight RMS, not a dedicated neural VAD
streaming is sentence-level, not token-level TTS
realtime preview still sends one completed utterance per ASR call after VAD end detection
browser smoke uses fake media devices and synthetic level overrides for automation
push-to-talk remains the more stable interview demo path
```

## 6. Recommended Next Engineering Step

The next upgrade should harden realtime behavior with a neural VAD and browser
smoke tests:

```text
replace RMS VAD with Silero/WebRTC VAD
measure interruption-to-stop latency with synthetic audio levels
add reconnect behavior for stream failures
```

Sentence-level streaming remains the correct level for v0.3. Token-level TTS
should stay out of scope until sentence-level interruption behavior is stable.
