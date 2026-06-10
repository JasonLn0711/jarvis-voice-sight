# Jarvis Context Memory Latency Experiment

Status: Real-model experiment record  
Date: 2026-06-10  
Scope: Compare 5-turn and 10-turn bounded conversation memory

## Purpose

This experiment checks whether Jarvis can support around ten turns of
conversation without breaking the low-latency voice loop.

The tested memory settings were:

```text
5-turn memory:  MAX_RECENT_MESSAGES=10
10-turn memory: MAX_RECENT_MESSAGES=20
```

Each turn consists of one user message and one assistant message. Therefore:

```text
5 turns  = 10 messages
10 turns = 20 messages
```

## Method

The test used a controlled 10-turn interview-prep conversation:

```text
1. 我明天要面試
2. 我怕回答不好
3. 尤其是自我介紹
4. 我不知道怎麼講研究
5. 我怕他問 latency
6. 我也怕 demo 掛掉
7. 我想講得像產品人
8. 但我怕太技術
9. 我想讓他覺得我能交付
10. 最後我該怎麼收尾
```

To isolate context-memory impact, the test used:

```text
audio_format: mock
audio_base64: text:<utterance>
```

This keeps the input transcript deterministic while still using the real model
path for:

```text
Gemma 4 E4B int4 via Ollama
BreezyVoice TTS wrapper
Mock emotion service
Orchestrator response policy
In-memory conversation repository
```

The test does not measure microphone capture, VAD, or real audio ASR variance.
It measures context growth, LLM latency, policy behavior, and TTS latency in
the real voice-turn pipeline.

## Results Summary

| Setting | Max Messages | Turns | OK | Partial | TTS Cache Hits | P50 Total | P95 Total | P50 LLM | P95 LLM | P50 TTS | P95 TTS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5-turn memory | 10 | 10 | 8 | 2 | 0 | 2024ms | 4553ms | 327ms | 3000ms | 1504ms | 1772ms |
| 10-turn memory | 20 | 10 | 8 | 2 | 1 | 1864ms | 2984ms | 324ms | 392ms | 1397ms | 2505ms |

## Steady-State Tail Results

The last five turns are the most useful comparison because the 5-turn memory
setting has reached its cap by turn 6.

| Setting | Context Messages Before Turns 6-10 | Avg Total | Avg LLM | Avg TTS |
|---|---|---:|---:|---:|
| 5-turn memory | 10, 10, 10, 10, 10 | 2029ms | 329ms | 1561ms |
| 10-turn memory | 10, 12, 14, 16, 18 | 2167ms | 352ms | 1676ms |

## Interpretation

The 10-turn memory setting did not create a major LLM latency problem in this
test. The tail LLM average increased from `329ms` to `352ms`, which is only
about `+23ms`.

The larger latency variance still comes from TTS:

```text
5-turn memory tail TTS avg:  1561ms
10-turn memory tail TTS avg: 1676ms
```

That difference is mostly content-dependent because BreezyVoice latency changes
with the generated reply text and cache status. It is not primarily caused by
conversation memory.

## Quality Observations

The 5-turn memory run had two partial turns:

```text
turn 1: LLM timeout fallback, total 4553ms
turn 3: policy fallback, total 1987ms
```

The 10-turn memory run also had two partial turns:

```text
turn 9: policy fallback, total 1913ms
turn 10: policy fallback, total 1851ms
```

This means the main risk of 10-turn memory is not latency. The main risk is
response quality and policy interaction near the end of longer conversations.
The model sometimes produces a reply that the response policy rejects, causing
the fallback:

```text
你可以再說一點。
```

That fallback is safe but too generic for a polished 10-turn demo.

## Recommendation

Use 5-turn bounded memory as the current default:

```text
MAX_RECENT_MESSAGES=10
```

This gives Jarvis enough continuity for a short demo while keeping the prompt
small and predictable.

10-turn memory is technically feasible:

```text
MAX_RECENT_MESSAGES=20
```

However, before using it as the default, add one of these quality controls:

1. A semantic reply canonicalizer for common interview-prep states.
2. More fixed short replies in the TTS cache.
3. A stronger prompt rule: use recent context lightly and ask one concrete
   follow-up.
4. A policy repair path for neutral late-turn contexts, not only anxious
   contexts.

## Response Repair Follow-Up Test

After the initial experiment, the orchestrator added:

```text
ResponseRepairEngine
late-turn anti-summary prompt rule
interview-prep short reply templates
fixed TTS cache entries for the repair templates
```

Persona refinement:

```text
Jarvis no longer has to ask a question every turn.
It can acknowledge, mirror, reassure, or ask one short question when useful.
```

The policy flow changed from:

```text
invalid LLM reply → generic fallback
```

to:

```text
invalid LLM reply → repair → validate again → TTS
```

The 10-turn memory test was re-run with the same utterance sequence and
`MAX_RECENT_MESSAGES=20`.

| Setting | Max Messages | Turns | OK | Partial | Generic Fallbacks | TTS Cache Hits | P50 Total | P95 Total | P50 LLM | P95 LLM | P50 TTS | P95 TTS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10-turn memory after repair | 20 | 10 | 10 | 0 | 0 | 1 | 1960ms | 3513ms | 339ms | 394ms | 1472ms | 3034ms |

Tail result after repair:

```text
turns 6-10 average total: 2145ms
turns 6-10 average LLM:   342ms
turns 6-10 average TTS:   1663ms
```

Quality result:

```text
partial turns: 2 → 0
generic fallback turns: 2 → 0
```

Interpretation:

```text
Response repair improved late-turn stability without creating an LLM latency
problem. The largest remaining variance is still BreezyVoice TTS.
```

## Engineering Conclusion

The current architecture is suitable for 5-turn memory immediately and can
support 10-turn memory without rewriting the orchestrator. The repository
pattern and bounded `MAX_RECENT_MESSAGES` design are working as intended.

The next bottleneck is not context storage. It is:

```text
TTS variance
repair-template cache warmup coverage
late-turn response specificity
```

## Current Config Decision

The env templates now use 5-turn memory:

```text
MAX_RECENT_MESSAGES=10
```

This means Jarvis keeps the most recent 5 user-assistant turns in the prompt.
