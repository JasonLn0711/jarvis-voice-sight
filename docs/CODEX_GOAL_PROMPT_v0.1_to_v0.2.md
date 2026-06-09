# Codex Goal Prompt: Jarvis Voice Sight v0.1 → v0.2

Status: Canonical implementation prompt record

Recorded date: 2026-06-10

Repository: `jarvis-voice-sight`

Purpose: This file preserves the complete Codex goal prompt for building the
Jarvis Voice Sight MVP from an empty repository through v0.2. The prompt is
designed to drive a mock-first implementation where the full engineering
pipeline runs before real model integrations are attached.

---

下面這段可以直接丟給 Codex，目標是從空 repo 做到 v0.2 可跑。

You are Codex working inside the GitHub repository:

`jarvis-voice-sight`

Goal: build a complete MVP from zero to v0.2 according to the following product and software design.

Product: Jarvis Voice Sight
Purpose: real-time voice companion loop
Core pipeline:

User speech → VAD → Breeze-ASR-25 → Gemma 4 E4B → response policy → BreezyVoice TTS → audio playback

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
* later replaceable with real Breeze-ASR-25, Gemma 4 E4B, BreezyVoice

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
   Reply length must be 10–20 Chinese characters.
   Tone: calm, concise, intelligent, supportive.
   Goal: keep the user talking.

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

   * anxious → slow down, ask one concrete question
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

REPLY_MAX_CHARS=20
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
6. next steps for real Breeze-ASR-25, Gemma 4 E4B, and BreezyVoice integration

這份 prompt 的重點是：先 mock 全流程跑通，再換真模型。你明天 demo 時，就算模型還沒接完，也能展示「工程架構是對的」。
