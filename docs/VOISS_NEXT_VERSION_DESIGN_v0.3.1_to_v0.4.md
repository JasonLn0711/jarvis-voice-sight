# VOISS Next Version Design: Jarvis Voice Sight v0.3.1 -> v0.4

Date: 2026-06-10
Owner: Jason Lin
Context: VOISS AI post-demo feedback

## 1. Design Thesis

Jarvis Voice Sight should move from a short-turn demo into a realtime voice
system that can stay open, be interrupted, and handle longer responses without
making the user wait for one large TTS job.

The next version should be designed from first principles:

```text
Voice product quality = interruption handling + latency control + speech naturalness
```

Short replies and TTS cache are useful for the v0.2 demo, but they are not the
final product architecture. VOISS feedback correctly identifies two production
requirements:

1. Jarvis should continuously listen and support barge-in.
2. Jarvis should not rely on artificially short replies to hide TTS latency.

The next engineering step is therefore:

```text
v0.3.1: make realtime interaction reliable
v0.4: make longer TTS practical through chunked parallel synthesis
```

## 2. Source Feedback

Max feedback summary:

```text
Realtime should keep listening and allow interruption.
The user should not need to press or pause the microphone.
If TTS sentences are long, latency becomes a problem.
```

Jason follow-up observations:

```text
Lowering sample rate can break decoder token alignment.
Some alternative voices sound China-accented.
Zero-shot voice cloning still carries accent and speaker-quality risk.
Speaker encoder fine-tuning may be needed.
Podcast-style single-speaker data can be chunked into 5-10 second segments.
Long text can be sentence-split, synthesized in parallel, normalized, padded,
and merged into one audio stream.
```

## 3. Version Plan

## v0.3.1: Realtime Interaction Hardening

Goal:

```text
Jarvis can keep listening, detect user speech, and stop speaking when interrupted.
```

This phase turns the current v0.3 preview into reliable realtime interaction.

### 3.1 Scope

Included:

1. Always-listening mode as a first-class runtime mode.
2. Browser-side VAD state manager.
3. Barge-in detection during playback.
4. Active turn cancellation.
5. Stale TTS audio discard.
6. Cancellable TTS queue.
7. Runtime state display.
8. Push-to-talk fallback.

Deferred:

1. Full-duplex token-level TTS.
2. Speaker encoder fine-tuning.
3. Long-form parallel TTS.
4. Long-term memory.
5. Tool calling.

### 3.2 Runtime States

```ts
type RealtimeVoiceState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "asr_processing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error_recovery";
```

### 3.3 State Machine

```text
idle
  -> listening
  -> user_speaking
  -> asr_processing
  -> thinking
  -> speaking
  -> listening
```

Barge-in path:

```text
speaking
  -> user_speaking detected for BARGE_IN_MS
  -> interrupted
  -> cancel current turn
  -> stop playback
  -> clear TTS queue
  -> listening
```

### 3.4 VAD Thresholds

Initial thresholds:

```text
START_SPEECH_PROB = 0.6
END_SPEECH_PROB = 0.3
MIN_SPEECH_MS = 200
END_SILENCE_MS = 700
BARGE_IN_MS = 300
```

These values should be configurable because browser microphone quality and room
noise vary widely.

### 3.5 Turn Cancellation Contract

Every active operation must carry the same `turn_id`.

```ts
type TurnScopedAudioChunk = {
  turnId: string;
  chunkId: string;
  audioUrl: string;
  sequence: number;
};
```

Playback rule:

```ts
if (chunk.turnId !== activeTurnId) {
  discardAudioChunk(chunk);
}
```

Cancellation rule:

```ts
cancelTurn(activeTurnId);
audioPlayer.stop();
ttsQueue.clear(activeTurnId);
```

### 3.6 Acceptance Criteria

v0.3.1 is accepted only if:

1. User can speak without manually pressing stop.
2. Jarvis stops speaking within `500ms` after barge-in.
3. No stale audio from an old turn is played.
4. No duplicate playback occurs across 50 turns.
5. Push-to-talk fallback still works.
6. Runtime state is visible in the UI.
7. Existing v0.2.1 tests still pass.

## v0.4: Long-Form TTS Architecture

Goal:

```text
Jarvis can speak longer answers without waiting for one full long TTS request.
```

This phase addresses the core TTS bottleneck directly. It should not depend on
making every reply short.

### 4.1 First-Principles Problem

BreezyVoice must generate waveform samples for the spoken output. If the output
is long, the system waits for a large audio generation job before playback can
begin.

Observed problem:

```text
longer text -> longer acoustic generation -> slower first playback
```

The design goal is to reduce time-to-first-audio, not only total synthesis time.

### 4.2 Proposed Solution

Use sentence-level chunking and parallel synthesis.

```text
Input text
  -> sentence splitter
  -> chunk planner
  -> parallel TTS workers
  -> loudness normalization
  -> silence padding
  -> ordered merge / streaming playback
```

Example:

```text
30 seconds of text
  -> split into 6 chunks
  -> each chunk targets 3-5 seconds
  -> synthesize chunks concurrently
  -> normalize and pad boundaries
  -> play chunk 1 while chunks 2-6 finish
```

### 4.3 TTS Chunk Planner

Responsibilities:

1. Split text by punctuation and semantic boundaries.
2. Keep each chunk around `3-5s` spoken duration.
3. Avoid cutting numbers, names, and mixed Chinese-English phrases incorrectly.
4. Preserve final playback order.
5. Emit chunk metadata for logging and cancellation.

