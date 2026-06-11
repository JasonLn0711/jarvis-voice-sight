# Codex Goal Prompt: Jarvis Voice Sight v0.5 -> v0.6

Use this prompt to upgrade Jarvis Voice Sight from a turn-oriented realtime
voice agent prototype into a continuous conversation session.

```text
You are Codex working inside the GitHub repository:

jarvis-voice-sight

Goal:
Upgrade Jarvis Voice Sight to v0.6 continuous voice conversation mode.

Product thesis:
Jarvis should no longer behave like a hold-to-speak or single-turn voice demo.
The user should press one button once to start a live conversation session,
then keep talking with Jarvis naturally. Jarvis should listen, respond, and
allow the user to interrupt while it is speaking. The conversation continues
until the user presses the same button again to stop the session.

Version context:
- v0.2.1 stabilized the interview demo with persona, TTS finalizer, cache,
  turn_id propagation, latency breakdown, and one-command real demo boot.
- v0.3 / v0.3.1 added always-listening, VAD state management, barge-in,
  turn cancellation, stale audio discard, and sentence-level streaming.
- v0.4 added long-form TTS chunking, bounded parallel synthesis, chunk cache,
  ordered audio_chunk streaming, and time-to-first-audio metrics.
- v0.5 consolidated provider switching, real model gates, Ollama/vLLM LLM
  runtime selection, strict completion gates, and demo reliability.
- v0.6 should make the primary UX a continuous session toggle and prepare
  conversation memory for later RAG.

Strict rules:
1. The orchestrator owns the workflow.
2. Frontend must not call model services directly.
3. ASR, LLM, TTS, and Memory remain independently replaceable providers.
4. Ollama / vLLM only manage LLM runtime. ASR, TTS, and Memory stay separate.
5. The primary UI control is a session toggle, not hold-to-speak.
6. During an active session, the mic remains available for VAD-driven speech
   detection until the user explicitly stops the session.
7. User barge-in must stop Jarvis playback within 500ms and cancel active or
   pending work for the interrupted response.
8. Every session, turn, ASR result, LLM output, TTS text, TTS audio, playback
   event, memory event, and latency log must carry session_id and turn_id.
9. Stale audio from cancelled or superseded turns must never play.
10. Sentence-level TTS remains the default; do not implement token-level TTS.
11. Do not add production RAG retrieval in v0.6. Implement memory capture and
    retrieval-ready storage interfaces so RAG can be added later.
12. Keep the existing real demo entrypoints working.

Target architecture:

Web UI
  -> Conversation Session Controller
  -> Realtime Voice Client
  -> VAD State Manager
  -> Jarvis Orchestrator
  -> ASR Provider
  -> Conversation Memory Provider
  -> LLM Provider
  -> Response Finalizer
  -> TTS Scheduler
  -> TTS Provider
  -> Audio Stitcher
  -> Audio Player

Implement all of the following:

1. Replace hold-to-speak with a session toggle.

   UI behavior:
   - Initial button label/state: Start Conversation
   - First click starts a conversation session.
   - While active, the button shows Stop Conversation.
   - Second click stops the session.
   - Do not require the user to hold the button.
   - Do not require the user to press stop after each utterance.
   - Keep a keyboard-accessible and screen-reader-accessible control.

   Required state:
   - inactive
   - starting
   - listening
   - user_speaking
   - understanding
   - thinking
   - speaking
   - interrupted
   - stopping
   - stopped
   - error_recovery

2. Add a Conversation Session Controller.

   Required responsibilities:
   - create session_id when the user starts a session
   - keep mic/VAD active for the whole session
   - create a new turn_id for each detected user utterance
   - stop all mic capture, active ASR, active LLM, pending TTS, and playback
     when the user stops the session
   - mark the session closed and flush memory events
   - keep session lifecycle separate from turn lifecycle

   Required conceptual API:
   - startSession(): Promise<ConversationSession>
   - stopSession(sessionId): Promise<SessionSummary>
   - startTurn(sessionId, audio): Promise<TurnResult>
   - interruptActiveTurn(sessionId, reason): Promise<void>

3. Convert continuous listening into the default active-session behavior.

   Flow:
   - User clicks Start Conversation.
   - UI asks for mic permission if needed.
   - VAD enters listening state.
   - User speaks naturally.
   - VAD detects speech start and buffers audio.
   - VAD detects speech end and sends one utterance to ASR.
   - Jarvis answers.
   - VAD returns to listening automatically.
   - The cycle repeats until the user clicks Stop Conversation.

   No per-turn button press is allowed in the primary path.

4. Preserve a fallback manual turn mode only as a secondary debug option.

   Rules:
   - The main user-facing path must be continuous session mode.
   - Any legacy hold-to-speak UI must be hidden behind a debug flag or removed.
   - Tests and documentation must not present hold-to-speak as the normal mode.

5. Harden barge-in for continuous sessions.

   When Jarvis is speaking and user speech is detected for BARGE_IN_MS:
   - audioPlayer.stop()
   - ttsQueue.clear(activeTurnId)
   - cancelActiveTurn(activeTurnId)
   - emit interrupted event with session_id and interrupted_turn_id
   - create a new turn_id for the user's interrupting speech
   - keep the session active
   - transition to listening or user_speaking based on current VAD signal

   Acceptance:
   - playback stops within 500ms
   - stale audio from the interrupted turn never plays
   - the interrupting utterance becomes the next user turn
   - the user does not need to click the button to interrupt

6. Add session-scoped turn isolation.

   Required identifiers:
   - session_id
   - turn_id
   - parent_turn_id when a turn interrupts another turn
   - interrupted_turn_id for barge-in events

   Required rule:
   if (audio.sessionId !== activeSessionId || audio.turnId !== activeTurnId) {
     discardAudio();
   }

7. Add conversation memory capture.

   v0.6 memory is a durable conversation record and summarization layer. It is
   not yet full RAG.

   Required memory events:
   - session_started
   - user_utterance
   - assistant_reply
   - interruption
   - turn_cancelled
   - session_stopped
   - session_summary_created

   Required MemoryProvider interface:
   - appendEvent(event): Promise<void>
   - getSession(sessionId): Promise<ConversationSessionRecord>
   - listRecentSessions(limit): Promise<ConversationSessionRecord[]>
   - summarizeSession(sessionId): Promise<SessionMemorySummary>
   - searchMemory(query, options): Promise<MemorySearchResult[]>

   In v0.6, searchMemory may be implemented as simple keyword search or return
   an empty retrieval result with a stable contract. The interface must be ready
   for later vector/RAG integration.

8. Add a memory data model that is RAG-ready.

   Required fields:
   - session_id
   - turn_id
   - timestamp
   - role: user | assistant | system
   - text
   - normalized_text
   - language
   - source: asr | llm | user_action | system_event
   - latency
   - emotion if available
   - interrupted_turn_id if available
   - embedding_status: pending | indexed | skipped
   - metadata

   Storage:
   - Use a simple local JSONL or SQLite store for v0.6.
   - Keep the storage adapter behind MemoryProvider.
   - Do not hard-code future vector database choices.
   - Do not send private memory to external services unless explicitly
     configured.

9. Add session summaries after stop.

   When the user stops the conversation:
   - flush pending memory events
   - create a concise Traditional Chinese session summary
   - record important preferences, topics, unresolved follow-ups, and emotional
     cues when present
   - store the summary through MemoryProvider
   - expose the summary in the UI after the session stops

   The summary should be useful for future RAG, but the next live conversation
   does not need to retrieve it yet unless retrieval is explicitly enabled by a
   feature flag.

10. Add future-RAG feature flags without enabling production RAG by default.

   Environment:
   - MEMORY_PROVIDER=local_jsonl|sqlite|mock
   - MEMORY_ENABLED=true
   - MEMORY_STORE_PATH=.local/jarvis-memory
   - MEMORY_SUMMARY_ENABLED=true
   - MEMORY_RETRIEVAL_ENABLED=false
   - MEMORY_RETRIEVAL_TOP_K=5
   - MEMORY_EMBEDDINGS_ENABLED=false

   Behavior:
   - If MEMORY_RETRIEVAL_ENABLED=false, no previous-session content is injected
     into LLM prompts.
   - If enabled later, retrieval must happen through MemoryProvider and must be
     clearly logged with session_id and turn_id.

11. Update LLM prompt assembly for session context.

   Required:
   - include current session transcript window
   - include only the recent active-session context by default
   - do not include old memory unless MEMORY_RETRIEVAL_ENABLED=true
   - keep Jarvis persona in natural spoken Taiwanese Mandarin
   - keep replies short by default unless the user asks for longer explanation

   Persona rules:
   - Always reply in Traditional Chinese.
   - Use natural spoken Taiwanese Mandarin.
   - Reply in 6-18 Chinese characters by default.
   - Do not always ask questions.
   - Prefer acknowledgement, reflection, or light guidance.
   - Ask only when clarification is useful.
   - Avoid formal customer-service wording.
   - Never use bullet points in spoken reply.
   - Never explain system behavior.
   - Never mention being an AI model.

12. Add UI session and memory display.

   The UI should visibly show:
   - session active/inactive state
   - Listening
   - Understanding
   - Thinking
   - Speaking
   - Interrupted
   - Stop Conversation control during active session
   - session summary after stop

   Keep the UI voice-first. Do not turn it into a raw JSON dashboard.

13. Preserve v0.5 real model provider switching.

   Required:
   - Ollama remains a supported LLM runtime.
   - vLLM remains a supported LLM runtime when the environment can run it.
   - Runtime provider switching remains env-configured.
   - `npm run demo:real` still works with Ollama as the default selected
     real-runtime path unless env explicitly selects vLLM.

14. Add tests for continuous conversation.

   Required tests:
   - session toggle starts mic/VAD without hold-to-speak
   - second toggle stops the session
   - multiple user utterances happen in one session without repeated button
     presses
   - VAD returns to listening after each assistant reply
   - barge-in interrupts assistant speech without clicking the button
   - barge-in creates a new user turn
   - interrupted turn audio is discarded
   - stop session cancels active ASR/LLM/TTS/playback
   - every event has session_id and turn_id when applicable
   - memory append captures user and assistant text
   - session summary is created after stop
   - memory retrieval is disabled by default
   - legacy hold-to-speak is not the primary UI path
   - no duplicate playback across 50 turns

15. Add real and smoke verification.

   Required commands:
   - npm run typecheck
   - npm run lint
   - npm run test
   - npm run smoke:realtime
   - npm run real:health
   - npm run real:preflight
   - npm run demo:real

   Add or update a smoke test that proves:
   - one click starts session mode
   - at least three user turns can happen inside one session
   - Jarvis returns to listening after each reply
   - user speech interrupts Jarvis while speaking
   - one click stops the session
   - memory summary exists after stop

Acceptance:
- The primary UI no longer says or behaves like hold-to-speak.
- One click starts a continuous conversation session.
- The user can speak multiple times without pressing the button again.
- Jarvis can answer, return to listening, and continue the conversation.
- The user can interrupt Jarvis by speaking while Jarvis is talking.
- Barge-in stops audio within 500ms.
- No stale audio plays after interruption or session stop.
- The second button click stops the conversation session.
- Stopping the session cancels active work and closes mic capture.
- Memory events are written for the session.
- A Traditional Chinese session summary is created after stop.
- Memory storage is behind a provider interface.
- RAG retrieval is designed behind feature flags but disabled by default.
- Current-session transcript context works for follow-up conversation.
- Old-session memory is not injected unless retrieval is explicitly enabled.
- Every session event has session_id.
- Every turn event has session_id and turn_id.
- Ollama selected runtime continues to pass real health/preflight/demo gates.
- vLLM remains selectable by env config when available.
- npm run typecheck passes.
- npm run lint passes.
- npm run test passes.
- npm run smoke:realtime passes.
- npm run real:health passes.
- npm run real:preflight passes.
- npm run demo:real prints Ready for Demo.

Performance targets:
- Barge-in stop < 500ms.
- Cached short reply < 500ms when cache hit is available.
- First audio for short reply < 2s under the selected real runtime.
- Average real turn < 4s where hardware/model latency permits.
- Session start UI transition < 300ms after mic permission is available.
- Session stop cancellation begins immediately and completes within 1s.
- No duplicate playback across 50 turns.

Final output should include:
1. what was implemented
2. how to run v0.6 continuous conversation mode
3. how the start/stop session toggle works
4. how barge-in works during an active session
5. how memory is stored after stop
6. how future RAG can be enabled later
7. environment variables added
8. files changed
9. test results
10. current limitations and next risks
```
