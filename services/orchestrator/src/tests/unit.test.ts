import { describe, expect, it } from "vitest";
import {
  SentenceBuffer,
  TtsQueue,
  VadStateManager,
  TurnPlaybackGuard,
  planTtsChunks,
  splitTtsSentences
} from "@jarvis/shared";
import { parsePcm16Wav, stitchNormalizePcm16Wavs } from "../utils/audioStitcher.js";
import { createSilentWavBuffer, createToneWavBuffer } from "../utils/wav.js";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { loadConfig } from "../config/env.js";
import { CircuitBreaker } from "../domain/CircuitBreaker.js";
import { MockASRAdapter, MockEmotionAdapter, classifyTextEmotion } from "../adapters/MockAdapters.js";
import { BreezeASRAdapter, BreezyVoiceAdapter, GemmaE2BAdapter, GemmaE4BAdapter } from "../adapters/RealModelAdapters.js";
import { HttpLLMAdapter, HttpTTSAdapter } from "../adapters/HttpAdapters.js";
import { ResponseCanonicalizer } from "../policy/ResponseCanonicalizer.js";
import { ResponseRepairEngine } from "../policy/ResponseRepairEngine.js";
import { ResponsePolicyEngine } from "../policy/ResponsePolicyEngine.js";
import { TtsTextFinalizer } from "../policy/TtsTextFinalizer.js";
import { InMemoryConversationRepository } from "../repositories/ConversationRepository.js";
import { ConciseJarvisStrategy, EmotionAwareJarvisStrategy } from "../strategies/ResponseStrategy.js";

describe("response policy", () => {
  it("accepts short Jarvis-style Traditional Chinese replies", () => {
    const policy = new ResponsePolicyEngine(14);
    expect(policy.validate("你最擔心哪部分？", { sessionId: "s1" })).toEqual({
      accepted: true,
      finalReply: "你最擔心哪部分？"
    });
  });

  it("rejects long or markdown-like output with fallback", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("- 這是一段很長的回答，應該被拒絕", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.finalReply).toBe("-這是一段很長的回答，應該被拒絕");
  });

  it("rejects AI self-reference with fallback", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("我是AI語言模型。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("ai_self_reference");
    expect(result.finalReply).toBe("我是AI語言模型。");
  });

  it("rejects overly formal customer-support wording", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("請具體說明您的擔憂。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("formal_wording");
  });

  it("rejects repetitive just-do-it style endings", () => {
    const policy = new ResponsePolicyEngine(18);
    const result = policy.validate("放輕鬆自然就好。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("repetitive_ending");
  });

  it("rejects unsafe financial and insurance claims", () => {
    const policy = new ResponsePolicyEngine(18);
    expect(policy.validate("這檔保證獲利。", { sessionId: "s1" }).reason).toBe("return_promise");
    expect(policy.validate("推薦你買這張保單。", { sessionId: "s1" }).reason).toBe("product_recommendation");
    expect(policy.validate("這是投資建議。", { sessionId: "s1" }).reason).toBe("authority_claim");
  });

  it("detects anxious policy violations before repair", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("準備好了嗎?哪個職位呢?", {
      sessionId: "s1",
      emotion: { label: "anxious", confidence: 0.87, signals: ["面試"] }
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("multi_sentence");
    expect(result.finalReply).toBe("準備好了嗎?哪個職位呢?");
  });

  it("marks generic fallback as invalid in late-turn context", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("你可以再說一點。", {
      sessionId: "s1",
      recentMessages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `m${index}`,
        timestamp: "t"
      }))
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("generic_late_turn_fallback");
  });
});

describe("response repair", () => {
  it("repairs anxious policy violations to a supportive short interaction", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "準備好了嗎?哪個職位呢?",
      reason: "multi_sentence",
      context: {
        sessionId: "s1",
        userText: "我明天要面試",
        recentMessages: [],
        emotion: { label: "anxious", confidence: 0.87, signals: ["面試"] }
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先穩住，我在。");
  });

  it("repairs late interview closing context with a concrete short template", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "你其實已經整理出你的主軸了，可以用產品角度收尾。",
      reason: "too_long",
      context: {
        sessionId: "s1",
        userText: "最後我該怎麼收尾",
        recentMessages: Array.from({ length: 12 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `m${index}`,
          timestamp: "t"
        }))
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("用一句話收尾。");
  });

  it("repairs insurance and finance context with compliant coaching templates", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "你可以推薦他買這張保單，這樣比較容易成交。",
      reason: "product_recommendation",
      context: {
        sessionId: "s1",
        userText: "客戶對保險很排斥，我該怎麼說",
        recentMessages: []
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先建立信任感。");
  });

  it("repairs repetitive endings into a varied coaching reply", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "慢慢來，專注需求就好。",
      reason: "repetitive_ending",
      context: {
        sessionId: "s1",
        userText: "我怕講得像推銷",
        recentMessages: []
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先尊重他的節奏。");
  });
});

