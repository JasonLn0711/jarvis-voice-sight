# Codex Goal Prompt: Jarvis Voice Sight v0.2.1 → v0.3

Status: Canonical next-phase implementation prompt

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

Source: VOISS AI feedback after v0.2 demo preparation

Latest sync note: This prompt has been reconciled with the later VOISS
suggestion that says "先穩，再 realtime". The implementation should keep
demo-stability work explicit even if the repository has already advanced into
the v0.3.1 / v0.4 line.

Purpose: This file gives Codex a direct implementation prompt for upgrading
Jarvis Voice Sight from the current push-to-talk demo into a stable v0.2.1 demo
and then a v0.3 realtime voice interaction system.

Version mapping note:

```text
The VOISS suggestion calls the realtime phase v0.3.
In the current repository line, that work is split as:
- v0.3 preview: first always-listening and sentence-level streaming path
- v0.3.1 hardening: reliable always-listening, barge-in, cancellation, and tests
- v0.4: long-form TTS chunking, parallel synthesis, chunk cache, and metrics
```

Related baseline prompt:

```text
docs/CODEX_GOAL_PROMPT_v0.1_to_v0.2.md
```

Related feedback roadmap:

```text
docs/VOISS_FEEDBACK_ROADMAP_v0.2.1_to_v0.3.md
```

## Codex Prompt

