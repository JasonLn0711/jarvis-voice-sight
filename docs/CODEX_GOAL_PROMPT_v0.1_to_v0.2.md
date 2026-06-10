# Codex Goal Prompt: Jarvis Voice Sight v0.1 → v0.2

Status: Canonical implementation prompt record

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

Purpose: This file preserves the complete Codex goal prompt for building the
Jarvis Voice Sight MVP from an empty repository through v0.2. The prompt is
designed to drive a mock-first implementation where the full engineering
pipeline runs before real model integrations are attached.

This file is intentionally retained as the v0.1 to v0.2 baseline prompt.

Canonical next-phase implementation prompt:

```text
docs/CODEX_GOAL_PROMPT_v0.2.1_to_v0.3.md
```

Related next-phase feedback roadmap:

```text
docs/VOISS_FEEDBACK_ROADMAP_v0.2.1_to_v0.3.md
```

That file records VOISS AI feedback and the next implementation prompt for
v0.2.1 demo stability and v0.3 realtime interaction.

---

下面這段可以直接丟給 Codex，目標是從空 repo 做到 v0.2 可跑。

You are Codex working inside the GitHub repository:

`jarvis-voice-sight`

Goal: build a complete MVP from zero to v0.2 according to the following product and software design.

Product: Jarvis Voice Sight
Purpose: real-time voice companion loop
Core pipeline:

User speech → VAD → Breeze-ASR-25 → Gemma 4 E4B int4 → response policy → BreezyVoice TTS → audio playback

v0.1 must support a working voice loop.
v0.2 must add emotion-aware response policy.

Strict engineering rules:

1. Use modular architecture.
2. Do not hard-code model calls inside frontend.
3. The orchestrator owns the workflow.
4. ASR, LLM, TTS, Emotion must be replaceable adapters.
5. Use typed contracts.
6. Every model call must have timeout handling.
7. Every failure path must return a safe fallback.
8. Add tests.
9. Add latency logging.
10. Keep v0.1 small and demo-ready.
11. v0.2 must extend v0.1 without rewriting it.
12. Do not add RAG, tool calling, long-term memory, login, database, or autonomous agent behavior.

Build the repository with this structure:

```text
jarvis-voice-sight/
  README.md
  docs/
    SDD_v0.1_to_v0.2.md
    API_SPEC.md
    PROMPT_SPEC.md
    LATENCY_BUDGET.md
    UI_UX_SPEC.md
    RUNBOOK.md
  apps/
    web/
  services/
    orchestrator/
    asr/
    llm/
    tts/
    emotion/
  packages/
    shared/
  scripts/
  docker/
  .env.example
```

Use this implementation stack unless the repo already has a different compatible setup:

Frontend:

* Next.js
* TypeScript
* Tailwind CSS
* Framer Motion
* simple push-to-talk UI

Orchestrator:

* Node.js
* TypeScript
* Fastify
* Zod validation
* pino logger

Model services:

* Python
* FastAPI
* mock-first implementation
* later replaceable with real Breeze-ASR-25, Gemma 4 E4B int4, BreezyVoice

Shared package:

* TypeScript types
* Zod schemas
* error types
* API contracts

Docker:

* docker-compose for local development

Important: implement mock model services first so the whole pipeline runs immediately. Then leave clean adapter files and TODO comments for real model integration.

Required v0.1 features:

1. `POST /api/v1/voice-turn`

   * receives audio metadata or mock audio payload
   * calls ASR
   * loads recent context
   * calls LLM
   * applies response policy
   * calls TTS
   * stores recent context in memory
   * returns transcript, reply, audio URL or mock audio URL, latency report

2. `GET /api/v1/health`

   * checks orchestrator, ASR, LLM, TTS, emotion service status

3. Debug endpoints:

   * `POST /api/v1/asr`
   * `POST /api/v1/chat`
   * `POST /api/v1/tts`
   * `POST /api/v1/emotion`

4. Frontend page:

   * push-to-talk button
   * show state:

     * IDLE
     * LISTENING
     * TRANSCRIBING
     * THINKING
     * SPEAKING
     * ERROR
   * show user transcript
   * show Jarvis reply
   * play returned audio if available
   * allow mock mode if microphone is unavailable

Premium UI / UX requirement:

