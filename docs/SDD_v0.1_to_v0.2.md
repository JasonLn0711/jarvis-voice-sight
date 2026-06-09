# Jarvis Voice Sight

# MVP Software Design Document

# Version: v0.1 → v0.2

# Repository: `jarvis-voice-sight`

Status: Canonical SDD record

Recorded date: 2026-06-10

技術依據：Breeze-ASR-25 是基於 Whisper-large-v2 微調，強化繁中與中英混用辨識；BreezyVoice 是針對台灣華語調整的 TTS / voice cloning 系統；Gemma 4 E4B 是 Google Gemma 4 系列的小型 multimodal / edge-oriented 模型之一，適合低延遲本地或近端推論。([GitHub][1])

## 1. Product Definition

`jarvis-voice-sight` is a real-time voice interaction MVP.
The system allows a user to speak through a microphone, converts speech to text using Breeze-ASR-25, generates a short Jarvis-style response using Gemma 4 E4B, and speaks the response back using BreezyVoice.

The first goal is not to build a full AI agent.
The first goal is to prove a stable real-time voice loop:

```text
User Speech → ASR → LLM → TTS → Spoken Reply
```

The product should feel like a calm, concise, intelligent voice companion.
For v0.1, Jarvis only responds in 10–20 Traditional Chinese characters and keeps the conversation going.

## 2. Version Roadmap

## v0.1 — Minimal Real-Time Voice Loop

Goal: prove that a user can speak to Jarvis and receive a short spoken reply.

Included:

1. Push-to-talk voice input
2. Voice activity detection
3. Breeze-ASR-25 transcription
4. Gemma 4 E4B short reply generation
5. BreezyVoice TTS synthesis
6. Audio playback
7. Recent conversation context
8. Basic latency logging
9. Basic failure fallback

Excluded:

1. Long-term memory
2. Tool calling
3. RAG
4. Search
5. Calendar
6. Email
7. Vision
8. Wake word
9. Multi-user account system
10. Autonomous agent behavior

## v0.2 — Emotion-Aware Voice Companion

Goal: make Jarvis adapt response style based on the user's emotional signal.

Added:

1. Emotion classification from transcript
2. Optional prosody-based emotion signal
3. Response policy engine
4. More structured conversation state
5. Session-level analytics
6. Configurable persona profiles
7. Better interruption handling
8. Streaming-oriented pipeline interface

v0.2 still does not include tool calling or RAG.
The priority remains conversational continuity and low latency.

# 3. MVP Success Criteria

## 3.1 Product Metrics

Primary metric:

```text
Average Turns Per Session
```

This measures whether users want to keep speaking.

Secondary metrics:

```text
Session Completion Rate
User Re-engagement Rate
Manual Stop Rate
Average Response Latency
P95 Response Latency
ASR Empty Transcript Rate
TTS Failure Rate
```

## 3.2 Engineering Metrics

v0.1 target:

```text
P50 total latency < 1.5 seconds
P95 total latency < 2.5 seconds
```

v0.2 target:

```text
P50 total latency < 1.8 seconds
P95 total latency < 3.0 seconds
```

Emotion detection may add latency, so it must run in parallel when possible.

# 4. High-Level Architecture

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
LLM Adapter
  ↓
Response Policy
  ↓
TTS Adapter
  ↓
Audio Playback
```

The system must be modular.
Each AI model must be replaceable without changing the whole application.

# 5. System Components

## 5.1 Client Layer

Responsibilities:

1. Capture microphone audio
2. Send audio chunks or final audio file to backend
3. Display transcript
4. Display Jarvis reply
5. Play synthesized audio
6. Show system state

Client states:

```text
IDLE
LISTENING
TRANSCRIBING
THINKING
SPEAKING
ERROR
```

v0.1 UI:

```text
[Push to Talk]

User:
我明天要面試

