# Codex Goal Prompt: Jarvis Voice Sight v0.4 -> v0.5

Use this prompt to upgrade Jarvis Voice Sight to the v0.5 realtime voice agent
prototype described in `docs/SDD_v0.5.md`.

```text
You are Codex working inside the GitHub repository:

jarvis-voice-sight

Goal:
Upgrade Jarvis Voice Sight to v0.5 realtime voice agent prototype.

Version context:
- v0.2.1 stabilized the interview demo with natural persona, TTS finalizer,
  deterministic short-reply TTS cache, turn_id propagation, latency breakdown,
  and one-command real demo boot.
- v0.3 / v0.3.1 added always-listening, VAD state management, barge-in,
  turn cancellation, stale audio discard, and sentence-level streaming.
- v0.4 added long-form TTS chunking, bounded parallel synthesis, chunk cache,
  ordered audio_chunk streaming, and time-to-first-audio metrics.
- v0.5 should consolidate those capabilities into a demo-ready realtime voice
  agent prototype and add runtime provider switching for Ollama / vLLM.

Strict rules:
1. The orchestrator owns the workflow.
2. Frontend must not call model services directly.
3. ASR, LLM, and TTS remain independently replaceable providers.
4. Ollama / vLLM only manage LLM runtime. ASR and TTS stay independent services.
5. Every ASR result, LLM output, TTS text, TTS audio, playback event, and latency
   log must carry turn_id.
6. Stale audio from cancelled or superseded turns must never play.
7. Barge-in must stop playback within 500ms and cancel active/pending turn work.
8. Sentence-level TTS remains the default; do not implement token-level TTS in
   this phase.
9. Long replies may use parallel chunk synthesis; short replies should stay
   single-chunk and cache-friendly.
10. Do not add RAG, tool calling, login, database, or long-term memory in this
    phase.

Target architecture:

Web UI
  -> Realtime Voice Client
  -> VAD State Manager
  -> Jarvis Orchestrator
  -> ASR Provider
  -> LLM Provider
  -> Response Finalizer
  -> TTS Scheduler
  -> TTS Provider
  -> Audio Stitcher
  -> Audio Player

Implement all of the following:

1. Add provider abstraction for ASR, LLM, and TTS.
   Required conceptual interfaces:
   - AsrProvider.transcribe(audio, turnId)
   - LlmProvider.generate(messages, turnId)
   - LlmProvider.stream(messages, turnId)
   - TtsProvider.synthesize(text, turnId)

2. Support Ollama and vLLM as configurable LLM providers.
   Environment:
   - ASR_PROVIDER=breeze_asr
   - LLM_PROVIDER=ollama|vllm
   - TTS_PROVIDER=breezyvoice
   - OLLAMA_BASE_URL=http://localhost:11434
   - OLLAMA_MODEL=gemma4:e2b
   - VLLM_BASE_URL=http://localhost:8000/v1
   - VLLM_MODEL=gemma-4-e2b

3. Preserve and harden VAD State Manager with always-listening mode.
   States:
   - idle
   - listening
   - user_speaking
   - asr_processing
   - thinking
   - speaking
   - interrupted
   - error_recovery

   Defaults:
   - START_SPEECH_PROB = 0.6
   - END_SPEECH_PROB = 0.3
   - MIN_SPEECH_MS = 200
   - END_SILENCE_MS = 700
   - BARGE_IN_MS = 300

4. Add barge-in support.
   When Jarvis is speaking and user speech is detected for BARGE_IN_MS:
   - audioPlayer.stop()
   - ttsQueue.clear()
   - cancelActiveTurn()
   - state = listening

5. Add turn_id isolation and stale audio discard.
   Required rule:
   if (audio.turnId !== activeTurnId) {
     discardAudio();
   }

6. Keep Jarvis persona in natural Taiwanese Mandarin interaction mode.
   Rules:
   - Always reply in Traditional Chinese.
   - Use natural spoken Taiwanese Mandarin.
   - Reply in 6-18 Chinese characters by default.
   - Do not always ask questions.
   - Prefer acknowledgement, reflection, or light guidance.
   - Ask only when clarification is useful.
   - Avoid formal customer-service wording.
   - Never use bullet points.
   - Never explain system behavior.
   - Never mention being an AI model.

   Response mix target:
   - 40% acknowledgement
   - 30% light guidance
   - 20% question
   - 10% short summary

7. Keep response finalizer before TTS.
   It must remove:
   - markdown
   - JSON
   - role tags
   - URLs
   - emojis
   - excessive punctuation
   It must output only speakable text.

8. Keep sentence-level LLM streaming to TTS queue.
   Flow:
   - stream LLM tokens
   - buffer text
   - detect complete sentence
   - clean sentence
   - send to TTS queue

   Sentence boundaries:
   - 。！？!?

9. Add or harden parallel TTS chunk synthesis for longer replies.
   Rules:
   - short replies use single-chunk TTS
   - long replies split into 3-5 second chunks
   - target roughly 8-24 Chinese characters per chunk when practical
   - synthesize chunks in bounded parallel workers
   - preserve playback order

   Environment:
   - MAX_PARALLEL_TTS_WORKERS=3
   - CHUNK_TARGET_SECONDS=4
   - SILENCE_PADDING_MS=120

10. Add WAV normalize, silence padding, and audio stitching.
    Required path:
    Text -> Sentence Chunker -> Parallel TTS Workers -> WAV Normalize ->
    Silence Padding -> Audio Stitcher -> Playback.

11. Keep deterministic TTS cache for common short replies.
    Cache key:
    - normalized_reply_text
    Cache hit:
    - skip BreezyVoice
    - play cached wav
    Target:
    - cached reply < 500ms

12. Add latency metrics for every stage.
    Every turn should report:
    - vad_ms
    - asr_ms
    - llm_first_token_ms
    - llm_total_ms
    - tts_first_audio_ms
    - tts_total_ms
    - playback_start_ms
    - total_ms
    - tts_cache_hit
    - tts_parallel_chunks

    Preserve existing latency compatibility fields:
    - llm_ms
    - tts_ms
    - playback_ms
    - playback_delay_ms
    - perceived_total_ms
    - tts_chunk_count
    - tts_time_to_first_audio_ms
    - tts_total_synthesis_ms

13. Add UI runtime state display.
    The demo should visibly show:
    - Listening
    - Understanding
    - Thinking
    - Speaking
    - Interrupted
    Keep the UI voice-first; do not turn it into a raw JSON dashboard.

14. Keep npm run demo:real.
    It must start:
    - Web UI
    - Orchestrator
    - ASR service
    - LLM wrapper
    - Ollama or vLLM
    - TTS wrapper
    - BreezyVoice upstream
    Then run health/preflight and print:
    Ready for Demo

15. Add tests for:
    - provider switching
    - VAD transitions
    - barge-in
    - turn cancellation
    - stale audio discard
    - cache hit
    - cache miss
    - sentence chunking
    - parallel TTS
    - latency output
    - no duplicate playback across 50 turns

Acceptance:
- npm run typecheck passes
- npm run lint passes
- npm run test passes
- npm run real:health passes
- npm run real:preflight passes
- User can speak without manually pressing stop
- Jarvis can detect speech start and end
- Jarvis can be interrupted while speaking
- Barge-in stops audio within 500ms
- No stale audio plays after interruption
- Every turn has turn_id
- Every turn has latency metrics
- Cached TTS replies return under 500ms
- Short replies use TTS cache when available
- Long replies are chunked and synthesized in parallel
- Ollama and vLLM can be switched by env config
- Persona does not always ask questions
- Runtime state is visible in UI
- No duplicate playback across 50 turns

Performance targets:
- Cached reply < 500ms
- Barge-in stop < 500ms
- First audio for short reply < 2s
- Average real turn < 4s
- No duplicate playback across 50 turns

Final output should include:
1. what was implemented
2. how to run v0.5 realtime mode
3. how to switch Ollama / vLLM
4. environment variables added
5. current limitations
6. files changed
7. test results
8. next risks for BreezyVoice latency, vLLM runtime, and Taiwan Mandarin voice quality
```
