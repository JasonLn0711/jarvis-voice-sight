# Jarvis Voice Sight Software Design Document

Version: v0.1 to v0.2

Status: Canonical enterprise-style SDD

Repository: `jarvis-voice-sight`

Owner: Jason Lin, NYCU

Last updated: 2026-06-10

## 1. Executive Summary

Jarvis Voice Sight is a real-time voice AI coach implemented as a modular ASR -> LLM -> TTS system. The design separates orchestration from model execution, keeps model providers replaceable, and supports both mock-first development and real RTX GPU inference.

The current v0.2 system supports:

1. Push-to-talk voice interaction.
2. Mock and real model services.
3. Breeze-ASR-25 ASR through faster-whisper.
4. Gemma 4 E4B int4 LLM inference.
5. BreezyVoice Taiwan Mandarin TTS.
6. Emotion-aware response strategy.
7. Insurance / financial-services coach persona.
8. TTS cache and startup warmup.
9. Per-stage latency reporting.
10. Premium voice-first Next.js UI.

## 2. Design Principles

### 2.1 Product Principles

1. Conversation continuity is the primary product proof.
2. Latency matters more than broad reasoning for voice UX.
3. Spoken replies must be short.
4. Persona must be stable and natural.
5. Demo resilience matters: mock mode and fallbacks are first-class.

### 2.2 Engineering Principles

1. The orchestrator owns the workflow.
2. Frontend never calls model services directly.
3. AI models are replaceable adapters.
4. Core use cases depend on ports, not provider SDKs.
5. Every external model call has a timeout.
6. Every model failure has a safe fallback.
7. Context is bounded.
8. Safety policy runs after generation.
9. Latency is measured by stage.
10. Real AI model inference must run on RTX GPU, not CPU.

## 3. System Context

### 3.1 Runtime Topology

```text
Web Client
  |
  | POST /api/v1/voice-turn
  v
Orchestrator API
  |
  +--> ASR Service: Breeze-ASR-25 / mock
  |
  +--> Emotion Service: text classifier / mock
  |
  +--> LLM Service: Gemma 4 E4B int4 / mock
  |
  +--> Response Policy + Repair + Canonicalizer
  |
  +--> TTS Service: BreezyVoice / mock / cache
  |
  v
Web Client audio playback
```

### 3.2 High-Level Architecture

```text
Client App
  ↓
Audio Capture
  ↓
VAD
  ↓
ASR Adapter
  ↓
Conversation Orchestrator
  ↓
Emotion Adapter
  ↓
Prompt Strategy
  ↓
LLM Adapter
  ↓
Response Policy / Repair / Canonicalizer
  ↓
TTS Adapter
  ↓
Audio Playback
```

## 4. Repository Structure

```text
jarvis-voice-sight/
  README.md
  docs/
    PRODUCT_SPEC_v0.1_to_v0.2.md
    SDD_ENTERPRISE_v0.1_to_v0.2.md
    API_SPEC.md
    PROMPT_SPEC.md
    LATENCY_BUDGET.md
    REAL_MODEL_INTEGRATION.md
    LATENCY_OPTIMIZATION_REPORT.md
    RUNBOOK.md
    UI_UX_SPEC.md
  apps/
    web/
      src/
        app/
        components/
        hooks/
        lib/
  services/
    orchestrator/
      src/
        adapters/
        config/
        domain/
        events/
        factories/
        policy/
        repositories/
        strategies/
        tests/
        usecases/
    asr/
      src/
        server.py
    llm/
      src/
        server.py
    tts/
      src/
        server.py
      tests/
    emotion/
  packages/
    shared/
      src/
        schemas/
        types/
  scripts/
  docker/
```

## 5. Component Design

### 5.1 Web Client

Technology:

```text
Next.js
TypeScript
Framer Motion
CSS variables / Tailwind CSS
```

Responsibilities:

