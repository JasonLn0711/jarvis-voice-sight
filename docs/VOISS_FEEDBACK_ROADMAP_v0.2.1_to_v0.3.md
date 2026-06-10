# VOISS AI Feedback Roadmap

Version: v0.2.1 to v0.3

Status: Canonical feedback and implementation roadmap

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

Owner: Jason Lin, NYCU

Source: VOISS AI demo feedback after Jarvis Voice Sight v0.2 demo preparation

## 1. Executive Summary

VOISS AI feedback should be implemented in two phases:

```text
v0.2.1: stabilize the current demo first.
v0.3: upgrade the system into a true realtime voice agent.
```

The immediate product direction is:

```text
先穩，再 realtime。
```

v0.2.1 should improve perceived demo quality without major architectural change. v0.3 should add continuous listening, barge-in, turn cancellation, VAD state management, and sentence-level streaming.

## 2. Product Interpretation

The feedback identifies the difference between a demo-ready voice loop and a production-grade realtime voice system.

v0.2 already proves:

1. ASR -> LLM -> TTS loop.
2. Short reply persona.
3. Real-model integration.
4. TTS cache and latency measurement.
5. Premium UI presentation.

v0.2.1 should make this reliable for interview demonstration.

v0.3 should move latency and interruption handling from persona workaround into architecture:

```text
VAD
barge-in
turn cancellation
TTS queue cancellation
sentence-level streaming
runtime state visibility
```

## 3. v0.2.1 Demo Stability

### 3.1 Goal

Make the current push-to-talk demo feel stable, natural, and interview-ready without large architecture changes.

### 3.2 Persona Update

Jarvis should become natural conversation, not a question loop.

Rules:

```text
Reply in Traditional Chinese.
Use natural spoken Taiwanese Mandarin.
Reply in 6–18 Chinese characters.
Do not always ask questions.
Prefer acknowledgement, reflection, or light guidance.
Ask a question only when clarification is needed.
Avoid formal customer-service wording.
Never use bullet points.
Never explain system behavior.
```

### 3.3 Short-Sentence TTS Control

TTS text control should prefer short natural sentences instead of forcing questions.

Examples:

```text
好，這樣比較順。
這裡先求穩。
我懂，先別急。
這段可以收斂。
先抓最小版本。
```

Product rationale:

1. Short replies lower TTS latency.
2. Natural acknowledgements reduce interview-like pressure.
3. Varied short replies increase perceived intelligence.
4. The voice experience feels closer to a companion than a chatbot.

### 3.4 TTS Cache

Add deterministic TTS audio cache for the top 20 common short replies.

Initial cache set:

```text
好，我在。
我懂。
繼續說。
先別急。
這裡先求穩。
可以，這樣順。
先抓最小版本。
這段可以收斂。
你已經接近了。
我們先拆小。
```

Requirement:

```text
Cache hit directly plays WAV without calling BreezyVoice upstream.
```

Target:

```text
cached TTS path < 500ms
```

### 3.5 Latency Breakdown

Every `/api/v1/voice-turn` response should include latency breakdown.

Required fields:

```json
{
  "turn_id": "turn_001",
  "transcript": "...",
  "reply": "...",
  "latency": {
    "asr_ms": 420,
    "llm_ms": 730,
    "tts_ms": 6800,
    "total_ms": 7950,
    "tts_cache_hit": false
  }
}
```

Implementation note:

Current API already reports detailed stage latency and `tts_cache_hit` at top level. v0.2.1 should ensure this shape is explicit, documented, tested, and easy to explain in demo.

### 3.6 Turn ID Propagation

Every voice turn must have one `turn_id` shared across:

1. ASR.
2. LLM.
3. TTS.
4. Playback.
5. Logging.
6. Cancellation.

Rule:

```typescript
if (currentTurnId !== audio.turnId) {
  discardAudio();
}
```

Product reason:

This prevents stale audio from an old turn playing after a newer turn starts.

