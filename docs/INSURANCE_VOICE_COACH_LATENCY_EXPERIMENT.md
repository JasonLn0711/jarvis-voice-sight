# Insurance Voice Coach Latency Experiment

Status: Real-model experiment record  
Date: 2026-06-10  
Scope: Insurance / financial-service Jarvis persona latency after prompt and policy update

## Purpose

This experiment records the latency impact after changing Jarvis from a generic
voice companion into an insurance and financial-service Voice Coach.

The tested persona goal is:

```text
Jarvis is a low-presence Taiwanese Mandarin Voice Coach for insurance and
financial service conversations.
```

The test focuses on:

1. First-turn cold-start behavior.
2. Subsequent warm-turn latency.
3. Whether stage-level latency still points to LLM or TTS.
4. Whether the new fixed financial-coaching replies can use TTS cache.

## Runtime

The real-model services were running with:

```text
ASR_PROVIDER=breeze_asr_25
LLM_PROVIDER=gemma_4_e4b
TTS_PROVIDER=breezyvoice
ENABLE_EMOTION=true
EMOTION_PROVIDER=mock
REPLY_MAX_CHARS=18
MAX_RECENT_MESSAGES=10
```

Health check:

```json
{
  "status": "ok",
  "services": {
    "orchestrator": "ready",
    "asr": "ready",
    "llm": "ready",
    "tts": "ready",
    "emotion": "ready"
  },
  "providers": {
    "asr": "breeze_asr_25",
    "llm": "gemma_4_e4b",
    "tts": "breezyvoice",
    "emotion": "mock"
  }
}
```

TTS wrapper health:

```json
{
  "status": "ok",
  "runtime": "openai_compatible",
  "model": "breezyvoice",
  "warmupText": "好，我在。",
  "warmupCacheExists": true
}
```

## Method

The test used `POST /api/v1/voice-turn` with deterministic mock text input:

```json
{
  "audio_format": "mock",
  "audio_base64": "text:<utterance>"
}
```

This isolates ASR variability while preserving the real orchestrator, real LLM
adapter, BreezyVoice TTS wrapper, response policy, emotion step, and latency
reporting.