1. Capture microphone audio.
2. Support mock input mode.
3. Send voice-turn requests to the orchestrator.
4. Render state transitions.
5. Display transcript and Jarvis reply.
6. Play audio response.
7. Show quiet latency / emotion / session metadata.
8. Show bottom system stack rail.

Client states:

```text
IDLE
LISTENING
TRANSCRIBING
THINKING
SPEAKING
ERROR
```

Key files:

```text
apps/web/src/app/page.tsx
apps/web/src/components/VoiceOrb.tsx
apps/web/src/components/HoldToSpeakButton.tsx
apps/web/src/components/JarvisReplyCard.tsx
apps/web/src/components/TranscriptCard.tsx
apps/web/src/components/StatusStrip.tsx
apps/web/src/components/SystemStack.tsx
apps/web/src/hooks/useVoiceRecorder.ts
apps/web/src/hooks/useVoiceTurn.ts
apps/web/src/hooks/useAudioPlayback.ts
```

### 5.2 Orchestrator

Technology:

```text
Node.js
TypeScript
Fastify
Zod
pino
```

Responsibilities:

1. Expose API facade.
2. Validate requests.
3. Own voice-turn pipeline.
4. Apply circuit breakers.
5. Load bounded conversation context.
6. Call ASR, emotion, LLM, and TTS adapters.
7. Apply response policy and repair.
8. Persist recent conversation messages.
9. Return transcript, reply, audio URL, emotion, cache status, and latency report.

### 5.3 ASR Service

Technology:

```text
Python
FastAPI
faster-whisper
CTranslate2
CUDA
```

Real provider:

```text
Breeze-ASR-25
```

Responsibilities:

1. Decode incoming audio.
2. Run Breeze-ASR-25 through faster-whisper.
3. Enforce GPU-only execution.
4. Return transcript, language, confidence, duration, and optional segments.
5. Provide mock transcript behavior for development.

### 5.4 LLM Service

Technology:

```text
Python
FastAPI
Ollama or OpenAI-compatible local endpoint
RTX GPU runtime
```

Real provider:

```text
Gemma 4 E4B int4
```

Responsibilities:

1. Receive prompt and recent context.
2. Generate short Traditional Chinese reply.
3. Support mock replies for deterministic tests.
4. Keep output short and style-controlled.

### 5.5 TTS Service

Technology:

```text
Python
FastAPI
BreezyVoice
RTX GPU runtime
File-backed WAV cache
```

Responsibilities:

1. Normalize reply text.
2. Check deterministic audio cache.
3. Synthesize with BreezyVoice on cache miss.
4. Run startup warmup for fixed replies.
5. Serve audio URLs.
6. Report cache hit, upstream TTS time, audio encode time, and total TTS duration.

Zero-shot speaker prompt rule:

```text
Prompt audio must have aligned transcript text.
```

This prevents TTS from drifting away from the LLM output.

### 5.6 Emotion Service

Current v0.2 provider:

```text
mock / text-based classifier
```

Supported labels:

```text
neutral
anxious
tired
confused
excited
sad
angry
uncertain
```

Responsibilities:

1. Classify emotional signal from transcript.
2. Return label, confidence, and signals.
3. Fail open without blocking the main voice loop.

## 6. API Design

### 6.1 Main Voice Turn

```http
POST /api/v1/voice-turn
```

Request:

