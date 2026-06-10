# Jarvis Voice Sight Product Specification

Version: v0.1 to v0.2

Status: Canonical product specification

Repository: `jarvis-voice-sight`

Owner: Jason Lin, NYCU

Primary audience: VOISS AI interview reviewers, voice AI product leads, engineering reviewers

Last updated: 2026-06-10

## 1. Executive Summary

Jarvis Voice Sight is a real-time voice AI coach and companion prototype.

The product validates one core voice-AI question:

```text
Will a user continue speaking with an AI voice companion after the first turn?
```

The system implements a low-latency voice loop:

```text
User speech -> VAD -> Breeze-ASR-25 -> Gemma 4 E4B int4 -> response policy -> BreezyVoice -> audio playback
```

The v0.2 demo is positioned for insurance and financial-services coaching. It helps a salesperson prepare for a customer conversation by giving short, natural Traditional Chinese responses. Jarvis does not act as a full autonomous agent. It focuses on conversational continuity, trust, latency, and product feel.

## 2. Product Thesis

Voice AI products succeed or fail on interaction continuity before they succeed on intelligence breadth.

The first product proof is not:

```text
Can the model answer anything?
```

The first product proof is:

```text
Does the user want to say the next sentence?
```

Jarvis v0.1 and v0.2 intentionally avoid agentic scope expansion so the product can validate the voice loop, persona, latency, and multi-turn interaction rhythm before adding memory, tools, RAG, or workflow automation.

## 3. Problem Statement

Most voice chatbot demos optimize for capability breadth but feel weak in real use because:

1. Response latency breaks conversational rhythm.
2. Replies are too long for spoken interaction.
3. The assistant sounds like a generic chatbot.
4. The system asks questions mechanically.
5. TTS cold start and model startup create unstable demo behavior.
6. Product success is measured with model metrics instead of conversation metrics.

Jarvis addresses this by optimizing for short voice turns, stable persona, bounded context, failure recovery, and low-latency TTS behavior.

## 4. Goals

### 4.1 Product Goals

1. Prove a complete ASR -> LLM -> TTS voice loop.
2. Make the user comfortable speaking multiple turns.
3. Maintain a calm, concise, low-presence Jarvis persona.
4. Support a realistic insurance / financial-services coaching scenario.
5. Preserve a premium, voice-first UI suitable for an interview demo.
6. Keep the architecture ready for v0.3 realtime voice interaction, v0.4 long-form TTS, v0.5 memory, and v0.6 tools without implementing them prematurely.

### 4.2 Engineering Goals

1. Keep the orchestrator as the owner of the workflow.
2. Keep ASR, LLM, TTS, and emotion detection replaceable through adapters.
3. Run AI model inference on RTX GPU.
4. Add timeout handling for each model call.
5. Add safe fallback behavior for each failure path.
6. Log latency by stage.
7. Support mock mode and real-model mode.
8. Make the demo reproducible through scripts and documentation.

## 5. Non-Goals

The following are explicitly out of scope for v0.1 and v0.2:

1. RAG.
2. Tool calling.
3. Web search.
4. Long-term memory.
5. Login and multi-user accounts.
6. Database-backed user profiles.
7. Autonomous agent behavior.
8. Calendar, email, CRM, or external workflow actions.
9. Production insurance advice.
10. Production financial advice.
11. Medical, legal, underwriting, or investment authority claims.

These scope controls keep the MVP focused on voice product validation.

## 6. Target Users

### 6.1 Primary Demo User

An insurance or financial-services salesperson preparing before a customer visit.

Typical needs:

1. Practice an opening.
2. Reduce pushy sales language.
3. Reframe product selling into trust-building conversation.
4. Clarify customer concern.
5. Prepare for objection handling.

### 6.2 Reviewer User

A voice AI product or engineering reviewer assessing whether Jason can design, decompose, implement, and validate a real-time voice AI product.

Reviewer needs:

1. Clear product thesis.
2. Explicit tradeoffs.
3. Low-latency voice loop.
4. Replaceable AI model architecture.
5. Demo-ready UI.
6. Evidence that scope was intentionally controlled.

## 7. Core User Journey

### 7.1 Insurance Coach Demo Flow

1. User opens Jarvis Voice Sight.
2. UI shows a premium voice orb and a hold-to-speak button.
3. User holds the button and speaks.
4. Client records audio or sends mock text in fallback mode.
5. Orchestrator runs one voice turn.
6. ASR produces transcript.
7. Emotion classifier optionally classifies the turn.
8. LLM generates a short Jarvis reply.
9. Response policy and repair logic enforce product style and safety.
10. TTS returns audio from cache or BreezyVoice synthesis.
11. Client plays the audio after natural pacing delay if configured.
12. Conversation context updates with the latest turn.