Jarvis:
你最擔心哪部分？
```

## 5.2 Audio Capture Module

Responsibilities:

1. Record microphone input
2. Normalize sample rate
3. Convert to mono
4. Export WAV or PCM
5. Reject too-short audio

Recommended format:

```text
sample_rate: 16000 Hz
channels: mono
format: wav
encoding: PCM 16-bit
```

## 5.3 VAD Module

Responsibilities:

1. Detect speech start
2. Detect speech end
3. Prevent sending silence to ASR
4. Improve latency

v0.1 can use simple push-to-talk.
v0.2 should introduce automatic VAD.

Interface:

```ts
interface VADService {
  detect(input: AudioBuffer): Promise<VADResult>;
}
```

Result:

```ts
type VADResult = {
  hasSpeech: boolean;
  speechStartMs?: number;
  speechEndMs?: number;
  confidence?: number;
};
```

## 5.4 ASR Service

Model:

```text
Breeze-ASR-25
```

Responsibilities:

1. Convert speech to text
2. Return transcript
3. Return confidence if available
4. Return timestamps if available
5. Normalize transcript

Interface:

```ts
interface ASRService {
  transcribe(input: AudioInput): Promise<ASRResult>;
}
```

Result:

```ts
type ASRResult = {
  text: string;
  language?: string;
  confidence?: number;
  durationMs: number;
  segments?: ASRSegment[];
};
```

Failure rules:

1. Empty transcript → ask user to repeat
2. Low confidence → generate cautious reply
3. ASR timeout → return system fallback

Fallback reply:

```text
我剛剛沒聽清楚。
```

## 5.5 LLM Service

Model:

```text
Gemma 4 E4B
```

Responsibilities:

1. Receive transcript
2. Receive recent context
3. Generate short reply
4. Obey persona policy
5. Avoid long explanations

Interface:

```ts
interface LLMService {
  generate(input: LLMInput): Promise<LLMResult>;
}
```

Input:

```ts
type LLMInput = {
  userText: string;
  recentMessages: Message[];
  persona: PersonaConfig;
  responsePolicy: ResponsePolicy;
};
```

Output:

```ts
type LLMResult = {
  reply: string;
  tokensUsed?: number;
  durationMs: number;
  finishReason?: string;
};
```

## 5.6 Persona Policy

v0.1 persona:

```text
Name: Jarvis
Language: Traditional Chinese
Tone: calm, concise, intelligent
Reply length: 10–20 Chinese characters
Main purpose: keep the user talking
```

System prompt:

```text
You are Jarvis.

You are calm, intelligent, concise, and supportive.
Always reply in Traditional Chinese.
Reply in 10 to 20 Chinese characters.
Never explain.
Never use bullet points.
Never mention that you are an AI model.
Your goal is to keep the user talking.
Ask short follow-up questions when useful.
```

Examples:

```text
User: 我明天要面試
Jarvis: 你最擔心哪部分？

User: 我怕講不好
Jarvis: 先抓住一個重點。

