# Jarvis Voice Sight Implementation Status v0.3.1 -> v0.4

Recorded date: 2026-06-10

## 1. Implemented

Jarvis Voice Sight now has a hardened realtime interaction path and an optional
long-form TTS path behind feature flags.

Implemented realtime controls:

```text
always-listening browser mode
hardened VAD state manager
barge-in detection at 300ms
active turn cancellation in the browser
turn-scoped stale playback guard
cancellable TTS queue with pending inspection
push-to-talk fallback
```

Implemented long-form TTS controls:

```text
Traditional Chinese and mixed Chinese-English sentence splitter
sentence-level chunk planner
bounded parallel TTS synthesis
ordered audio_chunk streaming
chunk-level cache keyed by speaker, normalized text, style, and model version
time-to-first-audio latency fields
real PCM WAV stitching with sample-rate verification, peak normalization, bounded silence padding, and parseable stitched-audio evidence
```

The streaming audio event contract is:

```json
{
  "type": "audio_chunk",
  "event": "audio_chunk",
  "turn_id": "turn_001",
  "chunk_id": "turn_001_chunk_0",
  "sequence": 0,
  "audio_url": "/mock-audio/chunk.wav",
  "is_final": false
}
```

## 2. How To Run v0.3.1 Realtime Mode

```bash
npm run dev
```

Open:

```text
http://localhost:3001
```

Use `enable realtime mode`. Jarvis keeps listening, detects utterance end,
streams sentence-level TTS through the orchestrator, and stops playback on
barge-in. Push-to-talk remains available when realtime mode is off.

## 3. How To Run v0.4 Long-Form TTS Mode

```bash
TTS_LONG_FORM_ENABLED=true \
TTS_MAX_PARALLEL_CHUNKS=2 \
TTS_TARGET_CHUNK_SECONDS=4 \
TTS_SENTENCE_SILENCE_MS=160 \
npm run dev
```

Long-form mode uses `/api/v1/voice-turn-stream`. The orchestrator keeps model
services behind adapters, plans the reply into sentence chunks, synthesizes with
bounded parallelism, and streams chunks in playback order.

## 4. Environment Variables Added

```text
TTS_LONG_FORM_ENABLED=false
TTS_MAX_PARALLEL_CHUNKS=2
TTS_TARGET_CHUNK_SECONDS=4
TTS_SENTENCE_SILENCE_MS=160
TTS_MODEL_VERSION=breezyvoice-default
```

## 5. Current Limitations

```text
long-form TTS is sentence-level, not token-level
browser VAD is still lightweight RMS-driven
browser barge-in aborts the active stream and propagates an AbortSignal into HTTP TTS requests
real WAV concatenation now exists for PCM 16-bit WAV chunks and still needs a live BreezyVoice long-form evidence capture
Taiwan Mandarin voice quality work is planned but not implemented
```

## 6. Verification Results

Commands run:

```bash
npm run typecheck
npm run lint
npm run test
npm run smoke:realtime
```

Results:

```text
typecheck: passed
lint: passed
tests: 57 orchestrator tests passed; 6 TTS cache tests passed
realtime smoke: passed with audio_chunk stream event and interrupted_then_listening barge-in check
```

## 7. Taiwan Mandarin Voice Quality Track

This phase prepares the voice-quality path without using unlicensed voice data
or cloning a speaker without consent.

Planned pipeline:

```text
3-5 hours licensed or consented single-speaker Taiwan Mandarin audio
5-10 second chunks
matched transcript for every prompt and training chunk
noise and music filtering
loudness normalization
train / validation split
```

Evaluation track:

```text
speaker similarity
accent naturalness
synthesized word accuracy
prosody stability
inference latency
GPU memory usage
```

Comparison set:

```text
baseline BreezyVoice
zero-shot prompt
speaker-encoder adapted version
```

## 8. Next Risks

```text
BreezyVoice parallelism may saturate GPU memory; keep TTS_MAX_PARALLEL_CHUNKS bounded
long chunks can still delay first audio if sentence estimates are too optimistic
transport-level cancellation now reaches HTTP TTS fetch calls; provider-specific upstream cancellation still depends on the TTS runtime honoring request abort
real audio merge should be re-measured with BreezyVoice outputs under GPU load
Taiwan Mandarin quality depends on consented data quality and transcript alignment
```
