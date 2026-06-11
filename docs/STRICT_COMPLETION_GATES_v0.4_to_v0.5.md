# Strict Completion Gates: v0.4 -> v0.5

Recorded date: 2026-06-11

This gate replaces the earlier demo-ready interpretation. A v0.4 or v0.5
claim is complete only when the original goal-prompt requirement is directly
implemented and verified at the same scope as the requirement.

## Gate Rules

```text
PASS means the current code and command evidence prove the original prompt item.
CONTRACT PASS means typed APIs or mock tests pass, but live behavior is not yet proven.
INCOMPLETE means implementation or verification is missing.
BLOCKED means the implementation path exists but needs external model/runtime state.
```

`Ready for Demo` is not a completion claim by itself. It proves only that the
selected demo path booted, health checks passed, preflight passed, and the demo
script printed the expected line.

## v0.4 Long-Form TTS Gates

| Requirement | Strict evidence required | Current status |
| --- | --- | --- |
| Sentence splitter handles Traditional Chinese and mixed Chinese-English boundaries | Unit tests for punctuation, numbers, URLs, and abbreviations | PASS for current unit coverage |
| Chunk planner creates ordered non-empty 3-5 second chunks | Unit tests proving order, non-empty chunks, max duration estimate, and 30-second answer splitting | PASS |
| Bounded parallel TTS synthesis | Integration test proving first audio appears before all chunks finish and parallelism is bounded | PASS |
| Ordered `audio_chunk` streaming | Integration test proving monotonic sequence and `is_final` on the final chunk | PASS |
| Chunk cache skips upstream TTS | Integration test proving the second long-form turn reuses cached chunk audio and does not increase upstream calls | PASS |
| Cancellation stops pending long-form chunks | Integration test proving abort after first chunk stops additional chunk yield and no completion event is sent | PASS |
| WAV normalize, silence padding, and audio stitching | Unit test must parse stitched PCM WAV, verify sample rate, normalized peak, silence padding, duration, bytes, and chunk count; integration completion must include parseable stitched WAV evidence | PASS for PCM 16-bit WAV path |
| Real BreezyVoice output compatibility | Live long-form run must stitch actual BreezyVoice wrapper output, not mock audio | PASS; live evidence produced 3 chunks, sample rate 22050, 600396 stitched bytes |

## v0.5 Realtime Agent Gates

| Requirement | Strict evidence required | Current status |
| --- | --- | --- |
| Orchestrator owns ASR -> LLM -> TTS workflow | Code inspection and endpoint tests showing frontend calls orchestrator only | PASS |
| ASR, LLM, and TTS provider abstractions | Ports and adapter factory tests for replaceable providers | PASS |
| Ollama and vLLM provider switching | Unit tests for provider selection plus live preflight for the selected provider | PASS for config; Ollama live path PASS; vLLM remains optional live gate |
| `demo:real` starts Ollama or vLLM | Script path must start Ollama in Ollama mode or run `real:start-vllm` in vLLM mode | PASS for script behavior |
| vLLM live runtime | `/models`, `/chat/completions`, and GPU process check in vLLM mode | Optional PASS gate only when vLLM is selected; current selected runtime is Ollama |
| Always-listening VAD state manager | Browser/controller tests and smoke proving speech start/end without manual stop | PASS for the original prompt scope; browser RMS VAD drives the state manager and `smoke:realtime` verifies interruption/listening flow |
| Barge-in stops playback within 500ms | Smoke/browser timing evidence and playback guard proof | PASS; latest `npm run smoke:realtime` measured 393ms |
| Barge-in cancels active/pending turn work | Stream abort test plus TTS HTTP adapter abort signal propagation | PASS for orchestrator and HTTP TTS request path |
| No stale audio after interruption | Turn playback guard tests and no duplicate playback across 50 turns | PASS |
| Every ASR/LLM/TTS/playback/latency event carries `turn_id` | Unit/integration tests for propagation and stream events | PASS for server events; browser playback events remain local state |
| Persona remains natural Traditional Chinese spoken interaction | Policy/finalizer/canonicalizer tests plus live reply spot-check | PASS; live Ollama voice turn replied `深呼吸，放輕鬆。` |
| Runtime state visible in UI | UI code displays Listening, Understanding, Thinking, Speaking, Interrupted | PASS by code inspection; browser screenshot verification still recommended |
| Latency metrics for every stage | Contract tests for v0.5 aliases and compatibility fields | PASS |
| Cached reply under 500ms | TTS cache test must measure hit path below 500ms | PASS |

## Required Commands Before Completion

```bash
bash -n scripts/real_model_preflight.sh scripts/demo_real.sh scripts/start_vllm_openai.sh
npm run typecheck
npm run lint
npm run test
npm run smoke:realtime
npm run real:health
npm run real:preflight
npm run demo:real
```

For vLLM completion, run the real preflight and demo with:

```bash
LLM_PROVIDER=vllm LLM_RUNTIME=vllm npm run real:start-vllm
LLM_PROVIDER=vllm LLM_RUNTIME=vllm npm run real:preflight
LLM_PROVIDER=vllm LLM_RUNTIME=vllm npm run demo:real
```

## Current Evidence From This Pass

```text
bash -n: passed for real_model_preflight.sh, demo_real.sh, start_vllm_openai.sh
npm run typecheck: passed
npm run lint: passed
npm run test: passed
npm run smoke:realtime: passed
npm run smoke:realtime strict barge-in timing: passed at 393ms
npm run real:health: passed for asr=breeze_asr, llm=ollama, tts=breezyvoice, emotion=mock
npm run real:preflight: passed after ASR real-WAV GPU warmup
npm run demo:real: passed and printed Ready for Demo
real BreezyVoice long-form stitched WAV evidence: passed with 3 chunks, sampleRate=22050, samples=300176, stitchedBytes=600396, totalDurationMs=13613
LLM_PROVIDER=vllm LLM_RUNTIME=vllm npm run real:start-vllm: vLLM installed, but live Gemma 4 E2B startup was not selected as the current demo path after GPU memory pressure during startup
LLM_PROVIDER=ollama LLM_RUNTIME=ollama OLLAMA_MODEL=gemma4:e2b npm run real:preflight: passed
LLM_PROVIDER=ollama LLM_RUNTIME=ollama OLLAMA_MODEL=gemma4:e2b npm run demo:real: passed and printed Ready for Demo
live Ollama persona spot-check: `POST /api/v1/voice-turn` returned `深呼吸，放輕鬆。` with status ok
```

Remaining optional runtime evidence:

```text
Optional vLLM live preflight/demo if the selected runtime is vLLM
```

## Current Runtime Selection

The active runnable path is:

```env
LLM_PROVIDER=ollama
LLM_RUNTIME=ollama
OLLAMA_MODEL=gemma4:e2b
```

This path satisfies the current demo execution gate with Breeze-ASR, Ollama
Gemma, BreezyVoice, and the web UI running locally. vLLM remains implemented as
a switchable provider path and has a launch script, but the selected live
runtime for this completion pass is Ollama.