User: 我今天很累
Jarvis: 今天最耗你的事是？
```

## 5.7 Response Policy Engine

The response policy runs after LLM generation.

Responsibilities:

1. Enforce length limit
2. Remove verbose phrases
3. Remove self-reference
4. Convert Simplified Chinese to Traditional Chinese if needed
5. Reject unsafe or broken output
6. Provide fallback response

Interface:

```ts
interface ResponsePolicyEngine {
  validate(reply: string, context: ConversationContext): PolicyResult;
}
```

Policy result:

```ts
type PolicyResult = {
  accepted: boolean;
  finalReply: string;
  reason?: string;
};
```

v0.1 rules:

```text
max_chars: 20
language: zh-TW
no_markdown: true
no_bullets: true
no_emoji: true
no_tool_claims: true
```

## 5.8 TTS Service

Model:

```text
BreezyVoice
```

Responsibilities:

1. Convert reply text to speech
2. Return playable audio
3. Support selected speaker voice
4. Support future voice style control

Interface:

```ts
interface TTSService {
  synthesize(input: TTSInput): Promise<TTSResult>;
}
```

Input:

```ts
type TTSInput = {
  text: string;
  voiceId: string;
  speed?: number;
  pitch?: number;
  emotionStyle?: string;
};
```

Output:

```ts
type TTSResult = {
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  durationMs: number;
  format: "wav" | "mp3";
};
```

v0.1 default voice:

```text
voiceId: jarvis_default_zh_tw
speed: 1.0
pitch: default
```

# 6. v0.2 Emotion-Aware Extension

## 6.1 Emotion Service

v0.2 adds emotion detection.

Input sources:

1. Transcript text
2. Optional ASR confidence
3. Optional audio prosody features

Emotion labels:

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

Interface:

```ts
interface EmotionService {
  classify(input: EmotionInput): Promise<EmotionResult>;
}
```

Input:

```ts
type EmotionInput = {
  text: string;
  audioFeatures?: AudioFeatureSet;
  recentMessages: Message[];
};
```

Output:

```ts
type EmotionResult = {
  label: EmotionLabel;
  confidence: number;
  signals: string[];
  durationMs: number;
};
```

Example:

```json
{
  "label": "anxious",
  "confidence": 0.87,
  "signals": ["怕", "失敗", "明天面試"]
}
```

## 6.2 v0.2 Response Strategy

Emotion-aware response rules:

```text
anxious → slow down, ask one concrete question
tired → reduce cognitive load
confused → clarify
excited → match energy lightly
sad → acknowledge, keep gentle
angry → de-escalate
uncertain → help choose next step
neutral → continue naturally
```

Example:

```text
User: 我覺得明天會完蛋
Emotion: anxious
Jarvis: 先拆一題來練。
```

# 7. Backend API Design

## 7.1 Main Endpoint

```http
POST /api/v1/voice-turn
```

Purpose:

Run one full voice interaction turn.

Input:

```json
{
  "session_id": "session_abc123",
  "audio_format": "wav",
  "audio_base64": "...",
  "client_timestamp": "2026-06-10T23:50:00+08:00"
}
```

Output:

```json
{
  "session_id": "session_abc123",
  "turn_id": "turn_001",
  "transcript": "我明天要面試",
  "reply": "你最擔心哪部分？",
  "audio_url": "/audio/session_abc123/turn_001.wav",
  "latency": {
    "vad_ms": 35,
    "asr_ms": 520,
    "llm_ms": 310,
    "policy_ms": 5,
    "tts_ms": 610,
    "total_ms": 1480
  },
  "status": "ok"
}
```

## 7.2 ASR Endpoint

```http
POST /api/v1/asr
```

Used for debugging and modular testing.

## 7.3 Chat Endpoint

```http
POST /api/v1/chat
```

Used for LLM-only testing.

## 7.4 TTS Endpoint

```http
POST /api/v1/tts
```

Used for TTS-only testing.

## 7.5 Health Check

```http
GET /api/v1/health
```

Output:

```json
{
  "status": "ok",
  "services": {
    "asr": "ready",
    "llm": "ready",
    "tts": "ready"
  }
}
```

# 8. Data Models

## 8.1 Message

```ts
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
};
```

## 8.2 ConversationContext

```ts
type ConversationContext = {
  sessionId: string;
  recentMessages: Message[];
  maxMessages: number;
};
```

v0.1:

```text
maxMessages = 6
```

This means 3 user turns and 3 assistant turns.

## 8.3 VoiceTurn

```ts
type VoiceTurn = {
  turnId: string;
  sessionId: string;
  transcript: string;
  reply: string;
  emotion?: EmotionResult;
  latency: LatencyReport;
  status: "ok" | "partial" | "error";
};
```

## 8.4 LatencyReport

```ts
type LatencyReport = {
  vadMs?: number;
  asrMs: number;
  llmMs: number;
  policyMs: number;
  ttsMs: number;
  totalMs: number;
};
```

# 9. Recommended Repository Structure

```text
jarvis-voice-sight/
  README.md
  docs/
    SDD_v0.1_to_v0.2.md
    API_SPEC.md
    LATENCY_BUDGET.md
    PROMPT_SPEC.md
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
        main.ts
        routes/
        controllers/
        usecases/
        domain/
        infra/
        config/
        tests/
    asr/
      src/
        server.py
        adapters/
        models/
        tests/
    llm/
      src/
        server.py
        adapters/
        prompts/
        tests/
    tts/
      src/
        server.py
        adapters/
        voices/
        tests/
  packages/
    shared/
      src/
        types/
        schemas/
        errors/
        logger/
  scripts/
    dev.sh
    test.sh
    benchmark_latency.sh
  docker/
    docker-compose.dev.yml
    Dockerfile.orchestrator
    Dockerfile.asr
    Dockerfile.llm
    Dockerfile.tts
  .env.example
