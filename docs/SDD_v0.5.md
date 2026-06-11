# Jarvis Voice Sight v0.5 SDD

Recorded date: 2026-06-10

## 1. Version Goal

v0.5 目標是把 Jarvis 從 push-to-talk demo 升級成 real-time voice agent
prototype。

核心改進：

1. Always-listening mode
2. VAD State Manager
3. Barge-in interruption
4. Turn cancellation
5. Sentence-level streaming TTS
6. Parallel TTS chunk synthesis
7. LLM runtime abstraction: Ollama / vLLM
8. TTS voice quality improvement path
9. Demo-ready reliability

Version mapping:

```text
v0.2.1 = demo stability
v0.3 = realtime preview
v0.3.1 = realtime hardening
v0.4 = long-form TTS architecture
v0.5 = realtime voice agent prototype with provider switching and demo reliability
```

## 2. Target Architecture

```text
Web UI
  ↓
Realtime Voice Client
  ↓
VAD State Manager
  ↓
Jarvis Orchestrator
  ↓
ASR Provider
  ↓
LLM Provider
  ↓
Response Finalizer
  ↓
TTS Scheduler
  ↓
TTS Provider
  ↓
Audio Stitcher
  ↓
Audio Player
```

## 3. Runtime Providers

所有模型 runtime 必須抽象化。

```typescript
interface AsrProvider {
  transcribe(audio: AudioBuffer, turnId: string): Promise<Transcript>;
}

interface LlmProvider {
  generate(messages: Message[], turnId: string): Promise<Reply>;
  stream(messages: Message[], turnId: string): AsyncIterable<string>;
}

interface TtsProvider {
  synthesize(text: string, turnId: string): Promise<AudioBuffer>;
}
```

`.env`:

```env
ASR_PROVIDER=breeze_asr
LLM_PROVIDER=ollama
TTS_PROVIDER=breezyvoice

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b

VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODEL=google/gemma-4-E2B-it
```

Ollama / vLLM 只管理 LLM。ASR 與 TTS 維持獨立 service。

## 4. VAD State Manager

新增狀態：

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

預設門檻：

```typescript
START_SPEECH_PROB = 0.6;
END_SPEECH_PROB = 0.3;
MIN_SPEECH_MS = 200;
END_SILENCE_MS = 700;
BARGE_IN_MS = 300;
```

行為：

```text
listening → user_speaking
user_speaking → asr_processing
speaking → interrupted → listening
```

## 5. Always-listening Mode

v0.5 不再要求使用者手動按停止錄音。

流程：

```text
Mic always open
↓
VAD detects speech start
↓
Buffer audio
↓
VAD detects speech end
↓
Send utterance to ASR
```

UI 顯示：

```text
Listening
Understanding
Thinking
Speaking
Interrupted
```

## 6. Barge-in

當 Jarvis 正在說話，使用者插話超過 300ms：

```typescript
audioPlayer.stop();
ttsQueue.clear();
cancelActiveTurn();
state = "listening";
```

Acceptance:

```text
AI must stop speaking within 500ms.
No stale audio can continue playing.
```

## 7. Turn Isolation

每次 voice turn 都要有 `turn_id`。

```typescript
type TurnId = string;
```

所有資料都綁定 turn：

```text
ASR result
LLM output
TTS text
TTS audio
Playback event
Latency log
```

如果新 turn 開始，舊 turn 全部失效。

```typescript
if (audio.turnId !== activeTurnId) {
  discardAudio();
}
```

## 8. Jarvis Persona v0.5

Jarvis 是低存在感、自然接話、偶爾提點的台灣華語語音同伴。

Rules:

```text
Always reply in Traditional Chinese.
Use natural spoken Taiwanese Mandarin.
Reply in 6-18 Chinese characters by default.
Do not always ask questions.
Prefer acknowledgement, reflection, or light guidance.
Ask only when clarification is useful.
Avoid formal customer-service wording.
Never use bullet points.
Never explain system behavior.
Never mention being an AI model.
```

回覆比例：

```text
40% 承接
30% 輕建議
20% 問問題
10% 簡短整理
```