Build a premium voice-first UI for `apps/web`.

The UI must look like a refined Apple/OpenAI-style product prototype.
It must be minimal, dark, spacious, calm, and high-end.

Do not create a developer dashboard.
Do not show raw JSON.
Do not use generic Tailwind demo cards.
Do not use loud colors or emoji-heavy UI.

Implement:

1. `AppShell`
2. `VoiceOrb`
3. `TranscriptCard`
4. `JarvisReplyCard`
5. `HoldToSpeakButton`
6. `StatusStrip`
7. `useVoiceRecorder`
8. `useVoiceTurn`
9. `useAudioPlayback`

Use:

1. Next.js
2. TypeScript
3. Tailwind CSS
4. Framer Motion
5. CSS variables for design tokens

Main page must include:

1. Product title: `Jarvis Voice Sight`
2. Subtitle: `A real-time voice companion that listens, thinks, and responds.`
3. Center voice orb
4. Short state text
5. Transcript card
6. Jarvis reply card
7. Hold-to-speak button
8. Quiet latency/emotion/session status strip

Voice states:

```ts
type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";
```

State copy:

```ts
const STATE_COPY = {
  IDLE: "Speak when ready.",
  LISTENING: "Listening.",
  TRANSCRIBING: "I heard this.",
  THINKING: "Thinking.",
  SPEAKING: "Speaking.",
  ERROR: "Something faded. Try again."
};
```

Design tokens:

```css
:root {
  --bg-main: #08090C;
  --bg-surface: rgba(255, 255, 255, 0.06);
  --bg-surface-strong: rgba(255, 255, 255, 0.10);

  --text-primary: #F5F5F7;
  --text-secondary: rgba(245, 245, 247, 0.68);
  --text-tertiary: rgba(245, 245, 247, 0.42);

  --accent: #A7C7FF;
  --accent-strong: #D7E6FF;
  --accent-muted: rgba(167, 199, 255, 0.16);

  --listening: #A7C7FF;
  --thinking: #C9B8FF;
  --speaking: #B7F7D4;
  --error: #FF9A9A;
}
```

Typography:

```css
body {
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "SF Pro Display",
    "SF Pro Text",
    "Inter",
    "Noto Sans TC",
    sans-serif;
}
```

Main layout:

```text
Full-screen dark canvas.
Centered max-width container.
Hero title at top.
Voice orb in center.
Reply card below orb.
Transcript card below reply.
Hold-to-speak button at bottom center.
Status strip below button.
```

Motion:

Use Framer Motion.

Orb:

* idle: slow breathing glow
* listening: stronger glow and ring pulse
* transcribing: rotating thin ring
* thinking: slow gradient pulse
* speaking: audio pulse
* error: soft red glow

Button:

* hover: slight lift
* press: scale 0.98
* disabled: muted

Cards:

* glassmorphism
* thin white border
* blur background
* subtle enter animation

UI acceptance criteria:

1. The UI looks premium.
2. The UI works on desktop and mobile.
3. It supports mock mode.
4. It connects to `/api/v1/voice-turn`.
5. It handles all states.
6. It plays audio if `audio_url` exists.
7. It shows transcript and Jarvis reply.
8. It never shows raw backend JSON to the user.
9. It keeps copy short and polished.
10. It passes lint and typecheck.

The UI must make the MVP feel like a voice product, not an engineering demo.

5. Persona:
   Jarvis replies in Traditional Chinese.
   Reply length must be 6–18 Chinese characters.
   Tone: calm, smart, concise, trustworthy, compliance-aware, and low-presence.
   Goal: trustworthy conversation coaching.
   Jarvis is a Taiwanese Mandarin Voice Coach for insurance and financial
   service conversations. It helps salespeople, advisors, and customer-facing
   staff speak with more clarity, trust, and calm.
   It can acknowledge, reflect, lightly guide, summarize one point, choose a
   natural opening, reduce pressure, or ask one short question only when useful.
   It must avoid repetitive sentence endings such as `就好`; vary cadence and
   phrasing across turns.
   It must not recommend specific financial or insurance products, promise
   returns, give legal / medical / financial / underwriting advice, or pressure
   the customer.
   Do not make Jarvis behave like an interviewer, customer-service agent,
   classroom teacher, formal chatbot, or hard-selling script generator.