describe("TTS text finalizer", () => {
  it("removes markdown, JSON, URLs, role tags, and emojis", () => {
    const finalizer = new TtsTextFinalizer(18);
    const reply = 'Assistant: {"reply":"**我懂** 😊 https://example.com 先別急，這樣比較順"}';
    expect(finalizer.finalize(reply)).toBe("我懂先別急，這樣比較順。");
  });

  it("keeps only a short spoken sentence", () => {
    const finalizer = new TtsTextFinalizer(8);
    expect(finalizer.finalize("這裡先求穩，後面再慢慢擴大。第二句不要播。")).toBe("這裡先求穩。");
  });
});

describe("realtime voice primitives", () => {
  it("moves from listening to ASR processing after speech and end silence", () => {
    const manager = new VadStateManager();
    expect(manager.startListening()).toBe("listening");
    expect(manager.observe({ speechProbability: 0.7, nowMs: 0 })).toBe("user_speaking");
    expect(manager.observe({ speechProbability: 0.2, nowMs: 250 })).toBe("user_speaking");
    expect(manager.observe({ speechProbability: 0.2, nowMs: 960 })).toBe("asr_processing");
  });

  it("detects barge-in while Jarvis is speaking", () => {
    const manager = new VadStateManager();
    manager.markSpeaking();
    expect(manager.observe({ speechProbability: 0.8, nowMs: 0, isPlaybackActive: true })).toBe("speaking");
    expect(manager.observe({ speechProbability: 0.8, nowMs: 301, isPlaybackActive: true })).toBe("interrupted");
  });

  it("cancels queued TTS chunks by turn", () => {
    const queue = new TtsQueue();
    queue.enqueue("第一句。", "turn_old");
    queue.enqueue("新句子。", "turn_new");
    queue.cancel("turn_old");
    expect(queue.dequeue("turn_old")).toBeUndefined();
    expect(queue.dequeue("turn_new")).toMatchObject({ sentence: "新句子。", turnId: "turn_new" });
  });

  it("buffers streaming tokens until complete sentences", () => {
    const buffer = new SentenceBuffer();
    expect(buffer.push("先抓")).toEqual([]);
    expect(buffer.push("住目標。下一")).toEqual(["先抓住目標。"]);
    expect(buffer.push("句還沒完")).toEqual([]);
    expect(buffer.flush()).toBe("下一句還沒完");
  });

  it("guards playback against stale turn IDs", () => {
    const guard = new TurnPlaybackGuard();
    guard.start("turn_1");
    expect(guard.canPlay("turn_1")).toBe(true);
    expect(guard.canPlay("turn_0")).toBe(false);
    guard.start("turn_2");
    expect(guard.canPlay("turn_1")).toBe(false);
    expect(guard.canPlay("turn_2")).toBe(true);
  });

  it("does not duplicate queued playback across 50 turns", () => {
    const queue = new TtsQueue();
    for (let index = 0; index < 50; index += 1) {
      queue.enqueue(`第${index}句。`, `turn_${index}`);
    }

    for (let index = 0; index < 50; index += 1) {
      expect(queue.dequeue(`turn_${index}`)).toMatchObject({
        sentence: `第${index}句。`,
        turnId: `turn_${index}`
      });
      expect(queue.dequeue(`turn_${index}`)).toBeUndefined();
    }
  });
});

describe("long-form TTS primitives", () => {
  it("splits Traditional Chinese and mixed text without breaking common abbreviations or URLs", () => {
    expect(splitTtsSentences("先穩住。Dr. Lin 會看 https://example.com/path。下一步呢？")).toEqual([
      "先穩住。",
      "Dr. Lin 會看 https://example.com/path。",
      "下一步呢？"
    ]);
  });

  it("creates ordered non-empty chunks under the max duration estimate", () => {
    const plan = planTtsChunks(
      "第一句先建立信任感。第二句釐清家庭責任。第三句不要急著推產品。第四句收斂到下一步。",
      "turn_long",
      { targetChunkSeconds: 2, maxChunkSeconds: 5 }
    );
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.chunks.map((chunk) => chunk.index)).toEqual(plan.chunks.map((_, index) => index));
    expect(plan.chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true);
    expect(plan.chunks.every((chunk) => chunk.estimatedDurationMs <= 5000)).toBe(true);
  });

  it("splits an estimated 30-second answer into ordered chunks", () => {
    const longAnswer = Array.from(
      { length: 8 },
      (_, index) => `第${index + 1}句先整理客戶需求，確認風險缺口和下一步安排。`
    ).join("");
    const plan = planTtsChunks(longAnswer, "turn_30s", {
      targetChunkSeconds: 4,
      maxChunkSeconds: 5
    });
    const estimatedTotalMs = plan.chunks.reduce((total, chunk) => total + chunk.estimatedDurationMs, 0);

    expect(estimatedTotalMs).toBeGreaterThanOrEqual(30_000);
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.chunks.map((chunk) => chunk.index)).toEqual(plan.chunks.map((_, index) => index));
    expect(plan.chunks.every((chunk) => chunk.turnId === "turn_30s")).toBe(true);
  });

  it("normalizes real PCM WAV chunks and stitches silence-padded audio", () => {
    const stitched = stitchNormalizePcm16Wavs(
      [createToneWavBuffer(100, 16000, 4000), createSilentWavBuffer(100, 16000)],
      160
    );
    const parsed = parsePcm16Wav(stitched.buffer);

    expect(stitched.normalized).toBe(true);
    expect(stitched.sampleRate).toBe(16000);
    expect(stitched.silencePaddingMs).toBe(160);
    expect(stitched.chunkCount).toBe(2);
    expect(stitched.totalDurationMs).toBe(360);
    expect(parsed.samples.length).toBe(5760);
    expect(Math.max(...Array.from(parsed.samples, (sample) => Math.abs(sample)))).toBeGreaterThan(29000);
  });
});