Measured fields:

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
tts_cache_hit
```

`total_ms` records the real model / orchestration path. `perceived_total_ms`
adds the optional demo playback delay used to make cached replies feel more
natural instead of instant.

## Observed Cold Start

Immediately after restarting the real orchestrator and TTS wrapper, the first
insurance-persona turn showed a cold-start spike:

| Turn | Transcript | Reply | Emotion | ASR | Emotion | LLM | TTS | Total | Cache |
|---:|---|---|---|---:|---:|---:|---:|---:|---|
| 1 | 客戶對保險很排斥 | 可以慢慢來聊。 | neutral | 120ms | 20ms | 3396ms | 1770ms | 5306ms | false |

Interpretation:

```text
The cold-start spike was primarily LLM-side.
```

The LLM stage was `3396ms`, while TTS was `1770ms`. This is different from the
earlier 7.45s baseline, where TTS dominated almost the entire turn.

## Warm Turns After Cold Start

The next three turns in the same runtime returned to the expected steady range:

| Turn | Transcript | Reply | Emotion | ASR | Emotion | LLM | TTS | Total | Cache |
|---:|---|---|---|---:|---:|---:|---:|---:|---|
| 2 | 我怕講得像推銷 | 放輕鬆，自然就好。 | anxious | 120ms | 20ms | 350ms | 1390ms | 1880ms | false |
| 3 | 他一直問報酬可不可以保證 | 報酬要看風險喔。 | neutral | 120ms | 20ms | 328ms | 1639ms | 2107ms | false |
| 4 | 客戶抱怨服務不好 | 理解，先聽聽狀況。 | neutral | 120ms | 20ms | 352ms | 1652ms | 2144ms | false |

Warm-turn average:

| Metric | Average |
|---|---:|
| Total | 2077ms |
| LLM | 343ms |
| TTS | 1560ms |

Cold-start delta:

| Metric | Cold Turn | Warm Avg | Delta |
|---|---:|---:|---:|
| Total | 5306ms | 2077ms | +3229ms |
| LLM | 3396ms | 343ms | +3053ms |
| TTS | 1770ms | 1560ms | +210ms |

Conclusion:

```text
The first observed cold start was mostly Gemma / LLM warmup, not BreezyVoice.
After warmup, the path returned to roughly 1.9-2.1s for this short scenario.
```

## Warm-Runtime 8-Turn Follow-Up

A second warm-runtime test used a longer insurance-sales coaching flow.

| Turn | Transcript | Reply | Emotion | LLM | TTS | Total | Cache |
|---:|---|---|---|---:|---:|---:|---|
| 1 | 客戶對保險很排斥 | 可以先聊聊需求。 | neutral | 362ms | 1611ms | 2113ms | false |
| 2 | 我怕講得像推銷 | 慢慢來，專注需求就好。 | anxious | 357ms | 2111ms | 2608ms | false |
| 3 | 他一直問報酬可不可以保證 | 報酬要看風險喔。 | neutral | 406ms | 5282ms | 5828ms | false |
| 4 | 客戶抱怨服務不好 | 可以先聽聽他怎麼說。 | neutral | 385ms | 1311ms | 1836ms | false |
| 5 | 我想先聊他的家庭責任 | 好的，先了解家庭狀況。 | neutral | 338ms | 2204ms | 2682ms | false |
| 6 | 他說現在不想買 | 理解他現在的顧慮。 | neutral | 379ms | 1307ms | 1826ms | false |
| 7 | 我想幫他整理風險缺口 | 好的，先釐清他的擔憂。 | neutral | 348ms | 2305ms | 2793ms | false |
| 8 | 我怕語氣太急 | 慢慢來，放輕鬆就好。 | anxious | 435ms | 3021ms | 3596ms | false |

Summary:

| Metric | Average | P50 | P95 |
|---|---:|---:|---:|
| Total | 2910ms | 2645ms | 5828ms |
| LLM | 376ms | 371ms | 435ms |
| TTS | 2394ms | 2156ms | 5282ms |

Without the turn-3 TTS outlier:

| Metric | Average |
|---|---:|
| Total | 2493ms |
| TTS | 1981ms |

Interpretation:

```text
LLM latency stayed stable.
The remaining tail risk is BreezyVoice TTS variance.
```

The outlier turn had:

```text
tts_ms: 5282
total_ms: 5828
```

The generated reply was:

```text
報酬要看風險喔。
```

This reply did not match a fixed cache phrase, so it required upstream TTS.

## Fixed Reply Cache Check

The new financial-coaching fixed replies were tested directly through the TTS
wrapper.

| Text | Call | Cache Hit | Upstream TTS | Duration |
|---|---:|---|---:|---:|
| 先建立信任感。 | 1 | false | 1329ms | 1329ms |
| 先建立信任感。 | 2 | true | 0ms | 0ms |
| 避免承諾報酬。 | 1 | false | 3118ms | 3118ms |
| 避免承諾報酬。 | 2 | true | 0ms | 0ms |

Conclusion:

```text
The fixed financial-coaching TTS cache works.
However, the live LLM often generates semantically similar but non-canonical
phrases, so cache hit rate remains low unless the response policy canonicalizes
more finance/insurance replies.
```

## Key Findings

1. The first cold-start turn after service restart was `5306ms`.
2. The cold-start spike was mostly LLM warmup: `llm_ms=3396`.
3. Warm turns returned to roughly `1880-2144ms` in the initial smoke test.
4. In the 8-turn follow-up, LLM stayed stable around `338-435ms`.
5. TTS remained the largest source of variance, ranging from `1307ms` to
   `5282ms`.
6. The TTS cache works for exact fixed replies, but the generated replies did
   not hit cache in the 8-turn flow.

## Engineering Interpretation

The current architecture is behaving correctly:

```text
ASR and emotion are stable.
LLM is fast after warmup.
Policy adds negligible latency.
TTS dominates the long tail.
```

The product behavior also moved in the intended direction:

```text
Jarvis avoids hard-selling.
Jarvis gives short coaching guidance.
Jarvis does not recommend a specific product.
Jarvis does not promise returns.
```

## Implemented Follow-Up: Finance / Insurance Response Canonicalizer

The next optimization was implemented as a finance/insurance response
canonicalizer after LLM and before policy / TTS.

Purpose:

```text
Map safe semantic replies into cached canonical short replies.
```

Pipeline position:

```text
ASR
→ Emotion
→ LLM
→ ResponseCanonicalizer
→ ResponsePolicy
→ TTS
```

Examples:

| LLM Reply | Canonical Reply |
|---|---|
| 可以慢慢來聊。 | 先聽他的顧慮。 |
| 可以先聊聊需求。 | 先聽他的顧慮。 |
| 報酬要看風險喔。 | 避免承諾報酬。 |
| 理解，先聽聽狀況。 | 先接住情緒。 |
| 慢慢來，放輕鬆就好。 | 語氣再放慢。 |

Expected effect:

```text
Higher TTS cache hit rate.
Lower P95 total latency.
More consistent Jarvis persona.
```

Acceptance target for the next pass:

```text
insurance/finance 8-turn flow:
P50 total < 2.2s
P95 total < 3.5s
cache hit rate >= 50%
no product recommendation
no return promise
```

## Canonicalizer Smoke Test

After implementation, the real orchestrator was restarted and tested against
four insurance / finance utterances.

First pass:

| Transcript | Final Reply | Cache Hit | LLM | TTS | Total |
|---|---|---|---:|---:|---:|
| 他一直問報酬可不可以保證 | 避免承諾報酬。 | true | 371ms | 0ms | 511ms |
| 我怕講得像推銷 | 先尊重他的節奏。 | true | 406ms | 0ms | 546ms |
| 客戶抱怨服務不好 | 先接住情緒。 | false | 388ms | 1637ms | 2165ms |
| 客戶對保險很排斥 | 先聽他的顧慮。 | false | 356ms | 1174ms | 1670ms |

The last two replies were canonicalized but had not been synthesized in the
current cache directory yet, so their first calls created cache entries.

Repeat pass:

| Transcript | Final Reply | Cache Hit | LLM | TTS | Total |
|---|---|---|---:|---:|---:|
| 客戶抱怨服務不好 | 先接住情緒。 | true | 356ms | 0ms | 496ms |
| 客戶對保險很排斥 | 先聽他的顧慮。 | true | 342ms | 0ms | 482ms |

Result:

```text
canonicalizer + fixed reply cache can reduce repeated finance/insurance turns
to roughly 0.48-0.55s total latency after the canonical audio exists.
```

## Implemented Follow-Up: Multi-Reply TTS Warmup

The TTS wrapper now pre-synthesizes the default finance / insurance canonical
reply set on startup, not only `好，我在。`.

Default warmup set:

```text
好，我在。
先建立信任感。
先聽他的顧慮。
用關心開場。
先釐清他的目標。
不要先談商品。
避免承諾報酬。
這裡要保守講。
先尊重他的節奏。
先接住情緒。
語氣再放慢。
先抓住目標。
先不要急著推。
先聊他的生活。
家庭責任是切入點。
用關心的語氣。
可以，這很自然。
這比推產品好。
這就是信任感。
可以，先穩穩聊。
```

Config:

```text
BREEZYVOICE_WARMUP_ENABLED=true
BREEZYVOICE_WARMUP_TEXT=好，我在。
BREEZYVOICE_WARMUP_TEXTS=
BREEZYVOICE_WARMUP_TIMEOUT_S=60
```

If `BREEZYVOICE_WARMUP_TEXTS` is empty, the default list above is used.
If it is set, it can use newline, pipe, or comma separators.

Health now reports:

```text
warmupTexts
warmupCacheExists
warmupCacheReady
warmupCacheTotal
```

Real startup verification:

```text
warmupCacheReady: 11
warmupCacheTotal: 11
```

First-turn smoke test after multi-reply warmup:

| Transcript | Final Reply | Cache Hit | LLM | TTS | Total |
|---|---|---|---:|---:|---:|
| 他一直問報酬可不可以保證 | 避免承諾報酬。 | true | 386ms | 0ms | 526ms |
| 我怕講得像推銷 | 先尊重他的節奏。 | true | 377ms | 0ms | 517ms |
| 客戶抱怨服務不好 | 先接住情緒。 | true | 372ms | 0ms | 512ms |
| 客戶對保險很排斥 | 先聽他的顧慮。 | true | 358ms | 0ms | 498ms |

Result:

```text
The full default finance / insurance warmup set now makes the first demo turn
hit cache for canonical replies. In the tested cases, total latency stayed
around 0.50-0.53s.
```

## Demo Playback Pacing

Because cached canonical replies can return in roughly `0.5s`, the orchestrator
supports an optional random perceived playback target for demo realism:

```text
ENABLE_PLAYBACK_DELAY=true
PLAYBACK_DELAY_MIN_MS=1000
PLAYBACK_DELAY_MAX_MS=2000
```

The orchestrator samples a target between `PLAYBACK_DELAY_MIN_MS` and
`PLAYBACK_DELAY_MAX_MS`, then only waits long enough to make the perceived
response time reach that target. If the real pipeline already exceeds the
target, no extra delay is added.

This pacing is applied after TTS and before the response returns to the
frontend. It does not change model-stage latency. The response reports both:

```text
total_ms: real pipeline latency
playback_delay_ms: artificial top-up delay
perceived_total_ms: total_ms + playback_delay_ms
```