範例：

```text
我懂，先別急。
這裡先求穩。
可以，這樣順。
先抓最小版本。
這段可以收斂。
```

## 9. Response Finalizer

LLM output 不可直接進 TTS。

Finalizer 必須處理：

```text
remove markdown
remove JSON
remove role tags
remove URLs
remove emojis
normalize punctuation
trim excessive length
```

輸出只能是可朗讀文字。

## 10. Sentence-level Streaming

v0.5 採用 sentence-level streaming，不做 token-level TTS。

流程：

```text
LLM streaming tokens
↓
Buffer text
↓
Detect complete sentence
↓
Clean sentence
↓
Send to TTS queue
```

句子切分規則：

```text
。！？!?
```

最大 chunk：

```text
3-5 秒語音長度
約 8-24 中文字
```

## 11. Parallel TTS Chunk Synthesis

如果回覆較長，例如 30 秒文字：

```text
切成 6 段
每段 3-5 秒
平行送入 TTS
產生 wav
normalize loudness
add silence padding
stitch audio
play final audio
```

流程：

```text
Text
↓
Sentence Chunker
↓
Parallel TTS Workers
↓
WAV Normalize
↓
Silence Padding
↓
Audio Stitcher
↓
Playback
```

限制：

```typescript
MAX_PARALLEL_TTS_WORKERS = 3;
CHUNK_TARGET_SECONDS = 4;
SILENCE_PADDING_MS = 120;
```

短回覆直接單段 TTS。長回覆才啟用 parallel synthesis。

## 12. TTS Cache

建立固定短句 cache。

Cache key:

```text
normalized_reply_text
```

Cache hit:

```text
skip BreezyVoice
play cached wav
```

目標：

```text
cached reply < 500ms
```

## 13. TTS Voice Quality Path

目前 zero-shot voice cloning 已要求 speaker prompt transcript。

v0.5 延伸：

```text
speaker prompt audio
speaker prompt transcript
voice profile config
accent evaluation
```

後續 fine-tune 方向：

```text
3-5 小時單口 podcast
5-10 秒 chunk
高品質逐字稿
speaker encoder adaptation
prosody consistency check
Taiwan Mandarin accent evaluation
```

## 14. Latency Metrics

每個 turn 必須輸出：

```json
{
  "turn_id": "turn_001",
  "latency": {
    "vad_ms": 0,
    "asr_ms": 420,
    "llm_first_token_ms": 320,
    "llm_total_ms": 850,
    "tts_first_audio_ms": 900,
    "tts_total_ms": 3200,
    "playback_start_ms": 1200,
    "total_ms": 4100,
    "tts_cache_hit": false,
    "tts_parallel_chunks": 3
  }
}
```

## 15. Demo Script

v0.5 demo 主題：

```text
保險業務員拜訪客戶前的對話練習
```

Demo 必須展示：

```text
自然短回覆
不中斷的連續對話
使用者插話
AI 立即停止
重新聆聽
較長回答切句播放
latency dashboard
```

## 16. Commands

```bash
npm run demo:real
npm run real:health
npm run real:preflight
npm run test
npm run lint
npm run typecheck
```

`npm run demo:real` 必須啟動：

```text
Web UI
Orchestrator
ASR service
LLM wrapper
Ollama or vLLM
TTS wrapper
BreezyVoice upstream
```

最後顯示：

```text
Ready for Demo
```

## 17. Acceptance Criteria

v0.5 視為完成，必須通過：

```text
User can speak without pressing stop.
Jarvis can detect speech start and end.
Jarvis stops speaking within 500ms after barge-in.
No stale TTS audio is played.
Every turn has turn_id.
Every turn has latency metrics.
Short replies use TTS cache when available.
Long replies can be chunked and synthesized in parallel.
Ollama and vLLM can be switched through config.
Persona does not always ask questions.
All tests pass.
```

Performance target:

```text
Cached reply < 500ms
Barge-in stop < 500ms
First audio for short reply < 2s
Average real turn < 4s
No duplicate playback across 50 turns
```