6. Response policy:

   * enforce Traditional Chinese
   * enforce max 20 Chinese characters
   * reject markdown
   * reject bullet points
   * reject self-reference as AI model
   * fallback when invalid

Fallback replies:

* no speech: `我剛剛沒聽到。`
* ASR empty: `我剛剛沒聽清楚。`
* LLM timeout: `先停一下，我在。`
* policy rejected: `你可以再說一點。`
* TTS failed: return text-only response

Required v0.2 features:

1. EmotionService interface

2. Emotion adapter with mock classifier

3. Text-based emotion classifier

4. Supported labels:

   * neutral
   * anxious
   * tired
   * confused
   * excited
   * sad
   * angry
   * uncertain

5. Emotion-aware response strategy:

   * anxious → slow down, reassure first, ask only if clarification helps
   * tired → reduce cognitive load
   * confused → clarify
   * excited → lightly match energy
   * sad → acknowledge gently
   * angry → de-escalate
   * uncertain → help choose next step
   * neutral → continue naturally

6. Config flag:
   `ENABLE_EMOTION=true|false`

7. v0.2 must still work when emotion is disabled.

8. Add latency report:

   * vad_ms
   * asr_ms
   * emotion_ms
   * llm_ms
   * policy_ms
   * tts_ms
   * total_ms

Design patterns to implement:

1. Hexagonal Architecture

   * core use cases depend on ports
   * model providers are adapters

2. Adapter Pattern

   * BreezeASRAdapter
   * GemmaE4BAdapter
   * BreezyVoiceAdapter
   * EmotionClassifierAdapter
   * MockASRAdapter
   * MockLLMAdapter
   * MockTTSAdapter
   * MockEmotionAdapter

3. Strategy Pattern

   * ConciseJarvisStrategy
   * EmotionAwareJarvisStrategy

4. Facade Pattern

   * `/api/v1/voice-turn` hides ASR/LLM/TTS details

5. Chain of Responsibility

   * ValidateAudioStep
   * VADStep
   * ASRStep
   * ContextStep
   * EmotionStep
   * LLMStep
   * PolicyStep
   * TTSStep
   * PersistStep

6. Factory Pattern

   * create ASR/LLM/TTS/Emotion adapters from env config

7. Circuit Breaker

   * if a model service repeatedly fails, mark degraded and use fallback

8. Repository Pattern

   * ConversationRepository
   * InMemoryConversationRepository

9. Observer Pattern

   * emit lifecycle events:

     * voice_turn_started
     * asr_completed
     * emotion_completed
     * llm_completed
     * tts_completed
     * voice_turn_completed
     * voice_turn_failed

Environment variables:

```env
APP_ENV=development
PORT=3000

ASR_PROVIDER=mock
ASR_SERVICE_URL=http://localhost:8001

LLM_PROVIDER=mock
LLM_SERVICE_URL=http://localhost:8002

TTS_PROVIDER=mock
TTS_SERVICE_URL=http://localhost:8003

ENABLE_EMOTION=true
EMOTION_PROVIDER=mock
EMOTION_SERVICE_URL=http://localhost:8004

CONVERSATION_STORE=memory
MAX_RECENT_MESSAGES=6

REPLY_MAX_CHARS=18
TOTAL_TIMEOUT_MS=3000
ASR_TIMEOUT_MS=1000
LLM_TIMEOUT_MS=800
TTS_TIMEOUT_MS=1200
EMOTION_TIMEOUT_MS=300
```

API contract:

`POST /api/v1/voice-turn`

Request:

```json
{
  "session_id": "session_abc123",
  "audio_format": "wav",
  "audio_base64": "mock",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Response:

```json
{
  "session_id": "session_abc123",
  "turn_id": "turn_001",
  "transcript": "我明天要面試",
  "reply": "你最擔心哪部分？",
  "emotion": {
    "label": "anxious",
    "confidence": 0.87,
    "signals": ["面試", "擔心"]
  },
  "audio_url": "/mock-audio/turn_001.wav",
  "latency": {
    "vad_ms": 10,
    "asr_ms": 120,
    "emotion_ms": 20,
    "llm_ms": 180,
    "policy_ms": 5,
    "tts_ms": 160,
    "total_ms": 495
  },
  "status": "ok"
}
```

Testing requirements:

Unit tests:

1. response policy
2. prompt builder
3. emotion classifier
4. conversation repository
5. adapter factory
6. circuit breaker
7. fallback handling

Integration tests:

1. `/voice-turn` happy path
2. empty audio fallback
3. ASR timeout fallback
4. LLM timeout fallback
5. TTS failure returns text-only
6. emotion disabled still works
7. emotion enabled affects prompt strategy
8. recent conversation context is preserved

Scripts:

```bash
npm run dev
npm run test
npm run lint
npm run typecheck
npm run benchmark
```

Add a benchmark script that sends repeated mock turns and reports:

```text
P50 total latency
P95 total latency
P50 ASR latency
P95 ASR latency
P50 LLM latency
P95 LLM latency
P50 TTS latency
P95 TTS latency
```

Documentation to generate:

1. `README.md`

   * project overview
   * quick start
   * architecture
   * API usage
   * v0.1/v0.2 roadmap

2. `docs/API_SPEC.md`

   * all endpoints
   * request/response examples

3. `docs/PROMPT_SPEC.md`

   * v0.1 prompt
   * v0.2 emotion-aware prompt
   * persona rules

4. `docs/LATENCY_BUDGET.md`

   * latency goals
   * stage-level timeout
   * benchmark instructions

5. `docs/UI_UX_SPEC.md`

   * Apple/OpenAI-style design target
   * color tokens
   * typography
   * layout
   * voice orb states
   * components
   * motion
   * frontend behavior
   * design acceptance criteria

6. `docs/RUNBOOK.md`

   * how to run locally
   * how to run with mocks
   * how to switch to real model adapters
   * troubleshooting

Implementation sequence:

Phase 1: repository bootstrap

* create monorepo structure
* add package scripts
* add shared schemas
* add env example

Phase 2: mock pipeline

* build orchestrator
* build mock ASR/LLM/TTS services
* implement `/voice-turn`
* implement in-memory conversation repository
* implement latency logging

Phase 3: frontend

* build premium Apple/OpenAI-style voice-first UI
* implement AppShell, VoiceOrb, TranscriptCard, JarvisReplyCard, HoldToSpeakButton, StatusStrip
* implement useVoiceRecorder, useVoiceTurn, useAudioPlayback
* add mock input mode
* connect to `/voice-turn`
* display transcript/reply/status
* play returned audio if available
* verify desktop and mobile layout

Phase 4: v0.1 hardening

* add response policy
* add fallbacks
* add circuit breaker
* add tests
* add benchmark script

Phase 5: v0.2 emotion

* add emotion service
* add emotion labels
* add emotion-aware prompt strategy
* add ENABLE_EMOTION config
* add tests

Phase 6: documentation

* write README
* write API spec
* write prompt spec
* write latency budget
* write UI / UX spec
* write runbook

Do not stop after creating skeleton files.
Implement the working mock pipeline end-to-end.

After implementation, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run benchmark
```

Fix all errors you can fix.

Final output should include:

1. what was implemented
2. how to run it
3. current limitations
4. files changed
5. test results
6. next steps for real Breeze-ASR-25, Gemma 4 E4B int4, and BreezyVoice integration

這份 prompt 的重點是：先 mock 全流程跑通，再換真模型。你明天 demo 時，就算模型還沒接完，也能展示「工程架構是對的」。

---

# Addendum: v0.2 Real Model Activation Prompt

Status: Use this addendum after the mock-first MVP is already implemented.
This is the authoritative prompt for attaching real models with fast
real-time-oriented runtimes.

Goal: connect the existing Jarvis Voice Sight architecture to real model
runtimes without breaking mock mode, frontend behavior, typed contracts, or
fallback policy.

Real-model target:

```text
User speech
  -> faster-whisper Breeze-ASR-25
  -> Gemma 4 E4B int4 through Ollama
  -> response policy
  -> BreezyVoice through OpenAI-compatible TTS API
  -> audio playback
```

Engineering rule:

Do not move model calls into the frontend.
Do not bypass the orchestrator.
Do not remove mock mode.
Do not change the public `/api/v1/voice-turn` contract.

## Selected Fast Runtime Choices

### ASR

Use `faster-whisper`, not the Transformers ASR pipeline and not standard
OpenAI Whisper.