```json
{
  "session_id": "session_abc123",
  "audio_format": "wav",
  "audio_base64": "...",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Response:

```json
{
  "session_id": "session_abc123",
  "turn_id": "turn_001",
  "transcript": "我等一下要拜訪一個新客戶",
  "reply": "先抓住目標。",
  "emotion": {
    "label": "neutral",
    "confidence": 0.72,
    "signals": []
  },
  "audio_url": "/audio/cache/abc.wav",
  "tts_cache_hit": true,
  "latency": {
    "vad_ms": 10,
    "asr_ms": 120,
    "emotion_ms": 20,
    "llm_ms": 180,
    "policy_ms": 5,
    "tts_ms": 1,
    "audio_encode_ms": 0,
    "playback_delay_ms": 1200,
    "perceived_total_ms": 1536,
    "total_ms": 336
  },
  "status": "ok"
}
```

### 6.2 Debug Endpoints

```http
GET /api/v1/health
POST /api/v1/asr
POST /api/v1/chat
POST /api/v1/tts
POST /api/v1/emotion
```

Debug endpoints exist for testing and adapter isolation. The frontend should use `/api/v1/voice-turn` for product flow.

## 7. Data Models

### 7.1 Message

```ts
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
};
```

### 7.2 EmotionResult

```ts
type EmotionResult = {
  label:
    | "neutral"
    | "anxious"
    | "tired"
    | "confused"
    | "excited"
    | "sad"
    | "angry"
    | "uncertain";
  confidence: number;
  signals: string[];
  durationMs?: number;
};
```

### 7.3 LatencyReport

```ts
type LatencyReport = {
  vad_ms: number;
  asr_ms: number;
  emotion_ms: number;
  llm_ms: number;
  policy_ms: number;
  tts_ms: number;
  audio_encode_ms: number;
  playback_delay_ms: number;
  perceived_total_ms: number;
  total_ms: number;
};
```

### 7.4 VoiceTurnResponse

```ts
type VoiceTurnResponse = {
  session_id: string;
  turn_id: string;
  transcript: string;
  reply: string;
  emotion?: EmotionResult;
  audio_url?: string;
  tts_cache_hit?: boolean;
  latency: LatencyReport;
  status: "ok" | "partial" | "error";
};
```

## 8. Voice-Turn Pipeline

Pipeline steps:

```text
ValidateAudioStep
VADStep
ASRStep
ContextStep
EmotionStep
LLMStep
PolicyStep
TTSStep
PersistStep
PlaybackDelayStep
```

Step behavior:

1. Each step mutates a shared pipeline context.
2. Steps may short-circuit with fallback.
3. Model steps run behind circuit breakers.
4. Latency is recorded per step.
5. The final response is always shaped by the shared API contract.

## 9. Design Patterns

### 9.1 Hexagonal Architecture

Core use cases depend on ports:

```ts
interface ASRPort {
  transcribe(input: AudioInput): Promise<ASRResult>;
}
```

Adapters implement model-specific details:

```text
MockASRAdapter
HttpASRAdapter
BreezeASRAdapter
```

### 9.2 Adapter Pattern

Adapters:

```text
BreezeASRAdapter
GemmaE4BAdapter
BreezyVoiceAdapter
MockASRAdapter
MockLLMAdapter
MockTTSAdapter
MockEmotionAdapter
```

The orchestrator never imports model SDKs directly.

### 9.3 Strategy Pattern

Prompt strategies:

```text
ConciseJarvisStrategy
EmotionAwareJarvisStrategy
```

Future strategies:

```text
InterviewCoachStrategy
InsuranceCoachStrategy
ResearchPartnerStrategy
```

### 9.4 Facade Pattern

The frontend calls:

```http
POST /api/v1/voice-turn
```

The frontend does not coordinate ASR, LLM, emotion, or TTS.

### 9.5 Chain of Responsibility

Voice-turn steps are ordered and independently testable.

### 9.6 Factory Pattern

Providers are selected from config:

```text
ASR_PROVIDER
LLM_PROVIDER
TTS_PROVIDER
EMOTION_PROVIDER
```

### 9.7 Circuit Breaker Pattern

Repeated provider failure marks a service degraded and routes to fallback behavior.

### 9.8 Repository Pattern

Conversation history is accessed through:

```ts
interface ConversationRepository {
  getRecentMessages(sessionId: string): Promise<Message[]>;
  appendMessage(sessionId: string, message: Message): Promise<void>;
}
```

Current implementation:

```text
InMemoryConversationRepository
```

### 9.9 Observer Pattern

Lifecycle events:

```text
voice_turn_started
asr_completed
emotion_completed
llm_completed
tts_completed
voice_turn_completed
voice_turn_failed
```

## 10. Response Policy and Repair

### 10.1 Policy Requirements

Policy enforces:

1. Traditional Chinese.
2. Maximum reply length.
3. No markdown.
4. No bullet points.
5. No AI self-reference.
6. No formal customer-service wording.
7. No repetitive `就好` endings.
8. No return promises.
9. No specific product recommendation.
10. No authority claims.
11. No pressure-selling behavior.
12. One spoken sentence.

### 10.2 Repair Responsibilities

The repair layer improves recoverability after model output issues:

1. Replace formal phrasing with natural coach phrasing.
2. Avoid repeated generic fallback in late turns.
3. Map unsafe finance / insurance replies to safe canonical replies.
4. Improve cache hit rate by canonicalizing common responses.

### 10.3 Canonical Reply Examples

```text
好，我在。
你說。
我懂。
繼續說。
先抓住目標。
先不要急著推。
先建立信任感。
避免承諾報酬。
先尊重他的節奏。
可以，先穩穩聊。
```

## 11. TTS Cache and Warmup

### 11.1 Cache Key

Cache key should be deterministic over:

1. Normalized text.
2. Voice ID.
3. Speed.
4. Pitch if used.

Emotion style should not unnecessarily fragment cache when the spoken text is identical.

### 11.2 Cache Storage

Current cache is file-backed under:

```text
/tmp/jarvis-breezyvoice-audio/cache
```

This is runtime cache, not durable product memory.

### 11.3 Warmup

Startup warmup synthesizes fixed short replies so the first demo turn can hit cache.

Warmup examples:

```text
好，我在。
你說。
我懂。
繼續說。
你最擔心哪一點？
先建立信任感。
避免承諾報酬。
```

## 12. Latency Design

### 12.1 Stage-Level Budget

```text
VAD: 100ms
ASR: 400ms to 1000ms
LLM: 300ms to 800ms
Emotion: <= 300ms
Policy: <= 20ms
Cached TTS: <= 500ms
Uncached TTS: target 1s to 2.5s
Playback pacing: 1s to 2s perceived delay target
```

### 12.2 Reporting

Each turn returns:

```text
vad_ms
asr_ms
emotion_ms
llm_ms
policy_ms
tts_ms
audio_encode_ms
playback_delay_ms
perceived_total_ms
total_ms
```

### 12.3 Pacing Design

The system separates:

```text
real pipeline latency
perceived playback timing
```

This allows the demo to feel natural while preserving accurate engineering measurements.

## 13. Configuration

Key environment variables:

```env
APP_ENV=development
PORT=3000