describe("response canonicalizer", () => {
  it("maps return-risk phrasing to a cached compliant reply", () => {
    const result = new ResponseCanonicalizer().canonicalize("報酬要看風險喔。", {
      userText: "他一直問報酬可不可以保證",
      recentMessages: []
    });
    expect(result.changed).toBe(true);
    expect(result.reply).toBe("避免承諾報酬。");
  });

  it("maps soft sales-pressure phrasing to a cached coaching reply", () => {
    const result = new ResponseCanonicalizer().canonicalize("慢慢來，專注需求就好。", {
      userText: "我怕講得像推銷",
      recentMessages: []
    });
    expect(result.changed).toBe(true);
    expect(result.reply).toBe("用關心的語氣。");
  });

  it("maps insurance visit coaching examples to cached style replies", () => {
    const canonicalizer = new ResponseCanonicalizer();
    expect(
      canonicalizer.canonicalize("先抓住拜訪目標。", {
        userText: "我等一下要拜訪一個新客戶",
        recentMessages: []
      }).reply
    ).toBe("先抓住目標。");
    expect(
      canonicalizer.canonicalize("可以先聊聊生活。", {
        userText: "我怕一開口他就防備",
        recentMessages: []
      }).reply
    ).toBe("先聊他的生活。");
    expect(
      canonicalizer.canonicalize("家庭責任可以切入。", {
        userText: "他是三十多歲，有小孩",
        recentMessages: []
      }).reply
    ).toBe("家庭責任是切入點。");
    expect(
      canonicalizer.canonicalize("可以慢慢問。", {
        userText: "我可以先問他最近家庭支出壓力嗎？",
        recentMessages: []
      }).reply
    ).toBe("可以，這很自然。");
    expect(
      canonicalizer.canonicalize("這樣比較自然。", {
        userText: "那我就先幫他整理風險缺口。",
        recentMessages: []
      }).reply
    ).toBe("這比推產品好。");
    expect(
      canonicalizer.canonicalize("你在建立信任。", {
        userText: "我想讓他覺得我是顧問，不是業務。",
        recentMessages: []
      }).reply
    ).toBe("這就是信任感。");
  });

  it("leaves unrelated short replies unchanged", () => {
    const result = new ResponseCanonicalizer().canonicalize("我懂你的意思。", {
      userText: "今天有點累",
      recentMessages: []
    });
    expect(result.changed).toBe(false);
    expect(result.reply).toBe("我懂你的意思。");
  });
});

describe("prompt builders", () => {
  it("builds v0.1 concise prompt", () => {
    const prompt = new ConciseJarvisStrategy().buildPrompt({
      userText: "我明天要面試",
      recentMessages: [],
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: 18
      }
    });
    expect(prompt).toContain("Reply in 6 to 18 Chinese characters.");
    expect(prompt).toContain("Avoid formal customer-service wording.");
    expect(prompt).toContain('Avoid repetitive sentence endings such as "就好".');
    expect(prompt).toContain("Use a follow-up question only when it helps the conversation.");
    expect(prompt).toContain("insurance and financial service conversations");
    expect(prompt).toContain("Never recommend a specific product.");
    expect(prompt).toContain("Never promise returns.");
    expect(prompt).toContain("Style examples:");
    expect(prompt).toContain("先不要急著推。");
    expect(prompt).toContain("我明天要面試");
  });

  it("adds late-turn anti-summary rule when context is long", () => {
    const prompt = new ConciseJarvisStrategy().buildPrompt({
      userText: "最後我該怎麼收尾",
      recentMessages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `m${index}`,
        timestamp: "t"
      })),
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: 18
      }
    });
    expect(prompt).toContain("Do not summarize.");
    expect(prompt).toContain("Use one concrete short interaction.");
  });

  it("builds v0.2 emotion-aware prompt", () => {
    const prompt = new EmotionAwareJarvisStrategy().buildPrompt({
      userText: "我覺得明天會完蛋",
      recentMessages: [],
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: 18
      },
      emotion: {
        label: "anxious",
        confidence: 0.87,
        signals: ["完蛋"]
      }
    });
    expect(prompt).toContain("User emotional state:");
    expect(prompt).toContain("slow down, reassure first, ask only if clarification helps");
  });
});