```

# 10. Architectural Principle

The system must separate orchestration from model execution.

Bad design:

```text
Frontend directly calls ASR, then LLM, then TTS manually.
```

Good design:

```text
Frontend calls Orchestrator.
Orchestrator controls ASR, LLM, policy, TTS.
Each model is replaceable.
```

Reason:

1. Model providers will change
2. Latency strategy will change
3. v0.2 adds emotion
4. v0.3 may add memory
5. v0.4 may add tools
6. Frontend should not know model internals

# 11. Design Patterns

## 11.1 Hexagonal Architecture

Use ports and adapters.

Core domain should depend on interfaces, not model implementations.

Example:

```ts
interface ASRPort {
  transcribe(audio: AudioInput): Promise<ASRResult>;
}

class BreezeASRAdapter implements ASRPort {
  async transcribe(audio: AudioInput): Promise<ASRResult> {
    // Breeze-ASR-25 implementation
  }
}
```

Benefit:

Breeze-ASR-25 can later be replaced with Whisper, SenseVoice, or a VOISS internal ASR without changing the core use case.

## 11.2 Strategy Pattern

Use strategy objects for response behavior.

```ts
interface ResponseStrategy {
  buildPrompt(input: StrategyInput): Prompt;
}
```

v0.1:

```text
ConciseJarvisStrategy
```

v0.2:

```text
EmotionAwareJarvisStrategy
```

Future:

```text
InterviewCoachStrategy
ResearchPartnerStrategy
MedicalIntakeStrategy
```

## 11.3 Adapter Pattern

Each model service must be wrapped by an adapter.

Adapters:

```text
BreezeASRAdapter
GemmaE4BAdapter
BreezyVoiceAdapter
EmotionClassifierAdapter
```

The orchestrator never calls model SDKs directly.

## 11.4 Facade Pattern

Expose one simple endpoint:

```http
POST /api/v1/voice-turn
```

The client does not need to understand ASR, LLM, TTS, or emotion modules.

## 11.5 Chain of Responsibility

The voice turn pipeline should be implemented as chained processing steps.

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
```

Each step can:

1. Continue
2. Modify context
3. Short-circuit with fallback
4. Throw typed error

## 11.6 Factory Pattern

Use factories to select model providers from config.

```ts
const asr = ASRFactory.create(process.env.ASR_PROVIDER);
const llm = LLMFactory.create(process.env.LLM_PROVIDER);
const tts = TTSFactory.create(process.env.TTS_PROVIDER);
```

Example config:

```env
ASR_PROVIDER=breeze_asr_25
LLM_PROVIDER=gemma_4_e4b
TTS_PROVIDER=breezyvoice
```

## 11.7 Circuit Breaker Pattern

If a model repeatedly fails, the system should stop calling it temporarily.

Example:

```text
TTS fails 3 times within 60 seconds
→ return text-only response
→ mark TTS degraded
```

This prevents the demo from collapsing because one service fails.

## 11.8 Repository Pattern

Conversation state should be accessed through an interface.

```ts
interface ConversationRepository {
  getRecentMessages(sessionId: string): Promise<Message[]>;
  appendMessage(sessionId: string, message: Message): Promise<void>;
}
```

v0.1 implementation:

```text
InMemoryConversationRepository
```

v0.2 implementation:

```text
RedisConversationRepository
```

Future:

```text
PostgresConversationRepository
VectorMemoryRepository
```

## 11.9 Observer Pattern

Emit lifecycle events for logging and analytics.

Events:

```text
voice_turn_started
asr_completed
llm_completed
tts_completed
voice_turn_completed
voice_turn_failed
```

This keeps analytics separate from core logic.

# 12. Voice Turn Sequence

```text
Client
  → POST /voice-turn
  → Orchestrator validates audio
  → VAD checks speech
  → ASR transcribes
  → Conversation context loads
  → Emotion service runs if v0.2 enabled
  → Prompt strategy builds prompt
  → LLM generates reply
  → Policy engine validates reply
  → TTS generates audio
  → Conversation repository saves turn
  → Client receives transcript, reply, audio
```

# 13. Prompt Engineering Spec

## 13.1 v0.1 Prompt Template

```text
System:
You are Jarvis.
You are calm, intelligent, concise, and supportive.
Always reply in Traditional Chinese.
Reply in 10 to 20 Chinese characters.
Never explain.
Never use bullet points.
Never mention that you are an AI model.
Your goal is to keep the user talking.

Recent conversation:
{{recent_messages}}

User:
{{user_text}}

Assistant:
```

## 13.2 v0.2 Prompt Template

```text
System:
You are Jarvis.
You are calm, intelligent, concise, and supportive.
Always reply in Traditional Chinese.
Reply in 10 to 20 Chinese characters.
Never explain.
Never use bullet points.
Never mention that you are an AI model.
Your goal is to keep the user talking.

User emotional state:
{{emotion_label}}
Confidence:
{{emotion_confidence}}

Response rule:
{{emotion_response_rule}}

Recent conversation:
{{recent_messages}}

User:
{{user_text}}

Assistant:
```

# 14. Error Handling

## 14.1 Error Types

```ts
class AudioValidationError extends Error {}
class ASRTimeoutError extends Error {}
class ASREmptyTranscriptError extends Error {}
class LLMTimeoutError extends Error {}
class PolicyViolationError extends Error {}
class TTSTimeoutError extends Error {}
class ServiceUnavailableError extends Error {}
```

## 14.2 Fallback Matrix

```text
No speech detected:
→ 我剛剛沒聽到。

ASR empty:
→ 我剛剛沒聽清楚。

LLM timeout:
→ 先停一下，我在。

TTS timeout:
→ return text only

Policy rejected:
→ 你可以再說一點。
```

# 15. Safety Design

v0.1 safety scope is minimal but required.

Rules:

1. Jarvis must not claim medical, legal, or financial authority.
2. Jarvis must not give dangerous instructions.
3. Jarvis must not pretend to perform external actions.
4. Jarvis must not claim it remembers things outside the current session.
5. Jarvis must not output long persuasive advice.
6. Jarvis must keep responses short and non-authoritative.

Unsafe example:

```text
你應該立刻辭職。
```

Safe replacement:

```text
先別急著定案。
```

# 16. Configuration

`.env.example`

```env
APP_ENV=development
PORT=3000

ASR_PROVIDER=breeze_asr_25
ASR_SERVICE_URL=http://localhost:8001

LLM_PROVIDER=gemma_4_e4b
LLM_SERVICE_URL=http://localhost:8002

TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003

ENABLE_EMOTION=false
EMOTION_SERVICE_URL=http://localhost:8004

CONVERSATION_STORE=memory
MAX_RECENT_MESSAGES=6

REPLY_MAX_CHARS=20
TOTAL_TIMEOUT_MS=3000
ASR_TIMEOUT_MS=1000
LLM_TIMEOUT_MS=800
TTS_TIMEOUT_MS=1200
```

# 17. Testing Strategy

## 17.1 Unit Tests

Required:

1. Audio validation
2. ASR adapter mock
3. LLM adapter mock
4. TTS adapter mock
5. Response policy
6. Conversation repository
7. Prompt builder
8. Error fallback

## 17.2 Integration Tests

Required:

1. `/voice-turn` returns transcript, reply, audio
2. Empty audio returns fallback
3. ASR timeout returns fallback
4. LLM long output is trimmed or rejected
5. TTS failure returns text-only result
6. Conversation context updates correctly

## 17.3 Latency Tests