ASR_PROVIDER=breeze_asr_25
ASR_SERVICE_URL=http://localhost:8001
ASR_RUNTIME=breeze_asr_25
BREEZE_ASR_DEVICE=cuda
BREEZE_ASR_COMPUTE_TYPE=int8_float16

LLM_PROVIDER=gemma_4_e4b
LLM_SERVICE_URL=http://localhost:8002
LLM_RUNTIME=ollama
OLLAMA_MODEL=gemma4:e4b

TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003
TTS_RUNTIME=openai_compatible
BREEZYVOICE_OUTPUT_DIR=/tmp/jarvis-breezyvoice-audio
BREEZYVOICE_CACHE_DIR=/tmp/jarvis-breezyvoice-audio/cache
BREEZYVOICE_WARMUP_ENABLED=true

ENABLE_EMOTION=true
EMOTION_PROVIDER=mock

MAX_RECENT_MESSAGES=10
REPLY_MAX_CHARS=18

TOTAL_TIMEOUT_MS=3000
ASR_TIMEOUT_MS=1000
LLM_TIMEOUT_MS=800
TTS_TIMEOUT_MS=1200
EMOTION_TIMEOUT_MS=300

ENABLE_PLAYBACK_DELAY=true
PLAYBACK_DELAY_MIN_MS=1000
PLAYBACK_DELAY_MAX_MS=2000
```

## 14. Error Handling

### 14.1 Error Types

```text
AudioValidationError
ASRTimeoutError
ASREmptyTranscriptError
LLMTimeoutError
PolicyViolationError
TTSTimeoutError
ServiceUnavailableError
```

### 14.2 Fallback Matrix

```text
No speech detected -> 我剛剛沒聽到。
ASR empty -> 我剛剛沒聽清楚。
LLM timeout -> 先停一下，我在。
Policy rejected -> repaired reply or 你可以再說一點。
TTS timeout -> return text-only response.
Emotion timeout -> continue without emotion.
Circuit breaker open -> provider-specific safe fallback.
```

## 15. Safety Design

Safety is implemented as product scope control plus response policy.

Rules:

1. No financial return promises.
2. No product-specific investment or insurance recommendation.
3. No medical, legal, underwriting, or investment authority claim.
4. No pressure-selling instruction.
5. No external action claims.
6. No long-term memory claims.
7. Short, non-authoritative coaching style.

Unsafe:

```text
你應該保證他可以賺。
```

Safe:

```text
避免承諾報酬。
```

## 16. Observability

### 16.1 Structured Logs

Important events:

```text
voice_turn_started
asr_completed
emotion_completed
llm_completed
policy_completed
tts_completed
voice_turn_completed
voice_turn_failed
```

### 16.2 Metrics

Metrics to track:

1. Total latency.
2. Stage latency.
3. Cache hit rate.
4. Policy rejection rate.
5. Fallback rate.
6. ASR empty rate.
7. TTS timeout rate.
8. Average turns per session.
9. Manual stop rate.

## 17. Testing Strategy

### 17.1 Unit Tests

Required coverage:

1. Response policy.
2. Prompt builder.
3. Emotion classifier.
4. Conversation repository.
5. Adapter factory.
6. Circuit breaker.
7. Response repair.
8. Response canonicalizer.
9. TTS cache.
10. Fallback handling.

### 17.2 Integration Tests

Required coverage:

1. `/voice-turn` happy path.
2. Empty audio fallback.
3. ASR timeout fallback.
4. LLM timeout fallback.
5. TTS failure returns text-only response.
6. Emotion disabled path.
7. Emotion enabled path.
8. Recent conversation context preserved.
9. Perceived playback latency fields exist.
10. TTS cache hit metadata returned.

### 17.3 Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run benchmark
npm run real:health
```