Reason:

```text
faster-whisper uses CTranslate2, supports quantized inference, and is the
better low-latency path for a voice product demo.
```

Implementation requirements:

1. Add `ASR_RUNTIME=breeze_asr_25`.
2. Add `BREEZE_ASR_CT2_MODEL_PATH=models/breeze-asr-25-ct2`.
3. Add `BREEZE_ASR_COMPUTE_TYPE=int8_float16`.
4. Add `BREEZE_ASR_LANGUAGE=zh`.
5. Add `BREEZE_ASR_BEAM_SIZE=1`.
6. Add `BREEZE_ASR_VAD_FILTER=true`.
7. Load Breeze-ASR-25 through `faster_whisper.WhisperModel`.
8. Require Breeze-ASR-25 to be converted to CTranslate2 format before real ASR
   mode is enabled.
9. Add `scripts/convert_breeze_asr_ct2.sh` so the conversion path is executable.
10. Use `condition_on_previous_text=false`, `beam_size=1`, and VAD filtering for
    fast short-turn voice interaction.
11. Add `npm run real:convert-asr` as the repo-level conversion command.

Conversion command:

```bash
ct2-transformers-converter \
  --model MediaTek-Research/Breeze-ASR-25 \
  --output_dir models/breeze-asr-25-ct2 \
  --copy_files tokenizer.json preprocessor_config.json \
  --quantization float16
```

Lower-memory option:

```bash
ct2-transformers-converter \
  --model MediaTek-Research/Breeze-ASR-25 \
  --output_dir models/breeze-asr-25-ct2-int8 \
  --copy_files tokenizer.json preprocessor_config.json \
  --quantization int8
```

### LLM

Use Ollama for the first fast Gemma 4 E4B int4 integration.

Reason:

```text
Ollama keeps the model warm, avoids custom Transformers serving complexity,
and is fast enough for a local / near-edge voice demo.
```

Implementation requirements:

1. Add `LLM_RUNTIME=ollama`.
2. Add `OLLAMA_BASE_URL=http://localhost:11434`.
3. Add `OLLAMA_MODEL=gemma4:e4b`.
4. Add `OLLAMA_THINK=false` for latency-first voice replies.
5. Keep `LLM_PROVIDER=gemma_4_e4b` in the orchestrator.
6. The LLM service should call Ollama `/api/chat`.
7. Use the existing Jarvis prompt and send it as a system message.
8. Keep `max_tokens` / `num_predict` small, around `48`.
9. Keep temperature low, around `0.4`.

Setup:

```bash
npm run real:start-ollama
npm run real:pull-gemma
npm run real:start-asr
npm run real:start-breezyvoice
```

Use native Ollama first. CPU fallback is not accepted for the real-model demo.
If Docker is used instead, the container must run with `--gpus all` and prove
RTX GPU visibility before running Gemma.

### TTS

Use BreezyVoice through a warm OpenAI-compatible TTS API before falling back to
CLI subprocess mode.

Reason:

```text
A warm TTS server is faster and more product-realistic than spawning
single_inference.py for every Jarvis turn.
```

Implementation requirements:

1. Add `TTS_RUNTIME=openai_compatible`.
2. Add `OPENAI_TTS_BASE_URL=http://localhost:9003/v1`.
3. Add `OPENAI_TTS_MODEL=breezyvoice`.
4. Keep `TTS_PROVIDER=breezyvoice` in the orchestrator.
5. The Jarvis TTS service should call `/v1/audio/speech`.
6. Save returned audio bytes under `BREEZYVOICE_OUTPUT_DIR`.
7. Return `/audio/{file}.wav` to the orchestrator.
8. Keep `breezyvoice_cli` as fallback for machines without the API wrapper.
9. Require a matched BreezyVoice speaker prompt transcript through
   `BREEZYVOICE_SPEAKER_PROMPT_TEXT` or `BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE`.
10. Do not start zero-shot BreezyVoice cloning with an empty prompt transcript,
    because prompt-audio / prompt-text mismatch can make TTS drift away from the
    LLM output.

BreezyVoice startup path:

```bash
git clone https://github.com/mtkresearch/BreezyVoice.git ../BreezyVoice
npm run real:start-breezyvoice
```