Type:

```ts
type TtsChunkPlan = {
  turnId: string;
  chunks: TtsChunk[];
};

type TtsChunk = {
  chunkId: string;
  index: number;
  text: string;
  estimatedDurationMs: number;
};
```

### 4.4 Parallel TTS Workers

The TTS service should support bounded parallelism:

```text
TTS_MAX_PARALLEL_CHUNKS = 2 or 3
```

Reason:

1. Parallelism reduces total wall-clock time.
2. Unbounded parallelism can overload GPU memory.
3. Ordered playback still requires chunk sequence control.

### 4.5 Streaming Playback Contract

The orchestrator should emit audio chunks as they become ready:

```json
{
  "event": "audio_chunk",
  "turn_id": "turn_abc",
  "chunk_id": "chunk_002",
  "sequence": 2,
  "audio_url": "/audio/turn_abc/chunk_002.wav",
  "is_final": false
}
```

Client playback rule:

```text
play chunk 1 as soon as ready
buffer chunk 2+
never play chunks from cancelled turns
```

### 4.6 Audio Joiner

When a full WAV is needed, combine chunks after synthesis:

```text
chunk wavs
  -> resample check
  -> loudness normalization
  -> short silence padding
  -> concat
  -> final wav
```

Recommended padding:

```text
SENTENCE_SILENCE_MS = 120-220
```

The silence padding should sound conversational, not robotic.

### 4.7 Cache Design

Keep the existing deterministic short-reply cache, then add chunk-level cache:

```text
short_reply_cache: exact normalized reply -> wav
chunk_cache: speaker_id + normalized_chunk_text + style -> wav
```

Cache key:

```text
sha256(speaker_id + normalized_text + voice_style + model_version)
```

### 4.8 Latency Metrics

Add long-form TTS metrics:

```text
tts_chunk_count
tts_parallelism
tts_time_to_first_audio_ms
tts_total_synthesis_ms
tts_merge_ms
tts_cache_hit_count
tts_cache_miss_count
tts_first_chunk_cache_hit
playback_start_delay_ms
```

The primary metric for long-form TTS should be:

```text
Time To First Audio
```

not only total TTS duration.

### 4.9 Acceptance Criteria

v0.4 is accepted only if:

1. A 30-second answer can be split into sentence chunks.
2. First audio starts before all chunks are synthesized.
3. Chunk order is preserved.
4. Barge-in cancels all pending chunks.
5. No stale chunk plays after cancellation.
6. Audio boundaries are normalized and padded.
7. Metrics report time-to-first-audio and total synthesis time.
8. Short-reply cache still works.

## 5. Voice Quality Track

Goal:

```text
Reduce China-accent artifacts and move toward natural Taiwan Mandarin.
```

### 5.1 Data Strategy

Candidate dataset:

```text
single-speaker podcast or clean monologue audio
3-5 hours total
5-10 second chunks
matched transcript for every chunk
Taiwan Mandarin target speaker
explicit consent or license clearance
```

### 5.2 Data Pipeline

```text
raw audio
  -> voice activity segmentation
  -> 5-10s chunking
  -> transcript alignment
  -> noise / music filtering
  -> loudness normalization
  -> train / validation split
```

### 5.3 Fine-Tuning Direction

Priority order:

1. Speaker prompt transcript correctness.
2. Speaker encoder adaptation.
3. Prosody and accent evaluation.
4. Full TTS fine-tuning only after dataset quality is validated.

### 5.4 Evaluation

Track:

```text
accent naturalness
speaker similarity
word accuracy in synthesized speech
prosody stability
inference latency
GPU memory usage
```

Human evaluation should use short A/B samples:

```text
baseline BreezyVoice
zero-shot prompt
speaker-encoder fine-tuned version
```

## 6. Engineering Risks

### 6.1 Decoder Alignment Risk

Changing sample rate or generation path can break token-to-audio alignment.
Therefore, v0.4 should avoid decoder-level changes until sentence chunking and
parallel synthesis are measured.

### 6.2 GPU Saturation Risk

Parallel TTS improves latency but can increase GPU memory pressure. Use bounded
parallelism and expose GPU usage in preflight.

### 6.3 Voice Cloning Governance

Voice cloning should require:

1. Speaker consent.
2. Matched prompt transcript.
3. Source audio provenance.
4. Clear demo-only or production usage scope.

### 6.4 UX Risk

Long-form TTS should not turn Jarvis into a lecture agent. The product should
still prefer concise voice interaction, but the architecture should support
longer replies when the use case requires them.

## 7. Recommended Implementation Order

1. Stabilize v0.3.1 always-listening and barge-in.
2. Add turn-scoped playback and stale chunk discard tests.
3. Add TTS chunk planner with mocked TTS.
4. Add parallel chunk synthesis behind a feature flag.
5. Add ordered streaming playback.
6. Add audio normalization and silence padding.
7. Add time-to-first-audio metrics.
8. Add chunk-level cache.
9. Run 10-turn and 50-turn realtime smoke tests.
10. Start Taiwan Mandarin voice-quality dataset preparation separately.

## 8. Interview Framing

```text
v0.2 demonstrated a complete low-latency voice loop.
VOISS feedback clarified the production gap: realtime interruption and long TTS.
My next version separates those concerns:
v0.3.1 hardens always-listening and barge-in,
v0.4 changes TTS from one long blocking job into cancellable sentence chunks.
```

This frames the project as a voice AI system design effort, not only a model
integration demo.