### 3.7 One-Command Demo Boot

Add:

```bash
npm run demo:real
```

It should:

```text
start ASR
start Ollama
start LLM wrapper
start TTS wrapper
start BreezyVoice
start Web UI
run health check
run preflight
print Ready for Demo
```

### 3.8 v0.2.1 Acceptance Criteria

1. `npm run typecheck` passes.
2. `npm run lint` passes.
3. `npm run test` passes.
4. `npm run real:health` passes.
5. `npm run real:preflight` passes.
6. Cached TTS replies return under `500ms`.
7. Every `/api/v1/voice-turn` response includes `turn_id`.
8. Every `/api/v1/voice-turn` response includes latency fields.
9. Persona no longer always asks questions.
10. Stale audio is discarded when `turn_id` is no longer active.

## 4. v0.3 Realtime Voice Agent

### 4.1 Goal

Upgrade Jarvis from push-to-talk voice loop into a realtime voice interaction system:

```text
不用按麥克風暫停，可以持續聽、可打斷。
```

### 4.2 VAD State Manager

Add a VAD-driven runtime state manager.

States:

```typescript
type VoiceState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "asr_processing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error_recovery";
```

Recommended thresholds:

```typescript
START_SPEECH_PROB = 0.6
END_SPEECH_PROB = 0.3
MIN_SPEECH_MS = 200
END_SILENCE_MS = 700
BARGE_IN_MS = 300
```

### 4.3 Barge-In

When Jarvis is speaking and human speech is detected for more than `300ms`:

```typescript
audioPlayer.stop();
ttsQueue.clear();
cancelCurrentTurn();
state = "listening";
```

UI should show:

```text
Interrupted
Listening
```

Acceptance target:

```text
Jarvis stops speaking within 500ms when interrupted.
```

### 4.4 Always-Listening Mode

Current mode:

```text
press record -> speak -> stop -> process
```

Target mode:

```text
continuous listening -> VAD detects one utterance -> automatically send to ASR
```

Requirements:

1. Mic remains open when always-listening is enabled.
2. VAD detects utterance start and end.
3. Completed utterance is sent to ASR automatically.
4. UI clearly shows runtime state.
5. Push-to-talk may remain as fallback.

### 4.5 Sentence-Level Streaming

Implement sentence-level streaming before full token-level TTS.

Target flow:

```text
ASR complete utterance
↓
LLM streaming
↓
buffer until complete short sentence
↓
TTS finalizer
↓
TTS queue
↓
playback
```

Do not implement token-level TTS first.

Reason:

```text
Token-level TTS can become unstable and incoherent before turn cancellation and sentence finalization are reliable.
```

### 4.6 TTS Queue Cancellation

Add a cancellable TTS queue.

Required interface:

```typescript
class TtsQueue {
  clear(turnId: string) {}
  enqueue(sentence: string, turnId: string) {}
  cancel(turnId: string) {}
}
```

Rule:

```text
No stale audio chunk from an old turn may play after interruption or new turn start.
```

### 4.7 Runtime State UI

The UI must show runtime state clearly.

Display copy:

```text
Listening...
Understanding...
Thinking...
Speaking...
Interrupted.
Error recovery.
```

Product reason:

Runtime state visibility helps interviewers understand that Jarvis has a voice system design, not just chained API calls.

### 4.8 v0.3 Acceptance Criteria

1. User can speak without pressing stop manually.
2. Jarvis stops speaking within `500ms` when user interrupts.
3. No stale TTS audio is played after interruption.
4. No duplicate playback across `50` turns.
5. Runtime state is visible in UI.
6. Existing v0.2.1 tests still pass.
7. Push-to-talk fallback still works.
8. Sentence-level streaming works without token-level TTS.

## 5. Codex Goal Prompt