Test script:

```text
scripts/benchmark_latency.sh
```

Minimum benchmark set:

```text
10 short utterances
10 medium utterances
10 noisy utterances
10 mixed Chinese-English utterances
```

Report:

```text
P50 ASR latency
P95 ASR latency
P50 LLM latency
P95 LLM latency
P50 TTS latency
P95 TTS latency
P50 total latency
P95 total latency
```

# 18. v0.1 Acceptance Criteria

The MVP is accepted only if:

1. User can press button and speak.
2. System returns transcript.
3. System generates Jarvis-style reply.
4. System speaks reply through TTS.
5. Reply is Traditional Chinese.
6. Reply is under 20 Chinese characters.
7. System preserves recent context.
8. Total P95 latency is under 2.5 seconds in local demo.
9. System handles empty speech.
10. System handles TTS failure without crashing.

# 19. v0.2 Acceptance Criteria

v0.2 is accepted only if:

1. Emotion service returns one of the supported labels.
2. Emotion result affects response strategy.
3. Emotion failure does not block the main voice loop.
4. v0.1 behavior still works when emotion is disabled.
5. Session analytics records emotion distribution.
6. P95 total latency remains under 3 seconds.
7. Persona config can be changed without code rewrite.

# 20. Deployment Plan

## v0.1 Local Demo

Recommended deployment:

```text
Frontend: Next.js
Orchestrator: Node.js / Fastify or Next.js API route
ASR: Python FastAPI service
LLM: Python FastAPI or llama.cpp server
TTS: Python FastAPI service
```

Use Docker Compose:

```text
web
orchestrator
asr-service
llm-service
tts-service
```

## v0.2 Local + Lab GPU

Recommended architecture:

```text
Web Client
  ↓
Orchestrator API
  ↓
Lab GPU Model Services
```

Model services can run on the GPU machine.
The orchestrator only needs stable HTTP contracts.

# 21. Future Extension Points

## v0.3 Memory

Add:

```text
MemoryService
MemoryRepository
MemoryPolicy
```

Memory must be opt-in.
Do not mix memory into conversation repository.

## v0.4 Tool Calling

Add:

```text
ToolRegistry
ToolPermissionPolicy
ToolExecutionService
```

Jarvis must ask before taking external action.

## v0.5 Vision

Because the repo name is `jarvis-voice-sight`, future vision support should be planned.

Add:

```text
VisionInputService
SceneDescriptionService
MultimodalContextBuilder
```

Vision should enter the same orchestrator as another input modality.

Future loop:

```text
Voice + Image → Multimodal Context → LLM → TTS
```

# 22. Engineering Principles

1. The orchestrator owns the workflow.
2. AI models are replaceable adapters.
3. Frontend does not know model internals.
4. Prompts are versioned.
5. Latency is measured per stage.
6. Every external model call has timeout.
7. Every model failure has fallback.
8. Safety policy runs after generation.
9. Context is bounded.
10. v0.1 must stay small enough to demo.
11. v0.2 must extend v0.1 without rewriting it.
12. No hidden side effects.
13. No direct tool calling before explicit product decision.
14. No long-term memory before consent design.
15. No medical, legal, or financial authority claims.

# 23. Recommended Implementation Order

## Day 1

1. Create repo structure
2. Build premium voice-first push-to-talk UI
3. Build orchestrator `/voice-turn`
4. Mock ASR, LLM, TTS

## Day 2

1. Connect Breeze-ASR-25
2. Connect Gemma 4 E4B
3. Connect BreezyVoice
4. Add response policy

## Day 3

1. Add latency logging
2. Add failure fallback
3. Add conversation state
4. Run local demo

## v0.2 Sprint

1. Add EmotionService interface
2. Add mock emotion classifier
3. Add text-based emotion classifier
4. Add emotion-aware prompt strategy
5. Add analytics events
6. Add config-based persona profiles

# 24. One-Sentence Interview Positioning

Jarvis v0.1 is intentionally small: it validates whether a low-latency ASR → LLM → TTS voice loop can make users continue speaking, while the architecture keeps ASR, reasoning, persona, emotion, and TTS replaceable for v0.2 and beyond.

