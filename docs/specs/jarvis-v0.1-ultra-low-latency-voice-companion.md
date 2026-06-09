# Jarvis v0.1: Ultra-Low Latency Voice Companion

Status: Canonical product spec record

Recorded date: 2026-06-10

Owner: Jason

Primary audience: 曾國瑋 / VOISS-style voice AI product interview reviewers

## Strategic Framing

如果我是曾國瑋，我看你的履歷、你的研究背景、你做過 ASR、LLM、醫療問診、165 詐騙研究。

其實我不會想看：

> 又一個 ChatGPT 語音聊天機器人。

因為那太多人做了。

我會想看的是：

> Jason 知道 Voice AI Product 應該怎麼被設計、怎麼被拆解、怎麼被快速驗證。

因此這個 MVP Spec 不應該叫做 Voice Chatbot。

它應該叫：

```text
Jarvis v0.1
Ultra-Low Latency Voice Companion
```

## Goal

Jarvis v0.1 要證明一件事：

> 使用者願不願意持續跟 AI 講第二句話。

Voice AI 最大問題不是模型，而是對話持續率（Conversation Retention）。

## Product Vision

Jarvis 是一個隨時在線的 AI Companion。

它不是問答機器人。

它不是搜尋引擎。

它不是 Agent。

它是一個：

> 能陪你一直說下去的聲音。

## MVP Success Metric

如果面試官直接問 KPI 是什麼，不要回答：

- WER
- CER
- Latency
- BLEU
- MOS

真正 KPI 是：

```text
Average Turns Per Session
```

也就是平均每個人願意講幾輪。

## MVP Scope

Jarvis v0.1 只做：

```text
Input: Voice
Output: Voice
Persona: Jarvis
```

Jarvis v0.1 明確不納入下列功能，作為產品驗證的 scope controls：

```text
Memory: 無
Tool Calling: 無
RAG: 無
Search: 無
Agent: 無
Function Calling: 無
```

這些功能全部砍掉，讓 v0.1 專注驗證低延遲語音人格是否能延續對話。

## System Architecture

```text
User
 ↓
Microphone
 ↓
VAD
 ↓
Breeze-ASR-25
 ↓
Transcript
 ↓
Gemma 4 E4B
 ↓
Response
 ↓
BreezyVoice
 ↓
Speaker
```

Breeze-ASR-25 本身是 Whisper-large-v2 微調版本，特別強化台灣口音與中英混用情境辨識。

BreezyVoice 則是專門針對台灣華語優化的 TTS。

## Why Gemma 4 E4B

Gemma 4 E4B 是合適選擇。

原因不是比較聰明，而是：

```text
夠小
夠快
夠便宜
```

Voice Product 第一原則：

```text
Latency > IQ
```

如果回答晚三秒，再聰明都沒用。

Gemma 4 E4B 在小模型裡面有很好的效能與資源平衡。

## Core API

### ASR

```http
POST /asr
```

Input:

```json
{
  "audio": "wav"
}
```

Output:

```json
{
  "text": "我明天要面試"
}
```

### Chat

```http
POST /chat
```

Input:

```json
{
  "text": "我明天要面試"
}
```

Output:

```json
{
  "reply": "你其實準備很久了。"
}
```

### TTS

```http
POST /tts
```

Input:

```json
{
  "text": "你其實準備很久了。"
}
```

Output:

```json
{
  "audio": "xxx.wav"
}
```

## Conversation State

Jarvis v0.1 只保留最近三輪對話。

State format:

```json
[
  {
    "role": "user",
    "content": "..."
  },
  {
    "role": "assistant",
    "content": "..."
  }
]
```

最大狀態長度：

```text
6 messages
```

## Persona Design

Persona design 是面試重點。

### System Prompt

```text
You are Jarvis.

You are calm.
You are intelligent.
You are concise.

Always answer in Traditional Chinese.

Keep replies below 20 Chinese characters.

Never explain.

Never give lists.

Never answer like ChatGPT.

Your purpose is to keep the user talking.

Every response should invite the next sentence.
```

## Conversation Examples

User:

```text
我今天好累
```

Jarvis:

```text
發生什麼事了？
```

User:

```text
明天有面試
```

Jarvis:

```text
你最擔心哪部分？
```

User:

```text
怕回答不好
```

Jarvis:

```text
哪題最沒把握？
```

設計重點：Jarvis 根本沒回答，它只是在延續對話。

## Latency Budget

如果站在 VOISS 的角度，延遲會是最重要的產品指標之一。

```text
VAD: 100ms
ASR: 400ms
LLM: 300ms
TTS: 500ms
Audio Playback: 100ms
```

Total target:

```text
< 1.5 sec
```

P95 target:

```text
P95 < 2 sec
```

## UI

UI 要超簡單。

```text
──────────────────

🎤 Listening...

我今天有點累

🤖 Jarvis

發生什麼事了？

──────────────────
```

只有一個主要控制：

```text
Push To Talk
```

## Roadmap

### v0.2: Emotion Detection

Architecture:

```text
ASR
 ↓
Emotion Model
 ↓
Gemma
 ↓
TTS
```

Output:

```json
{
  "emotion": "anxiety",
  "confidence": 0.91
}
```

### v0.3: Long-Term Memory

Example:

```text
你上次提過明天要面試。
結果如何？
```

### v0.4: Personal Coach

Potential coaching modes:

```text
研究教練
面試教練
情緒教練
投資教練
```

## Interview Positioning

如果我是曾國瑋，明天最容易被打動的不是技術，而是最後講這段：

> Jarvis v0.1 故意不做 Agent、不做 RAG、不做工具呼叫。我想先驗證一件事情：當 AI 擁有自然語音、低延遲回應，以及穩定人格之後，人類願不願意把它當成一個每天都想說話的對象。只要這件事成立，後面的記憶、工具、工作流都只是功能疊加；如果這件事不成立，再強的 Agent 也沒有人會用。

這句話比較像產品經理、Founder、AI Product Lead 的思考方式，而不只是工程師。

## References

The following references are preserved from the supplied spec brief:

1. Breeze-ASR-25: https://github.com/mtkresearch/Breeze-ASR-25
2. BreezyVoice: https://arxiv.org/abs/2501.17790
3. Gemma 4 / Phi-4 / Qwen3 accuracy-efficiency tradeoff: https://arxiv.org/abs/2604.07035