Current verification record:

```text
typecheck: passed
lint: passed
test: orchestrator 40/40, TTS cache 6/6
benchmark: P50/P95 total 480ms/480ms in mock benchmark
real:health: ASR breeze_asr_25, LLM gemma_4_e4b, TTS breezyvoice, emotion mock
```

## 18. Deployment and Run Modes

### 18.1 Mock Mode

Purpose:

1. Fast local development.
2. Deterministic tests.
3. Demo fallback when model services are unavailable.

### 18.2 Real-Model Local Mode

Purpose:

1. Run Breeze-ASR-25, Gemma 4 E4B int4, and BreezyVoice with RTX GPU.
2. Validate real latency and TTS quality.
3. Produce interview demo evidence.

### 18.3 Docker Compose Mode

Purpose:

1. Run web, orchestrator, ASR, LLM, TTS, and emotion services.
2. Keep service contracts stable.
3. Support reproducible local demos.

## 19. Security and Privacy

### 19.1 Audio Handling

1. Audio is used for immediate ASR and TTS interaction.
2. Temporary ASR files are deleted after transcription.
3. TTS cache stores generated reply audio, not raw user microphone recordings.
4. Private speaker prompt audio must not be committed to the repository.

### 19.2 Secrets

1. API keys remain in environment variables.
2. `.env` files are ignored.
3. `.env.real.example` documents required variables without secrets.

### 19.3 Memory