```text
You are Codex working inside the GitHub repository:

jarvis-voice-sight

Goal:
Upgrade Jarvis Voice Sight from the current v0.2 push-to-talk real-model demo
toward reliable realtime voice interaction.

Implementation rule:
Do this in two phases.

Phase 1 is v0.2.1 Demo Stability.
Phase 2 is v0.3 Realtime Interaction.

Do not skip v0.2.1.
Do not jump directly into full realtime streaming before the current demo is stable.
Do not add RAG, tool calling, long-term memory, login, database, or autonomous agent behavior.

Core product principle:

v0.2 first uses short replies and TTS cache to protect demo feel.
v0.3 upgrades low latency from persona workaround into architecture capability:
VAD, barge-in, turn cancellation, TTS queue cancellation, and sentence-level streaming.

Current system:

- Frontend: Next.js, TypeScript, Framer Motion, Tailwind CSS
- Orchestrator: Node.js, TypeScript, Fastify, Zod, pino
- ASR: Breeze-ASR-25 through faster-whisper
- LLM: Gemma 4 E4B int4
- TTS: BreezyVoice
- Emotion: mock / text classifier
- GPU policy: AI model inference must use RTX GPU, not CPU
- Main endpoint: POST /api/v1/voice-turn
- Existing demo mode: push-to-talk plus mock mode fallback

Phase 1: v0.2.1 Demo Stability

Goal:
Make the current demo interview-ready without large architecture changes.

Implement:

1. Update Jarvis persona to natural interaction mode.

Rules:
- Traditional Chinese only
- natural spoken Taiwanese Mandarin
- reply in 6 to 18 Chinese characters
- do not always ask questions
- prefer acknowledgement, reflection, or light guidance
- ask only when clarification is needed
- avoid formal customer-service wording
- never use bullet points
- never explain system behavior
- never mention being an AI model
- never promise financial returns
- never recommend a specific insurance or investment product

Good reply examples:
- 好，這樣比較順。
- 這裡先求穩。
- 我懂，先別急。
- 這段可以收斂。
- 先抓最小版本。

2. Add turn_id propagation to every voice turn.

Requirements:
- Generate turn_id at voice-turn start.
- Attach turn_id to ASR, LLM, TTS, playback, and logs.
- Ensure client tracks activeTurnId.
- Discard stale audio when turn_id is no longer active.

Required behavior:

if (currentTurnId !== audio.turnId) {
  discardAudio();
}

3. Add TTS text finalizer.

The finalizer must:
- remove markdown
- remove JSON
- remove role tags
- remove URLs
- remove emojis
- normalize punctuation
- enforce max spoken length
- output pure spoken Traditional Chinese
- preserve natural Taiwan Mandarin style

4. Add deterministic TTS audio cache.

Requirements:
- Cache by normalized reply text.
- Pre-generate cache audio for common short replies.
- On cache hit, skip BreezyVoice upstream.
- Report tts_cache_hit in response.
- Keep cache storage outside source control.

Initial cache set:
- 好，我在。
- 我懂。
- 繼續說。
- 先別急。
- 這裡先求穩。
- 可以，這樣順。
- 先抓最小版本。
- 這段可以收斂。
- 你已經接近了。
- 我們先拆小。
- 先建立信任感。
- 避免承諾報酬。
- 先尊重他的節奏。
- 先不要急著推。
- 用關心的語氣。
- 這比推產品好。
- 這就是信任感。
- 可以，先穩穩聊。
- 家庭責任是切入點。
- 先聊他的生活。

Target:
- cached TTS reply returns under 500ms

5. Add latency metrics.

Every /api/v1/voice-turn response must include:
- turn_id
- transcript
- reply
- latency.asr_ms
- latency.llm_ms
- latency.tts_ms
- latency.playback_ms or latency.playback_delay_ms
- latency.total_ms
- tts_cache_hit
- latency.tts_cache_hit as a compatibility mirror
- if both playback_ms and playback_delay_ms exist, playback_ms should mirror the
  current playback delay / pacing value

Keep existing richer fields if already present:
- vad_ms
- emotion_ms
- policy_ms
- audio_encode_ms
- perceived_total_ms

6. Add one-command real demo boot.

Add:

npm run demo:real

It should:
- start ASR
- start Ollama
- start LLM wrapper
- start TTS wrapper
- start BreezyVoice
- start Web UI
- run health check
- run preflight
- print Ready for Demo

Implementation note:
Use scripts where possible. Do not hard-code secrets. Do not commit private audio.

7. Add tests for v0.2.1.

Required tests:
- persona no longer always asks questions
- TTS finalizer removes markdown / JSON / URLs / emojis
- cache hit skips upstream TTS
- cache miss calls upstream TTS
- turn_id exists in voice-turn response
- stale audio is discarded on the frontend when turn_id mismatches
- latency fields exist
- tts_cache_hit is reported
- latency.tts_cache_hit mirrors the top-level tts_cache_hit value
- latency.playback_ms is present as a compatibility alias when playback pacing is reported

Acceptance:
- npm run typecheck passes
- npm run lint passes
- npm run test passes
- npm run real:health passes
- npm run real:preflight passes
- cached TTS replies return under 500ms
- every /api/v1/voice-turn response includes turn_id and latency fields
- persona no longer always asks questions
- stale audio cannot play after a newer turn starts

Phase 2: v0.3 Realtime Interaction

Goal:
Upgrade Jarvis from push-to-talk to realtime voice interaction:
continuous listening, automatic utterance detection, interruption, cancellation,
and sentence-level streaming.

Do not implement token-level TTS first.
Do sentence-level streaming first.

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

Use a typed state machine.
Do not scatter state transitions across unrelated hooks.

2. Add VAD thresholds.

Defaults:
- START_SPEECH_PROB = 0.6
- END_SPEECH_PROB = 0.3
- MIN_SPEECH_MS = 200
- END_SILENCE_MS = 700
- BARGE_IN_MS = 300

Make thresholds configurable from constants or config.

3. Add barge-in support.

When state is speaking and human speech is detected for BARGE_IN_MS:
- stop audio player
- clear TTS queue
- cancel active turn
- transition to listening
- show Interrupted, then Listening

Acceptance:
- Jarvis stops speaking within 500ms when interrupted.

4. Add always-listening mode.

Current:
press record -> speak -> stop -> process

Target:
continuous listening -> VAD detects utterance -> automatically send to ASR

Requirements:
- mic remains open when always-listening is enabled
- VAD detects speech start
- VAD detects speech end
- completed utterance is sent to ASR automatically
- push-to-talk fallback still works

5. Add sentence-level LLM to TTS streaming.

Flow:
ASR complete utterance
-> LLM streaming
-> buffer tokens until complete sentence
-> TTS finalizer
-> enqueue sentence to TTS queue
-> playback

Rules:
- do not do token-level TTS yet
- each sentence chunk must carry turn_id
- stale chunks must be discarded
- cancellation must clear queued chunks

6. Add cancellable TTS queue.

Required interface:

class TtsQueue {
  clear(turnId: string) {}
  enqueue(sentence: string, turnId: string) {}
  cancel(turnId: string) {}
}

Rules:
- no stale audio chunk from an old turn may play after interruption
- no duplicate playback across long sessions
- all audio chunks must be associated with turn_id

7. Add frontend runtime state display.

Display:
- Listening
- Understanding
- Thinking
- Speaking
- Interrupted
- Error recovery

The UI should remain premium and voice-first.
Do not turn it into a dashboard.
Do not show raw JSON.

8. Add v0.3 tests.

Required tests:
- VAD state transitions
- barge-in stops playback
- turn cancellation clears TTS queue
- stale audio chunks are discarded
- sentence buffer emits only complete sentences
- no duplicate playback across 50 turns
- push-to-talk fallback still works

Acceptance:
- user can speak without pressing stop manually
- Jarvis stops speaking within 500ms when user interrupts
- no stale TTS audio is played after interruption
- no duplicate playback across 50 turns
- runtime state is visible in UI
- existing v0.2.1 tests still pass
- npm run typecheck passes
- npm run lint passes
- npm run test passes

Final output:
When finished, report:
1. what was implemented
2. how to run v0.2.1 demo mode
3. how to run v0.3 realtime mode
4. current limitations
5. files changed
6. test results
7. next engineering risks
8. version mapping if repository labels differ from this prompt
```

## Implementation Order

1. Lock v0.2.1 persona and TTS text finalizer.
2. Add turn ID propagation and stale playback discard.
3. Harden TTS cache and common reply warmup.
4. Add `npm run demo:real`.
5. Add v0.2.1 tests and verification.
6. Add VAD state manager behind a feature flag.
7. Add always-listening mode behind a feature flag.
8. Add barge-in and turn cancellation.
9. Add cancellable TTS queue.
10. Add sentence-level streaming.
11. Add v0.3 tests and runtime UI state.

## Demo Framing

```text
v0.2 先用 short reply 和 TTS cache 保證 demo 體感。
v0.3 會把低延遲從 persona workaround 升級成架構能力：
VAD、barge-in、turn cancellation、sentence-level streaming。
```