你明天講這份 spec 時，核心句子可以用這個：

> 我這版不是要做完整 Agent，而是先驗證 voice loop 的產品手感；工程上我把 ASR、LLM、TTS 全部做成 adapter，v0.2 才能加 emotion-aware policy，而不用推倒重寫。

# 25. UI / UX Specification

Canonical UI / UX source: `docs/UI_UX_SPEC.md`.

The SDD includes the UI as a first-class product requirement. Jarvis Voice Sight must not present as a developer dashboard or hackathon demo. It must present as a premium voice-first AI companion prototype with Apple × OpenAI quality: minimal, dark, spacious, calm, responsive, and high-end.

## 25.1 UI Goal

The interface must feel premium, calm, minimal, and intelligent.

This is not a developer dashboard.
This is a voice-first AI companion interface.

The user should feel:

```text
quiet
focused
safe
high-end
responsive
alive
```

The UI must look closer to Apple, OpenAI, and Humane-style product pages than a typical hackathon demo.

## 25.2 Core Design Principle

Use fewer elements.

Every screen should answer only three questions:

```text
Is Jarvis listening?
What did Jarvis hear?
What did Jarvis say?
```

Everything else is secondary.

## 25.3 Visual Direction

Use:

```text
soft dark background
large empty space
glassmorphism cards
subtle gradients
thin borders
smooth motion
high-quality typography
minimal text
premium spacing
```

Avoid:

```text
bright toy colors
developer-style boxes
busy dashboards
tables
raw JSON
heavy borders
cheap shadows
emoji-heavy UI
```

## 25.4 Color System

Background:

```css
--bg-main: #08090C;
--bg-surface: rgba(255, 255, 255, 0.06);
--bg-surface-strong: rgba(255, 255, 255, 0.10);
```

Text:

```css
--text-primary: #F5F5F7;
--text-secondary: rgba(245, 245, 247, 0.68);
--text-tertiary: rgba(245, 245, 247, 0.42);
```

Accent:

```css
--accent: #A7C7FF;
--accent-strong: #D7E6FF;
--accent-muted: rgba(167, 199, 255, 0.16);
```

Status:

```css
--listening: #A7C7FF;
--thinking: #C9B8FF;
--speaking: #B7F7D4;
--error: #FF9A9A;
```

## 25.5 Typography

Use system fonts first:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Display",
  "SF Pro Text",
  "Inter",
  "Noto Sans TC",
  sans-serif;
```

Type scale:

```css
/* Hero title */
font-size: 56px;
font-weight: 600;
letter-spacing: -0.04em;

/* Subtitle */
font-size: 18px;
font-weight: 400;
line-height: 1.6;
color: var(--text-secondary);

/* Transcript */
font-size: 22px;
font-weight: 400;
line-height: 1.5;

/* Jarvis reply */
font-size: 32px;
font-weight: 500;
letter-spacing: -0.02em;

/* Small metadata */
font-size: 13px;
font-weight: 400;
color: var(--text-tertiary);
```

## 25.6 Main Layout

Desktop layout:

```text
┌──────────────────────────────────────────────┐
│ Jarvis Voice Sight                            │
│ Real-time voice companion                     │
│                                              │
│              [Orb / Voice Core]              │
│                                              │
│         "You can speak when ready."          │
│                                              │
│     User transcript card                     │
│     Jarvis response card                     │
│                                              │
│              [Hold to Speak]                 │
│                                              │
│     latency · emotion · session state        │
└──────────────────────────────────────────────┘
```

Mobile layout:

```text
Top:
Jarvis Voice Sight

Center:
Voice orb

Below:
Jarvis reply