Use `python openai_api_inference.py` only as an upstream smoke-test client after
the BreezyVoice service is running. Do not call `single_inference.py` or
`openai_api_inference.py` once per Jarvis turn in the real-time path.

## Required Environment For Real Demo

```env
ASR_PROVIDER=breeze_asr_25
ASR_RUNTIME=breeze_asr_25
ASR_SERVICE_URL=http://localhost:8001
BREEZE_ASR_CT2_MODEL_PATH=models/breeze-asr-25-ct2
BREEZE_ASR_DEVICE=cuda
BREEZE_ASR_COMPUTE_TYPE=int8_float16

LLM_PROVIDER=gemma_4_e4b
LLM_RUNTIME=ollama
LLM_SERVICE_URL=http://localhost:8002
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b
OLLAMA_THINK=false

TTS_PROVIDER=breezyvoice
TTS_RUNTIME=openai_compatible
TTS_SERVICE_URL=http://localhost:8003
OPENAI_TTS_BASE_URL=http://localhost:9003/v1
OPENAI_TTS_MODEL=breezyvoice
BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH=.local/voice-prompts/260610_0127_record_prompt_6s.wav
BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE=.local/voice-prompts/260610_0127_record_prompt_6s.txt
BREEZYVOICE_REQUIRE_PROMPT_TEXT=true

ENABLE_EMOTION=true
EMOTION_PROVIDER=mock
```

Also add `.env.real.example` with these values and keep `.env.example` in mock
mode.
Expose the real-provider health wiring through `npm run real:health`.
Expose the real-model preflight through `npm run real:preflight`.

## Acceptance Criteria

The real-model integration is accepted only if:

1. Mock mode still passes.
2. `/api/v1/health` reports `breeze_asr_25`, `gemma_4_e4b`, and `breezyvoice`
   providers when real env is enabled.
3. ASR service uses `faster_whisper.WhisperModel`, not Transformers pipeline.
4. LLM service can call Ollama `gemma4:e4b`.
5. TTS service can call an OpenAI-compatible BreezyVoice endpoint and serve the
   generated audio URL.
6. `/api/v1/voice-turn` contract remains unchanged.
7. If any real model fails, the existing fallback policy still protects the UI.
8. `npm run typecheck`, `npm run lint`, and `npm run test` pass.
9. A real-model smoke test is documented in `docs/REAL_MODEL_INTEGRATION.md`.
10. `scripts/real_model_preflight.sh` reports whether the CT2 ASR directory,
    Ollama model/server, and BreezyVoice upstream are ready.
11. `npm run real:health` proves the orchestrator reports real provider names
    without requiring the external model runtimes to be installed.
12. `npm run real:start-ollama`, `npm run real:pull-gemma`,
    `npm run real:start-asr`, and `npm run real:start-breezyvoice` provide an
    executable local GPU path for the real model stack.
13. All real AI model runtimes must use the RTX GPU. ASR must run on CUDA,
    Gemma/Ollama must run with GPU acceleration, and BreezyVoice must use a GPU
    TTS runtime. CPU execution is allowed only for orchestration, validation,
    response policy, file serving, and non-model glue code.

---

# Addendum: v0.2 TTS Latency Optimization Prompt

Status: Use this addendum after real model activation is working and
BreezyVoice output fidelity has been fixed with matched zero-shot prompt text.

Current diagnosis:

```text
TTS incoherent output was not an LLM problem.
The root cause was zero-shot speaker prompt alignment failure caused by missing
speaker prompt transcription.
```

Current measured real turn:

```text
real voice-turn total: 7.45s
TTS stage: 6.8s
target v0.2 real turn: 2.5s to 4s
```

Goal: Reduce real voice-turn latency by optimizing the TTS path.

Priority order:

1. Shorten Jarvis replies.
2. Add TTS warmup.
3. Add deterministic audio cache for fixed short replies.
4. Defer sentence-level streaming until after the short-reply and cache path is
   measured.
5. Add detailed latency breakdown logs for every real turn.

## Product Rule: Shorter Jarvis Replies

Jarvis MVP replies should be short, natural, and spoken-first.

Current undesired style:

```text
請具體說明您的擔憂。
```

Preferred style:

```text
你最擔心哪一點？
```

Prompt and policy requirements:

