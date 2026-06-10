# Jarvis Voice Sight Implementation Status v0.4 -> v0.5

Recorded date: 2026-06-10

## 1. Implemented

Jarvis Voice Sight now carries the v0.5 realtime voice agent prototype contract
on top of the existing v0.4 long-form TTS architecture.

Implemented v0.5 controls:

```text
ASR / LLM / TTS provider aliases remain behind orchestrator ports
LLM_PROVIDER=ollama and LLM_PROVIDER=vllm accepted by orchestrator config
LLM_RUNTIME=vllm supported by the LLM wrapper through OpenAI-compatible chat completions
VLLM_BASE_URL and VLLM_MODEL added to env templates
MAX_PARALLEL_TTS_WORKERS / CHUNK_TARGET_SECONDS / SILENCE_PADDING_MS aliases added
v0.5 latency aliases added to voice-turn and streaming completion latency
long-form streaming completion now exposes audio_stitch metadata for WAV normalization, silence padding, and stitching verification
demo:real starts LLM wrapper and TTS wrapper explicitly
demo:real reuses already healthy LLM/TTS wrappers to avoid duplicate port binds
demo:real derives LLM_RUNTIME=vllm from LLM_PROVIDER=vllm when LLM_RUNTIME is not set
demo:real chooses Ollama startup or vLLM endpoint check from env
```

Existing v0.3.1 / v0.4 controls preserved:

```text
always-listening browser mode
VAD state manager
barge-in interruption
turn cancellation and stale audio discard
sentence-level LLM streaming
ordered audio_chunk events with type and event fields
parallel long-form TTS chunk synthesis
short-reply TTS cache
push-to-talk fallback
```

## 2. Provider Switching

Ollama path:

```env
LLM_PROVIDER=ollama
LLM_RUNTIME=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b
```

vLLM path:

```env
LLM_PROVIDER=vllm
LLM_RUNTIME=vllm
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODEL=gemma-4-e2b
```

ASR and TTS remain independent:

```env
ASR_PROVIDER=breeze_asr
TTS_PROVIDER=breezyvoice
```

## 3. Latency Contract

Every `/api/v1/voice-turn` response keeps existing latency fields and now also
includes v0.5 aliases:

```text
llm_first_token_ms
llm_total_ms
tts_first_audio_ms
tts_total_ms
playback_start_ms
tts_parallel_chunks
```

Compatibility fields remain:

```text
llm_ms
tts_ms
playback_ms
playback_delay_ms
perceived_total_ms
tts_cache_hit
```

Long-form streaming completion also mirrors:

```text
tts_time_to_first_audio_ms -> tts_first_audio_ms
tts_total_synthesis_ms -> tts_total_ms
playback_start_delay_ms -> playback_start_ms
tts_chunk_count -> tts_parallel_chunks
```

## 4. Demo Script

`npm run demo:real` now:

```text
loads .env.real.example, .env, and .env.real
starts Ollama when LLM_RUNTIME/LLM_PROVIDER is not vllm
checks VLLM_BASE_URL /models when LLM_RUNTIME or LLM_PROVIDER is vllm
starts Breeze-ASR
starts BreezyVoice upstream
starts Jarvis LLM wrapper
starts Jarvis TTS wrapper
reuses existing healthy LLM/TTS wrappers when they are already serving /health
starts orchestrator
starts web UI
runs real:health
runs real:preflight
prints Ready for Demo
```

Long-form `voice_turn_completed` events include:

```json
{
  "audio_stitch": {
    "sample_rate_verified": true,
    "normalized": true,
    "silence_padding_ms": 160,
    "total_duration_ms": 12345
  }
}
```

## 5. Current Limitations

```text
vLLM server startup is not bundled; demo:real expects an external vLLM OpenAI-compatible endpoint when LLM_RUNTIME=vllm
real preflight currently validates the available local Ollama runner and BreezyVoice/ASR GPU paths
browser VAD is still lightweight RMS-driven
WAV normalization / stitching remains represented as orchestrator merge metadata
in-flight upstream TTS request abort is still a future refinement
Taiwan Mandarin voice quality fine-tuning is planned but not implemented
```

## 6. Verification Results

Commands run:

```bash
npm run typecheck
npm run lint
npm run test
python3 -m py_compile services/llm/src/server.py
npm run smoke:realtime
npm run real:health
npm run real:preflight
npm run demo:real
```

Results:

```text
typecheck: passed
lint: passed
tests: 59 orchestrator tests passed; 7 TTS cache tests passed
LLM wrapper Python compile: passed
realtime smoke: passed with audio_chunk stream and interrupted_then_listening barge-in check
real:health: passed with providers asr=breeze_asr, llm=ollama, tts=breezyvoice, emotion=mock
real:preflight: passed for RTX GPU, Breeze-ASR, Ollama, BreezyVoice, and TTS warmup cache
demo:real: passed, reused already healthy wrappers, and printed Ready for Demo
```

## 7. Next Risks

```text
vLLM runtime needs a live endpoint smoke test once a vLLM server is running
demo:real should eventually learn how to start a local vLLM server when a standard launch command is available
real WAV stitching should validate sample rate, loudness normalization, and padding with BreezyVoice outputs
parallel TTS worker count should be profiled against GPU memory pressure
Taiwan Mandarin voice quality needs licensed data, matched transcript, accent evaluation, and consent controls
```