1. v0.2 only stores bounded session context.
2. Long-term memory is deferred until consent and deletion behavior are designed.

## 20. Scalability and Future Extension

### 20.1 v0.2.1 Demo Stability

VOISS feedback defines v0.2.1 as the demo-stability phase.

Implement:

1. Natural spoken Taiwanese Mandarin persona.
2. Short-sentence-first TTS text finalizer.
3. Deterministic TTS cache for at least 20 common replies.
4. `turn_id` propagation across ASR, LLM, TTS, playback, and logs.
5. Stale audio discard when active `turn_id` changes.
6. Explicit latency response fields including cache-hit status.
7. `npm run demo:real` one-command demo boot.

Acceptance:

```text
typecheck, lint, test, real:health, and real:preflight pass.
Cached TTS replies return under 500ms.
Persona no longer always asks questions.
```

### 20.2 v0.3 Realtime Voice Agent

VOISS feedback defines v0.3 as the realtime interaction phase.

Add:

```text
VAD State Manager
always-listening mode
barge-in support
turn cancellation
cancellable TTS queue
sentence-level LLM-to-TTS streaming
runtime state UI
```

Runtime states:

```typescript
type VoiceState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "asr_processing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error_recovery";
```

Thresholds:

```typescript
START_SPEECH_PROB = 0.6
END_SPEECH_PROB = 0.3
MIN_SPEECH_MS = 200
END_SILENCE_MS = 700
BARGE_IN_MS = 300
```

Barge-in behavior:

```typescript
audioPlayer.stop();
ttsQueue.clear();
cancelCurrentTurn();
state = "listening";
```

Streaming scope:

```text
Use sentence-level streaming first.
Do not implement token-level TTS before cancellation and sentence finalization are reliable.
```

Acceptance:

```text
User can speak without pressing stop manually.
Jarvis stops speaking within 500ms when interrupted.
No stale TTS audio is played after interruption.
No duplicate playback across 50 turns.
Runtime state is visible in UI.
v0.2.1 tests still pass.
```

### 20.3 v0.4 Memory

Add:

```text
MemoryService
MemoryRepository
MemoryPolicy
Consent model
Deletion path
```

### 20.4 v0.5 Tools

Add:

```text
ToolRegistry
ToolPermissionPolicy
ToolExecutionService
Human approval gate
```

### 20.5 v0.6 Vision

Add:

```text
VisionInputService
SceneDescriptionService
MultimodalContextBuilder
```

Future loop:

```text
Voice + Image -> Multimodal Context -> LLM -> TTS
```

## 21. Known Tradeoffs

1. Short replies reduce reasoning depth but improve voice rhythm.
2. File-backed TTS cache is simple and effective for demo, but production needs cache lifecycle management.
3. 5-turn memory is safer than 10-turn memory for response quality.
4. Mock emotion keeps latency stable, but richer prosody emotion needs a separate validation pass.
5. Playback pacing improves demo realism but must remain separate from real pipeline latency.
6. Gemma 4 E4B int4 is chosen for latency, not maximum reasoning ability.

## 22. Acceptance Criteria

The system is accepted for v0.2 demo when:

1. Voice turn works end to end.
2. Real-model health reports ASR, LLM, TTS, and emotion status.
3. Jarvis replies in short Traditional Chinese.
4. UI works on desktop and mobile.
5. TTS cache and warmup are active.
6. Latency report includes all required fields.
7. Emotion can be enabled or disabled.
8. Mock mode remains available.
9. Safety policy blocks unsafe finance / insurance claims.
10. Verification commands pass.

## 23. Final Architecture Decision

Jarvis Voice Sight should remain a voice-loop-first product.

The correct system boundary is:

```text
Frontend calls orchestrator.
Orchestrator owns the voice turn.
Models are replaceable services.
Policy and latency are first-class.
Memory and tools are future layers.
```

This design keeps the current VOISS demo focused, credible, extensible, and aligned with professional voice AI product engineering standards.