### 7.2 Example 10-Turn Scenario

```text
User: 我等一下要拜訪一個新客戶。
Jarvis: 先抓住目標。

User: 他對保險有點排斥。
Jarvis: 先不要急著推。

User: 對，我怕一開口他就防備。
Jarvis: 先聊他的生活。

User: 他是三十多歲，有小孩。
Jarvis: 家庭責任是切入點。

User: 但我不想講得像推銷。
Jarvis: 用關心的語氣。

User: 我可以先問他最近家庭支出壓力嗎？
Jarvis: 可以，這很自然。

User: 如果他說現在不想買呢？
Jarvis: 先尊重他的節奏。

User: 那我就先幫他整理風險缺口。
Jarvis: 這比推產品好。

User: 我想讓他覺得我是顧問，不是業務。
Jarvis: 這就是信任感。

User: 好，我知道怎麼開場了。
Jarvis: 可以，先穩穩聊。
```

## 8. Product Requirements

### 8.1 Input

Required:

1. Push-to-talk voice input.
2. Mock input fallback for demo resilience.
3. WAV, MP3, WebM, or mock payload support at API boundary.
4. Audio validation and silence fallback.

### 8.2 Output

Required:

1. Traditional Chinese text reply.
2. Spoken audio reply when TTS succeeds.
3. Text-only reply when TTS fails.
4. Latency report for each turn.
5. Optional emotion label in v0.2.

### 8.3 Persona

Jarvis is:

```text
low-presence
calm
smart
brief
natural
trust-oriented
Taiwan Mandarin
```

Jarvis can:

1. Acknowledge the user.
2. Reflect the key point.
3. Give one light suggestion.
4. Summarize one concise point.
5. Ask a short question when useful.

Jarvis should not:

1. Ask a question every turn.
2. Sound like customer service.
3. Sound like a teacher lecture.
4. Give long explanations.
5. Use bullet points.
6. Use formal official-document tone.
7. Promise financial returns.
8. Recommend specific insurance or investment products.

### 8.4 Response Length

Target:

```text
6 to 18 Chinese characters
```

Reason:

Shorter replies improve voice rhythm, reduce TTS latency, and make multi-turn conversation feel natural.

### 8.5 Conversation Memory

Default v0.2 demo setting:

```text
MAX_RECENT_MESSAGES=10
```

This stores the latest 5 user-assistant turns.

Decision:

1. 5-turn memory is the safe demo default.
2. 10-turn memory is feasible but requires stronger late-turn repair and fallback prevention.
3. Long-term memory is not included before consent and memory policy design.

## 9. Success Metrics

### 9.1 Primary Product Metric

```text
Average Turns Per Session
```

This measures whether users continue speaking.

### 9.2 Secondary Product Metrics

1. Session Completion Rate.
2. User Re-engagement Rate.
3. Manual Stop Rate.
4. Conversation Recovery Rate after fallback.
5. Average real voice-turn latency.
6. P95 real voice-turn latency.
7. Perceived playback latency.

### 9.3 Engineering Metrics

1. ASR latency.
2. LLM latency.
3. Emotion latency.
4. Policy latency.
5. TTS latency.
6. Audio encoding latency.
7. Playback delay.
8. Total pipeline latency.
9. TTS cache hit rate.
10. ASR empty transcript rate.
11. TTS failure rate.
12. Policy fallback rate.

## 10. Latency Targets

### 10.1 Original v0.1 Target

```text
P50 total latency < 1.5s
P95 total latency < 2.5s
```

### 10.2 Current v0.2 Target

```text
Real turn target: 2.5s to 4.0s
Cached reply target: < 500ms pipeline time
Perceived playback target: 1.0s to 2.0s
```

### 10.3 Current Optimization Findings

Observed issue:

```text
real voice-turn: 7.45s
TTS stage: 6.8s
```

Conclusion:

```text
The bottleneck was BreezyVoice TTS latency, not the LLM.
```

Implemented mitigations:

1. Shorter Jarvis replies.
2. BreezyVoice startup warmup.
3. Fixed canonical reply audio cache.
4. Finance / insurance response canonicalization.
5. Latency breakdown logging.
6. Randomized playback pacing between 1s and 2s.

## 11. Model and Runtime Choices

### 11.1 ASR

```text
Model: Breeze-ASR-25
Runtime: faster-whisper / CTranslate2
Device: CUDA
Policy: RTX GPU only
```