describe("emotion classifier", () => {
  it("classifies anxious transcript", () => {
    expect(classifyTextEmotion("我很怕明天面試會完蛋")).toMatchObject({
      label: "anxious",
      confidence: 0.87
    });
  });

  it("mock emotion adapter returns supported labels", async () => {
    const result = await new MockEmotionAdapter().classify({
      text: "我今天很累",
      recentMessages: []
    });
    expect(result.label).toBe("tired");
  });
});

describe("conversation repository", () => {
  it("keeps only recent bounded messages", async () => {
    const repository = new InMemoryConversationRepository(2);
    await repository.appendMessage("s1", { role: "user", content: "one", timestamp: "t1" });
    await repository.appendMessage("s1", { role: "assistant", content: "two", timestamp: "t2" });
    await repository.appendMessage("s1", { role: "user", content: "three", timestamp: "t3" });
    const messages = await repository.getRecentMessages("s1");
    expect(messages.map((message) => message.content)).toEqual(["two", "three"]);
  });
});

describe("adapter factory", () => {
  it("creates mock adapters from env config", () => {
    const adapters = AdapterFactory.create(loadConfig({ APP_ENV: "test" }));
    expect(adapters.asr).toBeInstanceOf(MockASRAdapter);
  });

  it("creates real provider adapters from env config", () => {
    const adapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        ASR_PROVIDER: "breeze_asr_25",
        LLM_PROVIDER: "gemma_4_e4b",
        TTS_PROVIDER: "breezyvoice",
        EMOTION_PROVIDER: "http"
      })
    );
    expect(adapters.asr).toBeInstanceOf(BreezeASRAdapter);
    expect(adapters.llm).toBeInstanceOf(GemmaE4BAdapter);
    expect(adapters.tts).toBeInstanceOf(BreezyVoiceAdapter);
  });

  it("keeps the legacy Gemma E2B provider alias available", () => {
    const adapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        LLM_PROVIDER: "gemma_4_e2b"
      })
    );
    expect(adapters.llm).toBeInstanceOf(GemmaE2BAdapter);
  });

  it("supports v0.5 Ollama and vLLM LLM provider aliases", () => {
    const ollamaAdapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        LLM_PROVIDER: "ollama"
      })
    );
    const vllmAdapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        LLM_PROVIDER: "vllm"
      })
    );
    expect(ollamaAdapters.llm).toBeInstanceOf(HttpLLMAdapter);
    expect(vllmAdapters.llm).toBeInstanceOf(HttpLLMAdapter);
  });

  it("maps v0.5 TTS scheduler env aliases to the active long-form config", () => {
    const config = loadConfig({
      APP_ENV: "test",
      MAX_PARALLEL_TTS_WORKERS: "3",
      CHUNK_TARGET_SECONDS: "4",
      SILENCE_PADDING_MS: "120"
    });
    expect(config.TTS_MAX_PARALLEL_CHUNKS).toBe(3);
    expect(config.TTS_TARGET_CHUNK_SECONDS).toBe(4);
    expect(config.TTS_SENTENCE_SILENCE_MS).toBe(120);
  });
});

describe("circuit breaker", () => {
  it("opens after repeated failures and closes after cooldown", () => {
    const breaker = new CircuitBreaker(3, 60_000, 10);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    expect(breaker.canCall(2)).toBe(true);
    breaker.recordFailure(3);
    expect(breaker.canCall(4)).toBe(false);
    expect(breaker.canCall(20)).toBe(true);
  });
});

describe("HTTP TTS adapter", () => {
  it("rewrites relative audio URLs to the TTS service origin", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          audioUrl: "/audio/turn.wav",
          ttsCacheHit: true,
          upstreamTtsMs: 0,
          audioEncodeMs: 3,
          durationMs: 12,
          format: "wav"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    try {
      const adapter = new HttpTTSAdapter("http://localhost:8003", 1000);
      const result = await adapter.synthesize({ text: "你最擔心哪部分？", voiceId: "jarvis_default_zh_tw" });
      expect(result.audioUrl).toBe("http://localhost:8003/audio/turn.wav");
      expect(result.ttsCacheHit).toBe(true);
      expect(result.audioEncodeMs).toBe(3);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
