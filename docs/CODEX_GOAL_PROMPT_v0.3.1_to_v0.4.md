# Codex Goal Prompt: Jarvis Voice Sight v0.3.1 -> v0.4

Use this prompt to continue Jarvis Voice Sight after the VOISS post-demo
feedback.

Version mapping note:

```text
VOISS feedback sometimes labels the realtime phase as v0.3 or v0.4 depending on
when the recommendation was written.

In this repository line:
- v0.2.1 = demo stability: natural persona, TTS finalizer, TTS cache,
  turn_id propagation, latency breakdown, and one-command real demo boot.
- v0.3 = first realtime preview: always-listening path and sentence-level
  streaming.
- v0.3.1 = realtime hardening: reliable always-listening, barge-in,
  cancellation, stale audio discard, and smoke coverage.
- v0.4 = long-form TTS architecture: sentence splitting, chunk planning,
  bounded parallel TTS, ordered audio_chunk streaming, chunk cache, and
  time-to-first-audio metrics.

If a future instruction says "v0.4 realtime", treat it as the v0.3/v0.3.1
realtime requirements unless it explicitly asks for long-form TTS.
```

```text
You are Codex working inside the GitHub repository:

jarvis-voice-sight

Goal:
Upgrade Jarvis Voice Sight from a realtime preview into a reliable realtime
voice system with long-form TTS support.

Product context:
VOISS feedback clarified that a production realtime voice system should:
1. keep listening continuously,
2. allow the user to interrupt while Jarvis is speaking,
3. avoid depending on artificially short replies to hide TTS latency,
4. support longer speech by chunking, parallelizing, and streaming TTS output.

Current stack:
- ASR: Breeze-ASR-25 through faster-whisper / CTranslate2
- LLM: Gemma 4 E4B int4 through Ollama on RTX GPU
- TTS: BreezyVoice through OpenAI-compatible TTS API on RTX GPU
- Orchestrator: Node.js / TypeScript / Fastify
- Frontend: Next.js / TypeScript

Strict engineering rules:
1. The orchestrator owns the workflow.
2. Frontend must not call model services directly.
3. ASR, LLM, TTS, and Emotion remain replaceable adapters.
4. All realtime audio chunks must carry turn_id.
5. Stale audio from cancelled turns must never play.
6. Barge-in must cancel playback and pending TTS work.
7. Long-form TTS must be sentence-level first, not token-level TTS.
8. Use feature flags for risky realtime and long-form TTS behavior.
9. Keep push-to-talk fallback working.
10. Do not add RAG, tool calling, login, or long-term memory in this phase.

Reference docs:
- docs/VOISS_NEXT_VERSION_DESIGN_v0.3.1_to_v0.4.md
- docs/VOISS_FEEDBACK_ROADMAP_v0.2.1_to_v0.3.md
- docs/CODEX_GOAL_PROMPT_v0.2.1_to_v0.3.md
- docs/REAL_MODEL_INTEGRATION.md
- docs/LATENCY_OPTIMIZATION_REPORT.md

Carry-forward v0.2.1 demo-stability contract:
- Jarvis persona stays natural spoken Taiwanese Mandarin.
- Replies should not always be questions.
- TTS text finalizer removes markdown, JSON, role tags, URLs, emojis, and
  excess punctuation.
- Deterministic short-reply TTS cache remains active.
- `/api/v1/voice-turn` responses include `turn_id`, top-level
  `tts_cache_hit`, and latency fields.
- `latency.tts_cache_hit` mirrors top-level `tts_cache_hit`.
- `latency.playback_ms` mirrors `latency.playback_delay_ms` when playback
  pacing is reported.
- `npm run demo:real`, `npm run real:health`, and `npm run real:preflight`
  remain the real-demo entrypoints.

Phase 1: v0.3.1 Realtime Interaction Hardening

Implement:
1. Promote always-listening mode from preview to a stable runtime mode.
2. Harden VAD state manager.

States:
- idle
- listening
- user_speaking
- asr_processing
- thinking
- speaking
- interrupted
- error_recovery

Default thresholds:
- START_SPEECH_PROB = 0.6
- END_SPEECH_PROB = 0.3
- MIN_SPEECH_MS = 200
- END_SILENCE_MS = 700
- BARGE_IN_MS = 300

3. Add barge-in cancellation.
When Jarvis is speaking and user speech is detected for BARGE_IN_MS:
- stop audio player
- clear TTS queue
- cancel active turn
- discard queued audio chunks for the old turn
- transition to listening

4. Add turn-scoped playback checks.
Every audio chunk must include:
- turn_id
- chunk_id
- sequence
- audio_url
- is_final

Client rule:
if chunk.turn_id !== active_turn_id, discard the chunk.

5. Add TTS queue cancellation.

Implement:
class TtsQueue {
  enqueue(chunk, turnId)
  clear(turnId)
  cancel(turnId)
  getPending(turnId)
}

6. Add v0.3.1 tests.
Required tests:
- VAD state transitions
- barge-in stops playback
- cancellation clears pending TTS chunks
- stale audio chunk is discarded
- no duplicate playback across 50 turns
- push-to-talk fallback still works

Acceptance:
- npm run typecheck passes
- npm run lint passes
- npm run test passes
- npm run smoke:realtime passes
- user can speak without pressing stop manually
- Jarvis stops speaking within 500ms after barge-in
- no stale audio plays after interruption
- v0.2.1 demo-stability tests and API compatibility fields still pass

Phase 2: v0.4 Long-Form TTS

Implement:
1. Add TTS sentence splitter.
It should split Traditional Chinese and mixed Chinese-English text by sentence
boundaries without breaking names, numbers, URLs, or abbreviations.

2. Add TTS chunk planner.

Type:
type TtsChunk = {
  chunkId: string;
  turnId: string;
  index: number;
  text: string;
  estimatedDurationMs: number;
};

type TtsChunkPlan = {
  turnId: string;
  chunks: TtsChunk[];
};

Chunking rules:
- target spoken duration: 3-5 seconds
- preserve semantic boundaries
- preserve original order
- reject empty chunks
- keep each chunk safe for BreezyVoice

3. Add bounded parallel TTS synthesis.

Environment:
TTS_LONG_FORM_ENABLED=true|false
TTS_MAX_PARALLEL_CHUNKS=2
TTS_TARGET_CHUNK_SECONDS=4
TTS_SENTENCE_SILENCE_MS=160

4. Add ordered streaming audio chunks.
The orchestrator should return or stream each chunk as it becomes ready:

{
  "event": "audio_chunk",
  "turn_id": "...",
  "chunk_id": "...",
  "sequence": 1,
  "audio_url": "...",
  "is_final": false
}

5. Add audio normalization and silence padding.
For merged long-form audio:
- verify sample rate
- normalize loudness across chunks
- add 120-220ms silence between sentence chunks
- concatenate in sequence order

6. Add chunk-level cache.

Cache key:
sha256(speaker_id + normalized_text + voice_style + model_version)

Cache metadata:
- cache_hit
- upstream_tts_ms
- normalized_text
- model_version
- speaker_id

7. Add long-form latency metrics.

Report:
- tts_chunk_count
- tts_parallelism
- tts_time_to_first_audio_ms
- tts_total_synthesis_ms
- tts_merge_ms
- tts_cache_hit_count
- tts_cache_miss_count
- tts_first_chunk_cache_hit
- playback_start_delay_ms

Primary metric:
Time To First Audio

8. Add v0.4 tests.
Required tests:
- sentence splitter handles zh-TW punctuation
- chunk planner creates ordered non-empty chunks
- chunk planner respects max duration estimate
- parallel TTS preserves playback order
- cancellation stops pending chunks
- stale chunks do not play
- chunk cache hit skips upstream TTS
- long-form latency fields exist

Acceptance:
- a 30-second answer can be split into chunks
- first audio starts before all chunks are synthesized
- chunk order is preserved
- barge-in cancels pending chunks
- no stale chunk plays after cancellation
- short-reply cache still works
- long-form TTS can be disabled by config
- v0.2.1 demo-stability contract remains intact
- npm run typecheck passes
- npm run lint passes
- npm run test passes
- npm run smoke:realtime passes

Phase 3: Taiwan Mandarin Voice Quality Track

Plan but do not fully implement unless explicitly requested:
1. Prepare dataset pipeline for 3-5 hours of licensed or consented single-speaker
   Taiwan Mandarin audio.
2. Chunk audio into 5-10 second segments.
3. Require matched transcript for every speaker prompt and training chunk.
4. Evaluate speaker similarity, accent naturalness, synthesized word accuracy,
   prosody stability, inference latency, and GPU memory usage.
5. Compare baseline BreezyVoice, zero-shot prompt, and speaker-encoder adapted
   versions.

Important:
Do not use unlicensed voice data.
Do not clone a speaker without consent.
Do not change decoder sample rate or token alignment path before the chunked TTS
architecture is measured.

Final output should include:
1. what was implemented
2. how to run v0.3.1 realtime mode
3. how to run v0.4 long-form TTS mode
4. environment variables added
5. current limitations
6. files changed
7. test results
8. next risks for BreezyVoice latency and Taiwan Mandarin voice quality
9. version mapping if external feedback uses different labels
```