Rationale:

1. Strong Taiwan Mandarin and mixed Chinese-English ASR fit.
2. Whisper-compatible architecture.
3. faster-whisper provides lower-latency local inference.

### 11.2 LLM

```text
Model: Gemma 4 E4B int4
Runtime: fast local / near-local inference path
Device: RTX GPU
```

Rationale:

1. Smaller model improves voice latency.
2. int4 quantization reduces memory pressure.
3. The product needs short coaching replies more than broad reasoning.

### 11.3 TTS

```text
Model: BreezyVoice
Use case: Taiwan Mandarin TTS and voice cloning path
Device: RTX GPU
```

Rationale:

1. Better Taiwan Mandarin fit than generic TTS.
2. Supports demo-specific voice style.
3. TTS cache and warmup mitigate latency for repeated short replies.

### 11.4 GPU

Current demo UI identifies the GPU class as:

```text
RTX 4090 Laptop GPU
```

Product requirement:

```text
All AI model inference must use RTX GPU. CPU inference is not accepted for AI models.
```

## 12. UX Requirements

### 12.1 UI Quality Bar

The UI should feel:

```text
quiet
focused
safe
high-end
responsive
alive
```

It should look closer to Apple / OpenAI-quality product prototypes than a developer dashboard.

### 12.2 Main Screen Requirements

Required elements:

1. Product title: `Jarvis Voice Sight`.
2. Short subtitle.
3. Central animated voice orb.
4. State copy.
5. Jarvis reply card.
6. Transcript card.
7. Hold-to-speak button.
8. Status strip.
9. Bottom system stack rail.

Bottom rail content:

```text
Jason Lin · NYCU · v0.2 · Insurance voice coach
ASR Breeze-ASR-25 · LLM Gemma 4 E4B int4 · TTS BreezyVoice · GPU RTX 4090 Laptop GPU
```

### 12.3 UI Non-Requirements

The UI must not show:

1. Raw JSON.
2. Developer logs.
3. Large dashboards.
4. Tables.
5. Loud colors.
6. Emoji-heavy status messages.

## 13. Safety and Compliance Scope

Jarvis is a coaching assistant, not a licensed advisor.

Product-level safety rules:

1. Do not claim financial, medical, legal, insurance underwriting, or investment authority.
2. Do not promise returns.
3. Do not recommend specific insurance or investment products.
4. Do not pressure the customer.
5. Do not pretend to perform external actions.
6. Do not claim long-term memory.
7. Keep replies short and non-authoritative.

Safe style examples:

```text
避免承諾報酬。
先尊重他的節奏。
這裡先建立信任。
先不要急著推。
```

## 14. Failure and Fallback Requirements

Required fallbacks:

```text
No speech: 我剛剛沒聽到。
ASR empty: 我剛剛沒聽清楚。
LLM timeout: 先停一下，我在。
Policy rejected: 你可以再說一點。
TTS failed: return text-only response.
```

Failure paths must preserve the session and avoid crashing the demo.

## 15. Acceptance Criteria

### 15.1 v0.1 Acceptance

1. User can press the button and speak.
2. System returns transcript.
3. System generates a Jarvis-style reply.
4. System speaks the reply through TTS.
5. Reply is Traditional Chinese.
6. Reply is short enough for spoken interaction.
7. System preserves recent context.
8. System handles empty speech.
9. System handles TTS failure without crashing.
10. System reports latency by stage.

### 15.2 v0.2 Acceptance

1. Emotion service returns a supported label.
2. Emotion can affect response strategy.
3. Emotion failure does not block the voice loop.
4. v0.1 behavior works when emotion is disabled.
5. Conversation context remains bounded.
6. TTS cache supports fixed short replies.
7. Persona can be tuned without rewriting the system.
8. UI works on desktop and mobile.
9. Real-model health endpoint reports ASR, LLM, TTS, and emotion provider readiness.
10. Demo can fall back to mock mode if a model service is unavailable.

## 16. Demo Positioning

### 16.1 30-Second Demo Opening

```text
大家好，我是 Jason Lin，NYCU。

Jarvis Voice Sight v0.2 是一個低延遲語音 AI Coach。這版我先不做完整 Agent，而是專注驗證 voice product 最核心的問題：人會不會願意跟 AI 繼續講第二句、第三句。

技術上，我用 Breeze-ASR-25 做語音辨識，Gemma 4 E4B int4 做短回應生成，BreezyVoice 做台灣華語 TTS，並且全部使用 RTX GPU 推論。

今天 demo 的場景是保險業務員拜訪客戶前，用 Jarvis 做即時對話教練。
```