```text
Goal:
Upgrade Jarvis Voice Sight from push-to-talk demo toward reliable realtime voice interaction.

Phase 1: v0.2.1 Demo Stability

Implement:
1. Update Jarvis persona to natural interaction mode:
   - Traditional Chinese only
   - 6–18 Chinese characters
   - natural Taiwanese Mandarin
   - do not always ask questions
   - prefer acknowledgement, reflection, or light guidance
   - ask only when clarification is needed
   - avoid formal customer-service wording

2. Add turn_id to every voice turn.
   - Generate turn_id at voice-turn start.
   - Attach turn_id to ASR, LLM, TTS, and playback responses.
   - Discard stale audio if turn_id is no longer active.

3. Add TTS text finalizer.
   - Remove markdown, JSON, role tags, URLs, emojis.
   - Normalize punctuation.
   - Enforce max spoken length.
   - Output pure spoken Traditional Chinese.

4. Add deterministic TTS audio cache.
   - Cache by normalized reply_text.
   - Pre-generate cache audio for common short replies.
   - On cache hit, skip BreezyVoice upstream.
   - Report tts_cache_hit in response.

5. Add latency metrics.
   - asr_ms
   - llm_ms
   - tts_ms
   - playback_ms
   - total_ms
   - tts_cache_hit

6. Add npm run demo:real.
   - Start all real services.
   - Run health check.
   - Run preflight.
   - Print Ready for Demo.

Acceptance:
- npm run typecheck passes
- npm run lint passes
- npm run test passes
- npm run real:health passes
- npm run real:preflight passes
- Cached TTS replies return under 500ms
- Every /api/v1/voice-turn response includes turn_id and latency fields
- Persona no longer always asks questions

Phase 2: v0.3 Realtime Interaction

Implement:
1. Add VAD State Manager.
   States:
   - idle
   - listening
   - user_speaking
   - asr_processing
   - thinking
   - speaking
   - interrupted
   - error_recovery

2. Add VAD thresholds:
   - START_SPEECH_PROB = 0.6
   - END_SPEECH_PROB = 0.3
   - MIN_SPEECH_MS = 200
   - END_SILENCE_MS = 700
   - BARGE_IN_MS = 300

3. Add barge-in support.
   When state is speaking and human speech is detected for BARGE_IN_MS:
   - stop audio player
   - clear TTS queue
   - cancel active turn
   - transition to listening

4. Add always-listening mode.
   - Mic remains open.
   - VAD detects utterance start and end.
   - Completed utterance is sent to ASR automatically.

5. Add sentence-level LLM to TTS streaming.
   - Stream LLM tokens.
   - Buffer tokens until complete sentence.
   - Finalize sentence for TTS.
   - Enqueue sentence to TTS queue.
   - Do not do token-level TTS yet.

6. Add frontend runtime state display.
   Display:
   - Listening
   - Understanding
   - Thinking
   - Speaking
   - Interrupted
   - Error recovery

Acceptance:
- User can speak without pressing stop manually.
- Jarvis stops speaking within 500ms when user interrupts.
- No stale TTS audio is played after interruption.
- No duplicate playback across 50 turns.
- Runtime state is visible in UI.
- Existing v0.2.1 tests still pass.
```

## 6. Demo Explanation

Recommended interview framing:

```text
v0.2 先用 short reply 和 TTS cache 保證 demo 體感。
v0.3 會把低延遲從 persona workaround 升級成架構能力：
VAD、barge-in、turn cancellation、sentence-level streaming。
```

Why this matters:

```text
It shows the system is not just model chaining. It demonstrates product-grade voice system design.
```

## 7. Engineering Decision

The next implementation should not jump directly to full realtime streaming.

Recommended order:

1. Finish v0.2.1 demo stability.
2. Prove turn ID cancellation and stale audio prevention.
3. Add VAD state manager.
4. Add barge-in.
5. Add always-listening.
6. Add sentence-level streaming.
7. Only then evaluate token-level TTS or lower-level audio streaming.

This sequence reduces demo risk and keeps architecture extensible.