1. Change Jarvis reply target from 10-20 Chinese characters to 6-18 Chinese
   characters for voice mode.
2. Avoid formal customer-support wording.
3. Do not always ask questions.
4. Use a follow-up question only when it helps the conversation.
5. Prefer short acknowledgement, reflection, or light guidance.
6. Avoid repetitive sentence endings such as `就好`; vary cadence across turns.
7. Target response mix: 40% acknowledgement, 30% light guidance, 20% question,
   10% short summary.
8. Keep Traditional Chinese.
9. Keep no markdown, no bullets, no self-reference, and no tool claims.

## TTS Warmup

BreezyVoice startup should perform one short synthesis after the wrapper or
upstream is ready:

```text
好，我在。
```

Purpose:

```text
Avoid first-turn cold start latency during the live demo.
```

Implementation requirements:

1. Add a TTS warmup step during BreezyVoice wrapper startup or readiness flow.
2. Store the warmup audio in the same cache/output directory.
3. Log warmup latency.
4. Warmup must not block service startup forever; use a bounded timeout.
5. Warmup failure should mark a warning, not crash the whole demo if the TTS
   service is otherwise reachable.

## Deterministic Short Reply Audio Cache

Jarvis MVP uses repeated short replies. Cache fixed replies first:

```text
好，我在。
你說。
我懂。
繼續說。
你最擔心哪一點？
```

Cache requirements:

1. Normalize reply text before cache lookup.
2. Use deterministic cache keys based on text, voice ID, speed, pitch, and
   emotion style.
3. On cache hit, return the cached WAV URL without calling upstream BreezyVoice.
4. On cache miss, call upstream BreezyVoice, save the WAV, then populate cache.
5. Add response metadata or logs showing `tts_cache_hit=true|false`.
6. Keep cached files under an ignored local output/cache path.

## Sentence-Level Streaming

Sentence-level streaming is useful but not the immediate v0.2 priority.

Reason:

```text
Jarvis replies stay in a 6-18 character voice range after the short-reply
policy. For latency-critical demos, `REPLY_MAX_CHARS=14` can be used, so cache
and warmup should be measured before adding streaming complexity.
```

Do not implement full streaming in this optimization pass unless short-reply,
warmup, cache, and latency logging are already complete.

## Latency Breakdown Logging

Every `/api/v1/voice-turn` response and server log must expose:

```text
asr_ms
llm_ms
tts_ms
audio_encode_ms
total_ms
```

Keep existing fields:

```text
vad_ms
emotion_ms
policy_ms
```

Implementation requirements:

1. Add `audio_encode_ms` to latency reports where audio file/base64 encoding is
   measured.
2. Log per-stage latency for each turn in the orchestrator.
3. Log TTS cache hit/miss and upstream TTS latency in the TTS service.
4. Keep latency logs structured enough for later benchmark parsing.

## Implementation Scope

Implement:

1. Add TTS warmup during BreezyVoice wrapper startup.
2. Add deterministic audio cache for short fixed replies.
3. Add per-stage latency breakdown to `/api/v1/voice-turn` response and logs.
4. Add Jarvis short-reply prompt rule: 6-18 Chinese characters, configurable
   down to 14 for latency-critical demos, no formal wording.
5. Add tests for:
   - cache hit skips upstream TTS
   - cache miss calls upstream TTS
   - latency fields exist
   - reply text is cleaned before TTS

Acceptance:

1. `npm run typecheck` passes.
2. `npm run lint` passes.
3. `npm run test` passes.
4. `npm run real:health` passes.
5. Cached TTS reply returns under 500ms.
6. Uncached real turn reports latency breakdown.
7. Real AI model runtimes still use RTX GPU only.
8. BreezyVoice output still follows the LLM/policy text after caching and
   warmup.

## Next-Phase Prompt

The v0.1 to v0.2 prompt remains the baseline for the initial voice loop and
real-model integration. The current canonical next-phase prompt is:

```text
docs/CODEX_GOAL_PROMPT_v0.2.1_to_v0.3.md
```

Use the next-phase prompt for:

1. v0.2.1 demo stability.
2. turn-level cancellation.
3. stale playback protection.
4. realtime VAD state management.
5. barge-in.
6. always-listening preview.
7. sentence-level streaming.