### 16.2 External Handoff

YouTube demo link:

```text
https://youtu.be/H-XPmbZIQTg
```

Suggested LINE message:

```text
曾總您好，我是 Jason Lin。這是我為 VOISS AI 面試準備的 Jarvis Voice Sight demo video：

https://youtu.be/H-XPmbZIQTg

這個 demo 主要展示低延遲語音 AI Coach 的完整 voice loop，情境是保險業務員拜訪客戶前的對話練習。謝謝您撥空觀看。
```

## 17. Roadmap

### v0.1

1. Minimal voice loop.
2. Push-to-talk UI.
3. Mock services.
4. Bounded recent context.
5. Latency report.

### v0.2

1. Emotion-aware response policy.
2. Real-model adapters.
3. Insurance coach persona.
4. TTS warmup and cache.
5. Premium voice-first UI.
6. Demo video and external handoff.

### v0.2.1

VOISS feedback phase:

```text
先穩，再 realtime。
```

1. Stabilize the current demo without major architecture changes.
2. Ensure persona uses natural Taiwanese Mandarin and does not always ask questions.
3. Prefer short acknowledgement, reflection, and light guidance.
4. Cache at least 20 common short TTS replies.
5. Keep cached TTS response under `500ms`.
6. Include `turn_id` across ASR, LLM, TTS, playback, logs, and stale audio rejection.
7. Add a TTS text finalizer for pure spoken Traditional Chinese.
8. Add `npm run demo:real` for one-command demo boot.

### v0.3 Realtime Voice Agent

VOISS feedback target:

```text
不用按麥克風暫停，可以持續聽、可打斷。
```

1. VAD State Manager.
2. Always-listening mode.
3. Barge-in support.
4. Turn cancellation.
5. Cancellable TTS queue.
6. Sentence-level LLM-to-TTS streaming.
7. Runtime state UI.
8. Push-to-talk fallback remains available.

### v0.3.1 Realtime Interaction Hardening

VOISS post-demo feedback clarifies that realtime voice should stay open and
allow interruption:

```text
可以一直監聽然後隨時打斷，不用按麥克風暫停。
```

v0.3.1 should promote the v0.3 preview into a reliable realtime runtime:

1. Always-listening mode as a stable runtime path.
2. Hardened VAD state manager.
3. Barge-in stop within `500ms`.
4. Active turn cancellation.
5. Turn-scoped stale audio discard.
6. Cancellable TTS queue.
7. 50-turn realtime smoke coverage.

### v0.4 Long-Form TTS

VOISS also raised the core TTS product issue:

```text
句子夠長的話，就要等很久。
```

v0.4 should stop relying only on artificially short replies. It should make
longer speech practical by splitting text into cancellable sentence chunks:

1. Sentence splitter for Traditional Chinese and mixed Chinese-English text.
2. TTS chunk planner targeting `3-5s` spoken chunks.
3. Bounded parallel BreezyVoice synthesis.
4. Ordered streaming audio chunks.
5. Loudness normalization and silence padding.
6. Chunk-level TTS cache.
7. Time-to-first-audio latency metric.
8. Taiwan Mandarin voice-quality dataset plan.

### v0.5 Memory

1. Opt-in long-term memory.
2. Memory policy.
3. Session summaries.
4. User consent and deletion behavior.

### v0.6 Tools

1. Tool registry.
2. Permission policy.
3. Explicit user approval before external actions.

### v0.7 Vision

1. Vision input.
2. Multimodal context builder.
3. Voice + image coaching workflows.

## 18. Open Questions

1. Which exact VOISS deployment surface should Jarvis target first: web demo, desktop companion, mobile, or kiosk?
2. Should BreezyVoice voice cloning be permitted only with explicit speaker consent and a recorded prompt transcript?
3. What minimum acceptance threshold should be used for Average Turns Per Session?
4. Should v0.3 always-listening be default-on or demo-toggle-only?
5. What barge-in stop threshold should be used after field testing: `300ms`, `500ms`, or adaptive?
6. What bounded parallelism should v0.4 BreezyVoice use on RTX 4090 Laptop GPU: `2` or `3` chunks?
7. Which customer vertical after insurance should be tested next?

## 19. Product Decision Summary

Jarvis v0.2 is intentionally scoped:

```text
Voice loop first.
Product feel second.
Agent features later.
```

This lets the project show voice AI product judgment rather than only model integration ability. The current demo is designed to prove that a low-latency, stable-persona AI voice coach can sustain a practical conversation before the system expands into memory, tools, search, or workflows.