Bottom:
Hold to Speak button
```

The voice orb is the emotional center of the product.

## 25.7 Voice Orb

The orb represents Jarvis' current state:

```text
IDLE
LISTENING
TRANSCRIBING
THINKING
SPEAKING
ERROR
```

Visual behavior:

```text
IDLE: soft glow, slow breathing animation
LISTENING: larger glow, waveform ring reacts to microphone input
TRANSCRIBING: thin rotating ring
THINKING: slow pulsing gradient
SPEAKING: audio-reactive pulse
ERROR: soft red glow, no harsh warning UI
```

## 25.8 Copywriting

The UI text must be short, quiet, and premium.

Do not use:

```text
Start recording now!!!
AI is thinking...
Error occurred!!!
```

Use:

```text
Speak when ready.
Listening.
Thinking.
I heard this.
Jarvis replied.
Connection softened. Try again.
```

Main copy:

```text
Title: Jarvis Voice Sight
Subtitle: A real-time voice companion that listens, thinks, and responds.
Idle: Speak when ready.
Listening: Listening.
Thinking: Thinking.
Speaking: Speaking.
Error: Something faded. Try again.
Button: Hold to Speak / Release to Send / Try Again
```

## 25.9 Frontend Components

Required components:

```text
AppShell
VoiceOrb
TranscriptCard
JarvisReplyCard
HoldToSpeakButton
StatusStrip
```

Required hooks:

```text
useVoiceRecorder
useVoiceTurn
useAudioPlayback
```

Voice state contract:

```ts
type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";
```

Core component props:

```ts
type VoiceOrbProps = {
  state: VoiceState;
  level?: number;
};

type TranscriptCardProps = {
  transcript?: string;
  placeholder?: string;
};

type JarvisReplyCardProps = {
  reply?: string;
  emotion?: EmotionLabel;
};

type HoldToSpeakButtonProps = {
  state: VoiceState;
  onPressStart: () => void;
  onPressEnd: () => void;
};

type StatusStripProps = {
  latencyMs?: number;
  emotion?: EmotionLabel;
  sessionState?: string;
};
```

## 25.10 Motion Design

Use Framer Motion.

Animation principles:

```text
slow
subtle
physical
no bouncing toy effects
```

Durations:

```text
fast: 120ms
normal: 240ms
slow: 800ms
breathing: 3000ms
```

Motion rules:

```text
Hover: slight lift, slight glow
Press: scale 0.98
State transition: crossfade + scale
Cards: glassmorphism, thin white border, blur background, subtle enter animation
```

## 25.11 Frontend File Structure

```text
apps/web/
  src/
    app/
      page.tsx
      layout.tsx
      globals.css
    components/
      AppShell.tsx
      VoiceOrb.tsx
      TranscriptCard.tsx
      JarvisReplyCard.tsx
      HoldToSpeakButton.tsx
      StatusStrip.tsx
    hooks/
      useVoiceRecorder.ts
      useVoiceTurn.ts
      useAudioPlayback.ts
    lib/
      api.ts
      types.ts
      constants.ts
```

## 25.12 Frontend Behavior

v0.1 behavior:

1. User holds button.
2. UI state changes to `LISTENING`.
3. User releases button.
4. UI state changes to `TRANSCRIBING`.
5. Client sends audio to `/api/v1/voice-turn`.
6. UI shows transcript.
7. UI state changes to `THINKING`.
8. UI shows Jarvis reply.
9. Audio plays.
10. UI state changes to `SPEAKING`.
11. Playback ends.
12. UI returns to `IDLE`.

v0.2 behavior:

1. If emotion is returned, show emotion quietly in `StatusStrip`.
2. Do not make emotion visually loud.
3. Slightly adjust orb glow.
4. Keep main UI minimal.

## 25.13 Design Quality Bar

The UI is accepted only if:

1. It does not look like a dashboard.
2. It does not show raw JSON.
3. It has one clear visual center.
4. The voice orb clearly shows state.
5. Text is short and polished.
6. The layout works on desktop and mobile.
7. The button feels like a premium control.
8. Motion feels subtle.
9. Empty states look intentional.
10. Error states are calm.

This UI must make the MVP feel like a voice product, not an engineering demo.

[1]: https://github.com/mtkresearch/Breeze-ASR-25?utm_source=chatgpt.com "Breeze ASR 25 是一款先進的自動語音辨識（ASR）模型"
